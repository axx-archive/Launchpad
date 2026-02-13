import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Check if an email belongs to an admin user.
 * Admin emails are stored as a comma-separated list in the ADMIN_EMAILS env var.
 */
export function isAdmin(email: string | undefined): boolean {
  if (!email) return false;
  const adminEmails = process.env.ADMIN_EMAILS ?? "";
  const list = adminEmails
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

// ---------------------------------------------------------------------------
// Cached admin user ID lookup — avoids listUsers() on every call
// ---------------------------------------------------------------------------

let cachedAdminIds: string[] | null = null;
let adminCacheTime = 0;
const ADMIN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Resolve admin emails to Supabase user IDs.
 * Uses listUsers() once then caches for 5 minutes.
 * Accepts an optional pre-created admin client to avoid duplicate instantiation.
 */
export async function getAdminUserIds(
  adminClient?: ReturnType<typeof createAdminClient>,
): Promise<string[]> {
  const now = Date.now();
  if (cachedAdminIds && now - adminCacheTime < ADMIN_CACHE_TTL) {
    return cachedAdminIds;
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length === 0) return [];

  const client = adminClient ?? createAdminClient();

  try {
    const { data } = await client.auth.admin.listUsers();
    const users = data?.users ?? [];
    const ids = users
      .filter((u) => u.email && adminEmails.includes(u.email.toLowerCase()))
      .map((u) => u.id);

    cachedAdminIds = ids;
    adminCacheTime = now;
    return ids;
  } catch (err) {
    console.error("Failed to resolve admin user IDs:", err);
    // Return stale cache if available, otherwise empty
    return cachedAdminIds ?? [];
  }
}

/**
 * Check if an email is allowed to access the app.
 * Admins are always allowed. Uses ALLOWED_DOMAINS for domain-based access
 * (e.g. "shareability.com") and ALLOWED_EMAILS for individual overrides.
 * If neither is set, everyone is allowed (open access).
 */
export function isAllowedUser(email: string | undefined): boolean {
  if (!email) return false;
  if (isAdmin(email)) return true;

  const lowerEmail = email.toLowerCase();
  const domain = lowerEmail.split("@")[1];

  const allowedDomains = (process.env.ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  // If nothing configured, allow everyone (open access)
  if (allowedDomains.length === 0 && allowedEmails.length === 0) return true;

  // Check domain match
  if (domain && allowedDomains.includes(domain)) return true;

  // Check individual email match
  if (allowedEmails.includes(lowerEmail)) return true;

  return false;
}
