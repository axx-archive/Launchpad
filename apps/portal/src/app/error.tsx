"use client";

import TerminalChrome from "@/components/TerminalChrome";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-[540px]">
        <TerminalChrome title="launchpad — error">
          <p className="text-text font-mono text-[clamp(20px,3vw,28px)] font-light mb-6">
            something went wrong.
          </p>
          <p className="text-text-muted mb-8">
            an unexpected error occurred. try again or head back to the
            dashboard.
          </p>
          <div className="flex items-center gap-6">
            <button
              onClick={reset}
              className="bg-transparent border-0 text-text font-mono text-inherit cursor-pointer p-0 transition-colors hover:text-accent leading-[2]"
            >
              <span className="text-accent">$ </span>retry
              <span className="inline-block w-2 h-4 bg-accent align-text-bottom ml-0.5 animate-[blink_1s_step-end_infinite]" />
            </button>
            <a
              href="/dashboard"
              className="text-text-muted font-mono text-inherit transition-colors hover:text-accent leading-[2]"
            >
              go to dashboard
            </a>
          </div>
        </TerminalChrome>
      </div>
    </div>
  );
}
