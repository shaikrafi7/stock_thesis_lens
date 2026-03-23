const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

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
}

export interface PricePoint {
  date: string;
  close: number;
}

export interface MarketData {
  company: CompanyInfo;
  prices: PricePoint[];
}

export const fetchMarketData = (ticker: string): Promise<MarketData> =>
  apiFetch(`/stocks/${ticker}/market-data`);

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
  timestamp: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);
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
