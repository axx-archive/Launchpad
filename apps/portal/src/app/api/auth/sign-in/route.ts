import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Server-side magic link sign-in.
 *
 * Supabase's GoTrue has signups disabled at the instance level (platform-side),
 * which blocks client-side `signInWithOtp` for new users. This endpoint works
 * around that by using the admin API to:
 * 1. Check if the user exists
 * 2. Create them if they don't (pre-provision)
 * 3. Call signInWithOtp on a regular client — since the user now exists,
 *    GoTrue treats it as a login and sends the magic link email.
 *
 * The client calls this instead of `supabase.auth.signInWithOtp()` directly.
 */

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 3;
const MAX_RATE_LIMIT_ENTRIES = 500; // Cap to prevent unbounded growth in serverless
const recentRequests = new Map<string, number[]>();

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "valid email is required" }, { status: 400 });
  }

  // Simple in-memory rate limit per email (3 requests per minute)
  const now = Date.now();
  const recent = (recentRequests.get(email) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (recent.length >= RATE_LIMIT_MAX) {
    return NextResponse.json(
      { error: "too many attempts. try again in a minute." },
      { status: 429 },
    );
  }
  recent.push(now);
  recentRequests.set(email, recent);

  // Evict oldest entries if the map grows too large (serverless cold starts reset it anyway)
  if (recentRequests.size > MAX_RATE_LIMIT_ENTRIES) {
    const oldest = recentRequests.keys().next().value;
    if (oldest) recentRequests.delete(oldest);
  }

  const admin = createAdminClient();

  // Try to create the user — if they already exist, the error tells us and we proceed.
  // This replaces the previous listUsers() call which fetched ALL users on every sign-in.
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (createError && !createError.message.includes("already been registered")) {
    console.error("Failed to create user:", createError.message);
    return NextResponse.json(
      { error: "could not process sign-in. try again." },
      { status: 500 },
    );
  }

  // Now send OTP via a regular (anon-key) client.
  // Since the user exists (either already or just created), GoTrue
  // will treat this as a login and send the magic link email.
  const redirectTo =
    process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
      : `${request.headers.get("origin") || "https://launchpad.bonfire.tools"}/auth/callback`;

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error: otpError } = await anonClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });

  if (otpError) {
    console.error("Failed to send magic link:", otpError.message);
    return NextResponse.json(
      { error: "could not send magic link. try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
