# ThesisArc

**The arc of conviction, stress-tested daily.**

A personal investment thesis tool that keeps you honest about why you own every stock in your portfolio.

---

## The Problem

You bought a stock for good reasons. But over time, those reasons get buried under market noise, price swings, and conflicting headlines.

- You forget why you bought it
- You react emotionally to price drops
- You get overwhelmed by conflicting news
- You hold losers too long and sell winners too early

The core issue: there's no structured way to track whether your original reasons for buying still hold true.

---

## What ThesisArc Does

ThesisArc gives you a framework to write, organize, and stress-test your investment thesis — for every stock you own.

**You define the thesis. You choose what matters. You decide what to act on.** AI is there to assist — generating initial thesis drafts, interpreting market signals, surfacing relevant news — but every decision stays with you.

---

## What Makes ThesisArc Different

### Your Thesis, Your Rules

For every stock, you build a thesis across six categories: Competitive Moat, Growth Trajectory, Valuation, Financial Health, Ownership & Conviction, and Risks & Bear Case.

You can start from an AI-generated draft or write every point yourself. Edit any point. Add new ones. Remove what doesn't fit. The thesis is yours — AI just gets you started faster.

![Stock detail with thesis points](screenshots/stock-detail.png)

### Transparent, Rules-Based Scoring

ThesisArc doesn't give you a mysterious "AI score." The scoring is fully transparent and rules-based:

- Every stock starts at **50 points** (neutral)
- Market signals that **confirm** your thesis points add credit (+points)
- Signals that **contradict** your thesis points apply deductions (-points)
- Each category has a known weight (Competitive Moat = 8 pts, Risks = 7 pts, Growth = 6 pts, etc.)
- You can see exactly which points were confirmed, which were flagged, and what evidence was used

No black boxes. You always know *why* your score is what it is.

### Lock Your Core Convictions

This is the feature that changes how you invest. **Freeze** any thesis point to mark it as a core conviction — the fundamental reason you own the stock.

Frozen points:
- Are preserved when you regenerate the thesis
- Cannot be accidentally deselected
- Carry a **2x penalty** if broken by market evidence

When a frozen point breaks, ThesisArc shows a red alert: **"Core Conviction Under Pressure."** This is the strongest signal the system produces — if the core reason you bought the stock no longer holds, it's time to seriously reconsider.

### Daily Briefing, Filtered For You

Every day, ThesisArc scans the news and surfaces only stories relevant to *your specific holdings*. Each item is tagged with impact — bullish, bearish, or neutral — and linked to the thesis points it affects.

30 seconds. That's all it takes to stay informed.

![Morning Briefing](screenshots/morning-briefing.png)

### Multiple Portfolios

Organize investments into separate portfolios — "Core Holdings", "Tech Growth", "Speculative" — each with independent thesis tracking, scoring, and briefings. Switch between them instantly.

---

## How Scoring Works

### Stock-Level Scoring

Every evaluation follows the same transparent process:

**Step 1**: Collect market signals (price action, fundamentals, analyst data, news)

**Step 2**: Map each signal to your thesis points with a confidence score

**Step 3**: Apply rules-based scoring:

| Category | Weight (pts) | What It Means |
|----------|-------------|---------------|
| Competitive Moat | 8.0 | Highest impact — your moat thesis matters most |
| Risks & Bear Case | 7.0 | Materializing risks are heavily penalized |
| Growth Trajectory | 6.0 | Growth signals carry meaningful weight |
| Valuation | 5.0 | Fair value arguments affect score moderately |
| Financial Health | 5.0 | Balance sheet strength is a steady factor |
| Ownership & Conviction | 4.0 | Insider/institutional signals are supporting evidence |

**Step 4**: Apply importance multipliers:
- Standard points: 1x
- Important points: 1.5x
- Critical points: 2x
- Frozen (core conviction) points: 2x

**Example**: You own AAPL. Your thesis has 18 points selected. After evaluation:
- 12 points are confirmed (market supports them) = +42 credit
- 3 points are flagged (market contradicts them) = -18 deduction
- 3 points have no strong signal = no effect
- **Score: 50 + 42 - 18 = 74** (Under Pressure, yellow)

One of the flagged points was frozen: "Apple's brand loyalty creates a strong competitive moat." Frozen penalty: 8.0 pts x 0.85 confidence x 2.0 multiplier = -13.6 pts. That single core conviction break accounts for most of the deduction.

### Portfolio-Level Scoring

Your portfolio health score is the average of all individual stock scores.

**Example**: Portfolio with 3 stocks:
- AAPL: 74/100
- NVDA: 82/100
- MSFT: 68/100
- **Portfolio Score: (74 + 82 + 68) / 3 = 74.7** (Under Pressure)

---

## Your Dashboard at a Glance

![Full Dashboard](screenshots/dashboard-full.png)

In 10 seconds, you can:
- **See portfolio health** — the gauge shows your overall conviction score
- **Spot which stocks need attention** — sortable table with scores, trends, and status badges
- **Track performance** — portfolio returns vs S&P 500 with alpha calculation
- **Understand sector exposure** — visual breakdown of your holdings

---

## Built on Clarity

ThesisArc exists to help investors think clearly.

- **Clarity over complexity** — every screen answers a question, not raises ten more
- **Signal over noise** — only surface what matters to your specific holdings
- **Consistency over excitement** — daily discipline, not hot takes
- **Truth over comfort** — the score reflects reality, even when it's uncomfortable

---

## Under the Hood

- **Next.js** frontend with real-time updates
- **FastAPI** backend with async processing
- **OpenAI** for thesis drafting and news interpretation (user always reviews/edits)
- **Live market data** — prices, analyst ratings, fundamentals
- **Rules-based scoring** — deterministic, transparent, reproducible

---

## Get Started

1. Create an account
2. Add your first stock
3. Review the generated thesis — edit, add, remove points as you see fit
4. Evaluate and see your score with full transparency
5. Lock your core convictions and let ThesisArc watch them for you

**ThesisArc** — *The arc of conviction, stress-tested daily.*
