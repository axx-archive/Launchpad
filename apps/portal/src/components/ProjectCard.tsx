"use client";

import { useRef } from "react";
import Link from "next/link";
import type { Project } from "@/types/database";
import StatusDot from "./StatusDot";
import { formatRelativeTime, formatProjectType } from "@/lib/format";

const GRADIENT_MAP: Record<string, string> = {
  investor_pitch:
    "bg-gradient-to-br from-[rgba(200,164,78,0.28)] via-[rgba(226,201,126,0.12)] to-[rgba(8,8,10,0.3)]",
  client_proposal:
    "bg-gradient-to-br from-[rgba(100,140,180,0.28)] via-[rgba(140,175,210,0.12)] to-[rgba(8,8,10,0.3)]",
  product_launch:
    "bg-gradient-to-br from-[rgba(224,122,79,0.28)] via-[rgba(240,152,112,0.12)] to-[rgba(8,8,10,0.3)]",
  other:
    "bg-gradient-to-br from-[rgba(148,143,134,0.18)] via-[rgba(148,143,134,0.08)] to-[rgba(8,8,10,0.3)]",
};

export default function ProjectCard({
  project,
  href,
  hasUnread = false,
}: {
  project: Project;
  href: string;
  hasUnread?: boolean;
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

  const gradient = GRADIENT_MAP[project.type] ?? GRADIENT_MAP.other;

  return (
    <Link
      ref={cardRef}
      href={href}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`group flex flex-col bg-bg-card border border-white/[0.04] rounded-md overflow-hidden transition-all duration-400 hover:border-accent/15 hover:shadow-[0_12px_40px_rgba(192,120,64,0.06)] ${hasUnread ? "border-l-2 border-l-accent/40 animate-[glow-pulse_3s_ease-in-out_infinite]" : ""}`}
      style={{ transition: "transform 0.4s cubic-bezier(0.16,1,0.3,1), border-color 0.4s, box-shadow 0.4s" }}
    >
      <div
        className={`relative h-40 flex items-center justify-center overflow-hidden ${gradient}`}
      >
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <StatusDot status={project.status} />
        </div>
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          className="text-text/80 transition-transform duration-400 group-hover:scale-[1.08]"
        >
          <path
            d="M24 8 L28 20 L40 20 L30 28 L34 40 L24 32 L14 40 L18 28 L8 20 L20 20 Z"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            opacity="0.5"
          />
        </svg>
      </div>

      <div className="flex flex-col gap-3 p-6 flex-1">
        <h3 className="font-display text-[24px] font-normal text-text tracking-[1px]">
          {project.company_name}
        </h3>
        <p className="text-[14px] text-text-muted leading-relaxed">
          {project.project_name}
        </p>
        <div className="flex items-center gap-4 pt-4 border-t border-white/[0.04] mt-auto">
          <span className="font-mono text-[11px] font-normal text-accent px-2.5 py-1 bg-accent/8 rounded-[3px] border border-accent/12 tracking-[1px]">
            {formatProjectType(project.type)}
          </span>
          <span className="font-mono text-[11px] text-text-muted/60 tracking-[0.5px]">
            {formatRelativeTime(project.updated_at)}
          </span>
        </div>
      </div>
    </Link>
  );
}
