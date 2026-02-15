import TerminalChrome from "@/components/TerminalChrome";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-[540px]">
        <TerminalChrome title="spark — 404">
          <p className="text-text font-mono text-[clamp(20px,3vw,28px)] font-light mb-6">
            not found.
          </p>
          <p className="text-text-muted mb-8">
            there's nothing at this address. it may have been moved or removed.
          </p>
          <a
            href="/dashboard"
            className="bg-transparent border-0 text-text font-mono text-inherit transition-colors hover:text-accent leading-[2]"
          >
            <span className="text-accent">$ </span>back to mission control
            <span className="inline-block w-2 h-4 bg-accent align-text-bottom ml-0.5 animate-[blink_1s_step-end_infinite]" />
          </a>
        </TerminalChrome>
      </div>
    </div>
  );
}
