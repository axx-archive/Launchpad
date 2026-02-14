"use client";

import { useState } from "react";
import RoleBadge from "@/components/RoleBadge";
import type { Collaborator } from "@/types/database";

interface CollaboratorListProps {
  collaborators: Collaborator[];
  currentUserId: string;
  onRemove: (userId: string, email: string) => void;
  isRemoving: string | null;
}

export default function CollaboratorList({
  collaborators,
  currentUserId,
  onRemove,
  isRemoving,
}: CollaboratorListProps) {
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);

  function handleRemoveClick(userId: string | null, email: string) {
    const key = userId ?? email;
    if (confirmingRemove === key) {
      onRemove(userId ?? "", email);
      setConfirmingRemove(null);
    } else {
      setConfirmingRemove(key);
    }
  }

  return (
    <div>
      <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-3">
        collaborators
      </p>
      <ul className="space-y-0">
        {collaborators.map((c) => {
          const key = c.user_id ?? c.email;
          const isOwner = c.role === "owner";
          const isSelf = c.user_id === currentUserId;
          const removing = isRemoving === key;
          const confirming = confirmingRemove === key;

          return (
            <li
              key={key}
              className={`flex items-center justify-between py-2.5 ${removing ? "opacity-50" : ""}`}
              aria-label={c.status === "pending" ? `${c.email}, pending invitation` : undefined}
            >
              {/* Left side: avatar + email */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-6 h-6 rounded-full bg-accent/10 border border-accent/15 flex items-center justify-center font-mono text-[10px] text-accent uppercase shrink-0">
                  {c.email[0]}
                </div>
                <span className="font-mono text-[12px] text-text tracking-[0.5px] truncate max-w-[180px]">
                  {c.email}
                </span>
                {c.status === "pending" && (
                  <span className="font-mono text-[10px] text-text-muted/40 tracking-[1px] shrink-0">
                    [pending]
                  </span>
                )}
              </div>

              {/* Right side: role + remove */}
              <div className="flex items-center gap-3 shrink-0">
                <RoleBadge role={c.role} size="md" />
                {!isOwner && !isSelf && (
                  <button
                    onClick={() => handleRemoveClick(c.user_id, c.email)}
                    onBlur={() => setConfirmingRemove(null)}
                    disabled={removing}
                    className={`font-mono text-[12px] p-2 transition-colors cursor-pointer ${
                      confirming
                        ? "text-error/60"
                        : "text-text-muted/30 hover:text-error"
                    }`}
                    aria-label={`Remove ${c.email} from project`}
                  >
                    {confirming ? "[remove?]" : "[x]"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
