"use client";

import { useState } from "react";
import { formatFileSize, getFileTypeLabel } from "@/lib/format";

export interface MessageAttachmentFile {
  file_name: string;
  mime_type: string;
  file_size: number;
  /** Progress 0-100, or null if complete */
  progress: number | null;
  /** Signed download URL for completed image uploads (desktop thumbnail) */
  thumbnail_url?: string | null;
  /** Upload error message, if failed */
  error?: string | null;
}

interface MessageAttachmentProps {
  attachment: MessageAttachmentFile;
}

/** Inline attachment display within a user message bubble */
export default function MessageAttachment({
  attachment,
}: MessageAttachmentProps) {
  const [thumbLoaded, setThumbLoaded] = useState(false);

  const isUploading = attachment.progress !== null && !attachment.error;
  const isComplete = attachment.progress === null && !attachment.error;
  const isFailed = !!attachment.error;
  const isImage = attachment.mime_type.startsWith("image/");
  const label = getFileTypeLabel(attachment.mime_type);

  // Desktop-only thumbnail check
  const showThumbnail =
    isComplete &&
    isImage &&
    attachment.thumbnail_url &&
    typeof window !== "undefined" &&
    !window.matchMedia("(pointer: coarse)").matches;

  return (
    <div className="mt-1 flex items-center gap-2">
      {/* Thumbnail for completed image uploads (desktop only) */}
      {showThumbnail && (
        <div className="w-12 h-12 rounded-[2px] border border-white/[0.06] overflow-hidden flex-shrink-0">
          {!thumbLoaded && <div className="w-full h-full skeleton-shimmer" />}
          <img
            src={attachment.thumbnail_url!}
            alt={attachment.file_name}
            className={`w-full h-full object-cover transition-opacity ${
              thumbLoaded ? "opacity-100" : "opacity-0"
            }`}
            loading="lazy"
            onLoad={() => setThumbLoaded(true)}
          />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-accent/70 bg-accent/8 px-1.5 py-0.5 rounded-[2px] tracking-[0.5px] flex-shrink-0">
            {label}
          </span>
          <span className="font-mono text-[11px] text-text-muted truncate">
            {attachment.file_name}
          </span>
          {isComplete && (
            <>
              <span className="font-mono text-[10px] text-text-muted/50 flex-shrink-0">
                {formatFileSize(attachment.file_size)}
              </span>
              <span className="text-success/70 text-[11px] flex-shrink-0">&check;</span>
            </>
          )}
          {isFailed && (
            <span className="font-mono text-[10px] text-warning flex-shrink-0">
              upload failed — try again
            </span>
          )}
        </div>

        {/* Upload progress bar */}
        {isUploading && (
          <div
            className="h-[3px] w-full bg-border rounded-full overflow-hidden mt-1"
            role="progressbar"
            aria-valuenow={attachment.progress!}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Uploading ${attachment.file_name}`}
          >
            <div
              className="h-full bg-accent transition-all duration-200 ease-out"
              style={{ width: `${attachment.progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
