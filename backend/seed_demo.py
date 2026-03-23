"""
Seed a Mag 7 demo portfolio.

Usage (from project root, with venv active and backend running):
    python backend/seed_demo.py

What it does:
  1. Adds each Mag 7 ticker (skips if already exists)
  2. Generates thesis points for each
  3. Auto-selects ~4 points spread across categories

Does NOT run evaluation — do that manually per stock to control API costs.
"""

import os
import requests
import sys

# Avoid UnicodeEncodeError on Windows cp1252 terminals
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore

BASE = "http://localhost:8080"
MAG7 = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"]
# Prefer one point from each category; fallback to first N overall
CATEGORY_ORDER = ["core_beliefs", "risks", "strengths", "catalysts", "leadership"]
POINTS_PER_STOCK = 4


def log(msg: str):
    print(msg, flush=True)


def add_stock(ticker: str) -> bool:
    """Returns True if newly added, False if already exists."""
    r = requests.post(f"{BASE}/stocks", json={"ticker": ticker, "name": ""})
    if r.status_code == 409:
        log(f"  {ticker} already exists — skipping add")
        return False
    r.raise_for_status()
    log(f"  {ticker} added: {r.json().get('name', '')}")
    return True


def generate_thesis(ticker: str) -> list[dict]:
    log(f"  Generating thesis for {ticker}…")
    r = requests.post(f"{BASE}/stocks/{ticker}/generate-thesis")
    r.raise_for_status()
    points = r.json()
    log(f"  {len(points)} points generated")
    return points


def get_theses(ticker: str) -> list[dict]:
    r = requests.get(f"{BASE}/stocks/{ticker}/theses")
    r.raise_for_status()
    return r.json()


def select_thesis(ticker: str, thesis_id: int):
    r = requests.patch(
        f"{BASE}/stocks/{ticker}/theses/{thesis_id}",
        json={"selected": True},
    )
    r.raise_for_status()


def auto_select(ticker: str, theses: list[dict]):
    """Select one point per category (up to POINTS_PER_STOCK)."""
    selected_ids: list[int] = []
    by_cat: dict[str, list[dict]] = {}
    for t in theses:
        by_cat.setdefault(t["category"], []).append(t)

    for cat in CATEGORY_ORDER:
        if len(selected_ids) >= POINTS_PER_STOCK:
            break
        if cat in by_cat:
            selected_ids.append(by_cat[cat][0]["id"])

    # Fallback: fill from any remaining if we didn't reach target
    if len(selected_ids) < POINTS_PER_STOCK:
        for t in theses:
            if t["id"] not in selected_ids:
                selected_ids.append(t["id"])
            if len(selected_ids) >= POINTS_PER_STOCK:
                break

    for tid in selected_ids:
        select_thesis(ticker, tid)

    log(f"  Auto-selected {len(selected_ids)} thesis points")


def seed_ticker(ticker: str, force_regenerate: bool = False):
    log(f"\n-- {ticker} --")
    try:
        newly_added = add_stock(ticker)
    except requests.HTTPError as e:
        log(f"  ERROR adding {ticker}: {e.response.text}")
        return

    existing = get_theses(ticker)
    if existing and not force_regenerate:
        log(f"  Thesis already exists ({len(existing)} points) — auto-selecting from existing")
        theses = existing
    else:
        try:
            theses = generate_thesis(ticker)
        except requests.HTTPError as e:
            log(f"  ERROR generating thesis for {ticker}: {e.response.text}")
            return

    auto_select(ticker, theses)


if __name__ == "__main__":
    force = "--force" in sys.argv  # pass --force to regenerate even if thesis exists
    log("Stock Thesis Lens — Mag 7 Demo Seeder")
    log(f"Seeding: {', '.join(MAG7)}")
    if force:
        log("--force: will regenerate thesis for all tickers")

    for ticker in MAG7:
        seed_ticker(ticker, force_regenerate=force)

    log("\nDone! Open http://localhost:3000 to see your portfolio.")
    log("Evaluate each stock individually to see full functionality.")
