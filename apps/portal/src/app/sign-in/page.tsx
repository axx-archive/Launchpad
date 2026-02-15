"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import TerminalChrome from "@/components/TerminalChrome";

/** Server-side sign-in — bypasses GoTrue's public signup restriction */
async function serverSignIn(email: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error ?? "sign-in failed" };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "request timed out. try again." };
    }
    return { ok: false, error: "network error. check your connection." };
  }
}

type SignInState = "input" | "sending" | "sent" | "error";

function SignInForm() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<SignInState>("input");
  const [email, setEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    const error = searchParams.get("error");
    if (error === "auth_failed") {
      setErrorMsg("this link has expired. request a new one.");
      setState("error");
    } else if (error === "access_denied") {
      setErrorMsg("access restricted. your email is not authorized for spark.");
      setState("error");
      // Clear the unauthorized session
      supabase.auth.signOut();
    }
  }, [searchParams, supabase]);

  useEffect(() => {
    if (state === "input" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [state]);

  function validateEmail(e: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateEmail(email)) {
      setErrorMsg("that doesn't look like an email.");
      setState("error");
      return;
    }

    setState("sending");

    const result = await serverSignIn(email);

    if (!result.ok) {
      const msg = (result.error ?? "").toLowerCase();
      if (msg.includes("too many")) {
        setErrorMsg("too many attempts. try again in a minute.");
      } else {
        setErrorMsg(result.error ?? "sign-in failed. try again.");
      }
      setState("error");
      return;
    }

    setSentEmail(email);
    setState("sent");
  }

  function handleRetry() {
    setEmail("");
    setErrorMsg("");
    setState("input");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-[540px]">
        <TerminalChrome title="spark — authenticate">
          {/* INPUT STATE */}
          {(state === "input" || state === "sending") && (
            <form onSubmit={handleSubmit}>
              <p className="text-text font-display text-[clamp(24px,3vw,32px)] font-light mb-6">
                mission control
              </p>
              <p className="text-text-muted mb-8">
                sign in to access your spark projects.
              </p>

              <div className="flex items-center gap-0 mb-4 flex-wrap">
                <label className="text-text-muted whitespace-nowrap cursor-default">
                  <span className="text-accent">$ </span>email:
                </label>
                <input
                  ref={inputRef}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="flex-1 min-w-[180px] bg-transparent border-0 border-b border-accent/10 text-text font-mono text-inherit leading-[2] px-2 outline-none transition-colors focus:border-b-accent placeholder:text-text-muted/40"
                  disabled={state === "sending"}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="mt-6 pt-4 border-t border-white/[0.04]">
                <button
                  type="submit"
                  disabled={state === "sending"}
                  className="bg-transparent border-0 text-text font-mono text-inherit cursor-pointer p-0 transition-colors hover:text-accent disabled:opacity-50 disabled:cursor-default leading-[2]"
                >
                  <span className="text-accent">$ </span>
                  {state === "sending" ? "authenticating..." : "spark --authenticate"}
                  {state !== "sending" && (
                    <span className="inline-block w-2 h-4 bg-accent align-text-bottom ml-0.5 animate-[blink_1s_step-end_infinite]" />
                  )}
                </button>
              </div>
            </form>
          )}

          {/* SENT STATE */}
          {state === "sent" && (
            <div>
              <p className="text-text font-display text-[clamp(24px,3vw,32px)] font-light mb-6">
                check your inbox.
              </p>
              <p className="text-text-muted mb-2">
                we sent a magic link to{" "}
                <span className="text-accent-light">{sentEmail}</span>.
              </p>
              <p className="text-text-muted mb-8">
                click it to sign in — no password needed.
              </p>
              <p className="text-text-muted/70 mb-4">
                didn't get it? check spam, or try again.
              </p>
              <button
                onClick={handleRetry}
                className="bg-transparent border-0 text-accent font-mono text-inherit cursor-pointer p-0 transition-colors hover:text-accent-light border-b border-accent/30 hover:border-accent leading-[2]"
              >
                send another link
              </button>
            </div>
          )}

          {/* ERROR STATE */}
          {state === "error" && (
            <div>
              <p className="text-text font-display text-[clamp(24px,3vw,32px)] font-light mb-6">
                mission control
              </p>
              <p className="text-error mb-6">{errorMsg}</p>
              <button
                onClick={handleRetry}
                className="bg-transparent border-0 text-text font-mono text-inherit cursor-pointer p-0 transition-colors hover:text-accent leading-[2]"
              >
                <span className="text-accent">$ </span>request a new link
                <span className="inline-block w-2 h-4 bg-accent align-text-bottom ml-0.5 animate-[blink_1s_step-end_infinite]" />
              </button>
            </div>
          )}
        </TerminalChrome>

        <p className="text-center mt-12 font-mono text-[10px] tracking-[2px] lowercase text-text-muted/70">
          spark by bonfire labs
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="w-full max-w-[540px]">
            <TerminalChrome title="spark — authenticate">
              <p className="text-text-muted">loading...</p>
            </TerminalChrome>
          </div>
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  );
}

