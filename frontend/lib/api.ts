const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

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
  source: "ai" | "manual";
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
    // Token expired or invalid — clear and redirect to login
    if (typeof window !== "undefined") {
      localStorage.removeItem("thesisarc_token");
      window.location.href = "/login";
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

export const fetchStocks = (): Promise<Stock[]> => apiFetch("/stocks");

export const addStock = (ticker: string): Promise<Stock> =>
  apiFetch("/stocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker, name: "" }),
  });

export const deleteStock = (ticker: string): Promise<void> =>
  apiFetch(`/stocks/${ticker}`, { method: "DELETE" });

export const getTheses = (ticker: string): Promise<Thesis[]> =>
  apiFetch(`/stocks/${ticker}/theses`);

export const generateThesis = (ticker: string): Promise<Thesis[]> =>
  apiFetch(`/stocks/${ticker}/generate-thesis`, { method: "POST" });

export const addManualThesis = (
  ticker: string,
  category: string,
  statement: string
): Promise<Thesis> =>
  apiFetch(`/stocks/${ticker}/theses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, statement }),
  });

export const updateThesisSelection = (
  ticker: string,
  thesisId: number,
  selected: boolean
): Promise<Thesis> =>
  apiFetch(`/stocks/${ticker}/theses/${thesisId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selected }),
  });

export const updateThesisStatement = (
  ticker: string,
  thesisId: number,
  statement: string
): Promise<Thesis> =>
  apiFetch(`/stocks/${ticker}/theses/${thesisId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ statement }),
  });

export const updateThesisFrozen = (
  ticker: string,
  thesisId: number,
  frozen: boolean
): Promise<Thesis> =>
  apiFetch(`/stocks/${ticker}/theses/${thesisId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frozen }),
  });

export const deleteThesis = (ticker: string, thesisId: number): Promise<void> =>
  apiFetch(`/stocks/${ticker}/theses/${thesisId}`, { method: "DELETE" });

export const runEvaluation = (ticker: string): Promise<Evaluation> =>
  apiFetch(`/stocks/${ticker}/evaluate`, { method: "POST" });

export const getLatestEvaluation = (ticker: string): Promise<Evaluation> =>
  apiFetch(`/stocks/${ticker}/evaluation`);

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
  messages: ChatMessage[]
): Promise<PortfolioChatResponse> =>
  apiFetch("/portfolio/chat", {
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
  limit = 20
): Promise<EvaluationSummary[]> =>
  apiFetch(`/stocks/${ticker}/evaluation-history?limit=${limit}`);

export const getPortfolioTrends = (): Promise<StockTrend[]> =>
  apiFetch("/portfolio/trends");

export interface EvaluateAllResult {
  evaluated: string[];
  skipped: string[];
  errors: Record<string, string>;
}

export const evaluateAll = (): Promise<EvaluateAllResult> =>
  apiFetch("/portfolio/evaluate-all", { method: "POST" });

export const getMorningBriefing = (): Promise<MorningBriefingResponse> =>
  apiFetch("/portfolio/morning-briefing");

export const refreshMorningBriefing = (): Promise<MorningBriefingResponse> =>
  apiFetch("/portfolio/morning-briefing/refresh", { method: "POST" });

export const getBriefingHistory = (limit = 7): Promise<MorningBriefingResponse[]> =>
  apiFetch(`/portfolio/briefing-history?limit=${limit}`);

export const getPortfolioScoreHistories = (
  limit = 10
): Promise<Record<string, EvaluationSummary[]>> =>
  apiFetch(`/portfolio/score-histories?limit=${limit}`);

export interface GenerateAndEvaluateResponse {
  theses: Thesis[];
  evaluation: Evaluation | null;
}

export const generateAndEvaluate = (ticker: string): Promise<GenerateAndEvaluateResponse> =>
  apiFetch(`/stocks/${ticker}/generate-and-evaluate`, { method: "POST" });

export interface NewsItem {
  title: string;
  url: string;
  published_utc: string;
}

export const fetchStockNews = (ticker: string): Promise<NewsItem[]> =>
  apiFetch(`/stocks/${ticker}/news`);

export const getChatHistory = (ticker: string): Promise<ChatMessage[]> =>
  apiFetch(`/stocks/${ticker}/chat/history`);

export const clearChatHistory = (ticker: string): Promise<void> =>
  apiFetch(`/stocks/${ticker}/chat/history`, { method: "DELETE" });

export const getPortfolioChatHistory = (): Promise<ChatMessage[]> =>
  apiFetch("/portfolio/chat/history");

export const clearPortfolioChatHistory = (): Promise<void> =>
  apiFetch("/portfolio/chat/history", { method: "DELETE" });

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

export const getPortfolioReturns = (period = "3mo"): Promise<PortfolioReturnsData> =>
  apiFetch(`/portfolio/returns?period=${period}`);

export const getPortfolioSparklines = (): Promise<Record<string, number[]>> =>
  apiFetch("/portfolio/sparklines");

export interface SectorEntry {
  ticker: string;
  sector: string;
}

export const getPortfolioSectors = (): Promise<SectorEntry[]> =>
  apiFetch("/portfolio/sectors");
