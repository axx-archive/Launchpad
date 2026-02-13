"use client";

import type { ProjectNarrative } from "@/types/database";
import { formatBriefMarkdown } from "@/lib/format";

interface NarrativePreviewProps {
  narrative: ProjectNarrative;
}

export default function NarrativePreview({ narrative }: NarrativePreviewProps) {
  const sections = narrative.sections;
  const readTimeMinutes = Math.max(1, Math.ceil(narrative.content.split(/\s+/).length / 200));

  return (
    <div>
      <div className="mb-4">
        <p className="font-mono text-[11px] tracking-[4px] lowercase text-accent mb-1">
          narrative
        </p>
        <p className="text-[13px] text-text-muted">
          your story arc, ready for review.
        </p>
      </div>

      <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
        <div className="max-h-[70vh] overflow-y-auto p-6">
          {sections && sections.length > 0 ? (
            <div className="space-y-4">
              {sections.map((section) => (
                <div
                  key={section.number}
                  className="border border-white/[0.06] rounded-lg p-6"
                >
                  <p className="font-mono text-[10px] tracking-[3px] uppercase text-accent/70 mb-3">
                    {String(section.number).padStart(2, "0")} &mdash; {section.label}
                  </p>
                  <h3 className="font-display text-[clamp(18px,2.5vw,24px)] font-light text-text mb-3 leading-snug">
                    {section.headline}
                  </h3>
                  <p className="text-[13px] text-text-muted leading-relaxed">
                    {section.body}
                  </p>
                  {section.emotional_beat && (
                    <p className="font-mono text-[10px] text-accent/50 mt-3">
                      {section.emotional_beat}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div
              className="text-[13px] text-text leading-relaxed edit-brief-content"
              dangerouslySetInnerHTML={{
                __html: formatBriefMarkdown(narrative.content),
              }}
            />
          )}
        </div>

        <div className="px-6 py-3 border-t border-border">
          <p className="font-mono text-[10px] text-text-muted/50">
            {sections ? `${sections.length} sections` : "raw narrative"} &middot; ~{readTimeMinutes} min read
            {narrative.version > 1 && ` \u00b7 v${narrative.version}`}
          </p>
        </div>
      </div>
    </div>
  );
}
