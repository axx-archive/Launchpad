#!/usr/bin/env node

/**
 * Pipeline Executor — The main automation engine.
 *
 * Designed to run every 2 minutes via PM2 cron.
 *
 * Picks up "queued" pipeline_jobs and executes them:
 * - auto-pull    → invoke CLI to pull mission data
 * - auto-narrative → invoke Claude to extract narrative from materials
 * - auto-build   → invoke Claude to build PitchApp from narrative
 * - auto-push    → invoke CLI to deploy and push URL
 * - auto-brief   → invoke CLI to pull edit briefs
 *
 * Safety:
 * - Checks circuit breaker before picking up jobs
 * - Max 3 attempts per job
 * - Per-build cost cap ($15)
 * - Logs all actions to automation_log
 *
 * Output: JSON (machine-readable)
 */

import { execFileSync } from "child_process";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, readdirSync } from "fs";
import { dbGet, dbPatch, dbPost, dbRpc, logAutomation, isAutomationEnabled, ROOT } from "./lib/supabase.mjs";
import { checkCircuitBreaker, logCost, estimateCostCents, isBuildOverBudget } from "./lib/cost-tracker.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLI_PATH = join(ROOT, "scripts/launchpad-cli.mjs");
const MAX_ATTEMPTS = 3;

async function run() {
  if (!isAutomationEnabled()) {
    console.log(JSON.stringify({ status: "skipped", reason: "automation disabled" }));
    process.exit(0);
  }

  const results = {
    timestamp: new Date().toISOString(),
    executed: [],
    skipped: [],
    errors: [],
  };

  // Check circuit breaker
  const breaker = await checkCircuitBreaker();
  if (!breaker.allowed) {
    results.skipped.push({ reason: breaker.reason });
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  }

  // Atomically claim the next queued job using RPC (prevents race conditions
  // when multiple executor instances overlap). Falls back to get+patch if the
  // RPC function doesn't exist yet (migration hasn't run).
  let job;
  try {
    const claimed = await dbRpc("claim_next_job");
    if (Array.isArray(claimed) && claimed.length > 0) {
      job = claimed[0];
    } else if (claimed && claimed.id) {
      job = claimed;
    }
  } catch (rpcErr) {
    // RPC not available — fall back to non-atomic get+patch
    // (acceptable during initial deployment before migration runs)
    try {
      const jobs = await dbGet(
        "pipeline_jobs",
        "select=*&status=eq.queued&order=created_at.asc&limit=1"
      );
      if (jobs.length > 0) {
        job = jobs[0];
        await dbPatch("pipeline_jobs", `id=eq.${job.id}`, {
          status: "running",
          started_at: new Date().toISOString(),
          attempts: (job.attempts || 0) + 1,
          updated_at: new Date().toISOString(),
        });
        // Re-read to get updated fields
        job.attempts = (job.attempts || 0) + 1;
        job.status = "running";
      }
    } catch (fallbackErr) {
      results.errors.push({ action: "claim-job-fallback", error: fallbackErr.message });
      console.log(JSON.stringify(results, null, 2));
      process.exit(1);
    }
  }

  if (!job) {
    results.skipped.push({ reason: "no-queued-jobs" });
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  }

  // Check max attempts (the RPC already incremented attempts)
  if ((job.attempts || 0) > MAX_ATTEMPTS) {
    await dbPatch("pipeline_jobs", `id=eq.${job.id}`, {
      status: "failed",
      error_message: `Max attempts (${MAX_ATTEMPTS}) exceeded`,
      updated_at: new Date().toISOString(),
    });
    await logAutomation("job-max-attempts", { job_id: job.id, job_type: job.job_type }, job.project_id);
    results.errors.push({ job_id: job.id, reason: "max-attempts-exceeded" });
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  }

  await logAutomation("job-started", {
    job_id: job.id,
    job_type: job.job_type,
    attempt: job.attempts || 1,
  }, job.project_id);

  // Execute the job
  try {
    const handler = JOB_HANDLERS[job.job_type];
    if (!handler) {
      throw new Error(`Unknown job type: ${job.job_type}`);
    }

    const result = await handler(job);

    // Mark completed
    await dbPatch("pipeline_jobs", `id=eq.${job.id}`, {
      status: "completed",
      result: result || {},
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await logAutomation("job-completed", {
      job_id: job.id,
      job_type: job.job_type,
      result: result || {},
    }, job.project_id);

    results.executed.push({
      job_id: job.id,
      job_type: job.job_type,
      project_id: job.project_id,
      status: "completed",
    });

    // Create follow-up jobs if needed
    await createFollowUpJobs(job, result);

  } catch (err) {
    // Mark as failed (will be retried if under max attempts).
    // job.attempts was already incremented by the claim step.
    const newStatus = (job.attempts || 1) >= MAX_ATTEMPTS ? "failed" : "queued";

    await dbPatch("pipeline_jobs", `id=eq.${job.id}`, {
      status: newStatus,
      error_message: err.message,
      updated_at: new Date().toISOString(),
    });

    await logAutomation("job-failed", {
      job_id: job.id,
      job_type: job.job_type,
      error: err.message,
      will_retry: newStatus === "queued",
    }, job.project_id);

    results.errors.push({
      job_id: job.id,
      job_type: job.job_type,
      error: err.message,
      will_retry: newStatus === "queued",
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

// ---------------------------------------------------------------------------
// Job Handlers
// ---------------------------------------------------------------------------

const JOB_HANDLERS = {
  "auto-pull": handleAutoPull,
  "auto-narrative": handleAutoNarrative,
  "auto-build": handleAutoBuild,
  "auto-push": handleAutoPush,
  "auto-brief": handleAutoBrief,
};

/**
 * auto-pull — Pull mission data from portal using CLI.
 */
async function handleAutoPull(job) {
  const output = runCli("pull", "--json", job.project_id);
  const data = JSON.parse(output);
  return { task_dir: data.taskDir, doc_count: data.docCount };
}

/**
 * auto-narrative — Use Anthropic API to extract narrative from pulled materials.
 * This is an AI-powered step. The actual Claude call is isolated in a helper.
 */
async function handleAutoNarrative(job) {
  // Fetch project to get company name for task directory
  const projects = await dbGet("projects", `select=*&id=eq.${job.project_id}`);
  if (projects.length === 0) throw new Error("Project not found");

  const project = projects[0];
  const safeName = project.company_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const taskDir = join(ROOT, "tasks", safeName);
  const missionPath = join(taskDir, "mission.md");

  if (!existsSync(missionPath)) {
    throw new Error(`Mission file not found: ${missionPath}. Run auto-pull first.`);
  }

  const missionContent = readFileSync(missionPath, "utf-8");

  // Read any uploaded materials (text files only)
  const materialsDir = join(taskDir, "materials");
  let materialsContent = "";
  if (existsSync(materialsDir)) {
    try {
      const files = readdirSync(materialsDir);
      for (const file of files) {
        if (file.match(/\.(txt|md|csv)$/i)) {
          const content = readFileSync(join(materialsDir, file), "utf-8");
          materialsContent += `\n\n--- ${file} ---\n${content}`;
        }
      }
    } catch {
      // No materials or can't read
    }
  }

  // Check for revision notes in payload (when redoing a narrative)
  const revisionNotes = job.payload?.revision_notes || null;

  // Call Claude to extract narrative
  const narrative = await invokeClaudeNarrative(project, missionContent, materialsContent, job.id, revisionNotes);

  // Save narrative to task directory
  const { writeFileSync } = await import("fs");
  writeFileSync(join(taskDir, "narrative.md"), narrative);

  // Parse structured sections from the narrative (best-effort)
  const sections = parseNarrativeSections(narrative);

  // Determine next version number
  let version = 1;
  try {
    const existing = await dbGet(
      "project_narratives",
      `select=version&project_id=eq.${job.project_id}&order=version.desc&limit=1`
    );
    if (existing.length > 0) {
      version = existing[0].version + 1;
    }
  } catch {
    // Table may not exist yet, default to version 1
  }

  // Mark any previous pending_review narratives as superseded
  try {
    await dbPatch(
      "project_narratives",
      `project_id=eq.${job.project_id}&status=eq.pending_review`,
      { status: "superseded", updated_at: new Date().toISOString() }
    );
  } catch {
    // Ignore if table doesn't exist yet
  }

  // Save to project_narratives table
  try {
    await dbPost("project_narratives", {
      project_id: job.project_id,
      version,
      content: narrative,
      sections: sections || null,
      status: "pending_review",
      source_job_id: job.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    // Log but don't fail — the narrative file is already saved
    await logAutomation("narrative-db-save-failed", { error: err.message }, job.project_id);
  }

  // Update project status to narrative_review
  try {
    await dbPatch("projects", `id=eq.${job.project_id}`, {
      status: "narrative_review",
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    await logAutomation("project-status-update-failed", { error: err.message }, job.project_id);
  }

  // Create notification for client
  try {
    const projectData = await dbGet("projects", `select=user_id&id=eq.${job.project_id}`);
    if (projectData.length > 0) {
      await dbPost("notifications", {
        user_id: projectData[0].user_id,
        project_id: job.project_id,
        type: "narrative_ready",
        title: "your story arc is ready",
        body: `the narrative for ${project.project_name} is ready for your review.`,
        created_at: new Date().toISOString(),
      });
    }
  } catch {
    // Non-critical
  }

  return {
    narrative_path: join(taskDir, "narrative.md"),
    word_count: narrative.split(/\s+/).length,
    version,
    has_sections: !!sections,
  };
}

/**
 * auto-build — Use Anthropic API to build a PitchApp from narrative.
 * This is the big AI-powered step.
 */
async function handleAutoBuild(job) {
  // Check per-build cost cap
  if (await isBuildOverBudget(job.id)) {
    throw new Error("Per-build cost cap exceeded");
  }

  const projects = await dbGet("projects", `select=*&id=eq.${job.project_id}`);
  if (projects.length === 0) throw new Error("Project not found");

  const project = projects[0];
  const safeName = project.company_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const taskDir = join(ROOT, "tasks", safeName);
  const narrativePath = join(taskDir, "narrative.md");

  if (!existsSync(narrativePath)) {
    throw new Error(`Narrative not found: ${narrativePath}. Run auto-narrative first.`);
  }

  const narrative = readFileSync(narrativePath, "utf-8");

  // Call Claude to generate PitchApp build plan and code
  const buildResult = await invokeClaudeBuild(project, narrative, safeName, job.id);

  return buildResult;
}

/**
 * auto-push — Deploy to Vercel and push URL to portal using CLI.
 */
async function handleAutoPush(job) {
  const projects = await dbGet("projects", `select=*&id=eq.${job.project_id}`);
  if (projects.length === 0) throw new Error("Project not found");

  const project = projects[0];
  const safeName = project.company_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const appDir = join(ROOT, "apps", safeName);

  if (!existsSync(join(appDir, "index.html"))) {
    throw new Error(`PitchApp not found at ${appDir}. Run auto-build first.`);
  }

  const output = runCli("push", "--json", job.project_id, appDir);
  const data = JSON.parse(output);
  return { pitchapp_url: data.pitchapp_url, status: data.status };
}

/**
 * auto-brief — Pull edit briefs using CLI.
 */
async function handleAutoBrief(job) {
  const output = runCli("briefs", "--json", job.project_id);
  const briefs = JSON.parse(output);
  return { brief_count: briefs.length };
}

// ---------------------------------------------------------------------------
// CLI Runner
// ---------------------------------------------------------------------------

function runCli(...args) {
  try {
    const output = execFileSync("node", [CLI_PATH, ...args], {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 180000, // 3 min timeout
      env: { ...process.env },
    });
    return output.trim();
  } catch (err) {
    const msg = err.stderr || err.stdout || err.message;
    throw new Error(`CLI failed: ${msg.split("\n").slice(0, 3).join(" ")}`);
  }
}

// ---------------------------------------------------------------------------
// AI Invocation Helpers (isolated for swapability)
// ---------------------------------------------------------------------------

/**
 * Invoke Claude to extract a narrative from mission materials.
 * Uses the Anthropic SDK directly.
 */
async function invokeClaudeNarrative(project, missionContent, materialsContent, jobId, revisionNotes) {
  const Anthropic = await loadAnthropicSDK();
  const client = new Anthropic();

  const systemPrompt = `You are a narrative strategist for PitchApp — a premium scroll-driven presentation platform.
Your job is to extract a compelling narrative arc from raw project materials.

Output a structured narrative brief in markdown with:
1. The Core Story (1-2 sentences — the emotional hook)
2. Target Audience (who will view this)
3. Narrative Arc (6 beats: hook, tension, insight, proof, vision, ask)
4. Section Outline (numbered list of sections with headlines and key points)
5. Tone Notes (brand voice, energy level, formality)

Be bold and specific. Avoid generic business language. Find what makes this story unique.`;

  const revisionBlock = revisionNotes
    ? `\n\nIMPORTANT — REVISION REQUEST:
The client reviewed a previous version and provided this feedback:
${revisionNotes}

Rework the narrative to address this feedback while preserving what was working.`
    : "";

  const userPrompt = `Here is the mission data for ${project.company_name} — ${project.project_name}:

${missionContent}

${materialsContent ? `\nAdditional materials:\n${materialsContent}` : ""}${revisionBlock}

Extract the narrative. Be specific to this company and their story.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Track cost
  if (response.usage) {
    const cost = estimateCostCents(response.usage);
    await logCost(jobId, project.id, cost, "auto-narrative");
  }

  return response.content[0].text;
}

/**
 * Invoke Claude to build a PitchApp from a narrative.
 * This generates the section structure and copy — actual file generation
 * would be handled by a more sophisticated agent workflow.
 */
async function invokeClaudeBuild(project, narrative, safeName, jobId) {
  const Anthropic = await loadAnthropicSDK();
  const client = new Anthropic();

  const systemPrompt = `You are a PitchApp developer. Given a narrative brief, generate a complete PitchApp copy document.

Output a structured markdown document with:
1. Meta (title, subtitle, og_description)
2. For each section:
   - Section type (hero, text-centered, numbered-grid, background-stats, etc.)
   - Section ID and label
   - Headline
   - Body copy
   - Any metrics/numbers with data attributes
   - Image direction (if applicable)

The copy should be production-ready — confident, concise, premium.
Use the 13 standard PitchApp section types.`;

  const userPrompt = `Build PitchApp copy for ${project.company_name} — ${project.project_name}.

Narrative brief:
${narrative}

Project type: ${project.type}
Target audience: ${project.target_audience || "Not specified"}

Generate the complete section-by-section copy document.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Track cost
  if (response.usage) {
    const cost = estimateCostCents(response.usage);
    await logCost(jobId, project.id, cost, "auto-build");
  }

  // Save the copy document
  const { writeFileSync, mkdirSync } = await import("fs");
  const taskDir = join(ROOT, "tasks", safeName);
  mkdirSync(taskDir, { recursive: true });
  const copyPath = join(taskDir, "pitchapp-copy.md");
  writeFileSync(copyPath, response.content[0].text);

  return {
    copy_path: copyPath,
    word_count: response.content[0].text.split(/\s+/).length,
    note: "Copy document generated. Full HTML build requires agent workflow — scaffold manually or extend pipeline.",
  };
}

/**
 * Parse structured sections from a narrative markdown document.
 * Best-effort — returns null if parsing fails.
 */
function parseNarrativeSections(narrative) {
  try {
    const sections = [];
    // Match patterns like "## 1. THE OPENING" or "### 1. Hook" or numbered headers
    const sectionRegex = /^#{1,3}\s*(\d+)\.\s*(.+?)$/gm;
    let match;
    const positions = [];

    while ((match = sectionRegex.exec(narrative)) !== null) {
      positions.push({
        number: parseInt(match[1], 10),
        label: match[2].trim().replace(/[*_]/g, ""),
        index: match.index,
        headerEnd: match.index + match[0].length,
      });
    }

    if (positions.length === 0) return null;

    for (let i = 0; i < positions.length; i++) {
      const start = positions[i].headerEnd;
      const end = i < positions.length - 1 ? positions[i + 1].index : narrative.length;
      const body = narrative.slice(start, end).trim();

      // Extract first meaningful line as headline
      const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
      const headline = lines[0]?.replace(/^[*_]+|[*_]+$/g, "") || positions[i].label;
      const bodyText = lines.slice(1).join(" ").slice(0, 500);

      sections.push({
        number: positions[i].number,
        label: positions[i].label.toUpperCase(),
        headline,
        body: bodyText || headline,
      });
    }

    return sections.length > 0 ? sections : null;
  } catch {
    return null;
  }
}

/**
 * Load the Anthropic SDK. It's installed in apps/portal/node_modules.
 */
async function loadAnthropicSDK() {
  try {
    // Try global/local first
    const mod = await import("@anthropic-ai/sdk");
    return mod.default || mod.Anthropic;
  } catch {
    // Fall back to portal's node_modules
    const portalPath = join(ROOT, "apps/portal/node_modules/@anthropic-ai/sdk/index.mjs");
    if (existsSync(portalPath)) {
      const mod = await import(portalPath);
      return mod.default || mod.Anthropic;
    }
    throw new Error(
      "Anthropic SDK not found. Install with: npm install @anthropic-ai/sdk"
    );
  }
}

// ---------------------------------------------------------------------------
// Follow-up Job Creation
// ---------------------------------------------------------------------------

/**
 * After a job completes, create the next job in the pipeline if needed.
 */
async function createFollowUpJobs(completedJob, result) {
  const PIPELINE_SEQUENCE = {
    "auto-pull": "auto-narrative",
    "auto-narrative": null,  // Requires approval gate before auto-build
    "auto-build": "auto-push",
    // auto-push and auto-brief are terminal
  };

  const nextType = PIPELINE_SEQUENCE[completedJob.job_type];
  if (!nextType) return;

  // Check project autonomy level for job status
  const projects = await dbGet("projects", `select=autonomy_level&id=eq.${completedJob.project_id}`);
  const autonomy = projects[0]?.autonomy_level || "supervised";

  // auto-narrative follow-up is always pending (needs approval before build)
  // Everything else depends on autonomy level
  let jobStatus;
  if (nextType === "auto-narrative") {
    jobStatus = autonomy === "full_auto" ? "queued" : "pending";
  } else {
    jobStatus = autonomy === "full_auto" ? "queued" : "pending";
  }

  try {
    await dbPost("pipeline_jobs", {
      project_id: completedJob.project_id,
      job_type: nextType,
      status: jobStatus,
      attempts: 0,
      created_at: new Date().toISOString(),
    });

    await logAutomation("follow-up-job-created", {
      previous_job_id: completedJob.id,
      previous_job_type: completedJob.job_type,
      new_job_type: nextType,
      new_job_status: jobStatus,
    }, completedJob.project_id);
  } catch (err) {
    await logAutomation("follow-up-job-failed", {
      previous_job_id: completedJob.id,
      error: err.message,
    }, completedJob.project_id);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

run().catch((err) => {
  console.error(JSON.stringify({ error: err.message, stack: err.stack }));
  process.exit(1);
});
