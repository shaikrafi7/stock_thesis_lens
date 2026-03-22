# Agents System

## Core Question
"Is the user's investment thesis strengthening, weakening, or breaking?"

---

## Thesis Structure

Each stock has 5 categories:

1. Core Beliefs
2. Strengths
3. Risks
4. Leadership
5. Catalysts
   - Past catalysts (last 6–12 months)
   - Future catalysts (3m, 1y, 2y, 5y)

Max 5 bullets per category.

---

## Agents

### 1. Thesis Generator
Generates structured bullets for all categories.

---

### 2. User Thesis Agent
Captures:
- Selected bullets
- Custom bullets
- User conviction

---

### 3. Signal Collector
Collects:
- Price trends
- News
- Earnings (when available)
- Sector signals

---

### 4. Signal Interpreter
Maps signals → thesis bullets:
- Positive / Negative / Neutral
- Confidence score

---

### 5. Thesis Evaluator (CORE)

Logic:
- Start score = 100
- Deduct based on:
  - Broken assumptions
  - Negative signals
- Weight:
  Core beliefs > leadership > catalysts > general signals

Output:
- Status (Green / Yellow / Red)
- Score
- Broken points

---

### 6. Explanation Agent

Generates:
- 1-line summary
- Bullet explanations tied to thesis

---

### 7. Re-confirmation Agent

Triggers when:
- Key assumption is under pressure

Prompts user:
"Do you still believe this?"

---

## Core Loop

1. Collect signals
2. Interpret signals
3. Compare with thesis
4. Update score
5. Generate explanation
6. Trigger user reconfirmation (if needed)