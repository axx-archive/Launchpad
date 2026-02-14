"use client";

import { useState } from "react";
import type { MemberRole } from "@/types/database";

interface CollaboratorAvatarsProps {
  collaborators: Array<{ email: string; role: MemberRole }>;
  maxDisplay?: number;
}

const AVATAR_COLORS: Record<MemberRole, string> = {
  owner: "bg-accent/15 text-accent border-accent/20",
  editor: "bg-white/[0.06] text-text-muted border-white/8",
  viewer: "bg-white/[0.03] text-text-muted/70 border-white/[0.06]",
};

const ROLE_TEXT: Record<MemberRole, string> = {
  owner: "text-accent",
  editor: "text-text-muted",
  viewer: "text-text-muted/70",
};

export default function CollaboratorAvatars({
  collaborators,
  maxDisplay = 3,
}: CollaboratorAvatarsProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Don't render for solo owner
  if (collaborators.length <= 1) return null;

  const displayed = collaborators.slice(0, maxDisplay);
  const overflow = collaborators.length - maxDisplay;

  return (
    <div
      className="relative flex items-center"
      role="group"
      aria-label="Project collaborators"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip((prev) => !prev)}
    >
      {displayed.map((c, i) => (
        <div
          key={c.email}
          className={`w-7 h-7 rounded-full border-2 border-bg flex items-center justify-center font-mono text-[10px] uppercase ${i > 0 ? "-ml-2" : ""} ${AVATAR_COLORS[c.role]}`}
          aria-label={`${c.email} (${c.role})`}
        >
          {c.email[0]}
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="w-7 h-7 rounded-full border-2 border-bg flex items-center justify-center font-mono text-[10px] -ml-2 bg-bg-card text-text-muted/70 border-border"
          aria-label={`${overflow} more collaborator${overflow !== 1 ? "s" : ""}`}
        >
          +{overflow}
        </div>
      )}

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute left-0 top-full mt-2 bg-bg-card border border-border rounded-md px-3 py-2 shadow-lg z-50 min-w-[200px]">
          {collaborators.map((c) => (
            <div
              key={c.email}
              className="font-mono text-[11px] text-text-muted py-0.5 flex items-center justify-between gap-3"
            >
              <span className="truncate">{c.email}</span>
              <span className={`shrink-0 ${ROLE_TEXT[c.role]}`}>{c.role}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
