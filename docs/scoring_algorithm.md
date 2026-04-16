# Scoring Algorithm — STARC

## Overview

The scoring system answers one question: **how well is your selected investment thesis holding up against current market signals?**

Scoring is **bidirectional**: the score starts at **50** and moves up or down based on positive and negative signals. Score is clamped to `[0, 100]`.

---

## Inputs

1. **Selected thesis points** — the subset of thesis bullets the user has checked (minimum 3 required to evaluate)
2. **Price signals** — from Polygon.io: day/week/month change %, volume ratio vs average, MA20 vs MA50 trend, 52-week high/low
3. **Valuation signals** — P/E, forward P/E, PEG, P/S, P/B, EV/EBITDA, analyst target price
4. **Financial health signals** — D/E ratio, current ratio, ROE, gross margin, operating margin, FCF, revenue growth
5. **Fundamental signals** — EPS actual vs estimate, surprise %, revenue growth
6. **Ownership signals** — institutional %, short interest %, analyst recommendation, analyst count
7. **Insider signals** — Form 4 filing count (90-day window)
8. **Filing signals** — 8-K filing count (90-day window)
9. **News signals** — recent headlines fetched from Serper/Polygon news

---

## Pipeline

```
collect_signals → interpret_signals → evaluate_thesis → explanation
```

### Step 1 — Signal Collection
Fetches all signal types for the ticker from Polygon.io and Yahoo Finance.

### Step 2 — Signal Interpretation
Maps signals to specific selected thesis points. All rule functions run independently and results are merged.

**Multiple signals per thesis point are preserved.** Each rule that matches independently produces a `ThesisSignalMapping`. The merge step only removes exact duplicate `(thesis_id, signal_summary)` pairs.

#### A. Price rules (`_price_rules`)

| Condition | Category targeted | Sentiment | Confidence |
|---|---|---|---|
| month_change < -15% | competitive_moat, growth_trajectory | negative | 0.70 |
| month_change > +15% | competitive_moat | positive | 0.60 |
| volume > 2x + day drop > 3% | competitive_moat, ownership_conviction | negative | 0.65 |
| price near 52-week low | valuation (positive), competitive_moat (negative) | mixed | 0.50–0.60 |
| price near 52-week high | growth_trajectory | positive | 0.55 |
| month_change < -10% | risks | negative | 0.50 |
| month_change > +8% | competitive_moat, growth_trajectory | positive | 0.45 |
| month_change < -8% | competitive_moat, growth_trajectory | negative | 0.45 |
| week +5% and month +3% | growth_trajectory | positive | 0.40 |
| week -5% and month -3% | competitive_moat, risks | negative | 0.40 |
| MA20 < MA50 + growth keywords | any | negative | 0.50 |

#### B. Valuation rules (`_valuation_rules`)

All rules target the `valuation` category. Multiple rules fire independently.

| Condition | Sentiment | Confidence |
|---|---|---|
| P/E > 40 and PEG > 2.5 | negative | 0.65 |
| P/E > 30 and PEG > 2.0 | negative | 0.50 |
| PEG < 1.0 | positive | 0.60 |
| P/E < 15 | positive | 0.55 |
| 15 <= P/E <= 20 and PEG < 1.5 | positive | 0.50 |
| EV/EBITDA > 25 | negative | 0.50 |
| EV/EBITDA < 10 | positive | 0.50 |
| P/B > 10 | negative | 0.45 |
| P/B < 1.5 | positive | 0.50 |
| price > 20% above analyst target | negative | 0.55 |
| price > 20% below analyst target | positive | 0.55 |

#### C. Financial health rules (`_financial_health_rules`)

All rules target the `financial_health` category. Multiple rules fire independently.

| Condition | Sentiment | Confidence |
|---|---|---|
| D/E > 200% | negative | 0.65 |
| 100% < D/E <= 200% | negative | 0.40 |
| 50% <= D/E <= 100% | positive | 0.40 |
| D/E < 50% | positive | 0.55 |
| current_ratio < 1.0 | negative | 0.55 |
| current_ratio > 2.0 | positive | 0.45 |
| FCF < 0 | negative | 0.60 |
| FCF margin > 15% | positive | 0.60 |
| ROE > 20% | positive | 0.55 |
| ROE < 0 | negative | 0.55 |
| gross_margin > 60% | positive | 0.50 |
| gross_margin < 20% | negative | 0.50 |

#### D. Growth trajectory rules (`_growth_rules`)

All rules target the `growth_trajectory` category. Multiple rules fire independently.

| Condition | Sentiment | Confidence |
|---|---|---|
| revenue growth > 20% | positive | 0.65 |
| 10% <= revenue growth <= 20% | positive | 0.50 |
| 0% < revenue growth < 5% | negative | 0.40 |
| revenue growth < 0% | negative | 0.65 |
| revenue growth < 5% (stalling) | negative | 0.50 |
| Rule of 40 > 40 | positive | 0.60 |
| Rule of 40 < 20 | negative | 0.55 |
| EPS beat > 10% | positive | 0.55 |
| EPS beat 5–10% | positive | 0.45 |
| EPS miss > 10% | negative | 0.55 |
| EPS miss 5–10% | negative | 0.45 |

#### E. Competitive moat rules (`_moat_rules`)

All rules target the `competitive_moat` category. These are quantitative proxies for moat strength.

| Condition | Sentiment | Confidence |
|---|---|---|
| gross_margin > 60% | positive | 0.60 |
| 40% < gross_margin <= 60% | positive | 0.40 |
| gross_margin < 25% | negative | 0.55 |
| ROE > 25% | positive | 0.50 |
| ROE < 0% | negative | 0.50 |
| institutional_pct > 75% | positive | 0.45 |
| institutional_pct < 15% | negative | 0.40 |
| operating_margin > 25% | positive | 0.45 |
| operating_margin < 5% | negative | 0.45 |

#### F. Ownership conviction rules (`_ownership_rules`)

All rules target the `ownership_conviction` category. Multiple rules fire independently.

| Condition | Sentiment | Confidence |
|---|---|---|
| short interest > 10% of float | negative | 0.60 |
| short interest < 2% of float | positive | 0.50 |
| analyst consensus buy/strong_buy | positive | 0.55 |
| analyst consensus sell/strong_sell | negative | 0.55 |
| institutional ownership > 80% | positive | 0.50 |
| institutional ownership < 20% | negative | 0.45 |
| 5+ insider Form 4 filings (90 days) | neutral | 0.50 |

#### G. Filing rules (`_filing_rules`)

| Condition | Category | Sentiment | Confidence |
|---|---|---|---|
| 3+ 8-K filings in 90 days | risks | neutral | 0.50 |

#### H. LLM news mapping (`_llm_news_mapping`)

GPT-4o-mini maps each headline against each selected thesis statement. Returns sentiment and confidence per mapping. Only applied when `OPENAI_API_KEY` is set.

---

### Step 3 — Evaluation (Deterministic)

Only mappings with `confidence >= 0.50` are applied.

#### Diminishing Returns Decay

When multiple signals fire for the same thesis point, each successive signal (sorted by confidence descending) receives a reduced weight:

| Signal rank | Decay factor |
|---|---|
| 1st signal | 1.00 (100%) |
| 2nd signal | 0.60 (60%) |
| 3rd signal | 0.35 (35%) |
| 4th+ signals | 0.20 (20%) |

This prevents a single well-covered thesis point from dominating the total score.

#### Per-thesis-point formula

```
effective_weight = CATEGORY_WEIGHT * importance_multiplier * conviction_multiplier * decay_factor
deduction = effective_weight * confidence    (negative signals)
credit    = effective_weight * confidence    (positive signals)
```

#### Category weights

| Category | Deduction weight | Credit weight |
|---|---|---|
| competitive_moat | 8.0 | 8.0 |
| risks | 7.0 | 4.0 |
| growth_trajectory | 6.0 | 6.0 |
| valuation | 5.0 | 5.0 |
| financial_health | 5.0 | 5.0 |
| ownership_conviction | 4.0 | 4.0 |

#### Importance multipliers

| Importance | Multiplier |
|---|---|
| standard | 1.0x |
| important | 1.5x |
| critical | 2.0x |

**Frozen multiplier:** 1.5x (committed conviction — applied instead of importance if the point is frozen)

**Conviction multipliers:** `liked` thesis points apply an additional 1.3x to credits; `disliked` points apply 1.3x to deductions.

#### Final score

```
score = clamp(50 + sum(credits) - sum(deductions), 0, 100)
```

#### Status thresholds

| Score | Status | Label |
|---|---|---|
| >= 75 | green | Thesis Intact |
| 50–74 | yellow | Under Pressure |
| < 50 | red | Thesis Breaking |

### Step 4 — Explanation
GPT-4o-mini generates a plain-language summary of the result. No buy/sell language.

---

## Investor Profile Adjustments

If the user has completed the investor profile wizard, category weights are adjusted:
- `risk_capacity = low` → risks and financial_health deductions scaled by 1.2x
- `loss_aversion = high` → all deductions scaled by 1.15x
- `investment_style = growth` → growth_trajectory credits scaled by 1.2x

---

## Rule Coverage by Category

| Category | Weight | Dedicated rule functions | Min rules per stock |
|---|---|---|---|
| competitive_moat | 8.0 | `_price_rules`, `_moat_rules` | 0–8 |
| risks | 7.0 | `_price_rules`, `_filing_rules`, LLM | 0–3 |
| growth_trajectory | 6.0 | `_price_rules`, `_growth_rules` | 0–9 |
| valuation | 5.0 | `_valuation_rules` | 0–10 |
| financial_health | 5.0 | `_financial_health_rules` | 0–8 |
| ownership_conviction | 4.0 | `_ownership_rules` | 0–4 |

---

## Known Limitations

1. **LLM confidence is uncalibrated** — GPT confidence scores are not statistically meaningful.
2. **No source weighting** — a blog headline carries the same weight as a Reuters report.
3. **No historical trend** — score is a point-in-time snapshot.
4. **Decay is per-thesis-point, not per-category** — two different thesis points in the same category both receive full 1st-signal weight.
