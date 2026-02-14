import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/types/database";

// ---------------------------------------------------------------------------
// Role-based project access verification
// ---------------------------------------------------------------------------

interface AccessResult {
  user: { id: string; email?: string };
  role: MemberRole;
  isAdmin: boolean;
  project: { id: string; user_id: string; department?: string };
}

interface AdminAccessResult {
  user: { id: string; email?: string };
  role: null;
  isAdmin: true;
  project: { id: string; user_id: string; department?: string };
}

interface AccessError {
  error: string;
  status: number;
}

/**
 * Verify the current user has access to a project with an optional role requirement.
 * Replaces the old `verifyAccess()` pattern with membership-based access.
 *
 * - Fetches the authenticated user
 * - Checks project membership via a single query (project + project_members join)
 * - Admins bypass role requirements
 * - Returns the user, their role, and the project, or an error
 */
export async function verifyProjectAccess(
  projectId: string,
  requiredRole?: MemberRole | MemberRole[],
): Promise<AccessResult | AdminAccessResult | AccessError> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "unauthorized", status: 401 };
  }

  const admin = isAdmin(user.email);

  // For non-admins, fetch project + membership in one query
  if (!admin) {
    const { data: project } = await supabase
      .from("projects")
      .select("id, user_id, department, project_members!inner(role)")
      .eq("id", projectId)
      .eq("project_members.user_id", user.id)
      .single();

    if (!project) {
      return { error: "project not found or no access", status: 404 };
    }

    const memberRows = project.project_members as unknown as { role: string }[];
    const role = memberRows[0]?.role as MemberRole;

    if (requiredRole) {
      const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
      if (!allowed.includes(role)) {
        return { error: "insufficient permissions", status: 403 };
      }
    }

    return { user, role, isAdmin: false, project: { id: project.id, user_id: project.user_id, department: project.department as string | undefined } };
  }

  // Admin bypass — use admin client to see any project
  const adminClient = createAdminClient();
  const { data: adminProject } = await adminClient
    .from("projects")
    .select("id, user_id, department")
    .eq("id", projectId)
    .single();

  if (!adminProject) {
    return { error: "project not found", status: 404 };
  }

  return { user, role: null, isAdmin: true, project: { id: adminProject.id, user_id: adminProject.user_id, department: adminProject.department as string | undefined } };
}

/**
 * Get all member user IDs for a project (for notification fan-out).
 * Optionally exclude a user (typically the actor who triggered the notification).
 */
export async function getProjectMemberIds(
  projectId: string,
  excludeUserId?: string,
): Promise<string[]> {
  const adminClient = createAdminClient();

  let query = adminClient
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId);

  if (excludeUserId) {
    query = query.neq("user_id", excludeUserId);
  }

  const { data: members } = await query;
  return (members ?? []).map((m) => m.user_id);
}

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
