# ThesisArc Feature Classification

**Last updated:** 2026-04-16  
**Purpose:** Prioritize work. Focus on USPs + Must Haves. Pause Nice to Haves until alpha study provides data-driven direction.

---

## USP — What Makes ThesisArc Unique

These are our moat. If these don't work brilliantly, the product has no reason to exist.

| # | Feature | Status | Notes |
|---|---|---|---|
| U1 | **Thesis-based scoring** — 6-category deterministic scoring from investor's own thesis points | Working | Overhauled in 0204335. Needs validation via alpha study. |
| U2 | **News-to-thesis mapping** — AI maps daily news to your specific thesis points, not generic sentiment | Working | Briefing + stock detail news panel. Briefing content gen has secondary bug. |
| U3 | **Conviction accountability** — like/dislike/lock thesis points, importance tagging | Working | Frozen points get 1.5x weight, liked/disliked get 1.3x modifier. |
| U4 | **Investor profile personalization** — behavioral archetype affects scoring weights | Working | Growth investors get 1.2x growth credits, risk-averse get 1.2x risk deductions. |
| U5 | **Score explainability** — every point of the score is traceable to a specific signal + thesis point | Working | Confirmed/flagged points with exact credit/deduction values shown. |
| U6 | **Evaluation delta** — "What Changed" panel shows exactly which thesis points strengthened or weakened | Working | ScoreDelta component on stock detail page. |

### USP Gaps (must fix to protect the moat)

| # | Gap | Priority | Impact |
|---|---|---|---|
| UG1 | No LLM output quality gate — thesis points, briefings, explanations have no reviewer | P1 | Users see irrelevant/low-quality AI content, undermines trust in the system |
| UG2 | Revenue/price signal confusion — scoring conflates price momentum with fundamental signals | P1 | Sophisticated investors will immediately question methodology |
| UG3 | Alpha validation unknown — we don't know if the scoring methodology actually predicts returns | P0 | The entire product premise is unvalidated. Study is the #1 priority. |

---

## Must Have — Required for Credible Product

Without these, no serious investor would use the app daily.

| # | Feature | Status | Notes |
|---|---|---|---|
| M1 | **Accurate, timely prices** | Broken | Shows prices $4 off reality. yfinance caching/staleness. Need real-time feed or clear timestamps. |
| M2 | **Auto-evaluation freshness** | Partial | Scheduler exists (daily 4:30 PM ET) but evaluations still going stale (AAPL 5d old). Verify scheduler is running on Fly.io. |
| M3 | **Working briefing generation** | Partial | API returns 200 but content says "Unable to generate." Downstream LLM/news failure. |
| M4 | **Reasonable load times** | Broken | 8-12s dashboard, 12s chat. Sequential yfinance calls, duplicate API requests. |
| M5 | **Actionable dashboard guidance** | Missing | Score says "Under Pressure" but gives no next steps. Need "Review BE — your weakest holding." |
| M6 | **LLM output quality gate** | Missing | Add evaluator agent that checks thesis relevance, briefing accuracy, explanation clarity before showing to user. |
| M7 | **Screener rationale** | Missing | Shows random stocks with no explanation. Need "Recommended because: high analyst consensus + your preferred sector." |
| M8 | **Login/register/auth** | Working | JWT-based. |
| M9 | **Portfolio CRUD** | Working | Add/remove stocks, multiple portfolios, watchlist. |
| M10 | **Thesis generation + management** | Working | Preview, confirm, edit, reorder, delete, audit trail. |
| M11 | **Stock detail with chart** | Working | Price chart, info panel, thesis points, news, evaluation. |
| M12 | **Score history + trends** | Working | Per-stock and portfolio-level trend charts. |

---

## Nice to Have — Defer Until After Alpha Study

These add value but won't make or break the product. Revisit after study results inform what to build next.

| # | Feature | Status | Notes |
|---|---|---|---|
| N1 | True SSE streaming for chat | Partial | Currently buffers entire response. Works but adds latency. |
| N2 | Position sizing / allocation tracking | Missing | Portfolio returns are equal-weighted. No position sizes stored. |
| N3 | Change password / forgot password | Missing | |
| N4 | Email/push notifications | Missing | Score changes, broken thesis alerts, briefing ready. |
| N5 | Portfolio benchmark comparison | Partial | Returns vs SPY exists. No custom benchmark. |
| N6 | Quiz gamification | Working | Random thesis-ticker matching quiz. |
| N7 | Streak tracking | Partial | Endpoint has latent bug (evaluated_at vs timestamp column name). |
| N8 | CSV export | Working | `GET /portfolio/export/csv` |
| N9 | Public thesis sharing | Working | UUID token system, `/share/[token]` route. |
| N10 | Screener sorting/filtering | Missing | Can't sort by P/E, MCap, rating within sector. |
| N11 | Screener swipe mode | Working | Tinder-style swipe with shadow portfolio in localStorage. |
| N12 | Portfolio comparison modal | Working | Compare avg scores across portfolios. |
| N13 | Thesis templates | Working | Pre-built templates to seed generation. |
| N14 | Dark/light theme | Working | Toggle persists to localStorage. |
| N15 | Onboarding guide | Working | First-run empty-state education. |
| N16 | Data export (PDF reports) | Missing | |
| N17 | Historical backtest panel | Partial | Only has data from user's first evaluation forward. No synthetic historical data. |
| N18 | Watchlist as separate view | Partial | Toggle exists per stock, excluded from screener, but no dedicated watchlist page. |
| N19 | Mobile responsiveness | Unknown | Not tested on mobile viewports. |
| N20 | Earnings calendar widget | Working | Next 60 days of earnings + ex-dividend dates. |

---

## LLM-Powered Features (all need quality gate)

| Feature | Agent | Quality Gate? |
|---|---|---|
| Thesis generation | thesis_generator.py | NO |
| Morning briefing | morning_briefing_agent.py | NO |
| Score explanation | explanation_agent.py | NO |
| Per-stock chat | thesis_chat_agent.py | NO |
| Portfolio chat | portfolio_chat_agent.py | NO |
| Investor profile | investor_profile router | NO |
| News-to-thesis mapping | signal_interpreter.py (LLM path) | NO |

**Action needed:** Add an evaluator/reviewer step for at minimum: thesis generation, briefing generation, and news-to-thesis mapping. These are user-facing and directly affect trust.

---

## Current Priority Stack

### Now (before alpha study)
1. **Fix price staleness (M1)** — trust destroyer
2. **Fix briefing content generation (M3)** — core USP broken
3. **Verify auto-eval scheduler on Fly.io (M2)** — may already work
4. **Separate price vs fundamental signals (UG2)** — methodology credibility
5. **Dashboard performance (M4)** — 8-12s is unacceptable

### Next (during alpha study)
6. **LLM quality gate / evaluator agent (M6/UG1)** — design alongside study
7. **Actionable dashboard guidance (M5)** — "Review your weakest holding"
8. **Screener rationale (M7)** — "Why this stock"

### After study results
9. Revisit Nice to Haves based on what the study reveals
10. If alpha is real: double down on USPs, add position tracking
11. If alpha is weak: redesign scoring based on study findings
