"use client";

import { useState, useEffect, useCallback } from "react";
import AttentionQueue from "@/components/AttentionQueue";
import type { AttentionItem } from "@/components/AttentionQueue";
import type { Department } from "@/types/database";

/** Maps attention API `type` to a user-friendly action label */
const ACTION_LABELS: Record<string, string> = {
  trend_needs_brief: "generate brief",
  research_not_promoted: "promote to creative",
  narrative_pending_review: "review narrative",
  research_pending_review: "review research",
  pitchapp_pending_review: "review pitchapp",
};

interface AttentionQueueConnectedProps {
  /** Filter to a specific department. Null = all departments. */
  department?: Department | null;
}

export default function AttentionQueueConnected({
  department = null,
}: AttentionQueueConnectedProps) {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/attention");
      if (!res.ok) {
        setLoading(false);
        return;
      }

      const data = await res.json();
      const raw: {
        id: string;
        department: string;
        type: string;
        title: string;
        description: string;
        priority: "high" | "medium" | "low";
        action_url: string;
        created_at: string;
      }[] = data.items ?? [];

      // Map API shape → AttentionItem shape
      const mapped: AttentionItem[] = raw
        .filter((item) => !department || item.department === department)
        .map((item) => ({
          id: item.id,
          department: item.department as Department | "cross-dept",
          urgency: item.priority,
          title: item.title,
          description: item.description,
          action_label: ACTION_LABELS[item.type] ?? "view",
          href: item.action_url,
          created_at: item.created_at,
        }));

      setItems(mapped);
    } catch (err) {
      console.error("Failed to load attention queue:", err);
    } finally {
      setLoading(false);
    }
  }, [department]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  function handleDismiss(itemId: string) {
    setDismissed((prev) => new Set(prev).add(itemId));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3">
        <span className="w-1.5 h-1.5 rounded-full bg-accent/30 animate-pulse" />
        <p className="font-mono text-[11px] text-text-muted/40">
          checking attention items...
        </p>
      </div>
    );
  }

  const visibleItems = items.filter((item) => !dismissed.has(item.id));

  return (
    <AttentionQueue items={visibleItems} onDismiss={handleDismiss} />
  );
}
