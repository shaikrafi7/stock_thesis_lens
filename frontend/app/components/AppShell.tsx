"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAssistant } from "@/app/context/AssistantContext";
import PortfolioSidebar from "./PortfolioSidebar";
import EvaluateAllButton from "./EvaluateAllButton";
import { useAuth } from "@/app/context/AuthContext";
import { Menu, X, Home, Settings, LogOut } from "lucide-react";

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const { isOpen: assistantOpen } = useAssistant();
  const pathname = usePathname();

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
        <main
          className={`flex-1 overflow-y-auto transition-all duration-200 ${
            assistantOpen ? "mr-96" : ""
          }`}
        >
          {children}
        </main>

        {/* Right sidebar — portfolio list (stock pages only) */}
        {pathname.startsWith("/stocks/") && (
          <PortfolioSidebar
            collapsed={rightCollapsed}
            onToggle={() => setRightCollapsed((c) => !c)}
          />
        )}
      </div>
    </div>
  );
}
