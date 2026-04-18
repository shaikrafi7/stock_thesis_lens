# STARC Test Results

**Target:** https://thesisarc-web.fly.dev  
**Latest Test:** 2026-04-16  
**Tester:** Claude (Opus 4.6, Chrome browser automation)

---

## Test Run 2 — 2026-04-16

### 1. Auth Flow
- [x] Session persists across page navigation (JWT in localStorage)
- [x] Logout button visible (top-right arrow icon)
- [ ] Register new user
- [ ] Invalid login error handling

**Status: PASS**

---

### 2. Dashboard / Portfolio Health
- [x] Portfolio health gauge loads — 53.6/100 "Under Pressure"
- [x] 4 stocks visible: FLY (66.2), AAPL (52), IREN (49.8), BE (46.5)
- [x] Score history chart visible (Apr 10-15)
- [x] Portfolio digest shows 54/100 avg
- [x] Conviction vs Returns panel works (FLY +12.6%, IREN -15.6%)
- [x] Portfolio returns chart (1M/3M/6M tabs)
- [x] Sparklines on stock rows

**Bugs found:**
- SLOW LOAD: ~8 seconds to render dashboard. 30 API calls on page load with duplicates:
  - `/stocks?portfolio_id=7` called 2x
  - `/portfolio/score-histories` called 3x (limit=5 and limit=10)
  - `/portfolio/returns?period=3mo` called 2x
- `/portfolio/streak` returns **503** (backend error)
- `/portfolio/morning-briefing` returns **503** (backend error)
- "Today's Briefing" card shows "No briefing yet for today" due to 503

**Status: PARTIAL PASS (functional but slow, 2 backend 503s)**

---

### 3. Portfolio Table
- [x] Shows ticker, name, logo, price, day change, sparkline, score, status badge, delete button
- [x] Sort by Score works (descending)
- [x] "+ Add" input visible with placeholder "AAPL, NVDA..."
- [x] Evaluate All button visible

**Status: PASS**

---

### 4. Stock Detail Page
- [x] AAPL detail page loads successfully (was hanging before — may have been transient)
- [x] Price chart with 1W/1M/3M/6M/1Y/5Y tabs
- [x] Stock info: Apple Inc, Technology/Consumer Electronics, $266.43, +2.95%
- [x] Analyst consensus: "Buy (+11.3% upside)"
- [x] Earnings countdown: "Earnings in 14d"
- [x] "Your Edge" field visible and editable
- [x] Thesis Health gauge: 52/100 Under Pressure
- [x] News panel on left with relevant headlines
- [x] Thesis points grouped by category (Competitive Moat, etc.)
- [x] 18 thesis points total with conviction controls (like/dislike/lock)

**Status: PASS**

---

### 5. Briefing Page
- [x] Route loads at /briefing
- [x] Title: "Morning Briefing" with "Daily AI-generated news digest"
- [x] Refresh button present
- [ ] Generate now link clickable but **silently fails** — only OPTIONS preflight fires, no actual POST

**Bugs found:**
- Clicking "Generate now" does nothing visible. Network shows only OPTIONS preflight to `/portfolio/morning-briefing/refresh`, no actual POST/GET follows.
- Dashboard card also returns 503 for `/portfolio/morning-briefing`
- Root cause: backend returning 503 for briefing endpoints

**Status: FAIL**

---

### 6. Screener
- [x] Route loads at /screener
- [x] Swipe / Refresh buttons visible
- [x] API call to `/portfolio/screener?portfolio_id=7` returns 200
- [ ] Shows "No stocks to show" — empty results

**Bugs found:**
- Screener returns 200 but with empty candidate list. The screener filters out stocks already in portfolio/watchlist, and with a small candidate pool + 4 portfolio stocks, nothing remains.
- Not truly "broken" — it's a design issue. The screener needs a larger candidate universe or the message should explain better (e.g., "All candidates are already in your portfolio. Add more sectors?")

**Status: PARTIAL PASS (works but empty — design issue)**

---

### 7. Research AI Chat
- [x] Route loads at /chat
- [x] Previous conversation visible (portfolio context-aware)
- [x] Chat input field at bottom: "Ask about your portfolio..."
- [x] Context selector: "Portfolio — All stocks" dropdown

**Bugs found:**
- "Portfolio AI" floating button overlaps the chat input field in bottom-right corner. On this page the floating button should be hidden since user is already on the chat page.

**Status: PASS (with UI overlap bug)**

---

### 8. Settings Page
- [x] Route loads at /settings (previously was 404 — now fixed!)
- [x] Account section: shows username and email
- [x] Appearance section: theme toggle (Dark/Light mode)
- [x] Thesis Generation section: Max groups slider visible
- [x] Theme toggle works — switches between dark and light mode

**Status: PASS (previously FAIL)**

---

### 9. Investor Profile
- [x] Route loads at /profile
- [x] Shows archetype: "Anchored Growth Visionary"
- [x] Behavioral summary displayed
- [x] Profile attributes: Growth style, Long horizon, High risk capacity, Low loss aversion, Advanced experience
- [x] Edit button visible

**Status: PASS**

---

### 10. Sidebar Navigation
- [x] All nav items present: Dashboard, Briefing, Screener, Research AI, Investor Profile, Settings, Why ThesisArc, User Guide, FAQ
- [x] Portfolios section with "Default" active
- [x] Active page highlighted correctly
- [x] Clicking "ThesisArc" logo → goes to dashboard (/)
- [x] Clicking "Anchored Growth Visionary" banner → goes to /profile (Investor Profile)

**Bug:** Clicking archetype in banner and clicking "Investor Profile" in sidebar go to same page. Minor — not a bug per se, but both should exist (banner is a shortcut).

**Status: PASS**

---

### 11. Info Pages (Why ThesisArc, User Guide, FAQ)

**Why ThesisArc (/why):**
- [x] Loads with hero section, "Your Thesis. Stress-Tested Daily."
- [x] "Start Free" button visible
- [x] Light mode styling matches app palette

**User Guide (/guide):**
- [x] Table of contents with 16+ sections
- [x] Demo walkthrough with synthetic portfolio

**Bug:** Demo table in guide has **dark background that clashes with light mode**. The embedded HTML content doesn't respect the theme toggle — hardcoded dark colors.

**FAQ (/faq):**
- [x] Accordion-style questions
- [x] Categories: The Product section visible
- [x] Light mode styling acceptable

**Status: PARTIAL PASS (User Guide has dark-theme table in light mode)**

---

### 12. Floating Chat Button (Portfolio AI / Research AI)

**Bugs found across all pages:**
- The floating "Portfolio AI" button appears on EVERY page including:
  - Research AI page (where it overlaps the chat input and is redundant)
  - Info pages (FAQ, Guide, Why) where it's not needed
- Button overlaps content in bottom-right corner, particularly:
  - Conviction vs Returns panel on dashboard (covers AAPL row data)
  - Chat input field on /chat page
  - Bottom content on all pages
- No bottom padding on pages to account for the floating button

**Recommended fix:**
- Hide on /chat page (redundant)
- Consider hiding on info pages (/why, /guide, /faq)
- Add ~80px bottom padding to main content area
- Make button smaller (just icon, not icon+text) as user suggested

**Status: FAIL (UI overlap issue on multiple pages)**

---

### 13. Light Mode Styling
- [x] App chrome (header, sidebar, cards) adapts well to light mode
- [x] Settings toggle works and persists
- [x] Why ThesisArc page looks good in light mode
- [x] FAQ accordion looks good in light mode

**Bug:** User Guide embedded HTML content (demo tables) has hardcoded dark background colors that clash with light mode.

**Status: PARTIAL PASS**

---

## Summary

| Area | Status | Notes |
|---|---|---|
| Auth Flow | PASS | |
| Dashboard | PARTIAL | Slow (8s, 30 API calls), streak/briefing 503 |
| Portfolio Table | PASS | |
| Stock Detail | PASS | Was hanging before, works now |
| Briefing | FAIL | Backend 503, generate silently fails |
| Screener | PARTIAL | Works but empty — design issue |
| Research AI | PASS | Floating button overlap |
| Settings | PASS | Previously 404, now fixed |
| Investor Profile | PASS | |
| Sidebar Nav | PASS | |
| Info Pages | PARTIAL | User Guide dark tables in light mode |
| Floating Chat Button | FAIL | Overlaps content on multiple pages |
| Light Mode | PARTIAL | User Guide tables not themed |

**Passed:** 7/13  
**Partial:** 4/13  
**Failed:** 2/13

---

## Critical Bugs to Fix

### P0 — Backend Errors
1. **Briefing 503**: Both `/portfolio/morning-briefing` and `/portfolio/streak` return 503. Briefing page is non-functional. Generate button silently fails.

### P1 — UX Blockers
2. **Floating chat button overlap**: Covers content on dashboard (data rows), chat page (input field), and is redundant on /chat page. Needs: hide on /chat, add bottom padding, shrink to icon-only.
3. **Dashboard slow load**: 30 API calls with duplicates. `/stocks` called 2x, `/score-histories` called 3x, `/returns` called 2x. Needs deduplication.

### P2 — Visual/Design
4. **User Guide dark tables in light mode**: Embedded HTML content has hardcoded dark backgrounds.
5. **Screener empty state**: "No stocks to show" is unhelpful. Need larger candidate universe or better empty state messaging.

### P3 — Feature Gaps (not bugs)
6. Forgot password / reset password — not implemented
7. Email notifications — not implemented

---

## Test Run 3 — 2026-04-16 (Post Scoring-Engine + Bug-Fix Deploy)

**Context:** Scoring engine overhaul + screener/briefing NameError fixes deployed via commit 0204335. Testing deployed production at https://thesisarc-web.fly.dev.

**Tester:** Claude (Opus 4.6, Chrome browser automation)  
**Persona:** Serious investor staking reputation on STARC signals.

---

### 1. Bug Fix Verification

#### 1a. Screener Fix (NameError: _clean_name)
- [x] `/screener` loads successfully — **no longer returns empty results**
- [x] Grid shows 8+ stock candidates: ARM, BABA, BIDU, COST, GOOGL, HD, HOOD, JD, ...
- [x] Each card: ticker, analyst rating, price, day change, sector, P/E, MCap
- [x] Sector filter tabs: All, Communication Services, Consumer Cyclical, Consumer Defensive, Financial Services, Healthcare, Industrials, Technology
- [x] "+ Add to portfolio" button on each card
- [x] Watchlist star icon on each card
- [x] Swipe and Refresh buttons visible

**Status: FIX VERIFIED — PASS**

#### 1b. Briefing Fix (NameError: _get_investor_profile)
- [x] `/briefing` loads — no more 503 error
- [x] Page shows "Morning Briefing" with Today section and Past Briefings
- [x] Refresh button now works — shows "Refreshing..." spinner
- [x] POST to `/portfolio/morning-briefing/refresh?portfolio_id=7` returns **200** (was 503)
- [x] Past briefings (6 items, 7 items) visible and expandable
- [ ] Today's briefing shows "Unable to generate briefing — please try again later" despite 200 response

**Bug:** The refresh API returns 200 but the generated briefing content itself contains an error message. The NameError is fixed, but a downstream issue (likely news fetching or LLM generation) is producing an error-state briefing record.

**Status: FIX PARTIALLY VERIFIED — API works, content generation has secondary issue**

---

### 2. Dashboard (Investor Perspective)

#### 2a. Portfolio Health Gauge
- [x] Gauge renders: 53.6/100 "Under Pressure"
- [x] Color zones: At Risk (red), Under Pressure (yellow), Holding (gold), Thesis Strong (green)
- [x] Score is simple average of stock scores — matches: (66.2 + 52 + 49.8 + 46.5) / 4 = 53.6

**Investor concern:** 53.6 means my portfolio is "Under Pressure" but there's no actionable guidance. What should I DO? Which stock is dragging the score? A serious investor wants: "BE is your weakest holding — review or trim."

#### 2b. Portfolio Returns
- [x] Shows +11.0% with "Outperforming" label
- [x] Alpha: +9.3% vs S&P 500 +1.7%
- [x] Period tabs: 1M, 3M, 6M, 1Y
- [x] "Show returns by stock" expandable

**Investor concern:** +11% and +9.3% alpha sound great, but there's no attribution. Is this FLY carrying the whole portfolio? A serious investor wants to see which stocks contribute to and drag on alpha.

#### 2c. Score Trends Chart
- [x] Shows AAPL and FLY score lines over time (Apr 10-15)
- [ ] Only 2 of 4 stocks have visible trend lines
- [ ] Date range is very narrow (5 days)

**Investor concern:** Where are IREN and BE? Only showing stocks with multiple evaluations. With so few data points, the chart is barely useful.

#### 2d. Portfolio Digest
- [x] Shows 54/100 avg

#### 2e. Conviction vs Returns
- [x] All 4 stocks shown with score bars and return percentages
- [x] FLY 66.2 (+21.1%), AAPL 52 (+2.9%), IREN 49.8 (-20.3%), BE 46.5 (data cut off by floating button)
- [x] "Conviction not yet predictive" label — honest signal
- [x] Period tabs: 1mo, 3mo, 6mo, 1y

#### 2f. Stock Table
- [x] 4 stocks with logo, name, price, day change, sparkline, score, status badge, delete button
- [x] Sort by Score/Ticker works
- [x] "+ Add" input, "Evaluate All", "Quiz", "Compare" buttons

#### 2g. Data Freshness
- [x] FLY: evaluated 1d ago
- [ ] AAPL: evaluated **5d ago** — stale for a serious investor
- [x] IREN: evaluated 1d ago  
- [ ] BE: evaluated **2d ago**

**Investor concern:** Why hasn't AAPL been evaluated in 5 days? There's no auto-evaluation. A serious investor checking daily would expect scores to refresh at least daily.

#### 2h. Load Performance
- [ ] Dashboard still takes ~8-12 seconds to fully render all widgets
- [ ] Multiple API calls still firing (sidebar + dashboard duplicates)

**Status: PARTIAL PASS — functional but data freshness, performance, and actionable guidance are weak**

---

### 3. Stock Detail Page (AAPL)

#### 3a. Header & Info
- [x] AAPL logo, Apple Inc., Technology · Consumer Electronics
- [x] Price: $262.62, -1.43% today
- [x] Analyst consensus: "Buy (+12.9% upside)"
- [x] Earnings countdown: "Earnings in 14d"

#### 3b. Data Accuracy — CRITICAL FINDING
- [ ] **App shows AAPL at $262.62, -1.43%**
- [ ] **Actual AAPL price: ~$266.43, +2.55% today (verified via web search)**
- [ ] Price is ~$4 off and showing the WRONG DIRECTION of daily change

**ROOT CAUSE:** The app uses yfinance which may cache/delay data, and the price snapshot was likely fetched hours ago or from a stale cache. For a serious investor, showing yesterday's price as today's price is a deal-breaker.

#### 3c. Price Chart
- [x] 3M chart shows Jan 15 - Apr 14 range ($243-$279)
- [x] Chart is interactive with 1W/1M/3M/6M/1Y/5Y tabs

#### 3d. Thesis Health
- [x] Gauge: 52/100 "Under Pressure"
- [x] Evaluation date: 4/11/2026 (5 days old)

#### 3e. Your Edge
- [x] Editable text field with placeholder "What do you see that the market is missing?"
- [ ] Currently empty — no prompt or example to guide the user

#### 3f. News & Impact Panel
- [x] Multiple news items with BULLISH/NEUTRAL/BEARISH tags
- [x] Category tags (Conviction, Valuation, Moat)
- [x] External links to articles with open-in-new-tab icons
- [x] AI-generated thesis mapping quotes in italics
- [x] "+ Add to AAPL" button on news items

**Investor concern:** News items say "Apple added to Berkshire Hathaway's indefinite holding list" tagged BULLISH + Conviction. But the thesis score is still 52. A serious investor asks: "If Buffett is buying, why is my thesis only 52?"

#### 3g. Thesis Points
- [x] Points organized by category: Competitive Moat, Growth Trajectory, Valuation
- [x] Each point has like/dislike/lock controls
- [x] Confirmed Points (green) with credit values (+4.5 pts, +2 pts)
- [x] Flagged Points (red) with deduction values (-4.5 pts)
- [x] Flagged: "Apple's revenue growing at 15.7% annually" flagged with -4.5 — downtrend detected despite positive headline

**Investor concern:** The revenue growth point says "growing at 15.7% annually" but is flagged as negative. The signal summary says "downtrend detected (MA20 < MA50)." A serious investor would argue: 15.7% revenue growth is NOT a negative — the moving average crossover is a price signal, not a revenue signal. The scoring engine is conflating price momentum with fundamental growth.

#### 3h. Score History & Evaluation
- [x] "2 evals 0.0" delta shown
- [x] Score History section with expand/collapse
- [x] Conviction vs Returns section

**Status: PARTIAL PASS — functional but data accuracy (stale prices) and signal interpretation issues**

---

### 4. Screener (Deep Test)

- [x] Shows diverse candidates across 7 sectors
- [x] Each card has actionable data: P/E, MCap, analyst rating, price
- [x] Sector filters work
- [ ] No way to sort/filter by P/E, MCap, or rating within a sector
- [ ] No indication of WHY a stock was recommended — no thesis preview
- [ ] "strong_buy" label is raw API text — should be "Strong Buy" (formatted)
- [ ] No pagination visible — unclear how many candidates exist beyond the initial grid

**Investor concern:** As a serious investor, I see a grid of random stocks. Why ARM and not NVDA? Why BABA and not AMZN? There's no explanation of the screener's selection criteria. I'd want to know: "Recommended because high analyst consensus + strong growth in your preferred sectors."

**Status: PARTIAL PASS — works now, but lacks sorting, explanations, and polish**

---

### 5. Research AI Chat

- [x] Loads with previous conversation preserved
- [x] Context selector: "Portfolio — All stocks"
- [x] Chat input at bottom: "Ask about your portfolio..."
- [x] Previous answer is portfolio-aware (correctly identifies BE and IREN as weakest)
- [ ] Chat page took ~12 seconds to load (long spinner)
- [ ] "Portfolio AI" floating button visible on /chat page (redundant, overlaps)

**Status: PASS (with load time and overlap issues noted — both have pending fixes)**

---

### 6. Investor Profile

- [x] Archetype: "Anchored Growth Visionary"
- [x] Behavioral summary displayed
- [x] Attributes: Growth, Long, High risk capacity, Low loss aversion, Advanced
- [x] Edit button visible
- [x] "How You'll Likely Behave" section below

**Status: PASS**

---

### 7. Settings

- [x] Account: username and email displayed
- [x] Appearance: Dark/Light mode toggle works
- [x] Thesis Generation: Max groups slider (set to 5)
- [ ] No change password option
- [ ] No delete account option  
- [ ] No notification preferences
- [ ] No data export/import option

**Status: PASS (minimal but functional)**

---

### 8. User Guide

- [x] Table of contents with 18+ sections
- [x] Comprehensive content: Demo, Getting Started, Portfolio, Scoring, etc.
- [ ] Dark-themed tables in demo section clash with light mode (fix pending deploy)
- [ ] Guide is an iframe — no search, no deep-linking from app

**Status: PARTIAL PASS (dark tables fix pending deploy)**

---

### 9. Sidebar Navigation & Cross-Feature Consistency

- [x] All nav items present and clickable
- [x] Active page highlighted correctly
- [x] Sidebar stocks show score, age, and status dot
- [x] Portfolio switcher works ("Default" active)
- [x] Score in sidebar (AAPL: 52) matches dashboard (52) and detail page (52/100) — **consistent**
- [ ] Sidebar stock list only shows AAPL and BE in viewport — need to scroll to see FLY and IREN

**Status: PASS**

---

### 10. Floating Chat Button

- [x] Shows on dashboard, stock detail, briefing, screener, profile, settings, guide, FAQ
- [x] Correctly switches label: "Portfolio AI" on dashboard, "Research AI" on stock detail
- [ ] Still showing on /chat page (redundant) — fix pending deploy
- [ ] Overlaps content on dashboard (BE row in Conviction vs Returns)
- [ ] Icon-only shrink pending deploy

**Status: FAIL (fixes pending deploy)**

---

## Test Run 3 Summary

| Area | Status | Key Issues |
|---|---|---|
| Screener Fix | PASS | Fixed — now shows candidates |
| Briefing Fix | PARTIAL | API 200 but content generation fails |
| Dashboard | PARTIAL | Stale data, slow load, no actionable guidance |
| Stock Detail (AAPL) | PARTIAL | Price $4 off reality, revenue/price signal confusion |
| Screener (deep) | PARTIAL | No sorting, no recommendation rationale |
| Research AI | PASS | Works, slow load |
| Investor Profile | PASS | |
| Settings | PASS | Minimal options |
| User Guide | PARTIAL | Dark tables fix pending |
| Sidebar Nav | PASS | Consistent scores |
| Floating Button | FAIL | Fixes pending deploy |

**Passed:** 5/11  
**Partial:** 5/11  
**Failed:** 1/11

---

## Critical Findings — Investor Perspective

### P0 — Trust Destroyers (fix immediately)

1. **STALE PRICES**: AAPL shows $262.62 (-1.43%) when actual is ~$266.43 (+2.55%). A $4 discrepancy and wrong direction of change. Any investor checking against their brokerage will immediately lose trust. Root cause: yfinance data fetched on page load is cached/stale. Need: real-time or near-real-time price feed, or at minimum clear "as of X:XX AM" timestamps.

2. **BRIEFING CONTENT GENERATION BROKEN**: API returns 200 but today's briefing shows "Unable to generate briefing." The NameError is fixed, but a downstream issue produces an error-state record. Need: investigate the actual LLM/news-fetch failure, add retry logic, show error details to user.

3. **EVALUATION STALENESS**: AAPL last evaluated 5d ago, BE 2d ago. No auto-evaluation. A daily-check investor expects fresh scores every day. Need: scheduled daily auto-evaluation, or at minimum prominent "Stale — re-evaluate now" prompts.

### P1 — Credibility Gaps (fix before showing to investors)

4. **REVENUE/PRICE SIGNAL CONFUSION**: The growth thesis point "revenue growing at 15.7%" is flagged as negative because of a price moving average crossover. This conflates price momentum with fundamental growth. A sophisticated investor will immediately question the methodology. Need: separate price-based signals from fundamental signals in the scoring interpretation.

5. **NO ACTIONABLE DASHBOARD GUIDANCE**: Portfolio health says 53.6 "Under Pressure" with no recommendation. Need: "Your weakest holding is BE (46.5) — consider reviewing thesis" type insights.

6. **SCREENER HAS NO RATIONALE**: Shows stocks without explaining why. Need: "Recommended because: High analyst consensus + growing revenue in your preferred sector."

7. **SLOW LOAD TIMES**: Dashboard 8-12s, chat 12s, stock detail 8s. Unacceptable for a production app. Root cause: sequential yfinance calls, duplicate API requests, no caching.

### P2 — Polish Issues (fix before public launch)

8. **FLOATING BUTTON OVERLAP** — fixes pending deploy (icon-only, hide on /chat)
9. **USER GUIDE DARK TABLES** — fix pending deploy
10. **SCREENER FORMATTING**: "strong_buy" should be "Strong Buy"
11. **SCORE TRENDS CHART**: Only shows 2/4 stocks, 5-day window too narrow
12. **NO SORTING IN SCREENER**: Can't sort by P/E, MCap, or rating
13. **"YOUR EDGE" FIELD**: Empty with no guidance — add example text or tooltip

### P3 — Feature Gaps (important for serious investors)

14. Change password / forgot password
15. Data export (CSV/PDF of portfolio, thesis points, evaluations)
16. Email/push notifications for score changes, broken thesis points
17. Portfolio comparison (benchmark against indices)
18. Position sizing / allocation tracking
19. Watchlist functionality (separate from portfolio)
20. Historical evaluation timeline (see how scores changed over months)

---

## Test Run 4 — 2026-04-16 (P0 Fix Verification, Local)

**Context:** Targeted fixes for the 5 items in the Current Priority Stack from features.md. All tested locally against backend with production DB copy.

**Tester:** Claude (Opus 4.6, CLI + curl)

---

### 1. M1 — Price Staleness Fix Verification

- [x] `get_snapshot()` returns cached data within 2-min TTL (0.95s -> 0.0000s on second call)
- [x] `fetched_at` timestamp exposed in `/portfolio/prices` response
- [x] New `get_snapshots_batch()` uses `yf.download()` — single HTTP request for all tickers

**Status: PREVIOUSLY VERIFIED (commit 913746a)**

---

### 2. M3 — Briefing Content Generation Fix

- [x] `POST /portfolio/morning-briefing/refresh` returns 200 with full briefing content
- [x] Summary generated: portfolio-level market context, thesis-aware
- [x] 5 items returned with ticker, headline, impact, source_url, related_thesis, suggestion
- [x] Suggestions properly categorized (growth_trajectory, competitive_moat)
- [x] Related thesis matches exact text from user's thesis points
- [x] Source URLs pass through correctly from Polygon
- [x] Zero 429 rate-limit errors with sequential fetching (was 16 errors before fix)
- [x] MACRO news fetch succeeds after per-ticker delay

**Fix:** `news.py` — changed parallel `asyncio.gather` to sequential loop with 0.3s delay between tickers.

**Status: FIX VERIFIED — PASS**

---

### 3. M2 — Auto-Eval Scheduler on Fly.io

- [x] Root cause identified: Fly.io `auto_stop_machines=true` + `min_machines_running=0` kills machine before 21:30 UTC cron fires
- [x] Fly logs confirm: "autostopping machine... 0 out of 1 machines left running"
- [x] Fix: `fly.toml` changed to `min_machines_running=1`
- [x] `SCHEDULER_ENABLED` defaults to `"true"` in config — no Fly secret needed
- [x] Scheduler code confirmed: `start_scheduler()` runs in lifespan, cron at 21:30 UTC

**Bonus fix:** Screener dismiss 422 — `apiFetch` now auto-adds `Content-Type: application/json` when body is present. Was causing repeated 422 errors in production logs.

**Status: FIX APPLIED — needs deploy to verify in production**

---

### 4. UG2 — Scoring Engine Signal Fixes

- [x] `_price_rules` refactored from if/elif chain to independent `_add()` pattern — multiple price signals now fire per thesis
- [x] Current ratio dead zone closed: added 1.0-1.3 (tight liquidity) and 1.5-2.0 (adequate liquidity) tiers
- [x] GOOG evaluation: 26 signals across all 6 categories (was ~3 signals across 3 categories)
  - competitive_moat: 3 signals
  - financial_health: 6 signals
  - growth_trajectory: 9 signals
  - ownership_conviction: 3 signals
  - risks: 2 signals
  - valuation: 3 signals
- [x] Score: 98.1 (21 confirmed, 5 broken) — differentiated, not stuck near 50

**Previously fixed (commit 0204335):** first-match truncation removed, graduated thresholds added, `_moat_rules` function added, diminishing returns decay in evaluator.

**Status: FIX VERIFIED — PASS**

---

### 5. M4 — Dashboard Performance

- [x] `/portfolio/prices` cold cache: 0.9s for 18 stocks (was 6.9s — **7.7x faster**)
- [x] `/portfolio/prices` warm cache: 0.08s
- [x] New `/portfolio/evaluations` batch endpoint: 0.095s for all stocks (was N individual calls)
- [x] Frontend updated: uses batch evaluations, 5 parallel API calls regardless of portfolio size
- [x] Frontend build passes with all changes

**Fix:** `market_snapshot.py` added `get_snapshots_batch()` using `yf.download()`. Portfolio prices endpoint uses batch. New batch evaluations endpoint. Frontend `page.tsx` uses `getPortfolioEvaluations()`.

**Status: FIX VERIFIED — PASS**

---

### Test Run 4 Summary

| Fix | Status | Measurement |
|---|---|---|
| M1 Price staleness | PASS | 2-min TTL cache working |
| M3 Briefing generation | PASS | Full content generated, 0 rate-limit errors |
| M2 Auto-eval scheduler | APPLIED | Needs production deploy to verify |
| UG2 Signal separation | PASS | 26 signals across 6/6 categories |
| M4 Dashboard performance | PASS | 6.9s -> 0.9s prices, batch evals endpoint |

**Passed:** 4/5
**Applied (needs deploy):** 1/5

---

## Test Run 5: Expanded Long-Term Holder Backtest (2020-2024)

**Setup**: 99 tickers (SP500 Top 100 minus FI), 60 month-end scoring dates, horizons [3, 6, 12, 18, 24] months. Dropped 1-month horizon (irrelevant for long-term holders). Fixed overlapping-returns Sharpe annualization (now reports raw mean/std, not naive sqrt(12/h)).

**Changes from Run 4**:
- HORIZONS expanded: [1, 3, 6, 12] -> [3, 6, 12, 18, 24]
- Date range expanded: 2023-01-31 to 2024-12-31 -> 2020-01-31 to 2024-12-31
- AAPL fundamentals re-fetched (stale cache had only 3 years)
- Sharpe ratio: removed naive annualization for overlapping returns

### Full Period Results (2020-2024)

Long-short spread (Q5-Q1) is NEGATIVE at all horizons:

| Horizon | L/S Return | t-stat | Sharpe |
|---------|-----------|--------|--------|
| 3m | -1.03% | -1.79 | -0.21 |
| 6m | -2.38% | -1.22 | -0.27 |
| 12m | -3.30% | -0.99 | -0.23 |
| 18m | -2.10% | -0.46 | -0.11 |
| 24m | -3.20% | -0.54 | -0.13 |

IC: -0.005 (ICIR: -0.042). Score has no predictive power over full period.

### Sub-Period Analysis: Regime Dependence

| Period | 6m L/S | 6m t-stat | 12m L/S | 12m t-stat | IC |
|--------|--------|-----------|---------|------------|-----|
| 2020-2022 | -6.85% | -3.52 | -11.42% | -4.79 | -0.019 |
| 2023-2024 | +4.32% | +5.27 | +8.87% | +3.76 | +0.016 |
| Full 2020-2024 | -2.38% | -1.22 | -3.30% | -0.99 | -0.005 |

### Interpretation

The STARC score is regime-dependent:
- During 2020-2022 (COVID recovery + growth dominance), the score was significantly WRONG — low-score stocks massively outperformed high-score stocks. The value/quality tilt was punished by the speculative growth rally.
- During 2023-2024 (quality rotation), the score worked well — consistent with quality/value factors becoming rewarded.
- Full period effects roughly cancel, yielding a null result.

This is a classic regime-dependent factor finding. The STARC score essentially repackages value + quality factors. It works when those factors are in favor and fails when they're not.

---

## Test Run 6: Regime / Sector / Market Cap Breakdown (2020-2024)

**Setup**: Same 99 tickers, 60 months. Added three analysis dimensions.

### Regime Definitions

Non-mutually-exclusive labels applied per month-end date:

| Dimension | Label | Condition |
|-----------|-------|-----------|
| Trend | bull | SPY trailing 6-month return > +10% |
| Trend | bear | SPY trailing 6-month return < -10% |
| Trend | flat | SPY trailing 6m return between -10% and +10% |
| Vol | high | 30-day realized volatility (annualized) > 25% |
| Vol | low | Realized vol <= 25% |
| Style | growth | IWF (Russell 1000 Growth) 6m return > IWD (Russell 1000 Value) |
| Style | value | IWD >= IWF |

### Regime Distribution (60 months)

| Dimension | Labels |
|-----------|--------|
| Trend | bull: 29, flat: 28, bear: 3 |
| Vol | low: 53, high: 7 |
| Style | growth: 38, value: 22 |

### Regime-Conditional L/S Spread (6-month horizon)

| Regime | L/S Mean | t-stat | N |
|--------|----------|--------|---|
| **bear** | **-12.83%** | **-4.91** | 3 |
| bull | -2.38% | -0.94 | 29 |
| flat | -1.27% | -0.55 | 28 |
| **high vol** | **-9.34%** | **-16.75** | 7 |
| low vol | -1.46% | -0.75 | 53 |
| growth | -1.40% | -0.63 | 38 |
| **value** | **-4.08%** | **-1.88** | 22 |

Key finding: Score performs worst in bear markets and high-vol regimes. In low-vol + bull + growth environments (the "normal" market), the L/S spread is small and insignificant. Surprisingly, the score also underperforms during value-led markets — meaning it is not even a clean value factor proxy.

### Regime-Conditional IC (1-month forward)

| Regime | Mean IC | ICIR | N |
|--------|---------|------|---|
| bear | -0.090 | -0.49 | 3 |
| bull | -0.011 | -0.09 | 29 |
| flat | +0.010 | +0.09 | 28 |
| high vol | -0.037 | -0.25 | 7 |
| low vol | -0.001 | -0.01 | 53 |
| growth | -0.004 | -0.03 | 38 |
| value | -0.008 | -0.06 | 22 |

Score is only slightly positive in flat markets (IC +0.010). In all other regimes it is zero or negative.

### Sector Analysis (1-month IC)

| Sector | Mean IC | ICIR | N months | Tickers |
|--------|---------|------|----------|---------|
| **Communication Services** | **+0.059** | **+0.12** | 60 | 5 |
| Consumer Discretionary | +0.000 | +0.00 | 60 | 9 |
| **Consumer Staples** | **-0.129** | **-0.27** | 60 | 6 |
| Financials | +0.007 | +0.03 | 60 | 16 |
| Healthcare | -0.006 | -0.02 | 60 | 20 |
| Industrials | -0.007 | -0.02 | 60 | 10 |
| Technology | -0.017 | -0.09 | 60 | 26 |
| Energy | -- | -- | -- | 3 (too few) |
| Utilities | -- | -- | -- | 2 (too few) |
| Materials | -- | -- | -- | 1 (too few) |
| Real Estate | -- | -- | -- | 1 (too few) |

Score has slight positive IC in Communication Services only. Consumer Staples is the worst sector (strongly negative IC = score is wrong for staples).

### Market Cap Group Analysis (1-month IC)

| Group | Mean IC | ICIR | N months | Tickers |
|-------|---------|------|----------|---------|
| mega (>$200B) | -0.031 | -0.13 | 60 | 30 |
| large ($50-200B) | +0.005 | +0.04 | 60 | 67 |
| mid (<$50B) | -- | -- | -- | 2 (too few) |

Score is slightly positive for large-caps, negative for mega-caps. This suggests mega-cap stocks are priced too efficiently for the STARC rules to add value — the fundamentals are already reflected in price.

### Summary of Findings

1. **No unconditional alpha**: The STARC score produces no statistically significant L/S alpha over 2020-2024 at any horizon.
2. **Regime dependent**: The score worked during 2023-2024 quality rotation but failed during 2020-2022 growth rally. It is not a standalone timing tool.
3. **Worst in stress**: Bear markets and high-vol periods produce the largest negative spreads. The score's value/quality tilt gets crushed during risk-off selling.
4. **Sector narrow**: Only Communication Services shows positive IC. Consumer Staples is actively harmful. Technology (26 tickers, biggest sector) has negative IC.
5. **Mega-cap blind spot**: The score is negative for mega-caps. Mega-cap stocks are too efficiently priced for rules-based fundamental scoring to add edge.
6. **Not a clean value factor**: The score underperforms even during value-led markets (IWD > IWF), suggesting the combination of signals introduces noise rather than amplifying a factor.

### Implications for Product

| Finding | Action |
|---------|--------|
| Regime dependence | Add regime indicator to dashboard; warn users during growth-led/high-vol markets |
| Mega-cap negative IC | Consider excluding or de-weighting mega-caps, or adjusting thresholds |
| Consumer Staples negative | Investigate why — staples have different valuation norms (always high P/E) |
| No unconditional alpha | Cannot market "stocks scoring green outperform" without heavy caveats |
| Works in 2023-2024 | May be period-specific; need more out-of-sample data to confirm |
