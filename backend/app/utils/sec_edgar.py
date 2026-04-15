"""SEC EDGAR utilities — fetch insider transactions and recent 8-K filings."""

import logging
from datetime import date, timedelta

import httpx

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": "STARC/1.0 (starc@example.com)",
    "Accept": "application/json",
}

_COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"

# Module-level CIK cache: {ticker -> cik_padded}
_cik_cache: dict[str, str] = {}


def _get_cik(ticker: str) -> str | None:
    """Resolve ticker to zero-padded CIK using SEC's company_tickers.json."""
    if ticker in _cik_cache:
        return _cik_cache[ticker]

    try:
        resp = httpx.get(_COMPANY_TICKERS_URL, headers=_HEADERS, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        for entry in data.values():
            t = entry.get("ticker", "").upper()
            cik = str(entry.get("cik_str", "")).zfill(10)
            _cik_cache[t] = cik
        return _cik_cache.get(ticker)
    except Exception as exc:
        logger.warning("sec_edgar: CIK lookup failed: %s", exc)
        return None


def get_insider_transactions(ticker: str, days: int = 90) -> list[dict]:
    """Fetch recent Form 4 (insider trading) filings from SEC EDGAR.

    Returns list of: {type, filer, date, form_type}
    """
    cik = _get_cik(ticker.upper())
    if not cik:
        return []

    try:
        resp = httpx.get(
            _SUBMISSIONS_URL.format(cik=cik),
            headers=_HEADERS,
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

        recent = data.get("filings", {}).get("recent", {})
        forms = recent.get("form", [])
        dates = recent.get("filingDate", [])
        filers = recent.get("primaryDocument", [])

        cutoff = str(date.today() - timedelta(days=days))
        results = []
        buys = 0
        sells = 0

        for i, form in enumerate(forms):
            if form not in ("4", "4/A"):
                continue
            filing_date = dates[i] if i < len(dates) else ""
            if filing_date < cutoff:
                continue

            # Form 4 = insider transaction. We can't easily parse buy/sell
            # from the metadata alone, but filing frequency is a signal.
            results.append({
                "form_type": form,
                "date": filing_date,
                "filer": filers[i] if i < len(filers) else "",
            })

        # Classify as net buying/selling based on filing count
        # (A rough heuristic — precise parsing requires XML)
        return results[:20]  # cap at 20 most recent

    except Exception as exc:
        logger.warning("sec_edgar: insider transactions failed for %s: %s", ticker, exc)
        return []


def get_recent_filings(ticker: str, form_types: list[str] | None = None, days: int = 90) -> list[dict]:
    """Fetch recent filings (8-K, 10-K, 10-Q, etc.) from SEC EDGAR.

    Returns list of: {form_type, date, title}
    """
    cik = _get_cik(ticker.upper())
    if not cik:
        return []

    if form_types is None:
        form_types = ["8-K", "8-K/A", "10-K", "10-Q"]

    try:
        resp = httpx.get(
            _SUBMISSIONS_URL.format(cik=cik),
            headers=_HEADERS,
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

        recent = data.get("filings", {}).get("recent", {})
        forms = recent.get("form", [])
        dates = recent.get("filingDate", [])
        descriptions = recent.get("primaryDocDescription", [])

        cutoff = str(date.today() - timedelta(days=days))
        results = []

        for i, form in enumerate(forms):
            if form not in form_types:
                continue
            filing_date = dates[i] if i < len(dates) else ""
            if filing_date < cutoff:
                continue
            results.append({
                "form_type": form,
                "date": filing_date,
                "title": descriptions[i] if i < len(descriptions) else form,
            })

        return results[:10]

    except Exception as exc:
        logger.warning("sec_edgar: recent filings failed for %s: %s", ticker, exc)
        return []
