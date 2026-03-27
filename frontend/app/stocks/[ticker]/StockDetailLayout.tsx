"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  leftPanel: React.ReactNode;
  centerPanel: React.ReactNode;
}

const STORAGE_KEY = "stock_left_panel_collapsed";

export default function StockDetailLayout({ leftPanel, centerPanel }: Props) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "true") setLeftCollapsed(true);
    } catch {
      // SSR or localStorage unavailable
    }
  }, []);

  function toggleLeft() {
    setLeftCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }

  return (
    <div className="flex gap-0 relative">
      {/* Left panel — collapsible */}
      {!leftCollapsed ? (
        <div className="w-[340px] shrink-0 transition-all duration-200">
          <div className="flex flex-col gap-4 pr-4 sticky top-0 self-start max-h-[calc(100vh-120px)] overflow-y-auto">
            <div className="flex justify-end">
              <button
                onClick={toggleLeft}
                className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                title="Collapse info panel"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
            {leftPanel}
          </div>
        </div>
      ) : (
        <div className="w-8 shrink-0 flex flex-col items-center pt-2 border-r border-zinc-800">
          <button
            onClick={toggleLeft}
            className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            title="Expand info panel"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Center panel — fills remaining space */}
      <div className="flex-1 min-w-0 pl-4">
        {centerPanel}
      </div>
    </div>
  );
}
