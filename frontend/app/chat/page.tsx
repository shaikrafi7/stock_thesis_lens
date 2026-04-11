"use client";

import { useState, useRef, useEffect } from "react";
import {
  fetchStocks, getChatHistory, getPortfolioChatHistory,
  clearChatHistory, clearPortfolioChatHistory,
  addManualThesis, type ChatMessage, type ThesisSuggestion, type PortfolioAction, type Stock,
} from "@/lib/api";
import { streamChat } from "@/lib/streaming";
import { usePortfolio } from "@/app/context/PortfolioContext";
import { ChevronDown, Send, Plus, Loader2, Trash2, Bot } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  competitive_moat: "Competitive Moat",
  growth_trajectory: "Growth Trajectory",
  valuation: "Valuation",
  financial_health: "Financial Health",
  ownership_conviction: "Ownership & Conviction",
  risks: "Risks & Bear Case",
};

function renderMessageContent(text: string) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (match) {
      return (
        <a key={i} href={match[2]} target="_blank" rel="noopener noreferrer"
          className="underline underline-offset-2 decoration-zinc-500 hover:decoration-zinc-300 transition-colors">
          {match[1]}
        </a>
      );
    }
    return part;
  });
}

type Context = { type: "portfolio" } | { type: "stock"; ticker: string; name: string };

export default function ChatPage() {
  const { activePortfolioId } = usePortfolio();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [context, setContext] = useState<Context>({ type: "portfolio" });
  const [contextOpen, setContextOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [pendingSuggestion, setPendingSuggestion] = useState<ThesisSuggestion | null>(null);
  const [pendingAction, setPendingAction] = useState<PortfolioAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  // Load stocks for context switcher
  useEffect(() => {
    fetchStocks(activePortfolioId).then(setStocks).catch(() => {});
  }, [activePortfolioId]);

  // Load history when context changes
  useEffect(() => {
    setMessages([]);
    setPendingSuggestion(null);
    setPendingAction(null);
    setError("");
    setHistoryLoading(true);
    const fetch = context.type === "portfolio"
      ? getPortfolioChatHistory(activePortfolioId)
      : getChatHistory(context.ticker);
    fetch.then(setMessages).catch(() => {}).finally(() => setHistoryLoading(false));
  }, [context, activePortfolioId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Close context dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) setContextOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || loading) return;

    const userMsg: ChatMessage = { role: "user", content: msg };
    const newHistory = [...messages, userMsg];
    setMessages([...newHistory, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);
    setPendingSuggestion(null);
    setPendingAction(null);
    setError("");

    let accumulated = "";
    const path = context.type === "portfolio"
      ? "/portfolio/chat/stream"
      : `/stocks/${context.ticker}/chat/stream`;

    await streamChat(path, { messages: newHistory }, {
      onToken(text) {
        accumulated += text;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: accumulated };
          return updated;
        });
      },
      onMeta(event, data) {
        if (event === "suggestion") setPendingSuggestion(data as unknown as ThesisSuggestion);
        else if (event === "action") setPendingAction(data as unknown as PortfolioAction);
      },
      onDone() { setLoading(false); },
      onError(message) {
        if (!accumulated) {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: message };
            return updated;
          });
        }
        setLoading(false);
      },
    });
  }

  async function handleClear() {
    try {
      if (context.type === "portfolio") await clearPortfolioChatHistory(activePortfolioId);
      else await clearChatHistory(context.ticker);
      setMessages([]);
    } catch { /* ignore */ }
  }

  async function handleAddSuggestion() {
    if (!pendingSuggestion || context.type !== "stock") return;
    setActionLoading(true);
    try {
      await addManualThesis(context.ticker, pendingSuggestion.category, pendingSuggestion.statement);
      setPendingSuggestion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally { setActionLoading(false); }
  }

  const contextLabel = context.type === "portfolio"
    ? `Portfolio — ${activePortfolioId ? "All stocks" : "Default"}`
    : `${context.ticker} — ${context.name}`;

  const placeholder = context.type === "portfolio"
    ? `Ask about your portfolio — "Which stock is weakest?", "Add Microsoft"`
    : `Ask about ${context.ticker} — "What's the main risk?", "Suggest a catalyst point"`;

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-3rem)]">
      {/* Chat header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <Bot className="w-5 h-5 text-accent" />
          <div>
            <h1 className="text-sm font-semibold text-white">Research AI</h1>
            <p className="text-xs text-zinc-500">Ask anything about your portfolio or a specific stock</p>
          </div>
        </div>

        {/* Context switcher */}
        <div className="flex items-center gap-2">
          <div className="relative" ref={contextRef}>
            <button
              onClick={() => setContextOpen((o) => !o)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/6 hover:bg-zinc-800 transition-colors text-xs text-zinc-200"
            >
              <span className="max-w-[200px] truncate">{contextLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            </button>

            {contextOpen && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-surface border border-white/8 rounded-xl shadow-2xl z-50 py-1 overflow-hidden" style={{boxShadow:"0 20px 40px rgba(0,0,0,0.5)"}}>
                {/* Portfolio option */}
                <button
                  onClick={() => { setContext({ type: "portfolio" }); setContextOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                    context.type === "portfolio" ? "text-accent bg-accent/8 font-medium" : "text-zinc-300 hover:bg-zinc-800/60"
                  }`}
                >
                  <p className="font-medium">Portfolio Chat</p>
                  <p className="text-zinc-500 text-[10px]">Ask about all stocks, add/remove stocks</p>
                </button>

                {stocks.length > 0 && (
                  <>
                    <div className="border-t border-white/5 my-1" />
                    <p className="px-3 py-1 text-[10px] text-zinc-600 uppercase tracking-widest">Stock chats</p>
                    {stocks.map((s) => (
                      <button
                        key={s.ticker}
                        onClick={() => { setContext({ type: "stock", ticker: s.ticker, name: s.name }); setContextOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${
                          context.type === "stock" && context.ticker === s.ticker
                            ? "text-accent bg-accent/8 font-medium"
                            : "text-zinc-300 hover:bg-zinc-800/60"
                        }`}
                      >
                        {s.logo_url ? (
                          <img src={s.logo_url} alt={s.ticker} className="w-5 h-5 rounded object-contain bg-zinc-800" />
                        ) : (
                          <span className="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center text-[9px] font-bold text-zinc-400">{s.ticker[0]}</span>
                        )}
                        <div>
                          <span className="font-mono font-semibold">{s.ticker}</span>
                          <span className="text-zinc-500 ml-1.5">{s.name}</span>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="Clear chat history"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {historyLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
          </div>
        )}
        {!historyLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 space-y-4">
            <Bot className="w-10 h-10 text-zinc-700" />
            <p className="text-zinc-500 text-sm max-w-md leading-relaxed">{placeholder}</p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {(context.type === "portfolio" ? [
                "Which stock in my portfolio has the weakest thesis?",
                "Which thesis points are most at risk right now?",
                "Summarize my portfolio conviction in one paragraph",
                "What should I evaluate next?",
              ] : [
                `What are the biggest risks for ${(context as { type: "stock"; ticker: string }).ticker}?`,
                `Suggest a new thesis point for ${(context as { type: "stock"; ticker: string }).ticker}`,
                `What signals support or challenge my current thesis?`,
                `How does recent news affect the thesis?`,
              ]).map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => { setInput(prompt); }}
                  className="px-3 py-1.5 bg-zinc-800/60 hover:bg-zinc-700/60 border border-white/6 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition-colors text-left"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-accent text-black font-medium rounded-br-md"
                : "bg-zinc-800/80 text-zinc-200 rounded-bl-md"
            }`}>
              {msg.role === "assistant" ? renderMessageContent(msg.content) : msg.content}
            </div>
          </div>
        ))}
        {loading && messages[messages.length - 1]?.content === "" && (
          <div className="flex justify-start">
            <div className="bg-zinc-800 text-zinc-500 px-4 py-2.5 rounded-2xl text-sm flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Thinking…
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Suggestion card */}
      {pendingSuggestion && context.type === "stock" && (
        <div className="mx-6 mb-2 border border-teal-800 bg-teal-950/40 rounded-xl p-3 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <span className="text-xs text-teal-400 uppercase tracking-wide font-semibold">
                {CATEGORY_LABELS[pendingSuggestion.category] ?? pendingSuggestion.category}
              </span>
              <p className="text-zinc-200 text-sm mt-1">{pendingSuggestion.statement}</p>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button onClick={handleAddSuggestion} disabled={actionLoading}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-accent hover:bg-accent-hover disabled:opacity-50 text-black font-semibold rounded-md transition-colors">
                {actionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                {actionLoading ? "Adding…" : "Add"}
              </button>
              <button onClick={() => setPendingSuggestion(null)}
                className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-md transition-colors">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-red-400 text-xs px-6 pb-1 shrink-0">{error}</p>}

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2 px-6 py-3 border-t border-white/5 shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={context.type === "portfolio" ? "Ask about your portfolio…" : `Ask about ${context.ticker}…`}
          disabled={loading}
          className="flex-1 px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15 transition-colors"
        />
        <button
          type="submit"
          disabled={loading || input.trim().length === 0}
          className="px-4 py-2.5 text-sm bg-accent hover:bg-accent-hover disabled:bg-zinc-900 disabled:text-zinc-600 text-black font-semibold rounded-xl shrink-0 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
