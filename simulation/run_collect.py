"""Main data collection script for the STARC alpha validation study.

Usage:
    uv run python simulation/run_collect.py --tickers sp500 --start 2020-01-01 --end 2025-12-31
    uv run python simulation/run_collect.py --tickers AAPL,MSFT,NVDA --start 2020-01-01 --end 2025-12-31
    uv run python simulation/run_collect.py --tickers top100
"""
import argparse
import logging
import sys
from pathlib import Path

# Allow running from project root with `uv run python simulation/run_collect.py`
sys.path.insert(0, str(Path(__file__).parent.parent))

from tqdm import tqdm

from simulation.config import (
    STUDY_START, STUDY_END, SP500_TOP100, CACHE_PATH,
    get_sp500_tickers, FMP_API_KEY,
)
from simulation.data.cache import Cache
from simulation.data.price_fetcher import fetch_prices
from simulation.data.fmp_client import FMPClient
from simulation.data.fundamental_fetcher import fetch_fundamentals

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def resolve_tickers(raw: str) -> list[str]:
    """Resolve ticker argument to a list of ticker strings."""
    if raw == "sp500":
        logger.info("Fetching S&P 500 tickers from Wikipedia...")
        return get_sp500_tickers()
    if raw == "top100":
        return SP500_TOP100
    return [t.strip().upper() for t in raw.split(",") if t.strip()]


def already_cached_prices(ticker: str, cache: Cache, start: str, end: str) -> bool:
    """True if price data is already in cache for this ticker+range."""
    return cache.has(ticker, "prices", f"{start}_{end}")


def already_cached_fundamentals(ticker: str, cache: Cache) -> bool:
    """True if all fundamental endpoints are cached for this ticker."""
    return cache.has(ticker, "fundamentals_combined", "latest")


def collect_prices(
    tickers: list[str],
    start: str,
    end: str,
    cache: Cache,
    output_dir: Path,
) -> None:
    """Download price data for all tickers, skip already-cached."""
    output_dir.mkdir(parents=True, exist_ok=True)
    to_fetch = [t for t in tickers if not already_cached_prices(t, cache, start, end)]
    skipped = len(tickers) - len(to_fetch)
    if skipped:
        logger.info("Prices: skipping %d already-cached tickers", skipped)

    for ticker in tqdm(to_fetch, desc="Prices", unit="ticker"):
        df = fetch_prices(ticker, start, end)
        if df.empty:
            logger.warning("No price data for %s — skipping", ticker)
            continue
        # Persist as parquet for fast reload
        df.to_parquet(output_dir / f"{ticker}_prices.parquet")
        # Mark as cached
        cache.set(ticker, "prices", f"{start}_{end}", {"rows": len(df)})
        logger.debug("Prices saved for %s (%d rows)", ticker, len(df))


def collect_fundamentals(
    tickers: list[str],
    cache: Cache,
    output_dir: Path,
    client: FMPClient,
) -> None:
    """Download fundamental data for all tickers, skip already-cached."""
    output_dir.mkdir(parents=True, exist_ok=True)
    to_fetch = [t for t in tickers if not already_cached_fundamentals(t, cache)]
    skipped = len(tickers) - len(to_fetch)
    if skipped:
        logger.info("Fundamentals: skipping %d already-cached tickers", skipped)

    for ticker in tqdm(to_fetch, desc="Fundamentals", unit="ticker"):
        try:
            df = fetch_fundamentals(ticker, client)
        except Exception as exc:
            logger.error("Fundamentals failed for %s: %s", ticker, exc)
            continue

        if df.empty:
            logger.warning("No fundamental data for %s — skipping", ticker)
            continue

        df.to_parquet(output_dir / f"{ticker}_fundamentals.parquet")
        cache.set(ticker, "fundamentals_combined", "latest", {"rows": len(df)})
        logger.debug("Fundamentals saved for %s (%d rows)", ticker, len(df))


def main() -> None:
    parser = argparse.ArgumentParser(description="STARC simulation data collector")
    parser.add_argument(
        "--tickers",
        default="top100",
        help='Comma-separated tickers, "top100", or "sp500" (default: top100)',
    )
    parser.add_argument("--start", default=STUDY_START, help="Start date YYYY-MM-DD")
    parser.add_argument("--end",   default=STUDY_END,   help="End date YYYY-MM-DD")
    parser.add_argument("--prices-only",       action="store_true", help="Only collect price data")
    parser.add_argument("--fundamentals-only", action="store_true", help="Only collect fundamentals")
    args = parser.parse_args()

    tickers = resolve_tickers(args.tickers)
    logger.info("Universe: %d tickers | %s → %s", len(tickers), args.start, args.end)

    cache = Cache(CACHE_PATH)
    output_dir = Path(__file__).parent / "data" / "raw"

    do_prices = not args.fundamentals_only
    do_fundamentals = not args.prices_only

    if do_prices:
        logger.info("=== Collecting price data (yfinance) ===")
        collect_prices(tickers, args.start, args.end, cache, output_dir / "prices")

    if do_fundamentals:
        if not FMP_API_KEY:
            logger.error("FMP_API_KEY not set — cannot fetch fundamentals. Add it to .env.")
            sys.exit(1)
        logger.info("=== Collecting fundamental data (FMP) ===")
        client = FMPClient()
        try:
            collect_fundamentals(tickers, cache, output_dir / "fundamentals", client)
        finally:
            client.close()

    cache.close()
    logger.info("Done. Data written to %s", output_dir)


if __name__ == "__main__":
    main()
