"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    const supabase = createClient();

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
            router.replace("/dashboard");
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
          router.replace("/dashboard");
          return;
        }
      }

      // 3. Check if already authenticated
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        router.replace("/dashboard");
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
