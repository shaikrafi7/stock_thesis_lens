# Data Model

## Stock
- id
- ticker
- name
- logo_url
- portfolio_id (FK)
- user_id (FK)
- created_at

---

## Thesis
- id
- stock_id (FK)
- category — competitive_moat | growth_trajectory | valuation | financial_health | ownership_conviction | risks
- statement
- selected (bool)
- weight (float, derived from importance)
- importance — standard | important | critical
- frozen (bool) — committed conviction point, 1.5x multiplier
- conviction — liked | disliked | null (user override, adds 1.3x)
- source — ai | manual
- sort_order (int)
- created_at
- last_confirmed

---

## Evaluation
- id
- stock_id (FK)
- score (float, 0-100)
- status — green | yellow | red
- explanation (text)
- broken_points (JSON) — list of {thesis_id, category, statement, signal, sentiment, deduction}
- confirmed_points (JSON) — list of {thesis_id, category, statement, signal, sentiment, credit}
- frozen_breaks (JSON) — subset of broken_points where frozen=true
- timestamp

---

## InvestorProfile
- id
- user_id (FK)
- investment_style — value | growth | dividend | blend
- time_horizon — short | medium | long
- loss_aversion — low | medium | high
- risk_capacity — low | medium | high
- experience_level — beginner | intermediate | advanced
- overconfidence_bias (float)
- primary_bias (string)
- archetype_label (string)
- wizard_completed (bool)

---

## ShareToken
- id
- token (UUID, unique)
- stock_id (FK)
- created_at
