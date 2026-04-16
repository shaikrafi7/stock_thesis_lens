"""SQLite cache for raw API responses.

Schema:
  api_cache(ticker TEXT, endpoint TEXT, date TEXT, payload TEXT)
  Primary key: (ticker, endpoint, date)
"""
import json
import logging
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)


def _conn(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.execute("""
        CREATE TABLE IF NOT EXISTS api_cache (
            ticker   TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            date     TEXT NOT NULL,
            payload  TEXT NOT NULL,
            PRIMARY KEY (ticker, endpoint, date)
        )
    """)
    con.commit()
    return con


class Cache:
    """Simple SQLite-backed cache keyed by (ticker, endpoint, date)."""

    def __init__(self, path: Path) -> None:
        self._con = _conn(path)

    def get(self, ticker: str, endpoint: str, date: str) -> list | dict | None:
        """Return parsed JSON or None if not cached."""
        row = self._con.execute(
            "SELECT payload FROM api_cache WHERE ticker=? AND endpoint=? AND date=?",
            (ticker, endpoint, date),
        ).fetchone()
        return json.loads(row[0]) if row else None

    def set(self, ticker: str, endpoint: str, date: str, data: list | dict) -> None:
        """Store JSON-serialisable data in cache."""
        self._con.execute(
            "INSERT OR REPLACE INTO api_cache (ticker, endpoint, date, payload) VALUES (?,?,?,?)",
            (ticker, endpoint, date, json.dumps(data)),
        )
        self._con.commit()

    def has(self, ticker: str, endpoint: str, date: str) -> bool:
        row = self._con.execute(
            "SELECT 1 FROM api_cache WHERE ticker=? AND endpoint=? AND date=?",
            (ticker, endpoint, date),
        ).fetchone()
        return row is not None

    def close(self) -> None:
        self._con.close()
