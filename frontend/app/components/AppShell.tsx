"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import EvaluateAllButton from "./EvaluateAllButton";
import ProfileWizard from "./ProfileWizard";
import { useAuth } from "@/app/context/AuthContext";
import { usePortfolio } from "@/app/context/PortfolioContext";
import { useAssistant } from "@/app/context/AssistantContext";
import { fetchInvestorProfile, type InvestorProfile } from "@/lib/api";
import {
  Menu, X, Home, Settings, LogOut, ChevronDown, Plus, Trash2,
  Briefcase, User, MessageSquare, Newspaper,
} from "lucide-react";
import BrandLogo from "./BrandLogo";

const NAV_LINKS = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/briefing", label: "Briefing", icon: Newspaper },
  { href: "/profile", label: "Investor Profile", icon: User },
];

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
          ? "bg-accent/10 text-accent font-medium"
          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
      }`}
    >
      {active && <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-accent rounded-full" />}
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </Link>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { portfolios, activePortfolio, switchPortfolio, create, remove } = usePortfolio();
  const { isOpen: panelOpen } = useAssistant();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showWizard, setShowWizard] = useState(false);
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
    <aside className="w-52 shrink-0 bg-surface border-r border-white/5 flex flex-col h-full">
      {/* Nav links */}
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => (
          <NavLink
            key={href}
            href={href}
            label={label}
            Icon={Icon}
            pathname={pathname}
            onClick={() => setMobileOpen(false)}
          />
        ))}
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-zinc-600 cursor-not-allowed mt-0.5">
          <Settings className="w-4 h-4 shrink-0" />
          Settings
          <span className="text-[9px] text-zinc-700 ml-auto">soon</span>
        </div>
      </nav>

      {/* Evaluate All */}
      <div className="px-3 py-3 border-t border-white/5">
        <EvaluateAllButton />
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top header */}
      <header className="h-12 shrink-0 border-b border-white/5 bg-surface flex items-center px-4 gap-3 z-10">
        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="lg:hidden p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
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
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800/80 border border-white/6 transition-all duration-150 text-xs"
          >
            <Briefcase className="w-3 h-3 text-zinc-400" />
            <span className="text-zinc-200 max-w-[120px] truncate">{activePortfolio?.name ?? "Portfolio"}</span>
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </button>

          {dropdownOpen && (
            <div className="absolute top-full mt-1 left-0 w-56 bg-surface border border-white/8 rounded-xl shadow-2xl z-50 py-1" style={{boxShadow:"0 20px 40px rgba(0,0,0,0.5)"}}>
              {portfolios.map((p) => (
                <div key={p.id} className="flex items-center group">
                  <button
                    onClick={() => { switchPortfolio(p.id); setDropdownOpen(false); router.push("/"); }}
                    className={`flex-1 text-left px-3 py-1.5 text-xs transition-colors ${
                      p.id === activePortfolio?.id ? "text-accent bg-accent/8 font-medium" : "text-zinc-300 hover:bg-zinc-800/60"
                    }`}
                  >
                    <span className="truncate block">{p.name}</span>
                    <span className="text-[9px] text-zinc-500">{p.stock_count} stocks</span>
                  </button>
                  {!p.is_default && (
                    <button
                      onClick={() => remove(p.id)}
                      className="px-2 py-1.5 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              <div className="border-t border-white/6 mt-1 pt-1 px-2">
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
                      className="flex-1 min-w-0 px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
                    />
                    <button type="submit" className="px-2 py-1 bg-accent text-black font-semibold rounded-lg text-xs hover:bg-accent-hover transition-colors">Add</button>
                  </form>
                ) : (
                  <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 w-full px-1 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
                    <Plus className="w-3 h-3" />
                    New Portfolio
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {user && <span className="text-zinc-500 text-xs hidden sm:block">{user.username}</span>}
          <button onClick={logout} className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors" title="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Persistent sidebar — desktop */}
        <div className="hidden lg:flex">
          {sidebar}
        </div>

        {/* Mobile sidebar — overlay */}
        {mobileOpen && (
          <>
            <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />
            <div className="fixed left-0 top-12 bottom-0 z-30 lg:hidden">
              {sidebar}
            </div>
          </>
        )}

        {/* Main content */}
        <main className={`flex-1 min-w-0 overflow-y-auto transition-all duration-200 ${panelOpen ? "mr-96" : ""}`}>
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
