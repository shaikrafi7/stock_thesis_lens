interface Props {
  leftPanel: React.ReactNode;
  centerPanel: React.ReactNode;
  rightPanel: React.ReactNode;
}

export default function StockDetailLayout({ leftPanel, centerPanel, rightPanel }: Props) {
  return (
    <div className="flex gap-6 flex-1 min-h-0">
      {/* Left column — chart, metrics, news */}
      <div className="w-[300px] shrink-0 overflow-y-auto flex flex-col gap-4 pr-1">
        {leftPanel}
      </div>

      {/* Center column — thesis */}
      <div className="flex-1 min-w-0 overflow-y-auto pr-1">
        {centerPanel}
      </div>

      {/* Right column — portfolio sidebar */}
      <div className="w-[220px] shrink-0 overflow-y-auto pl-1">
        {rightPanel}
      </div>
    </div>
  );
}
