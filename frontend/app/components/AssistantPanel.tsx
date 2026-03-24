"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  chatWithAssistant,
  chatWithPortfolioAssistant,
  addManualThesis,
  addStock,
  deleteStock,
  type ChatMessage,
  type ThesisSuggestion,
  type PortfolioAction,
} from "@/lib/api";
import { useAssistant } from "@/app/context/AssistantContext";

const CATEGORY_LABELS: Record<string, string> = {
  core_beliefs: "Core Beliefs",
  strengths: "Strengths",
  risks: "Risks",
  leadership: "Leadership",
  catalysts: "Catalysts",
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
  const { isOpen, togglePanel, ticker, fireThesisAdded } = useAssistant();
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

    try {
      if (isPortfolioMode) {
        const result = await chatWithPortfolioAssistant(newHistory);
        setChatHistory((prev) => [
          ...prev,
          { role: "assistant", content: result.message },
        ]);
        if (result.action) setPendingAction(result.action);
      } else {
        const result = await chatWithAssistant(ticker!, newHistory);
        setChatHistory((prev) => [
          ...prev,
          { role: "assistant", content: result.message },
        ]);
        if (result.suggestion) setPendingSuggestion(result.suggestion);
      }
    } catch (err) {
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
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
    return `Add to ${a.ticker} · ${CATEGORY_LABELS[a.category ?? ""] ?? a.category}`;
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
          className="fixed bottom-6 right-6 z-40 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-full border border-zinc-700 shadow-lg transition-colors"
        >
          {isPortfolioMode ? "Portfolio AI" : "Research AI"}
        </button>
      )}

      {/* Slide-in panel */}
      <div
        className={`fixed top-0 right-0 h-full w-96 bg-zinc-900 border-l border-zinc-800 shadow-2xl z-30 flex flex-col transition-transform duration-200 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">
              {isPortfolioMode ? "Portfolio AI" : "Research AI"}
            </h2>
            <p className="text-zinc-500 text-xs mt-0.5">
              {isPortfolioMode ? "Your Portfolio" : ticker}
            </p>
          </div>
          <button
            onClick={togglePanel}
            className="text-zinc-500 hover:text-zinc-300 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Chat history */}
        <div className="flex-1 flex flex-col gap-3 px-4 py-3 overflow-y-auto">
          {chatHistory.length === 0 && (
            <p className="text-zinc-600 text-xs text-center py-8 leading-relaxed">
              {isPortfolioMode
                ? "Ask about your portfolio — \"Which stock is weakest?\", \"Add Microsoft\", \"Suggest a risk point for NVDA\""
                : `Ask anything — "What's the main risk for ${ticker}?" or "Suggest a catalyst point."`}
            </p>
          )}
          {chatHistory.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-700 text-white"
                    : "bg-zinc-800 text-zinc-200"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-zinc-800 text-zinc-500 px-3 py-2 rounded-lg text-sm">
                Thinking…
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Stock mode: thesis suggestion card */}
        {!isPortfolioMode && pendingSuggestion && (
          <div className="mx-4 mb-2 border border-blue-800 bg-blue-950 rounded-lg p-3 shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <span className="text-xs text-blue-400 uppercase tracking-wide font-semibold">
                  {CATEGORY_LABELS[pendingSuggestion.category] ?? pendingSuggestion.category}
                </span>
                <p className="text-zinc-200 text-sm mt-1">{pendingSuggestion.statement}</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={handleAddSuggestion}
                  disabled={actionLoading}
                  className="px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded transition-colors"
                >
                  {actionLoading ? "Adding…" : "Add"}
                </button>
                <button
                  onClick={() => setPendingSuggestion(null)}
                  className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Portfolio mode: action card */}
        {isPortfolioMode && pendingAction && (
          <div className="mx-4 mb-2 border border-blue-800 bg-blue-950 rounded-lg p-3 shrink-0">
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
                  className="px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded transition-colors"
                >
                  {actionLoading ? "…" : actionButtonLabel(pendingAction)}
                </button>
                <button
                  onClick={() => setPendingAction(null)}
                  className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded transition-colors"
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
            placeholder={isPortfolioMode ? "Ask about your portfolio…" : "Ask about the company…"}
            disabled={chatLoading}
            className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={chatLoading || chatInput.trim().length === 0}
            className="px-3 py-2 text-sm bg-blue-700 hover:bg-blue-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded shrink-0 transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </>
  );
}
