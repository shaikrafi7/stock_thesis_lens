"""Signal Collector agent.

Fetches two types of signals for a given stock:
  1. Price signals from Polygon.io (snapshot + 30-day aggregates)
  2. News headlines from Serper (Google News)

All external calls are wrapped with fallback — never raises to caller.
"""
import logging
from dataclasses import dataclass, field
from datetime import date, timedelta

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class PriceSignal:
    ticker: str
    current_price: float
    prev_close: float
    day_change_pct: float          # % change today
    week_change_pct: float         # % change over 5 trading days
    month_change_pct: float        # % change over 30 calendar days
    fifty_two_week_high: float
    fifty_two_week_low: float
    avg_volume_10d: float
    current_volume: float
    volume_ratio: float            # current / avg (>1.5 = elevated)
    ma_20: float                   # 20-day moving average
    ma_50: float                   # 50-day moving average
    trend: str                     # "up" | "down" | "flat"
    available: bool = True


@dataclass
class NewsSignal:
    title: str
    snippet: str
    date: str
    source: str


@dataclass
class FundamentalSignal:
    pe_ratio: float | None = None
    revenue_growth: float | None = None
    gross_profit_margin: float | None = None
    eps_actual: float | None = None
    eps_estimate: float | None = None
    surprise_pct: float | None = None
    eps_beat: bool | None = None


@dataclass
class CollectedSignals:
    ticker: str
    price: PriceSignal | None
    news: list[NewsSignal] = field(default_factory=list)
    fundamentals: FundamentalSignal | None = None


# ── Polygon helpers ──────────────────────────────────────────────────────────

def _polygon_snapshot(ticker: str, api_key: str) -> dict:
    resp = httpx.get(
        f"https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}",
        params={"apiKey": api_key},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get("ticker", {})


def _polygon_aggs(ticker: str, api_key: str, days: int = 60) -> list[dict]:
    end = date.today()
    start = end - timedelta(days=days)
    resp = httpx.get(
        f"https://api.polygon.io/v2/aggs/ticker/{ticker}/range/1/day/{start}/{end}",
        params={"adjusted": "true", "sort": "asc", "limit": 100, "apiKey": api_key},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get("results", [])


def _compute_ma(bars: list[dict], n: int) -> float:
    closes = [b["c"] for b in bars]
    if len(closes) < n:
        return closes[-1] if closes else 0.0
    return sum(closes[-n:]) / n


def _collect_price(ticker: str) -> PriceSignal | None:
    api_key = settings.POLYGON_API_KEY
    if not api_key:
        logger.warning("signal_collector: POLYGON_API_KEY not set, skipping price signals")
        return None
    try:
        snap = _polygon_snapshot(ticker, api_key)
        day = snap.get("day", {})
        prev_day = snap.get("prevDay", {})
        last_trade = snap.get("lastTrade", {})

        current_price = day.get("c") or last_trade.get("p") or prev_day.get("c") or 0.0
        prev_close = prev_day.get("c") or current_price
        day_change_pct = snap.get("todaysChangePerc", 0.0)

        bars = _polygon_aggs(ticker, api_key, days=60)

        if len(bars) >= 2:
            price_5d_ago = bars[-5]["c"] if len(bars) >= 5 else bars[0]["c"]
            price_30d_ago = bars[-22]["c"] if len(bars) >= 22 else bars[0]["c"]
            week_change_pct = ((current_price - price_5d_ago) / price_5d_ago * 100) if price_5d_ago else 0.0
            month_change_pct = ((current_price - price_30d_ago) / price_30d_ago * 100) if price_30d_ago else 0.0
        else:
            week_change_pct = month_change_pct = 0.0

        fifty_two_week_high = max((b["h"] for b in bars), default=current_price)
        fifty_two_week_low = min((b["l"] for b in bars), default=current_price)

        volumes = [b["v"] for b in bars[-10:] if b.get("v")]
        avg_vol = sum(volumes) / len(volumes) if volumes else 0.0
        current_vol = day.get("v") or (volumes[-1] if volumes else 0.0)
        vol_ratio = (current_vol / avg_vol) if avg_vol else 1.0

        ma_20 = _compute_ma(bars, 20)
        ma_50 = _compute_ma(bars, 50)

        if ma_20 > ma_50 * 1.02:
            trend = "up"
        elif ma_20 < ma_50 * 0.98:
            trend = "down"
        else:
            trend = "flat"

        return PriceSignal(
            ticker=ticker,
            current_price=current_price,
            prev_close=prev_close,
            day_change_pct=day_change_pct,
            week_change_pct=week_change_pct,
            month_change_pct=month_change_pct,
            fifty_two_week_high=fifty_two_week_high,
            fifty_two_week_low=fifty_two_week_low,
            avg_volume_10d=avg_vol,
            current_volume=current_vol,
            volume_ratio=vol_ratio,
            ma_20=ma_20,
            ma_50=ma_50,
            trend=trend,
        )
    except Exception as exc:
        logger.error("signal_collector: Polygon error for %s: %s", ticker, exc)
        return None


# ── Serper news helper ───────────────────────────────────────────────────────

def _collect_news(ticker: str, company_name: str) -> list[NewsSignal]:
    api_key = settings.SERPER_API_KEY
    if not api_key:
        logger.warning("signal_collector: SERPER_API_KEY not set, skipping news signals")
        return []
    try:
        resp = httpx.post(
            "https://google.serper.dev/news",
            headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
            json={"q": f"{company_name} {ticker} stock", "num": 8},
            timeout=10,
        )
        resp.raise_for_status()
        items = resp.json().get("news", [])
        return [
            NewsSignal(
                title=item.get("title", ""),
                snippet=item.get("snippet", ""),
                date=item.get("date", ""),
                source=item.get("source", ""),
            )
            for item in items
            if item.get("title")
        ]
    except Exception as exc:
        logger.error("signal_collector: Serper error for %s: %s", ticker, exc)
        return []


# ── Fundamentals helpers ─────────────────────────────────────────────────────

def _collect_fundamentals(ticker: str) -> FundamentalSignal | None:
    try:
        from app.utils.fmp import get_fundamentals
        from app.utils.financial_datasets import get_earnings

        fmp = get_fundamentals(ticker)
        earnings = get_earnings(ticker)

        if not fmp and not earnings:
            return None

        return FundamentalSignal(
            pe_ratio=fmp.get("pe_ratio"),
            revenue_growth=fmp.get("revenue_growth"),
            gross_profit_margin=fmp.get("gross_profit_margin"),
            eps_actual=earnings.get("eps_actual"),
            eps_estimate=earnings.get("eps_estimate"),
            surprise_pct=earnings.get("surprise_pct"),
            eps_beat=earnings.get("eps_beat"),
        )
    except Exception as exc:
        logger.error("signal_collector: fundamentals fetch failed for %s: %s", ticker, exc)
        return None


# ── Public API ───────────────────────────────────────────────────────────────

def collect_signals(ticker: str, company_name: str) -> CollectedSignals:
    """Collect all available signals for a stock. Never raises."""
    price = _collect_price(ticker)
    news = _collect_news(ticker, company_name)
    fundamentals = _collect_fundamentals(ticker)
    return CollectedSignals(ticker=ticker, price=price, news=news, fundamentals=fundamentals)
