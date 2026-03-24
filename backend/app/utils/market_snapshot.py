"""Fetch a quick market snapshot for a ticker (current price, change, volume)."""

import logging
from dataclasses import dataclass

import yfinance as yf

logger = logging.getLogger(__name__)


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


def get_snapshot(ticker: str) -> MarketSnapshot:
    """Return a quick market snapshot. Returns empty snapshot on any error."""
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}

        price = info.get("currentPrice") or info.get("regularMarketPrice")
        prev = info.get("previousClose") or info.get("regularMarketPreviousClose")
        change_pct = None
        if price and prev:
            change_pct = round(((price - prev) / prev) * 100, 2)

        return MarketSnapshot(
            price=price,
            change_pct=change_pct,
            day_high=info.get("dayHigh"),
            day_low=info.get("dayLow"),
            volume=info.get("volume"),
            market_cap=info.get("marketCap"),
            fifty_two_week_high=info.get("fiftyTwoWeekHigh"),
            fifty_two_week_low=info.get("fiftyTwoWeekLow"),
            prev_close=prev,
        )
    except Exception as exc:
        logger.warning("market_snapshot failed for %s: %s", ticker, exc)
        return MarketSnapshot()


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
