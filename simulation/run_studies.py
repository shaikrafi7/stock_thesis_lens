"""Six expanded studies on the STARC scoring engine.

Studies:
  1. Ablation — drop one category at a time, measure L/S spread
  2. Score change as signal — does delta-score predict returns?
  3. Drawdown protection — do low-score stocks have worse drawdowns?
  4. Score stability as signal — stable scores vs volatile scores
  5. Category-level IC — which individual categories predict?
  6. Equal vs current weights — do hand-tuned weights help?

Usage:
    uv run python run_studies.py [--start YYYY-MM-DD] [--end YYYY-MM-DD]
"""
import argparse
import sys
import logging
from datetime import date
from pathlib import Path
from collections import defaultdict

import numpy as np
import pandas as pd
from tqdm import tqdm

_SIM_DIR = Path(__file__).parent
_ROOT = _SIM_DIR.parent
_BACKEND = _ROOT / "backend"
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from simulation.config import SP500_TOP100
from simulation.scoring.scorer import score_universe, score_universe_ablation, ScoredStock
from simulation.analysis.portfolio_builder import build_portfolios, _month_end_dates
from simulation.analysis.return_calculator import (
    calculate_portfolio_returns, build_longshort_series, HORIZONS,
    ticker_forward_return, _add_months,
)
from simulation.analysis.statistics import (
    newey_west_tstat, information_coefficient, longshort_summary,
)
from simulation.analysis.regime import classify_regimes
from simulation.analysis.sector_cap import get_sector, get_cap_group

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

CATEGORIES = [
    "competitive_moat", "growth_trajectory", "valuation",
    "financial_health", "ownership_conviction", "risks",
]


def available_tickers(data_dir: Path) -> list[str]:
    """Return tickers that have both price and fundamental parquet files."""
    price_tickers = {p.stem.replace("_prices", "") for p in (data_dir / "prices").glob("*_prices.parquet")}
    fund_tickers = {p.stem.replace("_fundamentals", "") for p in (data_dir / "fundamentals").glob("*_fundamentals.parquet")}
    # Exclude benchmark ETFs
    exclude = {"SPY", "IWF", "IWD"}
    both = (price_tickers & fund_tickers) - exclude
    return sorted(both)


def _score_all(tickers: list[str], score_dates: list[date]) -> dict[date, list[ScoredStock]]:
    """Score all tickers at each date."""
    all_scores: dict[date, list[ScoredStock]] = {}
    for d in tqdm(score_dates, desc="Scoring"):
        all_scores[d] = score_universe(tickers, d)
    return all_scores


def _build_1m_returns(all_scores: dict[date, list[ScoredStock]]) -> dict[date, dict[str, float]]:
    """Build per-ticker 1m forward return maps."""
    monthly_returns: dict[date, dict[str, float]] = {}
    for d, scores in all_scores.items():
        end = _add_months(d, 1)
        ret_map: dict[str, float] = {}
        for s in scores:
            r = ticker_forward_return(s.ticker, d, end)
            if r is not None:
                ret_map[s.ticker] = r
        monthly_returns[d] = ret_map
    return monthly_returns


def _ls_spread_ic(all_scores, monthly_returns):
    """Compute L/S spread and IC from scores and returns."""
    monthly_scores = {d: {s.ticker: s.score for s in scores} for d, scores in all_scores.items()}

    # IC
    ic_vals = {}
    for d, scores in monthly_scores.items():
        if d not in monthly_returns:
            continue
        s = pd.Series(scores)
        r = pd.Series(monthly_returns[d])
        ic = information_coefficient(s, r)
        if ic is not None:
            ic_vals[d] = ic
    ic_ser = pd.Series(ic_vals).sort_index()
    mean_ic = float(ic_ser.mean()) if not ic_ser.empty else None

    # L/S via portfolio construction (6m horizon)
    portfolios = build_portfolios(all_scores)
    qr = calculate_portfolio_returns(portfolios)
    ls = build_longshort_series(qr)
    ls_6m = ls.get(6)
    if ls_6m is not None and not ls_6m.empty:
        ls_mean, ls_t = newey_west_tstat(ls_6m)
    else:
        ls_mean, ls_t = None, None

    return mean_ic, ls_mean, ls_t


# ── Study 1: Ablation ────────────────────────────────────────────────────

def study_ablation(tickers, score_dates, monthly_returns):
    """Drop one category at a time, measure IC and L/S spread."""
    print("\n" + "=" * 70)
    print("STUDY 1: ABLATION (drop one category, measure impact)")
    print("=" * 70)

    # Baseline (full model)
    log.info("Ablation: scoring full model...")
    full_scores = _score_all(tickers, score_dates)
    full_ic, full_ls, full_t = _ls_spread_ic(full_scores, monthly_returns)
    print(f"\n  {'Model':<30} {'IC':>8} {'6m L/S':>10} {'t-stat':>8}")
    print("  " + "-" * 58)
    print(f"  {'FULL MODEL':<30} {full_ic or 0:>8.4f} {full_ls or 0:>10.4f} {full_t or 0:>8.2f}")

    # Drop each category
    for cat in CATEGORIES:
        log.info("Ablation: dropping %s...", cat)
        ablated = {}
        for d in tqdm(score_dates, desc=f"  Drop {cat}", leave=False):
            ablated[d] = score_universe_ablation(tickers, d, exclude_category=cat)
        ic, ls, t = _ls_spread_ic(ablated, monthly_returns)
        delta_ic = (ic or 0) - (full_ic or 0)
        label = f"Drop {cat}"
        print(f"  {label:<30} {ic or 0:>8.4f} {ls or 0:>10.4f} {t or 0:>8.2f}  (dIC={delta_ic:+.4f})")

    return full_scores


# ── Study 2: Score Change as Signal ──────────────────────────────────────

def study_score_change(all_scores, monthly_returns):
    """Test if month-over-month score change predicts forward returns."""
    print("\n" + "=" * 70)
    print("STUDY 2: SCORE CHANGE AS SIGNAL")
    print("=" * 70)

    sorted_dates = sorted(all_scores.keys())
    delta_ic_vals = {}

    for i in range(1, len(sorted_dates)):
        prev_d = sorted_dates[i - 1]
        curr_d = sorted_dates[i]
        if curr_d not in monthly_returns:
            continue

        prev_scores = {s.ticker: s.score for s in all_scores[prev_d]}
        curr_scores = {s.ticker: s.score for s in all_scores[curr_d]}
        common = set(prev_scores) & set(curr_scores) & set(monthly_returns[curr_d])
        if len(common) < 10:
            continue

        deltas = pd.Series({t: curr_scores[t] - prev_scores[t] for t in common})
        returns = pd.Series({t: monthly_returns[curr_d][t] for t in common})
        ic = information_coefficient(deltas, returns)
        if ic is not None:
            delta_ic_vals[curr_d] = ic

    ic_ser = pd.Series(delta_ic_vals).sort_index()
    if ic_ser.empty:
        print("  Insufficient data")
        return

    mean_ic = float(ic_ser.mean())
    icir = float(ic_ser.mean() / ic_ser.std()) if ic_ser.std() > 0 else 0.0
    print(f"  Score-change IC:  {mean_ic:.4f}")
    print(f"  Score-change ICIR: {icir:.4f}")
    print(f"  Months: {len(ic_ser)}")

    # Compare to level IC
    level_ic_vals = {}
    for d in sorted_dates:
        if d not in monthly_returns:
            continue
        scores = {s.ticker: s.score for s in all_scores[d]}
        common = set(scores) & set(monthly_returns[d])
        if len(common) < 10:
            continue
        s = pd.Series({t: scores[t] for t in common})
        r = pd.Series({t: monthly_returns[d][t] for t in common})
        ic = information_coefficient(s, r)
        if ic is not None:
            level_ic_vals[d] = ic

    level_ser = pd.Series(level_ic_vals)
    print(f"\n  Score-level IC:   {level_ser.mean():.4f}  (for comparison)")
    print(f"  Delta is {'BETTER' if mean_ic > level_ser.mean() else 'WORSE'} than level")


# ── Study 3: Drawdown Protection ────────────────────────────────────────

def study_drawdown(all_scores, score_dates):
    """Test if low-score stocks have worse max drawdowns."""
    print("\n" + "=" * 70)
    print("STUDY 3: DRAWDOWN PROTECTION (do low scores predict losses?)")
    print("=" * 70)

    # For each score date, compute 6m max drawdown per ticker
    from simulation.analysis.return_calculator import _load_prices

    sorted_dates = sorted(score_dates)
    quintile_drawdowns: dict[int, list[float]] = {q: [] for q in range(1, 6)}

    for d in sorted_dates:
        scores = all_scores.get(d, [])
        if not scores:
            continue
        # Assign quintiles
        score_vals = sorted(s.score for s in scores)
        if len(score_vals) < 5:
            continue
        bp = [np.percentile(score_vals, p) for p in [20, 40, 60, 80]]

        start_ts = pd.Timestamp(d)
        end_ts = start_ts + pd.DateOffset(months=6)

        for s in scores:
            if s.score <= bp[0]:
                q = 1
            elif s.score <= bp[1]:
                q = 2
            elif s.score <= bp[2]:
                q = 3
            elif s.score <= bp[3]:
                q = 4
            else:
                q = 5

            df = _load_prices(s.ticker)
            if df is None or df.empty:
                continue
            window = df[(df.index >= start_ts) & (df.index <= end_ts)]["close"].dropna()
            if len(window) < 5:
                continue
            # Max drawdown
            peak = window.expanding().max()
            drawdown = (window - peak) / peak
            max_dd = float(drawdown.min())
            quintile_drawdowns[q].append(max_dd)

    print(f"\n  {'Quintile':>8} {'Avg MaxDD':>10} {'Median':>10} {'N':>8}")
    print("  " + "-" * 40)
    for q in range(1, 6):
        dds = quintile_drawdowns[q]
        if dds:
            print(f"  {'Q'+str(q):>8} {np.nanmean(dds):>10.4f} {np.nanmedian(dds):>10.4f} {len(dds):>8}")

    # Test: is Q1 max drawdown significantly worse than Q5?
    q1_dd = quintile_drawdowns[1]
    q5_dd = quintile_drawdowns[5]
    if q1_dd and q5_dd:
        from scipy import stats
        t, p = stats.ttest_ind(q1_dd, q5_dd)
        print(f"\n  Q1 vs Q5 drawdown t-test: t={t:.3f}, p={p:.4f}")
        print(f"  Q1 avg: {np.mean(q1_dd):.4f}, Q5 avg: {np.mean(q5_dd):.4f}")
        diff = np.mean(q1_dd) - np.mean(q5_dd)
        print(f"  Q1 drawdowns are {'WORSE' if diff < 0 else 'BETTER'} by {abs(diff):.4f}")


# ── Study 4: Score Stability as Signal ──────────────────────────────────

def study_stability(all_scores, monthly_returns):
    """Test if stocks with stable scores outperform volatile-score stocks."""
    print("\n" + "=" * 70)
    print("STUDY 4: SCORE STABILITY (stable vs volatile scores)")
    print("=" * 70)

    sorted_dates = sorted(all_scores.keys())
    if len(sorted_dates) < 4:
        print("  Insufficient history")
        return

    stability_ic_vals = {}

    # For each month (after 3-month lookback), compute score volatility
    for i in range(3, len(sorted_dates)):
        curr_d = sorted_dates[i]
        if curr_d not in monthly_returns:
            continue

        # Collect scores for trailing 3 months
        trailing = [sorted_dates[j] for j in range(i - 3, i + 1)]
        ticker_scores: dict[str, list[float]] = defaultdict(list)
        for td in trailing:
            for s in all_scores.get(td, []):
                ticker_scores[s.ticker].append(s.score)

        # Only tickers with all 4 observations
        stability = {}
        for t, vals in ticker_scores.items():
            if len(vals) == 4:
                stability[t] = np.std(vals)  # lower = more stable

        common = set(stability) & set(monthly_returns[curr_d])
        if len(common) < 10:
            continue

        # INVERT: we expect stable (low vol) to be good, so use negative
        stab_ser = pd.Series({t: -stability[t] for t in common})
        ret_ser = pd.Series({t: monthly_returns[curr_d][t] for t in common})
        ic = information_coefficient(stab_ser, ret_ser)
        if ic is not None:
            stability_ic_vals[curr_d] = ic

    ic_ser = pd.Series(stability_ic_vals).sort_index()
    if ic_ser.empty:
        print("  Insufficient data")
        return

    print(f"  Stability IC (neg vol -> ret): {ic_ser.mean():.4f}")
    print(f"  Stability ICIR: {ic_ser.mean() / ic_ser.std():.4f}" if ic_ser.std() > 0 else "  ICIR: n/a")
    print(f"  Months: {len(ic_ser)}")
    print(f"  Interpretation: {'stable scores predict better returns' if ic_ser.mean() > 0 else 'score stability does NOT predict'}")


# ── Study 5: Category-Level IC ──────────────────────────────────────────

def study_category_ic(tickers, score_dates, monthly_returns):
    """IC for each category's sub-score individually."""
    print("\n" + "=" * 70)
    print("STUDY 5: CATEGORY-LEVEL IC (which categories predict?)")
    print("=" * 70)

    # Score with full model to get sub-scores
    from simulation.scoring.scorer import score_universe_by_category

    cat_scores: dict[str, dict[date, dict[str, float]]] = {c: {} for c in CATEGORIES}

    for d in tqdm(score_dates, desc="Category scoring"):
        by_cat = score_universe_by_category(tickers, d)
        for cat, ticker_scores in by_cat.items():
            cat_scores[cat][d] = ticker_scores

    print(f"\n  {'Category':<25} {'Mean IC':>8} {'ICIR':>8} {'N_mo':>6}")
    print("  " + "-" * 50)

    for cat in CATEGORIES:
        ic_vals = {}
        for d, scores in cat_scores[cat].items():
            if d not in monthly_returns:
                continue
            common = set(scores) & set(monthly_returns[d])
            if len(common) < 10:
                continue
            s = pd.Series({t: scores[t] for t in common})
            r = pd.Series({t: monthly_returns[d][t] for t in common})
            ic = information_coefficient(s, r)
            if ic is not None:
                ic_vals[d] = ic

        if not ic_vals:
            continue
        ic_ser = pd.Series(ic_vals)
        mean_ic = float(ic_ser.mean())
        icir = float(ic_ser.mean() / ic_ser.std()) if ic_ser.std() > 0 else 0.0
        print(f"  {cat:<25} {mean_ic:>8.4f} {icir:>8.4f} {len(ic_ser):>6}")


# ── Study 6: Equal vs Current Weights ───────────────────────────────────

def study_weights(tickers, score_dates, monthly_returns):
    """Compare hand-tuned weights vs equal weights."""
    print("\n" + "=" * 70)
    print("STUDY 6: EQUAL vs CURRENT WEIGHTS")
    print("=" * 70)

    from simulation.scoring.scorer import score_universe_equal_weights

    # Current weights (already computed in ablation)
    log.info("Scoring with equal weights...")
    eq_scores: dict[date, list[ScoredStock]] = {}
    for d in tqdm(score_dates, desc="Equal weights"):
        eq_scores[d] = score_universe_equal_weights(tickers, d)

    eq_ic, eq_ls, eq_t = _ls_spread_ic(eq_scores, monthly_returns)

    # Current weights
    cur_scores = _score_all(tickers, score_dates)
    cur_ic, cur_ls, cur_t = _ls_spread_ic(cur_scores, monthly_returns)

    print(f"\n  {'Weights':<20} {'IC':>8} {'6m L/S':>10} {'t-stat':>8}")
    print("  " + "-" * 48)
    print(f"  {'Current (tuned)':<20} {cur_ic or 0:>8.4f} {cur_ls or 0:>10.4f} {cur_t or 0:>8.2f}")
    print(f"  {'Equal':<20} {eq_ic or 0:>8.4f} {eq_ls or 0:>10.4f} {eq_t or 0:>8.2f}")
    better = "EQUAL" if (eq_ic or 0) > (cur_ic or 0) else "CURRENT"
    print(f"\n  {better} weights have higher IC")


# ── Main ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="STARC expanded studies")
    parser.add_argument("--start", type=str, default="2020-01-31")
    parser.add_argument("--end", type=str, default="2024-12-31")
    parser.add_argument("--tickers", type=int, default=None, help="Limit to N tickers")
    args = parser.parse_args()

    data_dir = Path(__file__).parent / "data" / "raw"
    tickers = available_tickers(data_dir)
    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end)
    if args.tickers:
        tickers = tickers[:args.tickers]

    score_dates = _month_end_dates(start, end)
    log.info("Studies: %d tickers, %d months (%s to %s)", len(tickers), len(score_dates), start, end)

    # Pre-compute: full model scores + 1m returns (shared across studies)
    log.info("Pre-computing full model scores...")
    all_scores = _score_all(tickers, score_dates)
    log.info("Pre-computing 1m forward returns...")
    monthly_returns = _build_1m_returns(all_scores)

    # Run studies
    study_ablation(tickers, score_dates, monthly_returns)
    study_score_change(all_scores, monthly_returns)
    study_drawdown(all_scores, score_dates)
    study_stability(all_scores, monthly_returns)
    study_category_ic(tickers, score_dates, monthly_returns)
    study_weights(tickers, score_dates, monthly_returns)

    print("\n" + "=" * 70)
    print("ALL STUDIES COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
