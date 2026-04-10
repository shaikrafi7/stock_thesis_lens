"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { fetchPortfolios, createPortfolio, updatePortfolio, deletePortfolio, type Portfolio } from "@/lib/api";
import { useAuth } from "./AuthContext";

interface PortfolioContextValue {
  portfolios: Portfolio[];
  activePortfolio: Portfolio | null;
  activePortfolioId: number | null;
  portfolioLoaded: boolean;
  switchPortfolio: (id: number) => void;
  reload: () => Promise<void>;
  create: (name: string, description?: string) => Promise<Portfolio>;
  rename: (id: number, name: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

const STORAGE_KEY = "thesisarc_active_portfolio";

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [portfolioLoaded, setPortfolioLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const list = await fetchPortfolios();
    setPortfolios(list);

    // Restore persisted selection, or fall back to default
    const saved = localStorage.getItem(STORAGE_KEY);
    const savedId = saved ? parseInt(saved, 10) : null;
    const match = list.find((p) => p.id === savedId);
    const defaultP = list.find((p) => p.is_default) ?? list[0];
    const selected = match ?? defaultP;
    if (selected) {
      setActiveId(selected.id);
      localStorage.setItem(STORAGE_KEY, String(selected.id));
    }
    setPortfolioLoaded(true);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const switchPortfolio = useCallback((id: number) => {
    setActiveId(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  }, []);

  const create = useCallback(async (name: string, description?: string) => {
    const p = await createPortfolio(name, description);
    await load();
    return p;
  }, [load]);

  const rename = useCallback(async (id: number, name: string) => {
    await updatePortfolio(id, name);
    await load();
  }, [load]);

  const remove = useCallback(async (id: number) => {
    await deletePortfolio(id);
    const defaultP = portfolios.find((p) => p.is_default);
    if (defaultP && activeId === id) {
      switchPortfolio(defaultP.id);
    }
    await load();
  }, [portfolios, activeId, switchPortfolio, load]);

  const activePortfolio = portfolios.find((p) => p.id === activeId) ?? null;

  return (
    <PortfolioContext.Provider
      value={{
        portfolios,
        activePortfolio,
        activePortfolioId: activeId,
        portfolioLoaded,
        switchPortfolio,
        reload: load,
        create,
        rename,
        remove,
      }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}
