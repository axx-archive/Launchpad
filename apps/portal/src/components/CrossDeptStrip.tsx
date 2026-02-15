"use client";

import { useState, useEffect, useRef } from "react";
import type { Department } from "@/types/database";

const DEPT_COLORS: Record<string, string> = {
  intelligence: "#4D8EFF",
  strategy: "#8B9A6B",
  creative: "#d4863c",
};

interface CrossDeptActivity {
  department: string;
  label: string;
}

interface CrossDeptStripProps {
  /** Which department page this strip is on */
  currentDepartment: Department;
}

export default function CrossDeptStrip({ currentDepartment }: CrossDeptStripProps) {
  const [activities, setActivities] = useState<CrossDeptActivity[]>([]);
  const [visible, setVisible] = useState(true);
  const fadeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    fetch("/api/user/my-projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;

        const byDept = data.byDepartment as Record<string, { id: string; status: string }[]> ?? {};
        const refs = (data.refs ?? []) as { source_department: string; target_department: string }[];

        const items: CrossDeptActivity[] = [];

        // Count activity in OTHER departments
        for (const [dept, projects] of Object.entries(byDept)) {
          if (dept === currentDepartment) continue;
          if (!projects?.length) continue;

          // Count how many are in active statuses
          const activeCount = projects.filter(
            (p) => !["archived", "on_hold", "paused"].includes(p.status)
          ).length;

          if (activeCount === 0) continue;

          // Check if any refs connect this dept to current dept
          const linkedCount = refs.filter(
            (r) =>
              (r.source_department === dept && r.target_department === currentDepartment) ||
              (r.target_department === dept && r.source_department === currentDepartment)
          ).length;

          if (linkedCount > 0) {
            items.push({
              department: dept,
              label: `${activeCount} project${activeCount !== 1 ? "s" : ""}, ${linkedCount} linked`,
            });
          } else {
            items.push({
              department: dept,
              label: `${activeCount} active`,
            });
          }
        }

        setActivities(items);
      })
      .catch(() => { /* silent */ });
  }, [currentDepartment]);

  // Auto-fade after 5 seconds
  useEffect(() => {
    if (activities.length === 0) return;

    fadeTimer.current = setTimeout(() => {
      setVisible(false);
    }, 5000);

    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [activities]);

  // Fade on scroll
  useEffect(() => {
    if (activities.length === 0) return;

    function handleScroll() {
      if (window.scrollY > 20) setVisible(false);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activities]);

  if (activities.length === 0) return null;

  return (
    <div
      className="fixed top-[52px] left-0 right-0 z-[25] flex items-center justify-center gap-4 py-1.5 pointer-events-none"
      style={{
        opacity: visible ? 0.5 : 0,
        transition: "opacity 0.6s ease",
      }}
    >
      {activities.map((a) => (
        <span key={a.department} className="flex items-center gap-1.5">
          <span
            className="w-1 h-1 rounded-full"
            style={{ backgroundColor: DEPT_COLORS[a.department] ?? "#666" }}
          />
          <span className="font-mono text-[10px] text-text-muted/50">
            {a.department}: {a.label}
          </span>
        </span>
      ))}
    </div>
  );
}
