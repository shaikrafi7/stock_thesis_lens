"""Sector and market-cap group mappings for SP500.

Sector: loaded from data/sp500_sectors.json (scraped from Wikipedia GICS data).
Falls back to hardcoded Top 100 if file missing.
Cap group: mega (>$200B), large ($50B-$200B), mid (<$50B).
"""
import json
from pathlib import Path

_DATA_DIR = Path(__file__).parent.parent / "data"


def _load_sectors_from_file() -> dict[str, str]:
    """Load sector mapping from sp500_sectors.json if available."""
    path = _DATA_DIR / "sp500_sectors.json"
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {}


# Try file first, fall back to hardcoded
_FILE_SECTORS = _load_sectors_from_file()

# Hardcoded fallback for Top 100
_HARDCODED_SECTORS: dict[str, str] = {
    "AAPL": "Technology", "MSFT": "Technology", "NVDA": "Technology",
    "AMZN": "Consumer Discretionary", "GOOGL": "Communication Services",
    "META": "Communication Services", "GOOG": "Communication Services",
    "BRK-B": "Financials", "LLY": "Healthcare", "TSLA": "Consumer Discretionary",
    "AVGO": "Technology", "JPM": "Financials", "V": "Financials",
    "UNH": "Healthcare", "XOM": "Energy", "MA": "Financials",
    "COST": "Consumer Staples", "HD": "Consumer Discretionary", "PG": "Consumer Staples",
    "JNJ": "Healthcare", "ORCL": "Technology", "ABBV": "Healthcare",
    "BAC": "Financials", "KO": "Consumer Staples", "MRK": "Healthcare",
    "CVX": "Energy", "NFLX": "Communication Services", "WMT": "Consumer Staples",
    "CRM": "Technology", "AMD": "Technology", "ADBE": "Technology",
    "ACN": "Technology", "LIN": "Materials", "MCD": "Consumer Discretionary",
    "TMO": "Healthcare", "PEP": "Consumer Staples", "CSCO": "Technology",
    "ABT": "Healthcare", "DHR": "Healthcare", "CAT": "Industrials",
    "GE": "Industrials", "INTU": "Technology", "TXN": "Technology",
    "QCOM": "Technology", "NOW": "Technology", "SPGI": "Financials",
    "IBM": "Technology", "GS": "Financials", "AMGN": "Healthcare",
    "ISRG": "Healthcare", "RTX": "Industrials", "BKNG": "Consumer Discretionary",
    "SYK": "Healthcare", "BLK": "Financials", "VRTX": "Healthcare",
    "AXP": "Financials", "LOW": "Consumer Discretionary", "PLD": "Real Estate",
    "PANW": "Technology", "ELV": "Healthcare", "ADI": "Technology",
    "MMM": "Industrials", "GILD": "Healthcare", "ADP": "Industrials",
    "MDLZ": "Consumer Staples", "T": "Communication Services", "MU": "Technology",
    "LRCX": "Technology", "SCHW": "Financials", "DE": "Industrials",
    "CB": "Financials", "BSX": "Healthcare", "ETN": "Industrials",
    "SBUX": "Consumer Discretionary", "UNP": "Industrials", "KLAC": "Technology",
    "SO": "Utilities", "FI": "Financials", "REGN": "Healthcare",
    "BMY": "Healthcare", "COP": "Energy", "ZTS": "Healthcare",
    "TJX": "Consumer Discretionary", "PGR": "Financials", "ICE": "Financials",
    "CI": "Healthcare", "DUK": "Utilities", "ANET": "Technology",
    "CME": "Financials", "INTC": "Technology", "HCA": "Healthcare",
    "SNPS": "Technology", "APH": "Technology", "WM": "Industrials",
    "MSI": "Technology", "NOC": "Industrials", "AON": "Financials",
    "MCO": "Financials", "MAR": "Consumer Discretionary", "CDNS": "Technology",
}

# Merge: file takes precedence over hardcoded
SECTOR_MAP: dict[str, str] = {**_HARDCODED_SECTORS, **_FILE_SECTORS}

# Market cap group: mega (>$200B), large ($50-200B), mid (<$50B)
# Approximate as of early 2025
CAP_GROUP_MAP: dict[str, str] = {
    "AAPL": "mega", "MSFT": "mega", "NVDA": "mega", "AMZN": "mega",
    "GOOGL": "mega", "META": "mega", "GOOG": "mega", "BRK-B": "mega",
    "LLY": "mega", "TSLA": "mega", "AVGO": "mega", "JPM": "mega",
    "V": "mega", "UNH": "mega", "XOM": "mega", "MA": "mega",
    "COST": "mega", "HD": "mega", "PG": "mega", "JNJ": "mega",
    "ORCL": "mega", "ABBV": "mega", "BAC": "mega", "KO": "mega",
    "MRK": "mega", "CVX": "mega", "NFLX": "mega", "WMT": "mega",
    "CRM": "mega", "AMD": "mega",
    # Large-cap ($50B-$200B)
    "ADBE": "large", "ACN": "large", "LIN": "large", "MCD": "large",
    "TMO": "large", "PEP": "large", "CSCO": "large", "ABT": "large",
    "DHR": "large", "CAT": "large", "GE": "large", "INTU": "large",
    "TXN": "large", "QCOM": "large", "NOW": "large", "SPGI": "large",
    "IBM": "large", "GS": "large", "AMGN": "large", "ISRG": "large",
    "RTX": "large", "BKNG": "large", "SYK": "large", "BLK": "large",
    "VRTX": "large", "AXP": "large", "LOW": "large", "PLD": "large",
    "PANW": "large", "ELV": "large", "ADI": "large",
    "GILD": "large", "ADP": "large", "MDLZ": "large",
    "T": "large", "MU": "large", "LRCX": "large", "SCHW": "large",
    "DE": "large", "CB": "large", "BSX": "large", "ETN": "large",
    "SBUX": "large", "UNP": "large", "KLAC": "large", "SO": "large",
    "FI": "large", "REGN": "large", "BMY": "large", "COP": "large",
    "ZTS": "large", "TJX": "large", "PGR": "large", "ICE": "large",
    "CI": "large", "DUK": "large", "ANET": "large", "CME": "large",
    # Mid-cap or smaller large-cap (some of these are borderline)
    "MMM": "mid", "INTC": "mid", "HCA": "large", "SNPS": "large",
    "APH": "large", "WM": "large", "MSI": "large", "NOC": "large",
    "AON": "large", "MCO": "large", "MAR": "large", "CDNS": "large",
}


def get_sector(ticker: str) -> str:
    """Return GICS sector for a ticker, or 'Unknown'."""
    return SECTOR_MAP.get(ticker, "Unknown")


def get_cap_group(ticker: str) -> str:
    """Return market cap group for a ticker, or 'unknown'."""
    return CAP_GROUP_MAP.get(ticker, "unknown")
