"use client";

import { useState, useEffect, useRef } from "react";
import type { Collaborator, MemberRole } from "@/types/database";

interface InviteFormProps {
  projectId: string;
  existingEmails: string[];
  onInvited: (collaborator: Collaborator) => void;
}

interface UserOption {
  id: string;
  email: string;
  display_name: string | null;
}

type InviteRole = Exclude<MemberRole, "owner">;

export default function InviteForm({
  projectId,
  existingEmails,
  onInvited,
}: InviteFormProps) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<InviteRole>("editor");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Fetch all users once on mount
  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch("/api/users");
        if (res.ok) {
          const data = await res.json();
          setAllUsers(data.users ?? []);
        }
      } catch {
        // Fail silently — user can still type an email
      }
    }
    fetchUsers();
  }, []);

  // Filter users: exclude already-invited, match query
  const existingSet = new Set(existingEmails.map((e) => e.toLowerCase()));
  const filtered = allUsers.filter((u) => {
    if (existingSet.has(u.email.toLowerCase())) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      (u.display_name?.toLowerCase().includes(q) ?? false)
    );
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectUser(user: UserOption) {
    setSelectedUser(user);
    setQuery(user.email);
    setIsOpen(false);
    setError("");
    setHighlightIndex(-1);
  }

  function handleInputChange(value: string) {
    setQuery(value);
    setSelectedUser(null);
    setError("");
    setIsOpen(true);
    setHighlightIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen && filtered.length > 0) {
        setIsOpen(true);
        setHighlightIndex(0);
      } else {
        setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (isOpen && highlightIndex >= 0 && filtered[highlightIndex]) {
        selectUser(filtered[highlightIndex]);
      } else {
        handleSubmit();
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightIndex] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");

    const email = selectedUser?.email ?? query.trim();
    if (!email) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("enter a valid email address");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "something went wrong. try again.");
        return;
      }

      const data = await res.json();
      onInvited({
        user_id: data.membership?.user_id ?? null,
        email,
        role,
        status: data.status === "active" ? "active" : "pending",
      });

      // Reset form
      setQuery("");
      setSelectedUser(null);
      setRole("editor");
      setIsOpen(false);
    } catch {
      setError("something went wrong. try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Email dropdown/autocomplete */}
      <div ref={wrapperRef} className="relative">
        <div className="flex items-center gap-0 rounded-[3px] border border-white/8 bg-bg-card px-3 py-2 focus-within:border-accent/30 transition-colors">
          <span className="text-accent text-[12px] select-none font-mono shrink-0">
            $ email:{" "}
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="search users..."
            disabled={isSubmitting}
            className="flex-1 bg-transparent border-0 font-mono text-[12px] text-text outline-none placeholder:text-text-muted/30 disabled:opacity-50"
            autoComplete="off"
            role="combobox"
            aria-expanded={isOpen && filtered.length > 0}
            aria-controls="user-listbox"
            aria-activedescendant={
              highlightIndex >= 0 ? `user-option-${highlightIndex}` : undefined
            }
            aria-label="Search users to invite"
            aria-describedby={error ? "invite-error" : undefined}
          />
        </div>

        {/* Dropdown */}
        {isOpen && filtered.length > 0 && (
          <ul
            ref={listRef}
            id="user-listbox"
            role="listbox"
            className="absolute z-10 left-0 right-0 mt-1 max-h-[200px] overflow-y-auto rounded-[3px] border border-white/10 bg-bg-card shadow-lg"
          >
            {filtered.map((user, i) => (
              <li
                key={user.id}
                id={`user-option-${i}`}
                role="option"
                aria-selected={highlightIndex === i}
                onClick={() => selectUser(user)}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer font-mono text-[12px] transition-colors ${
                  highlightIndex === i
                    ? "bg-accent/15 text-accent"
                    : "text-text-muted hover:bg-white/[0.04] hover:text-text"
                }`}
              >
                {/* Initial circle */}
                <span className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[9px] text-text-muted/60 uppercase shrink-0">
                  {user.email[0]}
                </span>
                <span className="truncate">{user.email}</span>
              </li>
            ))}
          </ul>
        )}

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
        <div
          className="flex gap-1.5"
          role="radiogroup"
          aria-label="Invitation role"
        >
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
        disabled={isSubmitting || !query.trim()}
        className="w-full text-left px-4 py-3 rounded-[3px] border border-accent/30 bg-accent/8 text-accent text-[12px] tracking-[0.5px] hover:bg-accent/15 hover:border-accent/50 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-mono"
      >
        {isSubmitting ? "$ inviting..." : "$ invite"}
      </button>
    </div>
  );
}
