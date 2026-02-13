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
