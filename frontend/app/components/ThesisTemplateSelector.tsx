"use client";

import { useState, useEffect } from "react";
import { fetchInvestorProfile } from "@/lib/api";
import { Zap, TrendingUp, DollarSign, BarChart2, ChevronRight } from "lucide-react";

export interface TemplatePoint {
  category: string;
  statement: string;
}

interface Props {
  ticker: string;
  onSelect: (point: TemplatePoint) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  competitive_moat: "Competitive Moat",
  growth_trajectory: "Growth Trajectory",
  valuation: "Valuation",
  financial_health: "Financial Health",
  ownership_conviction: "Ownership & Conviction",
  risks: "Risks & Bear Case",
};

const TEMPLATES: Record<string, TemplatePoint[]> = {
  growth: [
    { category: "growth_trajectory", statement: `${"{ticker}"} revenue is growing double-digits YoY, with a large TAM providing multi-year runway.` },
    { category: "growth_trajectory", statement: `${"{ticker}"} is expanding into adjacent markets, diversifying revenue streams beyond its core product.` },
    { category: "competitive_moat", statement: `${"{ticker}"} has strong network effects: each new user increases value for all existing users.` },
    { category: "competitive_moat", statement: `${"{ticker}"} benefits from high switching costs — customers face significant friction to move to a competitor.` },
    { category: "valuation", statement: `${"{ticker}"} trades at a premium to peers, but the premium is justified by superior growth and expanding margins.` },
    { category: "financial_health", statement: `${"{ticker}"} is scaling efficiently: improving gross margins signal future operating leverage.` },
    { category: "ownership_conviction", statement: `${"{ticker}"} management has a track record of beating guidance and investing efficiently for growth.` },
    { category: "risks", statement: `${"{ticker}"}'s high growth multiple makes it vulnerable to multiple compression in a rising rate environment.` },
  ],
  value: [
    { category: "valuation", statement: `${"{ticker}"} trades at a significant discount to intrinsic value and peers on EV/EBITDA and P/FCF.` },
    { category: "valuation", statement: `${"{ticker}"} has a margin of safety: even in a bear case scenario, downside risk is limited.` },
    { category: "financial_health", statement: `${"{ticker}"} generates consistent free cash flow, supporting buybacks and debt reduction.` },
    { category: "financial_health", statement: `${"{ticker}"} has a fortress balance sheet with net cash and low leverage relative to earnings.` },
    { category: "competitive_moat", statement: `${"{ticker}"} has a durable, asset-heavy moat that prevents new entrants from competing on price.` },
    { category: "growth_trajectory", statement: `${"{ticker}"} is a slow-growth but high-quality compounder with consistent ROIC above its cost of capital.` },
    { category: "ownership_conviction", statement: `${"{ticker}"} management has skin in the game with significant insider ownership.` },
    { category: "risks", statement: `${"{ticker}"}'s low-growth nature means the thesis requires sustained capital allocation discipline to generate returns.` },
  ],
  dividend: [
    { category: "financial_health", statement: `${"{ticker}"} has paid and grown its dividend for 10+ consecutive years, demonstrating consistent cash generation.` },
    { category: "financial_health", statement: `${"{ticker}"} has a conservative payout ratio with ample FCF coverage, making the dividend sustainable.` },
    { category: "valuation", statement: `${"{ticker}"} offers an above-market dividend yield relative to its sector, with yield-on-cost potential.` },
    { category: "competitive_moat", statement: `${"{ticker}"}'s stable, regulated or recurring revenue base makes future dividend payments highly predictable.` },
    { category: "growth_trajectory", statement: `${"{ticker}"} targets mid-single-digit annual dividend growth, compounding total return over the long term.` },
    { category: "ownership_conviction", statement: `${"{ticker}"} has a history of returning capital to shareholders via both dividends and buybacks.` },
    { category: "risks", statement: `${"{ticker}"}'s dividend could be pressured if economic conditions weaken demand or compress margins significantly.` },
    { category: "risks", statement: `${"{ticker}"} faces interest rate risk: rising rates increase competition from bonds and pressure valuation.` },
  ],
  blend: [
    { category: "competitive_moat", statement: `${"{ticker}"} has a diversified competitive advantage combining brand, scale, and switching costs.` },
    { category: "growth_trajectory", statement: `${"{ticker}"} offers moderate but consistent growth, with earnings expanding in line with or ahead of revenue.` },
    { category: "valuation", statement: `${"{ticker}"} trades at a fair valuation relative to its growth rate — the PEG ratio is near or below 1.5.` },
    { category: "financial_health", statement: `${"{ticker}"} demonstrates strong capital efficiency with ROE consistently above 15%.` },
    { category: "financial_health", statement: `${"{ticker}"} maintains an investment-grade balance sheet with manageable debt levels.` },
    { category: "ownership_conviction", statement: `${"{ticker}"} benefits from institutional sponsorship and positive analyst consensus.` },
    { category: "risks", statement: `${"{ticker}"} faces execution risk if the current management team fails to sustain its competitive position.` },
    { category: "risks", statement: `${"{ticker}"} is exposed to cyclical demand risk — a macro slowdown could weigh on near-term earnings.` },
  ],
};

const STYLE_META: Record<string, { Icon: typeof Zap; label: string; color: string }> = {
  growth: { Icon: TrendingUp, label: "Growth", color: "text-emerald-500" },
  value: { Icon: DollarSign, label: "Value", color: "text-blue-500" },
  dividend: { Icon: BarChart2, label: "Dividend", color: "text-amber-500" },
  blend: { Icon: Zap, label: "Blend", color: "text-purple-500" },
};

export default function ThesisTemplateSelector({ ticker, onSelect }: Props) {
  const [activeStyle, setActiveStyle] = useState<string>("growth");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInvestorProfile()
      .then((p) => {
        if (p.investment_style && TEMPLATES[p.investment_style]) {
          setActiveStyle(p.investment_style);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const templates = (TEMPLATES[activeStyle] ?? TEMPLATES.growth).map((t) => ({
    ...t,
    statement: t.statement.replace(/\{ticker\}/g, ticker),
  }));

  if (loading) return null;

  return (
    <div className="mt-2">
      <p className="text-xs text-gray-400 dark:text-zinc-500 mb-3">
        Start from a template — click any point to add it to your thesis.
      </p>

      {/* Style tabs */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {Object.entries(STYLE_META).map(([style, meta]) => {
          const { Icon, label, color } = meta;
          return (
            <button
              key={style}
              onClick={() => setActiveStyle(style)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                activeStyle === style
                  ? "bg-accent text-white border-accent"
                  : "border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:border-gray-300 dark:hover:border-zinc-600"
              }`}
            >
              <Icon className={`w-3 h-3 ${activeStyle === style ? "" : color}`} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Template points */}
      <div className="flex flex-col gap-2">
        {templates.map((pt, i) => (
          <button
            key={i}
            onClick={() => onSelect(pt)}
            className="group w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-800 hover:border-accent/40 dark:hover:border-accent/40 hover:bg-accent/5 transition-colors"
          >
            <span className="shrink-0 mt-0.5 text-[10px] font-semibold text-gray-400 dark:text-zinc-600 w-20">
              {CATEGORY_LABELS[pt.category] ?? pt.category}
            </span>
            <span className="flex-1 text-xs text-gray-600 dark:text-zinc-400 group-hover:text-gray-800 dark:group-hover:text-zinc-200 leading-relaxed transition-colors">
              {pt.statement}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-zinc-700 group-hover:text-accent shrink-0 mt-0.5 transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}
