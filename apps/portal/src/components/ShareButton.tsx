export default function ShareButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="font-mono text-[12px] text-accent border border-accent/20 px-4 py-2 rounded-[3px] hover:border-accent/50 hover:bg-accent/5 transition-all tracking-[0.5px] cursor-pointer"
      aria-label="Share project"
    >
      share
    </button>
  );
}
