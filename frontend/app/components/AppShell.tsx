"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import EvaluateAllButton from "./EvaluateAllButton";
import { useAuth } from "@/app/context/AuthContext";
import { usePortfolio } from "@/app/context/PortfolioContext";
import { Menu, X, Home, Settings, LogOut, ChevronDown, Plus, Trash2, Briefcase } from "lucide-react";

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { portfolios, activePortfolio, switchPortfolio, create, remove } = usePortfolio();
  const [leftOpen, setLeftOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top header bar */}
      <header className="h-12 shrink-0 border-b border-zinc-800 bg-surface flex items-center px-4 gap-3 z-10">
        <button
          onClick={() => setLeftOpen((o) => !o)}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          title="Menu"
        >
          {leftOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
        <Link href="/" className="flex items-center gap-2">
          <img src="/thesisarc-logo.png" alt="ThesisArc" className="h-6 w-auto" />
          <span className="text-sm font-semibold tracking-tight">
            <span className="text-white">Thesis</span>
            <span className="text-accent">Arc</span>
          </span>
        </Link>
        <span className="text-zinc-600 text-xs hidden sm:block">
          The arc of conviction, stress-tested daily
        </span>

        {/* Portfolio Switcher */}
        <div className="relative ml-4" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/50 transition-colors text-xs"
          >
            <Briefcase className="w-3 h-3 text-zinc-400" />
            <span className="text-zinc-200 max-w-[120px] truncate">{activePortfolio?.name ?? "Portfolio"}</span>
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </button>

          {dropdownOpen && (
            <div className="absolute top-full mt-1 left-0 w-56 bg-surface border border-zinc-700 rounded-lg shadow-xl z-50 py-1">
              {portfolios.map((p) => (
                <div key={p.id} className="flex items-center group">
                  <button
                    onClick={() => {
                      switchPortfolio(p.id);
                      setDropdownOpen(false);
                      router.push("/");
                    }}
                    className={`flex-1 text-left px-3 py-1.5 text-xs transition-colors ${
                      p.id === activePortfolio?.id
                        ? "text-accent bg-accent/10"
                        : "text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    <span className="truncate block">{p.name}</span>
                    <span className="text-[9px] text-zinc-500">{p.stock_count} stocks</span>
                  </button>
                  {!p.is_default && (
                    <button
                      onClick={async () => {
                        await remove(p.id);
                      }}
                      className="px-2 py-1.5 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete portfolio"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}

              <div className="border-t border-zinc-700 mt-1 pt-1 px-2">
                {creating ? (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!newName.trim()) return;
                      const p = await create(newName.trim());
                      switchPortfolio(p.id);
                      setNewName("");
                      setCreating(false);
                      setDropdownOpen(false);
                      router.push("/");
                    }}
                    className="flex gap-1"
                  >
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Portfolio name"
                      className="flex-1 min-w-0 px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
                    />
                    <button type="submit" className="px-2 py-1 bg-accent text-white rounded text-xs hover:bg-accent-hover">
                      Add
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={() => setCreating(true)}
                    className="flex items-center gap-1.5 w-full px-1 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    New Portfolio
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {user && (
            <span className="text-zinc-500 text-xs hidden sm:block">
              {user.username}
            </span>
          )}
          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Body: left sidebar + center + right sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — overlay */}
        {leftOpen && (
          <>
            <div
              className="fixed inset-0 z-20 bg-black/30 lg:hidden"
              onClick={() => setLeftOpen(false)}
            />
            <aside className="fixed left-0 top-12 bottom-0 w-56 z-30 bg-surface border-r border-zinc-800 flex flex-col overflow-y-auto lg:relative lg:top-0">
              {/* Navigation */}
              <nav className="px-3 py-3 border-b border-zinc-800">
                <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Navigation</p>
                <Link
                  href="/"
                  onClick={() => setLeftOpen(false)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                    pathname === "/"
                      ? "bg-accent/10 text-accent"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  <Home className="w-3.5 h-3.5" />
                  Dashboard
                </Link>
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-zinc-600 cursor-not-allowed">
                  <Settings className="w-3.5 h-3.5" />
                  Settings
                  <span className="text-[9px] text-zinc-700 ml-auto">soon</span>
                </div>
              </nav>

              {/* Evaluate All */}
              <div className="px-3 py-3 border-b border-zinc-800">
                <EvaluateAllButton />
              </div>

            </aside>
          </>
        )}

        {/* Center content — scrollable */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
