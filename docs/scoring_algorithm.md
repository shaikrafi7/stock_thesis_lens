# Scoring Algorithm — ThesisArc

## Overview

The scoring system answers one question: **how well is your selected investment thesis holding up against current market signals?**

Scoring is **bidirectional**: the score starts at **50** and moves up or down based on positive and negative signals. Score is clamped to `[0, 100]`.

---

## Inputs

1. **Selected thesis points** — the subset of thesis bullets the user has checked (minimum 3 required to evaluate)
2. **Price signals** — from Polygon.io: day change %, 22-trading-day price change, volume ratio vs average, MA20 vs MA50 trend
3. **News signals** — recent headlines fetched from Serper/Polygon news

---

## Pipeline

```
collect_signals → interpret_signals → evaluate_thesis → explanation
```

### Step 1 — Signal Collection
Fetches two signal types for the ticker:
- **Price signals**: snapshot, 22-trading-day aggregate, moving averages (MA20, MA50), volume ratio
- **News signals**: up to 10 recent headlines

### Step 2 — Signal Interpretation
Maps signals to specific selected thesis points. Two methods run in parallel and are merged:

**A. Deterministic price rules** (hard-coded, always consistent):

| Condition | Category targeted | Confidence |
|---|---|---|
| 22-trading-day price drop > 10% | risks | 0.50 |
| 22-trading-day price drop > 15% | competitive_moat, growth_trajectory | 0.70 |
| Volume spike (>2x) + day drop > 3% | growth_trajectory, ownership_conviction | 0.65 |
| MA20 < MA50 (downtrend) + growth language in statement | any | 0.50 |

**B. LLM news mapping** (GPT-4o-mini):
Each news headline is evaluated against each selected thesis statement. The LLM returns a sentiment (positive/negative/neutral) and a confidence score (0.0–1.0) for each mapping.

**Merge logic**: for each thesis point, only the single highest-confidence signal per direction (positive/negative) is kept.

### Step 3 — Evaluation (Deterministic)

Only mappings with `confidence >= 0.50` are applied.

**Per-thesis-point formula:**
```
effective_weight = CATEGORY_WEIGHT * importance_multiplier * conviction_multiplier
deduction = effective_weight * confidence          (negative signals)
credit    = effective_weight * confidence          (positive signals)
```

**Category weights:**

| Category | Deduction weight | Credit weight |
|---|---|---|
| competitive_moat | 8.0 | 8.0 |
| risks | 7.0 | 4.0 |
| growth_trajectory | 6.0 | 6.0 |
| valuation | 5.0 | 5.0 |
| financial_health | 5.0 | 5.0 |
| ownership_conviction | 4.0 | 4.0 |

**Importance multipliers:**

| Importance | Multiplier |
|---|---|
| standard | 1.0x |
| important | 1.5x |
| critical | 2.0x |

**Frozen multiplier:** 1.5x (committed conviction — applied instead of importance if the point is frozen)

**Conviction multipliers:** `liked` or `disliked` thesis points apply an additional 1.3x to their respective direction.

**Final score:**
```
score = clamp(50 + sum(credits) - sum(deductions), 0, 100)
```

**Status thresholds:**

| Score | Status | Label |
|---|---|---|
| >= 70 | green | Thesis Intact |
| 50–69 | yellow | Under Pressure |
| < 50 | red | Thesis Breaking |

### Step 4 — Explanation
GPT-4o-mini generates a plain-language summary of the result. No buy/sell language.

---

## Investor Profile Adjustments

If the user has completed the investor profile wizard, category weights are adjusted based on their style (value/growth/dividend/blend), time horizon, loss aversion, and risk capacity.

---

## Known Limitations

1. **LLM confidence is uncalibrated** — GPT confidence scores are not statistically meaningful.
2. **No source weighting** — a blog headline carries the same weight as a Reuters report.
3. **Single signal per thesis point** — only the highest-confidence signal per direction per point is counted.
4. **No historical trend** — score is a point-in-time snapshot.
