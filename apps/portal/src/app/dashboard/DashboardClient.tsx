"use client";

import Link from "next/link";
import Nav from "@/components/Nav";
import ProjectCard from "@/components/ProjectCard";
import ToastContainer from "@/components/Toast";
import type { Project } from "@/types/database";

export default function DashboardClient({
  projects,
  isAdmin,
}: {
  projects: Project[];
  isAdmin: boolean;
}) {
  const activeProjects = projects.filter((p) => p.status !== "on_hold");
  const count = activeProjects.length;

  return (
    <>
      <Nav sectionLabel="mission control" isAdmin={isAdmin} />
      <ToastContainer />

      <main className="min-h-screen pt-24 px-[clamp(24px,5vw,64px)] pb-16 page-enter">
        <div className="max-w-[1120px] mx-auto">
          {/* Header */}
          <div className="mb-12">
            <div className="flex items-center justify-between mb-7">
              <h1 className="font-mono text-[11px] font-normal tracking-[4px] lowercase text-accent">
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
              {count === 0
                ? "no active projects"
                : `${count} active project${count !== 1 ? "s" : ""}`}
            </p>
          </div>

          {/* Project Cards */}
          {count > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  href={`/project/${project.id}`}
                />
              ))}
            </div>
          ) : (
            <EmptyState />
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

function EmptyState() {
  return (
    <div className="max-w-md mx-auto text-center py-24">
      <p className="text-text-muted text-[15px] leading-relaxed mb-2">
        nothing on the pad yet.
      </p>
      <p className="text-text-muted/70 text-[14px] leading-relaxed mb-8">
        start a new project request, or
        <br />
        reach out to the team to get started.
      </p>
      <Link
        href="/dashboard/new"
        className="inline-block font-mono text-[12px] text-accent px-5 py-2.5 border border-accent/20 rounded-[3px] hover:border-accent/50 hover:bg-accent/5 transition-all tracking-[1px]"
      >
        + new mission
      </Link>
    </div>
  );
}
