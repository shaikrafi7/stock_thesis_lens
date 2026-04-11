const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("thesisarc_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface Stock {
  id: number;
  ticker: string;
  name: string;
  logo_url: string | null;
  watchlist: string; // "true" | "false"
}

export interface Thesis {
  id: number;
  stock_id: number;
  category: string;
  statement: string;
  selected: boolean;
  weight: number;
  importance: "standard" | "important" | "critical";
  frozen: boolean;
  conviction: "liked" | "disliked" | null;
  source: "ai" | "manual";
  sort_order: number;
  created_at: string;
  last_confirmed: string | null;
}

export interface CompanyInfo {
  name: string | null;
  sector: string | null;
  industry: string | null;
  market_cap: number | null;
  beta: number | null;
  analyst_target: number | null;
  institutional_ownership: number | null;
  // Analyst consensus
  recommendation: string | null;
  analyst_count: number | null;
  target_low: number | null;
  target_high: number | null;
  target_median: number | null;
  // Valuation
  trailing_pe: number | null;
  forward_pe: number | null;
  peg_ratio: number | null;
  price_to_book: number | null;
  // Earnings
  eps_trailing: number | null;
  eps_forward: number | null;
  // Dividend
  dividend_yield: number | null;
  ex_dividend_date: string | null;
  // 52-week range
  fifty_two_week_low: number | null;
  fifty_two_week_high: number | null;
  // Short interest
  short_percent: number | null;
  // Profitability
  profit_margin: number | null;
  revenue_growth: number | null;
  // Earnings
  earnings_date: string | null;
}

export interface PricePoint {
  date: string;
  close: number;
}

export interface MarketData {
  company: CompanyInfo;
  prices: PricePoint[];
}

export const fetchMarketData = (ticker: string, period = "3mo"): Promise<MarketData> =>
  apiFetch(`/stocks/${ticker}/market-data?period=${period}`);

export interface BrokenPoint {
  thesis_id: number;
  category: string;
  statement: string;
  signal: string;
  sentiment: string;
  deduction: number;
}

export interface ConfirmedPoint {
  thesis_id: number;
  category: string;
  statement: string;
  signal: string;
  sentiment: string;
  credit: number;
}

export interface Evaluation {
  id: number;
  stock_id: number;
  score: number;
  status: "green" | "yellow" | "red";
  explanation: string | null;
  broken_points: BrokenPoint[];
  confirmed_points: ConfirmedPoint[];
  frozen_breaks: BrokenPoint[];
  timestamp: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders = getAuthHeaders();
  const mergedHeaders = {
    ...authHeaders,
    ...(init?.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers: mergedHeaders });
  if (res.status === 401) {
    // Token expired or invalid — dispatch event so AuthContext can logout cleanly
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("thesisarc:unauthorized"));
    }
    throw new Error("Session expired. Please log in again.");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? `API error ${res.status}: ${path}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// --- Portfolio CRUD ---

export interface Portfolio {
  id: number;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
  stock_count: number;
}

export const fetchPortfolios = (): Promise<Portfolio[]> =>
  apiFetch("/portfolios");

export const createPortfolio = (name: string, description?: string): Promise<Portfolio> =>
  apiFetch("/portfolios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description: description ?? null }),
  });

export const updatePortfolio = (id: number, name: string): Promise<Portfolio> =>
  apiFetch(`/portfolios/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

export const deletePortfolio = (id: number): Promise<void> =>
  apiFetch(`/portfolios/${id}`, { method: "DELETE" });

// --- Query param helper ---

function pq(portfolioId?: number | null): string {
  return portfolioId ? `portfolio_id=${portfolioId}` : "";
}

function joinParams(...parts: string[]): string {
  const filtered = parts.filter(Boolean);
  return filtered.length ? "?" + filtered.join("&") : "";
}

// --- Stocks ---

export const fetchStocks = (portfolioId?: number | null): Promise<Stock[]> =>
  apiFetch(`/stocks${joinParams(pq(portfolioId))}`);

export const addStock = (ticker: string, portfolioId?: number | null): Promise<Stock> =>
  apiFetch(`/stocks${joinParams(pq(portfolioId))}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker, name: "" }),
  });

export const deleteStock = (ticker: string, portfolioId?: number | null): Promise<void> =>
  apiFetch(`/stocks/${ticker}${joinParams(pq(portfolioId))}`, { method: "DELETE" });

export const toggleWatchlist = (ticker: string, portfolioId?: number | null): Promise<Stock> =>
  apiFetch(`/stocks/${ticker}/watchlist${joinParams(pq(portfolioId))}`, { method: "PATCH" });

export const reorderTheses = (
  ticker: string,
  order: { id: number; sort_order: number }[],
  portfolioId?: number | null
): Promise<void> =>
  apiFetch(`/stocks/${ticker}/theses/reorder${joinParams(pq(portfolioId))}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order),
  });

export const getTheses = (ticker: string, portfolioId?: number | null): Promise<Thesis[]> =>
  apiFetch(`/stocks/${ticker}/theses${joinParams(pq(portfolioId))}`);

export const generateThesis = (ticker: string, portfolioId?: number | null): Promise<Thesis[]> =>
  apiFetch(`/stocks/${ticker}/generate-thesis${joinParams(pq(portfolioId))}`, { method: "POST" });

export const addManualThesis = (
  ticker: string,
  category: string,
  statement: string,
  portfolioId?: number | null
): Promise<Thesis> =>
  apiFetch(`/stocks/${ticker}/theses${joinParams(pq(portfolioId))}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, statement }),
  });

export const updateThesisSelection = (
  ticker: string,
  thesisId: number,
  selected: boolean,
  portfolioId?: number | null
): Promise<Thesis> =>
  apiFetch(`/stocks/${ticker}/theses/${thesisId}${joinParams(pq(portfolioId))}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selected }),
  });

export const updateThesisStatement = (
  ticker: string,
  thesisId: number,
  statement: string,
  portfolioId?: number | null
): Promise<Thesis> =>
  apiFetch(`/stocks/${ticker}/theses/${thesisId}${joinParams(pq(portfolioId))}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ statement }),
  });

export const updateThesisFrozen = (
  ticker: string,
  thesisId: number,
  frozen: boolean,
  portfolioId?: number | null
): Promise<Thesis> =>
  apiFetch(`/stocks/${ticker}/theses/${thesisId}${joinParams(pq(portfolioId))}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frozen }),
  });

export const updateThesisConviction = (
  ticker: string,
  thesisId: number,
  conviction: "liked" | "disliked" | null,
  portfolioId?: number | null
): Promise<Thesis> =>
  apiFetch(`/stocks/${ticker}/theses/${thesisId}${joinParams(pq(portfolioId))}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: conviction === null
      ? JSON.stringify({ clear_conviction: true })
      : JSON.stringify({ conviction }),
  });

export const deleteThesis = (ticker: string, thesisId: number, portfolioId?: number | null): Promise<void> =>
  apiFetch(`/stocks/${ticker}/theses/${thesisId}${joinParams(pq(portfolioId))}`, { method: "DELETE" });

export const runEvaluation = (ticker: string, portfolioId?: number | null): Promise<Evaluation> =>
  apiFetch(`/stocks/${ticker}/evaluate${joinParams(pq(portfolioId))}`, { method: "POST" });

export const getLatestEvaluation = (ticker: string, portfolioId?: number | null): Promise<Evaluation> =>
  apiFetch(`/stocks/${ticker}/evaluation${joinParams(pq(portfolioId))}`);

export interface ScoreDelta {
  has_delta: boolean;
  current_score?: number;
  previous_score?: number;
  score_delta?: number;
  current_timestamp?: string;
  previous_timestamp?: string;
  newly_broken?: BrokenPoint[];
  newly_confirmed?: ConfirmedPoint[];
  recovered?: BrokenPoint[];
}

export const getEvaluationDelta = (ticker: string, portfolioId?: number | null): Promise<ScoreDelta> =>
  apiFetch(`/stocks/${ticker}/evaluation/delta${joinParams(pq(portfolioId))}`);

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ThesisSuggestion {
  category: string;
  statement: string;
}

export interface ChatResponse {
  message: string;
  suggestion: ThesisSuggestion | null;
}

export const chatWithAssistant = (
  ticker: string,
  messages: ChatMessage[]
): Promise<ChatResponse> =>
  apiFetch(`/stocks/${ticker}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

export interface PortfolioAction {
  type: "add_stock" | "delete_stock" | "add_thesis";
  ticker: string;
  category?: string;
  statement?: string;
}

export interface PortfolioChatResponse {
  message: string;
  action?: PortfolioAction | null;
}

export const chatWithPortfolioAssistant = (
  messages: ChatMessage[],
  portfolioId?: number | null
): Promise<PortfolioChatResponse> =>
  apiFetch(`/portfolio/chat${joinParams(pq(portfolioId))}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

export interface BriefingItem {
  ticker: string;
  headline: string;
  impact: "bullish" | "bearish" | "neutral";
  suggestion?: ThesisSuggestion | null;
  source_url?: string | null;
}

export interface MorningBriefingResponse {
  summary: string;
  items: BriefingItem[];
  date?: string;
}

export interface EvaluationSummary {
  id: number;
  score: number;
  status: string;
  timestamp: string;
}

export interface StockTrend {
  ticker: string;
  score: number;
  previous_score: number | null;
  trend: "up" | "down" | "flat" | "new";
}

export const getEvaluationHistory = (
  ticker: string,
  limit = 20,
  portfolioId?: number | null
): Promise<EvaluationSummary[]> =>
  apiFetch(`/stocks/${ticker}/evaluation-history${joinParams(`limit=${limit}`, pq(portfolioId))}`);

export const getPortfolioTrends = (portfolioId?: number | null): Promise<StockTrend[]> =>
  apiFetch(`/portfolio/trends${joinParams(pq(portfolioId))}`);

export interface EvaluateAllResult {
  evaluated: string[];
  skipped: string[];
  errors: Record<string, string>;
}

export const evaluateAll = (portfolioId?: number | null): Promise<EvaluateAllResult> =>
  apiFetch(`/portfolio/evaluate-all${joinParams(pq(portfolioId))}`, { method: "POST" });

export const getMorningBriefing = (portfolioId?: number | null, signal?: AbortSignal): Promise<MorningBriefingResponse> =>
  apiFetch(`/portfolio/morning-briefing${joinParams(pq(portfolioId))}`, signal ? { signal } : undefined);

export const refreshMorningBriefing = (portfolioId?: number | null): Promise<MorningBriefingResponse> =>
  apiFetch(`/portfolio/morning-briefing/refresh${joinParams(pq(portfolioId))}`, { method: "POST" });

export const getBriefingHistory = (limit = 7, portfolioId?: number | null): Promise<MorningBriefingResponse[]> =>
  apiFetch(`/portfolio/briefing-history${joinParams(`limit=${limit}`, pq(portfolioId))}`);

export const getPortfolioScoreHistories = (
  limit = 10,
  portfolioId?: number | null
): Promise<Record<string, EvaluationSummary[]>> =>
  apiFetch(`/portfolio/score-histories${joinParams(`limit=${limit}`, pq(portfolioId))}`);

export interface GenerateAndEvaluateResponse {
  theses: Thesis[];
  evaluation: Evaluation | null;
}

export const generateAndEvaluate = (ticker: string, portfolioId?: number | null): Promise<GenerateAndEvaluateResponse> =>
  apiFetch(`/stocks/${ticker}/generate-and-evaluate${joinParams(pq(portfolioId))}`, { method: "POST" });

export interface ThesisPreview {
  category: string;
  statement: string;
  importance: string;
  weight: number;
}

export const previewThesis = (ticker: string, portfolioId?: number | null): Promise<ThesisPreview[]> =>
  apiFetch(`/stocks/${ticker}/preview-thesis${joinParams(pq(portfolioId))}`, { method: "POST" });

export interface NewsItem {
  title: string;
  url: string;
  published_utc: string;
}

export const fetchStockNews = (ticker: string, portfolioId?: number | null): Promise<NewsItem[]> =>
  apiFetch(`/stocks/${ticker}/news${joinParams(pq(portfolioId))}`);

export const getChatHistory = (ticker: string): Promise<ChatMessage[]> =>
  apiFetch(`/stocks/${ticker}/chat/history`);

export const clearChatHistory = (ticker: string): Promise<void> =>
  apiFetch(`/stocks/${ticker}/chat/history`, { method: "DELETE" });

export const getPortfolioChatHistory = (portfolioId?: number | null): Promise<ChatMessage[]> =>
  apiFetch(`/portfolio/chat/history${joinParams(pq(portfolioId))}`);

export const clearPortfolioChatHistory = (portfolioId?: number | null): Promise<void> =>
  apiFetch(`/portfolio/chat/history${joinParams(pq(portfolioId))}`, { method: "DELETE" });

export interface StockReturn {
  ticker: string;
  return_pct: number;
}

export interface PortfolioReturnsData {
  portfolio_return: number;
  benchmark_return: number;
  alpha: number;
  period: string;
  stocks: StockReturn[];
}

export const getPortfolioReturns = (period = "3mo", portfolioId?: number | null): Promise<PortfolioReturnsData> =>
  apiFetch(`/portfolio/returns${joinParams(`period=${period}`, pq(portfolioId))}`);

export const getPortfolioSparklines = (portfolioId?: number | null): Promise<Record<string, number[]>> =>
  apiFetch(`/portfolio/sparklines${joinParams(pq(portfolioId))}`);

export interface SectorEntry {
  ticker: string;
  sector: string;
}

export const getPortfolioSectors = (portfolioId?: number | null): Promise<SectorEntry[]> =>
  apiFetch(`/portfolio/sectors${joinParams(pq(portfolioId))}`);

// ── Investor Profile ──────────────────────────────────────────────────────

export interface ScenarioPrediction {
  situation: string;
  likely_action: string;
  watch_out_for: string;
}

export interface InvestorProfile {
  id: number;
  user_id: number;
  investment_style: string | null;
  time_horizon: string | null;
  loss_aversion: string | null;
  risk_capacity: string | null;
  experience_level: string | null;
  overconfidence_bias: string | null;
  primary_bias: string | null;
  archetype_label: string | null;
  behavioral_summary: string | null;
  scenario_predictions: ScenarioPrediction[] | null;
  bias_fingerprint: Record<string, number> | null;
  wizard_completed: boolean;
  wizard_skipped: boolean;
}

export interface InvestorProfileCreateRequest {
  investment_style: string;
  time_horizon: string;
  loss_aversion: string;
  risk_capacity: string;
  experience_level: string;
  overconfidence_bias?: string;
}

export const fetchInvestorProfile = (): Promise<InvestorProfile> =>
  apiFetch("/profile");

export const createInvestorProfile = (data: InvestorProfileCreateRequest): Promise<InvestorProfile> =>
  apiFetch("/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const updateInvestorProfile = (data: InvestorProfileCreateRequest): Promise<InvestorProfile> =>
  apiFetch("/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const skipProfileWizard = (): Promise<InvestorProfile> =>
  apiFetch("/profile/skip", { method: "POST" });

export interface DigestStock {
  ticker: string;
  name: string;
  logo_url: string | null;
  current_score: number | null;
  previous_score: number | null;
  trend: string;
}

export interface WeeklyDigest {
  generated_at: string;
  portfolio_avg: number | null;
  stocks: DigestStock[];
}

export const getWeeklyDigest = (portfolioId?: number | null): Promise<WeeklyDigest> =>
  apiFetch(`/portfolio/digest${joinParams(pq(portfolioId))}`);

export const getShareToken = (ticker: string, portfolioId?: number | null): Promise<{ token: string }> =>
  apiFetch(`/stocks/${ticker}/share-token${joinParams(pq(portfolioId))}`);

export interface PublicThesisPoint {
  category: string;
  statement: string;
  importance: string;
  frozen: boolean;
  conviction: string | null;
}

export interface PublicEvaluation {
  score: number;
  status: string;
  explanation: string | null;
  confirmed_points: { thesis_id: number; statement: string; signal: string; credit: number }[];
  broken_points: { thesis_id: number; statement: string; signal: string; deduction: number }[];
}

export interface PublicShareResponse {
  ticker: string;
  name: string;
  logo_url: string | null;
  share_token: string;
  theses: PublicThesisPoint[];
  evaluation: PublicEvaluation | null;
}

export const getSharedThesis = (token: string): Promise<PublicShareResponse> =>
  fetch(`${BASE_URL}/share/${token}`).then((r) => {
    if (!r.ok) throw new Error("Share link not found");
    return r.json();
  });
