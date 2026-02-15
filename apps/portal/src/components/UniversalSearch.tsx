"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Department } from "@/types/database";

const DEPT_COLORS: Record<string, string> = {
  intelligence: "text-[#4D8EFF]/70",
  strategy: "text-[#8B9A6B]/70",
  creative: "text-accent/70",
};

const DEPT_BADGE: Record<string, string> = {
  intelligence: "text-[#4D8EFF]/60 bg-[#4D8EFF]/8 border-[#4D8EFF]/12",
  strategy: "text-[#8B9A6B]/60 bg-[rgba(139,154,107,0.08)] border-[rgba(139,154,107,0.12)]",
  creative: "text-accent/60 bg-accent/8 border-accent/12",
};

const DEPT_ACCENT_RGB: Record<string, string> = {
  intelligence: "77, 142, 255",
  strategy: "139, 154, 107",
  creative: "212, 134, 60",
};

interface SearchResult {
  id: string;
  type: "project" | "cluster" | "entity" | "research";
  department: Department;
  title: string;
  subtitle: string;
  href: string;
  /** Provenance from another department (if promoted) */
  provenance?: { department: string; label: string };
}

interface RecentProject {
  id: string;
  project_name: string;
  company_name: string;
  department: string;
  status: string;
  updated_at: string;
  role: string;
  href: string;
}

interface SearchResponse {
  query: string;
  total_results: number;
  results: {
    projects: Record<string, { id: string; project_name: string; company_name: string; department: string; status: string; type: string; _isMember?: boolean }[]>;
    clusters: { id: string; name: string; summary: string; category: string }[];
    entities: { id: string; name: string; entity_type: string }[];
    research: { id: string; project_id: string; version: number; research_type: string; _project?: { project_name: string; company_name: string } }[];
    refs?: { source_department: string; source_id: string; target_department: string; target_id: string; relationship: string }[];
  };
}

export default function UniversalSearch() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [flashDept, setFlashDept] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const recentsLoaded = useRef(false);

  // Cmd+K global shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Focus input when opened + fetch recents
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      // Fetch recents once per session
      if (!recentsLoaded.current) {
        recentsLoaded.current = true;
        fetch("/api/user/my-projects")
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (!data?.projects) return;
            const hrefForDept = (dept: string, id: string) => {
              if (dept === "strategy") return `/strategy/research/${id}`;
              if (dept === "intelligence") return `/intelligence`;
              return `/project/${id}`;
            };
            setRecents(
              (data.projects as RecentProject[]).slice(0, 5).map((p) => ({
                ...p,
                href: hrefForDept(p.department, p.id),
              }))
            );
          })
          .catch(() => { /* silent */ });
      }
    } else {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Debounced search
  const search = useCallback(async (term: string) => {
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      if (!res.ok) {
        setResults([]);
        setLoading(false);
        return;
      }
      const data: SearchResponse = await res.json();

      // Build provenance lookup from refs
      const refs = data.results.refs ?? [];
      const provenanceByProjectId: Record<string, { department: string; label: string }> = {};
      for (const ref of refs) {
        // Target project was promoted FROM source department
        provenanceByProjectId[ref.target_id] = {
          department: ref.source_department,
          label: ({ intelligence: "intel", creative: "cre", strategy: "strat" } as Record<string, string>)[ref.source_department] ?? ref.source_department,
        };
      }

      const items: SearchResult[] = [];

      // Projects grouped by department
      for (const [dept, projects] of Object.entries(data.results.projects)) {
        for (const p of projects) {
          items.push({
            id: p.id,
            type: "project",
            department: dept as Department,
            title: p.project_name,
            subtitle: p.company_name,
            href: dept === "strategy"
              ? `/strategy/research/${p.id}`
              : `/project/${p.id}`,
            provenance: provenanceByProjectId[p.id],
          });
        }
      }

      // Clusters (intelligence)
      for (const c of data.results.clusters) {
        items.push({
          id: c.id,
          type: "cluster",
          department: "intelligence",
          title: c.name,
          subtitle: c.category ?? "trend",
          href: `/intelligence/trend/${c.id}`,
        });
      }

      // Entities (intelligence)
      for (const e of data.results.entities) {
        items.push({
          id: e.id,
          type: "entity",
          department: "intelligence",
          title: e.name,
          subtitle: e.entity_type,
          href: `/intelligence/entity/${e.id}`,
        });
      }

      // Research (strategy)
      for (const r of data.results.research) {
        items.push({
          id: r.id,
          type: "research",
          department: "strategy",
          title: r._project?.project_name ?? `research v${r.version}`,
          subtitle: r._project?.company_name ?? r.research_type,
          href: `/strategy/research/${r.project_id}`,
        });
      }

      setResults(items);
      setSelectedIndex(0);
    } catch (err) {
      console.error("Search failed:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInputChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 250);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const showingRecents = query.length < 2 && recents.length > 0;
    const maxIdx = showingRecents ? recents.length - 1 : results.length - 1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, maxIdx));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Handle recents vs search results
      const showingRecents = query.length < 2 && recents.length > 0;
      if (showingRecents && recents[selectedIndex]) {
        const r = recents[selectedIndex];
        navigate(r.href, r.department);
      } else if (results[selectedIndex]) {
        navigate(results[selectedIndex].href, results[selectedIndex].department);
      }
    }
  }

  function navigate(href: string, dept?: string) {
    if (dept) {
      setFlashDept(dept);
      setTimeout(() => setFlashDept(null), 200);
    }
    setIsOpen(false);
    router.push(href);
  }

  // Group results by department for display
  const grouped: Record<string, SearchResult[]> = {};
  for (const r of results) {
    if (!grouped[r.department]) grouped[r.department] = [];
    grouped[r.department].push(r);
  }

  // Flat index for keyboard navigation
  let flatIndex = 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Transition flash — department-color flash on navigate */}
      {flashDept && (
        <div
          className="fixed inset-0 pointer-events-none z-[70]"
          style={{
            background: `radial-gradient(ellipse 100% 100% at 50% 50%, rgba(${DEPT_ACCENT_RGB[flashDept] ?? "255,255,255"}, 0.08) 0%, transparent 70%)`,
            animation: "fadeIn 0.1s ease-out forwards",
          }}
        />
      )}

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />

      {/* Search panel */}
      <div className="absolute inset-x-0 top-[15vh] flex justify-center px-4">
        <div className="w-full max-w-[560px] bg-bg-card border border-white/[0.08] rounded-lg overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
          {/* Input */}
          <div className="flex items-center gap-0 px-4 py-3 border-b border-white/[0.06]">
            <span className="text-accent text-[14px] select-none font-mono">$ </span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="search across all departments..."
              className="flex-1 bg-transparent border-0 font-mono text-[14px] text-text pl-1 outline-none placeholder:text-text-muted/30"
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="font-mono text-[10px] text-text-muted/30 border border-white/[0.06] rounded px-1.5 py-0.5 ml-2">
              esc
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-[50vh] overflow-y-auto">
            {loading && (
              <div className="flex items-center gap-2 px-4 py-4">
                <span className="w-1.5 h-1.5 rounded-full bg-accent/30 animate-pulse" />
                <p className="font-mono text-[11px] text-text-muted/40">searching...</p>
              </div>
            )}

            {!loading && query.length >= 2 && results.length === 0 && (
              <div className="px-4 py-6 text-center">
                <p className="font-mono text-[12px] text-text-muted/40">
                  no results for &ldquo;{query}&rdquo;
                </p>
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="py-2">
                {Object.entries(grouped).map(([dept, items]) => (
                  <div key={dept}>
                    {/* Department header */}
                    <p className={`px-4 pt-3 pb-1 font-mono text-[9px] tracking-[2px] uppercase ${DEPT_COLORS[dept] ?? "text-text-muted/40"}`}>
                      {dept}
                    </p>

                    {/* Items */}
                    {items.map((item) => {
                      const idx = flatIndex++;
                      const isSelected = idx === selectedIndex;

                      return (
                        <button
                          key={`${item.type}-${item.id}`}
                          onClick={() => navigate(item.href, item.department)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-white/[0.04]"
                              : "hover:bg-white/[0.02]"
                          }`}
                        >
                          {/* Type badge */}
                          <span className={`font-mono text-[9px] tracking-[1px] uppercase px-1.5 py-0.5 rounded-[2px] border flex-shrink-0 ${DEPT_BADGE[item.department] ?? ""}`}>
                            {item.type === "cluster" ? "trend" : item.type}
                          </span>

                          {/* Title + subtitle + provenance */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-[13px] truncate ${isSelected ? "text-text" : "text-text/80"}`}>
                                {item.title}
                              </p>
                              {item.provenance && (
                                <span className={`font-mono text-[9px] tracking-[0.5px] px-1.5 py-0.5 rounded-[2px] border flex-shrink-0 ${DEPT_BADGE[item.provenance.department] ?? ""}`}>
                                  &larr; {item.provenance.label}
                                </span>
                              )}
                            </div>
                            <p className="font-mono text-[10px] text-text-muted/40 truncate">
                              {item.subtitle}
                            </p>
                          </div>

                          {/* Arrow hint */}
                          {isSelected && (
                            <span className="font-mono text-[10px] text-text-muted/30 flex-shrink-0">
                              &rarr;
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* Recents — shown when no query typed */}
            {!loading && query.length < 2 && recents.length > 0 && (
              <div className="py-2">
                <p className="px-4 pt-2 pb-1 font-mono text-[9px] tracking-[2px] uppercase text-text-muted/30">
                  recent
                </p>
                {recents.map((r, ri) => {
                  const isSelected = ri === selectedIndex;
                  const deptColor = DEPT_ACCENT_RGB[r.department] ?? "255,255,255";
                  return (
                    <button
                      key={r.id}
                      onClick={() => navigate(r.href, r.department)}
                      onMouseEnter={() => setSelectedIndex(ri)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer ${
                        isSelected ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"
                      }`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: `rgba(${deptColor}, 0.7)` }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] truncate ${isSelected ? "text-text" : "text-text/80"}`}>
                          {r.project_name}
                        </p>
                        <p className="font-mono text-[10px] text-text-muted/40 truncate">
                          {r.company_name} &middot; {r.status.replace(/_/g, " ")}
                        </p>
                      </div>
                      {isSelected && (
                        <span className="font-mono text-[10px] text-text-muted/30 flex-shrink-0">
                          &rarr;
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {!loading && query.length < 2 && recents.length === 0 && (
              <div className="px-4 py-6 text-center">
                <p className="font-mono text-[11px] text-text-muted/30">
                  type to search projects, research, trends, entities...
                </p>
                <p className="font-mono text-[10px] text-text-muted/20 mt-2">
                  <kbd className="border border-white/[0.06] rounded px-1 py-0.5">&uarr;</kbd>{" "}
                  <kbd className="border border-white/[0.06] rounded px-1 py-0.5">&darr;</kbd>{" "}
                  navigate &middot;{" "}
                  <kbd className="border border-white/[0.06] rounded px-1 py-0.5">enter</kbd>{" "}
                  select
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
