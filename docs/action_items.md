# ThesisArc — Action Items

Consolidated from: codex_review.md, cursor_review.md, improvements_backlog, bugs_to_fix  
Last updated: 2026-04-13

---

## P0 — Production Blockers
> Must fix before any public launch. Security vulnerabilities.

- [ ] **[S1] Remove hardcoded SECRET_KEY default** — `backend/app/core/config.py:11`  
  Add startup validator that raises `ValueError` if `SECRET_KEY` is unset or equals the placeholder. All JWTs are forgeable if env var is missing in prod.

- [ ] **[S2] Replace base64 share tokens with UUID** — `backend/app/routers/share.py:17-23`  
  Token is `base64(stock_id)` — trivially reversible, allows enumeration of any user's private theses. Create `share_tokens` table with UUID + stock_id + created_at. Endpoint looks up by UUID.

---

## P1 — Correctness Bugs
> User-visible wrong data. Fix before feature work.

- [ ] **[B1] Evaluation history returns oldest-first** — `backend/app/routers/evaluate.py:120`  
  `.order_by(Evaluation.timestamp.asc()).limit(N)` returns the first N evals ever, not the latest N. Change to `.desc()` and reverse list for charts.

- [ ] **[B2] `recovered` semantics wrong in score delta** — `backend/app/routers/evaluate.py:92`  
  `if tid in cur_confirmed` misses points that left `broken` but went neutral. Fix: `if tid not in cur_broken`. Affects ScoreDelta panel accuracy.

- [ ] **[B3] Streaming endpoints buffer full response before sending** — `backend/app/routers/thesis.py:241`, `portfolio.py:132`  
  `all_events = list(agent.stream(...))` defeats SSE. Replace with `async for event in agent.stream(): yield event`.

- [ ] **[T1] Scheduler nightly eval runs without investor profile** — `backend/app/services/scheduler.py`  
  `evaluate_all_stocks()` uses null profile weighting, producing different scores than manual runs. Load user profiles per portfolio before calling eval.

- [ ] **[T2] Thesis dedup doesn't compare against existing DB theses** — `backend/app/agents/thesis_generator.py`  
  Generator deduplicates only within the new batch. Can insert near-duplicates of existing user theses. Pass existing statements as context before inserting.

---

## P2 — Silent Data / Architecture
> Wrong results with no visible error. Performance and code quality.

- [ ] **[T3] Surface data source availability on score card** — all agent files  
  Agent failures silently return `None`; eval runs on partial data with full confidence shown. Add `sources_available: {polygon: bool, serper: bool, ...}` to eval result and show indicator in score card UI.

- [ ] **[A1] Centralize investor profile extraction** — `backend/app/routers/thesis.py:29-43` vs `evaluate.py:18-22`  
  Two routers extract different field sets. Agents get inconsistent context. Create `get_investor_profile(user, db)` helper in `backend/app/core/utils.py`.

- [ ] **[A2] Deduplicate JSON deserialization on Evaluation model** — `evaluate.py:85`, `share.py:73`, `portfolio.py` (4+ sites)  
  `json.loads(raw or "[]")` repeated everywhere. Add `parsed_broken_points` / `parsed_confirmed_points` properties on `Evaluation` model.

- [ ] **[A3] Fix N+1 evaluation load on portfolio page** — `backend/app/routers/portfolio.py:57-79`  
  `subqueryload(Stock.evaluations)` loads ALL evals for all stocks on every page load. Limit to latest 1 per stock via scoped subquery.

- [ ] **[A4] Separate Frozen vs Critical importance multipliers** — `backend/app/agents/thesis_evaluator.py`  
  Both use 2.0x, conflating "high importance" with "committed conviction." Fix: critical=2.0x, frozen=1.5x.

- [ ] **[A5] Move nightly scheduler out of app process** — `backend/app/services/scheduler.py:39-40`  
  APScheduler inside uvicorn = N workers × N nightly eval runs, race conditions, N × API cost. Use external cron or cloud scheduler.

- [ ] **[B4] Rename 30d price calc variable** — `backend/app/agents/signal_collector.py:172`  
  `bars[-22]` labeled `price_30d_ago` — 22 trading days ≠ 30 calendar days. Rename to `price_22trading_days_ago` or fix to calendar-day anchor.

---

## P3 — Documentation
> Fix before sharing docs externally. Currently misleading.

- [ ] **[D1] Rewrite `docs/scoring_algorithm.md`**  
  Describes wrong model: base 100 deductions, old categories, threshold 0.45. Actual: base 50 bidirectional, 6 categories, threshold 0.50.

- [ ] **[D2] Update `docs/agents.md` category names**  
  Still uses `core_beliefs`, `strengths`, `leadership`, `catalysts`. Actual: `competitive_moat`, `growth_trajectory`, `valuation`, `financial_health`, `ownership_conviction`, `risks`.

- [ ] **[D3] Update `docs/architecture.md` data sources**  
  Says "Polygon for data." Actual: Polygon + Serper + FMP + Financial Datasets + yfinance (5 sources).

- [ ] **[D4] Update `docs/data_model.md` thesis fields**  
  Missing fields: `importance`, `frozen`, `conviction`, `source`, `sort_order`, `last_confirmed`.

- [ ] **[D5] Fix encoding artifacts (mojibake) in docs**  
  Flagged by Codex review — check all `.md` files for garbled unicode characters.

---

## P4 — High-Impact Features (Next Sprint)

- [ ] **Thesis point hover breakdown**  
  On hover over any thesis point, show a tooltip with its score contribution (weight, multiplier, signal). Same treatment near the gauge.

- [ ] **5 Groups × 2 Points default constraint**  
  Default: max 5 groups, max 2 points per group = 10 maximally orthogonal thesis points. AI generation enforces this. User can override via Settings sliders.

- [ ] **"Articulate Your Edge" thesis field**  
  Add explicit prompt per stock: "What do you see that the market is missing?" Surfaces in morning briefing and share page as thesis headline.

- [ ] **Collapsible sidebar sections**  
  Portfolios and Watchlists as expandable sub-nav with per-portfolio/watchlist links. Screener, Quiz, Briefing as single links.

- [ ] **Screener shadow portfolio**  
  Track liked/dismissed swipes with timestamps. Show a panel: "You liked X at $Y — it's now $Z (+/- N%)". Close the feedback loop on screener decisions.

---

## P5 — Medium-Term

- [ ] **Beginner → Expert progression system**  
  Stage gating (Beginner / Intermediate / Advanced), XP system, progressive feature unlock tied to thesis quality. Multi-sprint effort — plan before building.

- [ ] **Mobile PWA**  
  Portfolio tracking on mobile. Not started.

- [ ] **Bulk add: sector dropdown / paste tickers / CSV import**  
  Three input modes for adding multiple stocks at once.

- [ ] **In-app feedback widget**  
  Contextual "?" icon per feature panel, routes to shared inbox. Low effort, high signal.

- [ ] **Outcome linkage + evidence ledger**  
  Tie each thesis bullet to the specific data signal that confirmed or broke it. Adds ground truth to scores. (Flagged by Cursor and Codex reviews.)

- [ ] **Quarterly review prompts + full PDF export**  
  Guided review flow every 90 days + PDF report generation (beyond current markdown export).
