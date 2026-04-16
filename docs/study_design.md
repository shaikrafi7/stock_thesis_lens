# STARC Alpha Validation Study: Pre-Registration

**Version**: 1.0  
**Pre-Registration Date**: 2026-04-16  
**Status**: LOCKED — methodology committed before any return data is examined  
**Authors**: STARC Research Team

---

## Abstract

This document pre-registers the methodology for a validation study of the STARC (Systematic Technical And Relative-strength Composite) stock scoring system, a 6-category composite scoring framework that produces a 0–100 signal intended to identify stocks likely to outperform. Using a universe of approximately 900 large- and mid-cap U.S. equities over the 2020–2025 out-of-sample period, we test whether stocks ranked in the top quintile by STARC score generate statistically significant positive alpha after controlling for the Fama-French 5-factor model (Fama and French, 2015), Carhart momentum (Carhart, 1997), and the Quality Minus Junk factor (Asness, Frazzini, and Pedersen, 2019). We pre-register all hypotheses, portfolio construction rules, statistical tests, and robustness checks prior to examining any return data, following the protocol advocated by Harvey, Liu, and Zhu (2016) to guard against p-hacking and multiple-testing inflation.

---

## 1. Research Questions and Hypotheses

All hypotheses are stated in their alternative form. The null in each case is zero excess return or zero incremental explanatory power. Statistical significance requires t > 3.0 throughout (Harvey, Liu, and Zhu, 2016; Chordia, Goyal, and Saretto, 2020).

### H1 (Primary): Quintile Spread

**Hypothesis**: Stocks in STARC quintile 5 (Q5, highest scores) generate higher average forward returns than stocks in quintile 1 (Q1, lowest scores) at 3-month, 6-month, and 12-month horizons, with Newey-West t-statistics exceeding 3.0.

**Test**: Monthly quintile sorts on STARC score using NYSE breakpoints. Report Q5 and Q1 mean forward returns and the Q5–Q1 spread for each horizon. Newey-West standard errors with 6 lags correct for overlapping return windows and autocorrelation (Newey and West, 1987).

**Rationale**: This is the direct analog to Piotroski (2000), who showed Q5–Q1 spreads of approximately 7.5% annually for the F-Score on value stocks. The architectural precedent establishes that composite binary-signal systems can predict cross-sectional returns, but post-publication evidence (Hou, Xue, and Zhang, 2020) shows most anomalies weaken substantially.

### H2: Long-Short Alpha After Factor Controls

**Hypothesis**: A value-weighted long-short portfolio (long Q5, short Q1), rebalanced monthly, earns a statistically significant positive alpha (intercept) in a time-series regression on the six-factor model: Fama-French 5 factors + Carhart momentum + QMJ.

**Test**: Monthly OLS regression of long-short portfolio excess return on:
- Mkt-Rf (market excess return)
- SMB (small minus big)
- HML (high minus low book-to-market)
- RMW (robust minus weak profitability)
- CMA (conservative minus aggressive investment)
- UMD (momentum, Carhart 1997)
- QMJ (quality minus junk, Asness, Frazzini, and Pedersen, 2019)

The intercept alpha and its Newey-West t-statistic (6 lags) are the primary test statistic.

**Rationale**: QMJ is a mandatory control given that STARC's competitive_moat, financial_health, and growth_trajectory categories closely approximate the quality factor decomposition (Asness, Frazzini, and Pedersen, 2019). Without QMJ, any measured alpha likely reflects STARC's overlap with the quality premium rather than genuine incremental information.

### H3: Category Ablation

**Hypothesis**: At least one individual STARC category, when dropped from the composite score, produces a statistically significant reduction in Q5–Q1 spread (12-month horizon), indicating that it contributes non-redundant predictive information.

**Test**: Full model alpha versus each of six single-category drop models:
1. Drop competitive_moat (weight 8.0)
2. Drop risks (weight 7.0)
3. Drop financial_health (weight 7.0)
4. Drop growth_trajectory (weight 6.0)
5. Drop valuation (weight 5.0)
6. Drop ownership_conviction (weight 4.0)

Additionally, test each category in isolation. Report Q5–Q1 spread and six-factor alpha for each configuration.

**Secondary prediction**: Ownership_conviction and risks are the categories with no direct Fama-French 5-factor analog (see Section 4). If either of these provides incremental alpha after controlling for FF5 + QMJ, that constitutes genuine novel signal. If alpha disappears with only those two categories dropped, the remaining four categories are repackaging known factors.

### H4: Market Regime Dependence

**Hypothesis**: STARC Q5–Q1 spread is not uniform across market regimes; it is higher in at least one identifiable regime than in the full-sample average.

**Regimes** (classified monthly based on prior-period conditions):
- Bull: SPY trailing 6-month return > +10%
- Bear: SPY trailing 6-month return < −10%
- High volatility: VIX monthly average > 25
- Low volatility: VIX monthly average < 15
- Neutral: all other months

**Test**: Report mean Q5–Q1 spread (3-month forward return) separately for each regime. Use interaction terms in Fama-MacBeth regressions (regime dummy × STARC score). Given reduced sample sizes per regime, use t > 2.0 as the regime-specific threshold.

---

## 2. Universe and Sample

### 2.1 Target Universe

**Primary**: S&P 500 + S&P MidCap 400 constituents (approximately 900 stocks, representing U.S. large- and mid-cap equities).

**Simulation proxy**: A representative sample of 100 tickers is used for initial validation, expandable to the full universe as data costs permit. Quintile breakpoints are computed on NYSE-listed stocks only, following the convention established in Fama and French (1993) to avoid micro-cap stocks from the AMEX/OTC markets distorting portfolio assignments.

**Rationale for large/mid-cap focus**: Green, Hand, and Zhang (2017) find that only 2 of 94 return predictors survive post-2003 for non-microcap stocks. Restricting to S&P 500 + MidCap 400 tests STARC on the hardest sample — large, liquid, heavily-analyzed equities where alpha is least likely to exist and most meaningful if found.

### 2.2 Time Period

- **In-sample (rule development reference)**: 2015–2019
- **Out-of-sample (validation)**: January 2020 – December 2025 (60 months)

The 2020–2025 window is the primary evaluation period. Rules were not fit to this period. The window encompasses diverse regimes: the COVID crash and recovery (2020), the 2021 bull market, the 2022 bear market (S&P 500 −19.4%), and the 2023–2025 recovery, providing meaningful variation for regime tests (H4).

### 2.3 Survivorship Bias

Survivorship bias is a known inflator of backtested returns. Excluding stocks that were delisted or removed from indices understates the performance of low-scoring quintiles (where distressed stocks cluster) and overstates Q5–Q1 spreads (Hou, Xue, and Zhang, 2020).

**Handling**:
- Include all stocks that were constituents at any point during 2020–2025, not just current members
- Include delisted stocks in the universe through their last trading date; assign their delisting return (typically −30% per the CRSP convention) at removal
- Document the count and percentage of delistings per quintile
- If point-in-time constituent lists are unavailable, report results with and without a survivorship-bias correction and treat the difference as a sensitivity bound

### 2.4 Exclusions

The following stocks are excluded from portfolio assignment (but are scored):
- Price < $5.00 at the scoring date (penny stocks with high bid-ask spreads)
- Bottom NYSE size decile (micro-caps where STARC rules may not apply and transaction costs dominate)
- Financials (SIC 6000–6999) in valuation-focused tests only, due to incomparable leverage ratios (Fama and French, 1992)

---

## 3. Scoring Methodology

### 3.1 Architecture Overview

STARC produces a composite score on a 0–100 scale. The base score is 50. Positive signals add to the base; negative signals subtract. The final score is bounded to [0, 100].

For the simulation, all scores are computed using standardized thesis templates (see Section 3.5) — identical across all stocks — so that only the quantitative signal rules and financial data drive score variation. This isolates the algorithmic signal from user-authored thesis text.

Full algorithmic detail is in `docs/scoring_algorithm.md`.

### 3.2 Categories and Weights

| Category | Weight | Factor Analog | Novel Signal? |
|---|---|---|---|
| competitive_moat | 8.0 | RMW (Fama-French 2015), QMJ (Asness et al. 2019) | Partial |
| risks | 7.0 | None direct | Yes |
| financial_health | 7.0 | RMW + CMA (FF5), Altman Z-Score (1968) | No |
| growth_trajectory | 6.0 | CMA + RMW (FF5) | No |
| valuation | 5.0 | HML (FF5) | No |
| ownership_conviction | 4.0 | None direct | Yes |

**Total weight denominator**: 37.0

**Interpretation**: Four of six categories have direct factor-model analogs, which means a Fama-French regression has a reasonable prior probability of absorbing their contribution. The risks and ownership_conviction categories are the most likely sources of incremental alpha beyond known factors.

### 3.3 Signal Rules and Thresholds

STARC contains 30+ individual rules organized within the six categories. Key rules with their academic basis:

**Competitive Moat (weight 8.0)**:
- Gross margin > 60% → positive (Novy-Marx, 2013: gross profitability predicts returns with −0.50 correlation to HML, meaning it is not subsumed by value)
- Gross margin > 40% → weak positive
- Gross margin < 25% → negative
- ROE > 25% → positive (Fama and French, 2015: RMW factor)
- ROE < 0% → negative
- Operating margin > 25% → positive (Asness, Frazzini, and Pedersen, 2019: operating profitability in QMJ)

**Financial Health (weight 7.0)**:
- D/E > 200% → strong negative (Altman, 1968: leverage in Z-Score)
- D/E 100–200% → moderate negative
- D/E 50–100% → mild positive
- Current ratio < 1.0 → negative (Piotroski, 2000: liquidity component of F-Score)
- Current ratio > 2.0 → positive

**Growth Trajectory (weight 6.0)**:
- Revenue growth > 20% → strong positive (Mohanram, 2005: G-Score growth signals)
- Revenue growth 10–20% → moderate positive
- Revenue growth 0–5% → mild negative
- EPS beat > 10% → positive (Ball and Brown, 1968: post-earnings announcement drift)
- EPS beat 5–10% → mild positive
- EPS miss 5–10% → mild negative

**Valuation (weight 5.0)**:
- P/E > 40 → negative (Basu, 1977: value effect; low P/E outperforms)
- P/E > 30 and PEG > 2.0 → moderate negative
- P/E 15–20 and PEG < 1.5 → positive
- EV/EBITDA > 25 → negative
- EV/EBITDA < 10 → positive
- P/B < 1.5 → positive (Fama and French, 1992: book-to-market effect)

**Ownership Conviction (weight 4.0)**:
- Institutional ownership > 75% → positive (Gompers and Metrick, 2001: institutional demand and returns)
- Insider buying (Form 4 net purchases) → positive (Lakonishok and Lee, 2001: insider purchases predict returns; insider sales are uninformative)
- Short interest > 20% of float → negative (Stambaugh, Yu, and Yuan, 2012: short interest predicts negative returns; sentiment-driven overpricing)

**Risks (weight 7.0)**:
- Negative signals carry asymmetric weight: risks deductions use weight 7.0 while risks credits use weight 4.0. This reflects prospect theory (Kahneman and Tversky, 1979): losses weigh approximately twice as heavily as equivalent gains in investor decision-making.
- 8-K filing velocity (unusually high frequency of material event disclosures) → negative (novel signal, no direct academic precedent)
- Rule of 40 violation (revenue growth % + operating margin % < 40 for software companies) → negative (industry heuristic, limited academic backing)

### 3.4 Diminishing Returns Decay

When multiple signals fire within the same category, each successive signal is down-weighted:

| Signal rank within category | Multiplier |
|---|---|
| 1st | 1.00 |
| 2nd | 0.60 |
| 3rd | 0.35 |
| 4th+ | 0.20 |

Signals within a category are ranked by confidence descending before decay is applied. This prevents correlated signals (e.g., high gross margin and high operating margin both firing in competitive_moat) from double-counting the same underlying factor. The specific decay series (1.0, 0.6, 0.35, 0.2) is a design choice with no direct academic precedent; its sensitivity is tested in robustness checks (Section 8).

### 3.5 Standardized Thesis Templates

For simulation purposes, all stocks use identical thesis templates — one per category — with generic statements that are neutral with respect to any specific stock. This ensures score variation is driven entirely by quantitative financial signals, not by the analyst's choice of thesis language.

```
Category: competitive_moat
Statement: "The company has a durable competitive advantage"

Category: growth_trajectory
Statement: "Revenue and earnings are growing meaningfully"

Category: valuation
Statement: "The stock is reasonably valued relative to fundamentals"

Category: financial_health
Statement: "The balance sheet is sound with strong cash generation"

Category: ownership_conviction
Statement: "Institutional and insider ownership signals confidence"

Category: risks
Statement: "Key business risks are being monitored"
```

All importance modifiers are set to standard (1.0x). No frozen scores or conviction overrides. This tests the pure rule-and-weight system.

**Implication**: Results from the simulation may understate real-world performance if skilled analysts write thesis statements that activate rules more precisely, and may overstate it if generic templates miss disconfirming information a skilled analyst would include. This is acknowledged as a limitation (Section 9).

---

## 4. Portfolio Construction

### 4.1 Scoring Frequency

Stocks are scored monthly at the last trading day of each calendar month. Financial data inputs are point-in-time: only data observable on or before the scoring date is used, with a 4-month reporting lag applied to fundamental accounting data to avoid look-ahead bias. This follows the convention in Fama and French (1992) and is critical for validity.

**Specific lag rules**:
- Annual financial statements: use prior fiscal year if the scoring date is fewer than 4 months after fiscal year-end
- Quarterly earnings: use prior quarter results only if the earnings release date is confirmed prior to the scoring date
- Price and market data: current (no lag required)
- Form 4 filings: use filings with a filing date on or before the scoring date

### 4.2 Skip-Month Formation

Following Jegadeesh and Titman (1993), a one-month skip is applied between the scoring date and the start of the holding period. This avoids bid-ask bounce and short-term reversal contaminating forward returns. Stocks are scored at month-end t; portfolios are formed at the end of month t+1; forward returns are measured from t+1 to t+1+h (where h is the holding period).

### 4.3 Quintile Breakpoints

Quintile breakpoints are computed using NYSE-listed stocks only, following Fama and French (1993). This prevents the large number of small-cap AMEX/OTC stocks from compressing breakpoints and assigning disproportionate numbers of small stocks to Q5.

Five quintile portfolios are formed each month (Q1 = lowest STARC scores, Q5 = highest).

### 4.4 Weighting

- **Primary**: Value-weighted portfolios (weighted by market capitalization), following the convention in most factor literature
- **Robustness**: Equal-weighted portfolios

Value weighting reduces the influence of small stocks and is more practically implementable. Equal weighting is reported as a robustness check and often shows larger gross alphas because it overweights smaller, less efficient stocks.

### 4.5 Holding Periods

Forward returns are computed at four horizons:
- 1 month (h=1)
- 3 months (h=3)
- 6 months (h=6)
- 12 months (h=12)

For horizons > 1 month, returns overlap across adjacent monthly cohorts. The Newey-West correction (6 lags minimum, or h lags for h-month horizons) addresses the resulting autocorrelation in t-statistics.

---

## 5. Statistical Framework

### 5.1 Quintile Sort Analysis

Monthly quintile portfolios are formed and held for each horizon. Report:
- Mean monthly return for each quintile Q1 through Q5
- Q5–Q1 spread
- Newey-West t-statistic for Q5–Q1 spread (Harvey, Liu, and Zhu, 2016 require t > 3.0)
- Sharpe ratio for each quintile (annualized)
- Maximum drawdown for Q5 and Q1

The GRS F-statistic (Gibbons, Ross, and Shanken, 1989) is reported to jointly test whether the five quintile portfolios have zero intercepts when regressed on the factor model. The GRS test has higher power than testing quintiles individually and is the standard joint test in the factor literature.

### 5.2 Fama-MacBeth Cross-Sectional Regressions

Following Fama and MacBeth (1973), each month t we run a cross-sectional regression of next-period returns on STARC score and controls:

```
r_{i,t+1} = a_t + b_t * STARC_i,t + c_t * Controls_i,t + e_{i,t+1}
```

Controls include: log(market cap), book-to-market ratio, prior 12-month return (skipping the most recent month), and profitability.

The time-series average of the monthly slope coefficients {b_t} is the Fama-MacBeth estimate. Standard errors use Newey-West correction with 6 lags. This approach controls for cross-sectional correlation and produces coefficient estimates interpretable as average return per unit of STARC score.

### 5.3 Time-Series Factor Regressions

For long-short portfolios and quintile-specific portfolios, run monthly time-series OLS:

```
R_p,t - R_f,t = alpha + beta_1*MktRf + beta_2*SMB + beta_3*HML 
                + beta_4*RMW + beta_5*CMA + beta_6*UMD + beta_7*QMJ + e_t
```

Factor data sources:
- FF5 factors (Mkt-Rf, SMB, HML, RMW, CMA): Ken French Data Library (monthly)
- UMD (momentum): Ken French Data Library
- QMJ: AQR Capital Management data library (Asness, Frazzini, and Pedersen, 2019)

The intercept alpha and its Newey-West t-statistic are the primary outputs for H2.

### 5.4 Information Coefficient

The Information Coefficient (IC) is the cross-sectional rank correlation (Spearman) between STARC score and subsequent forward return, computed monthly:

```
IC_t = rank_corr(STARC_i,t, r_{i,t→t+3})
```

Report mean IC, standard deviation of IC, and IC Information Ratio (mean IC / std IC). An IC > 0.05 is considered economically meaningful in quantitative asset management practice. IC tests whether the score has monotonic predictive content, independent of quintile portfolio construction choices.

### 5.5 Significance Thresholds

Following Harvey, Liu, and Zhu (2016), who surveyed 316 claimed factor discoveries and found that the majority are false positives at conventional significance levels, we apply:

- **Primary threshold**: t > 3.0 (corresponds to p < 0.003 two-tailed), required for the primary hypotheses H1 and H2
- **Secondary threshold**: t > 2.0 for regime-specific tests (H4) and individual category ablation (H3), where sample sizes are smaller
- **Chordia adjustment**: Chordia, Goyal, and Saretto (2020) recommend t > 3.4–3.8 for cross-sectional studies with data mining concerns; we report whether results survive this higher bar

### 5.6 Multiple Testing Correction

With six categories tested in ablation, four regimes, four holding periods, and two weighting schemes, the number of simultaneous hypotheses exceeds 50. Without correction, spurious significant results are expected.

Procedure: Apply Benjamini-Hochberg false discovery rate (FDR) control at the 5% level (Benjamini and Hochberg, 1995). Report both raw p-values and FDR-adjusted p-values for all tests beyond the primary H1 and H2 hypotheses.

### 5.7 Deflated Sharpe Ratio

Following Lopez de Prado (2018), report the Deflated Sharpe Ratio (DSR) for the primary long-short strategy:

```
DSR = SR * sqrt((T-1)/T) / sqrt(1 - skewness*SR + (kurtosis-1)/4 * SR^2) * adjustment_for_trials
```

The DSR corrects for non-normality of returns and the number of strategy configurations tested (trials). A DSR > 1.0 indicates a Sharpe ratio that is unlikely to be the result of selection from multiple trials. This is reported alongside conventional Sharpe ratios but is not the primary test statistic.

---

## 6. Control Variables

### 6.1 Factor Controls (Time-Series Regressions)

| Factor | Source | Rationale |
|---|---|---|
| Mkt-Rf | Ken French Data Library | CAPM market beta (Sharpe, 1964; Lintner, 1965) |
| SMB | Ken French Data Library | Size premium (Fama and French, 1993) |
| HML | Ken French Data Library | Value premium; controls for valuation category overlap |
| RMW | Ken French Data Library | Profitability; controls for moat/financial health overlap |
| CMA | Ken French Data Library | Investment; controls for growth trajectory overlap |
| UMD | Ken French Data Library | Momentum; controls for price momentum signals in STARC |
| QMJ | AQR Data Library | Quality premium; critical control given STARC-quality overlap |

**Why QMJ is mandatory**: STARC's three highest-weighted categories (competitive_moat, risks, financial_health) collectively approximate the quality factor decomposition in Asness, Frazzini, and Pedersen (2019). A regression without QMJ would attribute quality-premium returns to STARC, inflating apparent alpha. Including QMJ tests the sharper hypothesis: does STARC add signal beyond what a quality-aware investor already captures?

### 6.2 Transaction Costs

Gross alpha is reported alongside net-of-cost alpha:
- Large-cap (S&P 500): 50 bps round-trip (25 bps per leg)
- Mid-cap (MidCap 400): 150 bps round-trip

These estimates are conservative relative to current large-cap bid-ask spreads but reflect realistic execution costs including market impact for non-trivial position sizes (Hou, Xue, and Zhang, 2020 use 50 bps as a standard threshold for economic significance). Also report portfolio turnover (fraction of holdings replaced at each rebalancing).

---

## 7. Robustness Tests

The following robustness checks are pre-specified. They are not hypotheses — they are diagnostics for the stability and generalizability of the primary finding. All are run only after the primary hypotheses are analyzed.

### R1: Equal-Weight vs. Value-Weight

Repeat primary analysis using equal-weighted quintile portfolios. If alpha is substantially larger in equal-weighted portfolios, the effect may be driven by smaller, less liquid stocks where transaction costs would erode it.

### R2: Exclude Microcaps

Restrict the universe to stocks above the NYSE 20th size percentile. Green, Hand, and Zhang (2017) find most anomalies concentrate in the smallest stocks; this test checks whether STARC works for large, liquid equities.

### R3: Sub-Period Stability

Compute rolling 3-year Q5–Q1 spreads to assess temporal stability. Report:
- 2020–2022 sub-period
- 2021–2023 sub-period
- 2022–2024 sub-period
- 2023–2025 sub-period

If alpha varies dramatically across windows, the strategy is unstable and not implementable in practice.

### R4: Category Ablation (also H3)

Already described under H3. This robustness check applies to the primary result to confirm it is not driven by a single category.

### R5: Uniform Confidence vs. Calibrated Confidence

STARC assigns hand-tuned confidence values (0.35–0.70) to individual rules. Replace all confidence values with a uniform 0.50. If Q5–Q1 spread changes substantially, the specific confidence calibration is doing meaningful work (and should be optimized via cross-validation, not hand-tuning). If the spread is stable, the confidence values are not critical.

### R6: Weight Sensitivity

Test three weighting schemes:
1. Current weights (8, 7, 7, 6, 5, 4)
2. Equal weights (all = 5.0 or normalized equivalently)
3. Weights derived from a linear discriminant analysis (in-sample optimization only, to assess the upper bound on achievable performance)

Report Q5–Q1 spread for each. The in-sample optimized weights cannot be used for out-of-sample claims but provide a ceiling estimate.

### R7: Alternative Factor Specifications

Run the primary time-series regression with progressively richer factor models:
1. CAPM only
2. FF3 (Mkt-Rf, SMB, HML)
3. FF5
4. FF5 + UMD (Carhart)
5. FF5 + UMD + QMJ (primary specification)

Report alpha and t-statistic at each step. This shows the attribution of STARC performance across factor layers and directly shows how much QMJ absorbs.

---

## 8. Threats to Validity

We document ten pre-identified threats to the validity of this study. Honest reporting of these threats is part of the pre-registration commitment.

### T1: Implicit Overfitting — Rules Based on Known Factors

The rules (P/E thresholds, gross margin cutoffs, momentum signals) are informed by decades of published financial research. Testing rules derived from known factors and finding that they predict returns is partially circular. The Fama-French regression (H2) is designed to test this directly: if alpha is zero after controls, the circularity has been identified and confirmed. The novel contribution — the 6-category composite architecture, diminishing returns decay, asymmetric risk weighting — is what survives after the known factors are controlled.

### T2: Look-Ahead Bias in Fundamental Data

Data vendors (including FMP and yfinance) often provide restated financials. A company that restated Q3 2023 earnings in Q1 2024 shows different numbers than were available at the scoring date. We use as-reported endpoints where available and apply the 4-month reporting lag, but cannot fully guarantee point-in-time data integrity. This limitation is shared by most academic studies using commercial data providers.

*Severity*: Moderate. Most restatements are small; large restatements may affect scoring in specific stock-months. Document the number of confirmed restatements in the sample.

### T3: Transaction Costs and Capacity Constraints

Measured alpha may not survive transaction costs at scale. Monthly rebalancing of 900 stocks implies significant transaction costs. We report gross and net-of-cost alpha at two cost assumptions (50 bps and 150 bps) and portfolio turnover rates.

### T4: Survivorship Bias

Using historical constituent lists reduces but does not eliminate survivorship bias if delisting return assumptions are incorrect. The standard CRSP delisting return assumption (−30%) may understate losses for stocks delisted due to distress.

*Sensitivity check*: Report results with −30% delisting returns and with −100% (maximum loss scenario). The difference bounds the survivorship bias impact.

### T5: Publication / Researcher Bias

If results are positive, there is incentive to report them. If negative, there is incentive to modify the model and re-test. This pre-registration addresses T5 directly: methodology is locked before results are examined. We commit to publishing results regardless of outcome. A null result (no alpha after factor controls) is a valid and publishable finding — "composite thesis scoring does not generalize out-of-sample" is informative.

### T6: Artificial Thesis Templates

The standardized thesis templates are not representative of how real users engage with STARC. Real users write specific, nuanced thesis statements that may activate different rules. The simulation therefore tests a simplified version of the scoring system, not the full production system as experienced by users.

*Direction of bias*: Unknown. Generic templates may underactivate positive moat/growth signals (understating alpha) or fail to include negative risk terms (overstating alpha by missing deductions).

### T7: Hand-Tuned Confidence Values

Rule confidence levels (0.35–0.70) were set by expert judgment, not data optimization. These values directly multiply signal weights and affect quintile assignments. Robustness check R5 tests sensitivity. If confidence calibration matters substantially, a future study should optimize confidence values via cross-validation on a held-out sample.

### T8: Small Sample by Academic Standards

With 60 months of history and approximately 900 stocks, we have 54,000 stock-month observations (10,800 per quintile). This exceeds the minimum for 80% power to detect a 2% return difference. However, for regime-specific tests (H4) with perhaps 15 months per regime, power is limited. Regime results are treated as exploratory.

### T9: Post-Publication Decay

McLean and Pontiff (2016) document that published anomalies decay by 58% post-publication. Even if we find significant alpha, this is derived from rules informed by prior research, meaning the underlying signals are effectively "published." Forward-looking alpha expectations should be discounted from backtested alpha by 40–60%.

### T10: QMJ Data Lag and Construction Differences

The QMJ factor from AQR uses a specific quality definition and weighting that may differ from STARC's quality-related categories. A poor QMJ match means that some residual "quality" alpha may survive in the regression intercept that is actually attributable to factor construction differences rather than STARC's novel information. We report results with and without QMJ to bound this uncertainty.

---

## 9. Expected Outcomes and Decision Matrix

We pre-specify our interpretation of each possible finding and the resulting product/research action.

| Finding | Interpretation | Action |
|---|---|---|
| Q5–Q1 spread > 2% at t > 3.0, survives FF5+UMD+QMJ | Genuine alpha beyond known factors | Primary success: validated marketing claim, publish as working paper |
| Q5–Q1 spread exists but absorbed by QMJ | STARC repackages quality premium | Redesign scoring to add novel signals beyond quality; retain QMJ framing |
| Q5–Q1 spread exists but absorbed by FF5 | STARC repackages factor exposures | Similar to above; analyze which factors absorb which categories |
| Q5–Q1 spread exists but fails t > 3.0 | Insufficient statistical power or noisy signal | Extend sample, expand universe, or lower weight claim to "consistent with" rather than "statistically significant" |
| No Q5–Q1 spread | Null result | Publish as honest null; use ablation to identify which categories do work; rebuild scoring around surviving categories |
| Alpha concentrated in equal-weight, not value-weight | Small-cap effect | Add market-cap disclaimer; restrict marketing claims to small/mid-cap |
| Alpha concentrated in bear regimes only | Defensive-screen characteristic | Market STARC as a risk-management tool, not return-enhancement |
| Alpha concentrated in specific sector | Sector model, not general | Develop sector-specific scoring modules; validate per sector |
| Transaction costs eliminate net alpha | High turnover or illiquid stocks | Add turnover constraint; consider lower rebalancing frequency |
| Specific category (e.g., ownership_conviction) drives most alpha | Category concentration | Increase that category's weight; consider standalone ownership screen |

**Commitment**: Results will be reported in full regardless of outcome. The pre-registration date and methodology are locked. Any deviation from the pre-specified methodology will be disclosed as a post-registration deviation with the original pre-registered analysis also reported.

---

## 10. References

Altman, E. I. (1968). Financial ratios, discriminant analysis and the prediction of corporate bankruptcy. *Journal of Finance*, 23(4), 589–609.

Asness, C. S., Frazzini, A., and Pedersen, L. H. (2019). Quality minus junk. *Review of Accounting Studies*, 24(1), 34–112.

Ball, R. and Brown, P. (1968). An empirical evaluation of accounting income numbers. *Journal of Accounting Research*, 6(2), 159–178.

Basu, S. (1977). Investment performance of common stocks in relation to their price-earnings ratios: A test of the efficient market hypothesis. *Journal of Finance*, 32(3), 663–682.

Benjamini, Y. and Hochberg, Y. (1995). Controlling the false discovery rate: A practical and powerful approach to multiple testing. *Journal of the Royal Statistical Society Series B*, 57(1), 289–300.

Carhart, M. M. (1997). On persistence in mutual fund performance. *Journal of Finance*, 52(1), 57–82.

Chordia, T., Goyal, A., and Saretto, A. (2020). Anomalies and false rejections. *Review of Financial Studies*, 33(5), 2134–2179.

Fama, E. F. and French, K. R. (1992). The cross-section of expected stock returns. *Journal of Finance*, 47(2), 427–465.

Fama, E. F. and French, K. R. (1993). Common risk factors in the returns on stocks and bonds. *Journal of Financial Economics*, 33(1), 3–56.

Fama, E. F. and French, K. R. (2015). A five-factor asset pricing model. *Journal of Financial Economics*, 116(1), 1–22.

Fama, E. F. and MacBeth, J. D. (1973). Risk, return, and equilibrium: Empirical tests. *Journal of Political Economy*, 81(3), 607–636.

Gibbons, M. R., Ross, S. A., and Shanken, J. (1989). A test of the efficiency of a given portfolio. *Econometrica*, 57(5), 1121–1152.

Gompers, P. A. and Metrick, A. (2001). Institutional investors and equity prices. *Quarterly Journal of Economics*, 116(1), 229–259.

Green, J., Hand, J. R. M., and Zhang, X. F. (2017). The characteristics that provide independent information about average U.S. monthly stock returns. *Review of Financial Studies*, 30(12), 4389–4436.

Harvey, C. R., Liu, Y., and Zhu, H. (2016). ...and the cross-section of expected returns. *Review of Financial Studies*, 29(1), 5–68.

Hou, K., Xue, C., and Zhang, L. (2020). Replicating anomalies. *Review of Financial Studies*, 33(5), 2019–2133.

Jegadeesh, N. and Titman, S. (1993). Returns to buying winners and selling losers: Implications for stock market efficiency. *Journal of Finance*, 48(1), 65–91.

Kahneman, D. and Tversky, A. (1979). Prospect theory: An analysis of decision under risk. *Econometrica*, 47(2), 263–292.

Kim, A., Muhn, M., and Nikolaev, V. V. (2024). Financial statement analysis with large language models. Working paper, University of Chicago Booth School of Business. [Withdrawn February 2025 for data replication issues — cited with caveat.]

Lakonishok, J. and Lee, I. (2001). Are insider trades informative? *Review of Financial Studies*, 14(1), 79–111.

Lintner, J. (1965). The valuation of risk assets and the selection of risky investments in stock portfolios and capital budgets. *Review of Economics and Statistics*, 47(1), 13–37.

Lopez de Prado, M. (2018). *Advances in Financial Machine Learning*. Wiley.

Lopez-Lira, A. and Tang, Y. (2023). Can ChatGPT forecast stock price movements? Working paper, University of Florida.

McLean, R. D. and Pontiff, J. (2016). Does academic research destroy stock return predictability? *Journal of Finance*, 71(1), 5–32.

Mohanram, P. S. (2005). Separating winners from losers among low book-to-market stocks using financial statement analysis. *Review of Accounting Studies*, 10(2–3), 133–170.

Newey, W. K. and West, K. D. (1987). A simple, positive semi-definite, heteroskedasticity and autocorrelation consistent covariance matrix. *Econometrica*, 55(3), 703–708.

Novy-Marx, R. (2013). The other side of value: The gross profitability premium. *Journal of Financial Economics*, 108(1), 1–28.

Piotroski, J. D. (2000). Value investing: The use of historical financial statement information to separate winners from losers. *Journal of Accounting Research*, 38(Supplement), 1–41.

Sharpe, W. F. (1964). Capital asset prices: A theory of market equilibrium under conditions of risk. *Journal of Finance*, 19(3), 425–442.

Sloan, R. G. (1996). Do stock prices fully reflect information in accruals and cash flows about future earnings? *Accounting Review*, 71(3), 289–315.

Stambaugh, R. F., Yu, J., and Yuan, Y. (2012). The short of it: Investor sentiment and anomalies. *Journal of Financial Economics*, 104(2), 288–302.

---

*This document constitutes the complete pre-registration of the STARC Alpha Validation Study. No return data has been examined as of the pre-registration date. All deviations from this pre-registered design will be disclosed in the final study report.*
