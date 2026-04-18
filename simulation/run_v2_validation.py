"""v2 vs v1 validation study.

Scores the universe at each month-end with v1 (default) and v2 (regime- and
sector-aware presets), then compares L/S spread and IC. Writes a compact
report to docs/v2_validation.md with full-period and regime-conditional
metrics side-by-side.

Usage:
    uv run python run_v2_validation.py [--start YYYY-MM-DD] [--end YYYY-MM-DD]

Defaults: 2020-01-31 to 2024-12-31 (same window as Run 5-6).
"""
import argparse
import logging
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from tqdm import tqdm

_SIM_DIR = Path(__file__).parent
_ROOT = _SIM_DIR.parent
_BACKEND = _ROOT / "backend"
for _p in [str(_ROOT), str(_BACKEND)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from simulation.scoring.scorer import score_universe, ScoredStock
from simulation.scoring.config import v2_config, regime_key_from
from simulation.analysis.portfolio_builder import _month_end_dates
from simulation.analysis.return_calculator import (
    ticker_forward_return, _add_months, HORIZONS,
)
from simulation.analysis.statistics import (
    newey_west_tstat, information_coefficient,
)
from simulation.analysis.regime import classify_regimes

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def available_tickers(data_dir: Path) -> list[str]:
    price_tickers = {p.stem.replace("_prices", "") for p in (data_dir / "prices").glob("*_prices.parquet")}
    fund_tickers = {p.stem.replace("_fundamentals", "") for p in (data_dir / "fundamentals").glob("*_fundamentals.parquet")}
    exclude = {"SPY", "IWF", "IWD"}
    return sorted((price_tickers & fund_tickers) - exclude)


def score_universe_v1_v2(
    tickers: list[str], dates: list[date], regimes: dict,
) -> tuple[dict, dict]:
    """Return (v1_scores, v2_scores) as {date: {ticker: score}}."""
    v1: dict[date, dict[str, float]] = {}
    v2: dict[date, dict[str, float]] = {}
    cfg = v2_config()

    for d in tqdm(dates, desc="Scoring v1+v2"):
        regime = regimes.get(d)
        rk = regime_key_from(regime.trend, regime.vol) if regime else None

        v1_scored = score_universe(tickers, d)
        v2_scored = score_universe(tickers, d, config=cfg, regime_key=rk)

        v1[d] = {s.ticker: s.score for s in v1_scored}
        v2[d] = {s.ticker: s.score for s in v2_scored}
    return v1, v2


def _one_month_returns(scores_by_date: dict[date, dict[str, float]]) -> dict[date, dict[str, float]]:
    """Forward 1-month returns per ticker per date."""
    out: dict[date, dict[str, float]] = {}
    for d, scores in tqdm(scores_by_date.items(), desc="1m returns"):
        end = _add_months(d, 1)
        rets: dict[str, float] = {}
        for ticker in scores.keys():
            r = ticker_forward_return(ticker, d, end)
            if r is not None and np.isfinite(r):
                rets[ticker] = r
        out[d] = rets
    return out


def longshort_returns(
    scores_by_date: dict[date, dict[str, float]],
    returns_by_date: dict[date, dict[str, float]],
    horizon_months: int = 6,
    quintiles: int = 5,
) -> pd.Series:
    """Build a monthly long-short series (Q5 - Q1) at the given horizon."""
    rows = []
    for d, scores in scores_by_date.items():
        end = _add_months(d, horizon_months)
        fwd = {
            t: ticker_forward_return(t, d, end)
            for t in scores.keys()
        }
        fwd = {k: v for k, v in fwd.items() if v is not None and np.isfinite(v)}
        if len(fwd) < quintiles * 2:
            continue
        s = pd.Series({t: scores[t] for t in fwd.keys()})
        r = pd.Series(fwd)
        ranks = s.rank(method="first")
        n = len(s)
        q_size = n // quintiles
        q1 = ranks <= q_size
        q5 = ranks > (n - q_size)
        if not (q1.any() and q5.any()):
            continue
        ls = r[q5].mean() - r[q1].mean()
        rows.append({"date": d, "ls": ls})
    return pd.Series(
        {row["date"]: row["ls"] for row in rows},
        name=f"ls_{horizon_months}m",
    )


def ic_series(
    scores_by_date: dict[date, dict[str, float]],
    returns_by_date: dict[date, dict[str, float]],
) -> pd.Series:
    """Per-month IC = Spearman(score, 1m return)."""
    ics = []
    for d in sorted(scores_by_date.keys()):
        s = scores_by_date[d]
        r = returns_by_date.get(d, {})
        common = set(s) & set(r)
        if len(common) < 8:
            continue
        ics.append({
            "date": d,
            "ic": information_coefficient(
                pd.Series({t: s[t] for t in common}),
                pd.Series({t: r[t] for t in common}),
            ),
        })
    return pd.Series(
        {x["date"]: x["ic"] for x in ics},
        name="ic",
    )


def regime_breakdown(
    ls_series: pd.Series, regimes: dict
) -> pd.DataFrame:
    """Group L/S series by regime label."""
    rows = []
    for d, ls in ls_series.items():
        reg = regimes.get(d)
        if reg is None:
            continue
        rows.append({
            "date": d,
            "trend": reg.trend,
            "vol": reg.vol,
            "style": reg.style,
            "ls": ls,
        })
    df = pd.DataFrame(rows)
    if df.empty:
        return df

    buckets = []
    for dim in ["trend", "vol", "style"]:
        for label in df[dim].unique():
            sub = df[df[dim] == label]["ls"]
            if len(sub) < 2:
                continue
            mean, t = newey_west_tstat(sub, lags=max(1, min(6, len(sub) - 2)))
            buckets.append({
                "dim": dim,
                "label": label,
                "mean_ls": mean,
                "tstat": t,
                "n": len(sub),
            })
    return pd.DataFrame(buckets)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default="2020-01-31")
    parser.add_argument("--end", default="2024-12-31")
    parser.add_argument("--max-tickers", type=int, default=None)
    parser.add_argument("--out", default=str(_ROOT / "docs" / "v2_validation.md"))
    args = parser.parse_args()

    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end)

    tickers = available_tickers(_SIM_DIR / "data" / "raw")
    if args.max_tickers:
        tickers = tickers[: args.max_tickers]
    log.info("Universe: %d tickers", len(tickers))

    dates = _month_end_dates(start, end)
    log.info("Dates: %d months", len(dates))

    regimes = classify_regimes(dates)
    log.info("Regimes classified: %d / %d", len(regimes), len(dates))

    v1_scores, v2_scores = score_universe_v1_v2(tickers, dates, regimes)

    v1_1m_rets = _one_month_returns(v1_scores)

    log.info("Computing L/S and IC series...")
    v1_ls_6m = longshort_returns(v1_scores, v1_1m_rets, horizon_months=6)
    v2_ls_6m = longshort_returns(v2_scores, v1_1m_rets, horizon_months=6)
    v1_ls_12m = longshort_returns(v1_scores, v1_1m_rets, horizon_months=12)
    v2_ls_12m = longshort_returns(v2_scores, v1_1m_rets, horizon_months=12)

    v1_ic = ic_series(v1_scores, v1_1m_rets)
    v2_ic = ic_series(v2_scores, v1_1m_rets)

    v1_ls6_mean, v1_ls6_t = newey_west_tstat(v1_ls_6m, lags=6)
    v2_ls6_mean, v2_ls6_t = newey_west_tstat(v2_ls_6m, lags=6)
    v1_ls12_mean, v1_ls12_t = newey_west_tstat(v1_ls_12m, lags=12)
    v2_ls12_mean, v2_ls12_t = newey_west_tstat(v2_ls_12m, lags=12)

    v1_ic_mean = float(v1_ic.mean()) if len(v1_ic) else 0.0
    v1_ic_std = float(v1_ic.std()) if len(v1_ic) else 0.0
    v2_ic_mean = float(v2_ic.mean()) if len(v2_ic) else 0.0
    v2_ic_std = float(v2_ic.std()) if len(v2_ic) else 0.0

    v1_regime = regime_breakdown(v1_ls_6m, regimes)
    v2_regime = regime_breakdown(v2_ls_6m, regimes)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# STARC v2 Validation Study",
        "",
        f"**Window:** {start} - {end}  ",
        f"**Universe:** {len(tickers)} tickers  ",
        f"**Months:** {len(dates)}  ",
        "",
        "## Summary",
        "",
        "| Metric | v1 | v2 (regime+sector) | Delta |",
        "|---|---:|---:|---:|",
        f"| 6m L/S mean | {v1_ls6_mean:.4f} | {v2_ls6_mean:.4f} | {v2_ls6_mean - v1_ls6_mean:+.4f} |",
        f"| 6m L/S t-stat | {v1_ls6_t:.2f} | {v2_ls6_t:.2f} | - |",
        f"| 12m L/S mean | {v1_ls12_mean:.4f} | {v2_ls12_mean:.4f} | {v2_ls12_mean - v1_ls12_mean:+.4f} |",
        f"| 12m L/S t-stat | {v1_ls12_t:.2f} | {v2_ls12_t:.2f} | - |",
        f"| 1m IC mean | {v1_ic_mean:.4f} | {v2_ic_mean:.4f} | {v2_ic_mean - v1_ic_mean:+.4f} |",
        f"| 1m IC std | {v1_ic_std:.4f} | {v2_ic_std:.4f} | - |",
        f"| ICIR | {v1_ic_mean/v1_ic_std if v1_ic_std else 0:.3f} | {v2_ic_mean/v2_ic_std if v2_ic_std else 0:.3f} | - |",
        "",
        "## Regime-Conditional 6m L/S Spread",
        "",
        "### v1",
        "| Dim | Label | Mean L/S | t-stat | N |",
        "|---|---|---:|---:|---:|",
    ]
    for _, row in v1_regime.iterrows():
        lines.append(f"| {row['dim']} | {row['label']} | {row['mean_ls']:.4f} | {row['tstat']:.2f} | {int(row['n'])} |")
    lines += [
        "",
        "### v2",
        "| Dim | Label | Mean L/S | t-stat | N |",
        "|---|---|---:|---:|---:|",
    ]
    for _, row in v2_regime.iterrows():
        lines.append(f"| {row['dim']} | {row['label']} | {row['mean_ls']:.4f} | {row['tstat']:.2f} | {int(row['n'])} |")
    lines += [
        "",
        "## Interpretation",
        "",
        "The v2 preset (regime_adjustments + sector_adjustments) tries to down-weight",
        "growth_trajectory in bear/high-vol and Consumer Staples, and up-weight",
        "financial_health in those same contexts.",
        "",
        f"If the L/S delta is not meaningfully positive (> +1% 6m with t > 1.5), the preset",
        "does not recover alpha from v1. Null results are acknowledged, not buried.",
    ]
    out_path.write_text("\n".join(lines), encoding="utf-8")
    log.info("Wrote report: %s", out_path)


if __name__ == "__main__":
    main()
