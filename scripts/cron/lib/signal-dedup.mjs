/**
 * Signal Deduplication for Intelligence ingestion.
 *
 * Uses SHA-256 content hashing for cross-source deduplication.
 * Two signals from different platforms about the same content
 * will have the same content_hash.
 */

import { createHash } from "crypto";

/**
 * Generate a content hash for deduplication.
 * Normalizes text before hashing: lowercase, collapse whitespace, trim.
 */
export function generateContentHash(title, contentSnippet) {
  const text = [title || "", contentSnippet || ""]
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return null;

  return createHash("sha256").update(text).digest("hex");
}

/**
 * Check if a content_hash already exists in the signals table.
 * Returns true if a duplicate exists from a DIFFERENT source.
 */
export async function isDuplicateContent(dbGet, contentHash, source) {
  if (!contentHash) return false;

  try {
    const existing = await dbGet(
      "signals",
      `select=id,source&content_hash=eq.${contentHash}&source=neq.${source}&limit=1`
    );
    return existing.length > 0;
  } catch {
    return false;
  }
}
