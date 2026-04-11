from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import yfinance as yf

VALID_PERIODS = {"5d", "1mo", "3mo", "6mo", "1y", "5y"}

router = APIRouter(prefix="/stocks", tags=["market-data"])


class CompanyInfo(BaseModel):
    name: str | None = None
    sector: str | None = None
    industry: str | None = None
    market_cap: int | None = None
    beta: float | None = None
    analyst_target: float | None = None
    institutional_ownership: float | None = None
    # Analyst consensus
    recommendation: str | None = None  # e.g. "Buy", "Strong Buy", "Hold"
    analyst_count: int | None = None
    target_low: float | None = None
    target_high: float | None = None
    target_median: float | None = None
    # Valuation
    trailing_pe: float | None = None
    forward_pe: float | None = None
    peg_ratio: float | None = None
    price_to_book: float | None = None
    # Earnings
    eps_trailing: float | None = None
    eps_forward: float | None = None
    # Dividend
    dividend_yield: float | None = None
    ex_dividend_date: str | None = None
    # 52-week range
    fifty_two_week_low: float | None = None
    fifty_two_week_high: float | None = None
    # Short interest
    short_percent: float | None = None
    # Profitability
    profit_margin: float | None = None
    revenue_growth: float | None = None
    # Earnings date
    earnings_date: str | None = None


class PricePoint(BaseModel):
    date: str
    close: float


class MarketDataResponse(BaseModel):
    company: CompanyInfo
    prices: list[PricePoint]


@router.get("/{ticker}/market-data", response_model=MarketDataResponse)
def get_market_data(ticker: str, period: str = Query("3mo")):
    ticker = ticker.upper()
    if period not in VALID_PERIODS:
        raise HTTPException(status_code=400, detail=f"Invalid period '{period}'. Must be one of: {', '.join(sorted(VALID_PERIODS))}")
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}

        # Clean up company name — strip share class / security type suffixes
        raw_name = info.get("longName") or info.get("shortName") or ""
        import re
        clean_name = re.sub(
            r"\s*[-–—]?\s*(Class\s+[A-Z]\s+)?(Common\s+Stock|Ordinary\s+Shares?|American\s+Depositary\s+Shares?|ADR).*$",
            "",
            raw_name,
            flags=re.IGNORECASE,
        ).strip().rstrip(",").strip()
        if not clean_name:
            clean_name = raw_name

        from datetime import datetime, timezone

        # Parse ex-dividend date
        ex_div_raw = info.get("exDividendDate")
        ex_div_str = None
        if ex_div_raw:
            try:
                ex_div_str = datetime.fromtimestamp(ex_div_raw).strftime("%Y-%m-%d")
            except Exception:
                pass

        # Parse next earnings date (yfinance returns a list of timestamps or strings)
        earnings_date_str = None
        try:
            cal = t.calendar
            if cal is not None and not cal.empty:
                # calendar is a DataFrame with columns as dates; first column = next earnings
                first_col = cal.columns[0]
                ed = cal.loc["Earnings Date", first_col] if "Earnings Date" in cal.index else None
                if ed is not None:
                    if hasattr(ed, "strftime"):
                        earnings_date_str = ed.strftime("%Y-%m-%d")
                    else:
                        earnings_date_str = str(ed)[:10]
        except Exception:
            pass

        if not earnings_date_str:
            # Fallback: info dict may have earningsTimestamp or earningsDate
            for key in ("earningsTimestamp", "earningsDate"):
                raw = info.get(key)
                if raw:
                    try:
                        if isinstance(raw, (int, float)):
                            dt = datetime.fromtimestamp(raw, tz=timezone.utc)
                            if dt > datetime.now(tz=timezone.utc):
                                earnings_date_str = dt.strftime("%Y-%m-%d")
                        elif isinstance(raw, str):
                            earnings_date_str = raw[:10]
                        break
                    except Exception:
                        pass

        company = CompanyInfo(
            name=clean_name or None,
            sector=info.get("sector"),
            industry=info.get("industry"),
            market_cap=info.get("marketCap"),
            beta=info.get("beta"),
            analyst_target=info.get("targetMeanPrice"),
            institutional_ownership=info.get("institutionsPercentHeld"),
            # Analyst consensus
            recommendation=info.get("recommendationKey"),
            analyst_count=info.get("numberOfAnalystOpinions"),
            target_low=info.get("targetLowPrice"),
            target_high=info.get("targetHighPrice"),
            target_median=info.get("targetMedianPrice"),
            # Valuation
            trailing_pe=info.get("trailingPE"),
            forward_pe=info.get("forwardPE"),
            peg_ratio=info.get("pegRatio"),
            price_to_book=info.get("priceToBook"),
            # Earnings
            eps_trailing=info.get("trailingEps"),
            eps_forward=info.get("forwardEps"),
            # Dividend
            dividend_yield=info.get("dividendYield"),
            ex_dividend_date=ex_div_str,
            # 52-week range
            fifty_two_week_low=info.get("fiftyTwoWeekLow"),
            fifty_two_week_high=info.get("fiftyTwoWeekHigh"),
            # Short interest
            short_percent=info.get("shortPercentOfFloat"),
            # Profitability
            profit_margin=info.get("profitMargins"),
            revenue_growth=info.get("revenueGrowth"),
            earnings_date=earnings_date_str,
        )

        interval = "1h" if period == "5d" else "1d"
        hist = t.history(period=period, interval=interval)
        prices: list[PricePoint] = []
        date_fmt = "%Y-%m-%d %H:%M" if period == "5d" else "%Y-%m-%d"
        for dt, row in hist.iterrows():
            prices.append(PricePoint(
                date=dt.strftime(date_fmt),
                close=round(float(row["Close"]), 2),
            ))

        return MarketDataResponse(company=company, prices=prices)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch market data: {e}")
