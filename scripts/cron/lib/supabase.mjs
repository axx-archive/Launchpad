/**
 * Shared Supabase client for cron scripts.
 *
 * Reads credentials from environment variables first, falls back to
 * apps/portal/.env.local if present. This allows scripts to run in
 * CI/CD, cron, or any environment without the .env.local file.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "../../..");

/**
 * Read a value from apps/portal/.env.local file.
 * Returns undefined if file doesn't exist or key not found.
 */
function readFromEnvFile(key) {
  const envPath = join(ROOT, "apps/portal/.env.local");
  if (!existsSync(envPath)) return undefined;

  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (match && match[1] === key) return match[2].trim();
  }
  return undefined;
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || readFromEnvFile("NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || readFromEnvFile("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    JSON.stringify({
      error: "Missing Supabase credentials",
      hint: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars, or ensure apps/portal/.env.local exists",
    })
  );
  process.exit(1);
}

export { SUPABASE_URL, SUPABASE_SERVICE_KEY, ROOT };

// ---------------------------------------------------------------------------
// Low-level REST helpers (same pattern as launchpad-cli.mjs)
// ---------------------------------------------------------------------------

function headers() {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function dbGet(table, query = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: headers(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DB GET ${table} failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function dbPatch(table, query, body) {
  const h = headers();
  h["Prefer"] = "return=representation";
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: h,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DB PATCH ${table} failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function dbPost(table, body) {
  const h = headers();
  h["Prefer"] = "return=representation";
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DB POST ${table} failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Call a Supabase RPC function.
 */
export async function dbRpc(functionName, params = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RPC ${functionName} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Automation helpers
// ---------------------------------------------------------------------------

/**
 * Log an event to the automation_log table.
 */
export async function logAutomation(event, details = {}, projectId = null) {
  try {
    await dbPost("automation_log", {
      event,
      project_id: projectId,
      details,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    // Don't crash if logging fails — log to stderr instead
    console.error(JSON.stringify({ error: "Failed to write automation_log", message: err.message }));
  }
}

/**
 * Check if automation is enabled via kill switch.
 * Returns false if AUTOMATION_ENABLED is explicitly set to "false".
 */
export function isAutomationEnabled() {
  const val = process.env.AUTOMATION_ENABLED;
  if (val === "false" || val === "0") return false;
  return true;
}
