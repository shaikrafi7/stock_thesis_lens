# Architecture

## MVP Architecture

Frontend:
- Next.js (Dashboard + Stock page)

Backend:
- FastAPI

Database:
- SQLite (dev/MVP), Postgres (prod)

Data sources (5 total):
- Polygon (OHLCV, snapshots, news)
- Serper (Google News search)
- FMP — Financial Modeling Prep (fundamentals, company profile)
- Financial Datasets (earnings, financial statements)
- yfinance (fallback price data)

---

## Flow

User -> UI -> Backend -> Evaluator -> DB -> UI

---

## Components

1. Thesis Storage
2. Signal Collector (multi-source price + news)
3. Signal Interpreter (deterministic rules + LLM mapping)
4. Thesis Evaluator (deterministic scoring, no LLM)
5. Explanation Agent (LLM summary)
6. Chat Agents (thesis chat + portfolio chat, streaming SSE)
7. Morning Briefing Agent

---

## Design Principles

- Keep evaluation logic deterministic
- Minimize LLM calls
- Ensure fallback behavior
- Maintain explainability
