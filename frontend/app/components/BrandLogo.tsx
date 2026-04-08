interface Props {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
}

const sizes = {
  sm: { icon: 20, thesis: "text-sm", arc: "text-sm" },
  md: { icon: 28, thesis: "text-xl", arc: "text-xl" },
  lg: { icon: 40, thesis: "text-3xl", arc: "text-3xl" },
};

/** SVG arc mark — upward arc with a dot at the peak */
function ArcMark({ size }: { size: number }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Arc path: rises from bottom-left, peaks at top-center, descends to bottom-right */}
      <path
        d="M4 34 Q20 6 36 34"
        stroke="#f59e0b"
        strokeWidth="2.8"
        strokeLinecap="round"
        fill="none"
      />
      {/* Dot at the peak */}
      <circle cx="20" cy="8" r="2.8" fill="#f59e0b" />
    </svg>
  );
}

export default function BrandLogo({ size = "md", showTagline = false }: Props) {
  const s = sizes[size];
  return (
    <div className="flex flex-col items-center gap-0">
      <div className="flex items-center gap-2.5">
        <ArcMark size={s.icon} />
        <span className={`font-semibold tracking-tight leading-none ${s.thesis}`}>
          <span className="text-white">Thesis</span>
          <span className="font-serif italic text-accent"
            style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>Arc</span>
        </span>
      </div>
      {showTagline && (
        <p className="text-zinc-500 text-xs mt-1.5 tracking-wide">
          The arc of{" "}
          <span className="text-accent/80 font-serif italic"
            style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>conviction</span>
          , stress-tested daily
        </p>
      )}
    </div>
  );
}
