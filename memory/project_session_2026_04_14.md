---
name: Session 2026-04-14 Backlog Progress
description: All P0-P4 backlog items completed in this session — what was done and current state
type: project
---

## Session summary (2026-04-14)

22 of 30 action items completed. All P0/P1/P2/P3 bugs fixed. 4 of 5 P4 features shipped.

**Why:** Systematic backlog clearance before public launch.
**How to apply:** The remaining 8 items are P4 (5 groups x 2 points constraint) and P5 medium-term items.

### Completed this session

**P0 Security (done previously, confirmed):**
- S1: SECRET_KEY warning on startup
- S2: Base64 share tokens replaced with UUID

**P1 Correctness:**
- B1: Evaluation history .desc() sort fixed
- B2: `recovered` semantics fixed (not in cur_broken)
- B3: Streaming SSE fixed — no longer buffers, uses BackgroundTasks for DB persist
- B4: `price_30d_ago` renamed to `price_22trading_days_ago`

**P1 Silent Data:**
- T1: Scheduler now loads per-user investor profiles before nightly eval
- T2: Thesis generator now accepts `existing_statements` to prevent near-duplicates

**P2 Architecture:**
- A1: `get_investor_profile()` centralized to `backend/app/core/utils.py`
- A2: `Evaluation.parsed_broken_points` / `parsed_confirmed_points` / `parsed_frozen_breaks` properties added
- A3: N+1 portfolio eval load fixed — single subquery for latest eval per stock
- A4: FROZEN_MULTIPLIER changed from 2.0 to 1.5 (critical stays 2.0)
- A5: `SCHEDULER_ENABLED` env var guard added to prevent duplicate nightly evals on multi-worker deploy

**P3 Docs:**
- D1: scoring_algorithm.md rewritten (base 50, bidirectional, correct categories/thresholds)
- D2: agents.md updated with correct 6 category names
- D3: architecture.md updated with all 5 data sources
- D4: data_model.md updated with all thesis fields
- D5: codex_review.md fixed encoding artifacts

**P4 Features:**
- Thesis point hover breakdown: impact badge shows signal text in tooltip
- Collapsible sidebar: Portfolios section added with per-portfolio links + active indicator
- Screener shadow portfolio: localStorage tracker shows liked price vs current price + % change
- "Articulate Your Edge": text field on stock detail page, persisted to DB via `edge_statement` column

### Remaining (8 items)
- P4: 5 Groups x 2 Points default constraint (AI generation + UI settings sliders)
- P5: Beginner->Expert progression, Mobile PWA, Bulk add, In-app feedback, Outcome linkage, Quarterly PDF export
