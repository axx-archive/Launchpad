"use client";

import type { ClusterLifecycle } from "@/types/intelligence";

const LIFECYCLE_STYLES: Record<ClusterLifecycle, { text: string; bg: string; border: string }> = {
  emerging: {
    text: "text-[#4D8EFF]/80",
    bg: "bg-[#4D8EFF]/8",
    border: "border-[#4D8EFF]/15",
  },
  peaking: {
    text: "text-[#ef4444]/80",
    bg: "bg-[#ef4444]/8",
    border: "border-[#ef4444]/15",
  },
  cooling: {
    text: "text-accent/80",
    bg: "bg-accent/8",
    border: "border-accent/15",
  },
  evergreen: {
    text: "text-[#8B9A6B]/80",
    bg: "bg-[#8B9A6B]/8",
    border: "border-[#8B9A6B]/15",
  },
  dormant: {
    text: "text-text-muted/60",
    bg: "bg-white/[0.03]",
    border: "border-white/[0.08]",
  },
};

const LIFECYCLE_ICON: Record<ClusterLifecycle, string> = {
  emerging: "\u2197",   // ↗
  peaking: "\u25B2",    // ▲
  cooling: "\u2198",    // ↘
  evergreen: "\u25C6",  // ◆
  dormant: "\u25CB",    // ○
};

interface LifecycleBadgeProps {
  lifecycle: ClusterLifecycle;
  size?: "sm" | "md";
}

export default function LifecycleBadge({ lifecycle, size = "sm" }: LifecycleBadgeProps) {
  const style = LIFECYCLE_STYLES[lifecycle] ?? LIFECYCLE_STYLES.dormant;
  const icon = LIFECYCLE_ICON[lifecycle] ?? "";

  if (size === "md") {
    return (
      <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[1px] uppercase px-2 py-1 rounded-[3px] border ${style.text} ${style.bg} ${style.border}`}>
        <span>{icon}</span>
        {lifecycle}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[9px] tracking-[1px] uppercase px-1.5 py-0.5 rounded-[2px] border ${style.text} ${style.bg} ${style.border}`}>
      <span>{icon}</span>
      {lifecycle}
    </span>
  );
}
