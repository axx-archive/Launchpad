"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * After successful auth, call the auto-accept endpoint to convert any
 * pending project invitations into active memberships. This runs
 * server-side via API route using the admin client, so RLS isn't an issue.
 * Failures are swallowed — invitation processing must never block sign-in.
 */
async function processInvitations(): Promise<void> {
  try {
    await fetch("/api/invitations/auto-accept", { method: "POST" });
  } catch {
    // Silently ignore — don't block sign-in if auto-accept fails
  }
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // Determine where to redirect after auth — respects ?redirect= param
    const searchParams = new URLSearchParams(window.location.search);
    const redirectTo = searchParams.get("redirect") || "/dashboard";

    async function handleAuth() {
      // 1. Check for hash fragment tokens (implicit flow)
      const hash = window.location.hash;
      if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (!error) {
            await processInvitations();
            router.replace(redirectTo);
            return;
          }
        }
      }

      // 2. Check for PKCE code in query params (fallback)
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          await processInvitations();
          router.replace(redirectTo);
          return;
        }
      }

      // 3. Check if already authenticated
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await processInvitations();
        router.replace(redirectTo);
        return;
      }

      // Nothing worked
      setError(true);
    }

    handleAuth();
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-text font-mono text-lg mb-4">
            authentication failed
          </p>
          <p className="text-text-muted mb-6">
            the link may have expired. request a new one.
          </p>
          <a
            href="/sign-in"
            className="text-accent font-mono hover:text-accent-light transition-colors"
          >
            $ back to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center">
        <p className="text-text-muted font-mono">authenticating...</p>
      </div>
    </div>
  );
}
