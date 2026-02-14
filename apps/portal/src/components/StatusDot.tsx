import type { ProjectStatus } from "@/types/database";
import { STATUS_LABELS } from "@/types/database";

const DOT_STYLES: Record<ProjectStatus, string> = {
  // Creative
  requested: "bg-text-muted/60",
  narrative_review: "bg-accent shadow-[0_0_8px_rgba(200,164,78,0.4)]",
  brand_collection: "bg-accent shadow-[0_0_8px_rgba(200,164,78,0.4)]",
  in_progress: "bg-warning shadow-[0_0_8px_rgba(224,160,32,0.4)]",
  review: "bg-review shadow-[0_0_8px_rgba(91,143,212,0.4)]",
  revision: "bg-warning shadow-[0_0_8px_rgba(224,160,32,0.4)]",
  live: "bg-success shadow-[0_0_8px_rgba(40,200,64,0.4)] animate-[pulse-live_2s_ease-in-out_infinite]",
  on_hold: "bg-text-muted/40",
  // Strategy
  research_queued: "bg-text-muted/60",
  researching: "bg-warning shadow-[0_0_8px_rgba(224,160,32,0.4)]",
  research_review: "bg-review shadow-[0_0_8px_rgba(91,143,212,0.4)]",
  research_complete: "bg-success shadow-[0_0_8px_rgba(40,200,64,0.4)]",
  // Intelligence
  monitoring: "bg-success shadow-[0_0_8px_rgba(40,200,64,0.4)] animate-[pulse-live_2s_ease-in-out_infinite]",
  paused: "bg-text-muted/40",
  analyzing: "bg-warning shadow-[0_0_8px_rgba(224,160,32,0.4)]",
};

const LABEL_COLORS: Record<ProjectStatus, string> = {
  // Creative
  requested: "text-text-muted/70",
  narrative_review: "text-accent/80",
  brand_collection: "text-accent/80",
  in_progress: "text-warning/80",
  review: "text-review/80",
  revision: "text-warning/80",
  live: "text-success/80",
  on_hold: "text-text-muted/70",
  // Strategy
  research_queued: "text-text-muted/70",
  researching: "text-warning/80",
  research_review: "text-review/80",
  research_complete: "text-success/80",
  // Intelligence
  monitoring: "text-success/80",
  paused: "text-text-muted/70",
  analyzing: "text-warning/80",
};

export default function StatusDot({
  status,
  showLabel = true,
  size = "sm",
}: {
  status: ProjectStatus;
  showLabel?: boolean;
  size?: "sm" | "md";
}) {
  const dotSize = size === "md" ? "w-2.5 h-2.5" : "w-2 h-2";

  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`${dotSize} rounded-full ${DOT_STYLES[status]}`}
        aria-hidden="true"
      />
      {showLabel && (
        <span className={`font-mono text-[10px] tracking-[2px] lowercase ${LABEL_COLORS[status]}`}>
          {STATUS_LABELS[status]}
        </span>
      )}
    </span>
  );
}
