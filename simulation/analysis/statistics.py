"""Statistical analysis of quintile portfolio returns.

Computes:
- Newey-West t-statistics (6-lag) for Q5-Q1 spread
- Information Coefficient (rank correlation of score vs forward return)
- Fama-MacBeth cross-sectional regression scaffold (score -> next-month return)

Note: Fama-French factor data downloaded from Ken French's data library.
"""
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats


# ── Newey-West t-statistic ────────────────────────────────────────────────

def newey_west_tstat(returns: pd.Series, lags: int = 6) -> tuple[float, float]:
    """Compute Newey-West corrected mean and t-statistic for a return series.

    Returns:
        (mean_return, t_statistic)
    """
    returns = returns.dropna()
    n = len(returns)
    if n < lags + 2:
        return float(returns.mean()), float("nan")

    mean = returns.mean()
    resid = returns - mean

    # Bartlett kernel variance estimate
    gamma_0 = (resid ** 2).mean()
    nw_var = gamma_0
    for lag in range(1, lags + 1):
        weight = 1 - lag / (lags + 1)
        gamma_l = (resid.iloc[lag:].values * resid.iloc[:-lag].values).mean()
        nw_var += 2 * weight * gamma_l

    se = np.sqrt(nw_var / n)
    t_stat = mean / se if se > 0 else float("nan")
    return float(mean), float(t_stat)


# ── Information Coefficient ───────────────────────────────────────────────

def information_coefficient(
    scores: pd.Series,
    forward_returns: pd.Series,
) -> float | None:
    """Rank correlation (Spearman) between scores and forward returns.

    Args:
        scores: Series indexed by ticker, values are STARC scores.
        forward_returns: Series indexed by ticker, values are log returns.

    Returns:
        Spearman rank correlation, or None if insufficient data.
    """
    common = scores.index.intersection(forward_returns.index)
    if len(common) < 5:
        return None
    s = scores.loc[common]
    r = forward_returns.loc[common]
    corr, _ = stats.spearmanr(s.values, r.values)
    return float(corr)


def ic_series(
    monthly_scores: dict[date, dict[str, float]],
    monthly_returns: dict[date, dict[str, float]],
) -> pd.Series:
    """Compute IC for each month where both scores and returns exist.

    Args:
        monthly_scores: {date: {ticker: score}}
        monthly_returns: {date: {ticker: 1m_forward_return}}

    Returns:
        pd.Series indexed by date, values are monthly IC.
    """
    ic_vals = {}
    for d, scores in monthly_scores.items():
        if d not in monthly_returns:
            continue
        s = pd.Series(scores)
        r = pd.Series(monthly_returns[d])
        ic = information_coefficient(s, r)
        if ic is not None:
            ic_vals[d] = ic
    return pd.Series(ic_vals).sort_index()


def ic_information_ratio(ic_ser: pd.Series) -> float | None:
    """IC Information Ratio = mean(IC) / std(IC). Values > 0.5 are strong."""
    if ic_ser.empty or ic_ser.std() == 0:
        return None
    return float(ic_ser.mean() / ic_ser.std())


# ── Fama-MacBeth regression ───────────────────────────────────────────────

def fama_macbeth(
    monthly_scores: dict[date, dict[str, float]],
    monthly_returns: dict[date, dict[str, float]],
) -> dict:
    """Fama-MacBeth cross-sectional regression: return_t+1 = a + b*score_t + e.

    Runs one cross-sectional OLS per month, then computes time-series mean
    and Newey-West t-statistic of the slope coefficient.

    Returns:
        dict with keys: mean_alpha, mean_beta, t_alpha, t_beta,
                        n_months, mean_r2
    """
    alphas = []
    betas = []
    r2s = []

    for d, scores in sorted(monthly_scores.items()):
        if d not in monthly_returns:
            continue
        s = pd.Series(scores)
        r = pd.Series(monthly_returns[d])
        common = s.index.intersection(r.index)
        if len(common) < 10:
            continue

        x = s.loc[common].values
        y = r.loc[common].values

        # OLS via numpy
        X = np.column_stack([np.ones(len(x)), x])
        try:
            coeffs, _, _, _ = np.linalg.lstsq(X, y, rcond=None)
        except np.linalg.LinAlgError:
            continue

        alpha, beta = coeffs
        y_hat = X @ coeffs
        ss_res = ((y - y_hat) ** 2).sum()
        ss_tot = ((y - y.mean()) ** 2).sum()
        r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0

        alphas.append(alpha)
        betas.append(beta)
        r2s.append(r2)

    if not betas:
        return {"error": "insufficient data"}

    alpha_ser = pd.Series(alphas)
    beta_ser = pd.Series(betas)
    mean_alpha, t_alpha = newey_west_tstat(alpha_ser)
    mean_beta, t_beta = newey_west_tstat(beta_ser)

    return {
        "mean_alpha": mean_alpha,
        "mean_beta": mean_beta,
        "t_alpha": t_alpha,
        "t_beta": t_beta,
        "n_months": len(betas),
        "mean_r2": float(np.mean(r2s)),
    }


# ── Quintile summary table ────────────────────────────────────────────────

def quintile_summary(qr_df: pd.DataFrame, horizon: int = 1) -> pd.DataFrame:
    """Summarize mean returns, t-stats, and Sharpe ratio by quintile.

    Args:
        qr_df: DataFrame from QuintileReturns.to_dataframe()
        horizon: horizon_months to filter on

    Returns:
        DataFrame with quintile stats.
    """
    sub = qr_df[qr_df["horizon_months"] == horizon]
    rows = []

    for q in range(1, 6):
        q_returns = sub[sub["quintile"] == q]["ew_return"].dropna()
        if q_returns.empty:
            continue
        mean, t = newey_west_tstat(q_returns)
        rows.append({
            "quintile": q,
            "mean_return": mean,
            "t_stat": t,
            "n_obs": len(q_returns),
            "sharpe": mean / q_returns.std() * np.sqrt(12) if q_returns.std() > 0 else None,
        })

    return pd.DataFrame(rows).set_index("quintile")


def longshort_summary(ls_by_horizon: dict[int, pd.Series]) -> pd.DataFrame:
    """Report mean return, t-stat, and Sharpe for Q5-Q1 spread per horizon."""
    rows = []
    for h, series in sorted(ls_by_horizon.items()):
        series = series.dropna()
        if series.empty:
            continue
        mean, t = newey_west_tstat(series)
        sharpe = mean / series.std() * np.sqrt(12 / h) if series.std() > 0 else None
        rows.append({
            "horizon_months": h,
            "ls_mean_return": mean,
            "t_stat": t,
            "sharpe": sharpe,
            "n_obs": len(series),
        })
    return pd.DataFrame(rows).set_index("horizon_months")
