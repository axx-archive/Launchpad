"use client";

import { useState, useRef, useCallback } from "react";
import { uploadFileViaSignedUrl } from "@/components/FileUpload";
import { formatFileSize, getFileTypeLabel } from "@/lib/format";
import AssetThumbnail from "@/components/AssetThumbnail";
import type { BrandAsset } from "@/types/database";

type SlotCategory = "logo" | "imagery" | "guide";

const SLOT_ALLOWED_TYPES: Record<SlotCategory, string[]> = {
  logo: [
    "image/svg+xml", "image/png", "image/jpeg", "image/webp", "application/pdf",
  ],
  imagery: [
    "image/png", "image/jpeg", "image/webp", "image/gif",
  ],
  guide: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
};

const SLOT_ACCEPT_STRINGS: Record<SlotCategory, string> = {
  logo: "image/svg+xml,image/png,image/jpeg,image/webp,application/pdf",
  imagery: "image/png,image/jpeg,image/webp,image/gif",
  guide: "application/pdf,.pptx,.docx,.xlsx",
};

/** Map UI slot to DB category */
function slotToDbCategory(slot: SlotCategory): string {
  if (slot === "imagery") return "hero";
  if (slot === "guide") return "other";
  return "logo";
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

interface BrandAssetSlotProps {
  projectId: string;
  slotType: SlotCategory;
  label: string;
  guidanceCopy: string;
  assets: (BrandAsset & { download_url: string | null })[];
  readOnly?: boolean;
  totalAssetCount: number;
  onUploadComplete: () => void;
  onDelete: (assetId: string) => Promise<void>;
}

export default function BrandAssetSlot({
  projectId,
  slotType,
  label,
  guidanceCopy,
  assets,
  readOnly = false,
  totalAssetCount,
  onUploadComplete,
  onDelete,
}: BrandAssetSlotProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingName, setUploadingName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isImageSlot = slotType === "logo" || slotType === "imagery";

  const validateFile = useCallback(
    (file: File): string | null => {
      if (totalAssetCount >= 20) return "max 20 brand assets per project.";
      if (!SLOT_ALLOWED_TYPES[slotType].includes(file.type)) {
        return `"${file.name}": not accepted for this slot.`;
      }
      if (file.size > MAX_FILE_SIZE) {
        return `"${file.name}": exceeds 20MB limit.`;
      }
      return null;
    },
    [slotType, totalAssetCount]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        setTimeout(() => setError(""), 5000);
        return;
      }

      setUploading(true);
      setUploadingName(file.name);
      setUploadProgress(0);
      setError("");

      const result = await uploadFileViaSignedUrl(
        file,
        projectId,
        (pct) => setUploadProgress(pct),
        {
          endpoint: `/api/projects/${projectId}/brand-assets`,
          extraBody: { category: slotToDbCategory(slotType) },
        }
      );

      if (!result.ok) {
        setError(result.error ?? "upload failed.");
        setTimeout(() => setError(""), 5000);
      } else {
        onUploadComplete();
      }

      setUploading(false);
      setUploadingName("");
      setUploadProgress(0);
    },
    [projectId, slotType, validateFile, onUploadComplete]
  );

  async function handleFiles(fileList: FileList) {
    const files = Array.from(fileList);
    for (const file of files) {
      await handleUpload(file);
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!readOnly && !uploading) setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (readOnly || uploading) return;
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  }

  // In read-only mode, hide empty slots entirely
  if (readOnly && assets.length === 0) return null;

  return (
    <div role="group" aria-label={`${label} upload`}>
      {/* Slot header */}
      <p className="font-mono text-[12px] text-accent mb-2">
        <span className="text-accent/70">$ </span>{label}
      </p>

      {/* Files display */}
      {isImageSlot ? (
        /* Thumbnail grid for image slots */
        <div className="flex flex-wrap gap-2">
          {assets.map((asset) => (
            <AssetThumbnail
              key={asset.id}
              asset={asset}
              readOnly={readOnly}
              onDelete={onDelete}
            />
          ))}

          {/* Inline add button */}
          {!readOnly && totalAssetCount < 20 && !uploading && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-12 h-12 rounded-[3px] border border-dashed border-accent/15
                hover:border-accent/30 hover:bg-accent/5
                flex items-center justify-center transition-all cursor-pointer"
              aria-label={`Add ${label} file`}
            >
              <span className="text-accent/40 text-[16px]">+</span>
            </button>
          )}
        </div>
      ) : (
        /* File rows for guide slot */
        <div className="space-y-1.5">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center justify-between bg-bg-raised/50 border border-border rounded-[3px] px-3 py-1.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-[10px] text-accent/70 bg-accent/8 px-1.5 py-0.5 rounded-[2px] tracking-[0.5px] flex-shrink-0">
                  {getFileTypeLabel(asset.mime_type)}
                </span>
                <span className="font-mono text-[12px] text-text truncate">
                  {asset.file_name}
                </span>
                <span className="font-mono text-[10px] text-text-muted/50 flex-shrink-0">
                  {formatFileSize(asset.file_size)}
                </span>
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onDelete(asset.id)}
                  aria-label={`Remove ${asset.file_name}`}
                  className="font-mono text-[10px] text-text-muted/50 hover:text-error transition-colors cursor-pointer flex-shrink-0 ml-2"
                >
                  remove
                </button>
              )}
            </div>
          ))}

          {/* Drop zone for guide slot */}
          {!readOnly && totalAssetCount < 20 && !uploading && (
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`border border-dashed rounded-[3px] px-3 py-2 text-center
                cursor-pointer transition-all mt-2
                ${dragOver ? "border-accent/60 bg-accent/5" : "border-accent/15 hover:border-accent/30"}`}
              aria-label={`Upload ${label} files — drag and drop or press Enter to browse`}
            >
              <p className="font-mono text-[11px] text-text-muted/50">
                <span className="text-accent/50">$ </span>
                drop or <span className="text-accent/50">browse</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleInputChange}
        className="hidden"
        accept={SLOT_ACCEPT_STRINGS[slotType]}
        disabled={readOnly || uploading}
        aria-hidden="true"
      />

      {/* Upload progress */}
      {uploading && uploadingName && (
        <div className="mt-2">
          <div
            className="h-[3px] w-full bg-border rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={uploadProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Uploading ${uploadingName}`}
          >
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
        <p className="text-error text-[11px] font-mono mt-1" role="alert">
          {error}
        </p>
      )}

      {/* Guidance copy — hidden once slot has 2+ files */}
      {assets.length < 2 && !readOnly && (
        <p className="font-mono text-[10px] text-text-muted/50 mt-1">
          {guidanceCopy}
        </p>
      )}
    </div>
  );
}
