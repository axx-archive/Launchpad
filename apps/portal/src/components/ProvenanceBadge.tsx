"use client";

import Link from "next/link";
import type { Department } from "@/types/database";

const DEPT_COLORS: Record<Department, string> = {
  intelligence: "text-[#4D8EFF]/80",
  strategy: "text-[#8B9A6B]/80",
  creative: "text-accent/80",
};

const DEPT_BORDER: Record<Department, string> = {
  intelligence: "border-[#4D8EFF]/15 hover:border-[#4D8EFF]/30",
  strategy: "border-[#8B9A6B]/15 hover:border-[#8B9A6B]/30",
  creative: "border-accent/15 hover:border-accent/30",
};

interface ProvenanceStep {
  department: Department;
  label: string;
  href?: string;
}

interface ProvenanceBadgeProps {
  /** Ordered chain of departments this item passed through, ending at current */
  chain: ProvenanceStep[];
}

export default function ProvenanceBadge({ chain }: ProvenanceBadgeProps) {
  if (chain.length === 0) return null;

  // Single hop: "from: intel ◇ trend name"
  if (chain.length === 1) {
    const source = chain[0];
    const content = (
      <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.5px] px-2 py-0.5 rounded-[2px] border transition-colors ${DEPT_BORDER[source.department]}`}>
        <span className="text-text-muted/40">from:</span>
        <span className={DEPT_COLORS[source.department]}>
          {source.department.slice(0, 5)}
        </span>
        <span className="text-text-muted/20">&loz;</span>
        <span className="text-text-muted/60 truncate max-w-[120px]">
          {source.label}
        </span>
      </span>
    );

    if (source.href) {
      return <Link href={source.href}>{content}</Link>;
    }
    return content;
  }

  // Multi-hop: "from: intel → strategy ◇"
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.5px] px-2 py-0.5 rounded-[2px] border border-white/[0.06]">
      <span className="text-text-muted/40">from:</span>
      {chain.map((step, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-text-muted/20">&rarr;</span>}
          {step.href ? (
            <Link href={step.href} className={`${DEPT_COLORS[step.department]} hover:underline`}>
              {step.department.slice(0, 5)}
            </Link>
          ) : (
            <span className={DEPT_COLORS[step.department]}>
              {step.department.slice(0, 5)}
            </span>
          )}
        </span>
      ))}
      <span className="text-text-muted/20">&loz;</span>
    </span>
  );
}
