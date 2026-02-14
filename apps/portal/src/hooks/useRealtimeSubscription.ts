"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type PostgresEvent = "INSERT" | "UPDATE" | "DELETE";

interface SubscriptionConfig {
  /** Postgres table to subscribe to */
  table: string;
  /** Event types to listen for */
  events?: PostgresEvent[];
  /** Column-level filter (e.g., { column: "project_id", value: "uuid" }) */
  filter?: { column: string; value: string };
  /** Called when a matching event arrives */
  onEvent: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  /** Whether the subscription is active (default: true) */
  enabled?: boolean;
}

/**
 * Subscribe to Supabase Realtime postgres_changes on a table.
 * Handles channel creation, reconnection, and cleanup automatically.
 *
 * Usage:
 * ```ts
 * useRealtimeSubscription({
 *   table: "pipeline_jobs",
 *   filter: { column: "project_id", value: projectId },
 *   onEvent: (payload) => { ... },
 * });
 * ```
 */
export function useRealtimeSubscription({
  table,
  events = ["INSERT", "UPDATE"],
  filter,
  onEvent,
  enabled = true,
}: SubscriptionConfig) {
  // Keep latest callback ref so we don't re-subscribe on every render
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // Serialize events for stable dependency comparison
  const eventsKey = events.join(",");
  const filterColumn = filter?.column;
  const filterValue = filter?.value;

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const channelName = filterColumn && filterValue
      ? `realtime:${table}:${filterColumn}:${filterValue}`
      : `realtime:${table}`;

    // Build filter string for Supabase Realtime (e.g., "project_id=eq.uuid")
    const filterStr = filterColumn && filterValue
      ? `${filterColumn}=eq.${filterValue}`
      : undefined;

    const allowedEvents = new Set(eventsKey.split(","));

    // Subscribe to all postgres_changes events with *, filter by event type in callback.
    // This avoids TypeScript overload issues with chained .on() calls.
    const channelOpts: { event: string; schema: string; table: string; filter?: string } = {
      event: "*",
      schema: "public",
      table,
    };
    if (filterStr) channelOpts.filter = filterStr;

    // Supabase Realtime types use discriminated overloads that don't work well
    // with dynamic config objects. The runtime API accepts these params correctly.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = (supabase.channel(channelName) as any)
      .on(
        "postgres_changes",
        channelOpts,
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (allowedEvents.has(payload.eventType)) {
            onEventRef.current(payload);
          }
        },
      )
      .subscribe((status: string) => {
        if (status === "CHANNEL_ERROR") {
          console.warn(`[realtime] channel error on ${channelName}`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, eventsKey, filterColumn, filterValue, enabled]);
}
