"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/format";

/* ─── Department config ─── */

interface DeptConfig {
  code: string;
  name: string;
  tagline: string;
  description: string;
  href: string;
  accent: string;
  accentRgb: string;
  panelClass: string;
  bgClass: string;
  panelTint: string;
}

const DEPARTMENTS: DeptConfig[] = [
  {
    code: "INT",
    name: "intelligence",
    tagline: "signals before noise",
    description: "trends, signals, reports",
    href: "/intelligence",
    accent: "#4D8EFF",
    accentRgb: "77, 142, 255",
    panelClass: "triptych-panel-intel",
    bgClass: "triptych-bg-radar",
    panelTint: "#080a10",
  },
  {
    code: "CRE",
    name: "creative",
    tagline: "story, built",
    description: "narrative \u2192 build \u2192 deploy",
    href: "/dashboard",
    accent: "#d4863c",
    accentRgb: "212, 134, 60",
    panelClass: "triptych-panel-creative",
    bgClass: "triptych-bg-flame",
    panelTint: "#0a0808",
  },
  {
    code: "STR",
    name: "strategy",
    tagline: "the thinking before the making",
    description: "research, briefs, positioning",
    href: "/strategy",
    accent: "#8B9A6B",
    accentRgb: "139, 154, 107",
    panelClass: "triptych-panel-strategy",
    bgClass: "triptych-bg-contour",
    panelTint: "#080a08",
  },
];

/* ─── Props ─── */

interface DeptCount {
  intelligence: number;
  creative: number;
  strategy: number;
}

interface MyProject {
  id: string;
  project_name: string;
  company_name: string;
  department: string;
  status: string;
  updated_at: string;
  role: string;
  href: string;
}

interface MyRef {
  source_department: string;
  source_id: string;
  target_department: string;
  target_id: string;
  relationship: string;
}

interface TriptychHomeProps {
  firstName: string;
  counts: DeptCount;
  attentionCount?: number;
  attentionItems?: { id: string; department: string; title: string; href: string; priority: string }[];
  recentActivity?: { id: string; department: string; title: string; created_at: string }[];
  activeProjects?: Record<string, { id: string; name: string; status: string; href: string }[]>;
  /** User's own projects across all departments, grouped by department */
  myProjects?: Record<string, MyProject[]>;
  /** Cross-department refs for the user's projects (for provenance ghost-lines) */
  myRefs?: MyRef[];
}

/* ─── Component ─── */

export default function TriptychHome({
  firstName,
  counts,
  attentionCount = 0,
  attentionItems = [],
  recentActivity = [],
  activeProjects = {},
  myProjects = {},
  myRefs = [],
}: TriptychHomeProps) {
  const router = useRouter();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [exitingIndex, setExitingIndex] = useState<number | null>(null);
  const [entered, setEntered] = useState(false);
  const [isFirstVisit, setIsFirstVisit] = useState(true);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Ghost-line data: compute SVG lines connecting promoted projects to their source panels
  const ghostLines = useMemo(() => {
    if (hoveredIndex === null) return [];
    const dept = DEPARTMENTS[hoveredIndex];
    const deptProjects = myProjects[dept.name] ?? [];
    if (deptProjects.length === 0) return [];

    // Panel center X positions (%) based on flex ratios during hover (3 : 0.85 : 0.85)
    const total = 3 + 0.85 * 2;
    const widths = [0, 1, 2].map(i => ((i === hoveredIndex ? 3 : 0.85) / total) * 100);
    const centers: number[] = [];
    let x = 0;
    for (const w of widths) {
      centers.push(x + w / 2);
      x += w;
    }

    const lines: { x1: number; x2: number; color: string }[] = [];
    const seen = new Set<string>();

    for (const p of deptProjects.slice(0, 3)) {
      const ref = myRefs.find(r => r.target_id === p.id);
      if (!ref) continue;

      const sourceIdx = DEPARTMENTS.findIndex(d => d.name === ref.source_department);
      if (sourceIdx === -1 || sourceIdx === hoveredIndex) continue;

      const key = `${sourceIdx}-${hoveredIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);

      lines.push({
        x1: centers[sourceIdx],
        x2: centers[hoveredIndex],
        color: DEPARTMENTS[sourceIdx].accent,
      });
    }

    return lines;
  }, [hoveredIndex, myProjects, myRefs]);

  // Entrance choreography — ceremony on first visit, fast fade on return
  useEffect(() => {
    const hasVisited = sessionStorage.getItem("triptych-visited");
    const firstVisit = !hasVisited;
    setIsFirstVisit(firstVisit);

    const delay = firstVisit ? 100 : 50;
    const timer = setTimeout(() => {
      setEntered(true);
      if (!hasVisited) sessionStorage.setItem("triptych-visited", "1");
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  // 3-beat exit portal: accent flash → siblings slide out → navigate
  const handleEnter = useCallback(
    (index: number) => {
      setExitingIndex(index);
      setTimeout(() => {
        router.push(DEPARTMENTS[index].href);
      }, 500);
    },
    [router],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleEnter(index);
      }
    },
    [handleEnter],
  );

  const getDeptColor = (dept: string): string => {
    const colors: Record<string, string> = {
      intelligence: "#4D8EFF",
      creative: "#d4863c",
      strategy: "#8B9A6B",
    };
    return colors[dept] ?? "#666";
  };

  const isRecent = (dateStr: string): boolean => {
    return Date.now() - new Date(dateStr).getTime() < 3600000;
  };

  const greeting = getGreeting();

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      {/* Grain overlay */}
      <div className="grain-overlay" />

      {/* Scan lines overlay */}
      <div className="triptych-scanlines" />

      {/* Greeting strip */}
      <div
        className={`flex items-center justify-between px-[clamp(24px,5vw,64px)] py-4 z-10 transition-all ${entered ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}`}
        style={{
          transitionDuration: isFirstVisit ? "700ms" : "300ms",
          transitionDelay: isFirstVisit ? "0.8s" : "0.1s",
        }}
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] tracking-[2px] text-accent/60 triptych-spark-glow">
            spark
          </span>
          {/* Expanding rule */}
          <div
            className={`h-px bg-accent/20 transition-all ${entered ? "w-12 opacity-100" : "w-0 opacity-0"}`}
            style={{
              transitionDuration: isFirstVisit ? "800ms" : "200ms",
              transitionDelay: isFirstVisit ? "1.2s" : "0.2s",
            }}
          />
        </div>
        <div className="text-center">
          <h1 className="font-display text-[clamp(18px,2.5vw,28px)] font-light text-text tracking-[1px]">
            {greeting}, {firstName}.
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {attentionCount > 0 && (
            <span className="font-mono text-[10px] text-accent/60">
              {attentionCount} item{attentionCount !== 1 ? "s" : ""} need attention
            </span>
          )}
        </div>
      </div>

      {/* Triptych panels */}
      <div className="flex-1 flex flex-col lg:flex-row relative">
        {/* Seam lines with energy pulses */}
        {[1, 2].map((n) => (
          <div
            key={`seam-${n}`}
            className={`hidden lg:block absolute top-0 bottom-0 z-20 transition-opacity ${entered ? "opacity-100" : "opacity-0"}`}
            style={{
              left: `${(n * 100) / 3}%`,
              transitionDelay: `${0.3 + n * 0.1}s`,
              transitionDuration: isFirstVisit ? "700ms" : "200ms",
            }}
          >
            {/* Base seam */}
            <div className="absolute inset-0 w-px bg-white/[0.06]" />
            {/* Energy pulse */}
            <div
              className="triptych-seam-pulse absolute w-px inset-x-0"
              style={{
                backgroundColor: hoveredIndex !== null
                  ? DEPARTMENTS[hoveredIndex].accent
                  : "rgba(255,255,255,0.08)",
                opacity: hoveredIndex !== null ? 0.4 : 0.08,
                transition: "background-color 0.6s ease, opacity 0.6s ease",
              }}
            />
          </div>
        ))}

        {/* Ghost-lines: SVG overlay connecting promoted projects to source panels */}
        {ghostLines.length > 0 && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-[15] hidden lg:block"
            preserveAspectRatio="none"
          >
            {ghostLines.map((line, li) => (
              <line
                key={li}
                x1={`${line.x1}%`}
                y1="50%"
                x2={`${line.x2}%`}
                y2="50%"
                stroke={line.color}
                strokeWidth="1"
                strokeOpacity="0.15"
                strokeDasharray="1000"
                strokeDashoffset="1000"
                style={{
                  animation: "ghost-line-draw 0.8s ease-out forwards",
                }}
              />
            ))}
          </svg>
        )}

        {DEPARTMENTS.map((dept, i) => {
          const isHovered = hoveredIndex === i;
          const isExiting = exitingIndex === i;
          const isSibling = hoveredIndex !== null && hoveredIndex !== i;
          const isSiblingExiting = exitingIndex !== null && exitingIndex !== i;

          // Dramatic hover ratio — 0.85 : 3 : 0.85
          let flex = "1";
          if (exitingIndex !== null) {
            flex = isExiting ? "100" : "0";
          } else if (hoveredIndex !== null) {
            flex = isHovered ? "3" : "0.85";
          }

          const count = counts[dept.name as keyof DeptCount] ?? 0;

          // Exit direction for siblings
          const exitDirection = exitingIndex !== null && isSiblingExiting
            ? (i < exitingIndex ? -1 : 1)
            : 0;

          return (
            <div
              key={dept.code}
              ref={(el) => { panelRefs.current[i] = el; }}
              role="button"
              tabIndex={0}
              aria-label={`Enter ${dept.name} studio. ${count} active projects.`}
              className={`relative flex flex-col items-center justify-center overflow-hidden cursor-pointer select-none group ${dept.panelClass}`}
              style={{
                flex,
                backgroundColor: dept.panelTint,
                transition: exitingIndex !== null
                  ? "flex 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)"
                  : "flex 0.6s cubic-bezier(0.16, 1, 0.3, 1), filter 0.5s ease, transform 0.5s ease",
                opacity: isSiblingExiting ? 0 : 1,
                filter: isSibling ? "brightness(0.7)" : "brightness(1)",
                transform: isSiblingExiting
                  ? `translateX(${exitDirection * 100}%)`
                  : isSibling
                    ? "scale(0.96)"
                    : "scale(1)",
                willChange: hoveredIndex !== null || exitingIndex !== null
                  ? "flex, transform, filter"
                  : "auto",
              }}
              onMouseEnter={() => {
                if (exitingIndex === null) setHoveredIndex(i);
              }}
              onMouseLeave={() => {
                if (exitingIndex === null) setHoveredIndex(null);
              }}
              onClick={() => handleEnter(i)}
              onKeyDown={(e) => handleKeyDown(e, i)}
            >
              {/* Ambient CSS background */}
              <div
                className={`absolute inset-0 ${dept.bgClass}`}
                style={{
                  opacity: isHovered || isExiting ? 0.65 : 0.40,
                  transition: "opacity 0.6s ease",
                }}
              />

              {/* Intel: radar dots — composited scale pulse */}
              {dept.name === "intelligence" && (
                <div className="triptych-radar-dots absolute inset-0 pointer-events-none" />
              )}

              {/* Creative: hearth glow */}
              {dept.name === "creative" && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `radial-gradient(ellipse 50% 40% at 50% 75%, rgba(212, 134, 60, ${isHovered ? 0.10 : 0.05}) 0%, transparent 70%)`,
                    transition: "background 0.8s ease",
                  }}
                />
              )}

              {/* Accent glow on hover — 5-6% */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `radial-gradient(ellipse 60% 50% at 50% 60%, rgba(${dept.accentRgb}, ${isHovered ? 0.06 : 0}) 0%, transparent 70%)`,
                  transition: "background 0.6s ease",
                }}
              />

              {/* Vignette overlay on siblings */}
              <div
                className="absolute inset-0 pointer-events-none z-[5]"
                style={{
                  background: "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 0%, rgba(0,0,0,0.3) 100%)",
                  opacity: isSibling ? 1 : 0,
                  transition: "opacity 0.5s ease",
                }}
              />

              {/* Bottom accent gradient zone */}
              <div
                className="absolute bottom-0 left-0 right-0 pointer-events-none"
                style={{
                  height: "80px",
                  background: `linear-gradient(to top, rgba(${dept.accentRgb}, 0.04) 0%, transparent 100%)`,
                  transform: `scaleY(${isHovered ? 1 : 0.5})`,
                  transformOrigin: "bottom",
                  transition: "transform 0.6s ease",
                }}
              />

              {/* Content */}
              <div
                className={`relative z-10 flex flex-col items-center text-center px-6 transition-all ${entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                style={{
                  transitionDuration: isFirstVisit ? "700ms" : "300ms",
                  transitionDelay: isFirstVisit
                    ? `${0.4 + i * 0.15}s`
                    : `${0.05 + i * 0.05}s`,
                }}
              >
                {/* Department code badge */}
                <span
                  className="font-mono text-[11px] tracking-[3px] uppercase mb-4 px-3 py-1.5 rounded-[2px] border"
                  style={{
                    color: `rgba(${dept.accentRgb}, 0.7)`,
                    borderColor: `rgba(${dept.accentRgb}, 0.15)`,
                    backgroundColor: `rgba(${dept.accentRgb}, 0.05)`,
                  }}
                >
                  {dept.code}
                </span>

                {/* Department name — larger display font, faux-tracking on hover */}
                <h2
                  className="font-display font-light text-text mb-2"
                  style={{
                    fontSize: "clamp(36px, 5.5vw, 64px)",
                    letterSpacing: "2px",
                    transform: isHovered ? "scaleX(0.97)" : "scaleX(1)",
                    transition: "transform 0.5s ease",
                  }}
                >
                  {dept.name}
                </h2>

                {/* Tagline — character-by-character reveal on hover */}
                <div
                  className="mb-6 whitespace-nowrap h-[18px]"
                  style={{ color: dept.accent }}
                >
                  {dept.tagline.split("").map((char, ci) => (
                    <span
                      key={ci}
                      className="font-mono text-[11px] tracking-[1px] inline-block"
                      style={{
                        opacity: isHovered ? 0.8 : 0,
                        transform: isHovered ? "translateY(0)" : "translateY(4px)",
                        transition: `opacity 0.25s ease ${200 + ci * 8}ms, transform 0.25s ease ${200 + ci * 8}ms`,
                      }}
                    >
                      {char === " " ? "\u00A0" : char}
                    </span>
                  ))}
                </div>

                {/* Description */}
                <p className="font-mono text-[10px] text-text-muted/50 tracking-[1px] mb-8">
                  {dept.description}
                </p>

                {/* Active count — Cormorant 24px, single slow pulse on hover */}
                <div
                  className="flex items-center gap-3 mb-6"
                  style={{ color: `rgba(${dept.accentRgb}, 0.5)` }}
                >
                  <span
                    className="font-display text-[24px] font-light"
                    style={{
                      color: count > 0 ? dept.accent : "rgba(255,255,255,0.2)",
                      animation: count > 0 && isHovered
                        ? "triptych-count-pulse 3s ease-in-out infinite"
                        : "none",
                    }}
                  >
                    {count}
                  </span>
                  <span className="font-mono text-[10px]">active</span>
                </div>

                {/* My project names — whispered hints on hover */}
                <div className="space-y-1 mb-4 min-h-[48px]">
                  {(() => {
                    const mine = myProjects[dept.name];
                    if (mine?.length) {
                      return mine.slice(0, 3).map((p, pi) => {
                        const ref = myRefs.find(r => r.target_id === p.id);
                        const sourceDept = ref ? DEPARTMENTS.find(d => d.name === ref.source_department) : null;
                        return (
                          <p
                            key={p.id}
                            className="font-mono text-[10px] text-text-muted/50 truncate max-w-[220px]"
                            style={{
                              opacity: isHovered ? 0.7 : 0,
                              transform: isHovered ? "translateY(0)" : "translateY(4px)",
                              transition: `opacity 0.4s ease ${350 + pi * 50}ms, transform 0.4s ease ${350 + pi * 50}ms`,
                            }}
                          >
                            {p.project_name} · {p.status.replace(/_/g, " ")}
                            {sourceDept && (
                              <span style={{ color: sourceDept.accent, opacity: 0.5 }}>
                                {" "}← {{ intelligence: "intel", creative: "cre", strategy: "strat" }[sourceDept.name] ?? sourceDept.name}
                              </span>
                            )}
                          </p>
                        );
                      });
                    }
                    // Fallback to global active projects
                    return activeProjects?.[dept.name]?.slice(0, 2).map((p, pi) => (
                      <p
                        key={p.id}
                        className="font-mono text-[10px] text-text-muted/50 truncate max-w-[200px]"
                        style={{
                          opacity: isHovered && activeProjects?.[dept.name]?.length ? 0.7 : 0,
                          transform: isHovered && activeProjects?.[dept.name]?.length
                            ? "translateY(0)"
                            : "translateY(4px)",
                          transition: `opacity 0.4s ease ${350 + pi * 60}ms, transform 0.4s ease ${350 + pi * 60}ms`,
                        }}
                      >
                        {p.name} · {p.status.replace(/_/g, " ")}
                      </p>
                    ));
                  })()}
                </div>

                {/* $ enter — character reveal */}
                <div
                  className="font-mono text-[12px] tracking-[1px]"
                  style={{ color: dept.accent }}
                >
                  {"$ enter".split("").map((char, ci) => (
                    <span
                      key={ci}
                      className="inline-block"
                      style={{
                        opacity: isHovered ? 1 : 0.5,
                        transform: isHovered ? "translateY(0)" : "translateY(2px)",
                        transition: `opacity 0.3s ease ${300 + ci * 25}ms, transform 0.3s ease ${300 + ci * 25}ms`,
                      }}
                    >
                      {char === " " ? "\u00A0" : char}
                    </span>
                  ))}
                  {" "}
                  <span
                    className="inline-block w-[2px] h-[14px] align-middle"
                    style={{
                      backgroundColor: dept.accent,
                      animation: isHovered ? "blink 1s step-end infinite" : "none",
                      opacity: isHovered ? 1 : 0.3,
                    }}
                  />
                </div>
              </div>

              {/* Top accent line — flashes bright on exit */}
              <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                  backgroundColor: dept.accent,
                  opacity: isExiting ? 0.8 : isHovered ? 0.4 : 0.08,
                  transition: isExiting ? "opacity 0.15s ease" : "opacity 0.6s ease",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Bottom activity strip */}
      <div
        className={`px-[clamp(24px,5vw,64px)] py-3 border-t border-white/[0.04] z-10 transition-all ${entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
        style={{
          transitionDuration: isFirstVisit ? "700ms" : "300ms",
          transitionDelay: isFirstVisit ? "1s" : "0.15s",
        }}
      >
        <div className="flex items-center gap-4 overflow-x-auto scrollbar-none">
          {/* Attention items */}
          {attentionItems && attentionItems.length > 0 ? (
            <>
              <span className="font-mono text-[10px] text-accent/50 tracking-[1px] flex-shrink-0">
                needs attention
              </span>
              <div className="w-px h-3 bg-white/[0.08] flex-shrink-0" />
              {attentionItems.map((item, idx) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-center gap-1.5 flex-shrink-0 group"
                  style={{
                    opacity: entered ? 1 : 0,
                    transform: entered ? "translateY(0)" : "translateY(4px)",
                    transition: `opacity 0.3s ease ${idx * 50}ms, transform 0.3s ease ${idx * 50}ms`,
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getDeptColor(item.department) }}
                  />
                  <span className="font-mono text-[10px] text-text-muted/50 group-hover:text-text-muted transition-colors whitespace-nowrap">
                    {item.title}
                  </span>
                </Link>
              ))}
              {recentActivity && recentActivity.length > 0 && (
                <div className="w-px h-3 bg-white/[0.08] flex-shrink-0" />
              )}
            </>
          ) : null}

          {/* Recent activity */}
          {recentActivity && recentActivity.length > 0 ? (
            <>
              {!attentionItems?.length && (
                <>
                  <span className="font-mono text-[10px] text-text-muted/30 tracking-[1px] flex-shrink-0">
                    recent
                  </span>
                  <div className="w-px h-3 bg-white/[0.08] flex-shrink-0" />
                </>
              )}
              {recentActivity.map((event, idx) => (
                <div
                  key={event.id}
                  className="flex items-center gap-1.5 flex-shrink-0"
                  style={{
                    opacity: entered ? 1 : 0,
                    transform: entered ? "translateY(0)" : "translateY(4px)",
                    transition: `opacity 0.3s ease ${(attentionItems?.length ?? 0) * 50 + idx * 50}ms, transform 0.3s ease ${(attentionItems?.length ?? 0) * 50 + idx * 50}ms`,
                  }}
                >
                  <span
                    className="w-1 h-1 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: getDeptColor(event.department),
                      animation: isRecent(event.created_at)
                        ? "pulse-live 2s ease-in-out infinite"
                        : "none",
                    }}
                  />
                  <span className="font-mono text-[10px] text-text-muted/30 whitespace-nowrap">
                    {formatRelativeTime(event.created_at)}
                  </span>
                  <span className="font-mono text-[10px] text-text-muted/40 whitespace-nowrap">
                    {event.title}
                  </span>
                </div>
              ))}
            </>
          ) : !attentionItems?.length ? (
            <span className="font-mono text-[10px] text-text-muted/30">
              all systems nominal
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ─── */

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "good morning";
  if (hour < 17) return "good afternoon";
  return "good evening";
}
