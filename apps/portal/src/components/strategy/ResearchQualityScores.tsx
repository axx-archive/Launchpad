"use client";

const DIMENSIONS: { key: string; label: string }[] = [
  { key: "rigor", label: "rigor" },
  { key: "sourcing", label: "sourcing" },
  { key: "insight", label: "insight" },
  { key: "clarity", label: "clarity" },
  { key: "actionability", label: "actionability" },
];

function scoreColor(score: number): string {
  if (score >= 8) return "text-success";
  if (score >= 5) return "text-warning";
  return "text-error";
}

function barColor(score: number): string {
  if (score >= 8) return "bg-success/70";
  if (score >= 5) return "bg-warning/70";
  return "bg-error/70";
}

interface ResearchQualityScoresProps {
  scores: Record<string, number> & { explanations?: Record<string, string> };
  compact?: boolean;
}

export default function ResearchQualityScores({
  scores,
  compact = false,
}: ResearchQualityScoresProps) {
  const overall = scores.overall ?? 0;
  const overallColor = scoreColor(overall);

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {/* Overall score — prominent */}
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] tracking-[2px] uppercase text-text-muted/70">
          research quality
        </span>
        <span className={`font-mono text-[18px] font-light ${overallColor}`}>
          {overall}
          <span className="text-[11px] text-text-muted/70">/10</span>
        </span>
      </div>

      {/* Dimension bars */}
      <div className={compact ? "space-y-1.5" : "space-y-2"}>
        {DIMENSIONS.map(({ key, label }) => {
          const value = scores[key] ?? 0;
          const pct = Math.round((value / 10) * 100);
          const explanation = scores.explanations?.[key];
          const isLow = value < 6;

          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-mono text-[10px] text-text-muted/70 tracking-[0.5px]">
                  {label}
                </span>
                <span className={`font-mono text-[10px] ${scoreColor(value)}`}>
                  {value}
                </span>
              </div>
              <div className="bg-white/[0.06] rounded-full h-1 overflow-hidden">
                <div
                  className={`${barColor(value)} h-full rounded-full transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {isLow && explanation && !compact && (
                <p className="font-mono text-[9px] text-text-muted/70 mt-0.5 leading-relaxed">
                  {explanation}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Tiny badge showing just the overall quality score — for use in headers/cards.
 */
export function ResearchQualityBadge({ score }: { score: number }) {
  const color = scoreColor(score);
  const bgColor = score >= 8
    ? "bg-success/10 border-success/20"
    : score >= 5
      ? "bg-warning/10 border-warning/20"
      : "bg-error/10 border-error/20";

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] border ${bgColor}`}
      title={`Research quality: ${score}/10`}
    >
      <span className={`font-mono text-[10px] font-medium ${color}`}>
        {score}
      </span>
      <span className="font-mono text-[8px] text-text-muted/70">/10</span>
    </span>
  );
}
