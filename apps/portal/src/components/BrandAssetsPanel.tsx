"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { uploadFileViaSignedUrl } from "@/components/FileUpload";
import { formatFileSize } from "@/lib/format";
import BrandAssetSlot from "@/components/BrandAssetSlot";
import type { BrandAsset } from "@/types/database";

type AssetWithUrl = BrandAsset & { download_url: string | null };

/** Auto-categorize a file dropped on the unified empty drop zone */
function autoCategory(mimeType: string): string {
  if (mimeType === "image/svg+xml") return "logo";
  if (mimeType.startsWith("image/")) return "hero";
  return "other"; // PDF, DOCX → brand guide slot
}

interface BrandAssetsPanelProps {
  projectId: string;
  readOnly?: boolean;
}

export default function BrandAssetsPanel({
  projectId,
  readOnly = false,
}: BrandAssetsPanelProps) {
  const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25MB
  const [assets, setAssets] = useState<AssetWithUrl[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingName, setUploadingName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [announcement, setAnnouncement] = useState("");

  const fetchAssets = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/brand-assets`);
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets ?? []);
        setTotalSize(data.totalSize ?? 0);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const handleDelete = useCallback(
    async (assetId: string) => {
      const asset = assets.find((a) => a.id === assetId);
      try {
        const res = await fetch(`/api/projects/${projectId}/brand-assets`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId }),
        });
        if (res.ok) {
          setAssets((prev) => prev.filter((a) => a.id !== assetId));
          setAnnouncement(`Removed ${asset?.file_name ?? "file"}`);
        }
      } catch {
        setError("couldn't remove that file. try again.");
        setTimeout(() => setError(""), 5000);
      }
    },
    [projectId, assets]
  );

  /** Upload from the unified empty drop zone */
  async function handleEmptyUpload(fileList: FileList) {
    const file = fileList[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      setError(`"${file.name}": exceeds 20MB per-file limit.`);
      setTimeout(() => setError(""), 5000);
      return;
    }

    if (totalSize + file.size > MAX_TOTAL_SIZE) {
      const leftMB = Math.max(0, (MAX_TOTAL_SIZE - totalSize) / (1024 * 1024));
      setError(`"${file.name}": would exceed 25MB project limit (${leftMB.toFixed(1)}MB left).`);
      setTimeout(() => setError(""), 5000);
      return;
    }

    setUploading(true);
    setUploadingName(file.name);
    setUploadProgress(0);
    setError("");

    const category = autoCategory(file.type);
    const result = await uploadFileViaSignedUrl(
      file,
      projectId,
      (pct) => setUploadProgress(pct),
      {
        endpoint: `/api/projects/${projectId}/brand-assets`,
        extraBody: { category },
      }
    );

    if (!result.ok) {
      setError(result.error ?? "upload failed. check your connection.");
      setTimeout(() => setError(""), 5000);
    } else {
      await fetchAssets();
      setAnnouncement(`Uploaded ${file.name}`);
    }

    setUploading(false);
    setUploadingName("");
    setUploadProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  // Group assets by UI slot
  const logoAssets = assets.filter((a) => a.category === "logo");
  const imageryAssets = assets.filter((a) =>
    ["hero", "team", "background"].includes(a.category)
  );
  const guideAssets = assets.filter((a) => a.category === "other");
  const hasAssets = assets.length > 0;

  if (loading) {
    return (
      <section
        aria-labelledby="brand-assets-heading"
        className="bg-bg-card border border-border rounded-lg p-6"
      >
        <div className="space-y-3">
          <div className="h-3 w-24 skeleton-shimmer rounded" />
          <div className="flex gap-2">
            <div className="w-12 h-12 skeleton-shimmer rounded-[3px]" />
            <div className="w-12 h-12 skeleton-shimmer rounded-[3px]" />
          </div>
          <div className="h-3 w-28 skeleton-shimmer rounded" />
          <div className="flex gap-2">
            <div className="w-12 h-12 skeleton-shimmer rounded-[3px]" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="brand-assets-heading"
      className="bg-bg-card border border-border rounded-lg p-6"
    >
      {/* Header */}
      <div className="flex items-baseline justify-between mb-1">
        <h2
          id="brand-assets-heading"
          className="font-mono text-[11px] tracking-[4px] lowercase text-accent"
        >
          brand assets
        </h2>
        {assets.length > 0 && (
          <span className="font-mono text-[10px] text-text-muted/40">
            {formatFileSize(totalSize)} / 25MB
          </span>
        )}
      </div>
      <p className="text-[13px] text-text-muted mb-5">
        {readOnly ? "brand assets used in this build." : "arm your story with your look."}
      </p>

      {/* Empty state — single unified drop zone */}
      {!hasAssets && !readOnly && (
        <>
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload brand assets — drag files or press Enter to browse"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (!uploading) setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!uploading && e.dataTransfer.files.length > 0) {
                handleEmptyUpload(e.dataTransfer.files);
              }
            }}
            onClick={() => !uploading && inputRef.current?.click()}
            className={`border border-dashed rounded-[3px] p-6 text-center cursor-pointer transition-all
              ${dragOver ? "border-accent/60 bg-accent/5" : "border-accent/15 hover:border-accent/30"}
              ${uploading ? "opacity-50 cursor-default" : ""}`}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf,.pptx,.docx"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleEmptyUpload(e.target.files);
                }
              }}
              disabled={uploading}
              aria-hidden="true"
            />
            <p className="font-mono text-[12px] text-text-muted/70 mb-2">
              your logo, colors, and imagery help us<br />
              build a launchpad that looks like you.
            </p>
            <p className="font-mono text-[12px] text-text-muted">
              <span className="text-accent">$ </span>
              drop files or{" "}
              <span className="text-accent hover:text-accent-light transition-colors">
                browse
              </span>
            </p>
            <p className="font-mono text-[10px] text-text-muted/50 mt-2">
              images, svg, pdf — max 20MB each
            </p>
          </div>

          {/* Upload progress in empty state */}
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
        </>
      )}

      {/* Empty state for read-only with no assets */}
      {!hasAssets && readOnly && (
        <p className="font-mono text-[12px] text-text-muted/50">
          no brand assets uploaded.
        </p>
      )}

      {/* Populated state — categorized slots */}
      {hasAssets && (
        <div className="space-y-4">
          <BrandAssetSlot
            projectId={projectId}
            slotType="logo"
            label="logo"
            guidanceCopy="your primary mark — SVG or high-res PNG preferred"
            assets={logoAssets}
            readOnly={readOnly}
            totalAssetCount={assets.length}
            totalBytes={totalSize}
            maxTotalBytes={MAX_TOTAL_SIZE}
            onUploadComplete={fetchAssets}
            onDelete={handleDelete}
          />
          <BrandAssetSlot
            projectId={projectId}
            slotType="imagery"
            label="imagery"
            guidanceCopy="photos, textures, visuals that define your world"
            assets={imageryAssets}
            readOnly={readOnly}
            totalAssetCount={assets.length}
            totalBytes={totalSize}
            maxTotalBytes={MAX_TOTAL_SIZE}
            onUploadComplete={fetchAssets}
            onDelete={handleDelete}
          />
          <BrandAssetSlot
            projectId={projectId}
            slotType="guide"
            label="brand guide"
            guidanceCopy="style guide, brand book, or any reference doc"
            assets={guideAssets}
            readOnly={readOnly}
            totalAssetCount={assets.length}
            totalBytes={totalSize}
            maxTotalBytes={MAX_TOTAL_SIZE}
            onUploadComplete={fetchAssets}
            onDelete={handleDelete}
          />
        </div>
      )}

      {/* Panel-level error */}
      {error && (
        <p className="text-error text-[11px] font-mono mt-2" role="alert">
          {error}
        </p>
      )}

      {/* Screen reader live region */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </section>
  );
}
