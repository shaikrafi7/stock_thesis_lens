"use client";

import { useState, useEffect } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";

interface Props {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
}

const STORAGE_KEY = "stock_right_panel_collapsed";

export default function StockDetailLayout({ leftPanel, rightPanel }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "true") setCollapsed(true);
    } catch {}
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }

  return (
    <div className={`grid grid-cols-1 gap-6 ${collapsed ? "lg:grid-cols-[1fr_32px]" : "lg:grid-cols-[1fr_320px]"}`}>
      {/* Left column — thesis gauge, buttons, thesis cards */}
      <div className="min-w-0 max-w-4xl">{leftPanel}</div>

      {/* Right column — collapsible */}
      {collapsed ? (
        <div className="flex flex-col items-center pt-1">
          <button
            onClick={toggle}
            className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            title="Expand panel"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <button
              onClick={toggle}
              className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="Collapse panel"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {rightPanel}
        </div>
      )}
    </div>
  );
}
