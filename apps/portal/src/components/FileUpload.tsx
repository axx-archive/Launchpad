"use client";

import { useState, useRef, useCallback } from "react";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_FILES = 10;
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/msword",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Upload a single file via signed URL (bypasses Vercel body limit) */
async function uploadFileViaSignedUrl(
  file: File,
  projectId: string,
  onProgress?: (percent: number) => void
): Promise<{ ok: boolean; error?: string }> {
  // 1. Get signed upload URL from API
  const res = await fetch(`/api/projects/${projectId}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error ?? "failed to prepare upload." };
  }

  const { signedUrl, token } = await res.json();

  // 2. Upload directly to Supabase Storage via XMLHttpRequest for progress
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("x-upsert", "false");

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve({ ok: true });
      } else {
        resolve({ ok: false, error: "upload to storage failed." });
      }
    };

    xhr.onerror = () => {
      resolve({ ok: false, error: "upload to storage failed." });
    };

    xhr.send(file);
  });
}

interface FileUploadProps {
  /** If provided, uploads immediately. If absent, queues files in state. */
  projectId?: string;
  /** Current count of already-uploaded files (for max enforcement) */
  existingCount?: number;
  /** Called when files are queued (queue mode only) */
  onQueue?: (files: File[]) => void;
  /** Called after a successful upload (immediate mode) */
  onUpload?: () => void;
  /** Queued files to display (queue mode only) */
  queuedFiles?: File[];
  /** Remove a queued file by index (queue mode only) */
  onRemoveQueued?: (index: number) => void;
  disabled?: boolean;
}

export default function FileUpload({
  projectId,
  existingCount = 0,
  onQueue,
  onUpload,
  queuedFiles = [],
  onRemoveQueued,
  disabled = false,
}: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingName, setUploadingName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isQueueMode = !projectId;
  const totalCount = existingCount + queuedFiles.length;

  const validateFiles = useCallback(
    (files: File[]): { valid: File[]; errors: string[] } => {
      const errors: string[] = [];
      const valid: File[] = [];
      const remaining = MAX_FILES - totalCount;

      if (remaining <= 0) {
        errors.push(`max ${MAX_FILES} files per project.`);
        return { valid, errors };
      }

      const toProcess = files.slice(0, remaining);
      if (files.length > remaining) {
        errors.push(`only ${remaining} more file${remaining === 1 ? "" : "s"} allowed.`);
      }

      for (const file of toProcess) {
        if (!ALLOWED_TYPES.includes(file.type)) {
          errors.push(`${file.name}: type not allowed.`);
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          errors.push(`${file.name}: exceeds 500MB limit.`);
          continue;
        }
        valid.push(file);
      }

      return { valid, errors };
    },
    [totalCount]
  );

  const handleFiles = useCallback(
    async (fileList: FileList) => {
      setError("");
      const files = Array.from(fileList);
      const { valid, errors } = validateFiles(files);

      if (errors.length > 0) {
        setError(errors.join(" "));
      }

      if (valid.length === 0) return;

      if (isQueueMode) {
        onQueue?.(valid);
      } else {
        setUploading(true);
        try {
          for (const file of valid) {
            setUploadingName(file.name);
            setUploadProgress(0);
            const result = await uploadFileViaSignedUrl(file, projectId!, (pct) => setUploadProgress(pct));
            if (!result.ok) {
              setError((prev) =>
                prev
                  ? `${prev} ${file.name}: ${result.error}`
                  : `${file.name}: ${result.error}`
              );
            }
          }
          onUpload?.();
        } catch {
          setError("network error. check your connection.");
        } finally {
          setUploading(false);
          setUploadingName("");
          setUploadProgress(0);
        }
      }

      // Reset input
      if (inputRef.current) inputRef.current.value = "";
    },
    [isQueueMode, projectId, onQueue, onUpload, validateFiles]
  );

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!disabled && !uploading) setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  }

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        className={`border border-dashed rounded-[3px] p-4 text-center cursor-pointer transition-all ${
          dragOver
            ? "border-accent/60 bg-accent/5"
            : "border-accent/15 hover:border-accent/30"
        } ${disabled || uploading ? "opacity-50 cursor-default" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={handleInputChange}
          className="hidden"
          accept={ALLOWED_TYPES.join(",")}
          disabled={disabled || uploading}
        />
        <p className="font-mono text-[12px] text-text-muted">
          {uploading ? (
            <>uploading {uploadingName}...</>
          ) : (
            <>
              <span className="text-accent">$ </span>
              drop files here or{" "}
              <span className="text-accent hover:text-accent-light transition-colors">
                browse
              </span>
            </>
          )}
        </p>
        <p className="font-mono text-[10px] text-text-muted/50 mt-1">
          pdf, pptx, docx, images — max 500MB each, {MAX_FILES} total
        </p>
      </div>

      {/* Upload progress bar */}
      {uploading && uploadingName && (
        <div className="mt-2">
          <div className="h-[3px] w-full bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-200 ease-out"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="font-mono text-[11px] text-text-muted/60 mt-1">
            uploading {uploadingName} — {uploadProgress}%
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-error text-[12px] font-mono mt-2" role="alert">
          {error}
        </p>
      )}

      {/* Queued files (queue mode) */}
      {isQueueMode && queuedFiles.length > 0 && (
        <div className="mt-3 space-y-1">
          {queuedFiles.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="flex items-center justify-between bg-bg-raised/50 border border-border rounded-[3px] px-3 py-1.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-[10px] text-accent/70 bg-accent/8 px-1.5 py-0.5 rounded-[2px] tracking-[0.5px] flex-shrink-0">
                  {file.name.split(".").pop()?.toLowerCase() ?? "file"}
                </span>
                <span className="font-mono text-[12px] text-text truncate">
                  {file.name}
                </span>
                <span className="font-mono text-[10px] text-text-muted/50 flex-shrink-0">
                  {formatSize(file.size)}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveQueued?.(i);
                }}
                className="font-mono text-[10px] text-text-muted/50 hover:text-error transition-colors cursor-pointer flex-shrink-0 ml-2"
              >
                remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { uploadFileViaSignedUrl };
