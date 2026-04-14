# ThesisArc — Claude Code Review

**Review date:** 2026-04-13  
**Reviewer:** Claude Sonnet 4.6 (with full codebase read)  
**Scope:** All backend agents, routers, services, models, frontend components, and docs cross-referenced against each other.

---

## Executive Summary

ThesisArc has a coherent, well-structured codebase for its stage. The agent pipeline (collect → interpret → evaluate → explain) is cleanly separated, the scoring is deterministic and auditable, and the data model is sensible. The product vision and the implementation are genuinely aligned — this is rarer than it sounds.

The gaps fall into three tiers:

1. **Correctness bugs** — a handful of real bugs causing wrong data or broken flows (price calc off-by-8, recovered semantics wrong, evaluation history returns oldest-first, streaming that doesn't stream).
2. **Security issues** — two production-blocking: hardcoded secret key, reversible share tokens. One deferred-acceptable: JWT in localStorage.
3. **Trust gaps** — things that don't crash but silently return wrong or incomplete data, undermining the credibility of the score in ways users can't see.

The codebase is not in crisis. But several issues should be fixed before any public launch or serious user growth.

---

## Confirmed Bugs (Evidence-Based)

### BUG-1: 30-day price change uses trading-day index, not calendar days
**File:** `backend/app/agents/signal_collector.py:172`  
**Code:**
```python
price_30d_ago = bars[-22]["c"] if len(bars) >= 22 else bars[0]["c"]
```
**Problem:** Polygon returns daily OHLCV bars. 22 bars back ≈ 30 calendar days (22 trading days), but the variable is called `price_30d_ago` and the signal is labeled "30-day change." The comment and semantics say 30 days; the implementation says 22 trading days. These diverge around holidays and long weekends — minor but produces slightly misleading signals.  
**Fix:** Rename variable to `price_22d_ago` / `month_change_pct` and update the signal label, or fetch bars anchored to 30 calendar days ago by date range.

---

### BUG-2: `recovered` semantics wrong in score delta
**File:** `backend/app/routers/evaluate.py:92`  
**Code:**
```python
recovered = [p for tid, p in prev_broken.items() if tid in cur_confirmed]
```
**Problem:** A thesis point is only counted as "recovered" if it moved from `broken` to `confirmed`. But a point can leave `broken` without entering `confirmed` — neutral signal, dedup merge, or a rule simply stopped firing. Users would correctly call that "no longer broken" (recovered), but the delta misses it. A point that was breaking your score last week and isn't this week should surface, even if it's not positively confirmed.  
**Fix:**
```python
recovered = [p for tid, p in prev_broken.items() if tid not in cur_broken]
```
Then optionally separate into "recovered + confirmed" vs "recovered to neutral" if you want the nuance.

---

### BUG-3: Evaluation history returns oldest-first, not latest-first
**File:** `backend/app/routers/evaluate.py:117-123`  
**Code:**
```python
.order_by(Evaluation.timestamp.asc())
.limit(limit)
```
**Problem:** `asc()` + `limit` returns the first N evaluations ever, not the most recent N. For any stock with > 20 evaluations, the score history chart shows ancient data, not recent trend. Every chart/trend view that uses this endpoint is showing wrong data.  
**Fix:**
```python
.order_by(Evaluation.timestamp.desc())
.limit(limit)
# Then reverse for charting: evaluations[::-1]
```

---

### BUG-4: Chat streaming collects entire response in memory before streaming
**Files:** `backend/app/routers/thesis.py:241`, `backend/app/routers/portfolio.py:132`  
**Pattern:**
```python
all_events = list(agent.stream(...))  # blocks until complete
for event in all_events:             # then streams what's already done
    yield event
```
**Problem:** This defeats the purpose of SSE streaming entirely. The user sees nothing for several seconds, then gets the full response. The latency benefit of streaming (first token fast) is completely lost.  
**Fix:** Yield events directly from the generator as they arrive:
```python
async for event in agent.stream(...):
    yield event
```

---

### BUG-5: Share tokens are trivially reversible (security)
**File:** `backend/app/routers/share.py:17-23`  
**Code:**
```python
def _encode(stock_id: int) -> str:
    return base64.urlsafe_b64encode(str(stock_id).encode()).decode().rstrip("=")

def _decode(token: str) -> int:
    padded = token + "=" * (-len(token) % 4)
    return int(base64.urlsafe_b64decode(padded).decode())
```
**Problem:** The share token is just `base64(stock_id)`. Anyone with one valid token can decode it to get a stock_id integer, then enumerate adjacent IDs (stock_id ± N) to access other users' private theses without auth. This is a complete read-access breach for all shared and unshared theses.  
**Fix:** Replace with a random UUID or HMAC token stored in a `share_tokens` table with `stock_id`, `created_at`, `expires_at`. The endpoint looks up by token, not by decoding.

---

### BUG-6: Hardcoded secret key (security, production-blocking)
**File:** `backend/app/core/config.py:11`  
**Code:**
```python
SECRET_KEY: str = "change-me-in-production-use-a-real-secret"
```
**Problem:** If deployed without setting `SECRET_KEY` env var, all JWTs are signed with a known public string. Any attacker can forge valid tokens for any user.  
**Fix:** Remove the default. Raise `ValueError` at startup if `SECRET_KEY` is unset or equals the placeholder:
```python
SECRET_KEY: str  # no default — must be set in environment
```
Or add a startup validator that fails loudly.

---

## Silent Trust Failures (Don't Crash, Return Wrong Data)

### TRUST-1: Portfolio returns use equal-weight average, not real returns
**File:** `backend/app/routers/portfolio.py` (returns calculation)  
**Problem:** A user with 80% NVDA and 20% AAPL sees an averaged return of (NVDA_return + AAPL_return) / 2. This can be massively misleading. Someone who doubled their portfolio on NVDA but held a small AAPL position will see understated returns.  
**Impact:** The "Conviction vs Returns" panel and portfolio return chart silently show fictional data for real portfolios.  
**Note:** This is intentional (no position data exists yet) but should be visibly labeled "equal-weight simulation" in the UI rather than presented as portfolio performance.

### TRUST-2: All agent exceptions swallowed silently
**Files:** `signal_collector.py`, `signal_interpreter.py`, `evaluation_service.py`  
**Pattern:** Every external call is wrapped in `try/except Exception: logger.warning(...); return None`. Services that call these return `None` silently.  
**Problem:** If Polygon is down, Serper is rate-limited, or yfinance returns garbage, the evaluation runs anyway — on partial data. The resulting score is presented with full confidence but is based on a fraction of the signals. Users have no visibility into data quality.  
**Fix:** Track data availability per source in the evaluation result. Surface "Data: 3/5 sources available" in the score card or show a data freshness indicator.

### TRUST-3: Thesis deduplication doesn't check against existing theses
**File:** `backend/app/agents/thesis_generator.py`  
**Problem:** Duplicate detection only runs within the newly generated batch. When regenerating or adding theses to an existing stock, the generator can produce bullets semantically identical to ones the user already has. Users end up with near-duplicate thesis points, diluting score signal.  
**Fix:** Pass existing thesis statements into the generator context. Add dedup check against them before inserting.

### TRUST-4: Scheduler runs `evaluate_all_stocks` without investor profile
**File:** `backend/app/services/scheduler.py`  
**Problem:** The nightly evaluation job calls `evaluate_all_stocks()` without passing the user's investor profile. The evaluator and interpreter use profile data (risk tolerance, style, archetype) to weight signals. Nightly evaluations produce scores using default/null profile — different from scores run manually.  
**Impact:** Score drift between manual and scheduled runs. Users who rely on morning briefing scores may see different numbers than if they manually re-evaluate.

### TRUST-5: JSON deserialization of broken_points scattered in 4 places
**Files:** `evaluate.py:85-88`, `share.py:73-79`, `portfolio.py` (multiple)  
**Problem:** `broken_points`, `confirmed_points`, `frozen_breaks` are stored as JSON strings in SQLite. The same `json.loads(raw or "[]")` pattern is duplicated 4+ times across routers. Any change to the serialization format requires hunting all sites.  
**Fix:** Add a `@property` or model method `parsed_broken_points` on the `Evaluation` model that handles deserialization once. All routers use the property.

---

## Architecture Observations

### ARCH-1: Investor profile extraction inconsistent between routers
**Files:** `backend/app/routers/thesis.py:29-43` vs `backend/app/routers/evaluate.py:18-22`  
**Problem:** Both routers extract the investor profile from the DB and pass it to agents, but they return different field sets. `evaluate.py` is missing `overconfidence_bias`, `primary_bias`, and `archetype_label` that `thesis.py` includes. Agents receiving profiles from different routers get different context.  
**Fix:** Centralize profile extraction into a shared helper function in `app/core/utils.py` or a service layer. One function, one return shape.

### ARCH-2: Frozen and Critical importance use the same multiplier (2.0x)
**File:** `backend/app/agents/thesis_evaluator.py`  
**Problem:** The evaluator applies a 2.0x multiplier to both `critical` importance and `frozen` points. This conflates two different concepts: "this point matters a lot" (importance) and "I am locked on this conviction" (frozen). A frozen standard-importance point gets the same weight as a critical unfrozen point — probably not the intended semantics.  
**Fix:** Separate the multipliers. Frozen could be 1.5x conviction boost (since user is committed) while critical importance stays 2.0x. Or document explicitly that frozen = critical for scoring purposes.

### ARCH-3: N+1 evaluation loads on portfolio page
**File:** `backend/app/routers/portfolio.py:57-79`  
**Problem:** Stocks loaded with `subqueryload(Stock.evaluations)` — this loads all evaluations for all stocks with no limit. A portfolio with 10 stocks each having 50 evaluations loads 500 evaluation rows on every portfolio page load.  
**Fix:** Add `.limit(1)` scoped subquery or use a separate batch query that fetches only the latest evaluation per stock.

### ARCH-4: Duplicate thesis check scope too narrow
**File:** `backend/app/agents/thesis_generator.py`  
**Problem:** See TRUST-3 above. The regex-based duplicate check (word overlap > 0.6 threshold) only compares within the 18 newly generated bullets, not against what's already in the DB.

### ARCH-5: APScheduler in multi-worker deployment will duplicate jobs
**File:** `backend/app/services/scheduler.py:39-40`  
**Problem:** In-process `BackgroundScheduler` starts on app lifespan. With Gunicorn/uvicorn multi-worker, each worker starts its own scheduler instance and runs the same nightly job N times (once per worker). This causes N simultaneous full portfolio evaluations, race conditions on DB writes, and N × OpenAI API costs.  
**Fix:** Move scheduled jobs to an external process (separate cron container, Celery beat, or cloud scheduler) that hits the evaluation endpoint once.

---

## Documentation Drift (Cross-Referenced)

These are inconsistencies between docs and actual code — confirmed by reading both:

| Claim in docs | Reality in code |
|---|---|
| `docs/scoring_algorithm.md`: "score starts at 100, deductions only" | `thesis_evaluator.py:85`: `base_score = 50`, bidirectional credits and deductions |
| `docs/scoring_algorithm.md`: confidence threshold 0.45 | `thesis_evaluator.py:44`: `CONFIDENCE_THRESHOLD = 0.50` |
| `docs/agents.md`: categories are `core_beliefs`, `strengths`, `leadership`, `catalysts` | Code uses: `competitive_moat`, `growth_trajectory`, `valuation`, `financial_health`, `ownership_conviction`, `risks` |
| `docs/architecture.md`: "Polygon for data" | `signal_collector.py`: Polygon + Serper + FMP + Financial Datasets + yfinance (5 sources) |
| `docs/data_model.md`: minimal thesis shape | `models/thesis.py`: includes `importance`, `frozen`, `conviction`, `source`, `sort_order`, `last_confirmed` |
| `docs/user-guide.md:317`: threshold 0.45 | Code: 0.50 |

`docs/scoring_algorithm.md` is the most misleading — it describes a fundamentally different scoring model. Any user or developer reading it to understand the score will get the wrong mental model.

---

## What the Other Reviews Missed

Both Codex and Cursor were strong. Here's what only a direct code read reveals:

**BUG-3 (evaluation history oldest-first)** — Neither review caught this. It means every score history chart is potentially showing ancient data for active users. This is arguably the most user-visible bug.

**TRUST-4 (scheduler without investor profile)** — Not mentioned in either review. Nightly auto-evaluations silently use a different scoring context than manual ones.

**ARCH-1 (investor profile field inconsistency between routers)** — Not caught. Subtle but causes evaluator to behave differently depending on which code path triggered it.

**TRUST-2 data quality visibility** — Codex and Cursor noted the exception-swallowing; neither proposed a concrete fix (surface data availability in the score card).

**BUG-4 (streaming)** — Both noted it. Confirmed: the `list(generator)` pattern is literal in both routers.

**BUG-5 (share token)** — Codex caught this. Cursor missed it.

---

## Prioritized Action Plan

### Immediate (before any public launch)
| # | Issue | File | Fix |
|---|---|---|---|
| S1 | Hardcoded secret key | `config.py:11` | Remove default; fail startup if unset |
| S2 | Share token reversible | `share.py:17-23` | Replace base64 with UUID stored in DB |
| B3 | Evaluation history oldest-first | `evaluate.py:120` | Change `asc()` → `desc()`, reverse for charts |
| B2 | `recovered` semantics wrong | `evaluate.py:92` | `tid not in cur_broken` not `tid in cur_confirmed` |

### High Priority (high user-visible impact)
| # | Issue | File | Fix |
|---|---|---|---|
| B4 | Streaming collects in memory | `thesis.py:241`, `portfolio.py:132` | `async for event in agent.stream()` |
| T2 | Silent data quality failures | All agents | Add `sources_available` field to evaluation |
| T3 | Duplicate thesis vs existing | `thesis_generator.py` | Pass existing statements to generator |
| T5 | JSON deserialization scattered | `evaluate.py`, `share.py`, `portfolio.py` | Model property `parsed_broken_points` |

### Medium Priority (architecture / trust)
| # | Issue | File | Fix |
|---|---|---|---|
| A1 | Profile extraction inconsistent | `thesis.py`, `evaluate.py` | Shared `get_investor_profile()` helper |
| T4 | Scheduler missing investor profile | `scheduler.py` | Pass user profiles to nightly eval |
| A3 | N+1 evaluation loads | `portfolio.py:57-79` | Limit subquery to latest 1 evaluation |
| A5 | Multi-worker scheduler duplication | `scheduler.py` | External cron / separate worker |
| A2 | Frozen = Critical multiplier conflation | `thesis_evaluator.py` | Separate frozen vs importance multipliers |
| B1 | 30d price calc naming | `signal_collector.py:172` | Rename to 22-trading-day or fix to calendar 30d |

### Documentation (do before any external sharing)
| # | Issue | Fix |
|---|---|---|
| D1 | `scoring_algorithm.md` describes wrong model | Rewrite to match `thesis_evaluator.py` (base 50, bidirectional, current categories, threshold 0.50) |
| D2 | `agents.md` uses old category names | Update to: competitive_moat, growth_trajectory, valuation, financial_health, ownership_conviction, risks |
| D3 | `architecture.md` omits 4 of 5 data sources | Add Serper, FMP, Financial Datasets, yfinance |
| D4 | `data_model.md` missing thesis fields | Add importance, frozen, conviction, source, sort_order, last_confirmed |

---

## What Is Working Well

- **Deterministic scoring core** — keeping the LLM out of the numeric score is the right architectural choice. The score is auditable and consistent.
- **Hybrid signal interpretation** — deterministic rules first, LLM only for news-to-thesis mapping. Degrades gracefully.
- **Audit trail** — comprehensive thesis change logging. Good foundation.
- **Graceful fallback design** — agents never crash the request. Score degrades on data unavailability rather than erroring out.
- **Conviction + importance system** — liked/disliked/frozen/critical multipliers are a thoughtful, differentiated scoring layer.
- **Evaluation delta** — the `newly_broken` / `recovered` / `newly_confirmed` structure is the right concept, just needs the semantics fix.
- **Category architecture** — 6 categories covering moat, growth, valuation, health, conviction, risks is coherent and non-overlapping.

---

## Closing Note

The codebase reflects deliberate thinking about the problem. The scoring model in particular is more sophisticated than it appears from the outside — the importance × frozen × conviction multiplier stack is genuinely interesting. The bugs that exist are bugs of rapid iteration (variable renamed, asc/desc flipped, streaming added before async generator was wired), not of design confusion.

The largest trust gap remains what both previous reviews identified: **the score needs to be bound to outcomes, evidence, and time** to cross from "thesis journal" to "investing operating system." None of the bugs above block that vision — but they should be fixed before users start trusting the score with real money.

---

*For educational and research purposes. This review reflects the codebase state as of 2026-04-13.*
