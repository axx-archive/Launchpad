"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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
  },
];

/* ─── Props ─── */

interface DeptCount {
  intelligence: number;
  creative: number;
  strategy: number;
}

interface TriptychHomeProps {
  firstName: string;
  counts: DeptCount;
  attentionCount?: number;
  attentionItems?: { id: string; department: string; title: string; href: string; priority: string }[];
  recentActivity?: { id: string; department: string; title: string; created_at: string }[];
  activeProjects?: Record<string, { id: string; name: string; status: string; href: string }[]>;
}

/* ─── Component ─── */

export default function TriptychHome({
  firstName,
  counts,
  attentionCount = 0,
  attentionItems = [],
  recentActivity = [],
  activeProjects = {},
}: TriptychHomeProps) {
  const router = useRouter();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [exitingIndex, setExitingIndex] = useState<number | null>(null);
  const [entered, setEntered] = useState(false);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Staggered entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setEntered(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleEnter = useCallback(
    (index: number) => {
      setExitingIndex(index);
      // Door-open: expand to fill, then navigate
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

  // Department color lookup for activity strip
  const getDeptColor = (dept: string): string => {
    const colors: Record<string, string> = {
      intelligence: "#4D8EFF",
      creative: "#d4863c",
      strategy: "#8B9A6B",
    };
    return colors[dept] ?? "#666";
  };

  // Time-aware greeting
  const greeting = getGreeting();

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      {/* Grain overlay */}
      <div className="grain-overlay" />

      {/* Greeting strip */}
      <div
        className={`flex items-center justify-between px-[clamp(24px,5vw,64px)] py-4 z-10 transition-all duration-700 ${entered ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}`}
        style={{ transitionDelay: "0.8s" }}
      >
        <span className="font-mono text-[12px] tracking-[2px] text-accent/60">
          spark
        </span>
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
        {/* Vertical divider lines */}
        <div
          className={`hidden lg:block absolute top-0 bottom-0 left-1/3 w-px bg-white/[0.04] z-10 transition-opacity duration-700 ${entered ? "opacity-100" : "opacity-0"}`}
          style={{ transitionDelay: "0.3s" }}
        />
        <div
          className={`hidden lg:block absolute top-0 bottom-0 left-2/3 w-px bg-white/[0.04] z-10 transition-opacity duration-700 ${entered ? "opacity-100" : "opacity-0"}`}
          style={{ transitionDelay: "0.4s" }}
        />

        {DEPARTMENTS.map((dept, i) => {
          const isHovered = hoveredIndex === i;
          const isExiting = exitingIndex === i;
          const isSibling = hoveredIndex !== null && hoveredIndex !== i;
          const isSiblingExiting = exitingIndex !== null && exitingIndex !== i;

          // Compute flex for the panel
          let flex = "1";
          if (exitingIndex !== null) {
            flex = isExiting ? "100" : "0";
          } else if (hoveredIndex !== null) {
            flex = isHovered ? "2" : "1";
          }

          const count =
            counts[dept.name as keyof DeptCount] ?? 0;

          return (
            <div
              key={dept.code}
              ref={(el) => {
                panelRefs.current[i] = el;
              }}
              role="button"
              tabIndex={0}
              aria-label={`Enter ${dept.name} studio. ${count} active projects.`}
              className={`relative flex flex-col items-center justify-center overflow-hidden cursor-pointer select-none group ${dept.panelClass}`}
              style={{
                flex,
                transition: exitingIndex !== null
                  ? "flex 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease"
                  : "flex 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
                opacity: isSiblingExiting ? 0 : 1,
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
                  opacity: isHovered || isExiting ? 0.25 : 0.1,
                  transition: "opacity 0.6s ease",
                }}
              />

              {/* Accent glow on hover */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `radial-gradient(ellipse 60% 50% at 50% 60%, rgba(${dept.accentRgb}, ${isHovered ? 0.08 : 0}) 0%, transparent 70%)`,
                  transition: "background 0.6s ease",
                }}
              />

              {/* Content */}
              <div
                className={`relative z-10 flex flex-col items-center text-center px-6 transition-all duration-700 ${entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                style={{
                  transitionDelay: `${0.4 + i * 0.15}s`,
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

                {/* Department name */}
                <h2 className="font-display text-[clamp(28px,4vw,48px)] font-light tracking-[2px] text-text mb-2">
                  {dept.name}
                </h2>

                {/* Tagline */}
                <p
                  className={`font-mono text-[11px] tracking-[1px] mb-6 transition-all duration-500 ${isHovered ? "opacity-80 translate-y-0" : "opacity-0 translate-y-1"}`}
                  style={{ color: dept.accent }}
                >
                  {dept.tagline}
                </p>

                {/* Description */}
                <p className="font-mono text-[10px] text-text-muted/50 tracking-[1px] mb-8">
                  {dept.description}
                </p>

                {/* Active count */}
                <div
                  className="flex items-center gap-2 mb-6"
                  style={{ color: `rgba(${dept.accentRgb}, 0.5)` }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: count > 0
                        ? dept.accent
                        : "rgba(255,255,255,0.15)",
                      animation: count > 0
                        ? "pulse-live 2s ease-in-out infinite"
                        : "none",
                    }}
                  />
                  <span className="font-mono text-[10px]">
                    {count} active
                  </span>
                </div>

                {/* Active project names on hover */}
                {activeProjects?.[dept.name]?.length > 0 && (
                  <div
                    className={`space-y-1 mb-4 transition-all duration-500 ${isHovered ? "opacity-70 translate-y-0" : "opacity-0 translate-y-1"}`}
                  >
                    {activeProjects[dept.name].slice(0, 2).map((p) => (
                      <p key={p.id} className="font-mono text-[10px] text-text-muted/50 truncate max-w-[200px]">
                        {p.name} · {p.status.replace(/_/g, " ")}
                      </p>
                    ))}
                  </div>
                )}

                {/* Enter prompt */}
                <div
                  className={`font-mono text-[12px] tracking-[1px] transition-all duration-500 ${isHovered ? "opacity-100 translate-y-0" : "opacity-50 translate-y-0.5"}`}
                  style={{ color: dept.accent }}
                >
                  $ enter{" "}
                  <span
                    className="inline-block w-[2px] h-[14px] align-middle"
                    style={{
                      backgroundColor: dept.accent,
                      animation: isHovered
                        ? "blink 1s step-end infinite"
                        : "none",
                      opacity: isHovered ? 1 : 0.3,
                    }}
                  />
                </div>
              </div>

              {/* Top accent line */}
              <div
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                  backgroundColor: dept.accent,
                  opacity: isHovered ? 0.4 : 0.08,
                  transition: "opacity 0.6s ease",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Bottom activity strip */}
      <div
        className={`px-[clamp(24px,5vw,64px)] py-3 border-t border-white/[0.04] z-10 transition-all duration-700 ${entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
        style={{ transitionDelay: "1s" }}
      >
        <div className="flex items-center gap-4 overflow-x-auto scrollbar-none">
          {/* Attention items */}
          {attentionItems && attentionItems.length > 0 ? (
            <>
              <span className="font-mono text-[10px] text-accent/50 tracking-[1px] flex-shrink-0">
                needs attention
              </span>
              <div className="w-px h-3 bg-white/[0.08] flex-shrink-0" />
              {attentionItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-center gap-1.5 flex-shrink-0 group"
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
              {recentActivity.map((event) => (
                <div key={event.id} className="flex items-center gap-1.5 flex-shrink-0">
                  <span
                    className="w-1 h-1 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getDeptColor(event.department) }}
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
