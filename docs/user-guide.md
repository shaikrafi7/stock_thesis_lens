# ThesisArc User Guide

A complete guide to using ThesisArc — your personal investment thesis tool.

ThesisArc helps you build, track, and stress-test your investment thesis for every stock you own. You're always in control — AI assists with drafting and interpreting signals, but every thesis point, every edit, every decision is yours.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Managing Portfolios](#2-managing-portfolios)
3. [Adding Stocks](#3-adding-stocks)
4. [Understanding the Dashboard](#4-understanding-the-dashboard)
5. [Morning Briefing](#5-morning-briefing)
6. [Stock Detail Page](#6-stock-detail-page)
7. [Thesis Management](#7-thesis-management)
8. [How Scoring Works](#8-how-scoring-works)
9. [AI Assistant](#9-ai-assistant)
10. [Tips & Best Practices](#10-tips--best-practices)

---

## 1. Getting Started

### Creating an Account

Navigate to ThesisArc and click **Sign Up**. Enter your email, choose a username, and set a password (minimum 6 characters). You'll be automatically logged in after registration.

### Logging In

Use the **Sign In** tab to enter your email and password. Your session persists until you log out or your token expires.

### First Look

After logging in, you'll see the **Dashboard** — the central hub showing your portfolio health, stocks, and key metrics. On first use, it will be empty. Start by adding your first stock.

---

## 2. Managing Portfolios

ThesisArc supports multiple portfolios so you can organize your investments however you like.

### Your Default Portfolio

Every account starts with a **Default** portfolio. You can rename it but not delete it. All stocks you add go here unless you switch to a different portfolio.

### Creating a New Portfolio

1. Click the portfolio name in the top header bar (e.g., "Default")
2. A dropdown appears showing all your portfolios
3. Click **+ New Portfolio** at the bottom
4. Type a name and click **Add**
5. You'll automatically switch to the new portfolio

### Switching Portfolios

Click the portfolio name in the header and select any portfolio from the dropdown. The entire dashboard — stocks, scores, briefings, returns — updates to reflect the selected portfolio.

### Deleting a Portfolio

Hover over a non-default portfolio in the dropdown and click the trash icon. This permanently removes the portfolio and all its stocks, theses, and evaluations.

> The Default portfolio cannot be deleted.

---

## 3. Adding Stocks

### Single Stock

In the **Portfolio Stocks** section of the dashboard, type a ticker symbol (e.g., `AAPL`) in the input field and click **+ Add**.

When you add a stock, ThesisArc:
1. Looks up the company info (name, sector, logo)
2. Generates an initial thesis draft with ~18 points across 6 categories
3. Runs an initial evaluation and score

**Important**: The generated thesis is a starting point — you should review, edit, and customize it to reflect your actual investment reasoning.

### Multiple Stocks

Enter comma-separated tickers: `AAPL, NVDA, MSFT`. Each stock is added and evaluated sequentially.

### Removing a Stock

In the stocks table, click the trash icon on the stock's row. The stock and all its thesis data are removed from the portfolio.

---

## 4. Understanding the Dashboard

### Portfolio Thesis Health Gauge

The large semicircle gauge at the top shows your portfolio's average thesis score on a 0-100 scale.

| Zone | Score Range | Meaning |
|------|------------|---------|
| At Risk | 0 – 40 | Multiple thesis points broken, thesis is failing |
| Under Pressure | 40 – 60 | Some thesis points weakening, needs attention |
| Holding | 60 – 80 | Thesis mostly intact, minor concerns |
| Thesis Strong | 80 – 100 | Thesis well-supported by market data |

The portfolio score is the simple average of all individual stock scores.

### Portfolio Stocks Table

A sortable list of all stocks in your active portfolio, showing:

- **Logo & Ticker** — click to open the stock detail page
- **Company Name** — full company name
- **Sparkline** — 1-year price trend at a glance
- **Score** — latest thesis evaluation score (X/100)
- **Freshness** — how recently the stock was evaluated (green = fresh, yellow = aging, red = stale)
- **Trend** — score direction since last evaluation (arrow up/down/flat)
- **Status Badge** — green (strong), yellow (pressure), red (at risk)

Click **Ticker** or **Score** headers to sort ascending/descending.

### Sector Breakdown

A donut chart showing which sectors your portfolio covers. Each sector lists the tickers within it.

### Portfolio Returns

Compares your portfolio's performance against the S&P 500 benchmark:

- **Period selector**: 1M, 3M, 6M, 1Y
- **Return gauge**: visual representation of your portfolio return
- **Dollar equivalent**: shows what $10K would be worth
- **Alpha**: the difference between your return and the benchmark
- **Per-stock breakdown**: expand to see individual stock returns

### Evaluate All

Click **Evaluate All** in the sidebar or above the stocks table to re-evaluate every stock in your portfolio at once. Results show how many were evaluated, skipped (no thesis), or errored.

---

## 5. Morning Briefing

The Morning Briefing is a daily summary of news relevant to your portfolio stocks, filtered and organized so you can get up to speed in 30 seconds.

### What It Shows

- **Summary** — a brief overview of the day's market narrative for your holdings
- **News Items** — individual stories tagged by ticker and impact:
  - **Bullish** (green) — positive for your thesis
  - **Bearish** (red) — potentially damaging to your thesis
  - **Neutral** (gray) — informational, no clear thesis impact
- **Source links** — click to read the full article
- **Thesis suggestions** — some items suggest a thesis point you can review and add with one click

### Refreshing

Click the refresh button to generate a new briefing based on the latest news. The briefing is cached daily — refreshing forces a new generation.

### History

Expand the history section below the current briefing to see past briefings (up to 7 days). Useful for catching up after a weekend.

---

## 6. Stock Detail Page

Click any stock ticker from the dashboard to open its detail page.

### Stock Info Panel (Left Side)

- **Company name, sector, and industry**
- **Current price** with period return percentage
- **Analyst recommendation** — Buy/Hold/Sell badge with upside/downside percentage
- **Interactive price chart** — select period (1W, 1M, 3M, 6M, 1Y, 5Y)
  - Green chart = positive return, Red chart = negative return
  - Hover for exact price at any date

### Key Metrics

Expandable section with detailed company data:

- **Overview**: Market cap, beta, 52-week range, institutional ownership, short interest
- **Analyst Consensus**: Rating, analyst count, price target, upside %, target range (low-median-high)
- **Valuation & Earnings**: P/E (trailing & forward), PEG ratio, P/B, EPS, profit margin, revenue growth
- **Dividend**: Yield and ex-dividend date

Click the settings gear to toggle which metrics are visible.

### Score History Chart

An area chart showing how the stock's thesis score has changed over time. Shows evaluation count and trend direction.

### Stock News

Recent headlines relevant to this stock, grouped by date (Today, Yesterday, etc.), with impact tags and source links.

---

## 7. Thesis Management

The thesis is the core of ThesisArc. It's a structured set of statements about why you own (or are considering) a stock. **You have complete control** over what goes into your thesis.

### Six Categories

| Category | What It Covers |
|----------|---------------|
| **Competitive Moat** | Brand strength, network effects, switching costs, patents |
| **Growth Trajectory** | Revenue growth, market expansion, new products |
| **Valuation** | P/E ratios, price targets, relative value |
| **Financial Health** | Cash flow, debt levels, profitability |
| **Ownership & Conviction** | Insider buying, institutional ownership, analyst consensus |
| **Risks & Bear Case** | Competition, regulation, execution risks |

### Starting Your Thesis

When you add a stock, ThesisArc generates an initial draft of ~18 thesis points. Think of this as a starting point — a research assistant doing the first pass. You should:

- **Review every point** — does it match your actual reasoning?
- **Edit points** to be more specific to your thesis
- **Delete points** that don't reflect why *you* own the stock
- **Add your own points** — your unique insights are the most valuable

### Selecting Points for Evaluation

Each thesis point has a checkbox. Only **selected** (checked) points are included when you run an evaluation. You need at least 3 selected points to evaluate.

Use **Select All / Deselect All** to toggle quickly. The counter shows "X/Y selected."

### Adding Your Own Points

Click the **+** button on any category header to add your own thesis point. Type at least 10 characters and click **Add**. Your points are marked as "manual" and preserved when you regenerate the AI draft.

### Editing Points

Hover over any point and click the pencil icon to edit its text. Click the check mark to save or X to cancel.

### Deleting Points

Hover over any point and click the X icon. Frozen points require a confirmation dialog before deletion.

### Importance Levels

Each thesis point has an importance level shown by an icon:
- No icon = **Standard** (1x weight)
- Star icon = **Important** (1.5x weight)
- Lightning bolt icon = **Critical** (2x weight)

Higher importance means the point has more impact on your score — both when confirmed and when flagged.

### Freezing Core Convictions

This is one of ThesisArc's most important features. Click the lock icon on any thesis point to **freeze** it as a core conviction — the fundamental reason you own the stock.

Frozen points:
- **Cannot be deselected** — they're always evaluated
- **Preserved on regeneration** — your convictions survive thesis refreshes
- **Carry a 2x penalty if broken** — because if the core reason you bought the stock no longer holds, that's a serious signal
- **Trigger a red alert banner** if broken: "Core Conviction Under Pressure"

**When to freeze**: Freeze the 2-3 statements that represent *the* reason you bought the stock. Not "nice-to-haves" — the deal-breakers. If these break, you need to seriously reconsider the position.

**When NOT to freeze**: Don't freeze everything. If every point is frozen, none of them is truly a core conviction.

### Regenerating the Thesis

Click **Regenerate Thesis** to get a fresh set of AI-drafted points. This replaces the AI-generated points but preserves:
- All your **manual points** (ones you wrote yourself)
- All your **frozen points** (core convictions)

This is useful when the company's situation has changed materially and you want fresh analysis to review.

---

## 8. How Scoring Works

ThesisArc's scoring is **rules-based, transparent, and fully deterministic**. There is no hidden AI judgment in the score — you can trace every point back to a specific market signal.

### The Formula

Every stock starts with a **base score of 50** (neutral).

- Market signals that **confirm** your thesis points add **credit** (score goes up)
- Signals that **contradict** your thesis points apply **deductions** (score goes down)
- Final score is clamped between 0 and 100

```
Score = 50 + total_credits - total_deductions
```

### Category Weights

Each thesis category has a specific weight that determines how many points a confirmed or flagged signal is worth:

| Category | Credit (pts) | Deduction (pts) | Why the Difference |
|----------|-------------|-----------------|-------------------|
| Competitive Moat | +8.0 | -8.0 | Core thesis — highest impact both ways |
| Risks & Bear Case | +4.0 | -7.0 | Risks materializing hurts more than risks not materializing helps |
| Growth Trajectory | +6.0 | -6.0 | Growth signals carry meaningful weight |
| Valuation | +5.0 | -5.0 | Fair value arguments affect score moderately |
| Financial Health | +5.0 | -5.0 | Balance sheet strength is a steady factor |
| Ownership & Conviction | +4.0 | -4.0 | Insider/institutional signals are supporting evidence |

Note: Risks are asymmetric by design. A risk materializing is a bigger deal than a risk not materializing.

### Importance & Frozen Multipliers

The category weight is then multiplied by:

| Level | Multiplier | Effect |
|-------|-----------|--------|
| Standard | 1.0x | Normal weight |
| Important | 1.5x | 50% more impact |
| Critical | 2.0x | Double impact |
| Frozen | 2.0x | Double impact (overrides importance level) |

### Confidence Threshold

Each signal has a confidence score (0.0 to 1.0). Only signals with **confidence >= 0.45** affect the score. This prevents weak or ambiguous signals from moving your score.

The actual calculation per point:
```
impact = category_weight x confidence x importance_multiplier
```

### Stock-Level Example

**AAPL** with 12 selected thesis points, evaluated:

| Point | Category | Confidence | Importance | Result | Impact |
|-------|----------|-----------|------------|--------|--------|
| "Apple's ecosystem locks in customers" | Competitive Moat | 0.82 | Standard (1x) | Confirmed | +6.6 |
| "Revenue growing 5% YoY" | Growth | 0.71 | Important (1.5x) | Confirmed | +6.4 |
| "Apple has strong brand loyalty" | Competitive Moat | 0.85 | Frozen (2x) | Flagged | -13.6 |
| "P/E ratio reasonable for growth" | Valuation | 0.60 | Standard (1x) | Confirmed | +3.0 |
| ... (8 more points) | ... | ... | ... | Neutral | 0 |

**Credits**: +6.6 + 6.4 + 3.0 = +16.0
**Deductions**: -13.6
**Score**: 50 + 16.0 - 13.6 = **52.4** (Under Pressure, yellow)

Notice how the single frozen break (-13.6) nearly wiped out all the credit from three confirmed points. That's the power of core convictions — when they break, the score reflects it clearly.

### Portfolio-Level Scoring

Your portfolio health score is the **simple average** of all individual stock scores.

**Example**: Portfolio with 3 stocks:
| Stock | Score |
|-------|-------|
| AAPL | 52.4 |
| NVDA | 81.2 |
| MSFT | 68.0 |

**Portfolio Score**: (52.4 + 81.2 + 68.0) / 3 = **67.2** (Holding)

### Score Zones

| Score | Status | What It Means |
|-------|--------|--------------|
| 75 – 100 | Thesis Strong (green) | Market data broadly supports your thesis |
| 50 – 74 | Under Pressure (yellow) | Some thesis points weakening, worth reviewing |
| 0 – 49 | At Risk (red) | Multiple thesis points broken, reconsider your thesis |

### What Triggers Scoring Signals

Signals come from two sources:

**1. Deterministic market rules** (always consistent):
- Price momentum (30-day trends, MA20 vs MA50)
- Valuation metrics (P/E, PEG, analyst targets vs current price)
- Financial health (debt ratios, margins, cash flow)
- Growth metrics (revenue growth, EPS trajectory)
- Ownership data (short interest, institutional ownership, analyst consensus)

**2. News interpretation**:
- Recent headlines are mapped to your specific thesis points
- Each mapping includes a sentiment (positive/negative/neutral) and confidence score
- Only high-confidence mappings (>= 0.45) affect your score

### Evaluation Results Display

After evaluation, you can expand two sections:

**Confirmed Points** (green): Shows each confirmed thesis point with the supporting market signal and points awarded.

**Flagged Points** (red): Shows each flagged thesis point with the contradicting evidence and points deducted.

If any **frozen** points are flagged, a red alert banner appears: **"Core Conviction Under Pressure"** — this is the most important signal ThesisArc produces.

---

## 9. AI Assistant

ThesisArc includes a conversational assistant accessible via the floating button in the bottom-right corner. The assistant helps you research and think through your thesis — it suggests, you decide.

### Two Modes

**Research AI** (when viewing a stock detail page):
- Context-aware conversations about the specific stock
- Can suggest thesis points for you to review and add
- Can trigger evaluations
- Example prompts:
  - "What's the biggest risk for this stock?"
  - "Suggest a growth catalyst"
  - "How does the valuation compare to peers?"

**Portfolio AI** (when on the dashboard):
- Conversations about your entire portfolio
- Can suggest adding or removing stocks
- Can suggest thesis points for any stock
- Example prompts:
  - "Which stock is weakest right now?"
  - "Add Microsoft to my portfolio"
  - "Suggest a risk point for NVDA"

### Acting on Suggestions

When the assistant suggests a thesis point or portfolio action, a card appears with:
- The suggested action/point
- An **Add** or **Confirm** button
- A **Dismiss** button

Nothing happens automatically — you review and decide.

### Chat History

Conversations are saved per-stock and per-portfolio. When you return, your previous conversation is restored.

---

## 10. Tips & Best Practices

### Build a Thesis That Reflects YOUR Reasoning

- **Be specific**: "Revenue growing 15% YoY driven by cloud expansion" is better than "Company is growing"
- **Cover all categories**: A thesis with only growth points ignores risk
- **Write your own points**: The AI draft gets you started, but your insights are what make the thesis yours
- **Review and edit**: Don't just accept the generated thesis — make it reflect why *you* own the stock

### Use Freezing Strategically

- Freeze only your **true core convictions** — the 2-3 reasons you'd never sell
- A frozen break is the strongest signal ThesisArc produces
- Don't freeze everything — it defeats the purpose
- If a frozen point breaks, take it seriously — it's not a suggestion, it's evidence

### Stay Consistent

- **Check the Morning Briefing daily** — 30 seconds keeps you informed
- **Re-evaluate weekly** — scores change as market conditions evolve
- **Act on red flags** — if a stock stays "At Risk" across multiple evaluations, revisit your thesis honestly
- **Track your score history** — look for trends, not single data points

### Organize with Portfolios

- Separate **core holdings** from **speculative positions**
- Use descriptive names: "Retirement Core", "Tech Growth", "Earnings Plays"
- Each portfolio gets its own briefing and scoring — keep them focused
