"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Notification } from "@/types/database";

const POLL_INTERVAL = 30_000; // 30 seconds

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000,
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const router = useRouter();

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    } catch {
      // Silently fail — notifications are non-critical
    }
  }, []);

  // Poll for notifications
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setFocusIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Keyboard navigation for dropdown
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      const items = notifications.slice(0, 20);
      if (e.key === "Escape") {
        setOpen(false);
        setFocusIndex(-1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((prev) => Math.min(prev + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && focusIndex >= 0) {
        const n = items[focusIndex];
        if (n?.project_id) {
          router.push(`/project/${n.project_id}`);
          setOpen(false);
          setFocusIndex(-1);
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, focusIndex, notifications, router]);

  // Focus the active item
  useEffect(() => {
    if (focusIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("[data-notification-item]");
      (items[focusIndex] as HTMLElement)?.focus();
    }
  }, [focusIndex]);

  function handleNotificationClick(n: Notification) {
    if (n.project_id) {
      router.push(`/project/${n.project_id}`);
      setOpen(false);
      setFocusIndex(-1);
    }
  }

  // Mark all as read when dropdown opens
  async function handleOpen() {
    const willOpen = !open;
    setOpen(willOpen);

    if (willOpen && unreadCount > 0) {
      const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
      // Optimistically mark as read in UI
      setNotifications((prev) =>
        prev.map((n) => (unreadIds.includes(n.id) ? { ...n, read: true } : n)),
      );

      try {
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: unreadIds }),
        });
      } catch {
        // Revert on failure
        setNotifications((prev) =>
          prev.map((n) =>
            unreadIds.includes(n.id) ? { ...n, read: false } : n,
          ),
        );
      }
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="relative font-mono text-[11px] tracking-[1px] lowercase text-text-muted hover:text-text transition-colors cursor-pointer"
        aria-label={`notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 13a2 2 0 0 0 4 0" />
          <path d="M13 6c0-2.76-2.24-5-5-5S3 3.24 3 6c0 3.5-1.5 5-1.5 5h13S13 9.5 13 6z" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-accent text-bg text-[9px] font-bold leading-none px-[3px]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-8 w-72 max-h-80 overflow-y-auto rounded-lg border border-white/8 bg-bg-card shadow-xl z-50">
          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-text-muted text-[11px] font-mono tracking-[1px]">
              no notifications
            </div>
          ) : (
            <ul ref={listRef} className="divide-y divide-white/5" role="listbox">
              {notifications.slice(0, 20).map((n, i) => (
                <li
                  key={n.id}
                  data-notification-item
                  role="option"
                  aria-selected={focusIndex === i}
                  tabIndex={-1}
                  onClick={() => handleNotificationClick(n)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleNotificationClick(n);
                    }
                  }}
                  className={`px-4 py-3 ${!n.read ? "bg-accent/5" : ""} ${n.project_id ? "cursor-pointer hover:bg-white/[0.03]" : ""} ${focusIndex === i ? "bg-white/[0.06]" : ""} transition-colors outline-none`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-[11px] tracking-[0.5px] text-text font-medium">
                      {n.title}
                    </span>
                    <span className="font-mono text-[9px] tracking-[1px] text-text-muted whitespace-nowrap">
                      {timeAgo(n.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-text-muted leading-relaxed">
                    {n.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
