"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Nav from "@/components/Nav";
import LearningConstellation from "@/components/admin/LearningConstellation";
import LearningDetail from "@/components/admin/LearningDetail";
import type { Learning } from "@/components/admin/LearningConstellation";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEPT_COLORS: Record<string, string> = {
  creative: "#d4863c",
  strategy: "#8B9A6B",
  intelligence: "#4D8EFF",
};

const DEPARTMENTS = ["creative", "strategy", "intelligence"] as const;

interface Stats {
  totalActive: number;
  discoveredThisWeek: number;
  byDepartment: Record<string, number>;
}

interface Props {
  initialLearnings: Learning[];
  stats: Stats;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LearningsPageClient({ initialLearnings, stats }: Props) {
  const [learnings, setLearnings] = useState(initialLearnings);
  const [selectedLearning, setSelectedLearning] = useState<Learning | null>(null);
  const [versions, setVersions] = useState<
    { id: string; version: number; title: string; content: string; confidence: number; changed_by: string; created_at: string }[]
  >([]);
  const [deptFilter, setDeptFilter] = useState<Set<string>>(new Set(DEPARTMENTS));
  const [minConfidence, setMinConfidence] = useState(0.3);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // Unique categories from data
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const l of learnings) set.add(l.category);
    return Array.from(set).sort();
  }, [learnings]);

  // Filtered learnings
  const filtered = useMemo(() => {
    return learnings.filter((l) => {
      if (!deptFilter.has(l.department) && l.department !== "global") return false;
      if (l.confidence < minConfidence) return false;
      if (categoryFilter && l.category !== categoryFilter) return false;
      return true;
    });
  }, [learnings, deptFilter, minConfidence, categoryFilter]);

  // Select a learning and fetch its versions
  const handleSelect = useCallback(async (learning: Learning) => {
    setSelectedLearning(learning);
    try {
      const res = await fetch(`/api/admin/learnings/${learning.id}`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch learning detail:", err);
    }
  }, []);

  // Update a learning in local state after admin action
  const handleUpdate = useCallback((updated: Learning) => {
    setLearnings((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    setSelectedLearning(updated);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedLearning(null);
    setVersions([]);
  }, []);

  // Close detail on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  const toggleDept = (dept: string) => {
    setDeptFilter((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  // Department bar widths
  const maxDept = Math.max(...Object.values(stats.byDepartment), 1);

  return (
    <>
      <Nav sectionLabel="admin" isAdmin />

      <main className="min-h-screen pt-24 pb-16 page-enter">
        <div className="px-[clamp(24px,5vw,64px)]">
          {/* Header */}
          <div className="max-w-[1120px] mx-auto mb-8">
            <p className="font-mono text-[11px] font-normal tracking-[4px] lowercase text-accent mb-7">
              admin / system intelligence
            </p>

            <div className="flex items-end justify-between gap-8">
              {/* Stats — ambient, not tabular */}
              <div className="flex items-end gap-12">
                <div>
                  <p className="font-mono text-[9px] tracking-[2px] uppercase text-text-muted/60 mb-1">
                    active learnings
                  </p>
                  <p className="font-display text-[clamp(36px,5vw,56px)] text-text leading-none">
                    {stats.totalActive}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[9px] tracking-[2px] uppercase text-text-muted/60 mb-1">
                    this week
                  </p>
                  <p className="font-display text-[22px] text-text-muted">
                    +{stats.discoveredThisWeek}
                  </p>
                </div>
              </div>

              {/* Department bars */}
              <div className="flex gap-4">
                {DEPARTMENTS.map((dept) => {
                  const count = stats.byDepartment[dept] ?? 0;
                  const pct = maxDept > 0 ? (count / maxDept) * 100 : 0;
                  return (
                    <div key={dept} className="flex flex-col items-center gap-1.5">
                      <div className="w-3 h-16 bg-white/[0.04] rounded-full overflow-hidden flex flex-col-reverse">
                        <div
                          className="w-full rounded-full transition-all duration-500"
                          style={{
                            height: `${pct}%`,
                            backgroundColor: DEPT_COLORS[dept],
                            opacity: deptFilter.has(dept) ? 1 : 0.2,
                          }}
                        />
                      </div>
                      <span className="font-mono text-[8px] tracking-[1px] uppercase text-text-muted/60">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="max-w-[1120px] mx-auto mb-4 flex items-center gap-4 flex-wrap">
            {/* Department toggles */}
            {DEPARTMENTS.map((dept) => (
              <button
                key={dept}
                onClick={() => toggleDept(dept)}
                className={`font-mono text-[10px] tracking-[1.5px] uppercase px-3 py-1.5 rounded-[3px] border transition-all ${
                  deptFilter.has(dept)
                    ? "border-white/15 text-text"
                    : "border-border text-text-muted/40"
                }`}
                style={{
                  backgroundColor: deptFilter.has(dept)
                    ? `${DEPT_COLORS[dept]}15`
                    : "transparent",
                }}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                  style={{
                    backgroundColor: DEPT_COLORS[dept],
                    opacity: deptFilter.has(dept) ? 1 : 0.3,
                  }}
                />
                {dept}
              </button>
            ))}

            {/* Separator */}
            <span className="w-px h-5 bg-border" />

            {/* Confidence slider */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] text-text-muted/60 tracking-[0.5px]">
                min conf
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={minConfidence * 100}
                onChange={(e) => setMinConfidence(Number(e.target.value) / 100)}
                className="w-20 h-1 accent-accent appearance-none bg-border rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent"
              />
              <span className="font-mono text-[10px] text-text-muted w-8">
                {Math.round(minConfidence * 100)}%
              </span>
            </div>

            {/* Separator */}
            <span className="w-px h-5 bg-border" />

            {/* Category chips */}
            <button
              onClick={() => setCategoryFilter(null)}
              className={`font-mono text-[10px] tracking-[1px] px-2.5 py-1 rounded-[3px] border transition-colors ${
                !categoryFilter
                  ? "border-white/15 text-text bg-white/[0.04]"
                  : "border-border text-text-muted/50 hover:text-text-muted"
              }`}
            >
              all
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() =>
                  setCategoryFilter(categoryFilter === cat ? null : cat)
                }
                className={`font-mono text-[10px] tracking-[1px] px-2.5 py-1 rounded-[3px] border transition-colors ${
                  categoryFilter === cat
                    ? "border-white/15 text-text bg-white/[0.04]"
                    : "border-border text-text-muted/50 hover:text-text-muted"
                }`}
              >
                {cat}
              </button>
            ))}

            {/* Count */}
            <span className="ml-auto font-mono text-[10px] text-text-muted/50 tracking-[0.5px]">
              {filtered.length} node{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Constellation + Detail */}
        <div className="flex" style={{ height: "calc(100vh - 280px)" }}>
          {/* Canvas */}
          <div className={`flex-1 transition-all duration-300 ${selectedLearning ? "mr-0" : ""}`}>
            {filtered.length > 0 ? (
              <LearningConstellation
                learnings={filtered}
                onSelect={handleSelect}
                selectedId={selectedLearning?.id ?? null}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="font-mono text-[12px] text-text-muted/40 tracking-[1px]">
                  no learnings match filters
                </p>
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selectedLearning && (
            <div className="w-[380px] flex-shrink-0 animate-in slide-in-from-right-4 duration-200">
              <LearningDetail
                learning={selectedLearning}
                versions={versions}
                onClose={handleClose}
                onUpdate={handleUpdate}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center mt-8 font-mono text-[10px] tracking-[2px] lowercase text-text-muted/70">
          spark by bonfire labs
        </p>
      </main>
    </>
  );
}
