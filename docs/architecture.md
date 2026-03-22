# Architecture

## MVP Architecture

Frontend:
- Next.js (Dashboard + Stock page)

Backend:
- FastAPI

Database:
- Postgres (or SQLite for MVP)

Data:
- Polygon API (price data)

---

## Flow

User → UI → Backend → Evaluator → DB → UI

---

## Components

1. Thesis Storage
2. Price Data Service
3. Thesis Evaluator (core logic)
4. Explanation (LLM)

---

## Design Principles

- Keep logic deterministic
- Minimize LLM calls
- Ensure fallback behavior
- Maintain explainability
