"use client";

import { useState } from "react";
import type { BrandAsset } from "@/types/database";

interface AssetThumbnailProps {
  asset: BrandAsset & { download_url: string | null };
  readOnly?: boolean;
  onDelete?: (id: string) => void;
}

export default function AssetThumbnail({
  asset,
  readOnly = false,
  onDelete,
}: AssetThumbnailProps) {
  const [loaded, setLoaded] = useState(false);
  const isImage = asset.mime_type.startsWith("image/");

  function handleClick() {
    if (asset.download_url) {
      window.open(asset.download_url, "_blank");
    }
  }

  if (!isImage || !asset.download_url) return null;

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={handleClick}
        className="w-12 h-12 rounded-[3px] border border-border overflow-hidden cursor-pointer block"
        aria-label={`View ${asset.file_name}`}
      >
        {!loaded && <div className="absolute inset-0 skeleton-shimmer" />}
        <img
          src={asset.download_url}
          alt={asset.label || `Uploaded ${asset.category}: ${asset.file_name}`}
          className={`w-full h-full object-cover transition-opacity
            ${loaded ? "opacity-100" : "opacity-0"}
            group-hover:scale-[1.02] transition-transform`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
        />
      </button>

      {!readOnly && onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(asset.id);
          }}
          aria-label={`Remove ${asset.file_name}`}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full
            bg-bg-card border border-border text-text-muted/70
            hover:text-error hover:border-error/30
            opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
            transition-all flex items-center justify-center cursor-pointer"
        >
          <span className="text-[8px] leading-none">&times;</span>
        </button>
      )}
    </div>
  );
}
