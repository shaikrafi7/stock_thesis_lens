# Literature Review: Validating the STARC Composite Stock Scoring System

**Purpose:** Academic foundation for a study testing whether STARC generates alpha via quintile portfolio backtesting over 10 years (~500 stocks, monthly scoring, Fama-French factor controls).

**Date:** April 2026

---

## Part I: Composite Score Systems — Direct Analogs to STARC

### 1. Piotroski (2000) — The F-Score

**Full citation:** Piotroski, J.D. (2000). "Value Investing: The Use of Historical Financial Statement Information to Separate Winners from Losers." *Journal of Accounting Research*, 38(Supplement), 1–41.

**Methodology:**
- Universe: NYSE, AMEX, and Grey Market stocks, top book-to-market quintile only, 1976–1996 (Compustat data)
- 9 binary signals (0 or 1 each), summed to F-Score 0–9
- Three signal groups:
  - Profitability (4): ROA > 0, CFO > 0, ΔROA > 0, CFO > ROA (accruals quality)
  - Leverage/Liquidity (3): ΔLong-term leverage < 0, ΔCurrent ratio > 0, no new equity issuance
  - Operating Efficiency (2): ΔGross margin > 0, ΔAsset turnover > 0
- Statistical tests: logistic regression (predicting 1-year-ahead returns), portfolio sorts (F-Score 8–9 = strong, 0–1 = weak), market-adjusted returns

**Key findings:**
- High F-Score (8–9) firms earned mean annual market-adjusted return of 13.4% vs. 5.9% for full value quintile: +7.5% alpha
- Low F-Score (0–1) firms: −9.6% annual return
- Long-short (high minus low): **23% annual return**, 1976–1996
- Returns concentrated in small/mid-cap, low analyst coverage, low trading volume stocks
- Strategy robust across subperiods

**Critical caveat:** Post-publication performance is severely degraded. Independent replication using the same methodology over 2000–2020 shows the long-short strategy produced negative returns (approximately −10% annually). This is direct evidence of McLean-Pontiff post-publication decay, compounded by data mining in the original sample.

**What we adopt:**
- Binary signal approach with category aggregation is our direct precedent
- Using book-to-market quintile as universe filter is analogous to our score-based ranking
- Logistic regression of score on forward 12-month returns is an appropriate first-pass test
- Report both market-adjusted returns AND factor-controlled alphas
- Segment results by market cap (small vs. large) — alpha may be concentrated in small-caps

**What we avoid:**
- Restricting universe to value stocks only — STARC covers all quintiles
- Equal-weighting signals across all categories — STARC uses category weights, which needs justification
- Claiming 23%-style returns without out-of-sample validation

---

### 2. Altman Z-Score (1968) — Financial Distress Scoring

**Full citation:** Altman, E.I. (1968). "Financial Ratios, Discriminant Analysis and the Prediction of Corporate Bankruptcy." *Journal of Finance*, 23(4), 589–609.

**Methodology:**
- Statistical technique: Multiple Discriminant Analysis (MDA), not OLS
- Matched sample of bankrupt vs. non-bankrupt manufacturing firms (publicly traded, assets > $1M)
- Five financial ratios weighted by discriminant coefficients:
  - X1: Working capital / Total assets
  - X2: Retained earnings / Total assets
  - X3: EBIT / Total assets
  - X4: Market value of equity / Book value of total debt
  - X5: Sales / Total assets
- Zones: Z > 2.99 (safe), 1.81–2.99 (grey), < 1.81 (distress)
- Validated at 72% accuracy predicting bankruptcy two years prior

**Key findings:**
- The composite linear score outperforms any single ratio
- MDA produces optimal linear combination of ratios to separate classes
- Model predicts distress up to 3 reporting periods ahead

**Relevance to STARC:**
- Altman's financial_health sub-signals (D/E, current ratio, ROE, FCF) are partial analogs to STARC's financial_health category
- Critical methodological precedent: a weighted composite of accounting ratios outperforms individual signals
- MDA weights were derived empirically to maximize class separation — STARC's weights are heuristic, not optimized. This is a core differentiator and potential weakness.

**What we adopt:**
- Validate that STARC's financial_health rules correlate with Z-Score at the stock level (sanity check)
- Report what fraction of low-scoring STARC stocks subsequently show financial distress

**What we avoid:**
- Claiming MDA or discriminant analysis validates our approach — STARC is not a bankruptcy predictor

---

### 3. Mohanram G-Score (2005) — Growth Stock Screening

**Full citation:** Mohanram, P.S. (2005). "Separating Winners from Losers among Low Book-to-Market Stocks using Financial Statement Analysis." *Review of Accounting Studies*, 10(2–3), 133–170.

**Methodology:**
- Universe: Bottom 20% by book-to-market ratio (highest P/B = growth stocks), U.S. stocks, 1979–1999
- 8 binary signals (0 or 1), summed to G-Score 0–8
- Three signal groups:
  - Traditional profitability/cash flow (3 signals): ROA, CFO/Assets, CFO > ROA
  - Growth-adjusted signals (3 signals): ROA variance (stability), sales growth variance (stability)
  - Conservative accounting proxies (2 signals): R&D intensity, capex intensity, advertising intensity
- Returns assessed using size/BM/momentum factor controls

**Key findings:**
- G-Score 6–8 significantly outperforms G-Score 0–1 within growth stock universe
- Most excess returns come from the **short side** (avoiding torpedo stocks with G-Score 0–1)
- Returns positive in all 21 years of the study period
- Robust after controlling for size, BM, momentum, accruals, equity offerings

**Relationship to STARC:**
- G-Score directly complements F-Score: F-Score works for value stocks, G-Score for growth stocks
- STARC applies to both simultaneously via category weights — this is a design choice that needs testing by universe segment
- STARC's growth_trajectory and financial_health rules partially overlap G-Score signals (revenue growth, EPS beats, ROE, FCF)

**What we adopt:**
- Segment STARC backtest by growth vs. value (P/B quintile) — does STARC work better in one segment?
- The finding that short-side alpha dominates is important: test whether STARC's worst quintile (score 0–20) drives most of the effect
- Use stability of earnings and sales growth, not just levels

---

### 4. Greenblatt's Magic Formula — ROC + Earnings Yield

**Full citation:** Greenblatt, J. (2005). *The Little Book That Beats the Market*. Wiley. Academic treatment: various independent backtests.

**Methodology:**
- Ranks all stocks simultaneously on two dimensions: Earnings Yield (EBIT/EV) and Return on Capital (EBIT / (Net Working Capital + Net Fixed Assets))
- Ranks are summed, top 20–30 stocks selected annually, equal-weighted
- Original backtest: 3,500 largest U.S. stocks, 1988–2004

**Key findings (original):**
- Greenblatt's own backtest: 30.8% annually vs. 12.4% S&P 500 (1988–2004) — widely suspected of survivorship bias
- Independent replications (more credible):
  - U.S. 2003–2015: 11.4% annually vs. 8.7% S&P (2.7% alpha)
  - U.S. 23-year backtest: 17.2% vs. 8.0% market
  - French market 1999–2019: 5–9% annual alpha
  - Hong Kong 2001–2014: 6–15% alpha depending on size
- 2024 academic study (1963–2022): All four formulas (Magic Formula, F-Score, Acquirer's Multiple, Conservative Formula) generate significant raw and risk-adjusted returns, primarily through exposure to known style factors — no formula consistently dominates
- Magic Formula post-2004 performance significantly weaker than original claim

**Relevance to STARC:**
- Magic Formula = quality (ROC) + value (earnings yield). This is two of STARC's six categories.
- STARC's competitive_moat (gross margin, ROE, operating margin) partially proxies ROC
- STARC's valuation category (P/E, PEG, EV/EBITDA) partially proxies earnings yield
- The 2024 finding that formula returns are explained by known style factors is a critical warning: STARC's alpha may simply be recombining FF5 exposures

**What we adopt:**
- Test whether STARC's top quintile has significant alpha *after* controlling for both value and quality factors simultaneously
- Report both gross returns and factor-adjusted alpha separately
- Do not claim the approach is novel relative to Magic Formula without demonstrating the other 4 categories add incremental value

---

## Part II: Factor Models — What Our Categories Map To

### 5. Fama-French Five-Factor Model (2015)

**Full citation:** Fama, E.F. & French, K.R. (2015). "A Five-Factor Asset Pricing Model." *Journal of Financial Economics*, 116(1), 1–22.

**The five factors:**
- MKT-RF: Market excess return
- SMB: Small Minus Big (size)
- HML: High Minus Low book-to-market (value)
- RMW: Robust Minus Weak operating profitability
- CMA: Conservative Minus Aggressive investment

**Construction:** Independent sorts on size (NYSE median) and two or three characteristic groups; value-weighted portfolios at intersections. Factor = long top group minus short bottom group, averaged across size groups.

**Key findings:**
- FF5 materially improves on FF3 in explaining cross-sectional returns
- HML becomes **redundant** in FF5: its information is subsumed by RMW and CMA
- The model still fails the GRS test — small firms with high investment and low profitability have large unexplained negative alphas
- R² of FF5 on diversified portfolios: 90%+

**STARC category mapping to FF5:**

| STARC Category | FF5 Factor(s) | Notes |
|---|---|---|
| competitive_moat | RMW (profitability) | Gross margin, ROE, operating margin are profitability proxies |
| growth_trajectory | CMA (investment) + RMW | Revenue growth and EPS beats partially map to investment factor |
| valuation | HML (value) | P/E, PEG, EV/EBITDA are value factor proxies |
| financial_health | RMW, CMA | D/E, current ratio, FCF partially map to profitability/investment |
| ownership_conviction | None direct | Short interest, institutional ownership not in FF5 |
| risks | None direct | Filing-based risk signals not in FF5 |

**Critical implication:** If STARC's composite score is primarily loading on RMW (profitability) and HML (value), which are already known to predict returns, then STARC's alpha will shrink toward zero after FF5 controls. The genuine novel contribution of STARC would need to come from the ownership_conviction and risks categories, which have no FF5 analog.

**What we adopt:**
- Run full FF5 regressions on STARC quintile portfolios — this is mandatory for publication-quality work
- Test incremental alpha of each category separately: remove one category at a time, compare FF5 alpha
- Use GRS joint test across all five quintile portfolios to test whether FF5 explains STARC returns

---

### 6. Asness, Frazzini & Pedersen (2019) — Quality Minus Junk

**Full citation:** Asness, C.S., Frazzini, A. & Pedersen, L.H. (2019). "Quality Minus Junk." *Review of Accounting Studies*, 24(1), 34–112.

**Quality definition:** Stocks that are safe, profitable, growing, and well-managed. Four proxies averaged into single quality score:
1. **Profitability:** Gross profit/assets, ROE, ROA, CFOA, GMAR (gross margin), accruals
2. **Growth:** 5-year growth in profitability measures above
3. **Safety:** BAB (beta), leverage, Ohlson O-score (bankruptcy risk), ROE volatility, cash flow volatility
4. **Payout:** Net issuance, repurchases, dividend payments

**Construction:** Long top 30% quality, short bottom 30% (junk), within large-cap and small-cap universes separately. Value-weighted.

**Key findings:**
- QMJ factor earns significant risk-adjusted returns in U.S. and across 24 countries
- Positive in 23/24 countries, robust to factor controls
- QMJ exhibits negative market, value, and size exposures — it's NOT just a value play
- High-quality stocks have higher prices but not sufficiently so — quality is underpriced
- QMJ shows mild positive convexity: benefits during flight-to-quality in crises
- The return cannot be tied to known risk factors — it is either an anomaly or unexplained risk

**STARC overlap with QMJ:**

| QMJ dimension | STARC analog |
|---|---|
| Profitability (gross margin, ROE, ROA, CFOA) | competitive_moat rules, financial_health rules |
| Growth (5-yr profitability growth) | growth_trajectory rules (revenue growth, EPS) |
| Safety (leverage, O-score, volatility) | financial_health rules (D/E, current ratio, FCF) |
| Payout (net issuance, buybacks) | ownership_conviction (no new issuance signal) |

**Critical finding:** STARC's competitive_moat + financial_health + growth_trajectory categories are a close approximation of QMJ's quality factor. If QMJ already exists as a known tradeable factor (AQR publishes it), STARC must demonstrate alpha *after* controlling for QMJ exposure, not just FF5.

**Recommended addition:** Add QMJ as a sixth control factor in STARC regressions alongside FF5. If alpha survives, STARC contributes beyond quality.

**What we adopt:**
- QMJ factor data is publicly available from AQR — download and use as additional control
- Use QMJ's profitability sub-components as inspiration to sharpen STARC's moat proxies

---

### 7. Novy-Marx (2013) — The Gross Profitability Premium

**Full citation:** Novy-Marx, R. (2013). "The Other Side of Value: The Gross Profitability Premium." *Journal of Financial Economics*, 108(1), 1–28.

**Methodology:**
- Universe: All Compustat firms, July 1963 – December 2010, excluding financials (SIC 6xxx)
- Gross profitability = (Revenue − COGS) / Total Assets
- Scaled by book assets (not equity) to avoid conflating with leverage
- Monthly portfolio sorts: deciles, then long-short analysis
- Controls: FF3 factors, size, momentum

**Key findings:**
- Gross profitability has **roughly equal predictive power** for returns as book-to-market ratio
- Highly profitable firms outperform unprofitable firms despite having higher valuation ratios
- Correlation between gross profitability factor and HML value factor: **−0.50** (complementary, not redundant)
- Profitable firms also exhibit: higher gross margin, higher investment rate, higher recent returns
- Premium survives FF3 controls, adding economically significant alpha

**Direct validation for STARC:**
- STARC's `gross_margin > 60%` rule in competitive_moat has **direct academic backing** from this paper
- Gross margin as a moat proxy is the most academically validated of STARC's signals
- The −0.50 correlation with HML means gross margin signals won't be fully absorbed by the value factor in regressions

**What we adopt:**
- Scale gross margin as gross profit / total assets (Novy-Marx's exact definition) for the backtest version — not just gross profit / revenue
- Report gross margin quintile spread separately from the full STARC score
- Cite Novy-Marx explicitly as academic support for competitive_moat's gross margin rules

---

### 8. Jegadeesh & Titman (1993) — Momentum

**Full citation:** Jegadeesh, N. & Titman, S. (1993). "Returns to Buying Winners and Selling Losers: Implications for Stock Market Efficiency." *Journal of Finance*, 48(1), 65–91.

**Methodology:**
- Universe: All NYSE/AMEX stocks (not NASDAQ), excluding stocks priced < $5
- Ranking period: past 3–12 months returns
- Holding period: 3–12 months
- Key variant: 6-month formation, 6-month holding, skip 1 month (to avoid bid-ask bounce)
- Equal-weighted decile portfolios

**Key findings:**
- 6/6 momentum strategy earns ~1% per month (t-stat: 3.07), 1965–1989
- Not explained by systematic risk or delayed reactions to common factors
- Annualized: ~10–12% gross returns from long-short momentum
- Reversal after 12 months: returns partially dissipate in years 2–3
- Best variant: 12-month formation / 3-month holding (highest returns)
- Global: Confirmed in Europe (Rouwenhorst 1998), Asia ex-Japan

**STARC's price rules as momentum signals:**
STARC's price rules (month_change > +15%, week +5% and month +3%, MA20 vs. MA50, 52-week high) are momentum signals. These rules fire for competitive_moat and growth_trajectory categories.

**Problem:** Momentum is a known, well-priced factor (Carhart 1997 adds UMD — Up Minus Down). STARC's price-based signals will load on the momentum factor. Alpha from price rules will be attributed to momentum in factor regressions.

**Implication:** STARC should add momentum (UMD/Carhart factor) to its control regressions. If momentum explains the price-rule contribution, those rules add no independent value.

**What we adopt:**
- Skip 1 month between score formation and portfolio holding period (prevents bid-ask bias)
- Add Carhart momentum factor to all regressions
- Test whether removing price rules from STARC changes FF5 alpha materially

---

## Part III: Methodology and Avoiding Pitfalls

### 9. Harvey, Liu & Zhu (2016) — Multiple Testing in Finance

**Full citation:** Harvey, C.R., Liu, Y. & Zhu, C. (2016). "…and the Cross-Section of Expected Returns." *Review of Financial Studies*, 29(1), 5–68.

**Core argument:**
- By 2012, over 316 factors had been proposed in published academic literature
- Most were tested using a single t-statistic threshold of 2.0 (p < 0.05)
- Given 316 independent tests at p < 0.05, we expect 316 × 0.05 = **15.8 false discoveries** even if all factors are noise
- Standard p-values are systematically too permissive given the history of testing

**Recommended threshold:**
- For a newly discovered factor **today**: t-statistic > **3.0** (not the standard 1.96)
- This accounts for the cumulative testing across all published and unpublished research
- The threshold would have been lower (≈ 2.0) in 1967 when fewer factors had been tested

**Methods used:**
- Bonferroni correction (conservative): controls family-wise error rate
- Benjamini-Hochberg (BH): controls false discovery rate (FDR) at 5%
- Holm-Bonferroni: step-down correction
- All methods applied to the catalog of published factors over time

**For STARC specifically:**
- STARC has approximately 30 rules across 6 categories
- With 30 rules tested simultaneously, at p < 0.05, we expect ~1.5 false discoveries by chance
- The composite score partially mitigates this (rules are combined, not individually tested)
- But we still need to apply multiple testing correction when testing individual rules' contributions

**What we adopt:**
- Require t-statistic > 3.0 for the composite STARC score alpha to claim significance
- When testing individual category contributions, apply Benjamini-Hochberg FDR correction
- Report both uncorrected and FDR-corrected p-values in all tables
- Pre-register the study hypotheses before running the backtest (reduces data mining concern)

**What we avoid:**
- Claiming significance based on t > 1.96 for a composite with 30 underlying rules
- Testing many score variants and reporting the best-performing one

---

### 10. Hou, Xue & Zhang (2020) — Replicating Anomalies

**Full citation:** Hou, K., Xue, C. & Zhang, L. (2020). "Replicating Anomalies." *Review of Financial Studies*, 33(5), 2019–2133.

**Methodology:**
- Attempted systematic replication of 452 published anomalies using CRSP/Compustat
- Key corrections vs. original papers:
  - NYSE breakpoints (not all-stock breakpoints) to avoid microcap dominance
  - Value-weighted returns (not equal-weighted)
  - Proper treatment of financial firms and penny stocks

**Key findings:**
- Under single-test threshold (|t| ≥ 1.96): **65% of 452 anomalies fail to replicate**
- Under multiple-testing threshold (|t| ≥ 2.78): **82% fail**
- Under Benjamini-Yekutieli correction (5% FDR): threshold rises to |t| ≥ 3.47 to 4.27
- Replication rates by category: momentum (87.7%), value/growth (75.4%), investment (94.7%), profitability (44.7%), trading frictions (41.5%)
- Even for replicating anomalies, economic magnitudes are substantially smaller than reported

**For STARC:**
- The 65% single-test failure rate means that among STARC's ~30 rules, roughly 20 may have no genuine predictive content when properly tested
- Value-weighted returns are the appropriate standard — equal-weighted can make microcap noise look like alpha
- The 41.5% replication rate for trading friction anomalies suggests STARC's ownership/short interest signals are the least likely to replicate

**What we adopt:**
- Use NYSE breakpoints for quintile formation (not all-stock breakpoints)
- Report value-weighted portfolio returns as primary result; equal-weighted as robustness check
- Exclude stocks below $5 price and bottom NYSE size decile (penny stocks)
- Use proper reporting lag (Compustat data available ~4 months after fiscal year-end)

---

### 11. Chordia, Goyal & Saretto (2020) — p-Hacking Evidence

**Full citation:** Chordia, T., Goyal, A. & Saretto, A. (2020). "Anomalies and False Rejections." *Review of Financial Studies*, 33(5), 2134–2179.

**Methodology:**
- Generated 2.1 million trading strategies from real data using brute-force search
- Computed t-statistic thresholds controlling multiple hypothesis testing
- Estimated proportion of false rejections under single-hypothesis testing

**Key findings:**
- Expected proportion of false rejections: **45.3%** without multiple testing correction
- Recommended t-stat thresholds: **3.8** (time-series regressions), **3.4** (cross-sectional)
- Of 2.1 million strategies, only **17 survive** all corrections (0.0008%)
- These 17 have no clear theoretical basis and don't overlap published anomalies

**Implication for STARC:**
- STARC's rules were not derived from systematic data mining but from fundamental economic reasoning — this partially mitigates the concern
- However, any backtest of STARC will face this critique unless rules are pre-specified and locked before any historical data is examined
- The economic rationale for each rule (moat = gross margin, financial health = FCF, etc.) must be stated before testing

**What we adopt:**
- Lock all 30 rules before running any backtest
- Document economic rationale for each rule in the paper
- Use the 3.4–3.8 threshold (not 2.0) for cross-sectional results

---

### 12. McLean & Pontiff (2016) — Post-Publication Decay

**Full citation:** McLean, R.D. & Pontiff, J. (2016). "Does Academic Research Destroy Stock Return Predictability?" *Journal of Finance*, 71(1), 5–32.

**Methodology:**
- Studied 97 variables shown to predict cross-sectional returns
- Compared: in-sample returns, out-of-sample pre-publication returns, post-publication returns
- Examined changes in trading volume and short interest post-publication

**Key findings:**
- Portfolio returns are **26% lower** out-of-sample (data mining estimate)
- Portfolio returns are **58% lower** post-publication vs. in-sample
- Only **32% of the decline** (58% − 26%) is attributable to publication-informed trading
- Post-publication alpha does not disappear entirely — it is diminished, not eliminated
- In-sample monthly return: 0.582%; pre-publication out-of-sample: 0.402%; post-publication: 0.264%
- Decay driven by idiosyncratic risk (higher idiosyncratic risk stocks decay more slowly — arbitrage harder)

**For STARC:**
- STARC's rules draw on Piotroski (2000), Novy-Marx (2013), and other published papers
- By McLean-Pontiff, returns to strategies based on published academic anomalies are already ~58% below their historical in-sample peaks
- If STARC back-tests well (say, 8% annual alpha), the genuine forward-looking alpha may be closer to 3–4%
- However, the non-zero residual suggests real return potential remains

**What we adopt:**
- Apply McLean-Pontiff decay factor as a forward-return discount in the paper's conclusion
- Test whether STARC's returns decay over time within the 10-year backtest window (earlier years vs. later years)
- Acknowledge that backtest alpha overstates live trading expectation

---

### 13. Lopez de Prado (2018) — Proper Backtesting Methodology

**Full citation:** López de Prado, M. (2018). *Advances in Financial Machine Learning*. Wiley.

**Key methodological principles:**

**On backtesting:**
- "Backtesting is not a research tool. Feature importance is."
- Standard k-fold cross-validation fails in finance — temporal ordering must be preserved
- Walk-forward testing produces a single path estimate with high variance

**Purged K-Fold CV:**
- Remove training observations whose labels overlap in time with test labels
- Add an "embargo" after test period before next training period
- Prevents information leakage across temporal boundaries

**Combinatorial Purged Cross-Validation (CPCV):**
- Partition data into N ordered groups, test k groups in C(N,k) combinations
- Generates a *distribution* of performance estimates (not a single point estimate)
- Enables Probability of Backtest Overfitting (PBO) and Deflated Sharpe Ratio (DSR) calculation

**Overfitting indicators to monitor:**
- In-sample Sharpe >> out-of-sample Sharpe (ratio > 2x is suspicious)
- Performance improves monotonically with number of rules (sign of overfitting)
- Best performance concentrated in specific sub-periods
- Strategy requires many parameter choices to work

**For STARC:**
- STARC's scoring rules are deterministic and fixed — no parameter optimization. This dramatically reduces overfitting risk compared to ML approaches
- Monthly rebalancing over 10 years provides ~120 time periods — sufficient for meaningful walk-forward testing
- Use walk-forward: train on years 1–5, test on years 6–10; then train 1–7, test 8–10; etc.
- Report Deflated Sharpe Ratio (DSR) to account for multiple testing of score variants

**What we adopt:**
- 5-year walk-forward windows minimum
- Report Deflated Sharpe Ratio alongside raw Sharpe
- Test stability: does score → return relationship hold in each rolling 3-year sub-window?

---

### 14. Green, Hand & Zhang (2017) — Which Characteristics Survive

**Full citation:** Green, J., Hand, J.R.M. & Zhang, X.F. (2017). "The Characteristics that Provide Independent Information about Average U.S. Monthly Stock Returns." *Review of Financial Studies*, 30(12), 4389–4436.

**Methodology:**
- Simultaneously included 94 firm characteristics in Fama-MacBeth regressions
- Avoided overweighting microcaps
- Applied data-snooping bias adjustment (BH correction)
- Sample: 1980–2014

**Key findings:**
- Of 94 characteristics tested simultaneously: **only 12 survive** after microcap exclusion and data-snooping correction
- Post-2003: return predictability collapsed. Only **2 characteristics** survive since 2003:
  - Industry-adjusted change in number of employees (chempia)
  - Number of consecutive quarters with earnings increases (nincr)
- Long-short hedge returns from all 94 variables have been **insignificantly different from zero since 2003** for non-microcap stocks

**For STARC:**
- This is a severe warning: even among 94 carefully chosen variables, essentially none survive multiple testing in large/mid-cap stocks post-2003
- STARC's backtest period will overlap heavily with the post-2003 "collapse" period
- The result suggests STARC's alpha, if found, may be driven by microcap positions — which are costly to trade
- The surviving variables (employee count changes, earnings streak) are not directly in STARC's current rules

**What we adopt:**
- Exclude microcaps from the primary analysis — the "alpha" there is likely illiquid and untradeable
- Report results separately for: S&P 500 universe (large-cap), Russell 1000 (large/mid), full universe
- Accept that large-cap STARC results may show near-zero factor-adjusted alpha

**What we avoid:**
- Reporting aggregate alpha driven by microcaps as evidence that STARC "works"

---

### 15. Fama-MacBeth (1973) Regression — Implementation Details

**Full citation:** Fama, E.F. & MacBeth, J.D. (1973). "Risk, Return, and Equilibrium: Empirical Tests." *Journal of Political Economy*, 81(3), 607–636.

**Two-stage procedure:**
1. **First stage (time-series):** For each asset i, regress monthly returns on factors over rolling window to estimate betas (factor loadings)
2. **Second stage (cross-sectional):** For each month t, regress all stock returns on their betas and characteristics to estimate risk premia (lambda)
3. **Inference:** Average the T monthly lambda estimates; t-statistic = mean / (std dev / √T)

**Corrections needed:**
- Errors-in-variables (EIV) problem: beta estimation error biases second-stage results
- Use Newey-West standard errors to correct for serial correlation in monthly lambda estimates
- Weighted least squares (WLS) reduces influence of outliers

**For STARC:**
- Fama-MacBeth is the standard method for asking: "Does STARC score predict cross-sectional returns after controlling for known factors?"
- Run monthly cross-sectional regressions: Return_{i,t+1} = a + b × STARC_Score_{i,t} + controls + epsilon
- Controls: log(market cap), log(B/M), momentum (past 12-month return), beta, RMW loading, CMA loading
- Report time-series average of b with Newey-West t-statistics

**What we adopt:**
- Fama-MacBeth as the primary cross-sectional test (not just portfolio sorts)
- Use both portfolio sorts (quintiles) AND Fama-MacBeth regressions — they are complementary
- Newey-West standard errors with 6-lag correction for monthly data

---

### 16. Kim, Muhn & Nikolaev (2024) — LLMs for Financial Statement Analysis

**Full citation:** Kim, A.G., Muhn, M. & Nikolaev, V.V. (2024). "Financial Statement Analysis with Large Language Models." BFI Working Paper No. 2024-65. *(Note: Paper was temporarily withdrawn in February 2025 for data replication issues — results should be treated as preliminary until revised version published.)*

**Stated methodology (pre-withdrawal):**
- Universe: All Compustat annual data, 1968–2021
- LLM: GPT-4, with anonymized/standardized financial statements (no company names, years replaced with "Period t")
- Task: Predict direction of next-year earnings change
- Benchmarks: Stepwise logistic regression (52.9% accuracy), ANN (60.4%)

**Stated findings (pre-withdrawal):**
- GPT-4 accuracy: ~60.4% (comparable to ANN)
- GPT-4 "outperformed financial analysts" in directional earnings prediction
- Trading strategy based on GPT predictions: higher Sharpe ratio than alternatives
- Chain-of-thought prompting (reasoning before answering) outperforms simple prompting

**Relevance to STARC:**
- STARC uses GPT-4o-mini for news headline interpretation (LLM news mapping) but NOT for the deterministic scoring
- The Kim et al. approach is the LLM analog — they strip away all qualitative text and test purely on financial ratios
- **Important:** The paper's withdrawal for data replication issues is a cautionary tale for our own study — document data lineage carefully

**What we adopt:**
- STARC's hybrid design (deterministic rules + optional LLM news layer) is well-positioned — we can test alpha with and without LLM signals
- The LLM news layer should be treated as a separate, optional factor in regressions

---

### 17. Lopez-Lira & Tang (2023) — ChatGPT Forecasting Stock Returns

**Full citation:** Lopez-Lira, A. & Tang, Y. (2023/2024). "Can ChatGPT Forecast Stock Price Movements? Return Predictability and Large Language Models." *Journal of Chinese Economic and Business Studies*, 21(4). arXiv: 2304.07619.

**Methodology:**
- Data: CRSP daily returns, NYSE/NASDAQ/AMEX common stocks with news coverage
- LLM: GPT-4 (training cutoff September 2021, ensuring genuine out-of-sample)
- Task: Given news headline, predict whether stock rises or falls next day
- Scoring: YES = 1, UNKNOWN = 0, NO = −1

**Key findings:**
- GPT-4 scores significantly predict next-day stock returns
- Long-short strategy based on GPT-4 scores: Sharpe ratio of **3.8**
- Performance declines sharply over time: Sharpe of 6.54 in 2021Q4 → 3.68 in 2022 → 2.33 in 2023 → 1.22 in Jan-May 2024
- Smaller/simpler models (GPT-1, GPT-2, BERT) cannot forecast returns — capability is emergent in large models
- Returns decline as LLM adoption rises: consistent with efficiency improving

**Relevance to STARC:**
- STARC's LLM news mapping uses GPT-4o-mini on headlines — directly analogous
- The rapid decay in predictive power (6.54 → 1.22 Sharpe in 3 years) suggests the news-sentiment alpha is being arbitraged away quickly
- STARC's deterministic rule-based alpha is less susceptible to this arbitrage than news-sentiment signals
- The multi-day (not daily) rebalancing in STARC avoids the high-frequency regime where LLM decay is fastest

**What we avoid:**
- Basing the study's alpha claim on LLM news signals, which appear to decay rapidly
- Using daily rebalancing — monthly scoring is more durable

---

## Part IV: Additional Methodology

### 18. Sloan (1996) — Accruals Anomaly

**Full citation:** Sloan, R.G. (1996). "Do Stock Prices Fully Reflect Information in Accruals and Cash Flows about Future Earnings?" *Accounting Review*, 71(3), 289–315.

**Key findings:**
- Accrual component of earnings is less persistent than cash component
- Market overweights accruals and underweights cash flows
- Hedge strategy (long low-accrual, short high-accrual): ~12% annual return

**STARC relevance:** STARC's financial_health rule `FCF < 0 → negative` and the moat rule `CFO > ROA` (from F-Score) directly implement accrual quality signals. Academic support is strong.

---

### 19. Gibbons, Ross & Shanken (1989) — GRS Test

**Full citation:** Gibbons, M., Ross, S. & Shanken, J. (1989). "A Test of the Efficiency of a Given Portfolio." *Econometrica*, 57(5), 1121–1152.

**The test:** Joint F-test of null that all N portfolio alphas are simultaneously zero. Distribution: F(N, T−N−L) where L = number of factors.

**Application:** When testing STARC quintile portfolios against FF5, the GRS test is the joint test of whether all 5 quintile portfolios have zero alpha. If GRS rejects, the model cannot explain STARC's quintile spread. This is the **most rigorous** test of whether STARC generates genuine alpha beyond known factors.

**What we adopt:** Report GRS statistic and p-value for all factor model regressions.

---

## Part V: Synthesis

### 5.1 Decision Matrix — Study Design Choices

| Design Choice | Informing Papers | Recommendation |
|---|---|---|
| **Universe** | Hou et al. (2020), Green et al. (2017) | Primary: Russell 1000 (non-microcap). Secondary: full universe. Exclude stocks < $5, bottom NYSE size decile |
| **Holding period** | Jegadeesh-Titman (1993), McLean-Pontiff (2016) | Monthly scoring, skip 1 month before portfolio formation; test 1-month, 3-month, 12-month holding periods |
| **Portfolio formation** | Piotroski (2000), Hou et al. (2020) | NYSE breakpoints for quintile cutoffs; value-weighted portfolios as primary, equal-weighted as robustness |
| **Statistical tests** | Fama-MacBeth (1973), GRS (1989) | Portfolio sorts (quintile spreads) + Fama-MacBeth cross-sectional regressions + GRS joint test |
| **Factor controls** | FF5 (2015), QMJ (2019), Carhart (1997) | FF5 + momentum (UMD) + QMJ as six-factor model; report incremental alpha |
| **Multiple testing** | Harvey-Liu-Zhu (2016), Chordia et al. (2020) | Require t > 3.0 for composite score; BH correction for individual category tests |
| **Backtesting** | Lopez de Prado (2018), McLean-Pontiff (2016) | Walk-forward with 5-year training windows; report Deflated Sharpe Ratio; test sub-period stability |
| **Data requirements** | Hou et al. (2020), Sloan (1996) | Point-in-time Compustat data with proper reporting lag (4-month lag for annual data); CRSP for returns |
| **Post-publication adjustment** | McLean-Pontiff (2016) | Apply 58% decay factor to estimate live trading alpha from backtest results |
| **Transaction costs** | Novy-Marx-Velikov (2016) | Report both gross and net-of-cost returns; assume 50 bps round-trip for large-cap, 150 bps for small-cap |

---

### 5.2 STARC Category → Factor Mapping (Full Analysis)

| STARC Category | Weight | Primary FF5 Factor | Secondary | Novel vs. Known |
|---|---|---|---|---|
| competitive_moat | 8.0 | RMW (profitability) | None | Gross margin per Novy-Marx is known; ROE per QMJ is known. Novel element: operating margin threshold specificity |
| risks | 7.0 | None | None | Filing-based risk (8-K count) has limited academic backing. Short interest partially covered by existing literature |
| growth_trajectory | 6.0 | CMA (investment) + RMW | Momentum | Revenue growth/EPS beats overlap with RMW and momentum. EPS surprise overlap with post-earnings drift literature |
| valuation | 5.0 | HML (value) | None | P/E, PEG, EV/EBITDA are HML proxies. Largely known factor |
| financial_health | 5.0 | RMW + CMA | None | D/E, current ratio, FCF closely track Altman Z-Score and Ohlson O-Score — already documented |
| ownership_conviction | 4.0 | None | QMJ payout | Short interest (known anomaly), institutional ownership (known but decaying), insider Form 4 (known but weak). This is STARC's most novel category |

**Conclusion:** Four of six categories (moat, growth, valuation, health) primarily repackage known FF5/QMJ factors. The genuine differentiation is: (a) the specific thresholds and combination weighting, (b) the risks category (8-K filing analysis), and (c) the ownership_conviction category — particularly the integration of short interest with institutional conviction and insider signals.

---

### 5.3 Novel Contribution Analysis

**What STARC adds beyond existing literature:**

1. **Multi-category composite:** Existing composites (F-Score, G-Score, Magic Formula) use 2–3 categories. STARC's 6-category structure with asymmetric weights (deductions ≠ credits for risks) is architecturally novel.

2. **Bidirectional scoring (50 ± adjustments):** Unlike binary F-Score signals, STARC applies diminishing returns decay across multiple signals per thesis point. This is not documented in the academic literature.

3. **Thesis-conditional scoring:** STARC scores the same stock differently depending on which thesis bullets the investor has selected. This user-personalization layer has no academic precedent for a return-prediction study (note: for the backtest, a standardized "all thesis points active" mode would be used).

4. **Risks asymmetry:** STARC intentionally weights deductions for risks (7.0) higher than credits (4.0) — reflecting loss aversion and asymmetric downside. No academic composite scoring system formalizes this asymmetry.

5. **Filing-based signals (8-K count):** The use of SEC filing velocity as a risk indicator is not standard in published factor literature, though it overlaps with event-driven research.

6. **LLM news layer as optional add-on:** The modular design allowing LLM news signals to be switched off is methodologically clean — we can measure the deterministic alpha separately from the LLM contribution.

**What is NOT novel:**
- Individual signals (gross margin, ROE, D/E, P/E, short interest, momentum) are all individually documented
- Composite scoring using binary/scaled signals has clear precedent (Piotroski, Mohanram, Altman)
- Quintile portfolio sorting methodology is entirely standard

---

### 5.4 Risk Assessment — Probability of Finding Significant Alpha

**Base rate estimate:**
- Harvey et al. (2016): ~55% of factors fail at t > 3.0 (Harvey's own estimate of false discovery proportion)
- Hou et al. (2020): 65–82% of anomalies fail replication
- Green et al. (2017): near-zero replication for non-microcap since 2003
- McLean-Pontiff (2016): 58% post-publication decay on known signals

**STARC-specific considerations:**

*Factors favoring alpha:*
- STARC draws on multiple independently validated factors (gross margin, momentum, quality)
- Combination of signals may capture interaction effects not captured by individual factors
- The risks and ownership_conviction categories have limited coverage in existing literature
- Deterministic rules prevent overfitting to historical noise (unlike ML models)

*Factors against alpha:*
- Most signals are already known and tradeable (FF5, QMJ, momentum) — arbitrage already reduced returns
- The 2003 structural break in factor predictability (Green et al.) is within our backtest window
- Post-publication decay means drawing on Piotroski/Novy-Marx already reduces expected alpha
- Transaction costs at monthly rebalancing: 50–150 bps/round trip erodes ~1–3% annual gross alpha
- The QMJ factor already captures most of STARC's moat/health/growth signals as a single known factor

**Probability assessment:**
- Probability STARC shows statistically significant gross alpha (t > 2.0): **60–70%** — the combination of validated signals should show some return
- Probability STARC shows significant alpha after FF5 + QMJ + momentum controls (t > 3.0): **20–35%**
- Probability net-of-cost alpha remains positive for large-cap universe: **15–25%**
- Probability of finding alpha from STARC's unique elements (risks + ownership weighting) specifically: **10–20%**

**Most likely failure modes (ranked by probability):**
1. **Factor absorption:** FF5 + QMJ controls eliminate most or all alpha. STARC is repackaging known factors. (Most likely, ~50% probability)
2. **Microcap concentration:** Alpha exists but only in illiquid, untradeable small stocks. (35%)
3. **Post-2003 structural break:** Alpha exists pre-2003 but not in the last 20 years. (30%)
4. **Transaction cost erosion:** Gross alpha of 3–5% wiped out by 2–4% transaction costs at monthly rebalancing. (25%)
5. **Data issues:** Look-ahead bias in financial statement data (using restated figures); survivorship bias if delisted stocks excluded. (15% if using proper point-in-time data)

---

### 5.5 Recommended Methodology Refinements

Based on the literature, the following changes to the study design will materially improve scientific validity:

**Critical (must-have for publication quality):**

1. **Use point-in-time Compustat data with 4-month reporting lag.** Annual financial statements are not available immediately at fiscal year-end. Using them without a lag introduces look-ahead bias. Standard: apply signals using data available as of June 30 each year (for fiscal years ending December 31).

2. **Include delisted stocks.** CRSP contains delisting returns. Excluding bankrupt/delisted stocks overstates returns by 1.5–2% annually (survivorship bias).

3. **Value-weight portfolios.** Equal-weighting overweights microcaps, creating an artificial alpha that is not investable. Report both, but primary = value-weighted.

4. **Use NYSE breakpoints for quintiles.** If all-stock breakpoints are used, most of the "bottom quintile" will be microcaps, artificially inflating the spread.

5. **Control for FF5 + momentum + QMJ in all regressions.** The six-factor model is the current standard. Report whether STARC alpha survives.

6. **Apply GRS test.** Report the joint test of whether all quintile alphas are zero.

7. **Lock all rules before touching any return data.** Pre-registration (e.g., on OSF.io) before running any backtest is the gold standard.

**Important (substantially improves credibility):**

8. **Segment results by market cap.** Report Russell 1000 separately from full universe. Readers need to know if alpha is investable.

9. **Report sub-period stability.** 2014–2019 vs. 2019–2024 sub-periods should show consistent alpha if the signal is genuine.

10. **Estimate transaction costs.** Report net-of-cost alphas using Novy-Marx-Velikov bid-ask spread estimates. Monthly rebalancing at full turnover is expensive.

11. **Apply BH correction to individual rule tests.** When testing whether individual signals (gross margin, ROE, etc.) contribute incremental alpha, FDR correction is required.

12. **Test the STARC score as a continuous variable, not just quintiles.** Fama-MacBeth regressions treat score as continuous, extracting more statistical power.

**Useful (adds robustness):**

13. **Test international replication.** If STARC generates alpha in U.S. and also in European/Asian markets, the finding is far more credible.

14. **Compare to QMJ directly.** Compute the correlation between STARC scores and QMJ scores. If correlation > 0.8, STARC is essentially QMJ in different form.

15. **Report Deflated Sharpe Ratio.** Corrects Sharpe ratio for multiple testing and strategy selection bias (López de Prado methodology).

---

## Appendix: Key Papers Quick-Reference

| Paper | Year | Journal | Key Contribution | Directly Applicable to STARC |
|---|---|---|---|---|
| Piotroski | 2000 | JAR | 9-signal financial health composite; 23% long-short alpha | Direct architectural precedent |
| Altman | 1968 | JF | Z-Score MDA for financial distress | financial_health category validation |
| Mohanram | 2005 | RAS | G-Score for growth stocks; short-side dominance | growth_trajectory, test by value/growth segment |
| Greenblatt | 2005 | Book | Magic Formula: quality + value combination | valuation + moat combination |
| Fama-French 5F | 2015 | JFE | Five-factor model with profitability and investment | Mandatory control model |
| Asness-Frazzini-Pedersen (QMJ) | 2019 | RAS | Quality factor: profitability + growth + safety | Sixth control factor; STARC overlap analysis |
| Novy-Marx | 2013 | JFE | Gross profitability premium | Direct validation for gross margin moat proxy |
| Jegadeesh-Titman | 1993 | JF | Momentum: 1%/month, 6/6 strategy | Price rules in STARC are momentum signals |
| Harvey-Liu-Zhu | 2016 | RFS | Multiple testing: t > 3.0 threshold | Significance threshold for STARC composite |
| Hou-Xue-Zhang | 2020 | RFS | 65–82% of anomalies fail replication | Universe construction; value-weighting |
| Green-Hand-Zhang | 2017 | RFS | Only 2 characteristics survive post-2003 | Severe warning for large-cap alpha |
| McLean-Pontiff | 2016 | JF | 58% post-publication return decay | Apply decay discount to backtest results |
| Chordia-Goyal-Saretto | 2020 | RFS | 45% false rejection rate; t > 3.4–3.8 needed | Strengthens Harvey et al. threshold recommendation |
| Sloan | 1996 | AR | Accruals anomaly; 12% annual hedge return | FCF and accruals rules in STARC |
| Fama-MacBeth | 1973 | JPE | Two-stage cross-sectional regression | Primary regression methodology |
| Gibbons-Ross-Shanken | 1989 | Econometrica | GRS joint test of portfolio alphas | Joint significance test for quintile portfolios |
| López de Prado | 2018 | Book | CPCV backtesting; Deflated Sharpe Ratio | Walk-forward methodology; overfitting checks |
| Lopez-Lira & Tang | 2023 | JCEBS | ChatGPT Sharpe 3.8 but rapidly decaying | LLM news signals decay fast; use deterministic rules |
| Kim-Muhn-Nikolaev | 2024 | BFI WP | LLM outperforms analysts on earnings direction (withdrawn) | Treat LLM layer as optional; test separately |

---

*This review was compiled in April 2026 using systematic web search of academic databases. All papers are cited as originally published. The Kim et al. (2024) paper was temporarily withdrawn in February 2025 for data replication review and should be cited with this caveat until a revised version is published.*
