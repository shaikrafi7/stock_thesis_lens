# Codex Review: ThesisArc / Stock Thesis Lens

## Executive Summary
ThesisArc has a genuinely strong product thesis: it shifts investing from price-reaction to explicit thesis tracking. That is rare and valuable. The app already has a compelling loop (thesis -> evaluate -> explain -> review) and several differentiators (frozen convictions, audit trail intent, daily briefing, behavioral ideas).

The main gap is trust and decision-grade rigor for serious investors. Today, the tool is best seen as a high-potential thesis journal and research assistant, not yet a dependable investment operating system. To become indispensable for serious investors, it needs stronger data quality controls, portfolio realism (positions/cost basis), calibrated scoring, hardened reliability/security, and documentation consistency.

## What Is Strong Today
- Clear product wedge and identity: conviction accountability over generic portfolio tracking (`VISION.md`, `docs/product_vision.md`, `docs/soul.md`).
- Good UX concept for long-term behavior: frozen convictions, selective thesis points, trend views, morning briefings, quiz/streak mechanics.
- Explainability direction is better than most AI investing apps: explicit categories, point-level reasoning, no explicit buy/sell advice guardrail (`docs/guardrails.md`).
- Architecture is understandable and hackable for a small team: Next.js + FastAPI + modular agents (`docs/architecture.md`, `backend/app/agents/*`).
- Graceful fallback patterns exist in many places when APIs fail (several collectors/agents return empty/defaults rather than crash).
- Strong surface area already built: portfolio chat, stock chat, sharing, screener, backtest, digest, calendar, profile wizard.

## Product Weaknesses As An Investment Tool
- Portfolio math is not portfolio-realistic yet: no positions, quantity, entry price, lot-level history, or cash flows. Returns are equal-weight average by ticker, which can be materially misleading for real portfolios (`backend/app/models/stock.py`, `backend/app/routers/portfolio.py:386`).
- Score trust is still fragile for serious use: confidence scores come from LLM judgments and heuristic rules without calibration; source credibility is not weighted.
- Data provenance is weak at decision time: users often see conclusions, but not enough ranked evidence with source reliability and freshness.
- High reliance on `yfinance` and multiple live calls in request paths can create latency, transient failures, and inconsistent behavior across sessions (`backend/app/routers/portfolio.py`, `backend/app/routers/market_data.py`, `backend/app/agents/signal_collector.py`).
- The current model is mostly point-in-time. Advanced users need thesis evolution quality metrics (what changed, what predicted outcomes, what failed repeatedly).
- No explicit uncertainty/range framing. Serious investors care about confidence intervals, scenario spread, base/bull/bear probability, and assumption sensitivity.
- Sharing model currently risks private data leakage (details below), which undermines trust for serious users.

## Docs Review (Especially `docs/`)
### Strengths
- Good strategic clarity and product voice (`docs/product_vision.md`, `docs/soul.md`).
- User guide is detailed and useful for onboarding (`docs/user-guide.md`).
- Guardrails and non-goals are clearly stated.

### Weaknesses
- Documentation drift is significant and could erode user/developer trust.
- Scoring docs conflict with each other and with code:
- `docs/scoring_algorithm.md:7` says score starts at 100 and deduction-only.
- `docs/user-guide.md:279` says base score 50 with bidirectional scoring.
- Code uses base 50 (`backend/app/agents/thesis_evaluator.py:85`) and threshold 0.50 (`backend/app/agents/thesis_evaluator.py:44`), while user guide says 0.45 (`docs/user-guide.md:317`).
- Taxonomy drift in categories:
- `docs/agents.md` still references old categories like core beliefs/strengths/leadership/catalysts (`docs/agents.md:12`, `docs/agents.md:58`).
- Code uses `competitive_moat`, `growth_trajectory`, `valuation`, `financial_health`, `ownership_conviction`, `risks`.
- Architecture docs are too minimal for current complexity and omit key runtime realities (scheduler behavior, caching strategy, data dependency hierarchy).
- Several files have encoding artifacts (mojibake) that reduce professionalism/readability (`docs/scoring_algorithm.md`, `docs/agents.md`, `docs/arch_diagrams`).
- `frontend/README.md` is still boilerplate and does not explain product-specific setup/flows.

## Code Review Findings

### High Severity
1. Schema/field mismatch causing runtime failures.
- `Evaluation` model uses `timestamp`, but multiple endpoints query `evaluated_at`.
- References: `backend/app/models/evaluation.py:18`, `backend/app/routers/thesis.py:408`, `backend/app/routers/thesis.py:435`, `backend/app/routers/portfolio.py:622`, `backend/app/routers/portfolio.py:762`, `backend/app/routers/portfolio.py:805`.
- Impact: backtest/streak/overview/export paths can fail at runtime.

2. Public share tokens are reversible and guessable.
- Token is base64(stock_id), decoded directly, no signature/expiry/owner checks.
- References: `backend/app/routers/stocks.py:171`, `backend/app/routers/stocks.py:180`, `backend/app/routers/share.py:18`, `backend/app/routers/share.py:21`, `backend/app/routers/share.py:54`.
- Impact: private theses/evaluations can be enumerated by guessing IDs.

3. Default insecure secret key in config.
- `backend/app/core/config.py:11` uses a known placeholder default.
- Impact: if deployed without override, JWT security is compromised.

### Medium Severity
1. Streaming endpoints buffer full responses before sending.
- `all_events = list(...)` in stream endpoints defeats true streaming and can increase latency/memory.
- References: `backend/app/routers/thesis.py:241`, `backend/app/routers/portfolio.py:132`.

2. Scheduler can duplicate jobs in multi-worker deployments.
- In-process APScheduler starts on app lifespan; each worker may schedule the same daily job.
- References: `backend/app/services/scheduler.py:39`, `backend/app/services/scheduler.py:40`.

3. History endpoints pull oldest N, not latest N.
- `.order_by(...asc()).limit(limit)` returns early history, which is usually not what charts/trends need.
- References: `backend/app/routers/evaluate.py:120`, `backend/app/routers/portfolio.py:201`.

4. Over-reliance on synchronous external data fetches in request path.
- Many endpoints call `yfinance` per stock per request; this increases fragility and response variance.
- References: `backend/app/routers/portfolio.py:252`, `backend/app/routers/portfolio.py:388`, `backend/app/routers/portfolio.py:434`, `backend/app/routers/portfolio.py:458`.

### Frontend Quality/Build Risk
1. Lint currently fails with errors (not just warnings), so build quality gate is weak.
- Examples: `frontend/app/components/BacktestPanel.tsx:30`, `frontend/app/components/ConvictionVsReturns.tsx:23`, `frontend/app/components/EarningsCalendar.tsx:26`, `frontend/app/components/PortfolioReturns.tsx:55`, `frontend/app/context/AuthContext.tsx:45`, `frontend/app/context/PortfolioContext.tsx:51`, `frontend/app/context/ThemeContext.tsx:24`, `frontend/app/components/StockInfoPanel.tsx:246`.

2. Status label/color mismatch in backtest panel.
- UI map expects `strong/holding/pressure/risk`, backend returns `green/yellow/red`.
- Reference: `frontend/app/components/BacktestPanel.tsx:8`.

3. Stream helper may call `onDone()` twice.
- Done event and end-of-stream both call done callback.
- Reference: `frontend/lib/streaming.ts`.

## Testing & Reliability Gaps
- I could not run backend pytest in this environment due execution policy/tooling block (`pytest` unavailable; `uv run pytest` blocked by application control), so backend test health is unverified.
- Frontend lint is currently failing with 8 errors and 19 warnings.
- Several tests appear stale vs current behavior (example: thesis generator test expects up to 5 bullets per category while generator currently slices to 3).
- No evidence of robust contract tests for scoring invariants, share-link security, or data-provider failure chaos tests.

## What Would Make This Indispensable For Serious Investors

### 1) Upgrade From "Ticker List" To "True Portfolio Ledger"
- Add positions: shares, entry date, cost basis, transaction history, cash, dividends.
- Compute weighted returns, contribution, drawdown, benchmark/factor attribution.
- This single change dramatically increases practical trust and daily utility.

### 2) Make Thesis Score Audit-Grade
- Add source credibility tiers and explicit evidence cards with timestamps.
- Calibrate confidence (historical hit rates by signal type/provider).
- Add uncertainty bands and scenario outputs (base/bull/bear with probabilities).
- Track "score quality" metrics (coverage, evidence freshness, contradiction density).

### 3) Strengthen Decision Workflow
- Add pre-commit checklist before thesis acceptance.
- Add thesis change journal with rationale and expected trigger/date.
- Add review cadences and trigger-based prompts (earnings miss, guidance cut, debt spike).
- Build "decision quality dashboard": what assumptions were right/wrong over time.

### 4) Reliability + Security Hardening
- Replace share token with signed, random, expiring token scoped to explicit share grants.
- Fail startup if `SECRET_KEY` is default in non-dev.
- Move scheduled jobs to a single worker/queue system (or external cron).
- Add caching and provider fallback strategy with clear staleness labels.

### 5) Documentation As A Trust Asset
- Create one canonical scoring spec and auto-link it from UI.
- Align `docs/user-guide.md`, `docs/scoring_algorithm.md`, `docs/agents.md`, and implementation.
- Add a changelog section: "scoring changes since date" for user trust continuity.

## Prioritized Action Plan

### Next 7 Days (High ROI)
- Fix `evaluated_at` vs `timestamp` bugs in all affected endpoints.
- Patch share token security model.
- Fix frontend lint errors and restore green CI lint gate.
- Align scoring docs to current code (or vice versa) and publish a single canonical formula.

### Next 30 Days
- Implement position-aware portfolio model and weighted return math.
- Add evidence provenance + source weighting in scoring.
- Add caching layer for market/news/fundamental fetches.
- Introduce contract tests for scoring + serialization + critical endpoints.

### Next 90 Days
- Add scenario/range-based thesis stress testing.
- Build decision-quality analytics and post-mortem loop.
- Add institutional-grade export/API for thesis history, signals, and evaluation events.

## Final Take
You have a strong product core and unusually thoughtful vision for behavior-driven investing software. The opportunity is real. The gap is not idea quality, it is trust-grade execution: data quality, portfolio realism, reliability, and security. If those are addressed with urgency, ThesisArc can become a serious investor's daily operating layer rather than a useful side tool.
