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

/**
 * Check if an email is allowed to access the app.
 * Admins are always allowed. If ALLOWED_EMAILS is not set, everyone is allowed (open access).
 */
export function isAllowedUser(email: string | undefined): boolean {
  if (!email) return false;
  if (isAdmin(email)) return true;

  const allowed = process.env.ALLOWED_EMAILS ?? "";
  const list = allowed
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  // If no whitelist configured, allow everyone
  if (list.length === 0) return true;

  return list.includes(email.toLowerCase());
}
