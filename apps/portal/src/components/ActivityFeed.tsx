"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Department } from "@/types/database";
import { formatRelativeTime } from "@/lib/format";

const DEPT_COLORS: Record<string, string> = {
  intelligence: "text-[#4D8EFF]/70 bg-[#4D8EFF]/8 border-[#4D8EFF]/12",
  strategy: "text-[#8B9A6B]/70 bg-[rgba(139,154,107,0.08)] border-[rgba(139,154,107,0.12)]",
  creative: "text-accent/70 bg-accent/8 border-accent/12",
};

const EVENT_ICONS: Record<string, string> = {
  "research-approved": "\u2713",
  "research-rejected": "\u21bb",
  "project-promoted": "\u2192",
  "job_completed": "\u2713",
  "job_running": "\u25b6",
  "job_failed": "\u2717",
  "job_queued": "\u23f3",
};

interface ActivityEvent {
  id: string;
  department: string;
  event_type: string;
  title: string;
  description: string | null;
  entity_id: string | null;
  entity_type: string | null;
  created_at: string;
  source: "automation_log" | "pipeline_job";
}

interface ActivityFeedProps {
  /** Filter to a specific department. Null = all departments. */
  department?: Department | null;
  /** Max events to display */
  limit?: number;
  /** Whether to show the "load more" button */
  paginated?: boolean;
}

export default function ActivityFeed({
  department = null,
  limit = 20,
  paginated = true,
}: ActivityFeedProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchEvents = useCallback(async (pageNum: number, append = false) => {
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        page_size: String(limit),
      });
      if (department) params.set("department", department);

      const res = await fetch(`/api/activity?${params}`);
      if (!res.ok) return;

      const data = await res.json();
      const fetched: ActivityEvent[] = data.events ?? [];

      if (append) {
        setEvents((prev) => [...prev, ...fetched]);
      } else {
        setEvents(fetched);
      }

      setHasMore(fetched.length === limit);
    } catch (err) {
      console.error("Failed to load activity:", err);
    } finally {
      setLoading(false);
    }
  }, [department, limit]);

  useEffect(() => {
    setPage(1);
    setLoading(true);
    fetchEvents(1);
  }, [fetchEvents]);

  function loadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchEvents(nextPage, true);
  }

  function getEventHref(event: ActivityEvent): string | null {
    if (!event.entity_id) return null;
    if (event.entity_type === "job" || event.entity_type === "project") {
      if (event.department === "strategy") {
        return `/strategy/research/${event.entity_id}`;
      }
      return `/project/${event.entity_id}`;
    }
    return null;
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg skeleton-shimmer" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4">
        <span className="w-1.5 h-1.5 rounded-full bg-text-muted/20" />
        <p className="font-mono text-[11px] text-text-muted/40">
          no recent activity
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {events.map((event) => {
        const href = getEventHref(event);
        const deptClass = DEPT_COLORS[event.department] ?? DEPT_COLORS.creative;
        const icon = EVENT_ICONS[event.event_type] ?? "\u00b7";

        const card = (
          <div className="flex items-start gap-3 px-3 py-2.5 rounded-md border border-white/[0.04] hover:border-white/[0.08] transition-colors group">
            {/* Icon */}
            <span className="font-mono text-[12px] text-text-muted/40 mt-0.5 w-4 text-center flex-shrink-0">
              {icon}
            </span>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`font-mono text-[9px] tracking-[1px] uppercase px-1.5 py-0.5 rounded-[2px] border ${deptClass}`}>
                  {event.department.slice(0, 5)}
                </span>
                <span className="font-mono text-[10px] text-text-muted/40">
                  {formatRelativeTime(event.created_at)}
                </span>
              </div>
              <p className="text-[12px] text-text group-hover:text-accent/90 transition-colors truncate">
                {event.title}
              </p>
              {event.description && (
                <p className="font-mono text-[10px] text-text-muted/50 mt-0.5 truncate">
                  {event.description}
                </p>
              )}
            </div>
          </div>
        );

        if (href) {
          return (
            <Link key={event.id} href={href} className="block">
              {card}
            </Link>
          );
        }

        return <div key={event.id}>{card}</div>;
      })}

      {paginated && hasMore && (
        <button
          onClick={loadMore}
          className="w-full py-2 font-mono text-[11px] text-text-muted/50 hover:text-text-muted transition-colors cursor-pointer"
        >
          load more...
        </button>
      )}
    </div>
  );
}
