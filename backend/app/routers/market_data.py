from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import yfinance as yf

router = APIRouter(prefix="/stocks", tags=["market-data"])


class CompanyInfo(BaseModel):
    name: str | None = None
    sector: str | None = None
    industry: str | None = None
    market_cap: int | None = None
    beta: float | None = None
    analyst_target: float | None = None
    institutional_ownership: float | None = None


class PricePoint(BaseModel):
    date: str
    close: float


class MarketDataResponse(BaseModel):
    company: CompanyInfo
    prices: list[PricePoint]


@router.get("/{ticker}/market-data", response_model=MarketDataResponse)
def get_market_data(ticker: str):
    ticker = ticker.upper()
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}

        company = CompanyInfo(
            name=info.get("longName") or info.get("shortName"),
            sector=info.get("sector"),
            industry=info.get("industry"),
            market_cap=info.get("marketCap"),
            beta=info.get("beta"),
            analyst_target=info.get("targetMeanPrice"),
            institutional_ownership=info.get("institutionsPercentHeld"),
        )

        hist = t.history(period="3mo", interval="1d")
        prices: list[PricePoint] = []
        for dt, row in hist.iterrows():
            prices.append(PricePoint(
                date=dt.strftime("%Y-%m-%d"),
                close=round(float(row["Close"]), 2),
            ))

        return MarketDataResponse(company=company, prices=prices)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch market data: {e}")
