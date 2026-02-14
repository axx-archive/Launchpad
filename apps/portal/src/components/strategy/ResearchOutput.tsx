"use client";

import type { ProjectResearch } from "@/types/strategy";
import { formatBriefMarkdown } from "@/lib/format";

const TYPE_LABELS: Record<string, string> = {
  market: "market research",
  competitive: "competitive analysis",
  trend: "trend analysis",
  custom: "custom research",
};

interface ResearchOutputProps {
  research: ProjectResearch;
}

export default function ResearchOutput({ research }: ResearchOutputProps) {
  const readTimeMinutes = Math.max(1, Math.ceil(research.content.split(/\s+/).length / 200));

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <p className="font-mono text-[11px] tracking-[4px] lowercase text-[#8B9A6B]">
            research output
          </p>
          <span className="font-mono text-[10px] tracking-[1px] text-text-muted/50">
            v{research.version}
          </span>
        </div>
        <p className="text-[13px] text-text-muted">
          {TYPE_LABELS[research.research_type] ?? research.research_type} — ready for review.
        </p>
      </div>

      <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
        <div className="max-h-[70vh] overflow-y-auto p-6">
          <div
            className="text-[13px] text-text leading-relaxed edit-brief-content"
            dangerouslySetInnerHTML={{
              __html: formatBriefMarkdown(research.content),
            }}
          />
        </div>

        <div className="px-6 py-3 border-t border-border">
          <div className="flex items-center gap-3">
            <p className="font-mono text-[10px] text-text-muted/70">
              ~{readTimeMinutes} min read
              {research.version > 1 && ` \u00b7 v${research.version}`}
            </p>
            {research.trend_cluster_ids.length > 0 && (
              <>
                <span className="text-text-muted/20">&middot;</span>
                <p className="font-mono text-[10px] text-[#8B9A6B]/60">
                  {research.trend_cluster_ids.length} linked trend{research.trend_cluster_ids.length !== 1 ? "s" : ""}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
