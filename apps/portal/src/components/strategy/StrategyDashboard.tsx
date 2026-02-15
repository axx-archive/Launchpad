"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import ResearchCard from "@/components/strategy/ResearchCard";
import ToastContainer from "@/components/Toast";
import CrossDeptStrip from "@/components/CrossDeptStrip";
import TerminalChrome from "@/components/TerminalChrome";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import type { Project, ProjectStatus, Department } from "@/types/database";
import { STATUS_LABELS } from "@/types/database";

type StatusFilter = "all" | ProjectStatus;

const FILTER_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "all" },
  { key: "research_queued", label: STATUS_LABELS.research_queued },
  { key: "researching", label: STATUS_LABELS.researching },
  { key: "research_review", label: STATUS_LABELS.research_review },
  { key: "research_complete", label: STATUS_LABELS.research_complete },
];

interface ProvenanceData {
  [projectId: string]: { department: Department; label: string; href?: string }[];
}

export default function StrategyDashboard({
  projects,
  isAdmin,
  provenance = {},
}: {
  projects: Project[];
  isAdmin: boolean;
  provenance?: ProvenanceData;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [liveProjects, setLiveProjects] = useState<Project[]>(projects);

  const mergeProject = useCallback((updated: Partial<Project> & { id: string }) => {
    setLiveProjects((prev) => {
      const idx = prev.findIndex((p) => p.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...updated };
        return next;
      }
      // New strategy project appeared — add it
      if ((updated as Project).department === "strategy") {
        return [updated as Project, ...prev];
      }
      return prev;
    });
  }, []);

  const projectIds = liveProjects.map((p) => p.id);
  useRealtimeSubscription({
    table: "projects",
    events: ["UPDATE", "INSERT"],
    enabled: true,
    onEvent: (payload) => {
      const updated = payload.new as Project | undefined;
      if (!updated?.id) return;
      if (updated.department !== "strategy") return;
      mergeProject(updated);
    },
  });

  const filtered = useMemo(() => {
    let result = liveProjects;

    if (statusFilter !== "all") {
      result = result.filter((p) => p.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.company_name.toLowerCase().includes(q) ||
          p.project_name.toLowerCase().includes(q)
      );
    }

    return result.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [liveProjects, statusFilter, search]);

  return (
    <>
      <Nav sectionLabel="strategy &mdash; research lab" isAdmin={isAdmin} />
      <ToastContainer />
      <CrossDeptStrip currentDepartment="strategy" />

      <main id="main-content" className="min-h-screen pt-24 px-[clamp(24px,5vw,64px)] pb-16 page-enter">
        <div className="max-w-[1120px] mx-auto">
          {/* Header */}
          <div className="mb-12">
            <div className="flex items-center justify-between mb-7">
              <h1 className="font-display text-[clamp(24px,3vw,32px)] font-light text-text lowercase tracking-[1px]">
                research lab
              </h1>
              <Link
                href="/strategy/new"
                className="font-mono text-[12px] text-[#8B9A6B] border border-[rgba(139,154,107,0.2)] px-4 py-2 rounded-[3px] hover:border-[rgba(139,154,107,0.5)] hover:bg-[rgba(139,154,107,0.05)] transition-all tracking-[0.5px]"
              >
                + new research
              </Link>
            </div>
            <p className="font-mono text-[13px] text-text-muted tracking-[0.5px]">
              {liveProjects.length === 0
                ? "no active research projects"
                : (
                  <>
                    {liveProjects.length} research project{liveProjects.length !== 1 ? "s" : ""}
                  </>
                )}
            </p>
          </div>

          {/* Search & Filter */}
          {liveProjects.length > 0 && (
            <div className="mb-8 space-y-4">
              {/* Status filter tabs */}
              <div className="flex flex-wrap gap-1.5">
                {FILTER_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setStatusFilter(tab.key)}
                    className={`font-mono text-[11px] px-3 py-1.5 rounded-[3px] border transition-all cursor-pointer tracking-[0.5px] ${
                      statusFilter === tab.key
                        ? "border-accent/30 bg-accent/10 text-accent"
                        : "border-white/6 text-text-muted/70 hover:border-white/12 hover:text-text-muted"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search input */}
              <div className="flex items-center gap-0 rounded-[3px] border border-white/8 bg-bg-card px-3 py-2 focus-within:border-accent/30 transition-colors">
                <span className="text-accent text-[12px] select-none">$ </span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="search research projects..."
                  className="flex-1 bg-transparent border-0 font-mono text-[12px] text-text pl-1 outline-none placeholder:text-text-muted/30"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="text-text-muted/70 hover:text-text-muted text-[12px] cursor-pointer"
                  >
                    clear
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Research Cards */}
          {liveProjects.length > 0 ? (
            filtered.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filtered.map((project) => (
                  <ResearchCard key={project.id} project={project} provenance={provenance[project.id]} />
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <p className="font-mono text-[13px] text-text-muted/70">
                  no projects match your filter.
                </p>
              </div>
            )
          ) : (
            <WelcomeBlock />
          )}
        </div>

        {/* Footer */}
        <p className="text-center mt-24 font-mono text-[10px] tracking-[2px] lowercase text-text-muted/70">
          spark by bonfire labs
        </p>
      </main>
    </>
  );
}

function WelcomeBlock() {
  return (
    <TerminalChrome title="no sparks yet" className="max-w-lg mx-auto">
      <div className="space-y-4">
        <p className="text-text text-[13px] leading-relaxed">
          the research lab runs deep-dive research on companies, markets, and
          competitive landscapes — powered by AI agents. every report is
          editorially polished to McKinsey-caliber quality.
        </p>

        <div className="space-y-2">
          <p className="text-[#8B9A6B] text-[11px] tracking-[2px] uppercase">
            how it works
          </p>
          <ol className="space-y-1.5 text-[12px] text-text-muted leading-relaxed">
            <li className="flex gap-2">
              <span className="text-[#8B9A6B]/60 shrink-0">1.</span>
              <span>submit a research topic — company, market, or competitive landscape.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#8B9A6B]/60 shrink-0">2.</span>
              <span>our research agent pulls data, analyzes sources, and builds a report.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#8B9A6B]/60 shrink-0">3.</span>
              <span>auto-polish rewrites it with editorial precision and quality scoring.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#8B9A6B]/60 shrink-0">4.</span>
              <span>review, then promote to creative — turn research into a pitchapp.</span>
            </li>
          </ol>
        </div>

        <div className="flex items-center gap-4 pt-2">
          <Link
            href="/strategy/new"
            className="font-mono text-[12px] text-[#8B9A6B] border border-[rgba(139,154,107,0.3)] px-4 py-2 rounded-[3px] hover:border-[rgba(139,154,107,0.5)] hover:bg-[rgba(139,154,107,0.08)] transition-all spark-glow-hover tracking-[0.5px]"
          >
            + ignite your first research
          </Link>
        </div>
      </div>
    </TerminalChrome>
  );
}
