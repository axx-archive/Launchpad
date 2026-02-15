"use client";

import { useState, useMemo } from "react";
import type { ProjectResearch } from "@/types/strategy";
import ResearchQualityScores from "@/components/strategy/ResearchQualityScores";

const TYPE_LABELS: Record<string, string> = {
  market: "market research",
  competitive: "competitive analysis",
  trend: "trend analysis",
  custom: "custom research",
};

interface ResearchOutputProps {
  research: ProjectResearch;
}

interface ParsedSection {
  title: string;
  content: string;
  isKeyFindings: boolean;
  isNarrativeOpps: boolean;
}

function parseResearchSections(content: string): { summary: string; sections: ParsedSection[] } {
  const lines = content.split("\n");
  let summary = "";
  const sections: ParsedSection[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    // Match ## headers (section headers in the polished output)
    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch) {
      // Save previous section
      if (currentTitle) {
        const sectionContent = currentLines.join("\n").trim();
        if (currentTitle.toLowerCase().includes("executive summary")) {
          summary = sectionContent;
        }
        sections.push({
          title: currentTitle,
          content: sectionContent,
          isKeyFindings: currentTitle.toLowerCase().includes("key finding"),
          isNarrativeOpps: currentTitle.toLowerCase().includes("narrative opportunit"),
        });
      }
      currentTitle = headerMatch[1];
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Last section
  if (currentTitle) {
    const sectionContent = currentLines.join("\n").trim();
    if (currentTitle.toLowerCase().includes("executive summary")) {
      summary = sectionContent;
    }
    sections.push({
      title: currentTitle,
      content: sectionContent,
      isKeyFindings: currentTitle.toLowerCase().includes("key finding"),
      isNarrativeOpps: currentTitle.toLowerCase().includes("narrative opportunit"),
    });
  }

  // If no sections parsed (unstructured content), create a single section
  if (sections.length === 0) {
    // Try to extract first paragraph as summary
    const firstParaEnd = content.indexOf("\n\n");
    if (firstParaEnd > 0 && firstParaEnd < 500) {
      summary = content.slice(0, firstParaEnd).trim();
    }
    sections.push({
      title: "Research Output",
      content: content,
      isKeyFindings: false,
      isNarrativeOpps: false,
    });
  }

  return { summary, sections };
}

/** Handle **bold** and other inline formatting */
function renderInlineFormatting(text: string): React.ReactNode {
  // Split on **bold** markers
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-text">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

/** Render markdown-ish content to styled HTML-safe JSX */
function RichContent({ text }: { text: string }) {
  const paragraphs = text.split("\n\n").filter(Boolean);

  return (
    <div className="space-y-3">
      {paragraphs.map((para, i) => {
        const trimmed = para.trim();

        // Blockquote
        if (trimmed.startsWith("> ")) {
          const quoteText = trimmed.replace(/^>\s*/gm, "");
          return (
            <blockquote
              key={i}
              className="border-l-2 border-[#8B9A6B]/30 pl-4 text-[14px] text-text/80 italic leading-relaxed"
            >
              {quoteText}
            </blockquote>
          );
        }

        // Bullet list
        if (trimmed.match(/^[-*]\s/m)) {
          const items = trimmed.split("\n").filter((l) => l.match(/^[-*]\s/));
          return (
            <ul key={i} className="space-y-1.5 ml-1">
              {items.map((item, j) => (
                <li key={j} className="flex items-start gap-2 text-[14px] text-text/90 leading-relaxed">
                  <span className="text-[#8B9A6B]/60 mt-1.5 text-[8px]">&#9670;</span>
                  <span>{renderInlineFormatting(item.replace(/^[-*]\s+/, ""))}</span>
                </li>
              ))}
            </ul>
          );
        }

        // Regular paragraph
        return (
          <p key={i} className="text-[14px] text-text/90 leading-relaxed">
            {renderInlineFormatting(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function CollapsibleSection({ section, defaultOpen }: { section: ParsedSection; defaultOpen: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Narrative opportunities get warm-tinted cards
  if (section.isNarrativeOpps) {
    return (
      <div className="border border-accent/15 rounded-lg overflow-hidden bg-accent/[0.03]">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-accent/[0.04] transition-colors cursor-pointer"
        >
          <h3 className="font-display text-[clamp(16px,2vw,20px)] font-light text-accent tracking-[0.5px]">
            {section.title}
          </h3>
          <span className="font-mono text-[10px] text-accent/50">
            {isOpen ? "collapse" : "expand"}
          </span>
        </button>
        {isOpen && (
          <div className="px-5 pb-5 border-t border-accent/10">
            <div className="pt-4">
              <RichContent text={section.content} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Key findings get accent-bordered treatment
  if (section.isKeyFindings) {
    return (
      <div className="border border-[#8B9A6B]/20 rounded-lg overflow-hidden">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#8B9A6B]/[0.04] transition-colors cursor-pointer"
        >
          <h3 className="font-display text-[clamp(16px,2vw,20px)] font-light text-[#8B9A6B] tracking-[0.5px]">
            {section.title}
          </h3>
          <span className="font-mono text-[10px] text-[#8B9A6B]/50">
            {isOpen ? "collapse" : "expand"}
          </span>
        </button>
        {isOpen && (
          <div className="px-5 pb-5 border-t border-[#8B9A6B]/10">
            <div className="pt-4">
              <RichContent text={section.content} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Standard sections
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors cursor-pointer"
      >
        <h3 className="font-display text-[clamp(16px,2vw,20px)] font-light text-text tracking-[0.5px]">
          {section.title}
        </h3>
        <span className="font-mono text-[10px] text-text-muted/50">
          {isOpen ? "collapse" : "expand"}
        </span>
      </button>
      {isOpen && (
        <div className="px-5 pb-5 border-t border-border">
          <div className="pt-4">
            <RichContent text={section.content} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResearchOutput({ research }: ResearchOutputProps) {
  const readTimeMinutes = Math.max(1, Math.ceil(research.content.split(/\s+/).length / 200));
  const { summary, sections } = useMemo(() => parseResearchSections(research.content), [research.content]);
  const isPolished = research.is_polished;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[11px] tracking-[4px] lowercase text-[#8B9A6B]">
            research output
          </p>
          <p className="text-[13px] text-text-muted mt-0.5">
            {TYPE_LABELS[research.research_type] ?? research.research_type}
            {isPolished && " — polished"}
            {" — ready for review."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isPolished && (
            <span className="font-mono text-[10px] text-[#8B9A6B]/70 border border-[#8B9A6B]/20 px-2 py-0.5 rounded-[3px]">
              polished
            </span>
          )}
          <span className="font-mono text-[10px] tracking-[1px] text-text-muted/50">
            v{research.version}
          </span>
        </div>
      </div>

      {/* Quality scores (when available) */}
      {research.quality_scores && (
        <div className="bg-bg-card border border-border rounded-lg p-5">
          <ResearchQualityScores scores={research.quality_scores} />
        </div>
      )}

      {/* TL;DR Summary card */}
      {summary && (
        <div className="bg-bg-card border border-[#8B9A6B]/15 rounded-lg p-5">
          <p className="font-mono text-[10px] tracking-[3px] uppercase text-[#8B9A6B]/60 mb-3">
            tl;dr
          </p>
          <div className="text-[15px] text-text leading-relaxed">
            <RichContent text={summary} />
          </div>
        </div>
      )}

      {/* Sections — collapsible */}
      <div className="space-y-3">
        {sections
          .filter((s) => !s.title.toLowerCase().includes("executive summary"))
          .map((section, i) => (
            <CollapsibleSection
              key={i}
              section={section}
              defaultOpen={i < 3 || section.isKeyFindings || section.isNarrativeOpps}
            />
          ))}
      </div>

      {/* Footer bar */}
      <div className="bg-bg-card border border-border rounded-lg px-5 py-3">
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
          {isPolished && research.quality_scores?.overall && (
            <>
              <span className="text-text-muted/20">&middot;</span>
              <p className="font-mono text-[10px] text-[#8B9A6B]/60">
                quality: {research.quality_scores.overall}/10
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
