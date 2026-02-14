"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import ProjectCard from "@/components/ProjectCard";
import ToastContainer from "@/components/Toast";
import TerminalChrome from "@/components/TerminalChrome";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import type { Project, ProjectStatus, ProjectWithRole } from "@/types/database";
import { STATUS_LABELS } from "@/types/database";

type StatusFilter = "all" | ProjectStatus;
type OwnershipFilter = "all" | "mine" | "shared";

const FILTER_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "all" },
  { key: "requested", label: STATUS_LABELS.requested },
  { key: "narrative_review", label: STATUS_LABELS.narrative_review },
  { key: "in_progress", label: STATUS_LABELS.in_progress },
  { key: "review", label: STATUS_LABELS.review },
  { key: "live", label: STATUS_LABELS.live },
];

export default function DashboardClient({
  projects,
  sharedProjects = [],
  isAdmin,
}: {
  projects: Project[];
  sharedProjects?: ProjectWithRole[];
  isAdmin: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("all");
  const [search, setSearch] = useState("");
  const [liveProjects, setLiveProjects] = useState<Project[]>(projects);

  const hasShared = sharedProjects.length > 0;

  // Merge Realtime updates into project list
  const mergeProject = useCallback((updated: Partial<Project> & { id: string }) => {
    setLiveProjects((prev) => {
      const idx = prev.findIndex((p) => p.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...updated };
        return next;
      }
      return prev;
    });
  }, []);

  // Subscribe to project updates for all owned projects
  const projectIds = liveProjects.map((p) => p.id);
  useRealtimeSubscription({
    table: "projects",
    events: ["UPDATE"],
    enabled: projectIds.length > 0,
    onEvent: (payload) => {
      const updated = payload.new as Project | undefined;
      if (!updated?.id) return;
      // Only process if this is one of our projects
      if (projectIds.includes(updated.id)) {
        mergeProject(updated);
      }
    },
  });

  const activeOwned = liveProjects.filter((p) => p.status !== "on_hold");
  const activeShared = sharedProjects.filter((p) => p.status !== "on_hold");

  const filtered = useMemo(() => {
    // Start with ownership filter
    let owned: Project[] = [];
    let shared: ProjectWithRole[] = [];

    if (ownershipFilter === "all" || ownershipFilter === "mine") {
      owned = activeOwned;
    }
    if (ownershipFilter === "all" || ownershipFilter === "shared") {
      shared = activeShared;
    }

    // Apply status filter
    if (statusFilter !== "all") {
      owned = owned.filter((p) => p.status === statusFilter);
      shared = shared.filter((p) => p.status === statusFilter);
    }

    // Apply search
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchesSearch = (p: Project) =>
        p.company_name.toLowerCase().includes(q) ||
        p.project_name.toLowerCase().includes(q);
      owned = owned.filter(matchesSearch);
      shared = shared.filter(matchesSearch);
    }

    return { owned, shared };
  }, [activeOwned, activeShared, statusFilter, ownershipFilter, search]);

  const allFiltered = [
    ...filtered.owned.map((p) => ({ project: p, isShared: false as const })),
    ...filtered.shared.map((p) => ({ project: p as Project, isShared: true as const, ownerEmail: p.ownerEmail, userRole: p.userRole })),
  ].sort((a, b) => new Date(b.project.updated_at).getTime() - new Date(a.project.updated_at).getTime());

  const totalCount = activeOwned.length + activeShared.length;

  return (
    <>
      <Nav sectionLabel="mission control" isAdmin={isAdmin} />
      <ToastContainer />

      <main id="main-content" className="min-h-screen pt-24 px-[clamp(24px,5vw,64px)] pb-16 page-enter">
        <div className="max-w-[1120px] mx-auto">
          {/* Header */}
          <div className="mb-12">
            <div className="flex items-center justify-between mb-7">
              <h1 className="font-display text-[clamp(24px,3vw,32px)] font-light text-text lowercase tracking-[1px]">
                mission control
              </h1>
              <Link
                href="/dashboard/new"
                className="font-mono text-[12px] text-accent border border-accent/20 px-4 py-2 rounded-[3px] hover:border-accent/50 hover:bg-accent/5 transition-all tracking-[0.5px]"
              >
                + new mission
              </Link>
            </div>
            <p className="font-mono text-[13px] text-text-muted tracking-[0.5px]">
              {activeOwned.length === 0 && !hasShared
                ? "no active projects"
                : (
                  <>
                    {activeOwned.length} active project{activeOwned.length !== 1 ? "s" : ""}
                    {hasShared && (
                      <>
                        <span className="text-text-muted/30 mx-2">&middot;</span>
                        <span className="text-text-muted/70">
                          {activeShared.length} shared with you
                        </span>
                      </>
                    )}
                  </>
                )}
            </p>
          </div>

          {/* Search & Filter — only show when there are projects */}
          {totalCount > 0 && (
            <div className="mb-8 space-y-4">
              {/* Ownership filter tabs — only show when user has shared projects */}
              {hasShared && (
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { key: "all" as const, label: "all" },
                    { key: "mine" as const, label: "my projects" },
                    { key: "shared" as const, label: "shared with me" },
                  ]).map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setOwnershipFilter(tab.key)}
                      className={`font-mono text-[11px] px-3 py-1.5 rounded-[3px] border transition-all cursor-pointer tracking-[0.5px] ${
                        ownershipFilter === tab.key
                          ? "border-accent/30 bg-accent/10 text-accent"
                          : "border-white/6 text-text-muted/70 hover:border-white/12 hover:text-text-muted"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}

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
                  placeholder="search projects..."
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

          {/* Project Cards */}
          {totalCount > 0 ? (
            allFiltered.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {allFiltered.map((item) => (
                  <ProjectCard
                    key={item.project.id}
                    project={item.project}
                    href={`/project/${item.project.id}`}
                    isShared={item.isShared}
                    ownerEmail={item.isShared ? item.ownerEmail : undefined}
                    userRole={item.isShared ? item.userRole : undefined}
                  />
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
          launchpad by bonfire labs
        </p>
      </main>
    </>
  );
}

function WelcomeBlock() {
  return (
    <TerminalChrome title="welcome to launchpad" className="max-w-lg mx-auto">
      <div className="space-y-4">
        <p className="text-text text-[13px] leading-relaxed">
          launchpad turns your ideas into interactive, scroll-driven
          presentations — a modern alternative to static decks.
        </p>

        <div className="space-y-2">
          <p className="text-accent text-[11px] tracking-[2px] uppercase">
            how it works
          </p>
          <ol className="space-y-1.5 text-[12px] text-text-muted leading-relaxed">
            <li className="flex gap-2">
              <span className="text-accent/60 shrink-0">1.</span>
              <span>submit your project — tell us what you need and upload materials.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent/60 shrink-0">2.</span>
              <span>we build your pitchapp — custom design, story, and animations.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent/60 shrink-0">3.</span>
              <span>review with scout — your ai assistant helps you request edits.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent/60 shrink-0">4.</span>
              <span>go live — share a single url with your audience.</span>
            </li>
          </ol>
        </div>

        <div className="flex items-center gap-4 pt-2">
          <Link
            href="/dashboard/new"
            className="font-mono text-[12px] text-accent border border-accent/30 px-4 py-2 rounded-[3px] hover:border-accent/50 hover:bg-accent/8 transition-all tracking-[0.5px]"
          >
            + new mission
          </Link>
          <a
            href="https://onin.bonfire.tools"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[11px] text-text-muted/70 hover:text-text-muted transition-colors"
          >
            see an example &rarr;
          </a>
        </div>
      </div>
    </TerminalChrome>
  );
}
