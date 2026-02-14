"use client";

import type { EntityType } from "@/types/intelligence";

const ENTITY_ICONS: Record<EntityType, string> = {
  person: "\u{1F464}",   // 👤
  brand: "\u2606",       // ☆
  product: "\u25A0",     // ■
  event: "\u26A1",       // ⚡
  place: "\u25C9",       // ◉
};

const ENTITY_STYLES: Record<EntityType, string> = {
  person: "text-[#4D8EFF]/70 border-[#4D8EFF]/15 hover:border-[#4D8EFF]/30",
  brand: "text-accent/70 border-accent/15 hover:border-accent/30",
  product: "text-[#8B9A6B]/70 border-[#8B9A6B]/15 hover:border-[#8B9A6B]/30",
  event: "text-[#ef4444]/70 border-[#ef4444]/15 hover:border-[#ef4444]/30",
  place: "text-text-muted/70 border-white/[0.1] hover:border-white/[0.2]",
};

interface EntityTagProps {
  name: string;
  entityType: EntityType;
  signalCount?: number;
  href?: string;
  onClick?: () => void;
}

export default function EntityTag({
  name,
  entityType,
  signalCount,
  href,
  onClick,
}: EntityTagProps) {
  const icon = ENTITY_ICONS[entityType] ?? "";
  const style = ENTITY_STYLES[entityType] ?? ENTITY_STYLES.place;

  const content = (
    <>
      <span className="text-[9px]">{icon}</span>
      <span className="truncate max-w-[120px]">{name}</span>
      {signalCount !== undefined && signalCount > 0 && (
        <span className="text-text-muted/40">{signalCount}</span>
      )}
    </>
  );

  const className = `inline-flex items-center gap-1.5 font-mono text-[10px] px-2 py-0.5 rounded-[2px] border transition-colors ${style}`;

  if (href) {
    return (
      <a href={href} className={className}>
        {content}
      </a>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} cursor-pointer`}>
        {content}
      </button>
    );
  }

  return (
    <span className={className}>
      {content}
    </span>
  );
}
