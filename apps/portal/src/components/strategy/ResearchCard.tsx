"use client";

import { useRef } from "react";
import Link from "next/link";
import type { Project, MemberRole } from "@/types/database";
import StatusDot from "@/components/StatusDot";
import SharedBadge from "@/components/SharedBadge";
import RoleBadge from "@/components/RoleBadge";
import ProvenanceBadge from "@/components/ProvenanceBadge";
import { formatRelativeTime, formatProjectType } from "@/lib/format";
import type { Department } from "@/types/database";

const GRADIENT_MAP: Record<string, string> = {
  market_research:
    "bg-gradient-to-br from-[rgba(139,154,107,0.28)] via-[rgba(170,185,140,0.12)] to-[rgba(8,8,10,0.3)]",
  competitive_analysis:
    "bg-gradient-to-br from-[rgba(107,139,154,0.28)] via-[rgba(140,170,185,0.12)] to-[rgba(8,8,10,0.3)]",
  funding_landscape:
    "bg-gradient-to-br from-[rgba(154,139,107,0.28)] via-[rgba(185,170,140,0.12)] to-[rgba(8,8,10,0.3)]",
};

export default function ResearchCard({
  project,
  isShared = false,
  ownerEmail,
  userRole,
  provenance,
}: {
  project: Project;
  isShared?: boolean;
  ownerEmail?: string;
  userRole?: MemberRole;
  provenance?: { department: Department; label: string; href?: string }[];
}) {
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

  const gradient = GRADIENT_MAP[project.type] ?? GRADIENT_MAP.market_research;
  const isActive = ["researching", "research_queued"].includes(project.status);

  return (
    <Link
      ref={cardRef}
      href={`/strategy/research/${project.id}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="group flex flex-col bg-bg-card border border-white/[0.04] rounded-md overflow-hidden transition-all duration-400 hover:border-accent/15 hover:shadow-[0_12px_40px_rgba(139,154,107,0.06)]"
      style={{ transition: "transform 0.4s cubic-bezier(0.16,1,0.3,1), border-color 0.4s, box-shadow 0.4s" }}
    >
      <div className={`relative h-40 flex items-center justify-center overflow-hidden ${gradient}`}>
        <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
          <StatusDot status={project.status} />
        </div>
        {isShared && <SharedBadge />}
        {isActive ? (
          <div className="absolute inset-0 overflow-hidden">
            <div
              className="absolute inset-0 animate-[shimmer-move_3s_linear_infinite] opacity-30"
              style={{
                background: "linear-gradient(110deg, transparent 25%, rgba(139,154,107,0.15) 37%, rgba(139,154,107,0.25) 50%, rgba(139,154,107,0.15) 63%, transparent 75%)",
                backgroundSize: "200% 100%",
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-mono text-[10px] tracking-[3px] uppercase text-text-muted/70 animate-pulse">
                {project.status === "researching" ? "researching" : "queued"}
              </span>
            </div>
          </div>
        ) : (
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            className="text-text/80 transition-transform duration-400 group-hover:scale-[1.08]"
          >
            <circle cx="20" cy="20" r="12" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.4" />
            <line x1="29" y1="29" x2="40" y2="40" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
          </svg>
        )}
      </div>

      <div className="flex flex-col gap-3 p-6 flex-1">
        <h3 className="font-display text-[24px] font-normal text-text tracking-[1px]">
          {project.project_name}
        </h3>
        <p className="text-[14px] text-text-muted leading-relaxed">
          {project.company_name}
        </p>
        <div className="flex items-center gap-4 pt-4 border-t border-white/[0.04] mt-auto flex-wrap">
          <span className="font-mono text-[11px] font-normal text-[#8B9A6B] px-2.5 py-1 bg-[rgba(139,154,107,0.08)] rounded-[3px] border border-[rgba(139,154,107,0.12)] tracking-[1px]">
            {formatProjectType(project.type)}
          </span>
          {provenance && provenance.length > 0 && (
            <ProvenanceBadge chain={provenance} />
          )}
          <span className="font-mono text-[11px] text-text-muted/70 tracking-[0.5px]">
            {formatRelativeTime(project.updated_at)}
          </span>
        </div>
        {isShared && ownerEmail && userRole && (
          <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04] mt-2">
            <span className="font-mono text-[10px] text-text-muted/70 truncate max-w-[140px]">
              via {ownerEmail}
            </span>
            <span className="text-text-muted/20 mx-1">|</span>
            <RoleBadge role={userRole} size="sm" />
          </div>
        )}
      </div>
    </Link>
  );
}
