"use client";

import { formatFileSize, getFileTypeLabel } from "@/lib/format";

interface StagedFilesProps {
  files: File[];
  onRemove: (index: number) => void;
}

/** Staged file chips shown between messages and input area */
export default function StagedFiles({ files, onRemove }: StagedFilesProps) {
  if (files.length === 0) return null;

  return (
    <div className="space-y-1 mb-2" role="list" aria-label="Staged files">
      {files.map((file, i) => {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "file";
        const mimeLabel = getFileTypeLabel(file.type) || ext;

        return (
          <div
            key={`${file.name}-${file.size}-${i}`}
            role="listitem"
            className="flex items-center justify-between bg-bg-raised/50 border border-border rounded-[3px] px-3 py-1 sm:py-1.5"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-[10px] text-accent/70 bg-accent/8 px-1.5 py-0.5 rounded-[2px] tracking-[0.5px] flex-shrink-0">
                {mimeLabel}
              </span>
              <span className="font-mono text-[12px] text-text truncate max-w-[15ch] sm:max-w-none">
                {file.name}
              </span>
              <span className="font-mono text-[10px] text-text-muted/70 flex-shrink-0">
                {formatFileSize(file.size)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label={`Remove ${file.name}`}
              className="font-mono text-[10px] text-text-muted/70 hover:text-error transition-colors cursor-pointer flex-shrink-0 ml-2"
            >
              &times;
            </button>
          </div>
        );
      })}
    </div>
  );
}
