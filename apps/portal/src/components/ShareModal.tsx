"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import TerminalChrome from "@/components/TerminalChrome";
import CollaboratorList from "@/components/CollaboratorList";
import InviteForm from "@/components/InviteForm";
import type { Collaborator } from "@/types/database";

interface ShareModalProps {
  projectId: string;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ShareModal({
  projectId,
  projectName,
  isOpen,
  onClose,
}: ShareModalProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Fetch members on open
  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement;

    async function fetchMembers() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/members`);
        if (res.ok) {
          const data = await res.json();

          // Map active members
          const activeMembers: Collaborator[] = (data.members ?? []).map(
            (m: { user_id: string; email: string; role: string }) => ({
              user_id: m.user_id,
              email: m.email,
              role: m.role as Collaborator["role"],
              status: "active" as const,
            })
          );

          // Map pending invitations
          const pending: Collaborator[] = (data.pending_invitations ?? []).map(
            (inv: { email: string; role: string }) => ({
              user_id: null,
              email: inv.email,
              role: inv.role as Collaborator["role"],
              status: "pending" as const,
            })
          );

          setCollaborators([...activeMembers, ...pending]);
          if (data.currentUserId) setCurrentUserId(data.currentUserId);
        }
      } catch (err) {
        console.error('[ShareModal] Failed to fetch members:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchMembers();
  }, [isOpen, projectId]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Escape to close + focus trap
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // Return focus on close
  useEffect(() => {
    if (!isOpen && previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  // Focus first focusable element on open
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const first = modalRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    }
  }, [isOpen, isLoading]);

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  async function handleRemove(userId: string, email: string) {
    const key = userId || email;
    setIsRemoving(key);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/members/${userId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setCollaborators((prev) =>
          prev.filter((c) => (c.user_id ?? c.email) !== key)
        );
      }
    } catch (err) {
      console.error('[ShareModal] Failed to remove collaborator:', err);
    } finally {
      setIsRemoving(null);
    }
  }

  function handleInvited(collaborator: Collaborator) {
    setCollaborators((prev) => [...prev, collaborator]);
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] sm:pt-[15vh] bg-bg/80 backdrop-blur-sm motion-safe:animate-[fadeIn_150ms_ease-out]"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg mx-4 sm:mx-6 motion-safe:animate-[slideUp_200ms_ease-out]"
      >
        <TerminalChrome title={`share: ${projectName}`}>
          <div id="share-modal-title" className="sr-only">
            Share {projectName}
          </div>

          {isLoading ? (
            <div className="py-8 text-center">
              <span className="font-mono text-[12px] text-text-muted/70">
                loading...
              </span>
            </div>
          ) : (
            <>
              <CollaboratorList
                collaborators={collaborators}
                currentUserId={currentUserId}
                onRemove={handleRemove}
                isRemoving={isRemoving}
              />

              <div className="border-t border-white/[0.06] my-4" />

              <InviteForm
                projectId={projectId}
                existingEmails={collaborators.map((c) => c.email)}
                onInvited={handleInvited}
              />
            </>
          )}

          {/* Live region for announcements */}
          <div aria-live="polite" className="sr-only" />
        </TerminalChrome>
      </div>
    </div>
  );
}
