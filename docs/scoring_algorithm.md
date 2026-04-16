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

**Scientific Basis:** Price momentum rules proxy the cross-sectional momentum factor documented by Jegadeesh & Titman (1993). Their study shows 3–12 month winner portfolios outperform losers by ~1% per month. The MA20/MA50 crossover is a technical implementation of the same underlying return continuation phenomenon. Monthly change thresholds (±8%, ±15%) are calibrated to medium-term momentum windows. Confidence values (0.40–0.70) are hand-tuned, not statistically derived.

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

**Scientific Basis:**
- **P/E thresholds** — Low P/E predicting higher returns is documented by Basu (1977) and anchors the Fama-French (1992, 1993) HML (high-minus-low book-to-market) value factor. The specific thresholds (P/E < 15 as cheap, > 30 as expensive) are conventional heuristics, not statistically optimized cutoffs.
- **P/B ratio** — The Fama & French (1992, 1993) HML factor is constructed directly from book-to-market ratios. P/B < 1.5 and P/B > 10 thresholds are industry convention; the original FF paper uses quintile breakpoints rather than fixed values.
- **EV/EBITDA** — Standard enterprise value multiple used in practitioner valuation. No direct peer-reviewed paper establishes the 10/25 thresholds; these are heuristic.
- **PEG ratio** — Popularized by Peter Lynch in "One Up on Wall Street" (1989). The PEG < 1.0 rule has limited academic backing; it conflates level (P/E) with growth rate in a way that lacks rigorous theoretical grounding. Academic literature on growth investing focuses on the CMA (conservative minus aggressive) factor in Fama & French (2015) rather than on PEG directly. **Note: weak academic backing.**

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

**Scientific Basis:**
- **D/E ratio** — Leverage as a distress predictor originates with Altman (1968), whose Z-Score incorporates the ratio of total liabilities to total assets. The specific D/E thresholds (50%, 100%, 200%) used here are heuristic adaptations of Altman's leverage component; Altman used discriminant analysis on actual bankruptcy samples to derive his weights, which STARC does not replicate.
- **Current ratio** — Piotroski (2000) F-Score signal #7 flags a year-over-year improvement in current ratio as a positive liquidity signal. The absolute threshold of 1.0 (< 1.0 = negative) aligns with the standard definition of current insolvency.
- **FCF margin** — Free cash flow as a quality dimension is part of Asness, Frazzini & Pedersen (2019) Quality Minus Junk (QMJ) factor, specifically their "safety" sub-dimension. The 15% FCF margin threshold is heuristic.
- **ROE** — Piotroski (2000) F-Score signal #1 uses ROE > 0 as a profitability binary. The 20% threshold used here for a positive signal is a stronger version of that binary, consistent with the high-ROE component of the RMW (robust minus weak profitability) factor in Fama & French (2015).

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

**Scientific Basis:**
- **Revenue growth tiers** — High investment (growth) firms relate to the CMA (conservative minus aggressive investment) factor in Fama & French (2015). The sign of expected returns is nuanced: aggressive asset growth predicts lower returns in FF5, meaning high revenue growth companies may be priced for perfection. Thresholds (5%, 10%, 20%) are heuristic.
- **EPS surprise** — Ball & Brown (1968) first documented post-earnings announcement drift (PEAD): stocks with positive earnings surprises continue to outperform for weeks to months after the announcement. This is one of the most replicated anomalies in the literature. The 5%/10% surprise thresholds are heuristic delineations within the PEAD effect.
- **Rule of 40** — A SaaS industry heuristic (revenue growth % + operating margin % >= 40) popularized by Brad Feld and venture capital practitioners. **No peer-reviewed academic source establishes this threshold.** It is used here as a practitioner heuristic for SaaS company health.

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

**Scientific Basis:**
- **Gross margin as pricing power proxy** — Novy-Marx (2013) "The Other Side of Value" shows that gross profitability (gross profit / total assets) is the most powerful profitability predictor of stock returns, with a Sharpe ratio comparable to the HML value factor. The gross_margin > 60% rule is directionally consistent with this finding. **Important caveat:** Novy-Marx specifies gross profit scaled by *total assets*, not gross profit / revenue (i.e., the standard gross margin ratio). STARC uses gross margin (revenue-scaled), which is a weaker and differently-constructed proxy than the Novy-Marx measure.
- **ROE as capital efficiency** — High ROE maps to the RMW (robust minus weak profitability) factor in Fama & French (2015), which shows robust-profitability firms earn ~3% annual premium over weak-profitability firms in their five-factor model.
- **Operating margin** — Operating profitability is a component of the QMJ (Quality Minus Junk) factor profitability dimension in Asness, Frazzini & Pedersen (2019). High operating margin firms earn significant excess returns; the authors find QMJ has a Sharpe ratio of ~1.0 in U.S. equities 1956–2012.

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

**Scientific Basis:**
- **Institutional ownership** — Gompers & Metrick (2001) document that institutional demand for stocks predicts future returns. Stocks with greater institutional ownership tend to have higher liquidity and are more efficiently priced. The 20%/80% thresholds are heuristic.
- **Short interest** — Stambaugh, Yu & Yuan (2012) show that high short interest is among the strongest predictors of negative future returns, and that mispricing anomalies are stronger on the short side due to arbitrage limits. The 2%/10% of float thresholds are conventional practitioner levels; Stambaugh et al. use quintile rankings rather than fixed thresholds.
- **Insider transactions** — Lakonishok & Lee (2001) demonstrate that insider purchases (Form 4 filings) predict positive future returns, especially for small firms. STARC currently maps 5+ Form 4 filings as neutral rather than directionally distinguishing purchases from sales; this is a limitation relative to the Lakonishok & Lee finding, which specifically focuses on net buying vs. net selling.

#### G. Filing rules (`_filing_rules`)

| Condition | Category | Sentiment | Confidence |
|---|---|---|---|
| 3+ 8-K filings in 90 days | risks | neutral | 0.50 |

**Scientific Basis:** 8-K filing velocity as a risk signal has **no direct academic precedent** identified in the literature. The rule is a novel heuristic based on the observation that elevated 8-K filing rates may signal material corporate events (restructurings, leadership changes, litigation). This is one of STARC's genuinely novel elements and would require empirical validation before being treated as a reliable signal.

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

**Scientific Basis:** The decay schedule is motivated by the principle of diminishing marginal information — successive signals confirming the same thesis point carry increasingly redundant informational content. This concept has parallels in information theory and Bayesian belief updating, but the specific decay values (1.0, 0.6, 0.35, 0.2) are **novel heuristics with no direct academic precedent.** They are not derived from empirical optimization over stock return data.

#### Per-thesis-point formula

```
effective_weight = CATEGORY_WEIGHT * importance_multiplier * conviction_multiplier * decay_factor
deduction = effective_weight * confidence    (negative signals)
credit    = effective_weight * confidence    (positive signals)
```

#### Category weights

| Category | Deduction weight | Credit weight | Rationale |
|---|---|---|---|
| competitive_moat | 8.0 | 8.0 | Moat is the primary driver of long-run excess returns |
| risks | 7.0 | 4.0 | Asymmetric: risk materializing = large deduction; not materializing = minor credit |
| growth_trajectory | 6.0 | 6.0 | Growth is the second most important thesis dimension |
| valuation | 5.0 | 5.0 | Valuation matters but is less predictive than quality |
| financial_health | 5.0 | 5.0 | Structural solvency signals |
| ownership_conviction | 4.0 | 4.0 | Informative but noisy |

**Scientific Basis:** Weights are **heuristic and not empirically optimized** via regression, discriminant analysis, or machine learning. This is a meaningful difference from Altman (1968), whose Z-Score weights (1.2, 1.4, 3.3, 0.6, 1.0) were derived through multiple discriminant analysis on actual bankruptcy samples. STARC weights encode prior beliefs about economic importance rather than statistical fit to historical return data. An equal-weight robustness check (all categories weighted 6.0/5.5) is recommended before publication to assess sensitivity to weight choices.

The asymmetric risks weight (deduction 7.0 vs. credit 4.0) is grounded in Kahneman & Tversky (1979) prospect theory, which establishes that losses loom approximately twice as large as equivalent gains in human decision-making (loss aversion coefficient ~2.25). STARC's 7.0/4.0 ratio (~1.75x) is consistent with, though slightly below, the empirical loss aversion coefficient.

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

## Academic References

| Citation | Relevance to STARC |
|---|---|
| Altman (1968) | Z-Score; D/E and leverage signals; benchmark for empirically-optimized weights |
| Asness, Frazzini & Pedersen (2019) | QMJ factor; operating margin and FCF as quality dimensions |
| Ball & Brown (1968) | Post-earnings announcement drift (PEAD); EPS surprise rules |
| Basu (1977) | Low P/E predicts higher returns; P/E valuation thresholds |
| Fama & French (1992, 1993) | HML factor; P/B valuation rules |
| Fama & French (2015) | Five-factor model: RMW (ROE, gross margin), CMA (growth investment) |
| Gompers & Metrick (2001) | Institutional ownership predicts returns |
| Jegadeesh & Titman (1993) | Cross-sectional momentum; price change rules |
| Kahneman & Tversky (1979) | Prospect theory; asymmetric risks weight (7.0 deduction vs. 4.0 credit) |
| Lakonishok & Lee (2001) | Insider purchases predict positive returns; Form 4 rules |
| Novy-Marx (2013) | Gross profitability predicts returns; gross margin moat rule |
| Piotroski (2000) | F-Score; current ratio and ROE signals in financial_health |
| Stambaugh, Yu & Yuan (2012) | Short interest as negative return predictor; short interest rules |

---

## Known Limitations

1. **Weights are heuristic, not empirically optimized.** Category weights are based on prior beliefs about economic importance rather than regression or discriminant analysis fit to return data (contrast with Altman Z-Score, whose weights were MDA-derived).
2. **Confidence values (0.35–0.70) are hand-tuned.** All rule confidence scores are manually assigned approximations, not calibrated against historical prediction accuracy.
3. **Gross margin vs. total assets scaling.** Novy-Marx (2013) constructs gross profitability as gross profit / total assets, not gross profit / revenue. STARC uses the standard gross margin (revenue-scaled), which is a weaker proxy. Implementing the Novy-Marx specification would strengthen the academic grounding of the competitive moat category.
4. **PEG ratio has weak academic backing.** The PEG < 1.0 rule is a practitioner heuristic (Lynch 1989) with limited peer-reviewed support. Its validity varies significantly across sectors and growth stages.
5. **8-K filing velocity lacks peer-reviewed support.** The 3+ 8-K in 90 days rule is a novel heuristic. No academic paper establishes this as a reliable return predictor.
6. **Rule of 40 lacks peer-reviewed support.** This SaaS heuristic has no academic validation and is inapplicable to non-SaaS companies.
7. **LLM confidence is uncalibrated.** GPT confidence scores are not statistically meaningful.
8. **No source weighting.** A blog headline carries the same weight as a Reuters report.
9. **No historical trend.** Score is a point-in-time snapshot.
10. **Decay is per-thesis-point, not per-category.** Two different thesis points in the same category both receive full 1st-signal weight.
