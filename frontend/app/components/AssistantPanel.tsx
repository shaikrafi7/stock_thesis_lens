"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  addManualThesis,
  addStock,
  deleteStock,
  type ChatMessage,
  type ThesisSuggestion,
  type PortfolioAction,
} from "@/lib/api";
import { streamChat } from "@/lib/streaming";
import { useAssistant } from "@/app/context/AssistantContext";
import { X, Send, Plus, Loader2, MessageSquare, Bot } from "lucide-react";

function renderMessageContent(text: string) {
  // Convert markdown links [text](url) to clickable <a> tags
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (match) {
      return (
        <a
          key={i}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 decoration-zinc-500 hover:decoration-zinc-300 transition-colors"
        >
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

const PORTFOLIO_KEY = "chat___portfolio___";
const MAX_STORED_MESSAGES = 40;

function storageKey(ticker: string | null) {
  return ticker ? `chat_history_${ticker}` : PORTFOLIO_KEY;
}

function loadHistory(ticker: string | null): ChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(ticker));
    if (!raw) return [];
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    return [];
  }
}

function saveHistory(ticker: string | null, history: ChatMessage[]) {
  try {
    const trimmed = history.slice(-MAX_STORED_MESSAGES);
    localStorage.setItem(storageKey(ticker), JSON.stringify(trimmed));
  } catch {
    // localStorage unavailable — silent fail
  }
}

export default function AssistantPanel() {
  const router = useRouter();
  const { isOpen, togglePanel, ticker, fireThesisAdded, fireEvaluationTriggered } = useAssistant();
  const isPortfolioMode = ticker === null;

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] = useState<ThesisSuggestion | null>(null);
  const [pendingAction, setPendingAction] = useState<PortfolioAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Ref tracks the ticker that chatHistory belongs to — prevents cross-contamination on switch
  const activeTicker = useRef<string | null>(ticker);

  // Load persisted history whenever ticker changes
  useEffect(() => {
    activeTicker.current = ticker;
    setChatHistory(loadHistory(ticker));
    setChatInput("");
    setPendingSuggestion(null);
    setPendingAction(null);
    setError("");
  }, [ticker]);

  // Persist whenever history changes — only if we're still on the same ticker
  const persistHistory = useCallback((history: ChatMessage[]) => {
    if (history.length > 0) {
      saveHistory(activeTicker.current, history);
    }
  }, []);

  useEffect(() => {
    persistHistory(chatHistory);
  }, [chatHistory, persistHistory]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const input = chatInput.trim();
    if (!input || chatLoading) return;

    const userMsg: ChatMessage = { role: "user", content: input };
    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);
    setChatInput("");
    setChatLoading(true);
    setPendingSuggestion(null);
    setPendingAction(null);
    setError("");

    // Add placeholder assistant message that will stream in
    const streamingHistory = [...newHistory, { role: "assistant" as const, content: "" }];
    setChatHistory(streamingHistory);

    let accumulated = "";
    const path = isPortfolioMode
      ? "/portfolio/chat/stream"
      : `/stocks/${ticker}/chat/stream`;

    await streamChat(
      path,
      { messages: newHistory },
      {
        onToken(text) {
          accumulated += text;
          setChatHistory((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: accumulated };
            return updated;
          });
        },
        onMeta(event, data) {
          if (event === "suggestion") {
            setPendingSuggestion(data as unknown as ThesisSuggestion);
          } else if (event === "action") {
            setPendingAction(data as unknown as PortfolioAction);
          } else if (event === "evaluation") {
            // Chat triggered an evaluation — run it and append result message
            fireEvaluationTriggered().then((result) => {
              if (result) {
                const evalMsg = `Evaluation complete: **${result.score}/100** (${result.status}). ${result.explanation ?? ""}`;
                setChatHistory((prev) => [...prev, { role: "assistant", content: evalMsg }]);
              }
            });
          }
        },
        onDone() {
          setChatLoading(false);
        },
        onError(message) {
          if (!accumulated) {
            // Replace empty placeholder with error
            setChatHistory((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "assistant", content: message };
              return updated;
            });
          }
          setChatLoading(false);
        },
      }
    );
  }

  // Stock-mode: add thesis suggestion
  async function handleAddSuggestion() {
    if (!pendingSuggestion || !ticker) return;
    setActionLoading(true);
    try {
      const added = await addManualThesis(ticker, pendingSuggestion.category, pendingSuggestion.statement);
      fireThesisAdded(added);
      setPendingSuggestion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add point");
    } finally {
      setActionLoading(false);
    }
  }

  // Portfolio-mode: execute action
  async function handleConfirmAction() {
    if (!pendingAction) return;
    setActionLoading(true);
    setError("");
    try {
      if (pendingAction.type === "add_stock") {
        await addStock(pendingAction.ticker);
        router.refresh();
      } else if (pendingAction.type === "delete_stock") {
        await deleteStock(pendingAction.ticker);
        router.refresh();
      } else if (pendingAction.type === "add_thesis") {
        await addManualThesis(
          pendingAction.ticker,
          pendingAction.category!,
          pendingAction.statement!
        );
      }
      setPendingAction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  function actionLabel(a: PortfolioAction): string {
    if (a.type === "add_stock") return `Add ${a.ticker} to portfolio?`;
    if (a.type === "delete_stock") return `Remove ${a.ticker} from portfolio?`;
    return `Add to ${a.ticker} \u00B7 ${CATEGORY_LABELS[a.category ?? ""] ?? a.category}`;
  }

  function actionButtonLabel(a: PortfolioAction): string {
    if (a.type === "add_stock") return "Add Stock";
    if (a.type === "delete_stock") return "Remove";
    return "Add Point";
  }

  return (
    <>
      {/* Floating trigger — always visible */}
      {!isOpen && (
        <button
          onClick={togglePanel}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm rounded-full shadow-lg shadow-accent/20 transition-all hover:shadow-accent/30"
        >
          <MessageSquare className="w-4 h-4" />
          {isPortfolioMode ? "Portfolio AI" : "Research AI"}
        </button>
      )}

      {/* Backdrop — click to dismiss */}
      {isOpen && (
        <div
          onClick={togglePanel}
          className="fixed inset-0 z-20 bg-black/10"
        />
      )}

      {/* Slide-in panel */}
      <div
        className={`fixed top-0 right-0 h-full w-96 bg-surface border-l border-zinc-800 shadow-2xl z-30 flex flex-col transition-transform duration-200 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-accent" />
            <div>
              <h2 className="text-sm font-semibold text-white">
                {isPortfolioMode ? "Portfolio AI" : "Research AI"}
              </h2>
              <p className="text-zinc-500 text-xs mt-0.5">
                {isPortfolioMode ? "Your Portfolio" : ticker}
              </p>
            </div>
          </div>
          <button
            onClick={togglePanel}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Chat history */}
        <div className="flex-1 flex flex-col gap-3 px-4 py-3 overflow-y-auto">
          {chatHistory.length === 0 && (
            <p className="text-zinc-600 text-xs text-center py-8 leading-relaxed">
              {isPortfolioMode
                ? "Ask about your portfolio \u2014 \"Which stock is weakest?\", \"Add Microsoft\", \"Suggest a risk point for NVDA\""
                : `Ask anything \u2014 "What's the main risk for ${ticker}?" or "Suggest a catalyst point."`}
            </p>
          )}
          {chatHistory.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-accent text-white"
                    : "bg-zinc-800 text-zinc-200"
                }`}
              >
                {msg.role === "assistant" ? renderMessageContent(msg.content) : msg.content}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-zinc-800 text-zinc-500 px-3 py-2 rounded-xl text-sm flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Thinking\u2026
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Stock mode: thesis suggestion card */}
        {!isPortfolioMode && pendingSuggestion && (
          <div className="mx-4 mb-2 border border-teal-800 bg-teal-950/40 rounded-xl p-3 shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-teal-400 uppercase tracking-wide font-semibold">
                  {CATEGORY_LABELS[pendingSuggestion.category] ?? pendingSuggestion.category}
                </span>
                <p className="text-zinc-200 text-sm mt-1">{pendingSuggestion.statement}</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={handleAddSuggestion}
                  disabled={actionLoading}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-md transition-colors"
                >
                  {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  {actionLoading ? "Adding\u2026" : "Add"}
                </button>
                <button
                  onClick={() => setPendingSuggestion(null)}
                  className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-md transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Portfolio mode: action card */}
        {isPortfolioMode && pendingAction && (
          <div className="mx-4 mb-2 border border-teal-800 bg-teal-950/40 rounded-xl p-3 shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-zinc-200 text-sm font-medium">{actionLabel(pendingAction)}</p>
                {pendingAction.statement && (
                  <p className="text-zinc-400 text-xs mt-1 italic">&ldquo;{pendingAction.statement}&rdquo;</p>
                )}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={handleConfirmAction}
                  disabled={actionLoading}
                  className="px-2 py-1 text-xs bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-md transition-colors"
                >
                  {actionLoading ? "\u2026" : actionButtonLabel(pendingAction)}
                </button>
                <button
                  onClick={() => setPendingAction(null)}
                  className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-md transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="text-red-400 text-xs px-4 pb-1 shrink-0">{error}</p>
        )}

        {/* Input */}
        <form
          onSubmit={handleSend}
          className="flex gap-2 px-4 py-3 border-t border-zinc-800 shrink-0"
        >
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={isPortfolioMode ? "Ask about your portfolio\u2026" : "Ask about the company\u2026"}
            disabled={chatLoading}
            className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
          />
          <button
            type="submit"
            disabled={chatLoading || chatInput.trim().length === 0}
            className="px-3 py-2 text-sm bg-accent hover:bg-accent-hover disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg shrink-0 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </>
  );
}
