# Data Model

## Stock
- id
- ticker
- name

---

## Thesis
- id
- stock_id
- category
- statement
- selected (bool)
- weight
- created_at
- last_confirmed

---

## Evaluation
- stock_id
- score
- status
- explanation
- timestamp