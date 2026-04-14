# Agents System

## Core Question
"Is the user's investment thesis strengthening, weakening, or breaking?"

---

## Thesis Structure

Each stock has 6 categories:

1. **competitive_moat** — durable advantages, network effects, brand, IP
2. **growth_trajectory** — revenue growth, market expansion, TAM
3. **valuation** — price vs intrinsic value, multiples vs peers
4. **financial_health** — balance sheet, cash flow, margins
5. **ownership_conviction** — insider buying, institutional ownership, management quality
6. **risks** — key risks that could break the thesis

Max 3 bullets per category. Each bullet has an `importance` (standard / important / critical) and can be marked `frozen` (committed conviction).

---

## Agents

### 1. Thesis Generator
Generates structured bullets for all 6 categories using GPT-4o-mini. Accepts an existing_statements list to avoid near-duplicates.

### 2. Signal Collector
Collects from up to 5 sources: Polygon (price/OHLCV), Serper (news), FMP (fundamentals), Financial Datasets (earnings), yfinance (fallback). Returns a unified signal dict.

### 3. Signal Interpreter
Maps signals to thesis bullets: positive / negative / neutral + confidence score (0.0–1.0). Runs deterministic price rules + LLM news mapping in parallel. Merges, keeping highest-confidence per direction per point.

### 4. Thesis Evaluator (CORE)
Deterministic — no LLM. See `scoring_algorithm.md` for full details.
- Base score: 50
- Credits (positive signals): up to +50
- Deductions (negative signals): up to -50
- Confidence threshold: 0.50

Output: score, status (green/yellow/red), broken_points, confirmed_points, frozen_breaks.

### 5. Explanation Agent
GPT-4o-mini generates a plain-language summary of the evaluation result. No buy/sell language.

### 6. Thesis Chat Agent
Streaming SSE chat that can suggest new thesis bullets or trigger re-evaluation via tool calls.

### 7. Portfolio Chat Agent
Streaming SSE chat with full portfolio context for cross-stock analysis.

### 8. Morning Briefing Agent
Generates a daily briefing digest with portfolio scores, news highlights, and macro context.

---

## Core Evaluation Loop

```
collect_signals → interpret_signals → evaluate_thesis → explanation
```

1. Collect signals (price + news)
2. Interpret: map signals to thesis points with sentiment + confidence
3. Evaluate: apply bidirectional scoring formula
4. Generate explanation
5. Persist Evaluation record
