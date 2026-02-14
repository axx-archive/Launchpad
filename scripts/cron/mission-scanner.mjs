#!/usr/bin/env node

/**
 * Mission Scanner — Detects new projects, stale builds, and new edit briefs.
 *
 * Designed to run every 15 minutes via PM2 cron.
 *
 * Actions:
 * - New projects (status=requested, no pipeline_job) → create "auto-pull" job
 * - Stale projects (status=in_progress for >48h) → log alert
 * - New edit briefs (no corresponding "auto-brief" job) → create "auto-brief" job
 *
 * Output: JSON (machine-readable)
 */

import { dbGet, dbPost, logAutomation, isAutomationEnabled } from "./lib/supabase.mjs";

const STALE_HOURS = 48;

async function run() {
  if (!isAutomationEnabled()) {
    console.log(JSON.stringify({ status: "skipped", reason: "automation disabled" }));
    process.exit(0);
  }

  const results = {
    timestamp: new Date().toISOString(),
    new_projects: [],
    stale_projects: [],
    new_briefs: [],
    errors: [],
  };

  // -----------------------------------------------------------------------
  // 1. Detect new projects (requested, no pipeline_job) — department-aware
  // -----------------------------------------------------------------------
  try {
    const requested = await dbGet(
      "projects",
      "select=id,project_name,company_name,autonomy_level,department,pipeline_mode,created_at&status=eq.requested&order=created_at.asc"
    );

    for (const project of requested) {
      // Skip manual-only projects
      if (project.autonomy_level === "manual") continue;

      const pipelineMode = project.pipeline_mode || "creative";

      // Determine the initial job type based on department/pipeline_mode
      // Creative + Strategy both start with auto-pull
      // Intelligence projects don't start from mission scanner
      // (signal ingestion runs on its own PM2 schedule)
      if (pipelineMode === "intelligence") continue;

      const initialJobType = "auto-pull";

      // Check if a pipeline_job already exists for this project
      let existingJobs = [];
      try {
        existingJobs = await dbGet(
          "pipeline_jobs",
          `select=id&project_id=eq.${project.id}&job_type=eq.${initialJobType}`
        );
      } catch {
        // Table may not exist yet — treat as empty
      }

      if (existingJobs.length === 0) {
        // Determine initial status based on autonomy level
        const jobStatus = project.autonomy_level === "full_auto" ? "queued" : "pending";

        try {
          await dbPost("pipeline_jobs", {
            project_id: project.id,
            job_type: initialJobType,
            status: jobStatus,
            attempts: 0,
            max_attempts: 3,
            created_at: new Date().toISOString(),
          });

          await logAutomation("new-project-detected", {
            project_name: project.project_name,
            company_name: project.company_name,
            department: project.department,
            pipeline_mode: pipelineMode,
            job_status: jobStatus,
          }, project.id);

          results.new_projects.push({
            project_id: project.id,
            company_name: project.company_name,
            department: project.department,
            pipeline_mode: pipelineMode,
            job_status: jobStatus,
          });
        } catch (err) {
          results.errors.push({ action: "create-auto-pull", project_id: project.id, error: err.message });
        }
      }
    }
  } catch (err) {
    results.errors.push({ action: "scan-new-projects", error: err.message });
  }

  // -----------------------------------------------------------------------
  // 2. Detect stale projects (in_progress for >48h)
  // -----------------------------------------------------------------------
  try {
    const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();
    const stale = await dbGet(
      "projects",
      `select=id,project_name,company_name,updated_at&status=eq.in_progress&updated_at=lt.${cutoff}`
    );

    for (const project of stale) {
      await logAutomation("stale-project-alert", {
        project_name: project.project_name,
        company_name: project.company_name,
        last_updated: project.updated_at,
        stale_hours: STALE_HOURS,
      }, project.id);

      results.stale_projects.push({
        project_id: project.id,
        company_name: project.company_name,
        last_updated: project.updated_at,
      });
    }
  } catch (err) {
    results.errors.push({ action: "scan-stale-projects", error: err.message });
  }

  // -----------------------------------------------------------------------
  // 3. Detect new edit briefs (scout_messages with edit_brief_md, no auto-brief job)
  // -----------------------------------------------------------------------
  try {
    const briefs = await dbGet(
      "scout_messages",
      "select=id,project_id,created_at&edit_brief_md=not.is.null&order=created_at.desc&limit=50"
    );

    // Group by project and check for existing auto-brief jobs
    const projectBriefs = {};
    for (const b of briefs) {
      if (!projectBriefs[b.project_id]) projectBriefs[b.project_id] = [];
      projectBriefs[b.project_id].push(b);
    }

    for (const [projectId, pBriefs] of Object.entries(projectBriefs)) {
      // Check project autonomy level
      let project;
      try {
        const projects = await dbGet("projects", `select=id,autonomy_level,company_name&id=eq.${projectId}`);
        project = projects[0];
        if (!project || project.autonomy_level === "manual") continue;
      } catch {
        continue;
      }

      // Check for existing auto-brief job for this project
      let existingJobs = [];
      try {
        existingJobs = await dbGet(
          "pipeline_jobs",
          `select=id,created_at&project_id=eq.${projectId}&job_type=eq.auto-brief&order=created_at.desc&limit=1`
        );
      } catch {
        // Table may not exist
      }

      // If no auto-brief job, or newest brief is newer than last job, create one
      const newestBrief = pBriefs[0];
      const needsJob =
        existingJobs.length === 0 ||
        new Date(newestBrief.created_at) > new Date(existingJobs[0].created_at);

      if (needsJob) {
        // M7: Check for active revision cycles before creating auto-brief.
        // If there's already an auto-brief or auto-revise job queued/running
        // for this project, skip — don't pile up revision jobs.
        let activeRevisionJobs = [];
        try {
          activeRevisionJobs = await dbGet(
            "pipeline_jobs",
            `select=id&project_id=eq.${projectId}&job_type=in.(auto-brief,auto-revise)&status=in.(queued,running)`
          );
        } catch {
          // Table may not exist
        }

        if (activeRevisionJobs.length > 0) {
          // Active revision cycle — skip creating a new auto-brief
          continue;
        }

        const jobStatus = project.autonomy_level === "full_auto" ? "queued" : "pending";

        try {
          await dbPost("pipeline_jobs", {
            project_id: projectId,
            job_type: "auto-brief",
            status: jobStatus,
            attempts: 0,
            max_attempts: 3,
            created_at: new Date().toISOString(),
          });

          await logAutomation("new-brief-detected", {
            brief_count: pBriefs.length,
            company_name: project.company_name,
            job_status: jobStatus,
          }, projectId);

          results.new_briefs.push({
            project_id: projectId,
            company_name: project.company_name,
            brief_count: pBriefs.length,
            job_status: jobStatus,
          });
        } catch (err) {
          results.errors.push({ action: "create-auto-brief", project_id: projectId, error: err.message });
        }
      }
    }
  } catch (err) {
    results.errors.push({ action: "scan-briefs", error: err.message });
  }

  // -----------------------------------------------------------------------
  // Output
  // -----------------------------------------------------------------------
  console.log(JSON.stringify(results, null, 2));
}

run().catch((err) => {
  console.error(JSON.stringify({ error: err.message, stack: err.stack }));
  process.exit(1);
});
