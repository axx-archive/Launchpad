"use client";

import Link from "next/link";
import type { Department } from "@/types/database";

const DEPT_BADGE: Record<string, string> = {
  intelligence: "text-[#4D8EFF]/60 bg-[#4D8EFF]/8 border-[#4D8EFF]/12",
  strategy: "text-[#8B9A6B]/60 bg-[rgba(139,154,107,0.08)] border-[rgba(139,154,107,0.12)]",
  creative: "text-accent/60 bg-accent/8 border-accent/12",
  "cross-dept": "text-text-muted/60 bg-white/[0.04] border-white/[0.08]",
};

const URGENCY_STYLES: Record<string, { border: string; dot: string }> = {
  high: { border: "border-l-[#ef4444]/40", dot: "bg-[#ef4444]" },
  medium: { border: "border-l-accent/40", dot: "bg-accent" },
  low: { border: "border-l-text-muted/20", dot: "bg-text-muted/40" },
};

export interface AttentionItem {
  id: string;
  department: Department | "cross-dept";
  urgency: "high" | "medium" | "low";
  title: string;
  description: string;
  action_label: string;
  href: string;
  dismiss_label?: string;
  onDismiss?: () => void;
  created_at: string;
}

interface AttentionQueueProps {
  items: AttentionItem[];
  onDismiss?: (itemId: string) => void;
}

export default function AttentionQueue({ items, onDismiss }: AttentionQueueProps) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 py-3">
        <span className="w-1.5 h-1.5 rounded-full bg-success/40" />
        <p className="font-mono text-[11px] text-text-muted/50">
          all clear — nothing needs your attention
        </p>
      </div>
    );
  }

  // Group by urgency
  const byUrgency: Record<string, AttentionItem[]> = { high: [], medium: [], low: [] };
  for (const item of items) {
    byUrgency[item.urgency]?.push(item);
  }

  return (
    <div className="space-y-1.5">
      {(["high", "medium", "low"] as const).map((urgency) => {
        const group = byUrgency[urgency];
        if (!group || group.length === 0) return null;

        return group.map((item) => {
          const urgencyStyle = URGENCY_STYLES[urgency];
          const deptClass = DEPT_BADGE[item.department] ?? DEPT_BADGE["cross-dept"];

          return (
            <div
              key={item.id}
              className={`flex items-start gap-3 px-3 py-3 rounded-md border border-white/[0.04] border-l-2 ${urgencyStyle.border} transition-colors`}
            >
              {/* Urgency dot */}
              <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${urgencyStyle.dot}`} />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-mono text-[9px] tracking-[1px] uppercase px-1.5 py-0.5 rounded-[2px] border ${deptClass}`}>
                    {item.department === "cross-dept" ? "cross" : item.department.slice(0, 5)}
                  </span>
                </div>
                <p className="text-[12px] text-text mb-0.5">
                  {item.title}
                </p>
                <p className="font-mono text-[10px] text-text-muted/50 mb-2">
                  {item.description}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <Link
                    href={item.href}
                    className="font-mono text-[11px] text-accent hover:text-accent/80 transition-colors"
                  >
                    {item.action_label} &rarr;
                  </Link>
                  {(item.dismiss_label || onDismiss) && (
                    <button
                      onClick={() => {
                        item.onDismiss?.();
                        onDismiss?.(item.id);
                      }}
                      className="font-mono text-[10px] text-text-muted/40 hover:text-text-muted/60 transition-colors cursor-pointer"
                    >
                      {item.dismiss_label ?? "dismiss"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        });
      })}
    </div>
  );
}
