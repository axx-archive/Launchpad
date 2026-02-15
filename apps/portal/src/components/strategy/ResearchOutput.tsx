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

/* ─── Content block types for the rich renderer ─── */

type ContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "blockquote"; text: string }
  | { type: "bullet-list"; items: string[] }
  | { type: "numbered-list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "code-block"; content: string }
  | { type: "sub-header"; text: string }
  | { type: "hr" };

/* ─── AI artifact detection & stripping ─── */

const AI_NARRATION_PATTERNS = [
  /^(I'll|I've|I will|Let me|Now let me|Now I'll|Now I will)\s/i,
  /^(I need to|I should|I can)\s/i,
  /^(Excellent|Perfect|Great|Sure|Certainly|Of course|Absolutely)[.!]?\s*$/i,
  /^(Here's what|Here('s| is| are) (the|a|an|my|our|your))\s/i,
  /^(Based on (the|my|our) (analysis|research|review|findings))/i,
  /^(Moving on|Turning to|In conclusion|To summarize|Now let's|Next,)\s/i,
];

function isAINarration(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return AI_NARRATION_PATTERNS.some((p) => p.test(trimmed));
}

/** Returns true for lines that are empty bullets or standalone bullet chars */
function isEmptyBullet(line: string): boolean {
  const trimmed = line.trim();
  // Standalone bullet char (-, *, •) or empty bullet "- " with no content
  return /^[-*•]\s*$/.test(trimmed);
}

function stripAIArtifacts(content: string): string {
  return content
    .split("\n")
    .filter((line) => !isAINarration(line) && !isEmptyBullet(line))
    .join("\n");
}

/* ─── Section parser ─── */

function parseResearchSections(content: string): { summary: string; sections: ParsedSection[] } {
  // Strip everything before the first # or ## header (AI preamble)
  const headerIndex = content.search(/^#{1,2}\s+/m);
  let cleaned = headerIndex > 0 ? content.slice(headerIndex) : content;

  // Strip AI narration lines throughout
  cleaned = stripAIArtifacts(cleaned);

  const lines = cleaned.split("\n");
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
    const firstParaEnd = cleaned.indexOf("\n\n");
    if (firstParaEnd > 0 && firstParaEnd < 500) {
      summary = cleaned.slice(0, firstParaEnd).trim();
    }
    sections.push({
      title: "Research Output",
      content: cleaned,
      isKeyFindings: false,
      isNarrativeOpps: false,
    });
  }

  return { summary, sections };
}

/* ─── Block parser: line-by-line grouping into typed blocks ─── */

function parseContentBlocks(text: string): ContentBlock[] {
  const lines = text.split("\n");
  const blocks: ContentBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Skip empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      blocks.push({ type: "code-block", content: codeLines.join("\n") });
      continue;
    }

    // Horizontal rule (---, ***, ___ with 3+ chars, standalone)
    if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Sub-header (### or deeper)
    const subHeaderMatch = trimmed.match(/^#{3,}\s+(.+)$/);
    if (subHeaderMatch) {
      blocks.push({ type: "sub-header", text: subHeaderMatch[1] });
      i++;
      continue;
    }

    // Table (lines starting with |)
    if (trimmed.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      if (tableLines.length >= 2) {
        const parseRow = (row: string) =>
          row
            .replace(/^\||\|$/g, "")
            .split("|")
            .map((cell) => cell.trim());

        const headers = parseRow(tableLines[0]);
        const isSeparator = (l: string) => /^\|[\s\-:|]+\|$/.test(l);
        const dataStart = isSeparator(tableLines[1]) ? 2 : 1;
        const rows = tableLines.slice(dataStart).map(parseRow);

        blocks.push({ type: "table", headers, rows });
      }
      continue;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoteLines.push(lines[i].trim().replace(/^>\s*/, ""));
        i++;
      }
      blocks.push({ type: "blockquote", text: quoteLines.join(" ") });
      continue;
    }

    // Bullet list
    if (/^[-*]\s/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "bullet-list", items });
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "numbered-list", items });
      continue;
    }

    // Regular paragraph — collect lines until empty or special block start
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("|") &&
      !lines[i].trim().startsWith("```") &&
      !/^#{3,}\s/.test(lines[i].trim()) &&
      !/^[-*]\s/.test(lines[i].trim()) &&
      !/^\d+\.\s/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("> ") &&
      !/^[-*_]{3,}$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", text: paraLines.join(" ") });
    }
  }

  return blocks;
}

/* ─── Inline formatting ─── */

/** Handle **bold**, `code`, and [link](url) inline formatting */
function renderInlineFormatting(text: string): React.ReactNode {
  // Split on **bold**, `code`, and [text](url) markers
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-text">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="font-mono text-[13px] text-[#8B9A6B] bg-white/[0.04] px-1.5 py-0.5 rounded"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={i}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#8B9A6B] hover:text-[#8B9A6B]/80 underline underline-offset-2 decoration-[#8B9A6B]/30 transition-colors"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return part;
  });
}

/* ─── Markdown table component with collapse for large tables ─── */

function MarkdownTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const [expanded, setExpanded] = useState(false);
  const isLarge = rows.length > 10;
  const visibleRows = isLarge && !expanded ? rows.slice(0, 10) : rows;

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[#8B9A6B]/15">
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 font-mono text-[11px] text-text-muted font-medium tracking-[1px] uppercase bg-white/[0.03]"
              >
                {renderInlineFormatting(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, ri) => (
            <tr
              key={ri}
              className={`border-b border-border last:border-0 ${ri % 2 === 0 ? "bg-white/[0.02]" : ""}`}
            >
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-[13px] text-text/85">
                  {renderInlineFormatting(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {isLarge && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full py-2 text-[11px] font-mono text-[#8B9A6B]/70 hover:text-[#8B9A6B] transition-colors bg-white/[0.02] border-t border-border cursor-pointer"
        >
          show all {rows.length} rows
        </button>
      )}
      {isLarge && expanded && (
        <button
          onClick={() => setExpanded(false)}
          className="w-full py-2 text-[11px] font-mono text-text-muted/50 hover:text-text-muted/70 transition-colors bg-white/[0.02] border-t border-border cursor-pointer"
        >
          collapse
        </button>
      )}
    </div>
  );
}

/* ─── Rich content renderer (block-aware) ─── */

/** Render markdown-ish content to styled HTML-safe JSX */
function RichContent({ text }: { text: string }) {
  const blocks = useMemo(() => parseContentBlocks(text), [text]);

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "paragraph":
            return (
              <p key={i} className="text-[14px] text-text/90 leading-relaxed">
                {renderInlineFormatting(block.text)}
              </p>
            );

          case "blockquote":
            return (
              <blockquote
                key={i}
                className="border-l-2 border-[#8B9A6B]/30 pl-4 text-[14px] text-text/80 italic leading-relaxed"
              >
                {block.text}
              </blockquote>
            );

          case "bullet-list":
            return (
              <ul key={i} className="space-y-1.5 ml-1">
                {block.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2 text-[14px] text-text/90 leading-relaxed">
                    <span className="text-[#8B9A6B]/60 mt-1.5 text-[8px]">&#9670;</span>
                    <span>{renderInlineFormatting(item)}</span>
                  </li>
                ))}
              </ul>
            );

          case "numbered-list":
            return (
              <ol key={i} className="space-y-1.5 ml-1">
                {block.items.map((item, j) => (
                  <li
                    key={j}
                    className="flex items-start gap-2.5 text-[14px] text-text/90 leading-relaxed"
                  >
                    <span className="font-mono text-[11px] text-[#8B9A6B]/70 mt-[3px] min-w-[16px] text-right">
                      {j + 1}.
                    </span>
                    <span>{renderInlineFormatting(item)}</span>
                  </li>
                ))}
              </ol>
            );

          case "table":
            return <MarkdownTable key={i} headers={block.headers} rows={block.rows} />;

          case "code-block":
            return (
              <div
                key={i}
                className="bg-white/[0.03] border border-white/[0.06] rounded-md px-4 py-3 overflow-x-auto"
              >
                <pre className="font-mono text-[12px] text-text/80 whitespace-pre-wrap leading-relaxed">
                  {block.content}
                </pre>
              </div>
            );

          case "sub-header":
            return (
              <h4
                key={i}
                className="font-display text-[15px] font-medium text-text/90 mt-5 mb-2"
              >
                {renderInlineFormatting(block.text)}
              </h4>
            );

          case "hr":
            return <hr key={i} className="border-t border-border my-4" />;

          default:
            return null;
        }
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
