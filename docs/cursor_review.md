# ThesisArc / Stock Thesis Lens — Cursor Review

**Review date:** 2026-04-12  
**Scope:** Product positioning as an investment tool, documentation in `docs/`, and selected backend/frontend code paths (evaluation pipeline, scoring, delta UX).

---

## Executive summary

ThesisArc (this repo) is a **conviction and thesis-accountability product**: users structure an investment case per holding, the system ingests market and text signals, maps them to those thesis bullets, and produces a **score, status, and explanation** without framing outputs as buy/sell advice. It targets **serious long-term retail investors** who want structure and reflection more than execution or day-trading signals.

**Verdict:** As an investment *thinking* and *journaling* tool, the wedge is clear and differentiated from generic portfolio trackers. As a tool whose numeric score implies **decision-grade reliability**, the product is still **under-grounded**: outcomes, calibration, and documentation parity with the codebase are the main gaps. The internal docs ([VISION.md](../VISION.md), [docs/debate.md](debate.md)) already acknowledge many of these gaps with unusual honesty; shipping to match that honesty would materially increase trust for power users.

---

## Strengths

### Product and positioning

- **Clear problem statement:** “Is my thesis still valid?” and “I forgot why I own this” are real, recurring failures for discretionary investors. [docs/product_vision.md](product_vision.md) and [VISION.md](../VISION.md) state this crisply.
- **Differentiated wedge:** Framing as **conviction accountability** (not performance reporting, not social, not brokerage) is coherent and hard to copy with a generic chat UI alone because it depends on **structured thesis objects** tied to **holdings**.
- **Behavioral ambition:** Multi-portfolio vs watchlist, streaks, briefing tied to *your* names, and roadmap ideas in [VISION.md](../VISION.md) and [docs/rafi.md](rafi.md) point toward **habit and longitudinal data**, which is where a moat could form if retention follows.

### Documentation culture

- [docs/soul.md](soul.md) and [docs/guardrails.md](guardrails.md) align product tone with **clarity, no false certainty, and no black-box scoring** as an aspiration.
- [docs/debate.md](debate.md) is a strength: it surfaces **devil’s-advocate** objections (AI-generated thesis distance, scoring without ground truth, engagement vs quarterly review, liability) and answers them. Whether or not every rebuttal holds, the document raises the bar for what the product must eventually prove.
- [docs/scoring_algorithm.md](scoring_algorithm.md) lists **known limitations** (uncalibrated LLM confidence, no source weighting, single signal per point, etc.). That transparency is appropriate for serious users—when it matches the running code (see Documentation gaps).

### Engineering and architecture

- **Multi-source signals:** [backend/app/agents/signal_collector.py](../backend/app/agents/signal_collector.py) combines Polygon (price), Serper (news), FMP/earnings utilities, SEC (insider/filings), and yfinance-backed valuation/financial/ownership blocks. This is richer than the minimal “Polygon-only” picture in [docs/architecture.md](architecture.md).
- **Hybrid interpretation:** [backend/app/agents/signal_interpreter.py](../backend/app/agents/signal_interpreter.py) applies **deterministic rules first** (price, valuation, financial health, growth, ownership, filings) and uses the LLM for **news→thesis mapping**, with merge/dedup logic so the system degrades gracefully when the LLM or APIs are unavailable.
- **Deterministic scoring core:** [backend/app/agents/thesis_evaluator.py](../backend/app/agents/thesis_evaluator.py) keeps the numeric score in code (no LLM in the scorer), with **importance**, **frozen**, **conviction**, and **investor profile** multipliers—serious investors can relate to “this point matters more” and “this assumption must not break.”
- **User-facing delta:** [backend/app/routers/evaluate.py](../backend/app/routers/evaluate.py) exposes evaluation history and a **delta** endpoint; [frontend/app/components/ScoreDelta.tsx](../frontend/app/components/ScoreDelta.tsx) surfaces “what changed,” which supports the accountability narrative better than a single static score.

---

## Weaknesses and risks

### Investment epistemology

- **Score is not validated against outcomes.** A high score is not evidence of future returns; it reflects **internal consistency between selected bullets and interpreted signals**. [docs/debate.md](debate.md) and [VISION.md](../VISION.md) both admit this. Serious investors will ask “did users who followed this framework do better?”—the product does not yet answer that.
- **LLM confidence is not statistical confidence.** [docs/scoring_algorithm.md](scoring_algorithm.md) notes this; the UI may still read as precision. Without calibration or disclosure in-product, over-trust is a risk.
- **News quality and equivalence:** Headlines are noisy, duplicated, and uneven in credibility. Equal treatment of sources (called out in scoring docs) remains a structural weakness for “serious” use.

### Product tensions

- **Engagement vs conviction cadence:** Daily briefing and frequent scoring can nudge **short-loop checking**; long-horizon thesis investing often wants **slow review**. [docs/debate.md](debate.md) argues both sides; the product should be explicit about **recommended review rhythm** and avoid anxiety-optimized defaults.
- **AI-first thesis generation:** [VISION.md](../VISION.md) notes that power users may prefer **write first, AI critiques**. If the default path is AI-generated bullets, users may anchor on machine prose without the same memory and commitment as author-written theses.

### Trust and operations

- **Bulk evaluate auto-generates theses:** [backend/app/services/evaluation_service.py](../backend/app/services/evaluation_service.py) can **generate and select thesis points** when fewer than three are selected, then evaluate. For a careful investor, silently creating conviction objects is a **trust hazard**; it should be opt-in or visibly flagged.
- **Third-party fragility:** Broad `try/except` with logging (e.g. collectors, interpreter) improves uptime but can **mask systematic outages** (bad tickers, rate limits, broken parsers). Monitoring and user-visible “data freshness” would help serious users judge score reliability.
- **yfinance dependency:** Convenient but **unofficial** and variable; institutional-grade users may discount any signal derived from it unless sourced and versioned.

### Scope limits (intentional)

- No brokerage integration and no execution layer ([docs/product_vision.md](product_vision.md))—fine for MVP, but limits “indispensable” status for users who want **one place** for position sizing and actions.

---

## Documentation gaps (high impact)

These matter because guardrails and trust depend on docs matching behavior.

| Area | Doc state | Code / product state |
|------|-----------|----------------------|
| **Scoring model** | [docs/scoring_algorithm.md](scoring_algorithm.md) describes **100 minus deductions**, deduction-only, and categories like `core_beliefs`, `strengths`, `catalysts`. | [thesis_evaluator.py](../backend/app/agents/thesis_evaluator.py) uses **base 50**, **bidirectional** credits and deductions, categories `competitive_moat`, `growth_trajectory`, `valuation`, `financial_health`, `ownership_conviction`, `risks`, and `CONFIDENCE_THRESHOLD = 0.50`. |
| **Thesis schema** | [docs/data_model.md](data_model.md) lists a minimal thesis shape. | [backend/app/models/thesis.py](../backend/app/models/thesis.py) includes `importance`, `frozen`, `conviction`, `source`, `sort_order`, `last_confirmed`, etc. |
| **Agents narrative** | [docs/agents.md](docs/agents.md) uses older category names and weight ordering. | Implementation uses the new category set and evaluator weights in code. |
| **Architecture** | [docs/architecture.md](architecture.md) emphasizes Polygon and a thin component list. | Collectors use **Polygon + Serper + FMP/earnings + SEC + yfinance**; evaluation writes **broken_points**, **confirmed_points**, **frozen_breaks** JSON on evaluations. |

**Recommendation:** Treat [docs/scoring_algorithm.md](scoring_algorithm.md) as **blocking** to update before any external methodology story or investor-facing “how we score” page is finalized.

---

## Code review: bugs, weaknesses, and improvements

### 1. `recovered` semantics in evaluation delta (bug / UX correctness)

**Location:** [backend/app/routers/evaluate.py](../backend/app/routers/evaluate.py)

`recovered` is built as thesis IDs that were in `previous.broken_points` and appear in `current.confirmed_points`. A thesis point can **leave the broken set** without appearing in **confirmed** (e.g. neutral signal, dedup merge, or rule no longer firing). Users would still reasonably call that “recovered” from pressure.

**Suggestion:** Define recovered as: was broken last run and **is not broken this run** (and optionally still list positive confirmation separately). Align copy in [ScoreDelta.tsx](../frontend/app/components/ScoreDelta.tsx) with the refined definition.

### 2. Global dedup by `signal_summary` (edge-case weakness)

**Location:** [backend/app/agents/signal_interpreter.py](../backend/app/agents/signal_interpreter.py) (`_merge_mappings` stage 2)

Collapsing on normalized `signal_summary` avoids double-counting the same narrative across thesis IDs, but two **distinct** bullets could produce identical or near-identical summaries, incorrectly retaining only one mapping.

**Suggestion:** Dedup by `(signal_summary, thesis_id)` for stage 1 outcomes, or only apply global signal dedup for **LLM-generated** duplicates with a stricter key (e.g. include headline hash).

### 3. `_format_fundamentals` revenue growth formatting (low severity)

**Location:** [signal_interpreter.py](../backend/app/agents/signal_interpreter.py) (`_format_fundamentals`)

The branch `revenue_growth < 10` assumes a particular scale (fraction vs percent). If upstream APIs ever return inconsistent units, the prompt context shown to the LLM could mislead.

**Suggestion:** Normalize `revenue_growth` to a single internal representation at collection time and format explicitly as “fraction → percent” in one place.

### 4. Evaluation keys keyed only by `thesis_id` in delta

**Location:** [evaluate.py](../backend/app/routers/evaluate.py)

Broken/confirmed dicts use `thesis_id` only. If the **same thesis row** keeps the same ID but the **statement** was edited between runs, delta semantics mix old and new wording. Low frequency but confusing.

**Suggestion:** Include stable content hash or version on thesis edits, or compare `statement` text when labeling changes.

### 5. Frontend error swallowing

**Location:** [ScoreDelta.tsx](../frontend/app/components/ScoreDelta.tsx), [ThesisOverviewPanel.tsx](../frontend/app/components/ThesisOverviewPanel.tsx)

`.catch(() => {})` / empty lists hide failures. Serious users benefit from **explicit “could not load delta”** states.

### 6. Testing

**Observation:** [backend/tests/test_evaluate.py](../backend/tests/test_evaluate.py) exists; delta edge cases (recovery without confirmation, thesis edit) merit explicit tests once semantics are fixed.

---

## Suggestions: path toward indispensable for serious investors

Prioritized by leverage for **trust**, **decision support**, and **retention**—aligned with gaps already named in [VISION.md](../VISION.md).

1. **Outcome linkage and audit trail**  
   Immutable **thesis versions** with timestamps; show **price and total return** (and optionally vs benchmark) between versions; log **why** the user changed a bullet. This converts the tool from a snapshot engine into a **journal with ground truth**.

2. **Evidence ledger per bullet**  
   For each thesis point, show **supporting artifacts**: SEC links, KPIs, dated quotes, and “last verified.” Serious investors think in **footnotes**, not scores alone.

3. **User-first thesis mode**  
   Empty canvas → user writes bullets → AI **stress-tests** (devil’s advocate, pre-mortem, “what would falsify this?”). Reduces anchor bias from generated prose.

4. **In-product methodology**  
   A **live** description of scoring that matches [thesis_evaluator.py](../backend/app/agents/thesis_evaluator.py) and interpreter rules, plus a fixed **disclaimer** that the score measures thesis–signal alignment, not expected return.

5. **Calibration and research hooks**  
   Even simple cohort stats (“after a red status, median forward 6m return was X”) or **backtest sandbox** ([VISION.md](../VISION.md)) would address the “closed loop” critique in [docs/debate.md](debate.md).

6. **Portfolio-level intelligence**  
   Detect **shared risk factors** across holdings (rates, commodity, customer concentration themes) and surface **one portfolio narrative** instead of N independent scores.

7. **Alerting with guardrails**  
   **Frozen break** and large score move notifications, worded as **review prompts** not trades—consistent with [docs/guardrails.md](guardrails.md).

8. **Export**  
   Markdown/PDF export of thesis + evaluation history for **compliance**, advisors, or personal archive.

9. **Regulatory clarity**  
   Keep marketing and in-app language aligned: scores and briefings are **informational**, not recommendations—a theme already in [docs/debate.md](debate.md).

10. **Opt-in automation**  
   Replace silent auto-thesis creation in `evaluate_all_stocks` with **explicit user consent** or a visible “draft thesis generated” state.

---

## Optional follow-ups (separate from this review file)

- Refresh [docs/scoring_algorithm.md](scoring_algorithm.md), [docs/agents.md](agents.md), [docs/data_model.md](data_model.md), and [docs/architecture.md](architecture.md) to match the current pipeline and schema.
- Add tests for `get_score_delta` recovery semantics and merge edge cases after any change to `_merge_mappings`.

---

## Closing note

The codebase and docs together show a **coherent thesis product** with a credible technical core (structured data, deterministic scoring, multiple signal types). The largest step toward being **indispensable for serious investors** is not more features per se, but **binding the score to time, evidence, and outcomes**—and keeping **documentation and UI promises** in lockstep with the implementation reviewed here.
