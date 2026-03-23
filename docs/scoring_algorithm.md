# Scoring Algorithm — Stock Thesis Lens

## Overview

The scoring system answers one question: **how well is your selected investment thesis holding up against current market signals?**

A score starts at **100** and is deducted based on negative signals that contradict your selected thesis points. The score never goes above 100.

---

## Inputs

1. **Selected thesis points** — the subset of thesis bullets the user has checked (minimum 3)
2. **Price signals** — from Polygon.io: 30-day price change, day change %, volume ratio vs average, MA20 vs MA50 trend
3. **News signals** — recent headlines from Serper Google News

---

## Pipeline

```
collect_signals → interpret_signals → evaluate_thesis → explanation
```

### Step 1 — Signal Collection
Fetches two signal types for the ticker:
- **Price signals**: snapshot, 30-day aggregate, moving averages (MA20, MA50), volume ratio
- **News signals**: up to 10 recent headlines

### Step 2 — Signal Interpretation
Maps signals to specific selected thesis points. Two methods run in parallel and are merged:

**A. Deterministic price rules** (hard-coded, always consistent):

| Condition | Category targeted | Confidence |
|---|---|---|
| 30-day price drop > 10% | risks | 0.50 |
| 30-day price drop > 15% | core_beliefs, strengths | 0.70 |
| Volume spike (>2×) + day drop > 3% | strengths, leadership | 0.65 |
| MA20 < MA50 (downtrend) + growth language in statement | any | 0.50 |

**B. LLM news mapping** (GPT-4o-mini):
Each news headline is evaluated against each selected thesis statement. The LLM returns a sentiment (positive/negative/neutral) and a confidence score (0.0–1.0) for each mapping.

**Merge logic**: for each thesis point, only the single highest-confidence negative signal is kept. Duplicate or weaker signals for the same point are discarded.

### Step 3 — Evaluation (Deterministic)

Only mappings with `sentiment = "negative"` and `confidence ≥ 0.45` trigger deductions.

**Deduction formula per thesis point:**
```
deduction = CATEGORY_WEIGHT × confidence
```

**Category weights:**

| Category | Weight | Rationale |
|---|---|---|
| core_beliefs | 15.0 | Foundation of the thesis — most critical |
| risks | 12.0 | Materializing risks are high-impact |
| leadership | 10.0 | Management quality affects execution |
| strengths | 8.0 | Competitive advantages can erode slowly |
| catalysts | 5.0 | Timing-sensitive, lower structural weight |

**Final score:**
```
score = max(0, 100 - sum(all deductions))
```

**Status thresholds:**

| Score | Status | Label |
|---|---|---|
| ≥ 75 | green | Thesis Intact |
| 50–74 | yellow | Under Pressure |
| < 50 | red | Thesis Breaking |

### Step 4 — Explanation
GPT-4o-mini generates a plain-language summary of the result. No buy/sell language. Summarises which points were flagged and why.

---

## Known Limitations (current MVP)

1. **Purely deduction-based** — positive signals give zero credit. A company firing on all cylinders still scores 100 at best.

2. **Price rules don't target risks category well** — most price rules map to `strengths` and `core_beliefs`. Risk points only trigger on >10% 30-day drop.

3. **LLM confidence is uncalibrated** — GPT confidence scores are not statistically meaningful. A 0.7 confidence doesn't mean 70% probability of the signal being real.

4. **No source weighting** — a throwaway blog headline carries the same weight as a Reuters report.

5. **Single signal per thesis point** — even if 5 headlines all contradict a thesis point, only the highest-confidence one is counted.

6. **No historical trend** — score is a point-in-time snapshot. There is no "score has been declining for 3 weeks" signal.

---

## Areas to Improve (for future scoring redesign)

- **Bidirectional scoring**: base score of 50, positive signals add up to +50, negative signals subtract up to -50
- **Source credibility weighting**: tier news sources (SEC filings > earnings calls > major press > social)
- **Confidence calibration**: use multiple signals to cross-validate before applying full deduction
- **Time decay**: recent signals (last 7 days) weighted higher than older ones (30+ days)
- **Category rebalancing**: risks materialising should carry more weight than strengths eroding
- **Portfolio-level correlation**: if multiple stocks share a risk (e.g. "rising interest rates"), flag it once at portfolio level rather than independently per stock
