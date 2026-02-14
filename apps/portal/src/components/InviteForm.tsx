"use client";

import { useState } from "react";
import type { Collaborator, MemberRole } from "@/types/database";

interface InviteFormProps {
  projectId: string;
  onInvited: (collaborator: Collaborator) => void;
}

type InviteRole = Exclude<MemberRole, "owner">;

export default function InviteForm({ projectId, onInvited }: InviteFormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("editor");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  function validateEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");

    const trimmed = email.trim();
    if (!trimmed) return;
    if (!validateEmail(trimmed)) {
      setError("enter a valid email address");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, role }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "something went wrong. try again.");
        return;
      }

      const data = await res.json();
      onInvited({
        user_id: data.membership?.user_id ?? null,
        email: trimmed,
        role,
        status: data.status === "active" ? "active" : "pending",
      });

      // Reset form
      setEmail("");
      setRole("editor");
    } catch {
      setError("something went wrong. try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="space-y-3">
      {/* Email input */}
      <div>
        <div className="flex items-center gap-0 rounded-[3px] border border-white/8 bg-bg-card px-3 py-2 focus-within:border-accent/30 transition-colors">
          <span className="text-accent text-[12px] select-none font-mono shrink-0">
            $ email:{" "}
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            onKeyDown={handleKeyDown}
            placeholder="name@company.com"
            disabled={isSubmitting}
            className="flex-1 bg-transparent border-0 font-mono text-[12px] text-text outline-none placeholder:text-text-muted/30 disabled:opacity-50"
            autoComplete="email"
            aria-label="Email address to invite"
            aria-describedby={error ? "invite-error" : undefined}
          />
        </div>
        {error && (
          <p
            id="invite-error"
            className="text-error text-[11px] font-mono mt-1"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>

      {/* Role selector */}
      <div className="flex items-center gap-2">
        <span className="text-accent text-[12px] select-none font-mono shrink-0">
          $ role:
        </span>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Invitation role">
          {(["editor", "viewer"] as InviteRole[]).map((r) => (
            <button
              key={r}
              role="radio"
              aria-checked={role === r}
              onClick={() => setRole(r)}
              disabled={isSubmitting}
              className={`font-mono text-[11px] px-3 py-1.5 rounded-[3px] border transition-all cursor-pointer tracking-[0.5px] ${
                role === r
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-white/6 text-text-muted/50 hover:border-white/12 hover:text-text-muted"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Submit button */}
      <button
        onClick={() => handleSubmit()}
        disabled={isSubmitting || !email.trim()}
        className="w-full text-left px-4 py-3 rounded-[3px] border border-accent/30 bg-accent/8 text-accent text-[12px] tracking-[0.5px] hover:bg-accent/15 hover:border-accent/50 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-mono"
      >
        {isSubmitting ? "$ inviting..." : "$ invite"}
      </button>
    </div>
  );
}
