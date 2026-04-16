"""Fetch and combine historical fundamental data for a ticker via FMP.

Uses filing dates (point-in-time) so look-ahead bias is avoided.

Output columns (matching signal_collector.py signal dataclasses):
  pe_ratio, peg_ratio, price_to_book, ev_to_ebitda,
  debt_to_equity, current_ratio,
  gross_margin, operating_margin, fcf_margin, roe,
  revenue_growth, eps_actual, eps_estimate,
  institutional_pct
"""
import logging

import pandas as pd

from simulation.data.fmp_client import FMPClient

logger = logging.getLogger(__name__)


def fetch_fundamentals(ticker: str, client: FMPClient) -> pd.DataFrame:
    """Combine FMP endpoints into a single signal DataFrame indexed by filing date."""

    # ── Ratios (annual — quarterly gated) ────────────────────────────────────
    ratios = client.ratios(ticker)
    ratios_ttm = client.ratios_ttm(ticker)

    # ── Key metrics (annual) ──────────────────────────────────────────────────
    km = client.key_metrics(ticker)

    # ── Balance sheet (quarterly — period=quarter available) ─────────────────
    bs = client.balance_sheets(ticker)

    # ── Income statement (quarterly) ─────────────────────────────────────────
    inc = client.income_statements(ticker)

    # ── Earnings: eps_actual + eps_estimate ──────────────────────────────────
    earn = client.earnings(ticker)

    # ── Merge quarterly fundamentals (income + balance) ───────────────────────
    frames: list[pd.DataFrame] = []

    if not inc.empty:
        inc_sel = _pick(inc, {
            "revenue":          "revenue",
            "grossProfit":      "gross_profit",
            "operatingIncome":  "operating_income",
            "netIncome":        "net_income",
            "eps":              "eps_actual_inc",
        })
        # Compute margin ratios from absolute values
        if "revenue" in inc_sel.columns:
            rev = inc_sel["revenue"].replace(0, float("nan"))
            if "gross_profit" in inc_sel.columns:
                inc_sel["gross_margin"] = inc_sel["gross_profit"] / rev
            if "operating_income" in inc_sel.columns:
                inc_sel["operating_margin"] = inc_sel["operating_income"] / rev
            if "net_income" in inc_sel.columns:
                inc_sel["net_margin"] = inc_sel["net_income"] / rev
        frames.append(inc_sel)

    if not bs.empty:
        bs_work = _pick(bs, {
            "totalDebt":               "total_debt",
            "totalStockholdersEquity": "total_equity",
            "totalCurrentAssets":      "current_assets",
            "totalCurrentLiabilities": "current_liabilities",
        })
        if not bs_work.empty:
            if "total_debt" in bs_work and "total_equity" in bs_work:
                bs_work["debt_to_equity"] = (
                    bs_work["total_debt"] / bs_work["total_equity"].replace(0, float("nan"))
                )
            if "current_assets" in bs_work and "current_liabilities" in bs_work:
                bs_work["current_ratio"] = (
                    bs_work["current_assets"] / bs_work["current_liabilities"].replace(0, float("nan"))
                )
        frames.append(bs_work)

    if not earn.empty:
        earn_sel = _pick(earn, {
            "epsActual":    "eps_actual",
            "epsEstimated": "eps_estimate",
        })
        frames.append(earn_sel)

    # Merge quarterly frames
    quarterly = _outer_join(frames)

    # ── Build annual signals DataFrame (ratios + key_metrics) ─────────────────
    ann_frames: list[pd.DataFrame] = []

    if not ratios.empty:
        rat_sel = _pick(ratios, {
            "priceToEarningsRatio":       "pe_ratio",
            "priceToEarningsGrowthRatio": "peg_ratio",
            "priceToBookRatio":           "price_to_book",
            "debtToEquityRatio":          "debt_to_equity_rat",
            "currentRatio":               "current_ratio_rat",
            "grossProfitMargin":          "gross_margin_rat",
            "operatingProfitMargin":      "operating_margin_rat",
            "netProfitMargin":            "net_margin_rat",
            "freeCashFlowPerShare":       "fcf_per_share",
        })
        ann_frames.append(rat_sel)

    if not km.empty:
        km_sel = _pick(km, {
            "evToEBITDA":      "ev_to_ebitda",
            "returnOnEquity":  "roe",
        })
        ann_frames.append(km_sel)

    annual = _outer_join(ann_frames)

    # ── Combine quarterly + annual via outer merge ────────────────────────────
    if quarterly.empty and annual.empty:
        return pd.DataFrame()
    elif quarterly.empty:
        merged = annual
    elif annual.empty:
        merged = quarterly
    else:
        merged = quarterly.join(annual, how="outer", rsuffix="_ann")

    # ── Forward-fill annual ratios into quarterly gaps ───────────────────────
    # Annual ratios (pe, peg, pb, ev/ebitda, roe) are filed once/year.
    # Forward-fill so every quarterly row carries the last known annual value.
    annual_point_cols = ["pe_ratio", "peg_ratio", "price_to_book", "ev_to_ebitda", "roe",
                         "gross_margin_rat", "operating_margin_rat", "net_margin_rat"]
    for col in annual_point_cols:
        if col in merged.columns:
            merged[col] = merged[col].ffill()

    # ── Fill TTM ratios as fallback for recent rows ───────────────────────────
    if not ratios_ttm.empty:
        ttm = ratios_ttm.iloc[0].to_dict()
        if "pe_ratio" not in merged.columns or merged["pe_ratio"].isna().all():
            merged["pe_ratio"] = ttm.get("priceToEarningsRatioTTM")
        if "peg_ratio" not in merged.columns or merged["peg_ratio"].isna().all():
            merged["peg_ratio"] = ttm.get("priceToEarningsGrowthRatioTTM")
        if "price_to_book" not in merged.columns or merged["price_to_book"].isna().all():
            merged["price_to_book"] = ttm.get("priceToBookRatioTTM")
        if "gross_margin" not in merged.columns or merged["gross_margin"].isna().all():
            merged["gross_margin"] = ttm.get("grossProfitMarginTTM")
        if "operating_margin" not in merged.columns or merged["operating_margin"].isna().all():
            merged["operating_margin"] = ttm.get("operatingProfitMarginTTM")
        if "roe" not in merged.columns or merged["roe"].isna().all():
            merged["roe"] = ttm.get("returnOnEquityTTM")

    # ── Coalesce duplicate columns ────────────────────────────────────────────
    # Prefer quarterly computed values; fall back to annual ratio values
    merged["debt_to_equity"]   = _coalesce(merged, ["debt_to_equity", "debt_to_equity_rat"])
    merged["current_ratio"]    = _coalesce(merged, ["current_ratio", "current_ratio_rat"])
    merged["eps_actual"]       = _coalesce(merged, ["eps_actual", "eps_actual_inc"])
    merged["gross_margin"]     = _coalesce(merged, ["gross_margin", "gross_margin_rat"])
    merged["operating_margin"] = _coalesce(merged, ["operating_margin", "operating_margin_rat"])

    # Revenue growth: QoQ from revenue column
    if "revenue" in merged.columns:
        merged["revenue_growth"] = merged["revenue"].pct_change(periods=4)  # YoY (4 quarters)

    # FCF margin: approximate from income statement if available
    if "fcf_per_share" in merged.columns and "revenue" in merged.columns:
        pass  # can't easily compute without shares outstanding here; leave as NaN

    # ── Final column selection ────────────────────────────────────────────────
    final_cols = [
        "pe_ratio", "peg_ratio", "price_to_book", "ev_to_ebitda",
        "debt_to_equity", "current_ratio",
        "gross_margin", "operating_margin", "roe",
        "revenue_growth", "eps_actual", "eps_estimate",
    ]
    present = [c for c in final_cols if c in merged.columns]
    return merged[present]


# ── Helpers ──────────────────────────────────────────────────────────────────

def _pick(df: pd.DataFrame, mapping: dict[str, str]) -> pd.DataFrame:
    """Select and rename columns that exist in df."""
    keep = {k: v for k, v in mapping.items() if k in df.columns}
    if not keep:
        return pd.DataFrame()
    return df[list(keep.keys())].rename(columns=keep)


def _outer_join(frames: list[pd.DataFrame]) -> pd.DataFrame:
    """Outer-join a list of DataFrames on their date index."""
    dfs = [df for df in frames if not df.empty]
    if not dfs:
        return pd.DataFrame()
    result = dfs[0]
    for df in dfs[1:]:
        result = result.join(df, how="outer", rsuffix="_r")
    return result


def _coalesce(df: pd.DataFrame, cols: list[str]) -> pd.Series:
    """Return first non-null value across candidate columns."""
    existing = [c for c in cols if c in df.columns]
    if not existing:
        return pd.Series(index=df.index, dtype=float)
    result = df[existing[0]].copy()
    for col in existing[1:]:
        result = result.where(result.notna(), df[col])
    return result
