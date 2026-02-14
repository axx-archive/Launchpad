import type { BrandAssetCategory } from "@/types/database";

export type FileRoute = {
  bucket: "brand-assets" | "documents";
  category: BrandAssetCategory | null; // null = documents bucket (no category)
  label: string; // human-friendly label for Scout to use
};

const ROUTE_MAP: Record<string, FileRoute> = {
  // Images → brand-assets/hero
  ".png":  { bucket: "brand-assets", category: "hero", label: "imagery" },
  ".jpg":  { bucket: "brand-assets", category: "hero", label: "imagery" },
  ".jpeg": { bucket: "brand-assets", category: "hero", label: "imagery" },
  ".webp": { bucket: "brand-assets", category: "hero", label: "imagery" },
  ".gif":  { bucket: "brand-assets", category: "hero", label: "imagery" },

  // SVGs → brand-assets/logo
  ".svg":  { bucket: "brand-assets", category: "logo", label: "logo" },

  // Documents → documents bucket
  ".pdf":  { bucket: "documents", category: null, label: "document" },
  ".pptx": { bucket: "documents", category: null, label: "presentation" },
  ".docx": { bucket: "documents", category: null, label: "document" },
  ".xlsx": { bucket: "documents", category: null, label: "spreadsheet" },
  ".txt":  { bucket: "documents", category: null, label: "text file" },
  ".csv":  { bucket: "documents", category: null, label: "data file" },

  // Fonts → brand-assets/font
  ".woff":  { bucket: "brand-assets", category: "font", label: "font" },
  ".woff2": { bucket: "brand-assets", category: "font", label: "font" },
  ".ttf":   { bucket: "brand-assets", category: "font", label: "font" },
  ".otf":   { bucket: "brand-assets", category: "font", label: "font" },
};

export function routeFile(fileName: string): FileRoute {
  const ext = "." + (fileName.split(".").pop()?.toLowerCase() ?? "");
  return ROUTE_MAP[ext] ?? { bucket: "brand-assets", category: "other", label: "file" };
}

/** All MIME types accepted across both buckets (for UI validation) */
export const ALL_ALLOWED_MIME_TYPES = [
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
  "font/woff", "font/woff2", "font/ttf", "font/otf",
  "application/font-woff", "application/font-woff2",
  "application/x-font-ttf", "application/x-font-otf",
];

/** File extensions for the HTML accept attribute */
export const ALL_ACCEPTED_EXTENSIONS =
  ".png,.jpg,.jpeg,.webp,.gif,.svg,.pdf,.pptx,.docx,.xlsx,.txt,.csv,.woff,.woff2,.ttf,.otf";
