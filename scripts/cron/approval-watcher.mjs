#!/usr/bin/env node

/**
 * Approval Watcher — Bridges human approval gates and automated execution.
 *
 * Designed to run every 5 minutes via PM2 cron.
 *
 * Checks pipeline_jobs where status = "pending" and determines if the
 * approval condition has been met. If approved, sets status to "queued"
 * so the pipeline-executor can pick it up.
 *
 * Approval logic by job type:
 * - auto-pull: always auto-approved (no gate needed)
 * - auto-narrative: approved when admin reviews narrative (project has narrative_approved flag)
 * - auto-build: approved when project has narrative approved
 * - auto-push: approved when admin marks build as ready
 * - auto-brief: always auto-approved (just pulls briefs)
 *
 * For "supervised" autonomy: all jobs need explicit admin approval.
 * For "full_auto" autonomy: only narrative review needs approval.
 *
 * Output: JSON (machine-readable)
 */

import { dbGet, dbPatch, logAutomation, isAutomationEnabled } from "./lib/supabase.mjs";

const MAX_ATTEMPTS = 3;
const STALE_RUNNING_MINUTES = 10;

// Job types that are always safe to auto-approve (no AI cost, no blast radius)
const SAFE_AUTO_APPROVE = ["auto-pull", "auto-brief"];

// Job types that require narrative approval before proceeding
const REQUIRES_NARRATIVE_APPROVAL = ["auto-build", "auto-narrative"];

async function run() {
  if (!isAutomationEnabled()) {
    console.log(JSON.stringify({ status: "skipped", reason: "automation disabled" }));
    process.exit(0);
  }

  const results = {
    timestamp: new Date().toISOString(),
    approved: [],
    still_pending: [],
    stale_recovered: [],
    errors: [],
  };

  // -----------------------------------------------------------------------
  // 0. Recover stale "running" jobs (crash recovery — Fix I3)
  // Any job stuck in "running" for >10 minutes is assumed crashed.
  // Reset to "queued" if under max attempts, otherwise mark "failed".
  // -----------------------------------------------------------------------
  try {
    const staleCutoff = new Date(Date.now() - STALE_RUNNING_MINUTES * 60 * 1000).toISOString();
    const staleJobs = await dbGet(
      "pipeline_jobs",
      `select=id,project_id,job_type,attempts,started_at&status=eq.running&started_at=lt.${staleCutoff}`
    );

    for (const staleJob of staleJobs) {
      const newStatus = (staleJob.attempts || 0) >= MAX_ATTEMPTS ? "failed" : "queued";

      await dbPatch("pipeline_jobs", `id=eq.${staleJob.id}`, {
        status: newStatus,
        error_message: `Recovered from stale running state (>${STALE_RUNNING_MINUTES}min)`,
        updated_at: new Date().toISOString(),
      });

      await logAutomation("stale-job-recovered", {
        job_id: staleJob.id,
        job_type: staleJob.job_type,
        started_at: staleJob.started_at,
        new_status: newStatus,
        attempts: staleJob.attempts,
      }, staleJob.project_id);

      results.stale_recovered.push({
        job_id: staleJob.id,
        job_type: staleJob.job_type,
        new_status: newStatus,
      });
    }
  } catch (err) {
    results.errors.push({ action: "recover-stale-jobs", error: err.message });
  }

  // -----------------------------------------------------------------------
  // 1. Process pending jobs — check approval gates
  // -----------------------------------------------------------------------
  try {
    // Fetch all pending pipeline jobs
    const pendingJobs = await dbGet(
      "pipeline_jobs",
      "select=id,project_id,job_type,created_at&status=eq.pending&order=created_at.asc"
    );

    for (const job of pendingJobs) {
      try {
        // Fetch the project to check autonomy level
        const projects = await dbGet(
          "projects",
          `select=id,autonomy_level,status,company_name&id=eq.${job.project_id}`
        );

        if (projects.length === 0) {
          results.errors.push({ job_id: job.id, error: "project not found" });
          continue;
        }

        const project = projects[0];
        const autonomy = project.autonomy_level || "supervised";

        let shouldApprove = false;

        if (autonomy === "full_auto") {
          // Full auto: approve everything except narrative review
          if (SAFE_AUTO_APPROVE.includes(job.job_type)) {
            shouldApprove = true;
          } else if (REQUIRES_NARRATIVE_APPROVAL.includes(job.job_type)) {
            // Check if narrative has been approved (look for approval event in automation_log)
            shouldApprove = await checkNarrativeApproved(job.project_id);
          } else {
            // auto-push and others: auto-approve in full_auto
            shouldApprove = true;
          }
        } else if (autonomy === "supervised") {
          // Supervised: safe jobs auto-approve, everything else needs admin action
          if (SAFE_AUTO_APPROVE.includes(job.job_type)) {
            shouldApprove = true;
          } else {
            // Check for explicit admin approval event
            shouldApprove = await checkAdminApproval(job.id);
          }
        }
        // autonomy === "manual" — never auto-approve (shouldn't have jobs, but safety net)

        if (shouldApprove) {
          await dbPatch("pipeline_jobs", `id=eq.${job.id}`, {
            status: "queued",
            updated_at: new Date().toISOString(),
          });

          await logAutomation("job-approved", {
            job_id: job.id,
            job_type: job.job_type,
            autonomy_level: autonomy,
            company_name: project.company_name,
          }, job.project_id);

          results.approved.push({
            job_id: job.id,
            job_type: job.job_type,
            project_id: job.project_id,
            company_name: project.company_name,
          });
        } else {
          results.still_pending.push({
            job_id: job.id,
            job_type: job.job_type,
            project_id: job.project_id,
            waiting_for: autonomy === "supervised" ? "admin-approval" : "narrative-approval",
          });
        }
      } catch (err) {
        results.errors.push({ job_id: job.id, error: err.message });
      }
    }
  } catch (err) {
    results.errors.push({ action: "fetch-pending-jobs", error: err.message });
  }

  console.log(JSON.stringify(results, null, 2));
}

/**
 * Check if the narrative for a project has been approved.
 * Looks for a "narrative-approved" event in automation_log.
 */
async function checkNarrativeApproved(projectId) {
  try {
    const logs = await dbGet(
      "automation_log",
      `select=id&event=eq.narrative-approved&project_id=eq.${projectId}&limit=1`
    );
    return logs.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if an admin has explicitly approved a specific job.
 * Looks for a "job-admin-approved" event in automation_log.
 */
async function checkAdminApproval(jobId) {
  try {
    const logs = await dbGet(
      "automation_log",
      `select=id&event=eq.job-admin-approved&details->>job_id=eq.${jobId}&limit=1`
    );
    return logs.length > 0;
  } catch {
    return false;
  }
}

run().catch((err) => {
  console.error(JSON.stringify({ error: err.message, stack: err.stack }));
  process.exit(1);
});
