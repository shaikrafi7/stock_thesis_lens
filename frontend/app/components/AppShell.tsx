"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";
import { usePortfolio } from "@/app/context/PortfolioContext";
import { useAssistant } from "@/app/context/AssistantContext";
import { useTheme } from "@/app/context/ThemeContext";
import { fetchInvestorProfile, fetchStocks, getPortfolioScoreHistories, type InvestorProfile, type Stock, type EvaluationSummary } from "@/lib/api";
import ProfileWizard from "./ProfileWizard";
import StatusBadge from "./StatusBadge";
import {
  Menu, X, Home, Settings, LogOut, ChevronDown, Plus, Trash2,
  Briefcase, User, HelpCircle, Sun, Moon, Loader2, Clock, Sparkles, Newspaper,
} from "lucide-react";
import BrandLogo from "./BrandLogo";
import StreakBadge from "./StreakBadge";


function NavLink({ href, label, Icon, pathname, onClick }: {
  href: string; label: string; Icon: typeof Home; pathname: string; onClick?: () => void;
}) {
  const active = pathname === href;
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150 relative ${
        active
          ? "bg-indigo-50 text-indigo-600 font-medium dark:bg-indigo-950/60 dark:text-indigo-400"
          : "text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800"
      }`}
    >
      {active && <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-indigo-500 rounded-full" />}
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </Link>
  );
}

function evalAge(history: EvaluationSummary[] | undefined): { label: string; color: string } | null {
  if (!history || history.length === 0) return null;
  const latest = history[history.length - 1];
  const diffMs = Date.now() - new Date(latest.timestamp).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return { label: `${diffMin}m`, color: "text-zinc-400 dark:text-zinc-500" };
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return { label: `${diffHr}h`, color: "text-zinc-400 dark:text-zinc-500" };
  const diffDays = Math.floor(diffHr / 24);
  const color = diffDays > 7 ? "text-red-500" : diffDays > 3 ? "text-amber-500" : "text-zinc-400 dark:text-zinc-500";
  return { label: `${diffDays}d`, color };
}

function SidebarStockList({ activePortfolioId, pathname, collapsed, stocksVersion }: { activePortfolioId: number | null; pathname: string; collapsed: boolean; stocksVersion: number }) {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [histories, setHistories] = useState<Record<string, EvaluationSummary[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchStocks(activePortfolioId).catch(() => [] as Stock[]),
      getPortfolioScoreHistories(5, activePortfolioId).catch(() => ({}) as Record<string, EvaluationSummary[]>),
    ]).then(([s, h]) => { setStocks(s); setHistories(h); setLoading(false); });
  }, [activePortfolioId, pathname, stocksVersion]);

  if (collapsed) return null;
  if (loading) return <div className="px-3 py-2"><Loader2 className="w-3 h-3 animate-spin text-gray-400 dark:text-zinc-600" /></div>;
  if (stocks.length === 0) return <p className="px-3 py-2 text-xs text-gray-400 dark:text-zinc-600">No stocks yet</p>;

  const activeTicker = pathname.startsWith("/stocks/") ? pathname.split("/")[2]?.toUpperCase() : null;

  return (
    <div className="flex flex-col gap-0.5">
      {stocks.map((stock) => {
        const history = histories[stock.ticker];
        const latest = history?.[history.length - 1];
        const score = latest?.score;
        const status = latest?.status as "green" | "yellow" | "red" | undefined;
        const age = evalAge(history);
        const isActive = activeTicker === stock.ticker;
        return (
          <Link
            key={stock.ticker}
            href={`/stocks/${stock.ticker}`}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-xs relative ${
              isActive
                ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400"
                : "text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800"
            }`}
          >
            {isActive && <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-indigo-500 rounded-full" />}
            <div className="w-4 h-4 rounded shrink-0 overflow-hidden bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
              {stock.logo_url
                ? <img src={stock.logo_url} alt={stock.ticker} className="w-full h-full object-contain" />
                : <span className="text-[8px] font-bold">{stock.ticker[0]}</span>}
            </div>
            <span className="font-mono font-semibold w-10 shrink-0">{stock.ticker}</span>
            <div className="flex items-center gap-1 ml-auto">
              {score != null && (
                <span className="text-[10px] font-mono text-gray-400 dark:text-zinc-500">{Math.round(score)}</span>
              )}
              {age && (
                <span className={`text-[9px] flex items-center gap-0.5 ${age.color}`}>
                  <Clock className="w-2 h-2" />{age.label}
                </span>
              )}
              {status && <StatusBadge status={status} compact />}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { portfolios, activePortfolio, activePortfolioId, switchPortfolio, create, remove, stocksVersion } = usePortfolio();
  const { isOpen: panelOpen } = useAssistant();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showWizard, setShowWizard] = useState(false);
  const [stocksCollapsed, setStocksCollapsed] = useState(false);
  const [investorProfile, setInvestorProfile] = useState<InvestorProfile | null>(null);
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

  useEffect(() => {
    if (!user) return;
    fetchInvestorProfile()
      .then((p) => {
        setInvestorProfile(p);
        if (!p.wizard_completed && !p.wizard_skipped) setShowWizard(true);
      })
      .catch(() => setShowWizard(true));
  }, [user]);

  const sidebar = (
    <aside className="w-52 shrink-0 flex flex-col h-full">
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {/* Main nav */}
        <NavLink href="/" label="Dashboard" Icon={Home} pathname={pathname} onClick={() => setMobileOpen(false)} />
        <NavLink href="/briefing" label="Briefing" Icon={Newspaper} pathname={pathname} onClick={() => setMobileOpen(false)} />
        <NavLink href="/profile" label="Investor Profile" Icon={User} pathname={pathname} onClick={() => setMobileOpen(false)} />
        <NavLink href="/settings" label="Settings" Icon={Settings} pathname={pathname} onClick={() => setMobileOpen(false)} />

        {/* Docs */}
        <NavLink href="/why" label="Why ThesisArc" Icon={Sparkles} pathname={pathname} onClick={() => setMobileOpen(false)} />
        <NavLink href="/guide" label="User Guide" Icon={HelpCircle} pathname={pathname} onClick={() => setMobileOpen(false)} />
        <NavLink href="/faq" label="FAQ" Icon={HelpCircle} pathname={pathname} onClick={() => setMobileOpen(false)} />

        {/* Divider + stock list */}
        <div className="pt-3 pb-1">
          <button
            onClick={() => setStocksCollapsed((c) => !c)}
            className="w-full flex items-center justify-between px-3 mb-1 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors group"
          >
            <p className="text-[9px] uppercase tracking-widest text-gray-400 dark:text-zinc-600 font-semibold group-hover:text-gray-500 dark:group-hover:text-zinc-500">Stocks</p>
            {stocksCollapsed
              ? <ChevronDown className="w-3 h-3 text-gray-400 dark:text-zinc-600" />
              : <ChevronDown className="w-3 h-3 text-gray-400 dark:text-zinc-600 rotate-180" />}
          </button>
          <SidebarStockList activePortfolioId={activePortfolioId} pathname={pathname} collapsed={stocksCollapsed} stocksVersion={stocksVersion} />
        </div>
      </nav>

    </aside>
  );

  return (
    <div className="h-screen overflow-hidden text-foreground flex flex-col app-body-bg">
      {/* Top header */}
      <header className="h-12 shrink-0 border-b border-gray-200/60 dark:border-zinc-800/60 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm flex items-center px-4 gap-3 z-10">
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
        >
          {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>

        <Link href="/" className="flex items-center">
          <BrandLogo size="sm" />
        </Link>

        {/* Portfolio switcher */}
        <div className="relative ml-2" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 border border-gray-200 dark:border-zinc-700 transition-all duration-150 text-xs"
          >
            <Briefcase className="w-3 h-3 text-gray-400 dark:text-zinc-500" />
            <span className="text-gray-700 dark:text-zinc-300 max-w-[120px] truncate">{activePortfolio?.name ?? "Portfolio"}</span>
            <ChevronDown className="w-3 h-3 text-gray-400 dark:text-zinc-500" />
          </button>

          {dropdownOpen && (
            <div className="absolute top-full mt-1 left-0 w-56 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-lg z-50 py-1">
              {portfolios.map((p) => (
                <div key={p.id} className="flex items-center group">
                  <button
                    onClick={() => { switchPortfolio(p.id); setDropdownOpen(false); router.push("/"); }}
                    className={`flex-1 text-left px-3 py-1.5 text-xs transition-colors ${
                      p.id === activePortfolio?.id
                        ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 font-medium"
                        : "text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span className="truncate block">{p.name}</span>
                    <span className="text-[9px] text-gray-400 dark:text-zinc-600">{p.stock_count} stocks</span>
                  </button>
                  {!p.is_default && (
                    <button
                      onClick={() => remove(p.id)}
                      className="px-2 py-1.5 text-gray-300 dark:text-zinc-700 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              <div className="border-t border-gray-100 dark:border-zinc-800 mt-1 pt-1 px-2">
                {creating ? (
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newName.trim()) return;
                    const p = await create(newName.trim());
                    switchPortfolio(p.id);
                    setNewName(""); setCreating(false); setDropdownOpen(false);
                    router.push("/");
                  }} className="flex gap-1">
                    <input
                      autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                      placeholder="Portfolio name"
                      className="flex-1 min-w-0 px-2 py-1 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 rounded text-xs text-gray-800 dark:text-zinc-200 placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-400"
                    />
                    <button type="submit" className="px-2 py-1 bg-accent text-white font-semibold rounded-lg text-xs hover:bg-accent-hover transition-colors">Add</button>
                  </form>
                ) : (
                  <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 w-full px-1 py-1.5 text-xs text-gray-500 dark:text-zinc-500 hover:text-gray-800 dark:hover:text-zinc-200 transition-colors">
                    <Plus className="w-3 h-3" />
                    New Portfolio
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Archetype badge — right side of header */}
          {investorProfile?.wizard_completed && investorProfile.archetype_label && (
            <Link
              href="/profile"
              className="hidden sm:flex items-center px-3 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
            >
              <span className="text-xs font-serif italic text-indigo-600 dark:text-indigo-400 leading-none" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>
                {investorProfile.archetype_label}
              </span>
            </Link>
          )}
          <StreakBadge />
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg text-gray-400 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
          <button onClick={logout} className="p-1.5 rounded-lg text-gray-400 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors" title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        <div className="hidden lg:flex">{sidebar}</div>

        {mobileOpen && (
          <>
            <div className="fixed inset-0 z-20 bg-black/20 lg:hidden" onClick={() => setMobileOpen(false)} />
            <div className="fixed left-0 top-12 bottom-0 z-30 lg:hidden">{sidebar}</div>
          </>
        )}

        <main className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>

      {showWizard && (
        <ProfileWizard
          onComplete={(profile) => { setInvestorProfile(profile); setShowWizard(false); }}
          onSkip={() => setShowWizard(false)}
        />
      )}
    </div>
  );
}
