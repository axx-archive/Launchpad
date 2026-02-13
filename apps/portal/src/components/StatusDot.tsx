import type { ProjectStatus } from "@/types/database";
import { STATUS_LABELS } from "@/types/database";

const DOT_STYLES: Record<ProjectStatus, string> = {
  requested: "bg-text-muted/60",
  narrative_review: "bg-accent shadow-[0_0_8px_rgba(200,164,78,0.4)]",
  in_progress: "bg-warning shadow-[0_0_8px_rgba(224,160,32,0.4)]",
  review: "bg-review shadow-[0_0_8px_rgba(91,143,212,0.4)]",
  revision: "bg-warning shadow-[0_0_8px_rgba(224,160,32,0.4)]",
  live: "bg-success shadow-[0_0_8px_rgba(40,200,64,0.4)] animate-[pulse-live_2s_ease-in-out_infinite]",
  on_hold: "bg-text-muted/40",
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
  const dotSize = size === "md" ? "w-2 h-2" : "w-1.5 h-1.5";

  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`${dotSize} rounded-full ${DOT_STYLES[status]}`}
        aria-hidden="true"
      />
      {showLabel && (
        <span className="font-mono text-[10px] tracking-[2px] lowercase text-text/50">
          {STATUS_LABELS[status]}
        </span>
      )}
    </span>
  );
}
