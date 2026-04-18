# ThesisArc Feature Classification

**Last updated:** 2026-04-18 (post alpha-validation null result, post v2 reframe)  
**Purpose:** Prioritize work. v2 is a behavioral-accountability tool, not a stock picker. Features are evaluated against that positioning.

---

## Product Positioning (v2)

**ThesisArc is a thesis accountability tool.** It helps retail investors write down why they own each stock, then tracks whether those reasons still hold against new evidence. It does not predict prices and does not generate alpha — our 2020-2024 backtest confirmed that. The value is behavioral: reducing disposition effect, exposing broken theses early, and journaling decision changes so users can learn from them.

**What we do NOT claim:**
- That following the conviction score produces excess returns
- That "green zone" stocks outperform "red zone" stocks
- That the product is a robo-advisor or stock picker

**What we DO claim:**
- The score measures thesis coherence (how well the reasons hold together against evidence)
- Users make better decisions when they see their thesis break in writing instead of burying it
- Journaling conviction changes creates a searchable record of decision quality over time

Copy and UI must reflect this framing everywhere. See `docs/test_results.md` Run 5-6 for the data behind the null result.

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
| UG2 | ~~Revenue/price signal confusion~~ | Fixed | Price rules refactored to independent signals; moat rules added; all 6 categories now produce signals. Graduated thresholds close dead zones. |
| UG3 | Alpha validation unknown — we don't know if the scoring methodology actually predicts returns | P0 | The entire product premise is unvalidated. Study is the #1 priority. |

---

## Must Have — Required for Credible Product

Without these, no serious investor would use the app daily.

| # | Feature | Status | Notes |
|---|---|---|---|
| M1 | **Accurate, timely prices** | Fixed | 2-min TTL cache + `fetched_at` timestamp exposed in API. Batch `yf.download()` for portfolio view. |
| M2 | **Auto-evaluation freshness** | Fixed | Root cause: Fly.io autostop killed machine before 21:30 UTC cron. Fix: `min_machines_running=1`. |
| M3 | **Working briefing generation** | Fixed | Retry logic + sequential Polygon fetching with rate-limit delays. Verified end-to-end. |
| M4 | **Reasonable load times** | Fixed | Batch price fetch (6.9s->0.9s), batch evaluations endpoint, N+5 calls reduced to 5. |
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

### Done (2026-04-16)
1. ~~Fix price staleness (M1)~~ — 2-min TTL cache + batch fetch
2. ~~Fix briefing content generation (M3)~~ — rate-limit-safe sequential fetching
3. ~~Verify auto-eval scheduler on Fly.io (M2)~~ — min_machines_running=1
4. ~~Separate price vs fundamental signals (UG2)~~ — independent price rules, moat rules, graduated thresholds
5. ~~Dashboard performance (M4)~~ — batch prices (7.7x faster) + batch evaluations endpoint

6. ~~LLM quality gate / evaluator agent (M6/UG1)~~ — quality_gate.py with keyword + pattern checks
7. ~~Actionable dashboard guidance (M5)~~ — deterministic rules for weakest holding, stale evals
8. ~~Screener rationale (M7)~~ — "Why this stock" with rating labels

### Alpha Validation Study (completed)
9. ~~Simulation harness built~~ — scorer, portfolio builder, return calculator, statistics
10. ~~Data pipeline~~ — FMP fundamentals (100 tickers, 2006-2026) + yfinance prices (2020-2025)
11. ~~Expanded backtest (Run 5-6)~~ — 99 tickers, 60 months, 5 horizons, regime/sector/cap breakdowns

### Study Results (honest null — see docs/test_results.md Run 5-6)
- **No unconditional alpha**: L/S spread negative at all horizons over 2020-2024
- **Regime dependent**: Works in 2023-2024 quality rotation, fails in 2020-2022 growth rally
- **Worst in stress**: Bear + high-vol months show -9% to -13% L/S (score is actively wrong)
- **Mega-cap blind spot**: Negative IC for mega-caps; slightly positive for large-caps
- **Sector narrow**: Only Communication Services shows positive IC; Consumer Staples strongly negative
- **Conclusion**: Score repackages value/quality factors with no novel combination alpha

### Next Steps (study-informed)
12. **Redesign scoring for regime awareness** — add market regime indicator, dynamic weight adjustment
13. **Diversify signals** — momentum and growth signals with real teeth (not just value/quality tilt)
14. **Sector-specific thresholds** — Consumer Staples, Technology need different valuation norms
15. **Honest product positioning** — cannot claim unconditional alpha; position as thesis accountability tool, not stock picker
16. Revisit Nice to Haves informed by findings above
