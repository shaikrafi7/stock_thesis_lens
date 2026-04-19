type Variant = "compact" | "standard" | "hero";

interface Props {
  size?: "sm" | "md" | "lg";
  variant?: Variant;
  /** @deprecated use variant="hero" */
  showTagline?: boolean;
}

const sizes = {
  sm: { icon: 20, word: "text-sm", subtitle: "text-[11px]" },
  md: { icon: 28, word: "text-xl", subtitle: "text-sm" },
  lg: { icon: 40, word: "text-3xl", subtitle: "text-base" },
};

const SERIF_FAMILY = { fontFamily: '"Instrument Serif", Georgia, serif' };

function ArcMark({ size }: { size: number }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 34 Q20 6 36 34" stroke="#6366f1" strokeWidth="2.8" strokeLinecap="round" fill="none" />
      <circle cx="20" cy="8" r="2.8" fill="#6366f1" />
    </svg>
  );
}

export default function BrandLogo({ size = "md", variant, showTagline }: Props) {
  const resolved: Variant = variant ?? (showTagline ? "hero" : "compact");
  const s = sizes[size];
  const showSubtitle = resolved === "standard" || resolved === "hero";
  const showHeroTagline = resolved === "hero";

  return (
    <div className="flex flex-col items-center gap-0">
      <div className="flex items-center gap-2.5">
        <ArcMark size={s.icon} />
        <span className={`font-semibold tracking-tight leading-none ${s.word}`}>
          <span className="text-gray-700 dark:text-zinc-300">St</span>
          <span className="font-serif italic text-accent" style={SERIF_FAMILY}>ARC</span>
          {showSubtitle && (
            <span
              className={`ml-1.5 font-normal text-gray-500 dark:text-zinc-500 ${s.subtitle}`}
            >
              : Stock Thesis Arc
            </span>
          )}
        </span>
      </div>
      {showHeroTagline && (
        <p className="text-zinc-500 text-xs mt-1.5 tracking-wide">
          The{" "}
          <span className="text-accent/80 font-serif italic" style={SERIF_FAMILY}>Arc</span>
          {" "}of{" "}
          <span className="text-accent/80 font-serif italic" style={SERIF_FAMILY}>conviction</span>
          , stress-tested daily
        </p>
      )}
    </div>
  );
}
