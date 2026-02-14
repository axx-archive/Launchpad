"use client";

import type { ProjectStatus } from "@/types/database";
import TerminalChrome from "@/components/TerminalChrome";

const PHASES = [
  { key: "requested", label: "requested" },
  { key: "narrative_review", label: "story review" },
  { key: "brand_collection", label: "brand assets" },
  { key: "in_progress", label: "in build" },
  { key: "review", label: "pitchapp review" },
  { key: "revision", label: "revision" },
  { key: "live", label: "live" },
] as const;

type PhaseKey = (typeof PHASES)[number]["key"];

const STATUS_ORDER: Record<PhaseKey, number> = {
  requested: 0,
  narrative_review: 1,
  brand_collection: 2,
  in_progress: 3,
  review: 4,
  revision: 5,
  live: 6,
};

export default function ProgressTimeline({
  status,
}: {
  status: ProjectStatus;
}) {
  if (status === "on_hold") return null;

  const currentIndex = STATUS_ORDER[status as PhaseKey] ?? 0;

  return (
    <TerminalChrome title="progress">
      <div className="space-y-1 mb-3">
        {PHASES.map((phase, i) => {
          const isPast = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isFuture = i > currentIndex;

          return (
            <div key={phase.key} className="flex items-center gap-3">
              {/* Step indicator */}
              <span
                className={`
                  w-5 h-5 flex items-center justify-center rounded-full text-[10px] flex-shrink-0 border
                  ${isPast ? "border-accent/40 text-accent" : ""}
                  ${isCurrent ? "border-accent bg-accent/15 text-accent progress-pulse" : ""}
                  ${isFuture ? "border-white/10 text-text-muted/70" : ""}
                `}
                aria-hidden="true"
              >
                {isPast ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M2 5l2.5 2.5L8 3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <span className="text-[9px]">{i + 1}</span>
                )}
              </span>

              {/* Label */}
              <span
                className={`
                  text-[12px] tracking-[1px] lowercase
                  ${isPast ? "text-text-muted" : ""}
                  ${isCurrent ? "text-accent font-medium" : ""}
                  ${isFuture ? "text-text-muted/70" : ""}
                `}
              >
                {phase.label}
                {isCurrent && (
                  <span className="text-accent/50 ml-2">&larr; you are here</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-text-muted/70 border-t border-white/[0.04] pt-2 mt-2">
        typical build: 24-48 hours
      </p>
    </TerminalChrome>
  );
}
