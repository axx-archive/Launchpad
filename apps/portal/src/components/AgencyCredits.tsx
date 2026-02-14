"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import TerminalChrome from "./TerminalChrome";

interface CreditEvent {
  id: string;
  event: string;
  label: string;
  phase: string;
  timestamp: string;
  cost_usd: number | null;
}

interface PhaseSummary {
  phase: string;
  event_count: number;
  total_cost_usd: number;
  events: CreditEvent[];
}

interface CreditsData {
  timeline: CreditEvent[];
  phases: PhaseSummary[];
  stats: {
    total_events: number;
    total_jobs: number;
    completed_jobs: number;
    failed_jobs: number;
    retries: number;
    total_duration_sec: number | null;
    total_cost_usd: number;
  };
}

const PHASE_ICONS: Record<string, string> = {
  narrative: "\u25B6", // ▶
  build: "\u2592",     // ░
  pipeline: "\u2502",  // │
  recovery: "\u21BB",  // ↻
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  const hours = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
}

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.toLocaleDateString("en-US", { month: "short" }).toLowerCase();
  const day = d.getDate();
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${month} ${day} ${time}`;
}

function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [value, setValue] = useState(0);
  const animated = useRef(false);

  useEffect(() => {
    if (animated.current || target === 0) {
      setValue(target);
      return;
    }

    // Respect prefers-reduced-motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      animated.current = true;
      return;
    }

    animated.current = true;
    const duration = 800;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }, [target]);

  return (
    <span>
      {value}
      {suffix}
    </span>
  );
}

/** Returns all focusable elements inside a container */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll<HTMLElement>(selector));
}

export default function AgencyCredits({
  projectId,
  isOpen,
  onClose,
  triggerRef,
}: {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const [data, setData] = useState<CreditsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const fetchCredits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/credits`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "failed to load credits");
        return;
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("[AgencyCredits] Failed to fetch credits:", err);
      setError("failed to load credits");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen) fetchCredits();
  }, [isOpen, fetchCredits]);

  // Auto-focus close button when modal opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure DOM is rendered
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Return focus to trigger button when modal closes
  const prevOpen = useRef(isOpen);
  useEffect(() => {
    if (prevOpen.current && !isOpen) {
      triggerRef?.current?.focus();
    }
    prevOpen.current = isOpen;
  }, [isOpen, triggerRef]);

  // Keyboard: Escape to close + focus trap
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      // Focus trap on Tab
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = getFocusableElements(dialogRef.current);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Close on overlay click
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm credits-overlay-enter"
      role="dialog"
      aria-modal="true"
      aria-label="Agency credits"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-lg credits-dialog-enter"
      >
        <TerminalChrome
          title="$ agency credits"
          headerActions={
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="font-mono text-[11px] text-text-muted/70 hover:text-text transition-colors cursor-pointer"
              aria-label="Close credits"
            >
              [esc]
            </button>
          }
        >
          {loading ? (
            <div className="space-y-3">
              <div className="h-4 w-48 rounded skeleton-shimmer" />
              <div className="h-4 w-64 rounded skeleton-shimmer" />
              <div className="h-4 w-40 rounded skeleton-shimmer" />
            </div>
          ) : error ? (
            <p className="text-error text-[12px]">
              <span className="text-error/70">$ </span>
              error: {error}
            </p>
          ) : data ? (
            <div className="space-y-6">
              {/* Stats overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-[9px] tracking-[1px] uppercase text-text-muted/70 mb-1">
                    pipeline stages
                  </p>
                  <p className="text-[24px] font-light text-text leading-none">
                    <AnimatedCounter target={data.stats.completed_jobs} />
                  </p>
                </div>
                <div>
                  <p className="text-[9px] tracking-[1px] uppercase text-text-muted/70 mb-1">
                    total events
                  </p>
                  <p className="text-[24px] font-light text-text leading-none">
                    <AnimatedCounter target={data.stats.total_events} />
                  </p>
                </div>
                <div>
                  <p className="text-[9px] tracking-[1px] uppercase text-text-muted/70 mb-1">
                    build time
                  </p>
                  <p className="text-[24px] font-light text-text leading-none">
                    {data.stats.total_duration_sec
                      ? formatDuration(data.stats.total_duration_sec)
                      : "\u2014"}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] tracking-[1px] uppercase text-text-muted/70 mb-1">
                    retries
                  </p>
                  <p className="text-[24px] font-light text-text leading-none">
                    <AnimatedCounter target={data.stats.retries} />
                  </p>
                </div>
              </div>

              {/* Phase breakdown */}
              {data.phases.length > 0 && (
                <div>
                  <p className="text-[10px] tracking-[2px] uppercase text-accent mb-3">
                    by phase
                  </p>
                  <div className="space-y-2">
                    {data.phases.map((phase) => (
                      <div
                        key={phase.phase}
                        className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-accent/70 text-[11px] w-4 text-center">
                            {PHASE_ICONS[phase.phase] ?? "\u2500"}
                          </span>
                          <span className="text-[12px] text-text">{phase.phase}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-[11px] text-text-muted/70">
                            {phase.event_count} event{phase.event_count !== 1 ? "s" : ""}
                          </span>
                          {phase.total_cost_usd > 0 && (
                            <span className="text-[11px] text-accent/70">
                              ${phase.total_cost_usd.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timeline */}
              {data.timeline.length > 0 ? (
                <div>
                  <p className="text-[10px] tracking-[2px] uppercase text-accent mb-3">
                    timeline
                  </p>
                  <div className="space-y-0">
                    {data.timeline.map((event, i) => (
                      <div
                        key={event.id}
                        className="flex items-start gap-3 py-2 border-b border-white/[0.04] last:border-0"
                      >
                        {/* Dot connector */}
                        <div className="flex flex-col items-center pt-1.5 flex-shrink-0">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              i === data.timeline.length - 1
                                ? "bg-accent"
                                : "bg-text-muted/70"
                            }`}
                          />
                          {i < data.timeline.length - 1 && (
                            <span className="w-px h-full min-h-[16px] bg-white/[0.06] mt-1" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-[12px] text-text truncate">
                              <span className="text-text-muted/70">$ </span>
                              {event.label}
                            </p>
                            <span className="text-[9px] text-text-muted/70 whitespace-nowrap tracking-[0.5px]">
                              {formatTimestamp(event.timestamp)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-text-muted/70">
                  <span className="text-text-muted/70">$ </span>
                  no automation events recorded yet.
                </p>
              )}

              {/* Footer */}
              {data.stats.total_cost_usd > 0 && (
                <div className="pt-3 border-t border-white/[0.06]">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] tracking-[1px] uppercase text-text-muted/70">
                      total ai cost
                    </span>
                    <span className="text-[14px] text-accent font-light">
                      ${data.stats.total_cost_usd.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </TerminalChrome>
      </div>
    </div>
  );
}
