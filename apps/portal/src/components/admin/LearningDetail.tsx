"use client";

import { useState } from "react";
import type { Learning } from "./LearningConstellation";

const DEPT_COLORS: Record<string, string> = {
  creative: "#d4863c",
  strategy: "#8B9A6B",
  intelligence: "#4D8EFF",
  global: "#e0dcd4",
};

interface LearningVersion {
  id: string;
  version: number;
  title: string;
  content: string;
  confidence: number;
  changed_by: string;
  created_at: string;
}

interface Props {
  learning: Learning;
  versions: LearningVersion[];
  onClose: () => void;
  onUpdate: (learning: Learning) => void;
}

export default function LearningDetail({
  learning,
  versions,
  onClose,
  onUpdate,
}: Props) {
  const [notes, setNotes] = useState(learning.admin_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const color = DEPT_COLORS[learning.department] ?? DEPT_COLORS.global;

  const successRate =
    learning.usage_count > 0
      ? Math.round((learning.success_count / learning.usage_count) * 100)
      : 0;

  async function handleStatusChange(newStatus: string) {
    if (confirmAction !== newStatus) {
      setConfirmAction(newStatus);
      return;
    }
    setConfirmAction(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/learnings/${learning.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const { learning: updated } = await res.json();
        onUpdate(updated);
      }
    } catch (err) {
      console.error("Failed to update learning status:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNotes() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/learnings/${learning.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_notes: notes }),
      });
      if (res.ok) {
        const { learning: updated } = await res.json();
        onUpdate(updated);
      }
    } catch (err) {
      console.error("Failed to save notes:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full flex flex-col bg-bg-card border-l border-border overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-bg-card/95 backdrop-blur-sm border-b border-border px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="font-mono text-[10px] tracking-[2px] uppercase text-text-muted">
                {learning.department} · {learning.category}
              </span>
            </div>
            <h2 className="font-display text-[20px] text-text leading-snug">
              {learning.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted/70 hover:text-text text-[18px] p-1 transition-colors flex-shrink-0"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="px-6 py-5 grid grid-cols-2 gap-4 border-b border-border">
        <Metric label="confidence" value={`${Math.round(learning.confidence * 100)}%`} />
        <Metric label="decay weight" value={`${Math.round(learning.decay_weight * 100)}%`} />
        <Metric label="usage" value={String(learning.usage_count)} />
        <Metric label="success rate" value={`${successRate}%`} />
      </div>

      {/* Status + Actions */}
      <div className="px-6 py-5 border-b border-border">
        <p className="font-mono text-[10px] tracking-[2px] uppercase text-text-muted mb-3">
          status
        </p>
        <div className="flex items-center gap-2 mb-4">
          <StatusChip status={learning.status} color={color} />
        </div>
        <div className="flex flex-wrap gap-2">
          {learning.status !== "admin_override" && (
            <ActionButton
              label={confirmAction === "admin_override" ? "confirm pin?" : "pin"}
              onClick={() => handleStatusChange("admin_override")}
              disabled={saving}
              variant="accent"
            />
          )}
          {learning.status !== "archived" && (
            <ActionButton
              label={confirmAction === "archived" ? "confirm archive?" : "archive"}
              onClick={() => handleStatusChange("archived")}
              disabled={saving}
              variant="muted"
            />
          )}
          {learning.status !== "active" && (
            <ActionButton
              label={confirmAction === "active" ? "confirm reactivate?" : "reactivate"}
              onClick={() => handleStatusChange("active")}
              disabled={saving}
              variant="default"
            />
          )}
        </div>
      </div>

      {/* Admin Notes */}
      <div className="px-6 py-5 border-b border-border">
        <p className="font-mono text-[10px] tracking-[2px] uppercase text-text-muted mb-3">
          admin notes
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="add notes..."
          className="w-full bg-[#0a0a0a] border border-border rounded-md px-3 py-2 text-[13px] text-text placeholder:text-text-muted/40 resize-none h-20 focus:outline-none focus:border-accent/30 transition-colors"
        />
        {notes !== (learning.admin_notes ?? "") && (
          <button
            onClick={handleSaveNotes}
            disabled={saving}
            className="mt-2 font-mono text-[11px] tracking-[1px] text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
          >
            {saving ? "saving..." : "save notes"}
          </button>
        )}
      </div>

      {/* Timestamps */}
      <div className="px-6 py-5 border-b border-border space-y-2">
        <DetailRow label="discovered" value={new Date(learning.discovered_at).toLocaleDateString()} />
        {learning.last_validated_at && (
          <DetailRow
            label="last validated"
            value={new Date(learning.last_validated_at).toLocaleDateString()}
          />
        )}
        {learning.source_projects && learning.source_projects.length > 0 && (
          <DetailRow
            label="source projects"
            value={`${learning.source_projects.length} project${learning.source_projects.length !== 1 ? "s" : ""}`}
          />
        )}
      </div>

      {/* Version History */}
      {versions.length > 0 && (
        <div className="px-6 py-5">
          <p className="font-mono text-[10px] tracking-[2px] uppercase text-text-muted mb-4">
            version history
          </p>
          <div className="space-y-3">
            {versions.map((v) => (
              <div
                key={v.id}
                className="px-3 py-2.5 bg-white/[0.02] border border-border/50 rounded-md"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[10px] text-text-muted tracking-[1px]">
                    v{v.version}
                  </span>
                  <span className="font-mono text-[9px] text-text-muted/60">
                    {new Date(v.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-[12px] text-text/80 leading-relaxed">
                  {v.title}
                </p>
                <p className="text-[11px] text-text-muted/70 mt-1">
                  conf: {Math.round(v.confidence * 100)}%
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[9px] tracking-[2px] uppercase text-text-muted/60 mb-1">
        {label}
      </p>
      <p className="font-display text-[22px] text-text">{value}</p>
    </div>
  );
}

function StatusChip({ status, color }: { status: string; color: string }) {
  const label =
    status === "admin_override"
      ? "pinned"
      : status === "archived"
        ? "archived"
        : "active";

  const borderColor =
    status === "admin_override"
      ? color
      : status === "archived"
        ? "rgba(255,255,255,0.1)"
        : "rgba(255,255,255,0.15)";

  return (
    <span
      className="inline-block font-mono text-[10px] tracking-[1.5px] uppercase px-2.5 py-1 rounded-[3px] border"
      style={{
        borderColor,
        color: status === "admin_override" ? color : undefined,
        backgroundColor:
          status === "admin_override"
            ? `${color}15`
            : "rgba(255,255,255,0.03)",
      }}
    >
      {label}
    </span>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  variant,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  variant: "accent" | "muted" | "default";
}) {
  const classes =
    variant === "accent"
      ? "border-accent/20 text-accent hover:bg-accent/8"
      : variant === "muted"
        ? "border-red-400/20 text-red-400/80 hover:bg-red-400/8"
        : "border-border text-text-muted hover:bg-white/[0.04]";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`font-mono text-[10px] tracking-[1px] px-3 py-1.5 rounded-[3px] border transition-colors disabled:opacity-50 ${classes}`}
    >
      {label}
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[10px] text-text-muted/60 tracking-[0.5px]">
        {label}
      </span>
      <span className="font-mono text-[11px] text-text/80">{value}</span>
    </div>
  );
}
