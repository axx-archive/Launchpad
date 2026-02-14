"use client";

import { useRef } from "react";
import Link from "next/link";
import LifecycleBadge from "@/components/intelligence/LifecycleBadge";
import type { ClusterLifecycle } from "@/types/intelligence";

const GRADIENT_MAP: Record<ClusterLifecycle, string> = {
  emerging:
    "bg-gradient-to-br from-[rgba(77,142,255,0.28)] via-[rgba(77,142,255,0.08)] to-[rgba(8,8,10,0.3)]",
  peaking:
    "bg-gradient-to-br from-[rgba(239,68,68,0.25)] via-[rgba(239,68,68,0.08)] to-[rgba(8,8,10,0.3)]",
  cooling:
    "bg-gradient-to-br from-[rgba(192,120,64,0.25)] via-[rgba(192,120,64,0.08)] to-[rgba(8,8,10,0.3)]",
  evergreen:
    "bg-gradient-to-br from-[rgba(139,154,107,0.25)] via-[rgba(139,154,107,0.08)] to-[rgba(8,8,10,0.3)]",
  dormant:
    "bg-gradient-to-br from-[rgba(100,100,100,0.15)] via-[rgba(60,60,60,0.08)] to-[rgba(8,8,10,0.3)]",
};

interface TrendCardProps {
  id: string;
  name: string;
  summary: string | null;
  lifecycle: ClusterLifecycle;
  velocityScore: number;
  velocityPercentile: number;
  signalCount: number;
  category: string | null;
  tags: string[];
}

export default function TrendCard({
  id,
  name,
  summary,
  lifecycle,
  velocityScore,
  velocityPercentile,
  signalCount,
  category,
  tags,
}: TrendCardProps) {
  const cardRef = useRef<HTMLAnchorElement>(null);

  function handleMouseMove(e: React.MouseEvent) {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(800px) rotateY(${x * 4}deg) rotateX(${-y * 4}deg) translateY(-4px)`;
  }

  function handleMouseLeave() {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = "perspective(800px) rotateY(0deg) rotateX(0deg) translateY(0px)";
  }

  const gradient = GRADIENT_MAP[lifecycle] ?? GRADIENT_MAP.dormant;
  const isPeaking = lifecycle === "peaking";

  return (
    <Link
      ref={cardRef}
      href={`/intelligence/trend/${id}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="group flex flex-col bg-bg-card border border-white/[0.04] rounded-md overflow-hidden transition-all duration-400 hover:border-[#4D8EFF]/15 hover:shadow-[0_12px_40px_rgba(77,142,255,0.06)]"
      style={{ transition: "transform 0.4s cubic-bezier(0.16,1,0.3,1), border-color 0.4s, box-shadow 0.4s" }}
    >
      <div className={`relative h-36 flex items-center justify-center overflow-hidden ${gradient}`}>
        {/* Lifecycle badge — top left */}
        <div className="absolute top-3 left-3 z-10">
          <LifecycleBadge lifecycle={lifecycle} />
        </div>

        {/* Velocity spark — top right */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
          <span className="inline-flex items-center gap-px">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className={`inline-block w-1 rounded-[1px] ${
                  i < Math.ceil(velocityPercentile / 20)
                    ? isPeaking
                      ? "bg-[#ef4444]/60 h-2"
                      : "bg-[#4D8EFF]/50 h-1.5"
                    : "bg-text-muted/15 h-1"
                }`}
              />
            ))}
          </span>
          <span className="font-mono text-[10px] text-text-muted/50">
            {Math.round(velocityPercentile)}
          </span>
        </div>

        {/* Active shimmer for peaking trends */}
        {isPeaking && (
          <div className="absolute inset-0 overflow-hidden">
            <div
              className="absolute inset-0 animate-[shimmer-move_3s_linear_infinite] opacity-20"
              style={{
                background: "linear-gradient(110deg, transparent 25%, rgba(239,68,68,0.15) 37%, rgba(239,68,68,0.25) 50%, rgba(239,68,68,0.15) 63%, transparent 75%)",
                backgroundSize: "200% 100%",
              }}
            />
          </div>
        )}

        {/* Radar icon */}
        <svg
          width="40"
          height="40"
          viewBox="0 0 40 40"
          fill="none"
          className="text-text/60 transition-transform duration-400 group-hover:scale-[1.08]"
        >
          <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.2" />
          <circle cx="20" cy="20" r="10" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.3" />
          <circle cx="20" cy="20" r="4" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.4" />
          <line x1="20" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth="1" opacity="0.3" />
        </svg>
      </div>

      <div className="flex flex-col gap-2 p-5 flex-1">
        <h3 className="font-display text-[20px] font-normal text-text tracking-[0.5px] line-clamp-2">
          {name}
        </h3>
        {summary && (
          <p className="text-[12px] text-text-muted leading-relaxed line-clamp-2">
            {summary}
          </p>
        )}

        <div className="flex items-center gap-3 pt-3 border-t border-white/[0.04] mt-auto flex-wrap">
          <span className="font-mono text-[10px] text-[#4D8EFF]/70">
            {signalCount} signal{signalCount !== 1 ? "s" : ""}
          </span>
          {category && (
            <>
              <span className="text-text-muted/20">&middot;</span>
              <span className="font-mono text-[10px] text-text-muted/50 truncate">
                {category}
              </span>
            </>
          )}
          {tags.length > 0 && (
            <>
              <span className="text-text-muted/20">&middot;</span>
              <span className="font-mono text-[10px] text-text-muted/40 truncate">
                {tags.slice(0, 2).join(", ")}
              </span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
