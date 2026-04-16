"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  addManualThesis, addStock, deleteStock,
  getChatHistory, getPortfolioChatHistory,
  type ChatMessage, type ThesisSuggestion, type PortfolioAction,
} from "@/lib/api";
import { streamChat } from "@/lib/streaming";
import { useAssistant } from "@/app/context/AssistantContext";
import { usePortfolio } from "@/app/context/PortfolioContext";
import { X, Send, Plus, Loader2, MessageSquare, Bot } from "lucide-react";

function renderMessageContent(text: string) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (match) {
      return (
        <a key={i} href={match[2]} target="_blank" rel="noopener noreferrer"
          className="underline underline-offset-2 decoration-zinc-400 hover:decoration-zinc-200 transition-colors">
          {match[1]}
        </a>
      );
    }
    return part;
  });
}

const CATEGORY_LABELS: Record<string, string> = {
  competitive_moat: "Competitive Moat",
  growth_trajectory: "Growth Trajectory",
  valuation: "Valuation",
  financial_health: "Financial Health",
  ownership_conviction: "Ownership & Conviction",
  risks: "Risks & Bear Case",
};

async function fetchHistory(ticker: string | null, portfolioId?: number | null): Promise<ChatMessage[]> {
  try {
    return ticker ? await getChatHistory(ticker) : await getPortfolioChatHistory(portfolioId);
  } catch { return []; }
}

export default function AssistantPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const { isOpen, togglePanel, ticker, fireThesisAdded, fireEvaluationTriggered, registerExplainThesisPoint } = useAssistant();
  const { activePortfolioId } = usePortfolio();
  const isPortfolioMode = ticker === null;
  const hideFab = pathname === "/chat";

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] = useState<ThesisSuggestion | null>(null);
  const [pendingAction, setPendingAction] = useState<PortfolioAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatHistoryRef = useRef<ChatMessage[]>([]);
  const chatLoadingRef = useRef(false);

  useEffect(() => { chatHistoryRef.current = chatHistory; }, [chatHistory]);
  useEffect(() => { chatLoadingRef.current = chatLoading; }, [chatLoading]);

  useEffect(() => {
    setChatHistory([]);
    setChatInput("");
    setPendingSuggestion(null);
    setPendingAction(null);
    setError("");
    setHistoryLoading(true);
    fetchHistory(ticker, activePortfolioId)
      .then(setChatHistory)
      .finally(() => setHistoryLoading(false));
  }, [ticker, activePortfolioId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  useEffect(() => {
    registerExplainThesisPoint((statement: string) => {
      if (chatLoadingRef.current) return;
      const msg = `Explain this thesis point for ${ticker ?? "this stock"}: "${statement}" — why does it matter, what signals support or challenge it?`;
      sendMessageText(msg);
    });
    return () => registerExplainThesisPoint(null);
  }, [ticker, registerExplainThesisPoint]);

  async function sendMessageText(text: string) {
    if (!text || chatLoadingRef.current) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    const newHistory = [...chatHistoryRef.current, userMsg];
    setChatHistory(newHistory);
    setChatInput("");
    setChatLoading(true);
    setPendingSuggestion(null);
    setPendingAction(null);
    setError("");

    const streamingHistory = [...newHistory, { role: "assistant" as const, content: "" }];
    setChatHistory(streamingHistory);

    let accumulated = "";
    const path = isPortfolioMode ? "/portfolio/chat/stream" : `/stocks/${ticker}/chat/stream`;

    await streamChat(path, { messages: newHistory }, {
      onToken(t) {
        accumulated += t;
        setChatHistory((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: accumulated };
          return updated;
        });
      },
      onMeta(event, data) {
        if (event === "suggestion") setPendingSuggestion(data as unknown as ThesisSuggestion);
        else if (event === "action") setPendingAction(data as unknown as PortfolioAction);
        else if (event === "evaluation") {
          fireEvaluationTriggered().then((result) => {
            if (result) {
              const evalMsg = `Evaluation complete: **${result.score}/100** (${result.status}). ${result.explanation ?? ""}`;
              setChatHistory((prev) => [...prev, { role: "assistant", content: evalMsg }]);
            }
          });
        }
      },
      onDone() { setChatLoading(false); },
      onError(err) { setError(err); setChatLoading(false); },
    });
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const input = chatInput.trim();
    if (!input || chatLoading) return;
    await sendMessageText(input);
  }

  async function handleAddSuggestion() {
    if (!pendingSuggestion || !ticker) return;
    setActionLoading(true);
    try {
      const added = await addManualThesis(ticker, pendingSuggestion.category, pendingSuggestion.statement);
      fireThesisAdded(added);
      setPendingSuggestion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add point");
    } finally { setActionLoading(false); }
  }

  async function handleConfirmAction() {
    if (!pendingAction) return;
    setActionLoading(true);
    setError("");
    try {
      if (pendingAction.type === "add_stock") { await addStock(pendingAction.ticker); router.refresh(); }
      else if (pendingAction.type === "delete_stock") { await deleteStock(pendingAction.ticker); router.refresh(); }
      else if (pendingAction.type === "add_thesis") {
        await addManualThesis(pendingAction.ticker, pendingAction.category!, pendingAction.statement!);
      }
      setPendingAction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally { setActionLoading(false); }
  }

  function actionLabel(a: PortfolioAction) {
    if (a.type === "add_stock") return `Add ${a.ticker} to portfolio?`;
    if (a.type === "delete_stock") return `Remove ${a.ticker} from portfolio?`;
    return `Add to ${a.ticker} · ${CATEGORY_LABELS[a.category ?? ""] ?? a.category}`;
  }

  function actionButtonLabel(a: PortfolioAction) {
    if (a.type === "add_stock") return "Add Stock";
    if (a.type === "delete_stock") return "Remove";
    return "Add Point";
  }

  return (
    <>
      {/* Floating trigger — hidden on /chat (redundant there) */}
      {!isOpen && !hideFab && (
        <button
          onClick={togglePanel}
          title={isPortfolioMode ? "Portfolio AI" : "Research AI"}
          className="fixed bottom-6 right-6 z-50 p-3 bg-accent hover:bg-accent-hover text-white rounded-full shadow-lg shadow-accent/20 transition-all hover:shadow-accent/30"
        >
          <MessageSquare className="w-5 h-5" />
        </button>
      )}

      {/* Backdrop — clicking outside closes panel */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/10 dark:bg-black/30"
          onClick={togglePanel}
        />
      )}

      {/* Slide-in panel — always overlays, never pushes */}
      <div
        className={`fixed top-12 right-0 h-[calc(100vh-3rem)] w-96 bg-white dark:bg-zinc-900 border-l border-gray-200 dark:border-zinc-800 shadow-2xl z-40 flex flex-col transition-transform duration-200 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-accent" />
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                {isPortfolioMode ? "Portfolio AI" : "Research AI"}
              </h2>
              <p className="text-gray-400 dark:text-zinc-500 text-xs mt-0.5">
                {isPortfolioMode ? "Your Portfolio" : ticker}
              </p>
            </div>
          </div>
          <button
            onClick={togglePanel}
            className="text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300 transition-colors p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Chat history */}
        <div className="flex-1 flex flex-col gap-3 px-4 py-3 overflow-y-auto">
          {historyLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400 dark:text-zinc-500" />
            </div>
          )}
          {!historyLoading && chatHistory.length === 0 && (
            <p className="text-gray-400 dark:text-zinc-600 text-xs text-center py-8 leading-relaxed">
              {isPortfolioMode
                ? "Ask about your portfolio — \"Which stock is weakest?\", \"Add Microsoft\", \"Suggest a risk point for NVDA\""
                : `Ask anything — "What's the main risk for ${ticker}?" or "Suggest a catalyst point."`}
            </p>
          )}
          {chatHistory.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-accent text-white font-medium"
                  : "bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-zinc-200"
              }`}>
                {msg.role === "assistant" ? renderMessageContent(msg.content) : msg.content}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500 px-3 py-2 rounded-xl text-sm flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Thinking…
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Thesis suggestion card */}
        {!isPortfolioMode && pendingSuggestion && (
          <div className="mx-4 mb-2 border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 rounded-xl p-3 shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-teal-600 dark:text-teal-400 uppercase tracking-wide font-semibold">
                  {CATEGORY_LABELS[pendingSuggestion.category] ?? pendingSuggestion.category}
                </span>
                <p className="text-gray-700 dark:text-zinc-200 text-sm mt-1">{pendingSuggestion.statement}</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={handleAddSuggestion} disabled={actionLoading}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-semibold rounded-md transition-colors">
                  {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  {actionLoading ? "Adding…" : "Add"}
                </button>
                <button onClick={() => setPendingSuggestion(null)}
                  className="px-2 py-1 text-xs bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 text-gray-600 dark:text-zinc-300 rounded-md transition-colors">
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Portfolio action card */}
        {isPortfolioMode && pendingAction && (
          <div className="mx-4 mb-2 border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 rounded-xl p-3 shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-gray-800 dark:text-zinc-200 text-sm font-medium">{actionLabel(pendingAction)}</p>
                {pendingAction.statement && (
                  <p className="text-gray-500 dark:text-zinc-400 text-xs mt-1 italic">&ldquo;{pendingAction.statement}&rdquo;</p>
                )}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={handleConfirmAction} disabled={actionLoading}
                  className="px-2 py-1 text-xs bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-semibold rounded-md transition-colors">
                  {actionLoading ? "…" : actionButtonLabel(pendingAction)}
                </button>
                <button onClick={() => setPendingAction(null)}
                  className="px-2 py-1 text-xs bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 text-gray-600 dark:text-zinc-300 rounded-md transition-colors">
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-red-500 text-xs px-4 pb-1 shrink-0">{error}</p>}

        {/* Input */}
        <form onSubmit={handleSend} className="flex gap-2 px-4 py-3 border-t border-gray-100 dark:border-zinc-800 shrink-0">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={isPortfolioMode ? "Ask about your portfolio…" : "Ask about the company…"}
            disabled={chatLoading}
            className="flex-1 px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 text-sm focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15 transition-colors"
          />
          <button
            type="submit"
            disabled={chatLoading || chatInput.trim().length === 0}
            className="px-3 py-2 text-sm bg-accent hover:bg-accent-hover disabled:bg-gray-100 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-zinc-600 text-white font-semibold rounded-lg shrink-0 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </>
  );
}
