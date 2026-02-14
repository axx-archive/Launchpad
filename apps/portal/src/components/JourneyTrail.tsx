"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import TerminalChrome from "@/components/TerminalChrome";
import type { Department } from "@/types/database";
import { formatRelativeTime } from "@/lib/format";

const DEPT_COLORS: Record<Department, { text: string; dot: string; line: string }> = {
  intelligence: {
    text: "text-[#4D8EFF]",
    dot: "bg-[#4D8EFF]",
    line: "bg-[#4D8EFF]/20",
  },
  strategy: {
    text: "text-[#8B9A6B]",
    dot: "bg-[#8B9A6B]",
    line: "bg-[#8B9A6B]/20",
  },
  creative: {
    text: "text-accent",
    dot: "bg-accent",
    line: "bg-accent/20",
  },
};

interface JourneyNode {
  department: Department;
  projectId: string;
  projectName: string;
  companyName: string;
  status: string;
  timestamp: string;
  isCurrent: boolean;
}

interface JourneyTrailProps {
  projectId: string;
}

interface ReferenceData {
  incoming: { source_department: string; source_id: string; created_at: string }[];
  outgoing: { target_department: string; target_id: string; created_at: string }[];
  related_projects: { id: string; company_name: string; project_name: string; department: string; status: string }[];
}

export default function JourneyTrail({ projectId }: JourneyTrailProps) {
  const [nodes, setNodes] = useState<JourneyNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchReferences() {
      try {
        const res = await fetch(`/api/projects/${projectId}/references`);
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data: ReferenceData = await res.json();

        // Build project lookup
        const projectMap: Record<string, { company_name: string; project_name: string; department: string; status: string }> = {};
        for (const p of data.related_projects) {
          projectMap[p.id] = p;
        }

        // Build journey chain: trace back through incoming refs, then forward through outgoing
        const trail: JourneyNode[] = [];

        // Walk backwards through incoming (source projects)
        for (const ref of data.incoming) {
          const source = projectMap[ref.source_id];
          if (source) {
            trail.push({
              department: source.department as Department,
              projectId: ref.source_id,
              projectName: source.project_name,
              companyName: source.company_name,
              status: source.status,
              timestamp: ref.created_at,
              isCurrent: false,
            });
          }
        }

        // Current project (we don't have full data here, but it's marked as current)
        // The parent component can pass additional data if needed
        trail.push({
          department: "creative" as Department, // will be overridden
          projectId,
          projectName: "",
          companyName: "",
          status: "",
          timestamp: new Date().toISOString(),
          isCurrent: true,
        });

        // Walk forwards through outgoing (target projects)
        for (const ref of data.outgoing) {
          const target = projectMap[ref.target_id];
          if (target) {
            trail.push({
              department: target.department as Department,
              projectId: ref.target_id,
              projectName: target.project_name,
              companyName: target.company_name,
              status: target.status,
              timestamp: ref.created_at,
              isCurrent: false,
            });
          }
        }

        // Only show if there's actually a journey (more than just the current project)
        if (trail.length > 1) {
          setNodes(trail);
        }
      } catch (err) {
        console.error("Failed to load journey trail:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchReferences();
  }, [projectId]);

  if (loading) {
    return (
      <TerminalChrome title="journey">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent/30 animate-pulse" />
          <p className="font-mono text-[11px] text-text-muted/40">loading provenance...</p>
        </div>
      </TerminalChrome>
    );
  }

  if (nodes.length === 0) return null;

  return (
    <TerminalChrome title="journey">
      <div className="space-y-0">
        {nodes.map((node, i) => {
          const colors = DEPT_COLORS[node.department] ?? DEPT_COLORS.creative;
          const isLast = i === nodes.length - 1;

          return (
            <div key={`${node.projectId}-${i}`} className="relative flex gap-3">
              {/* Vertical line + node dot */}
              <div className="flex flex-col items-center flex-shrink-0 w-4">
                <span
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    node.isCurrent
                      ? `${colors.dot} shadow-[0_0_6px_rgba(255,255,255,0.2)]`
                      : `border-2 border-current ${colors.text} bg-transparent`
                  }`}
                />
                {!isLast && (
                  <span className={`w-px flex-1 min-h-[24px] ${colors.line}`} />
                )}
              </div>

              {/* Content */}
              <div className={`pb-4 ${isLast ? "" : ""}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`font-mono text-[10px] tracking-[2px] uppercase ${colors.text}`}>
                    {node.department}
                  </span>
                  {node.isCurrent && (
                    <span className="font-mono text-[9px] text-text-muted/40 tracking-[1px]">
                      (current)
                    </span>
                  )}
                </div>
                {!node.isCurrent && node.projectName && (
                  <Link
                    href={
                      node.department === "strategy"
                        ? `/strategy/research/${node.projectId}`
                        : `/project/${node.projectId}`
                    }
                    className="text-[12px] text-text hover:text-accent transition-colors block truncate"
                  >
                    {node.projectName}
                  </Link>
                )}
                {!node.isCurrent && (
                  <p className="font-mono text-[10px] text-text-muted/40">
                    {formatRelativeTime(node.timestamp)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </TerminalChrome>
  );
}
