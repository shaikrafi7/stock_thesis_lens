# STARC v2 Validation Study

**Window:** 2020-01-31 - 2024-12-31  
**Universe:** 490 tickers  
**Months:** 60  

## Summary

| Metric | v1 | v2 (regime+sector) | Delta |
|---|---:|---:|---:|
| 6m L/S mean | 0.0011 | 0.0019 | +0.0008 |
| 6m L/S t-stat | 0.08 | 0.15 | - |
| 12m L/S mean | -0.0019 | -0.0029 | -0.0010 |
| 12m L/S t-stat | -0.06 | -0.10 | - |
| 1m IC mean | -0.0001 | -0.0001 | +0.0000 |
| 1m IC std | 0.0889 | 0.0911 | - |
| ICIR | -0.001 | -0.001 | - |

## Regime-Conditional 6m L/S Spread

### v1
| Dim | Label | Mean L/S | t-stat | N |
|---|---|---:|---:|---:|
| trend | flat | -0.0056 | -0.57 | 28 |
| trend | bear | -0.0675 | -17.25 | 3 |
| trend | bull | 0.0146 | 0.70 | 29 |
| vol | low | 0.0061 | 0.46 | 53 |
| vol | high | -0.0371 | nan | 7 |
| style | growth | 0.0078 | 0.51 | 38 |
| style | value | -0.0106 | -1.02 | 22 |

### v2
| Dim | Label | Mean L/S | t-stat | N |
|---|---|---:|---:|---:|
| trend | flat | -0.0062 | -0.75 | 28 |
| trend | bear | -0.0511 | -6.76 | 3 |
| trend | bull | 0.0152 | 0.69 | 29 |
| vol | low | 0.0064 | 0.47 | 53 |
| vol | high | -0.0323 | nan | 7 |
| style | growth | 0.0061 | 0.37 | 38 |
| style | value | -0.0053 | -0.67 | 22 |

## Interpretation

The v2 preset (regime_adjustments + sector_adjustments) tries to down-weight
growth_trajectory in bear/high-vol and Consumer Staples, and up-weight
financial_health in those same contexts.

If the L/S delta is not meaningfully positive (> +1% 6m with t > 1.5), the preset
does not recover alpha from v1. Null results are acknowledged, not buried.