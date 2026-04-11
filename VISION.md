# ThesisArc — Vision & Product Thinking

A running log of product decisions, philosophy, and honest assessments. Updated as we go.

---

## What ThesisArc Actually Is

Not a portfolio tracker. There are 50 apps for that.

**ThesisArc is conviction accountability.** "I believed X about this stock. Was I right? Did I act on it? Why did I deviate?" That's the wedge nobody owns. It requires users to articulate their thinking *before* they act — and that's what makes it something Robinhood or Fidelity can't replicate.

---

## Core Loop (current)

Add stock → AI generates thesis → AI evaluates → see conviction health score → morning briefing ties news to your thesis → review and update.

The loop is coherent. It's a real product, not a demo.

---

## What's Working

- The thesis→evaluation→score loop is genuinely novel for retail investors
- Morning briefing linked to *your* thesis (not generic news) is a sleeper differentiator
- Multi-portfolio + watchlist distinction shows product maturity — designed around user mental model
- Visual design is clean and credible

---

## Honest Gaps

- **AI-first thesis writing**: Power users want to write first, have AI critique — not have AI write and then edit. Guardrails before accepting AI-generated theses is the right fix.
- **No time dimension yet**: A thesis from 6 months ago that was right or wrong is invisible. Audit trail + backtesting is the missing layer that turns this from a snapshot tool into a living journal.
- **Score feels like a black box**: Users trust scores they helped construct more than scores that appeared. The methodology hint helps, but not enough.
- **Rewards having a portfolio more than thinking about one**: The Screener fixes this — engage with stocks before committing.

---

## The Moat Question

> "Anyone can replicate this with AI tools available today."

True. The features are replicable. The tech moat is zero.

**But that's not what you're protecting.** What's hard to replicate:

1. **Behavioral data network effects** — 6 months of thesis history, conviction decisions, quiz performance per user. Aggregate = dataset nobody can clone.
2. **The habit loop** — Duolingo isn't defensible because French lessons are secret. It's defensible because people have streaks they won't break. If ThesisArc becomes the weekly thesis review ritual, switching cost is the *ritual*, not the features.
3. **Distribution and trust** — First serious investing community that adopts and talks about it publicly creates a moat a cloned app can't touch.
4. **The behavioral agent** — Requires longitudinal user data to work well. A clone starting today is 6 months behind every user you already have.

**What to actually worry about more than replication:**
- Getting users to commit to writing theses at all (friction problem)
- Whether AI evaluations feel trustworthy enough to act on (trust problem)
- Retention past week 2 (habit formation problem)

The Screener + Quiz ideas attack all three.

---

## Product Ideas in the Pipeline

### Stock Thesis Screener (Tinder + Duolingo mashup)
- Swipe-style cards: stock logo, 1-liner thesis, 1/2/5yr performance, analyst rating, ThesisArc score
- Thumbs up → add to watchlist. Thumbs down → dislike + record reason.
- After N swipes: quiz recalling "why did you like X?" (spaced repetition)
- Track liked vs disliked stock performance over time — show who was right
- Creates top-of-funnel: people who've never written a thesis can start by swiping
- The behavioral data (liked stocks that tanked vs disliked that ran) shows users their own bias

### "Test How Well I Know My Stocks" Quiz
- Quiz on portfolio/watchlist/screener stocks (thesis attribution, sector, conviction reason)
- Overseeing behavioral tracking agent: observes all user actions to build *real* investor persona vs stated profile
- Duolingo-style: streaks, spaced repetition, gamified learning
- Screener → watchlist → portfolio funnel (each stage = higher conviction)

### Pricing thinking (exploratory)
- $5/month: Screener only (top-of-funnel, low commitment)
- $20/month: Full platform — thesis writing, evaluation, AI briefings, quiz, behavioral agent

---

## Duolingo Mechanics Worth Adopting

1. **Streaks** for thesis reviews — low effort, high retention
2. **Spaced repetition** for recall quizzes — surface stocks you haven't reviewed in 30+ days
3. **"You were right" moments** — celebrate when a thesis point proves out
4. **Hearts system** — lose a heart if you ignore an outdated thesis
5. **Leaderboards** — who has the best-maintained thesis in their cohort

---

## Navigation / Sidebar Direction

Top-level nav should reflect core objects a user manages:

```
Portfolio (+ inline switcher)
Watchlist
Screener          ← new
Research / Chat
Briefing
---
Settings
Help
```

Key decision: portfolios/watchlists are distinct workflows (active holdings vs discovery/monitoring). Screener becomes a third top-level section. Portfolio switcher stays where it is.

---

## What Makes This Defensible Long-Term

The behavioral agent is the most defensible idea — not because it can't be built, but because it requires *longitudinal user data* to work well. Every week a user reviews their thesis, takes a quiz, or makes a conviction decision is a week the behavioral model gets sharper.

The real question isn't "can this be copied" — it's "who's going to be 6 months ahead in behavioral data and user trust?" Right now that's ThesisArc.

---

*Last updated: 2026-04-11*
