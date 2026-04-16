# STARC: Scoring Engine Fixes + Alpha Validation Study

## Context

The STARC health score has three structural flaws in its scoring engine (dead zones, first-match truncation, missing moat rules) that produce weak signal coverage — 3 of 6 categories produce zero signal for a typical blue-chip stock. Before embarking on a rigorous backtest simulation, we must fix the engine we're testing. Simultaneously, we need a literature-grounded, publication-quality study design that can definitively answer: "Does following STARC scores generate alpha?"

The larger goal: produce research so rigorous it could be submitted to a top journal, use findings to improve the product, and create compelling marketing material that proves the methodology works (or learn exactly why it doesn't and fix it).

---

## Track 1: Scoring Engine Fixes

Three structural fixes, scoped to `signal_interpreter.py` and `thesis_evaluator.py`.

### Fix 1: Remove First-Match-Only Truncation

**Problem**: Each category produces at most ONE signal due to `if not signal_summary` guards. Multiple confirming/conflicting signals within a category are discarded.

**Solution**: Remove all `if not signal_summary` guards. Collect ALL matching signals per category as separate `ThesisSignalMapping` entries.

**Diminishing returns decay** (add to `thesis_evaluator.py`): Prevents double-counting correlated signals within the same category.

```
1st signal in category: 100% of (weight * confidence)
2nd signal in category:  60% of (weight * confidence)
3rd signal in category:  35% of (weight * confidence)
4th+ signal in category: 20% of (weight * confidence)
```

Implementation: In `thesis_evaluator.py`, group mappings by category, sort by confidence descending within each group, apply decay factor to each successive signal.

**Files**: 
- `backend/app/agents/signal_interpreter.py` — remove `if not signal_summary` guards in `_valuation_rules`, `_financial_health_rules`, `_growth_rules`, `_ownership_rules`
- `backend/app/agents/thesis_evaluator.py` — add decay logic when processing multiple signals per category

### Fix 2: Close Dead Zones with Graduated Thresholds

**Problem**: Rules fire only at extremes (P/E > 40, month_change > 15%, D/E > 200%). Most stocks most of the time sit in the gap where nothing triggers.

**Solution**: Add intermediate rules with lower confidence. The graduated confidence preserves the signal that extreme readings are stronger evidence.

**Price rules** — add to `_price_rules`:
```python
# Moderate uptrend (currently nothing between 0% and +15%)
month_change_pct > +8%  AND category in (competitive_moat, growth_trajectory)
  → positive, conf 0.45, "Solid monthly gain of X%"

# Moderate downtrend
month_change_pct < -8%  AND category in (competitive_moat, growth_trajectory)
  → negative, conf 0.45, "Notable monthly decline of X%"

# Short-term momentum confirming trend
week_change_pct > +5%  AND month_change_pct > +3%  AND category == growth_trajectory
  → positive, conf 0.40, "Building momentum: +X% week, +Y% month"

week_change_pct < -5%  AND month_change_pct < -3%  AND category in (competitive_moat, risks)
  → negative, conf 0.40, "Accelerating decline: X% week, Y% month"
```

**Valuation rules** — add to `_valuation_rules`:
```python
# Moderately expensive (currently nothing between P/E 15-40)
P/E > 30 AND PEG > 2.0
  → negative, conf 0.50, "Moderately expensive: P/E X, PEG Y"

P/E 15-20 AND PEG < 1.5
  → positive, conf 0.50, "Reasonable value: P/E X, PEG Y"

# EV/EBITDA (currently unused despite being fetched)
EV/EBITDA > 25
  → negative, conf 0.50, "High enterprise valuation: EV/EBITDA X"

EV/EBITDA < 10
  → positive, conf 0.50, "Attractive enterprise value: EV/EBITDA X"

# Price-to-book
P/B > 10
  → negative, conf 0.45, "Trading at Xx book value"

P/B < 1.5
  → positive, conf 0.50, "Near book value: P/B X"
```

**Financial health rules** — add to `_financial_health_rules`:
```python
# Moderate leverage (currently nothing between D/E 50-200%)
D/E 100-200%
  → negative, conf 0.40, "Moderate leverage: D/E X%"

D/E 50-100%
  → positive, conf 0.40, "Manageable leverage: D/E X%"

# Liquidity
current_ratio < 1.0
  → negative, conf 0.55, "Liquidity concern: current ratio X"

current_ratio > 2.0
  → positive, conf 0.45, "Strong liquidity: current ratio X"
```

**Growth rules** — add to `_growth_rules`:
```python
# Solid growth (currently nothing between 5-20%)
revenue_growth 10-20%
  → positive, conf 0.50, "Solid revenue growth at X% YoY"

revenue_growth 0-5%
  → negative, conf 0.40, "Revenue growth stalling at X% YoY"

# Modest EPS beat (currently requires > 10%)
EPS beat with surprise 5-10%
  → positive, conf 0.45, "Modest EPS beat of X%"

EPS miss with surprise -5% to -10%
  → negative, conf 0.45, "Modest EPS miss of X%"
```

**Files**: `backend/app/agents/signal_interpreter.py`

### Fix 3: Add Dedicated Competitive Moat Rules

**Problem**: The highest-weighted category (8.0) has ZERO dedicated rules. Only gets signals from price rules requiring extreme moves.

**Solution**: New `_moat_rules` function using quantitative moat proxies (well-established in academic literature — Novy-Marx 2013, Asness et al. 2019).

```python
def _moat_rules(fin: FinancialHealthSignal, val: ValuationSignal, 
                own: OwnershipSignal, theses: list[dict]) -> list[ThesisSignalMapping]:
    """Quantitative proxies for competitive moat strength."""
    mappings = []
    for t in theses:
        if t["category"] != "competitive_moat":
            continue

        # Gross margin as pricing power proxy (Novy-Marx 2013)
        if fin and fin.gross_margin is not None:
            if fin.gross_margin > 0.60:
                → positive, conf 0.60, "Gross margin X% — strong pricing power"
            elif fin.gross_margin > 0.40:
                → positive, conf 0.40, "Healthy gross margin of X%"
            elif fin.gross_margin < 0.25:
                → negative, conf 0.55, "Low gross margin X% — limited pricing power"

        # ROE as capital efficiency / moat proxy
        if fin and fin.roe is not None:
            if fin.roe > 0.25:
                → positive, conf 0.50, "ROE of X% — efficient capital deployment"
            elif fin.roe < 0:
                → negative, conf 0.50, "Negative ROE — no economic moat visible"

        # Institutional conviction as moat recognition
        if own and own.institutional_pct is not None:
            if own.institutional_pct > 0.75:
                → positive, conf 0.45, "X% institutional ownership — moat recognized"
            elif own.institutional_pct < 0.15:
                → negative, conf 0.40, "Low institutional interest at X%"

        # Operating margin stability (high = durable advantage)
        if fin and fin.operating_margin is not None:
            if fin.operating_margin > 0.25:
                → positive, conf 0.45, "Operating margin X% — durable advantage"
            elif fin.operating_margin < 0.05:
                → negative, conf 0.45, "Thin operating margin of X%"
    return mappings
```

**Files**: 
- `backend/app/agents/signal_interpreter.py` — add `_moat_rules` function, call it from `interpret_signals`
- Signal type imports may need adjustment to pass ownership data to the new function

### Documentation

Update `docs/scoring_algorithm.md`:
- Document all new rules with thresholds
- Document diminishing returns decay factors
- Fix the existing doc/code divergences (base score 50 not 100, threshold 0.50 not 0.45, green >= 75 not >= 70)
- Add rule coverage table showing which data sources feed which rules

---

## Track 2: Literature-Grounded Alpha Validation Study

### Phase 0: Literature Review

Deep review of the following research areas, searching for papers and analyzing methodology:

**A. Composite Score Systems (Direct Analogs)**
- Piotroski F-Score (2000) — 9 binary signals, demonstrated 7.5% annual alpha for value stocks. Closest methodology to STARC.
- Altman Z-Score (1968) — financial distress prediction via composite. Validation methodology is the template.
- Mohanram G-Score (2005) — growth stock screening complement to F-Score.
- Greenblatt Magic Formula — ROC + earnings yield composite ranking.

**B. Factor Models (What Our Categories Map To)**
- Fama-French 3-factor (1993) and 5-factor (2015) — value, size, profitability, investment
- Asness, Frazzini, Pedersen "Quality Minus Junk" (2019) — quality factor decomposition
- Novy-Marx (2013) — gross profitability premium (our moat proxy)
- Jegadeesh & Titman (1993) — momentum (our price rules)
- Stambaugh, Yu, Yuan (2012) — sentiment and short interest

**C. Methodology / Avoiding Pitfalls**
- Harvey, Liu, Zhu (2016) "...and the Cross-Section of Expected Returns" — multiple testing crisis (316 factors "discovered", most are false)
- Lopez de Prado (2018) — proper backtesting, avoiding overfitting, combinatorial purged cross-validation
- McLean & Pontiff (2016) — post-publication decay of anomalies (factors weaken after papers are published)
- Green, Hand, Zhang (2017) — which of 94 characteristics actually provide independent information

**D. LLM + Finance (Emerging)**
- Kim et al. (2024) "Financial Statement Analysis with Large Language Models"
- Chen et al. (2024) "Can LLMs Predict Stock Returns?"
- Lopez-Lira & Tang (2023) "Can ChatGPT Forecast Stock Price Movements?"

**Deliverable**: A synthesis document mapping each paper's methodology and findings to our study design decisions. Not a literature summary — a decision matrix.

### Study Design: Publication-Quality Simulation

#### Research Question

**Primary hypothesis**: Stocks scoring in the top quintile (Q5) of the STARC composite score generate statistically significant positive alpha relative to a market benchmark over subsequent 3, 6, and 12 month holding periods.

**Secondary hypotheses**:
- H2: A long-short portfolio (long Q5, short Q1) generates alpha after controlling for Fama-French 5 factors
- H3: Individual signal categories contribute incrementally to predictive power (ablation study)
- H4: Score predictiveness varies across market regimes (bull/bear/high-vol/low-vol)

#### Universe Construction

**Target**: S&P 500 + S&P MidCap 400 constituents (broad, liquid, data-rich)

**Survivorship bias handling**: Use historical constituent lists (available from S&P via Compustat, or approximate from Wikipedia historical archives + delisting data). Include stocks that were later removed. This is critical — testing only current members inflates results because survivors are winners by definition.

**Time period**: 
- In-sample (rule development): 2015-2020 (6 years)
- Out-of-sample (validation): 2020-2025 (5 years)
- This split tests if the rules generalize beyond the period they were designed against

**Evaluation frequency**: Monthly (end of month). Score all stocks. Form quintile portfolios. Hold for 1/3/6/12 months.

#### Data Requirements

| Data | Source | Coverage | Cost | Priority |
|---|---|---|---|---|
| Daily OHLCV (10yr) | yfinance | Full | Free | Must-have |
| Historical quarterly financials | FMP Premium | 10yr+ | $29-49/mo | Must-have |
| Historical key ratios (P/E, PEG, P/B, EV/EBITDA, D/E, ROE, margins) | FMP Premium | 10yr+ | included | Must-have |
| Historical earnings (EPS actual/estimate) | FMP or Financial Datasets | 5yr+ | included or separate | Must-have |
| SEC filings (8-K, 10-K, Form 4) | SEC EDGAR | Full history | Free | Must-have |
| SPY benchmark returns | yfinance | Full | Free | Must-have |
| Fama-French factor returns | Ken French Data Library | Full | Free | Must-have |
| Historical short interest | Quandl/Nasdaq | 5yr+ | ~$50/mo | Nice-to-have |
| Historical institutional ownership | 13-F via EDGAR | Quarterly lag | Free | Nice-to-have |

**Total cost estimate**: $29-99/month for 1-2 months of data collection = $60-200 total

**FMP is the single best investment** — it unlocks historical fundamentals, ratios, and earnings in one API, covering 17 of our 30 rules with point-in-time data.

#### Simulation Engine Architecture

```
simulation_harness/
  config.py              — universe, dates, parameters
  data/
    price_fetcher.py     — yfinance historical OHLCV
    fundamental_fetcher.py — FMP historical quarterlies  
    filing_fetcher.py    — SEC EDGAR historical filings
    factor_fetcher.py    — Fama-French factor returns
    cache.py             — SQLite cache to avoid re-fetching
  scoring/
    signal_builder.py    — reconstruct SignalCollection for any (stock, date)
    thesis_templates.py  — standardized thesis points per category
    scorer.py            — wrapper around existing thesis_evaluator.py
  analysis/
    portfolio_builder.py — form quintile portfolios from scores
    return_calculator.py — forward returns at multiple horizons
    statistics.py        — t-tests, correlations, Fama-French regressions
    regime_detector.py   — classify market regimes (VIX, drawdown, trend)
  results/
    tables.py            — publication-ready result tables
    charts.py            — scatter plots, equity curves, quintile bar charts
  run_simulation.py      — main entry point
```

**Key design principle**: The scoring engine (`thesis_evaluator.py`) runs UNCHANGED. The simulation harness only provides it with historical data. This ensures we're testing the actual production system, not a research-only variant.

#### Standardized Thesis Templates

For the simulation, we use fixed thesis templates (one per category) for every stock. This isolates the question to: "Do the rules and weights predict returns?" without LLM contamination.

```python
THESIS_TEMPLATES = [
    {"id": 1, "category": "competitive_moat", "statement": "The company has a durable competitive advantage", "importance": "standard", "frozen": False, "conviction": None, "selected": True},
    {"id": 2, "category": "growth_trajectory", "statement": "Revenue and earnings are growing meaningfully", "importance": "standard", "frozen": False, "conviction": None, "selected": True},
    {"id": 3, "category": "valuation", "statement": "The stock is reasonably valued relative to fundamentals", "importance": "standard", "frozen": False, "conviction": None, "selected": True},
    {"id": 4, "category": "financial_health", "statement": "The balance sheet is sound with strong cash generation", "importance": "standard", "frozen": False, "conviction": None, "selected": True},
    {"id": 5, "category": "ownership_conviction", "statement": "Institutional and insider ownership signals confidence", "importance": "standard", "frozen": False, "conviction": None, "selected": True},
    {"id": 6, "category": "risks", "statement": "Key business risks are being monitored", "importance": "standard", "frozen": False, "conviction": None, "selected": True},
]
```

All importance = standard (1.0x), no frozen, no conviction. This tests the pure signal+weight system without user-specific modifiers.

#### Statistical Framework

**Primary tests:**
1. **Quintile spread**: Sort stocks into Q1 (lowest score) through Q5 (highest score). Report mean next-period returns for each quintile. Test Q5-Q1 spread with Newey-West t-statistics (corrects for autocorrelation).

2. **Fama-MacBeth regressions**: Cross-sectional regression of next-month returns on STARC score, controlling for known factors (market cap, book-to-market, momentum, profitability, investment). Reports time-series average coefficient and t-stat.

3. **Long-short alpha**: Form a portfolio long Q5, short Q1, equal-weight. Regress monthly returns on Fama-French 5 factors + momentum. The intercept (alpha) is the excess return unexplained by known factors.

4. **Information Coefficient (IC)**: Rank correlation between score and subsequent return, computed monthly. Report mean IC and IC information ratio (mean/std). IC > 0.05 is considered meaningful in quant finance.

**Robustness checks:**
- Value-weighted vs equal-weighted portfolios
- Different holding periods (1m, 3m, 6m, 12m)
- Excluding micro-caps (< $1B market cap)
- Different scoring thresholds (top/bottom tercile vs quintile)
- Transaction cost sensitivity (0, 10, 20, 50 bps per trade)

**Multiple testing correction**: With multiple hypotheses, apply Benjamini-Hochberg false discovery rate control at 5% level. Report both raw and adjusted p-values.

**Minimum sample size**: For a two-sample t-test detecting a 2% return difference with 80% power at p < 0.05, need ~200 observations per group. With 500 stocks × 60 months = 30,000 stock-month observations (6,000 per quintile). Well above minimum.

#### Ablation Study Design

Test each category's marginal contribution:

```
Full model:  score using all 6 categories → measure alpha
Drop moat:   score using 5 categories (exclude competitive_moat) → measure alpha
Drop growth: score using 5 categories (exclude growth_trajectory) → measure alpha
... (repeat for each category)
```

Compare: which category removal causes the largest alpha decline? That category is the most valuable signal. Which removal doesn't change alpha? That category may be noise.

Also test individual categories in isolation — does financial_health alone predict returns? Does moat alone? This reveals which categories carry the weight.

#### Permutations and Regime Analysis

**Weight sensitivity**: 
- Equal-weight all categories (all = 5.0) vs current weights vs optimized weights
- Warning: weight optimization on in-sample data will overfit. Use cross-validation.

**Market regimes**:
- Bull: SPY trailing 6m return > +10%
- Bear: SPY trailing 6m return < -10%
- High vol: VIX > 25
- Low vol: VIX < 15
- Report alpha separately for each regime

**Sector analysis**: Does the score work better for tech vs financials vs healthcare? Are certain rules systematically biased toward certain sectors?

### Self-Critique: Assumptions and Threats to Validity

**Threat 1: Implicit overfitting — rules are based on known factors**

The rules (P/E thresholds, momentum cutoffs, FCF margins) are informed by decades of financial research. We already "know" these factors work. Testing them on historical data and finding they work is circular.

*Mitigation*: The novel contribution is NOT individual signals (those are known) — it's the COMBINATION and WEIGHTING. Piotroski uses 9 binary signals equally weighted. We use 30 continuous signals with category-specific weights, importance multipliers, and conviction modifiers. The question is whether this particular combination architecture adds value beyond known factors. The Fama-French regression directly tests this: if alpha is zero after controlling for known factors, our combination adds nothing. If alpha is positive, the combination captures something the factors miss.

**Threat 2: Look-ahead bias in fundamental data**

FMP and yfinance may return restated financials. A company that restated Q3 2023 earnings in Q1 2024 will show different numbers than what was available at the time.

*Mitigation*: Use FMP's "as-reported" endpoints where available. For metrics derived from market data (P/E = price/EPS), compute P/E ourselves using the stock price on the evaluation date and the most recent as-reported EPS at that time. Document which metrics use as-reported vs restated data. This is a known limitation shared by most academic studies — explicitly acknowledging it is better than ignoring it.

**Threat 3: Transaction costs and capacity**

Even if alpha exists in theory, it may not survive transaction costs. High-score stocks may be illiquid or have high turnover.

*Mitigation*: Report results with and without transaction costs (10, 20, 50 bps). Also report portfolio turnover (what % of holdings change each month). If turnover > 50% monthly, the strategy is impractical regardless of alpha.

**Threat 4: Survivorship bias**

Testing only on stocks that currently exist ignores failures. Delisted stocks often had poor scores before they failed — excluding them makes the low-score quintile look better than it was.

*Mitigation*: Include delisted stocks in the universe until their delisting date. yfinance provides historical data for delisted tickers in many cases. FMP has delisted company data on paid plans. At minimum, document the % of universe that was delisted during the study period.

**Threat 5: Publication bias in our own results**

If the study shows alpha, we publish it. If it doesn't, we "fix the model" and re-run until it does. This is exactly the p-hacking that Harvey et al. (2016) warn about.

*Mitigation*: Pre-register the study design BEFORE running it. Commit to publishing results regardless of outcome. Use out-of-sample validation (2020-2025) that we don't touch until in-sample analysis is complete. If the model fails out-of-sample, that is a publishable finding too ("composite thesis scoring does not generalize").

**Threat 6: The thesis templates are artificial**

Real users write nuanced, specific thesis points. Our standardized templates are generic. The scoring engine interacts with thesis text (e.g., price rules check for growth keywords in the statement). Generic templates may trigger different rules than real user theses.

*Mitigation*: Audit which rules check thesis text. Currently only one price rule does: `any(w in stmt_lower for w in ("growth", "expand", "increas", "momentum", "accelerat"))`. Ensure standardized templates include these keywords where appropriate (e.g., the growth_trajectory template contains "growing"). Document this as a controlled variable.

**Threat 7: Confidence values are arbitrary**

The confidence assigned to each rule (0.40-0.70) is hand-tuned. Why is "P/E > 40" confidence 0.65 and not 0.55 or 0.75? These values directly affect the score and could be driving or suppressing alpha.

*Mitigation*: In the ablation study, test uniform confidence (all 0.50) vs current values. If uniform confidence produces similar alpha, the specific values don't matter much. If alpha changes significantly, the confidence calibration is doing real work and should be optimized via cross-validation.

### How Findings Feed Back Into the Product

| Finding | Product Action |
|---|---|
| Q5 outperforms Q1 by X% | Landing page: "Stocks scoring green outperformed by X% annually" |
| Category X is most predictive | Increase its weight in the scoring engine |
| Category Y adds no predictive value | Consider removing or reducing its weight |
| Score works better in high-vol regimes | Add regime indicator to dashboard ("Score reliability: HIGH in current market") |
| Score works for large-caps but not small-caps | Add market-cap disclaimer or adjust rules by cap |
| Specific threshold is suboptimal | Adjust threshold (e.g., P/E cutoff from 40 to 35) |
| Equal-weight categories outperform current weights | Simplify to equal weights |
| Alpha disappears after factor controls | Score is repackaging known factors — need novel signals |
| Null result (no alpha) | Honest finding — redesign scoring methodology based on what DOES work in the data |

---

## Execution Plan

### Parallel Track Execution

**Track 1: Scoring Engine Fixes** (can start immediately)
1. Fix 1: Remove first-match truncation, add decay logic
2. Fix 2: Add graduated threshold rules
3. Fix 3: Add `_moat_rules` function
4. Update `docs/scoring_algorithm.md`
5. Test: run evaluation on a known stock, verify more signals fire

**Track 2: Literature + Simulation Design** (can start immediately)
1. Phase 0: Literature review — search, read, synthesize key papers
2. Phase 0 deliverable: Decision matrix mapping papers to our study design
3. Reassess: Refine study design based on literature findings
4. Phase 1: Build simulation harness
5. Phase 2: Collect data (FMP subscription needed)
6. Phase 3: Run simulation
7. Phase 4: Analyze, iterate, write up

### Files to Modify (Track 1)

- `backend/app/agents/signal_interpreter.py` — all 3 fixes
- `backend/app/agents/thesis_evaluator.py` — decay factor logic
- `docs/scoring_algorithm.md` — documentation update

### Files to Create (Track 2)

- `simulation/` directory with the harness architecture described above
- `docs/literature_review.md` — synthesis of papers and methodology decisions
- `docs/study_design.md` — pre-registered study design before running simulation

### Verification

**Track 1**: Run `POST /stocks/AAPL/evaluate` before and after fixes. Compare:
- Number of signals that fire (expect: 3 → 8+)
- Category coverage (expect: 3/6 → 5-6/6)
- Score should be more differentiated (further from 50 in either direction)

**Track 2**: Literature review assessed by: Does it answer these 4 questions?
1. What methodology should we use? (answered by Piotroski, Fama-MacBeth literature)
2. What pitfalls must we avoid? (answered by Harvey et al., Lopez de Prado)
3. What's our novel contribution? (the category-weighted thesis architecture)
4. What data do we need? (answered by data requirements analysis)
