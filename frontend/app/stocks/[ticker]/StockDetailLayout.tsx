"use client";

interface Props {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
}

export default function StockDetailLayout({ leftPanel, rightPanel }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
      {/* Left column — thesis gauge, buttons, thesis cards */}
      <div className="min-w-0">{leftPanel}</div>

      {/* Right column — stock info, chart, score history, news, portfolio */}
      <div className="flex flex-col gap-4">{rightPanel}</div>
    </div>
  );
}
