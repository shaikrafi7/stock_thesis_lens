"""Fetch a quick market snapshot for a ticker (current price, change, volume).

Includes a per-ticker TTL cache to avoid hammering yfinance on every request.
"""

import logging
import time
from dataclasses import dataclass, field

import yfinance as yf

logger = logging.getLogger(__name__)

# In-memory cache: ticker -> (MarketSnapshot, timestamp)
_cache: dict[str, tuple["MarketSnapshot", float]] = {}
CACHE_TTL_SECONDS = 120  # 2 minutes — balances freshness vs rate limits


@dataclass
class MarketSnapshot:
    price: float | None = None
    change_pct: float | None = None
    day_high: float | None = None
    day_low: float | None = None
    volume: int | None = None
    market_cap: int | None = None
    fifty_two_week_high: float | None = None
    fifty_two_week_low: float | None = None
    prev_close: float | None = None
    fetched_at: float = field(default_factory=time.time)


def get_snapshot(ticker: str, force_refresh: bool = False) -> MarketSnapshot:
    """Return a quick market snapshot with 2-minute TTL cache."""
    ticker = ticker.upper()
    now = time.time()

    if not force_refresh and ticker in _cache:
        cached, ts = _cache[ticker]
        if now - ts < CACHE_TTL_SECONDS:
            return cached

    try:
        t = yf.Ticker(ticker)
        info = t.info or {}

        price = info.get("currentPrice") or info.get("regularMarketPrice")
        prev = info.get("previousClose") or info.get("regularMarketPreviousClose")
        change_pct = None
        if price and prev:
            change_pct = round(((price - prev) / prev) * 100, 2)

        snap = MarketSnapshot(
            price=price,
            change_pct=change_pct,
            day_high=info.get("dayHigh"),
            day_low=info.get("dayLow"),
            volume=info.get("volume"),
            market_cap=info.get("marketCap"),
            fifty_two_week_high=info.get("fiftyTwoWeekHigh"),
            fifty_two_week_low=info.get("fiftyTwoWeekLow"),
            prev_close=prev,
            fetched_at=now,
        )
        _cache[ticker] = (snap, now)
        return snap
    except Exception as exc:
        logger.warning("market_snapshot failed for %s: %s", ticker, exc)
        # Return stale cache if available, otherwise empty
        if ticker in _cache:
            return _cache[ticker][0]
        return MarketSnapshot(fetched_at=now)


def get_snapshots_batch(tickers: list[str]) -> dict[str, MarketSnapshot]:
    """Batch-fetch price snapshots for multiple tickers using yf.download().

    Much faster than individual get_snapshot() calls (1 HTTP request vs N).
    Populates the cache so subsequent get_snapshot() calls are instant.
    """
    tickers = [t.upper() for t in tickers]
    now = time.time()

    # Split into cached (still fresh) and uncached
    result: dict[str, MarketSnapshot] = {}
    need_fetch: list[str] = []
    for t in tickers:
        if t in _cache:
            cached, ts = _cache[t]
            if now - ts < CACHE_TTL_SECONDS:
                result[t] = cached
                continue
        need_fetch.append(t)

    if not need_fetch:
        return result

    try:
        df = yf.download(
            need_fetch,
            period="2d",
            interval="1d",
            progress=False,
            threads=True,
        )
        if df.empty:
            for t in need_fetch:
                result[t] = MarketSnapshot(fetched_at=now)
            return result

        # yf.download returns multi-level columns when >1 ticker
        multi = len(need_fetch) > 1

        for t in need_fetch:
            try:
                if multi:
                    close_col = df[("Close", t)]
                    vol_col = df[("Volume", t)]
                    high_col = df[("High", t)]
                    low_col = df[("Low", t)]
                else:
                    close_col = df["Close"]
                    vol_col = df["Volume"]
                    high_col = df["High"]
                    low_col = df["Low"]

                close_vals = close_col.dropna()
                if len(close_vals) == 0:
                    result[t] = MarketSnapshot(fetched_at=now)
                    continue

                price = float(close_vals.iloc[-1])
                prev = float(close_vals.iloc[-2]) if len(close_vals) >= 2 else None
                change_pct = round(((price - prev) / prev) * 100, 2) if prev else None
                volume = int(vol_col.iloc[-1]) if not vol_col.empty else None
                day_high = float(high_col.iloc[-1]) if not high_col.empty else None
                day_low = float(low_col.iloc[-1]) if not low_col.empty else None

                snap = MarketSnapshot(
                    price=price,
                    change_pct=change_pct,
                    day_high=day_high,
                    day_low=day_low,
                    volume=volume,
                    prev_close=prev,
                    fetched_at=now,
                )
                _cache[t] = (snap, now)
                result[t] = snap
            except Exception as exc:
                logger.warning("batch snapshot parse failed for %s: %s", t, exc)
                result[t] = MarketSnapshot(fetched_at=now)
    except Exception as exc:
        logger.warning("batch snapshot download failed: %s", exc)
        for t in need_fetch:
            result[t] = MarketSnapshot(fetched_at=now)

    return result


def format_snapshot(snap: MarketSnapshot) -> str:
    """Format a snapshot into a concise text block for LLM context."""
    if snap.price is None:
        return "Market data: unavailable"

    lines = [f"Current price: ${snap.price:.2f}"]
    if snap.change_pct is not None:
        direction = "up" if snap.change_pct >= 0 else "down"
        lines.append(f"Today: {direction} {abs(snap.change_pct):.2f}%")
    if snap.prev_close:
        lines.append(f"Previous close: ${snap.prev_close:.2f}")
    if snap.day_high and snap.day_low:
        lines.append(f"Day range: ${snap.day_low:.2f} – ${snap.day_high:.2f}")
    if snap.volume:
        lines.append(f"Volume: {snap.volume:,}")
    if snap.market_cap:
        if snap.market_cap >= 1_000_000_000_000:
            lines.append(f"Market cap: ${snap.market_cap / 1_000_000_000_000:.2f}T")
        elif snap.market_cap >= 1_000_000_000:
            lines.append(f"Market cap: ${snap.market_cap / 1_000_000_000:.1f}B")
        else:
            lines.append(f"Market cap: ${snap.market_cap / 1_000_000:.0f}M")
    if snap.fifty_two_week_high and snap.fifty_two_week_low:
        lines.append(f"52-week range: ${snap.fifty_two_week_low:.2f} – ${snap.fifty_two_week_high:.2f}")

    return "\n".join(lines)
