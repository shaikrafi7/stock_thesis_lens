"""Main backtest entry point.

Orchestrates: load data -> score all tickers monthly -> build quintile
portfolios -> calculate returns -> compute statistics -> output results.

Includes regime-conditional, sector, and market-cap group breakdowns.

Usage:
    uv run python run_backtest.py [--tickers N] [--start YYYY-MM-DD] [--end YYYY-MM-DD]

Options:
    --tickers N    Use first N tickers from universe (default: all available)
    --start        Start date for scoring (default: 2020-01-31)
    --end          End date for scoring (default: 2024-12-31)
    --quick        Quick test: 5 tickers, 3 months
"""
import argparse
import sys
import logging
from datetime import date
from pathlib import Path

import pandas as pd
from tqdm import tqdm

# ── Path setup ──────────────────────────────────────────────────────────────
_SIM_DIR = Path(__file__).parent
_ROOT = _SIM_DIR.parent
_BACKEND = _ROOT / "backend"
# Add project root so 'simulation' package is importable
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from simulation.config import SP500_TOP100
from simulation.scoring.scorer import score_universe, ScoredStock
from simulation.analysis.portfolio_builder import build_portfolios, _month_end_dates
from simulation.analysis.return_calculator import calculate_portfolio_returns, build_longshort_series, HORIZONS
from simulation.analysis.statistics import (
    quintile_summary,
    longshort_summary,
    ic_series,
    ic_information_ratio,
    fama_macbeth,
    newey_west_tstat,
    information_coefficient,
)
from simulation.analysis.regime import classify_regimes, Regime
from simulation.analysis.sector_cap import get_sector, get_cap_group

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def available_tickers(data_dir: Path) -> list[str]:
    """Return tickers that have both price and fundamental parquet files."""
    price_tickers = {p.stem.replace("_prices", "") for p in (data_dir / "prices").glob("*_prices.parquet")}
    fund_tickers = {p.stem.replace("_fundamentals", "") for p in (data_dir / "fundamentals").glob("*_fundamentals.parquet")}
    both = price_tickers & fund_tickers

    # BUG 17 FIX: Warn about tickers dropped due to missing price or fundamentals.
    price_only = price_tickers - fund_tickers
    fund_only = fund_tickers - price_tickers
    if price_only:
        log.warning("Excluded %d tickers (price data only, no fundamentals): %s",
                    len(price_only), sorted(price_only))
    if fund_only:
        log.warning("Excluded %d tickers (fundamentals only, no prices): %s",
                    len(fund_only), sorted(fund_only))

    # Preserve SP500_TOP100 order for determinism
    ordered = [t for t in SP500_TOP100 if t in both]
    # Add any extras not in SP500_TOP100
    extras = sorted(both - set(SP500_TOP100))
    return ordered + extras


def run_backtest(
    tickers: list[str],
    start: date,
    end: date,
) -> dict:
    """Run the full backtest pipeline.

    Returns dict with score_dates, all_scores, quintile_returns, ls_by_horizon.
    """
    score_dates = _month_end_dates(start, end)
    log.info("Scoring %d tickers across %d month-end dates", len(tickers), len(score_dates))

    # ── Step 1: Score all tickers at each month-end ──────────────────────
    all_scores: dict[date, list[ScoredStock]] = {}
    monthly_scores_map: dict[date, dict[str, float]] = {}

    for d in tqdm(score_dates, desc="Scoring months"):
        scores = score_universe(tickers, d)
        all_scores[d] = scores
        monthly_scores_map[d] = {s.ticker: s.score for s in scores}
        log.info("  %s: scored %d tickers", d, len(scores))

    # ── Step 2: Build quintile portfolios ────────────────────────────────
    log.info("Building quintile portfolios...")
    portfolios = build_portfolios(all_scores)
    log.info("  %d portfolios formed", len(portfolios))

    # ── Step 3: Calculate returns ────────────────────────────────────────
    log.info("Calculating forward returns...")
    quintile_returns = calculate_portfolio_returns(portfolios)
    qr_df = quintile_returns.to_dataframe()
    ls_by_horizon = build_longshort_series(quintile_returns)
    log.info("  %d return records computed", len(qr_df))

    # ── Step 4: Build per-ticker 1-month forward return map for IC ───────
    # For each score_date, map ticker -> 1m simple return so IC can be computed.
    from simulation.analysis.return_calculator import ticker_forward_return, _add_months
    monthly_returns_map: dict[date, dict[str, float]] = {}
    for d, scores in all_scores.items():
        end = _add_months(d, 1)
        ret_map: dict[str, float] = {}
        for s in scores:
            r = ticker_forward_return(s.ticker, d, end)
            if r is not None:
                ret_map[s.ticker] = r
        monthly_returns_map[d] = ret_map

    # ── Step 5: Compute IC series ─────────────────────────────────────────
    ic_ser = ic_series(monthly_scores_map, monthly_returns_map)
    ic_ir = ic_information_ratio(ic_ser)
    mean_ic = float(ic_ser.mean()) if not ic_ser.empty else None
    log.info("IC: mean=%.4f  ICIR=%.4f  n_months=%d",
             mean_ic or 0.0, ic_ir or 0.0, len(ic_ser))

    return {
        "score_dates": score_dates,
        "all_scores": all_scores,
        "monthly_scores_map": monthly_scores_map,
        "monthly_returns_map": monthly_returns_map,
        "portfolios": portfolios,
        "quintile_returns": quintile_returns,
        "qr_df": qr_df,
        "ls_by_horizon": ls_by_horizon,
        "ic_series": ic_ser,
        "mean_ic": mean_ic,
        "ic_ir": ic_ir,
    }


def print_results(results: dict) -> None:
    """Print formatted results tables."""
    qr_df = results["qr_df"]
    ls_by_horizon = results["ls_by_horizon"]

    print("\n" + "=" * 60)
    print("QUINTILE RETURNS SUMMARY")
    print("=" * 60)

    for h in HORIZONS:
        sub = qr_df[qr_df["horizon_months"] == h]
        if sub.empty:
            continue
        print(f"\n  Horizon: {h} month(s)")
        print(f"  {'Quintile':>8} {'Mean Return':>12} {'T-Stat':>8} {'N':>6}")
        print("  " + "-" * 38)
        summary = quintile_summary(qr_df, horizon=h)
        for q, row in summary.iterrows():
            print(f"  {'Q'+str(q):>8} {row['mean_return']:>12.4f} {row['t_stat']:>8.2f} {int(row['n_obs']):>6}")

    print("\n" + "=" * 60)
    print("LONG-SHORT SPREAD (Q5 - Q1)")
    print("=" * 60)
    ls_df = longshort_summary(ls_by_horizon)
    if not ls_df.empty:
        print(ls_df.to_string())
    else:
        print("  No long-short data (need more months of returns)")

    print("\n" + "=" * 60)
    print("INFORMATION COEFFICIENT (IC)")
    print("=" * 60)
    mean_ic = results.get("mean_ic")
    ic_ir = results.get("ic_ir")
    ic_ser = results.get("ic_series")
    if mean_ic is not None:
        print(f"  Mean IC:  {mean_ic:.4f}")
        print(f"  IC IR:    {ic_ir:.4f}" if ic_ir is not None else "  IC IR:   n/a")
        print(f"  Months:   {len(ic_ser) if ic_ser is not None else 0}")
    else:
        print("  No IC data (insufficient months)")

    print("\n" + "=" * 60)
    print("SCORE COVERAGE")
    print("=" * 60)
    all_scores = results["all_scores"]
    score_counts = {d: len(s) for d, s in all_scores.items()}
    if score_counts:
        avg = sum(score_counts.values()) / len(score_counts)
        print(f"  Dates scored: {len(score_counts)}")
        print(f"  Avg tickers/date: {avg:.1f}")
        # Score distribution on last date
        last_date = max(all_scores.keys())
        last_scores = all_scores[last_date]
        if last_scores:
            import statistics
            sc = [s.score for s in last_scores]
            print(f"\n  Score distribution on {last_date}:")
            print(f"    Mean: {statistics.mean(sc):.1f}")
            print(f"    Std:  {statistics.stdev(sc):.1f}")
            print(f"    Min:  {min(sc):.1f}  Max: {max(sc):.1f}")


def print_regime_analysis(results: dict) -> None:
    """Break down L/S spread by market regime."""
    score_dates = results["score_dates"]
    regimes = classify_regimes(score_dates)
    qr_df = results["qr_df"]

    print("\n" + "=" * 60)
    print("REGIME CLASSIFICATION")
    print("=" * 60)

    # Show regime counts
    trend_counts: dict[str, int] = {}
    vol_counts: dict[str, int] = {}
    style_counts: dict[str, int] = {}
    for r in regimes.values():
        trend_counts[r.trend] = trend_counts.get(r.trend, 0) + 1
        vol_counts[r.vol] = vol_counts.get(r.vol, 0) + 1
        style_counts[r.style] = style_counts.get(r.style, 0) + 1

    print(f"  Trend:  {trend_counts}")
    print(f"  Vol:    {vol_counts}")
    print(f"  Style:  {style_counts}")

    # For each regime dimension, compute L/S spread conditional on regime
    regime_dims = [
        ("trend", lambda r: r.trend),
        ("vol", lambda r: r.vol),
        ("style", lambda r: r.style),
    ]

    for dim_name, dim_fn in regime_dims:
        print(f"\n  --- L/S by {dim_name} regime (6m horizon) ---")
        print(f"  {'Regime':>10} {'L/S Mean':>10} {'t-stat':>8} {'N':>6}")
        print("  " + "-" * 38)

        # Group score_dates by regime label
        label_dates: dict[str, list[date]] = {}
        for d, r in regimes.items():
            label = dim_fn(r)
            label_dates.setdefault(label, []).append(d)

        sub = qr_df[qr_df["horizon_months"] == 6]
        for label, dates_in_regime in sorted(label_dates.items()):
            # Formation dates are 1 month after score dates
            from simulation.analysis.portfolio_builder import _add_one_month
            formation_dates = {_add_one_month(d) for d in dates_in_regime}

            q5 = sub[(sub["quintile"] == 5) & (sub["formation_date"].isin(formation_dates))].set_index("formation_date")["ew_return"]
            q1 = sub[(sub["quintile"] == 1) & (sub["formation_date"].isin(formation_dates))].set_index("formation_date")["ew_return"]
            common = q5.index.intersection(q1.index)
            if common.empty:
                continue
            ls_series = (q5.loc[common] - q1.loc[common]).dropna()
            mean_ret, t = newey_west_tstat(ls_series, lags=max(1, min(6, len(ls_series) - 2)))
            print(f"  {label:>10} {mean_ret:>10.4f} {t:>8.2f} {len(ls_series):>6}")


def print_sector_analysis(results: dict) -> None:
    """Break down IC and L/S by GICS sector."""
    monthly_scores = results["monthly_scores_map"]
    monthly_returns = results["monthly_returns_map"]

    print("\n" + "=" * 60)
    print("SECTOR ANALYSIS (1m IC by sector)")
    print("=" * 60)

    # Collect all tickers across all months
    all_tickers = set()
    for scores in monthly_scores.values():
        all_tickers.update(scores.keys())

    # Group tickers by sector
    sector_tickers: dict[str, set[str]] = {}
    for t in all_tickers:
        s = get_sector(t)
        sector_tickers.setdefault(s, set()).add(t)

    print(f"  {'Sector':<28} {'Mean IC':>8} {'ICIR':>8} {'N_mo':>6} {'Tickers':>8}")
    print("  " + "-" * 62)

    sector_results = []
    for sector, tickers in sorted(sector_tickers.items()):
        # Compute IC using only tickers in this sector
        ic_vals = {}
        for d, scores in monthly_scores.items():
            if d not in monthly_returns:
                continue
            sec_scores = {t: s for t, s in scores.items() if t in tickers}
            sec_returns = {t: r for t, r in monthly_returns[d].items() if t in tickers}
            if len(sec_scores) < 5:
                continue
            s_ser = pd.Series(sec_scores)
            r_ser = pd.Series(sec_returns)
            ic = information_coefficient(s_ser, r_ser)
            if ic is not None:
                ic_vals[d] = ic

        if not ic_vals:
            continue
        ic_ser = pd.Series(ic_vals)
        mean_ic = float(ic_ser.mean())
        icir = float(ic_ser.mean() / ic_ser.std()) if ic_ser.std() > 0 else 0.0
        print(f"  {sector:<28} {mean_ic:>8.4f} {icir:>8.4f} {len(ic_ser):>6} {len(tickers):>8}")
        sector_results.append((sector, mean_ic, icir, len(ic_ser), len(tickers)))


def print_cap_analysis(results: dict) -> None:
    """Break down IC and L/S by market cap group."""
    monthly_scores = results["monthly_scores_map"]
    monthly_returns = results["monthly_returns_map"]

    print("\n" + "=" * 60)
    print("MARKET CAP GROUP ANALYSIS (1m IC by cap group)")
    print("=" * 60)

    all_tickers = set()
    for scores in monthly_scores.values():
        all_tickers.update(scores.keys())

    cap_tickers: dict[str, set[str]] = {}
    for t in all_tickers:
        g = get_cap_group(t)
        cap_tickers.setdefault(g, set()).add(t)

    print(f"  {'Group':<10} {'Mean IC':>8} {'ICIR':>8} {'N_mo':>6} {'Tickers':>8}")
    print("  " + "-" * 44)

    for group in ["mega", "large", "mid"]:
        tickers = cap_tickers.get(group, set())
        if not tickers:
            continue

        ic_vals = {}
        for d, scores in monthly_scores.items():
            if d not in monthly_returns:
                continue
            grp_scores = {t: s for t, s in scores.items() if t in tickers}
            grp_returns = {t: r for t, r in monthly_returns[d].items() if t in tickers}
            if len(grp_scores) < 5:
                continue
            s_ser = pd.Series(grp_scores)
            r_ser = pd.Series(grp_returns)
            ic = information_coefficient(s_ser, r_ser)
            if ic is not None:
                ic_vals[d] = ic

        if not ic_vals:
            continue
        ic_ser = pd.Series(ic_vals)
        mean_ic = float(ic_ser.mean())
        icir = float(ic_ser.mean() / ic_ser.std()) if ic_ser.std() > 0 else 0.0
        print(f"  {group:<10} {mean_ic:>8.4f} {icir:>8.4f} {len(ic_ser):>6} {len(tickers):>8}")


def print_regime_ic(results: dict) -> None:
    """Break down IC by market regime."""
    score_dates = results["score_dates"]
    regimes = classify_regimes(score_dates)
    monthly_scores = results["monthly_scores_map"]
    monthly_returns = results["monthly_returns_map"]

    print("\n" + "=" * 60)
    print("REGIME-CONDITIONAL IC (1m forward)")
    print("=" * 60)

    regime_dims = [
        ("trend", lambda r: r.trend),
        ("vol", lambda r: r.vol),
        ("style", lambda r: r.style),
    ]

    for dim_name, dim_fn in regime_dims:
        print(f"\n  --- IC by {dim_name} ---")
        print(f"  {'Regime':>10} {'Mean IC':>8} {'ICIR':>8} {'N_mo':>6}")
        print("  " + "-" * 36)

        label_dates: dict[str, list[date]] = {}
        for d, r in regimes.items():
            label = dim_fn(r)
            label_dates.setdefault(label, []).append(d)

        for label, dates in sorted(label_dates.items()):
            ic_vals = {}
            for d in dates:
                if d not in monthly_scores or d not in monthly_returns:
                    continue
                s = pd.Series(monthly_scores[d])
                r = pd.Series(monthly_returns[d])
                ic = information_coefficient(s, r)
                if ic is not None:
                    ic_vals[d] = ic
            if not ic_vals:
                continue
            ic_ser = pd.Series(ic_vals)
            mean_ic = float(ic_ser.mean())
            icir = float(ic_ser.mean() / ic_ser.std()) if ic_ser.std() > 0 else 0.0
            print(f"  {label:>10} {mean_ic:>8.4f} {icir:>8.4f} {len(ic_ser):>6}")


def main():
    parser = argparse.ArgumentParser(description="STARC alpha validation backtest")
    parser.add_argument("--tickers", type=int, default=None, help="Use first N tickers")
    parser.add_argument("--start", type=str, default="2020-01-31")
    parser.add_argument("--end", type=str, default="2024-12-31")
    parser.add_argument("--quick", action="store_true", help="Quick test: 5 tickers, 3 months")
    args = parser.parse_args()

    data_dir = Path(__file__).parent / "data" / "raw"
    tickers = available_tickers(data_dir)

    if args.quick:
        tickers = tickers[:5]
        start = date(2023, 10, 31)
        end = date(2024, 1, 31)
    else:
        start = date.fromisoformat(args.start)
        end = date.fromisoformat(args.end)
        if args.tickers:
            tickers = tickers[:args.tickers]

    log.info("Universe: %d tickers | %s to %s", len(tickers), start, end)
    log.info("Tickers: %s", tickers[:10])

    results = run_backtest(tickers, start, end)
    print_results(results)
    print_regime_analysis(results)
    print_regime_ic(results)
    print_sector_analysis(results)
    print_cap_analysis(results)


if __name__ == "__main__":
    main()
