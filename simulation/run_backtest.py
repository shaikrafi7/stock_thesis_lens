"""Main backtest entry point.

Orchestrates: load data -> score all tickers monthly -> build quintile
portfolios -> calculate returns -> compute statistics -> output results.

Usage:
    uv run python run_backtest.py [--tickers N] [--start YYYY-MM-DD] [--end YYYY-MM-DD]

Options:
    --tickers N    Use first N tickers from universe (default: all available)
    --start        Start date for scoring (default: 2023-01-31)
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
from simulation.analysis.return_calculator import calculate_portfolio_returns, build_longshort_series
from simulation.analysis.statistics import (
    quintile_summary,
    longshort_summary,
    ic_series,
    ic_information_ratio,
    fama_macbeth,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def available_tickers(data_dir: Path) -> list[str]:
    """Return tickers that have both price and fundamental parquet files."""
    price_tickers = {p.stem.replace("_prices", "") for p in (data_dir / "prices").glob("*_prices.parquet")}
    fund_tickers = {p.stem.replace("_fundamentals", "") for p in (data_dir / "fundamentals").glob("*_fundamentals.parquet")}
    both = price_tickers & fund_tickers
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

    return {
        "score_dates": score_dates,
        "all_scores": all_scores,
        "monthly_scores_map": monthly_scores_map,
        "portfolios": portfolios,
        "quintile_returns": quintile_returns,
        "qr_df": qr_df,
        "ls_by_horizon": ls_by_horizon,
    }


def print_results(results: dict) -> None:
    """Print formatted results tables."""
    qr_df = results["qr_df"]
    ls_by_horizon = results["ls_by_horizon"]

    print("\n" + "=" * 60)
    print("QUINTILE RETURNS SUMMARY")
    print("=" * 60)

    for h in [1, 3, 6, 12]:
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


def main():
    parser = argparse.ArgumentParser(description="STARC alpha validation backtest")
    parser.add_argument("--tickers", type=int, default=None, help="Use first N tickers")
    parser.add_argument("--start", type=str, default="2023-01-31")
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


if __name__ == "__main__":
    main()
