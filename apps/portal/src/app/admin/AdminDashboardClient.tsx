"use client";

import Link from "next/link";
import Nav from "@/components/Nav";
import StatusDot from "@/components/StatusDot";
import ToastContainer from "@/components/Toast";
import type { Project, ProjectStatus } from "@/types/database";
import { STATUS_LABELS } from "@/types/database";
import { formatRelativeTime, formatProjectType } from "@/lib/format";

const STATUS_ORDER: ProjectStatus[] = [
  "requested",
  "in_progress",
  "review",
  "revision",
  "live",
  "on_hold",
];

export default function AdminDashboardClient({
  projects,
}: {
  projects: Project[];
}) {
  const grouped = STATUS_ORDER.reduce(
    (acc, status) => {
      acc[status] = projects.filter((p) => p.status === status);
      return acc;
    },
    {} as Record<ProjectStatus, Project[]>
  );

  const nonEmpty = STATUS_ORDER.filter((s) => grouped[s].length > 0);

  return (
    <>
      <Nav sectionLabel="admin" isAdmin />
      <ToastContainer />

      <main className="min-h-screen pt-24 px-[clamp(24px,5vw,64px)] pb-16 page-enter">
        <div className="max-w-[1120px] mx-auto">
          {/* Header */}
          <div className="mb-12">
            <p className="font-mono text-[11px] font-normal tracking-[4px] lowercase text-accent mb-7">
              admin
            </p>
            <h1 className="font-display text-[clamp(28px,4vw,42px)] font-light text-text mb-3">
              all missions
            </h1>
            <p className="font-mono text-[13px] text-text-muted tracking-[0.5px]">
              {projects.length} total mission{projects.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Status groups */}
          {nonEmpty.length > 0 ? (
            <div className="space-y-12">
              {nonEmpty.map((status) => (
                <StatusGroup
                  key={status}
                  status={status}
                  projects={grouped[status]}
                />
              ))}
            </div>
          ) : (
            <p className="text-text-muted text-[14px] py-16 text-center">
              no projects yet.
            </p>
          )}
        </div>

        {/* Footer */}
        <p className="text-center mt-24 font-mono text-[10px] tracking-[2px] lowercase text-text-muted/50">
          launchpad by bonfire labs
        </p>
      </main>
    </>
  );
}

function StatusGroup({
  status,
  projects,
}: {
  status: ProjectStatus;
  projects: Project[];
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border">
        <StatusDot status={status} size="md" />
        <span className="font-mono text-[12px] text-text-muted/80">
          {projects.length}
        </span>
      </div>

      <div className="space-y-2">
        {projects.map((project) => (
          <AdminProjectRow key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}

function AdminProjectRow({ project }: { project: Project }) {
  return (
    <Link
      href={`/admin/project/${project.id}`}
      className="group flex items-center gap-6 px-5 py-4 bg-bg-card border border-border rounded-md hover:border-accent/15 hover:bg-bg-raised transition-all"
    >
      <div className="flex-1 min-w-0">
        <p className="font-display text-[18px] text-text truncate">
          {project.company_name}
        </p>
        <div className="flex items-center gap-2">
          <p className="text-[13px] text-text-muted truncate">
            {project.project_name}
          </p>
          {project.submitter_email && (
            <span className="font-mono text-[10px] text-text-muted/50 truncate">
              — {project.submitter_email}
            </span>
          )}
        </div>
      </div>

      <span className="font-mono text-[11px] text-accent px-2.5 py-1 bg-accent/8 rounded-[3px] border border-accent/12 tracking-[1px] flex-shrink-0">
        {formatProjectType(project.type)}
      </span>

      <span className="font-mono text-[11px] text-text-muted/60 tracking-[0.5px] flex-shrink-0 w-20 text-right">
        {formatRelativeTime(project.updated_at)}
      </span>

      <span className="text-text-muted/40 group-hover:text-accent transition-colors flex-shrink-0">
        &rarr;
      </span>
    </Link>
  );
}
