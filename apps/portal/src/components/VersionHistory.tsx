"use client";

import { useEffect, useState, useCallback } from "react";

interface Version {
  id: string;
  version_number: number;
  url: string;
  notes: string | null;
  pushed_by: string | null;
  created_at: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function VersionHistory({ projectId }: { projectId: string }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVersions = useCallback(async () => {
    try {
      const vRes = await fetch(`/api/versions?project_id=${projectId}`);
      if (!vRes.ok) {
        setLoading(false);
        return;
      }
      const json = await vRes.json();
      setVersions(json.versions ?? []);
    } catch (err) {
      console.error('[VersionHistory] Failed to fetch versions:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  if (loading) {
    return (
      <div className="bg-bg-card border border-border rounded-lg p-6">
        <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-4">
          version history
        </p>
        <p className="text-[13px] text-text-muted/70 animate-pulse">loading...</p>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="bg-bg-card border border-border rounded-lg p-6">
        <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-4">
          version history
        </p>
        <p className="text-[13px] text-text-muted/70">
          no versions pushed yet.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-border rounded-lg p-6">
      <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-4">
        version history
      </p>
      <div className="space-y-3">
        {versions.map((v, i) => (
          <div
            key={v.id}
            className={`flex items-center gap-4 py-3 ${i < versions.length - 1 ? "border-b border-white/[0.04]" : ""}`}
          >
            <span className="font-mono text-[14px] text-accent font-medium min-w-[36px]">
              v{v.version_number}
            </span>
            <div className="flex-1 min-w-0">
              <a
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] text-text hover:text-accent transition-colors truncate block"
              >
                {v.url}
              </a>
              {v.notes && (
                <p className="text-[11px] text-text-muted/70 mt-0.5 truncate">{v.notes}</p>
              )}
            </div>
            <span className="font-mono text-[9px] text-text-muted/70 whitespace-nowrap">
              {formatDate(v.created_at)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
