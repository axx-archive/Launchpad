export default function TerminalChrome({
  title,
  children,
  className = "",
  headerActions,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border border-border overflow-hidden bg-bg/85 backdrop-blur-xl ${className}`}
    >
      <div className="flex items-center gap-3 px-4 py-3 bg-white/[0.04] border-b border-white/[0.06]">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="font-mono text-[11px] text-text-muted tracking-[0.5px] flex-1">
          {title}
        </span>
        {headerActions}
      </div>
      <div className="p-6 font-mono text-[clamp(12px,1.4vw,14px)] leading-[2]">
        {children}
      </div>
    </div>
  );
}
