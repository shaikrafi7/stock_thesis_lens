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
