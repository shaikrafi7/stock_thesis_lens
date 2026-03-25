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
class InsiderSignal:
    form_type: str
    date: str
    filer: str


@dataclass
class FilingSignal:
    form_type: str
    date: str
    title: str


@dataclass
class ValuationSignal:
    trailing_pe: float | None = None
    forward_pe: float | None = None
    peg_ratio: float | None = None
    ps_ratio: float | None = None
    pb_ratio: float | None = None
    ev_ebitda: float | None = None
    analyst_target: float | None = None
    current_price: float | None = None


@dataclass
class FinancialHealthSignal:
    debt_to_equity: float | None = None
    current_ratio: float | None = None
    roe: float | None = None
    gross_margin: float | None = None
    operating_margin: float | None = None
    profit_margin: float | None = None
    fcf: float | None = None
    total_cash: float | None = None
    total_debt: float | None = None
    revenue: float | None = None
    revenue_growth: float | None = None


@dataclass
class OwnershipSignal:
    institutional_pct: float | None = None
    insider_pct: float | None = None
    short_pct_float: float | None = None
    analyst_count: int | None = None
    recommendation: str | None = None  # e.g. "buy", "hold", "sell"
    target_price: float | None = None


@dataclass
class CollectedSignals:
    ticker: str
    price: PriceSignal | None
    news: list[NewsSignal] = field(default_factory=list)
    fundamentals: FundamentalSignal | None = None
    insider_transactions: list[InsiderSignal] = field(default_factory=list)
    recent_filings: list[FilingSignal] = field(default_factory=list)
    valuation: ValuationSignal | None = None
    financial_health: FinancialHealthSignal | None = None
    ownership: OwnershipSignal | None = None


# ── Polygon helpers ──────────────────────────────────────────────────────────

def _polygon_snapshot(ticker: str, api_key: str) -> dict:
    resp = httpx.get(
        f"https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}",
        params={"apiKey": api_key},
        timeout=10,
        follow_redirects=True,
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
        follow_redirects=True,
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
            follow_redirects=True,
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


# ── SEC EDGAR helpers ────────────────────────────────────────────────────────

def _collect_insider(ticker: str) -> list[InsiderSignal]:
    try:
        from app.utils.sec_edgar import get_insider_transactions
        raw = get_insider_transactions(ticker, days=90)
        return [
            InsiderSignal(
                form_type=r.get("form_type", "4"),
                date=r.get("date", ""),
                filer=r.get("filer", ""),
            )
            for r in raw
        ]
    except Exception as exc:
        logger.error("signal_collector: insider fetch failed for %s: %s", ticker, exc)
        return []


def _collect_filings(ticker: str) -> list[FilingSignal]:
    try:
        from app.utils.sec_edgar import get_recent_filings
        raw = get_recent_filings(ticker, days=90)
        return [
            FilingSignal(
                form_type=r.get("form_type", ""),
                date=r.get("date", ""),
                title=r.get("title", ""),
            )
            for r in raw
        ]
    except Exception as exc:
        logger.error("signal_collector: filings fetch failed for %s: %s", ticker, exc)
        return []


# ── yfinance extended data ──────────────────────────────────────────────────

def _collect_yfinance_extended(ticker: str) -> tuple[ValuationSignal | None, FinancialHealthSignal | None, OwnershipSignal | None]:
    """Collect valuation, financial health, and ownership data from yfinance."""
    try:
        import yfinance as yf
        info = yf.Ticker(ticker).info

        valuation = ValuationSignal(
            trailing_pe=info.get("trailingPE"),
            forward_pe=info.get("forwardPE"),
            peg_ratio=info.get("pegRatio"),
            ps_ratio=info.get("priceToSalesTrailing12Months"),
            pb_ratio=info.get("priceToBook"),
            ev_ebitda=info.get("enterpriseToEbitda"),
            analyst_target=info.get("targetMeanPrice"),
            current_price=info.get("currentPrice") or info.get("regularMarketPrice"),
        )

        financial = FinancialHealthSignal(
            debt_to_equity=info.get("debtToEquity"),
            current_ratio=info.get("currentRatio"),
            roe=info.get("returnOnEquity"),
            gross_margin=info.get("grossMargins"),
            operating_margin=info.get("operatingMargins"),
            profit_margin=info.get("profitMargins"),
            fcf=info.get("freeCashflow"),
            total_cash=info.get("totalCash"),
            total_debt=info.get("totalDebt"),
            revenue=info.get("totalRevenue"),
            revenue_growth=info.get("revenueGrowth"),
        )

        rec_key = info.get("recommendationKey", "")
        ownership = OwnershipSignal(
            institutional_pct=info.get("heldPercentInstitutions"),
            insider_pct=info.get("heldPercentInsiders"),
            short_pct_float=info.get("shortPercentOfFloat"),
            analyst_count=info.get("numberOfAnalystOpinions"),
            recommendation=rec_key if rec_key else None,
            target_price=info.get("targetMeanPrice"),
        )

        return valuation, financial, ownership
    except Exception as exc:
        logger.error("signal_collector: yfinance extended data failed for %s: %s", ticker, exc)
        return None, None, None


# ── Public API ───────────────────────────────────────────────────────────────

def collect_signals(ticker: str, company_name: str) -> CollectedSignals:
    """Collect all available signals for a stock. Never raises."""
    price = _collect_price(ticker)
    news = _collect_news(ticker, company_name)
    fundamentals = _collect_fundamentals(ticker)
    insider = _collect_insider(ticker)
    filings = _collect_filings(ticker)
    valuation, financial, ownership = _collect_yfinance_extended(ticker)
    return CollectedSignals(
        ticker=ticker,
        price=price,
        news=news,
        fundamentals=fundamentals,
        insider_transactions=insider,
        recent_filings=filings,
        valuation=valuation,
        financial_health=financial,
        ownership=ownership,
    )
