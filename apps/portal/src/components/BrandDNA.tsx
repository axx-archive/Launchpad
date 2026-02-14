"use client";

import type { BrandAnalysis } from "@/types/database";

const STYLE_LABELS: Record<string, string> = {
  "modern-minimal": "modern minimal",
  "classic-elegant": "classic elegant",
  "bold-energetic": "bold energetic",
  "corporate-professional": "corporate professional",
  "playful-creative": "playful creative",
  "tech-forward": "tech forward",
  "luxury-refined": "luxury refined",
  "organic-natural": "organic natural",
};

function ColorSwatch({ hex, label }: { hex: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-5 h-5 rounded-[2px] border border-white/10 shrink-0"
        style={{ backgroundColor: hex }}
        title={hex}
      />
      <div className="min-w-0">
        <span className="font-mono text-[10px] text-text-muted/70 block">{label}</span>
        <span className="font-mono text-[11px] text-text">{hex}</span>
      </div>
    </div>
  );
}

export default function BrandDNA({ analysis }: { analysis: BrandAnalysis }) {
  const { colors, fonts, style_direction, logo_notes } = analysis;
  const styleLabel = STYLE_LABELS[style_direction] ?? style_direction;

  // Collect non-null colors
  const colorEntries: { hex: string; label: string }[] = [];
  if (colors.primary) colorEntries.push({ hex: colors.primary, label: "primary" });
  if (colors.secondary) colorEntries.push({ hex: colors.secondary, label: "secondary" });
  if (colors.accent) colorEntries.push({ hex: colors.accent, label: "accent" });
  if (colors.background) colorEntries.push({ hex: colors.background, label: "background" });
  if (colors.text) colorEntries.push({ hex: colors.text, label: "text" });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[2px] uppercase text-accent/70">
          brand dna
        </span>
        <span className="font-mono text-[9px] text-text-muted/70">
          {analysis.asset_count} asset{analysis.asset_count !== 1 ? "s" : ""} analyzed
        </span>
      </div>

      {/* Colors */}
      {colorEntries.length > 0 && (
        <div>
          <span className="font-mono text-[10px] text-text-muted/70 block mb-1.5">colors</span>
          <div className="grid grid-cols-2 gap-2">
            {colorEntries.map(({ hex, label }) => (
              <ColorSwatch key={label} hex={hex} label={label} />
            ))}
          </div>
        </div>
      )}

      {/* Fonts */}
      {(fonts.heading || fonts.body) && (
        <div>
          <span className="font-mono text-[10px] text-text-muted/70 block mb-1">typography</span>
          <div className="space-y-0.5">
            {fonts.heading && (
              <p className="font-mono text-[11px] text-text">
                <span className="text-text-muted/70">heading: </span>
                {fonts.heading}
              </p>
            )}
            {fonts.body && (
              <p className="font-mono text-[11px] text-text">
                <span className="text-text-muted/70">body: </span>
                {fonts.body}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Style direction */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-text-muted/70">style:</span>
        <span className="font-mono text-[10px] text-accent px-1.5 py-0.5 rounded-[2px] bg-accent/10 border border-accent/20">
          {styleLabel}
        </span>
      </div>

      {/* Logo notes */}
      {logo_notes && (
        <p className="font-mono text-[10px] text-text-muted/70 leading-relaxed">
          {logo_notes}
        </p>
      )}
    </div>
  );
}
