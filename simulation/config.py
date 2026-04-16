"""Simulation configuration: universe, date ranges, and study parameters."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load FMP_API_KEY from the project root .env (or backend/.env)
_ROOT = Path(__file__).parent.parent
load_dotenv(_ROOT / ".env")
load_dotenv(_ROOT / "backend" / ".env")  # fallback

FMP_API_KEY: str = os.environ.get("FMP_API_KEY", "")

# ── Date ranges ──────────────────────────────────────────────────────────────
IN_SAMPLE_START = "2020-01-01"
IN_SAMPLE_END   = "2023-12-31"
OUT_SAMPLE_START = "2024-01-01"
OUT_SAMPLE_END   = "2025-12-31"

STUDY_START = IN_SAMPLE_START
STUDY_END   = OUT_SAMPLE_END

# ── FMP rate limiting ────────────────────────────────────────────────────────
# Starter plan: 300 calls/min. We use 250 to leave headroom.
FMP_MAX_CALLS_PER_MIN = 250

# ── SQLite cache ─────────────────────────────────────────────────────────────
CACHE_PATH = Path(__file__).parent / "data" / "cache.db"

# ── Universe ──────────────────────────────────────────────────────────────────
# Top 100 S&P 500 by market cap (as of early 2025). Extend to full 500 as needed.
SP500_TOP100 = [
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "GOOG", "BRK-B", "LLY", "TSLA",
    "AVGO", "JPM", "V", "UNH", "XOM", "MA", "COST", "HD", "PG", "JNJ",
    "ORCL", "ABBV", "BAC", "KO", "MRK", "CVX", "NFLX", "WMT", "CRM", "AMD",
    "ADBE", "ACN", "LIN", "MCD", "TMO", "PEP", "CSCO", "ABT", "DHR", "CAT",
    "GE", "INTU", "TXN", "QCOM", "NOW", "SPGI", "IBM", "GS", "AMGN", "ISRG",
    "RTX", "BKNG", "SYK", "BLK", "VRTX", "AXP", "LOW", "PLD", "PANW", "ELV",
    "ADI", "MMM", "GILD", "ADP", "MDLZ", "T", "MU", "LRCX", "SCHW", "DE",
    "CB", "BSX", "ETN", "SBUX", "UNP", "KLAC", "SO", "FI", "REGN", "BMY",
    "COP", "ZTS", "TJX", "PGR", "ICE", "CI", "DUK", "ANET", "CME", "INTC",
    "HCA", "SNPS", "APH", "WM", "MSI", "NOC", "AON", "MCO", "MAR", "CDNS",
]

# Full S&P 500 ticker list (fetched dynamically) — populated by get_sp500_tickers()
def get_sp500_tickers() -> list[str]:
    """Return S&P 500 tickers, fetched from Wikipedia or falling back to top 100."""
    try:
        import pandas as pd
        df = pd.read_html("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies")[0]
        return df["Symbol"].str.replace(".", "-", regex=False).tolist()
    except Exception:
        return SP500_TOP100


UNIVERSE_PRESETS = {
    "top100": SP500_TOP100,
    "sp500": None,  # resolved at runtime via get_sp500_tickers()
}
