"use client";

import { useState, useEffect, useCallback } from "react";
import { formatFileSize, getFileTypeLabel } from "@/lib/format";
import type { ProjectDocument } from "@/types/database";

interface FileListProps {
  projectId: string;
  /** Allow upload + delete actions (owner or admin) */
  canManage?: boolean;
  /** Refresh trigger — increment to re-fetch */
  refreshKey?: number;
  /** Called when file count changes */
  onCountChange?: (count: number) => void;
  /** Called when total size changes (bytes) */
  onTotalSizeChange?: (bytes: number) => void;
}

export default function FileList({
  projectId,
  canManage = false,
  refreshKey = 0,
  onCountChange,
  onTotalSizeChange,
}: FileListProps) {
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents ?? []);
        onCountChange?.(data.documents?.length ?? 0);
        onTotalSizeChange?.(data.totalSize ?? 0);
      }
    } catch (err) {
      console.error('[FileList] Failed to fetch documents:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, onCountChange, onTotalSizeChange]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments, refreshKey]);

  async function handleDownload(fileName: string) {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/documents/download?fileName=${encodeURIComponent(fileName)}`
      );
      if (!res.ok) return;
      const { url } = await res.json();
      if (url) window.open(url, "_blank");
    } catch (err) {
      console.error('[FileList] Failed to download document:', err);
    }
  }

  async function handleDelete(fileName: string) {
    if (deleting) return;
    setDeleting(fileName);

    try {
      const res = await fetch(`/api/projects/${projectId}/documents`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName }),
      });

      if (res.ok) {
        const deleted = documents.find((d) => d.name === fileName);
        const deletedSize = deleted?.metadata?.size ?? 0;
        setDocuments((prev) => prev.filter((d) => d.name !== fileName));
        onCountChange?.(documents.length - 1);
        const currentTotal = documents.reduce((sum, d) => sum + (d.metadata?.size ?? 0), 0);
        onTotalSizeChange?.(currentTotal - deletedSize);
      }
    } catch (err) {
      console.error('[FileList] Failed to delete document:', err);
    } finally {
      setDeleting(null);
    }
  }

  /** Strip the timestamp prefix from display name */
  function displayName(name: string): string {
    // Format: {timestamp}_{filename}
    const underscoreIndex = name.indexOf("_");
    if (underscoreIndex > 0 && /^\d+$/.test(name.slice(0, underscoreIndex))) {
      return name.slice(underscoreIndex + 1);
    }
    return name;
  }

  if (loading) {
    return (
      <div className="bg-bg-card border border-border rounded-lg p-5">
        <p className="font-mono text-[12px] text-text-muted/70 animate-pulse">
          loading documents...
        </p>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="bg-bg-card border border-border rounded-lg p-5">
        <p className="font-mono text-[12px] text-text-muted/70">
          no documents uploaded yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {documents.map((doc) => {
        const mime = doc.metadata?.mimetype ?? "";
        const size = doc.metadata?.size ?? 0;

        return (
          <div
            key={doc.name}
            className="flex items-center justify-between bg-bg-card border border-border rounded-[3px] px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-[10px] text-accent/70 bg-accent/8 px-1.5 py-0.5 rounded-[2px] tracking-[0.5px] flex-shrink-0">
                {getFileTypeLabel(mime)}
              </span>
              <span className="font-mono text-[12px] text-text truncate">
                {displayName(doc.name)}
              </span>
              {size > 0 && (
                <span className="font-mono text-[10px] text-text-muted/70 flex-shrink-0">
                  {formatFileSize(size)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 flex-shrink-0 ml-2">
              <button
                onClick={() => handleDownload(doc.name)}
                className="font-mono text-[10px] text-accent/70 hover:text-accent transition-colors cursor-pointer"
              >
                download
              </button>
              {canManage && (
                <button
                  onClick={() => handleDelete(doc.name)}
                  disabled={deleting === doc.name}
                  className="font-mono text-[10px] text-text-muted/70 hover:text-error transition-colors cursor-pointer disabled:opacity-50"
                >
                  {deleting === doc.name ? "..." : "delete"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
