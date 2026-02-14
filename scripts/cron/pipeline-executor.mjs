#!/usr/bin/env node

/**
 * Pipeline Executor — The main automation engine.
 *
 * Long-running worker that polls every 2 minutes (managed by PM2).
 * Must stay alive across long AI operations (Opus can take 10+ min).
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
 * - Per-build cost cap ($100)
 * - Logs all actions to automation_log
 */

import { execFileSync } from "child_process";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import { dbGet, dbPatch, dbPost, dbRpc, logAutomation, isAutomationEnabled, ROOT, SUPABASE_URL, SUPABASE_SERVICE_KEY } from "./lib/supabase.mjs";
import { checkCircuitBreaker, logCost, estimateCostCents, isBuildOverBudget } from "./lib/cost-tracker.mjs";
import { ANIMATION_SPECIALIST_SYSTEM, ANIMATION_TOOL_DEFINITIONS, PATTERN_SECTIONS } from "./lib/animation-prompts.mjs";
import { validateAnimation, hasCriticalViolations, formatViolations } from "./lib/animation-validator.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLI_PATH = join(ROOT, "scripts/launchpad-cli.mjs");
const MAX_ATTEMPTS = 3;

// Load ANTHROPIC_API_KEY from portal .env.local if not in environment
if (!process.env.ANTHROPIC_API_KEY) {
  const envPath = join(ROOT, "apps/portal/.env.local");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const match = line.match(/^ANTHROPIC_API_KEY=(.+)$/);
      if (match) { process.env.ANTHROPIC_API_KEY = match[1].trim(); break; }
    }
  }
}

// Model selection — use the best model for each task type
const MODEL_OPUS = "claude-opus-4-6";         // Creative writing, judgment, narrative
const MODEL_SONNET = "claude-sonnet-4-5-20250929"; // Code generation, structured analysis, agentic loops

/**
 * Invoke Claude via streaming (required for Opus / extended thinking).
 * Returns the same response shape as client.messages.create().
 */
async function streamMessage(client, params) {
  return await client.messages.stream(params).finalMessage();
}

async function run() {
  if (!isAutomationEnabled()) {
    console.log(JSON.stringify({ status: "skipped", reason: "automation disabled" }));
    return;
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
    return;
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
        // H9: Add status=eq.queued filter to prevent TOCTOU race —
        // if another executor claimed it between our GET and PATCH,
        // the PATCH returns empty (no rows matched) and we bail.
        const patched = await dbPatch("pipeline_jobs", `id=eq.${job.id}&status=eq.queued`, {
          status: "running",
          started_at: new Date().toISOString(),
          attempts: (job.attempts || 0) + 1,
        });
        if (!patched || (Array.isArray(patched) && patched.length === 0)) {
          // Someone else claimed it — treat as no job available
          job = null;
        } else {
          // Re-read to get updated fields
          job.attempts = (job.attempts || 0) + 1;
          job.status = "running";
        }
      }
    } catch (fallbackErr) {
      results.errors.push({ action: "claim-job-fallback", error: fallbackErr.message });
      console.log(JSON.stringify(results, null, 2));
      return;
    }
  }

  if (!job) {
    results.skipped.push({ reason: "no-queued-jobs" });
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Check max attempts (the RPC already incremented attempts)
  if ((job.attempts || 0) > MAX_ATTEMPTS) {
    await dbPatch("pipeline_jobs", `id=eq.${job.id}`, {
      status: "failed",
      last_error: `Max attempts (${MAX_ATTEMPTS}) exceeded`,
    });
    await logAutomation("job-max-attempts", { job_id: job.id, job_type: job.job_type }, job.project_id);
    results.errors.push({ job_id: job.id, reason: "max-attempts-exceeded" });
    console.log(JSON.stringify(results, null, 2));
    return;
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
      last_error: err.message,
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
  "auto-build": handleAutoBuild,       // Generates copy doc (alias for auto-copy)
  "auto-copy": handleAutoBuild,        // Explicit copy generation step
  "auto-build-html": handleAutoBuildHtml,  // Anthropic API tool loop: narrative+copy → HTML/CSS/JS
  "auto-review": handleAutoReview,     // Automated visual/code review
  "auto-revise": handleAutoRevise,     // Apply edit briefs → revised build
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
  const safeName = project.project_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const taskDir = join(ROOT, "tasks", safeName);
  const missionPath = join(taskDir, "mission.md");

  if (!existsSync(missionPath)) {
    throw new Error(`Mission file not found: ${missionPath}. Run auto-pull first.`);
  }

  const missionContent = readFileSync(missionPath, "utf-8");

  // Read uploaded materials as Anthropic API content blocks (text, PDF, images)
  const materialsDir = join(taskDir, "materials");
  const materialBlocks = loadMaterialsAsContentBlocks(materialsDir);

  // Check for revision notes in payload (when redoing a narrative)
  const revisionNotes = job.payload?.revision_notes || null;

  // Call Claude to extract narrative
  const narrative = await invokeClaudeNarrative(project, missionContent, materialBlocks, job.id, revisionNotes);

  // Save narrative to task directory
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
  const safeName = project.project_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
  const safeName = project.project_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const appDir = join(ROOT, "apps", safeName);

  if (!existsSync(join(appDir, "index.html"))) {
    throw new Error(`PitchApp not found at ${appDir}. Run auto-build first.`);
  }

  const output = runCli("push", "--json", job.project_id, appDir);
  const data = JSON.parse(output);
  return { pitchapp_url: data.pitchapp_url, status: data.status };
}

/**
 * auto-brief — Pull edit briefs using CLI and parse structured JSON.
 * Stores parsed briefs in the job result for downstream consumption by auto-revise.
 */
async function handleAutoBrief(job) {
  const output = runCli("briefs", "--json", job.project_id);
  const briefs = JSON.parse(output);

  // Parse structured edit brief data if available
  const parsedBriefs = briefs.map((brief) => {
    // Each brief may have: section, change_type, description, priority
    return {
      id: brief.id || null,
      section: brief.section || brief.target_section || null,
      change_type: brief.change_type || brief.type || "edit",
      description: brief.description || brief.content || "",
      priority: brief.priority || "medium",
      raw: brief,
    };
  });

  // Save parsed briefs to task dir for auto-revise
  const projects = await dbGet("projects", `select=project_name&id=eq.${job.project_id}`);
  if (projects.length > 0) {
    const safeName = projects[0].project_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const taskDir = join(ROOT, "tasks", safeName);
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(join(taskDir, "edit-briefs.json"), JSON.stringify(parsedBriefs, null, 2));
  }

  return { brief_count: briefs.length, parsed_briefs: parsedBriefs };
}

/**
 * auto-build-html — Agentic tool-use loop to build full HTML/CSS/JS PitchApp.
 *
 * Uses Claude with tools (read_file, write_file, list_files) in a multi-turn
 * conversation loop. Claude reads the copy doc + starter template, then writes
 * a complete PitchApp to apps/{name}/. Writes are sandboxed to the app directory.
 */
async function handleAutoBuildHtml(job) {
  if (await isBuildOverBudget(job.id)) {
    throw new Error("Per-build cost cap exceeded before starting HTML build");
  }

  const projects = await dbGet("projects", `select=*&id=eq.${job.project_id}`);
  if (projects.length === 0) throw new Error("Project not found");

  const project = projects[0];
  const safeName = project.project_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const taskDir = join(ROOT, "tasks", safeName);
  const appDir = join(ROOT, "apps", safeName);
  const copyPath = join(taskDir, "pitchapp-copy.md");

  if (!existsSync(copyPath)) {
    throw new Error(`Copy doc not found: ${copyPath}. Run auto-copy first.`);
  }

  const copyDoc = readFileSync(copyPath, "utf-8");

  // Read starter template files to provide as context
  const templateDir = join(ROOT, "templates/pitchapp-starter");
  const templateHtml = readFileSync(join(templateDir, "index.html"), "utf-8");
  const templateCss = readFileSync(join(templateDir, "css/style.css"), "utf-8");
  const templateJs = readFileSync(join(templateDir, "js/app.js"), "utf-8");

  // Read CONVENTIONS.md (truncated to key sections to save tokens)
  const conventionsPath = join(ROOT, "docs/CONVENTIONS.md");
  let conventions = "";
  if (existsSync(conventionsPath)) {
    const full = readFileSync(conventionsPath, "utf-8");
    // Take first 8000 chars (section catalog + animation system)
    conventions = full.slice(0, 8000);
  }

  // Scan brand assets for manifest (Required Change #5)
  const brandAssetsDir = join(taskDir, "brand-assets");
  let assetManifest = "";
  if (existsSync(brandAssetsDir)) {
    const categories = readdirSync(brandAssetsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    for (const cat of categories) {
      const catFiles = readdirSync(join(brandAssetsDir, cat));
      if (catFiles.length > 0) {
        assetManifest += `\n### ${cat}\n${catFiles.map(f => `- ${cat}/${f}`).join("\n")}`;
      }
    }
  }

  // Ensure app directory exists
  mkdirSync(join(appDir, "css"), { recursive: true });
  mkdirSync(join(appDir, "js"), { recursive: true });
  mkdirSync(join(appDir, "images"), { recursive: true });

  const Anthropic = await loadAnthropicSDK();
  const client = new Anthropic();

  // Define tools for the agent
  const tools = [
    {
      name: "read_file",
      description: "Read a file from the project. Path is relative to the PitchApp root.",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path to read (e.g., 'templates/pitchapp-starter/index.html')" },
        },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      description: "Write a file to the PitchApp app directory. Path is relative to apps/{name}/.",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path within the app directory (e.g., 'index.html', 'css/style.css', 'js/app.js')" },
          content: { type: "string", description: "The complete file content to write" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "list_files",
      description: "List files in a directory. Path is relative to the PitchApp root.",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative directory path (e.g., 'apps/onin' to see a reference build)" },
        },
        required: ["path"],
      },
    },
    {
      name: "copy_brand_asset",
      description: "Copy a brand asset from tasks/{name}/brand-assets/ into the app images/ directory. Skips files over 5MB.",
      input_schema: {
        type: "object",
        properties: {
          source: { type: "string", description: "Path relative to brand-assets/ (e.g., 'logo/logo-dark.png')" },
          dest: { type: "string", description: "Destination filename in images/ (e.g., 'logo.png')" },
        },
        required: ["source", "dest"],
      },
    },
    {
      name: "build_complete",
      description: "Signal that the PitchApp build is complete. Call this when all files have been written.",
      input_schema: {
        type: "object",
        properties: {
          files_written: {
            type: "array",
            items: { type: "string" },
            description: "List of files written (relative to app dir)",
          },
          notes: { type: "string", description: "Any notes about the build" },
        },
        required: ["files_written"],
      },
    },
  ];

  const BUILD_AGENT_SYSTEM = `You are a PitchApp developer building a complete static PitchApp (HTML + CSS + JS).

You have been given:
1. A copy document with section-by-section content
2. A starter template (index.html, css/style.css, js/app.js)
3. PitchApp conventions reference

Your job: produce a complete, working PitchApp by writing index.html, css/style.css, and js/app.js.

## Key Rules
- Use the starter template as your base — don't start from scratch
- Replace {{BRAND}} placeholders with the actual company name
- Build every section from the copy doc using the correct HTML patterns from conventions
- CSS variables for theming: choose brand-appropriate accent color
- GSAP animations: ScrollTrigger for fade-ins, counter animations for stats, parallax for backgrounds
- Register ALL GSAP plugins: gsap.registerPlugin(ScrollTrigger, ScrollToPlugin)
- Use gsap.to() with CSS defaults (opacity: 0), NOT gsap.from() (prevents FOUC)
- Never use CSS scroll-behavior: smooth alongside GSAP
- Include nav with section dots, progress indicator, and section labels
- Mobile responsive with proper breakpoints
- Include OG meta tags, skip link, prefers-reduced-motion support

## Available Tools
- read_file: Read any project file for reference
- write_file: Write files to the app directory (index.html, css/style.css, js/app.js)
- list_files: List files in a directory to explore reference builds
- copy_brand_asset: Copy a brand asset into images/ for use in the build
- build_complete: Signal when you're done

## Brand Assets
${assetManifest ? `The client has provided brand assets. Use them when building sections.

Available assets:${assetManifest}

Use the copy_brand_asset tool to copy assets from brand-assets/ into images/. Reference them via images/{filename} in HTML.
Rules:
- Use the client's logo in the hero and closing sections
- Use hero/team/background images in appropriate sections
- If multiple logos exist, prefer SVG for web quality
- Skip assets over 5MB (the tool will reject them)` : "No brand assets provided. Build without images or use CSS-only patterns."}

Write all three files (index.html, css/style.css, js/app.js), then call build_complete.`;

  const messages = [
    {
      role: "user",
      content: `Build a PitchApp for ${project.company_name} — ${project.project_name}.

## Copy Document
${copyDoc}

## Starter Template — index.html
${templateHtml}

## Starter Template — css/style.css
${templateCss}

## Starter Template — js/app.js
${templateJs}

## Conventions Reference (excerpt)
${conventions}

Build the complete PitchApp. Write index.html, css/style.css, and js/app.js using write_file, then call build_complete.`,
    },
  ];

  let totalCostCents = 0;
  let buildComplete = false;
  let buildResult = { files_written: [], notes: "" };
  const MAX_AGENT_TURNS = 15;

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    // Check budget between turns
    if (turn > 0 && await isBuildOverBudget(job.id)) {
      await logAutomation("build-html-budget-exceeded", { turn, totalCostCents }, job.project_id);
      break;
    }

    const response = await streamMessage(client, {
      model: MODEL_SONNET,
      max_tokens: 16384,
      thinking: { type: "enabled", budget_tokens: 10000 },
      system: BUILD_AGENT_SYSTEM,
      tools,
      messages,
    });

    if (response.usage) {
      const turnCost = estimateCostCents(response.usage, MODEL_SONNET);
      totalCostCents += turnCost;
      await logCost(job.id, project.id, turnCost, `auto-build-html-turn-${turn + 1}`);
    }

    // Process response — may contain text + tool_use blocks
    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    // If stop reason is end_turn (no tool use), we're done
    if (response.stop_reason === "end_turn") {
      break;
    }

    // Process tool calls
    const toolResults = [];
    for (const block of assistantContent) {
      if (block.type !== "tool_use") continue;

      const { name, input, id } = block;
      let result;

      try {
        switch (name) {
          case "read_file": {
            const absPath = join(ROOT, input.path);
            // Sandbox: only allow reading within PitchApp root
            if (!absPath.startsWith(ROOT + "/") && absPath !== ROOT) {
              result = { error: "Access denied: path outside project root" };
            } else if (!existsSync(absPath)) {
              result = { error: `File not found: ${input.path}` };
            } else {
              const content = readFileSync(absPath, "utf-8");
              result = { content: content.slice(0, 50000) }; // Truncate large files
            }
            break;
          }
          case "write_file": {
            // Sandbox: only allow writes within apps/{safeName}/
            const absPath = join(appDir, input.path);
            if (!absPath.startsWith(appDir + "/") && absPath !== appDir) {
              result = { error: "Access denied: writes must be within the app directory" };
            } else {
              // Ensure parent directory exists
              const parentDir = dirname(absPath);
              mkdirSync(parentDir, { recursive: true });
              writeFileSync(absPath, input.content);
              result = { success: true, path: input.path, bytes: input.content.length };
            }
            break;
          }
          case "list_files": {
            const absPath = join(ROOT, input.path);
            if (!absPath.startsWith(ROOT + "/") && absPath !== ROOT) {
              result = { error: "Access denied: path outside project root" };
            } else if (!existsSync(absPath)) {
              result = { error: `Directory not found: ${input.path}` };
            } else {
              const entries = readdirSync(absPath, { withFileTypes: true });
              result = {
                files: entries.map((e) => ({
                  name: e.name,
                  type: e.isDirectory() ? "directory" : "file",
                })),
              };
            }
            break;
          }
          case "copy_brand_asset": {
            const srcPath = join(taskDir, "brand-assets", input.source);
            const destPath = join(appDir, "images", input.dest);
            if (!srcPath.startsWith(join(taskDir, "brand-assets") + "/")) {
              result = { error: "Access denied: source path outside brand-assets/" };
            } else if (!existsSync(srcPath)) {
              result = { error: `Brand asset not found: ${input.source}` };
            } else {
              const fileData = readFileSync(srcPath);
              if (fileData.length > 5 * 1024 * 1024) {
                result = { error: `Asset too large (${Math.round(fileData.length / 1024 / 1024)}MB). Max 5MB for deployed assets.` };
              } else {
                mkdirSync(dirname(destPath), { recursive: true });
                writeFileSync(destPath, fileData);
                result = { success: true, path: `images/${input.dest}`, bytes: fileData.length };
              }
            }
            break;
          }
          case "build_complete": {
            buildComplete = true;
            buildResult = {
              files_written: input.files_written || [],
              notes: input.notes || "",
            };
            result = { status: "Build marked as complete", files: input.files_written };
            break;
          }
          default:
            result = { error: `Unknown tool: ${name}` };
        }
      } catch (err) {
        result = { error: err.message };
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: id,
        content: JSON.stringify(result),
      });
    }

    if (toolResults.length > 0) {
      messages.push({ role: "user", content: toolResults });
    }

    if (buildComplete) break;
  }

  // Capture screenshots if Playwright is available
  let screenshots = [];
  try {
    const { execFileSync: execSync } = await import("child_process");
    const screenshotDir = join(appDir, "screenshots");
    mkdirSync(screenshotDir, { recursive: true });

    // Start local server, capture, kill
    const serverProcess = await import("child_process").then((cp) => {
      return cp.spawn("python3", ["-m", "http.server", "8090"], { cwd: appDir, stdio: "ignore", detached: true });
    });

    // Wait for server to start
    await new Promise((r) => setTimeout(r, 1000));

    try {
      execSync("npx", [
        "playwright", "screenshot",
        "--viewport-size=1440,900", "--full-page",
        "http://localhost:8090", join(screenshotDir, "desktop-full.png"),
      ], { timeout: 30000, stdio: "ignore" });
      screenshots.push("desktop-full.png");
    } catch { /* Playwright not installed — skip */ }

    try {
      execSync("npx", [
        "playwright", "screenshot",
        "--viewport-size=390,844", "--full-page",
        "http://localhost:8090", join(screenshotDir, "mobile-full.png"),
      ], { timeout: 30000, stdio: "ignore" });
      screenshots.push("mobile-full.png");
    } catch { /* skip */ }

    // Kill server
    try { process.kill(-serverProcess.pid); } catch { serverProcess.kill(); }
  } catch {
    // Screenshot capture is best-effort
  }

  return {
    app_dir: appDir,
    files_written: buildResult.files_written,
    build_complete: buildComplete,
    agent_turns: Math.min(messages.filter((m) => m.role === "assistant").length, MAX_AGENT_TURNS),
    total_cost_cents: totalCostCents,
    screenshots,
    notes: buildResult.notes,
  };
}

/**
 * auto-review — Automated multi-perspective review of a built PitchApp.
 *
 * Runs 5 reviewer personas sequentially, each with read-only file access.
 * Synthesizes findings by severity (P0/P1/P2). If P0 issues are found,
 * runs an auto-fix agent (max 2 rounds). Saves report to tasks/{name}/review.md.
 */
async function handleAutoReview(job) {
  if (await isBuildOverBudget(job.id)) {
    throw new Error("Per-build cost cap exceeded before review");
  }

  const projects = await dbGet("projects", `select=*&id=eq.${job.project_id}`);
  if (projects.length === 0) throw new Error("Project not found");

  const project = projects[0];
  const safeName = project.project_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const appDir = join(ROOT, "apps", safeName);
  const taskDir = join(ROOT, "tasks", safeName);

  if (!existsSync(join(appDir, "index.html"))) {
    throw new Error(`PitchApp not found at ${appDir}. Run auto-build-html first.`);
  }

  // Read the built files for review
  const html = readFileSync(join(appDir, "index.html"), "utf-8");
  const css = existsSync(join(appDir, "css/style.css")) ? readFileSync(join(appDir, "css/style.css"), "utf-8") : "";
  const js = existsSync(join(appDir, "js/app.js")) ? readFileSync(join(appDir, "js/app.js"), "utf-8") : "";

  // Read copy doc for comparison
  const copyPath = join(taskDir, "pitchapp-copy.md");
  const copyDoc = existsSync(copyPath) ? readFileSync(copyPath, "utf-8") : "";

  const Anthropic = await loadAnthropicSDK();
  const client = new Anthropic();
  let totalCostCents = 0;

  const fileContext = `## index.html\n\`\`\`html\n${html.slice(0, 30000)}\n\`\`\`\n\n## css/style.css\n\`\`\`css\n${css.slice(0, 20000)}\n\`\`\`\n\n## js/app.js\n\`\`\`javascript\n${js.slice(0, 15000)}\n\`\`\``;

  // Define the 5 reviewer personas
  const reviewers = [
    {
      name: "Product Lead",
      prompt: `You are reviewing a PitchApp for ${project.company_name} as a Product Lead.
Focus: Is this CEO-friendly? Would the target audience get it immediately? Is the narrative arc clear? Does the scroll experience build momentum?

Review these files:
${fileContext}

${copyDoc ? `## Original Copy Doc\n${copyDoc.slice(0, 5000)}` : ""}

List issues as:
- **P0** (blocks ship): Broken functionality, missing sections, wrong company info
- **P1** (fix before ship): Unclear messaging, poor flow, missing OG tags
- **P2** (nice to have): Polish, minor copy tweaks

Format: "[P0/P1/P2] Description of issue — location in code"`,
    },
    {
      name: "Copywriter",
      prompt: `You are reviewing a PitchApp for ${project.company_name} as a Copywriter.
Focus: Does the language feel human and confident? Does copy match the copy doc? Are headlines scannable?

Review these files:
${fileContext}

${copyDoc ? `## Original Copy Doc\n${copyDoc.slice(0, 5000)}` : ""}

BANNED WORDS (flag any occurrence): leverage, unlock, revolutionary, seamlessly, cutting-edge, holistic, robust, scalable, game-changing, innovative, synergy, paradigm, ecosystem, empower, disrupt, transformative, best-in-class, world-class, state-of-the-art, next-generation, end-to-end, turnkey

List issues as P0/P1/P2. Focus on copy quality and banned word violations.`,
    },
    {
      name: "Copy Critic",
      prompt: `You are reviewing a PitchApp for ${project.company_name} as a Copy Critic (AI-detection specialist).
Focus: Flag anything that sounds like AI wrote it. Check for generic statements, stacked adjectives, empty superlatives, mirror structures ("We don't just X, we Y"), buzzword density.

Review the HTML for all visible text:
${fileContext}

Specificity test: For each headline and body text, ask "Could this appear in any company's pitch?" If yes, flag it.

List issues as P0/P1/P2.`,
    },
    {
      name: "UX/UI Expert",
      prompt: `You are reviewing a PitchApp for ${project.company_name} as a UX/UI Expert.
Focus: Scroll flow, visual hierarchy, section spacing, mobile responsiveness (check media queries), card interactions, nav behavior.

Review these files:
${fileContext}

Check for:
- Missing mobile breakpoints
- Sections that would be too tall or too short
- Nav dots/labels missing or incorrect
- Inconsistent spacing (padding/margin)
- Missing hover states
- Accessibility: skip link, reduced motion, aria labels

List issues as P0/P1/P2.`,
    },
    {
      name: "Code Reviewer",
      prompt: `You are reviewing a PitchApp for ${project.company_name} as a Code Reviewer.
Focus: GSAP bugs, FOUC prevention, scroll conflicts, mobile issues, performance.

Review these files:
${fileContext}

Known GSAP gotchas to check:
- ScrollToPlugin registered? (gsap.registerPlugin must include ScrollToPlugin)
- Using gsap.from()? (causes FOUC — should use gsap.to() with CSS defaults)
- CSS scroll-behavior: smooth present? (conflicts with GSAP)
- Unscoped selectors? (.hero-grid-bg hitting multiple sections)
- Counter animations using data-count attributes?
- prefers-reduced-motion respected in both CSS and JS?

List issues as P0/P1/P2.`,
    },
  ];

  // Run each reviewer
  const allFindings = [];
  for (const reviewer of reviewers) {
    if (await isBuildOverBudget(job.id)) break;

    const response = await streamMessage(client, {
      model: MODEL_OPUS,
      max_tokens: 16384,
      thinking: { type: "enabled", budget_tokens: 16000 },
      messages: [{ role: "user", content: reviewer.prompt }],
    });

    if (response.usage) {
      const cost = estimateCostCents(response.usage, MODEL_OPUS);
      totalCostCents += cost;
      await logCost(job.id, project.id, cost, `auto-review-${reviewer.name.toLowerCase().replace(/\s+/g, "-")}`);
    }

    const findings = extractTextContent(response.content);
    allFindings.push({ reviewer: reviewer.name, findings });
  }

  // Synthesize findings
  const synthesisPrompt = `You are synthesizing review findings from 5 reviewers for a PitchApp build.

${allFindings.map((f) => `## ${f.reviewer}\n${f.findings}`).join("\n\n---\n\n")}

Produce a final review report:

1. **Summary**: One paragraph overall assessment
2. **P0 Issues** (blocks ship): Deduplicated, actionable list
3. **P1 Issues** (fix before ship): Deduplicated list
4. **P2 Issues** (nice to have): Deduplicated list
5. **Verdict**: PASS (no P0s), CONDITIONAL (P0s but fixable), or FAIL (fundamental problems)

Deduplicate across reviewers. Keep the most specific description of each issue.`;

  const synthesisResponse = await streamMessage(client, {
    model: MODEL_OPUS,
    max_tokens: 16384,
    thinking: { type: "enabled", budget_tokens: 16000 },
    messages: [{ role: "user", content: synthesisPrompt }],
  });

  if (synthesisResponse.usage) {
    const cost = estimateCostCents(synthesisResponse.usage, MODEL_OPUS);
    totalCostCents += cost;
    await logCost(job.id, project.id, cost, "auto-review-synthesis");
  }

  const report = extractTextContent(synthesisResponse.content);

  // Parse P0 count
  const p0Count = (report.match(/\*\*P0\*\*/gi) || []).length +
    (report.match(/\[P0\]/gi) || []).length;
  const verdict = report.includes("PASS") ? "pass" :
    report.includes("CONDITIONAL") ? "conditional" : "fail";

  // If P0 issues found, attempt auto-fix (max 2 rounds)
  let fixAttempts = 0;
  if (p0Count > 0 && verdict !== "pass" && !await isBuildOverBudget(job.id)) {
    const fixTools = [
      {
        name: "read_file",
        description: "Read a file from the app directory.",
        input_schema: {
          type: "object",
          properties: { path: { type: "string", description: "Relative path within app directory" } },
          required: ["path"],
        },
      },
      {
        name: "write_file",
        description: "Write a file to the app directory.",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative path within app directory" },
            content: { type: "string", description: "Complete file content" },
          },
          required: ["path", "content"],
        },
      },
      {
        name: "fix_complete",
        description: "Signal that fixes have been applied.",
        input_schema: {
          type: "object",
          properties: {
            fixes_applied: { type: "array", items: { type: "string" }, description: "List of fixes applied" },
          },
          required: ["fixes_applied"],
        },
      },
    ];

    for (let round = 0; round < 2; round++) {
      if (await isBuildOverBudget(job.id)) break;

      const currentHtml = readFileSync(join(appDir, "index.html"), "utf-8");
      const currentCss = existsSync(join(appDir, "css/style.css")) ? readFileSync(join(appDir, "css/style.css"), "utf-8") : "";
      const currentJs = existsSync(join(appDir, "js/app.js")) ? readFileSync(join(appDir, "js/app.js"), "utf-8") : "";

      const fixMessages = [
        {
          role: "user",
          content: `Fix the P0 issues in this PitchApp build.

## Review Report
${report}

## Current Files
### index.html
\`\`\`html
${currentHtml.slice(0, 30000)}
\`\`\`

### css/style.css
\`\`\`css
${currentCss.slice(0, 20000)}
\`\`\`

### js/app.js
\`\`\`javascript
${currentJs.slice(0, 15000)}
\`\`\`

Fix all P0 issues. Use write_file to update affected files, then call fix_complete.`,
        },
      ];

      let fixDone = false;
      for (let fixTurn = 0; fixTurn < 5 && !fixDone; fixTurn++) {
        if (await isBuildOverBudget(job.id)) break;

        const fixResponse = await streamMessage(client, {
          model: MODEL_SONNET,
          max_tokens: 16384,
          thinking: { type: "enabled", budget_tokens: 10000 },
          system: "You are a PitchApp developer fixing P0 issues. Be precise and targeted — only fix what's broken.",
          tools: fixTools,
          messages: fixMessages,
        });

        if (fixResponse.usage) {
          const cost = estimateCostCents(fixResponse.usage, MODEL_SONNET);
          totalCostCents += cost;
          await logCost(job.id, project.id, cost, `auto-review-fix-round${round + 1}-turn${fixTurn + 1}`);
        }

        fixMessages.push({ role: "assistant", content: fixResponse.content });

        if (fixResponse.stop_reason === "end_turn") {
          fixDone = true;
          break;
        }

        const toolResults = [];
        for (const block of fixResponse.content) {
          if (block.type !== "tool_use") continue;

          const { name, input, id } = block;
          let result;

          try {
            if (name === "read_file") {
              const absPath = join(appDir, input.path);
              if (!absPath.startsWith(appDir + "/") && absPath !== appDir) {
                result = { error: "Access denied" };
              } else if (!existsSync(absPath)) {
                result = { error: `File not found: ${input.path}` };
              } else {
                result = { content: readFileSync(absPath, "utf-8").slice(0, 50000) };
              }
            } else if (name === "write_file") {
              const absPath = join(appDir, input.path);
              if (!absPath.startsWith(appDir + "/") && absPath !== appDir) {
                result = { error: "Access denied" };
              } else {
                const parentDir = dirname(absPath);
                mkdirSync(parentDir, { recursive: true });
                writeFileSync(absPath, input.content);
                result = { success: true, path: input.path };
              }
            } else if (name === "fix_complete") {
              fixDone = true;
              fixAttempts++;
              result = { status: "Fixes applied", fixes: input.fixes_applied };
            }
          } catch (err) {
            result = { error: err.message };
          }

          toolResults.push({ type: "tool_result", tool_use_id: id, content: JSON.stringify(result) });
        }

        if (toolResults.length > 0) {
          fixMessages.push({ role: "user", content: toolResults });
        }
      }

      if (fixDone) break;
    }
  }

  // Save the review report
  mkdirSync(taskDir, { recursive: true });
  const reportPath = join(taskDir, "review.md");
  const fullReport = `# PitchApp Review Report — ${project.company_name}
Generated: ${new Date().toISOString()}

${report}

---

## Fix Attempts: ${fixAttempts}
## Total Review Cost: $${(totalCostCents / 100).toFixed(2)}

${allFindings.map((f) => `### ${f.reviewer} (Raw)\n${f.findings}`).join("\n\n")}`;

  writeFileSync(reportPath, fullReport);

  return {
    report_path: reportPath,
    verdict,
    p0_count: p0Count,
    fix_attempts: fixAttempts,
    total_cost_cents: totalCostCents,
  };
}

/**
 * auto-revise — Apply edit briefs to an existing PitchApp build.
 *
 * Agentic tool-use loop: reads edit briefs + current PitchApp files,
 * applies targeted changes, re-captures screenshots. Sandboxed writes.
 */
async function handleAutoRevise(job) {
  if (await isBuildOverBudget(job.id)) {
    throw new Error("Per-build cost cap exceeded before revision");
  }

  const projects = await dbGet("projects", `select=*&id=eq.${job.project_id}`);
  if (projects.length === 0) throw new Error("Project not found");

  const project = projects[0];
  const safeName = project.project_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const appDir = join(ROOT, "apps", safeName);
  const taskDir = join(ROOT, "tasks", safeName);

  if (!existsSync(join(appDir, "index.html"))) {
    throw new Error(`PitchApp not found at ${appDir}. Cannot revise without existing build.`);
  }

  // Load edit briefs — from job payload, task dir, or fallback to CLI
  let editBriefs;
  const briefsPath = join(taskDir, "edit-briefs.json");
  if (job.payload?.briefs) {
    editBriefs = job.payload.briefs;
  } else if (existsSync(briefsPath)) {
    editBriefs = JSON.parse(readFileSync(briefsPath, "utf-8"));
  } else {
    // Try pulling fresh briefs
    try {
      const output = runCli("briefs", "--json", job.project_id);
      editBriefs = JSON.parse(output);
    } catch {
      throw new Error("No edit briefs found. Run auto-brief first or provide briefs in job payload.");
    }
  }

  if (!editBriefs || editBriefs.length === 0) {
    return { status: "no_changes", message: "No edit briefs to apply" };
  }

  // Re-pull brand assets — download any new files not already on disk
  // Critical for revision uploads: new assets uploaded via Scout chat must be
  // available locally before the revise agent runs (both standard and animation paths).
  try {
    const assets = await dbGet(
      "brand_assets",
      `select=*&project_id=eq.${job.project_id}&order=category,sort_order`
    );
    if (assets && assets.length > 0) {
      const brandAssetsDir = join(taskDir, "brand-assets");
      let downloadCount = 0;
      for (const asset of assets) {
        const localDir = join(brandAssetsDir, asset.category);
        const localPath = join(localDir, asset.file_name);
        if (!existsSync(localPath)) {
          mkdirSync(localDir, { recursive: true });
          const res = await fetch(
            `${SUPABASE_URL}/storage/v1/object/brand-assets/${asset.storage_path}`,
            {
              headers: {
                apikey: SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
              },
            }
          );
          if (res.ok) {
            const buffer = Buffer.from(await res.arrayBuffer());
            writeFileSync(localPath, buffer);
            downloadCount++;
          }
        }
      }
      if (downloadCount > 0) {
        await logAutomation("revise-assets-pulled", {
          job_id: job.id,
          downloaded: downloadCount,
          total: assets.length,
        }, job.project_id);
      }
    }
  } catch (err) {
    // Non-critical — log and continue. Agent can still apply text-only briefs.
    await logAutomation("revise-assets-pull-failed", {
      job_id: job.id,
      error: err.message,
    }, job.project_id);
  }

  // --- Animation routing: if any brief is animation-related, route to specialist ---
  const hasAnimationBriefs = editBriefs.some(b =>
    b.change_type === "animation" || b.animation_spec
  );
  if (hasAnimationBriefs) {
    return handleAnimationRevise(job, project, appDir, taskDir, editBriefs);
  }

  // Read current files
  const currentHtml = readFileSync(join(appDir, "index.html"), "utf-8");
  const currentCss = existsSync(join(appDir, "css/style.css")) ? readFileSync(join(appDir, "css/style.css"), "utf-8") : "";
  const currentJs = existsSync(join(appDir, "js/app.js")) ? readFileSync(join(appDir, "js/app.js"), "utf-8") : "";

  // Scan brand assets for revision manifest (Required Change #5)
  const brandAssetsDir = join(taskDir, "brand-assets");
  let reviseAssetManifest = "";
  if (existsSync(brandAssetsDir)) {
    const categories = readdirSync(brandAssetsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    for (const cat of categories) {
      const catFiles = readdirSync(join(brandAssetsDir, cat));
      if (catFiles.length > 0) {
        reviseAssetManifest += `\n### ${cat}\n${catFiles.map(f => `- ${cat}/${f}`).join("\n")}`;
      }
    }
  }

  const Anthropic = await loadAnthropicSDK();
  const client = new Anthropic();
  let totalCostCents = 0;

  const reviseTools = [
    {
      name: "read_file",
      description: "Read a file from the app directory.",
      input_schema: {
        type: "object",
        properties: { path: { type: "string", description: "Relative path within app directory" } },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      description: "Write a file to the app directory.",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path within app directory" },
          content: { type: "string", description: "Complete file content" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "copy_brand_asset",
      description: "Copy a brand asset from tasks/{name}/brand-assets/ into the app images/ directory. Skips files over 5MB.",
      input_schema: {
        type: "object",
        properties: {
          source: { type: "string", description: "Path relative to brand-assets/ (e.g., 'logo/logo-dark.png')" },
          dest: { type: "string", description: "Destination filename in images/ (e.g., 'logo.png')" },
        },
        required: ["source", "dest"],
      },
    },
    {
      name: "revision_complete",
      description: "Signal that all edit brief changes have been applied.",
      input_schema: {
        type: "object",
        properties: {
          changes_applied: { type: "array", items: { type: "string" }, description: "List of changes made" },
          briefs_addressed: { type: "array", items: { type: "string" }, description: "Brief IDs/descriptions addressed" },
        },
        required: ["changes_applied"],
      },
    },
  ];

  const briefsSummary = editBriefs.map((b, i) => {
    const desc = b.description || JSON.stringify(b);
    const section = b.section ? ` [Section: ${b.section}]` : "";
    const priority = b.priority ? ` (${b.priority})` : "";
    // Include asset references so the agent knows which files to use
    const assetRefs = b.asset_references?.length
      ? `\n   Assets: ${b.asset_references.map(r => `${r.file_name} → ${r.intent}`).join(", ")}`
      : "";
    return `${i + 1}. ${desc}${section}${priority}${assetRefs}`;
  }).join("\n");

  const messages = [
    {
      role: "user",
      content: `Apply these edit briefs to an existing PitchApp for ${project.company_name}.

## Edit Briefs
${briefsSummary}

## Current Files

### index.html
\`\`\`html
${currentHtml.slice(0, 30000)}
\`\`\`

### css/style.css
\`\`\`css
${currentCss.slice(0, 20000)}
\`\`\`

### js/app.js
\`\`\`javascript
${currentJs.slice(0, 15000)}
\`\`\`

Apply each edit brief precisely. Use write_file to update affected files. When done, call revision_complete with a summary of changes.
${reviseAssetManifest ? `\n## Brand Assets Available\nThe client has provided brand assets you can use:${reviseAssetManifest}\n\nUse copy_brand_asset to copy any asset into images/ if the briefs ask for image changes.` : ""}

IMPORTANT: Preserve existing animations and functionality. Only change what the briefs ask for. Do not restructure or "improve" code that isn't mentioned in the briefs.`,
    },
  ];

  let revisionDone = false;
  let revisionResult = { changes_applied: [], briefs_addressed: [] };
  const MAX_REVISE_TURNS = 10;

  for (let turn = 0; turn < MAX_REVISE_TURNS; turn++) {
    if (turn > 0 && await isBuildOverBudget(job.id)) break;

    const response = await streamMessage(client, {
      model: MODEL_SONNET,
      max_tokens: 16384,
      thinking: { type: "enabled", budget_tokens: 10000 },
      system: "You are a PitchApp developer applying targeted revisions from edit briefs. Be precise — only change what's requested. Preserve all existing functionality.",
      tools: reviseTools,
      messages,
    });

    if (response.usage) {
      const cost = estimateCostCents(response.usage, MODEL_SONNET);
      totalCostCents += cost;
      await logCost(job.id, project.id, cost, `auto-revise-turn-${turn + 1}`);
    }

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") break;

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      const { name, input, id } = block;
      let result;

      try {
        if (name === "read_file") {
          const absPath = join(appDir, input.path);
          if (!absPath.startsWith(appDir + "/") && absPath !== appDir) {
            result = { error: "Access denied" };
          } else if (!existsSync(absPath)) {
            result = { error: `File not found: ${input.path}` };
          } else {
            result = { content: readFileSync(absPath, "utf-8").slice(0, 50000) };
          }
        } else if (name === "write_file") {
          const absPath = join(appDir, input.path);
          if (!absPath.startsWith(appDir + "/") && absPath !== appDir) {
            result = { error: "Access denied" };
          } else {
            const parentDir = dirname(absPath);
            mkdirSync(parentDir, { recursive: true });
            writeFileSync(absPath, input.content);
            result = { success: true, path: input.path };
          }
        } else if (name === "copy_brand_asset") {
          const srcPath = join(taskDir, "brand-assets", input.source);
          const destPath = join(appDir, "images", input.dest);
          if (!srcPath.startsWith(join(taskDir, "brand-assets") + "/")) {
            result = { error: "Access denied: source path outside brand-assets/" };
          } else if (!existsSync(srcPath)) {
            result = { error: `Brand asset not found: ${input.source}` };
          } else {
            const fileData = readFileSync(srcPath);
            if (fileData.length > 5 * 1024 * 1024) {
              result = { error: `Asset too large (${Math.round(fileData.length / 1024 / 1024)}MB). Max 5MB for deployed assets.` };
            } else {
              mkdirSync(dirname(destPath), { recursive: true });
              writeFileSync(destPath, fileData);
              result = { success: true, path: `images/${input.dest}`, bytes: fileData.length };
            }
          }
        } else if (name === "revision_complete") {
          revisionDone = true;
          revisionResult = {
            changes_applied: input.changes_applied || [],
            briefs_addressed: input.briefs_addressed || [],
          };
          result = { status: "Revision complete" };
        }
      } catch (err) {
        result = { error: err.message };
      }

      toolResults.push({ type: "tool_result", tool_use_id: id, content: JSON.stringify(result) });
    }

    if (toolResults.length > 0) {
      messages.push({ role: "user", content: toolResults });
    }

    if (revisionDone) break;
  }

  // Update project status
  try {
    await dbPatch("projects", `id=eq.${job.project_id}`, {
      status: "review",
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Non-critical
  }

  return {
    app_dir: appDir,
    briefs_count: editBriefs.length,
    changes_applied: revisionResult.changes_applied,
    briefs_addressed: revisionResult.briefs_addressed,
    revision_complete: revisionDone,
    total_cost_cents: totalCostCents,
  };
}

/**
 * handleAnimationRevise — Animation-specialist variant of auto-revise.
 *
 * Same agentic loop as handleAutoRevise but with:
 * - Animation specialist system prompt (GSAP safety rules, pattern library)
 * - Expanded tool set (existing 4 + lookup_pattern, read_reference, validate_animation)
 * - MAX_ANIMATE_TURNS = 12 (animation needs pattern lookup + multi-file writes)
 * - AnimationSpec metadata in user message
 * - Post-write safety validation via animation-validator
 */
async function handleAnimationRevise(job, project, appDir, taskDir, editBriefs) {
  // Read current files
  const currentHtml = readFileSync(join(appDir, "index.html"), "utf-8");
  const currentCss = existsSync(join(appDir, "css/style.css")) ? readFileSync(join(appDir, "css/style.css"), "utf-8") : "";
  const currentJs = existsSync(join(appDir, "js/app.js")) ? readFileSync(join(appDir, "js/app.js"), "utf-8") : "";

  // Scan brand assets for revision manifest
  const brandAssetsDir = join(taskDir, "brand-assets");
  let reviseAssetManifest = "";
  if (existsSync(brandAssetsDir)) {
    const categories = readdirSync(brandAssetsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    for (const cat of categories) {
      const catFiles = readdirSync(join(brandAssetsDir, cat));
      if (catFiles.length > 0) {
        reviseAssetManifest += `\n### ${cat}\n${catFiles.map(f => `- ${cat}/${f}`).join("\n")}`;
      }
    }
  }

  const Anthropic = await loadAnthropicSDK();
  const client = new Anthropic();
  let totalCostCents = 0;

  // Base tools (same as standard revise, with extended revision_complete)
  const baseTools = [
    {
      name: "read_file",
      description: "Read a file from the app directory.",
      input_schema: {
        type: "object",
        properties: { path: { type: "string", description: "Relative path within app directory" } },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      description: "Write a file to the app directory. Always write the COMPLETE file content.",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path within app directory" },
          content: { type: "string", description: "Complete file content" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "copy_brand_asset",
      description: "Copy a brand asset from tasks/{name}/brand-assets/ into the app images/ directory. Skips files over 5MB.",
      input_schema: {
        type: "object",
        properties: {
          source: { type: "string", description: "Path relative to brand-assets/ (e.g., 'logo/logo-dark.png')" },
          dest: { type: "string", description: "Destination filename in images/ (e.g., 'logo.png')" },
        },
        required: ["source", "dest"],
      },
    },
    {
      name: "revision_complete",
      description: "Signal that all animation changes have been applied. Include patterns used and gotchas verified.",
      input_schema: {
        type: "object",
        properties: {
          changes_applied: { type: "array", items: { type: "string" }, description: "List of changes made" },
          briefs_addressed: { type: "array", items: { type: "string" }, description: "Brief IDs/descriptions addressed" },
          patterns_used: { type: "array", items: { type: "string" }, description: "Proven patterns used (e.g., 'character_decode', 'terminal_typing')" },
          gotchas_verified: { type: "array", items: { type: "string" }, description: "Gotchas checked (e.g., 'no_gsap_from', 'selectors_scoped', 'mobile_fallback')" },
        },
        required: ["changes_applied", "gotchas_verified"],
      },
    },
  ];

  const animateTools = [...baseTools, ...ANIMATION_TOOL_DEFINITIONS];

  // Build brief summary with AnimationSpec metadata
  const briefsSummary = editBriefs.map((b, i) => {
    const desc = b.description || JSON.stringify(b);
    const section = b.section ? ` [Section: ${b.section}]` : "";
    const priority = b.priority ? ` (${b.priority})` : "";
    const assetRefs = b.asset_references?.length
      ? `\n   Assets: ${b.asset_references.map(r => `${r.file_name} → ${r.intent}`).join(", ")}`
      : "";
    // Include AnimationSpec metadata for the specialist
    let animSpec = "";
    if (b.animation_spec) {
      const spec = b.animation_spec;
      animSpec = `\n   AnimationSpec: type=${spec.animation_type}, complexity=${spec.complexity}`;
      if (spec.target) animSpec += `, target=${spec.target.selector || spec.target.element_type}`;
      if (spec.timing) animSpec += `, trigger=${spec.timing.trigger}${spec.timing.feel ? ", feel=" + spec.timing.feel : ""}`;
      if (spec.pattern_reference) animSpec += `, reference=${spec.pattern_reference.source_app}/${spec.pattern_reference.reference}`;
      if (spec.mobile_behavior) animSpec += `, mobile=${spec.mobile_behavior}`;
      if (spec.reduced_motion_behavior) animSpec += `, reduced_motion=${spec.reduced_motion_behavior}`;
    }
    return `${i + 1}. ${desc}${section}${priority}${assetRefs}${animSpec}`;
  }).join("\n");

  const messages = [
    {
      role: "user",
      content: `Apply these animation/effect edit briefs to an existing PitchApp for ${project.company_name}.

## Edit Briefs
${briefsSummary}

## Current Files

### index.html
\`\`\`html
${currentHtml.slice(0, 30000)}
\`\`\`

### css/style.css
\`\`\`css
${currentCss.slice(0, 20000)}
\`\`\`

### js/app.js
\`\`\`javascript
${currentJs.slice(0, 15000)}
\`\`\`

Follow your 5-step process: Interpret → Map → Plan → Implement → Verify.
Use lookup_pattern to load proven pattern details before implementing.
Use read_reference to see how patterns work in production builds.
Use validate_animation to check your JS before writing.
When done, call revision_complete with patterns_used and gotchas_verified.
${reviseAssetManifest ? `\n## Brand Assets Available\n${reviseAssetManifest}\n\nUse copy_brand_asset to copy any asset into images/ if needed.` : ""}
IMPORTANT: Preserve existing animations and functionality. Only change what the briefs ask for.`,
    },
  ];

  let revisionDone = false;
  let revisionResult = { changes_applied: [], briefs_addressed: [], patterns_used: [], gotchas_verified: [] };
  const MAX_ANIMATE_TURNS = 12;
  const conventionsPath = join(ROOT, "docs/CONVENTIONS.md");

  for (let turn = 0; turn < MAX_ANIMATE_TURNS; turn++) {
    if (turn > 0 && await isBuildOverBudget(job.id)) break;

    const response = await streamMessage(client, {
      model: MODEL_SONNET,
      max_tokens: 16384,
      thinking: { type: "enabled", budget_tokens: 10000 },
      system: ANIMATION_SPECIALIST_SYSTEM,
      tools: animateTools,
      messages,
    });

    if (response.usage) {
      const cost = estimateCostCents(response.usage, MODEL_SONNET);
      totalCostCents += cost;
      await logCost(job.id, project.id, cost, `auto-animate-turn-${turn + 1}`);
    }

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") break;

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      const { name, input, id } = block;
      let result;

      try {
        if (name === "read_file") {
          const absPath = join(appDir, input.path);
          if (!absPath.startsWith(appDir + "/") && absPath !== appDir) {
            result = { error: "Access denied" };
          } else if (!existsSync(absPath)) {
            result = { error: `File not found: ${input.path}` };
          } else {
            result = { content: readFileSync(absPath, "utf-8").slice(0, 50000) };
          }
        } else if (name === "write_file") {
          const absPath = join(appDir, input.path);
          if (!absPath.startsWith(appDir + "/") && absPath !== appDir) {
            result = { error: "Access denied" };
          } else {
            const parentDir = dirname(absPath);
            mkdirSync(parentDir, { recursive: true });
            writeFileSync(absPath, input.content);
            result = { success: true, path: input.path };
          }
        } else if (name === "copy_brand_asset") {
          const srcPath = join(taskDir, "brand-assets", input.source);
          const destPath = join(appDir, "images", input.dest);
          if (!srcPath.startsWith(join(taskDir, "brand-assets") + "/")) {
            result = { error: "Access denied: source path outside brand-assets/" };
          } else if (!existsSync(srcPath)) {
            result = { error: `Brand asset not found: ${input.source}` };
          } else {
            const fileData = readFileSync(srcPath);
            if (fileData.length > 5 * 1024 * 1024) {
              result = { error: `Asset too large (${Math.round(fileData.length / 1024 / 1024)}MB). Max 5MB for deployed assets.` };
            } else {
              mkdirSync(dirname(destPath), { recursive: true });
              writeFileSync(destPath, fileData);
              result = { success: true, path: `images/${input.dest}`, bytes: fileData.length };
            }
          }
        } else if (name === "revision_complete") {
          revisionDone = true;
          revisionResult = {
            changes_applied: input.changes_applied || [],
            briefs_addressed: input.briefs_addressed || [],
            patterns_used: input.patterns_used || [],
            gotchas_verified: input.gotchas_verified || [],
          };
          result = { status: "Revision complete" };

        // --- Animation specialist tools ---
        } else if (name === "lookup_pattern") {
          if (!existsSync(conventionsPath)) {
            result = { error: "CONVENTIONS.md not found" };
          } else {
            const conventions = readFileSync(conventionsPath, "utf-8");
            const mapping = PATTERN_SECTIONS[input.pattern_name];
            if (!mapping) {
              result = { error: `Unknown pattern: ${input.pattern_name}` };
            } else {
              const startIdx = conventions.indexOf(mapping.start);
              const endIdx = conventions.indexOf(mapping.end);
              if (startIdx === -1) {
                result = { error: "Pattern section not found in CONVENTIONS.md" };
              } else {
                const section = conventions.slice(startIdx, endIdx > startIdx ? endIdx : startIdx + 3000);
                result = { pattern: input.pattern_name, content: section.trim() };
              }
            }
          }
        } else if (name === "read_reference") {
          const REFERENCE_BUILDS = ["bonfire", "shareability", "onin"];
          if (!REFERENCE_BUILDS.includes(input.build)) {
            result = { error: `Unknown build: ${input.build}. Available: ${REFERENCE_BUILDS.join(", ")}` };
          } else {
            const absPath = join(ROOT, "apps", input.build, input.file);
            if (!absPath.startsWith(join(ROOT, "apps", input.build) + "/")) {
              result = { error: "Access denied: path traversal" };
            } else if (!existsSync(absPath)) {
              result = { error: `File not found: apps/${input.build}/${input.file}` };
            } else {
              const content = readFileSync(absPath, "utf-8").slice(0, 30000);
              result = { build: input.build, file: input.file, content };
            }
          }
        } else if (name === "validate_animation") {
          const violations = validateAnimation(input.js_content || "", input.css_content || "");
          result = {
            valid: !hasCriticalViolations(violations),
            violations: violations,
            summary: formatViolations(violations),
          };
        }
      } catch (err) {
        result = { error: err.message };
      }

      toolResults.push({ type: "tool_result", tool_use_id: id, content: JSON.stringify(result) });
    }

    if (toolResults.length > 0) {
      messages.push({ role: "user", content: toolResults });
    }

    if (revisionDone) break;
  }

  // --- Post-write safety net ---
  try {
    const finalJsPath = join(appDir, "js/app.js");
    const finalCssPath = join(appDir, "css/style.css");
    const finalJs = existsSync(finalJsPath) ? readFileSync(finalJsPath, "utf-8") : "";
    const finalCss = existsSync(finalCssPath) ? readFileSync(finalCssPath, "utf-8") : "";
    const violations = validateAnimation(finalJs, finalCss);
    if (violations.length > 0) {
      await logAutomation("animation-safety-violations", {
        job_id: job.id,
        violations: violations.map(v => `[${v.level}] ${v.rule}: ${v.message}`),
        has_critical: hasCriticalViolations(violations),
      }, job.project_id);
    }
  } catch (err) {
    // Non-critical — log and continue
    await logAutomation("animation-safety-check-failed", {
      job_id: job.id,
      error: err.message,
    }, job.project_id);
  }

  // Update project status
  try {
    await dbPatch("projects", `id=eq.${job.project_id}`, {
      status: "review",
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Non-critical
  }

  return {
    app_dir: appDir,
    briefs_count: editBriefs.length,
    changes_applied: revisionResult.changes_applied,
    briefs_addressed: revisionResult.briefs_addressed,
    patterns_used: revisionResult.patterns_used,
    gotchas_verified: revisionResult.gotchas_verified,
    revision_complete: revisionDone,
    total_cost_cents: totalCostCents,
    handler: "animation-specialist",
  };
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
// Materials Loader — reads text, PDF, images, and Office files as Anthropic content blocks
// ---------------------------------------------------------------------------

const IMAGE_MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// Office XML formats: zip archives containing XML we can extract text from
const OFFICE_XML_FORMATS = new Set([".pptx", ".docx", ".xlsx"]);

// Legacy binary Office formats — no simple extraction without a library
const LEGACY_OFFICE_FORMATS = new Set([".ppt", ".doc", ".xls", ".key"]);

const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB — Anthropic limit is ~32MB
const MAX_TOTAL_BASE64 = 20 * 1024 * 1024; // 20MB total base64 budget — leaves headroom for prompt text + JSON overhead

/**
 * Extract text content from an Office XML file (.pptx, .docx, .xlsx).
 * These are ZIP archives — we use the system `unzip` command to extract
 * the XML content, then strip tags to get plain text.
 */
function extractOfficeText(filePath, ext) {
  try {
    let xmlPaths;
    if (ext === ".pptx") {
      xmlPaths = "ppt/slides/slide*.xml";
    } else if (ext === ".docx") {
      xmlPaths = "word/document.xml";
    } else if (ext === ".xlsx") {
      xmlPaths = "xl/sharedStrings.xml";
    } else {
      return null;
    }

    const raw = execFileSync("unzip", ["-p", filePath, xmlPaths], {
      encoding: "utf-8",
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    // Strip XML tags, collapse whitespace, clean up
    const text = raw
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, "")
      .replace(/\s+/g, " ")
      .trim();

    return text || null;
  } catch {
    return null;
  }
}

/**
 * Load materials directory as an array of Anthropic API content blocks.
 * - .txt, .md, .csv → { type: "text", text: "..." }
 * - .pdf → { type: "document", source: { type: "base64", ... } }
 * - .png, .jpg, .jpeg, .gif, .webp → { type: "image", source: { type: "base64", ... } }
 * - .pptx, .docx, .xlsx → text extracted from XML inside zip
 * - .ppt, .doc, .xls, .key → warning (binary formats need LibreOffice)
 * Files over 30MB are skipped.
 */
function loadMaterialsAsContentBlocks(materialsDir) {
  const blocks = [];
  if (!existsSync(materialsDir)) return blocks;

  let files;
  try {
    files = readdirSync(materialsDir);
  } catch {
    return blocks;
  }

  // Sort files: PDFs first (most likely to contain the deck), then images, then others.
  // This ensures the most important files get included before hitting the budget.
  const priority = { ".pdf": 0, ".png": 1, ".jpg": 1, ".jpeg": 1, ".gif": 1, ".webp": 1 };
  files.sort((a, b) => {
    const extA = a.substring(a.lastIndexOf(".")).toLowerCase();
    const extB = b.substring(b.lastIndexOf(".")).toLowerCase();
    return (priority[extA] ?? 2) - (priority[extB] ?? 2);
  });

  let totalBase64Bytes = 0; // Track cumulative base64 size for binary attachments

  for (const file of files) {
    const filePath = join(materialsDir, file);
    const ext = file.substring(file.lastIndexOf(".")).toLowerCase();

    try {
      if (!existsSync(filePath)) continue;
      const fileData = readFileSync(filePath);

      // Check file size
      if (fileData.length > MAX_FILE_SIZE) {
        blocks.push({ type: "text", text: `[Skipped ${file} — ${Math.round(fileData.length / 1024 / 1024)}MB exceeds 30MB limit]` });
        continue;
      }

      if (ext === ".txt" || ext === ".md" || ext === ".csv") {
        // Text files are always included (small relative to binary)
        const content = fileData.toString("utf-8");
        blocks.push({ type: "text", text: `--- ${file} ---\n${content}` });
      } else if (ext === ".pdf") {
        const base64 = fileData.toString("base64");
        // Check budget before adding
        if (totalBase64Bytes + base64.length > MAX_TOTAL_BASE64) {
          blocks.push({ type: "text", text: `[Skipped ${file} — total attachment size would exceed API limit]` });
          continue;
        }
        totalBase64Bytes += base64.length;
        blocks.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        });
        blocks.push({ type: "text", text: `[Attached PDF: ${file}]` });
      } else if (IMAGE_MIME_TYPES[ext]) {
        const base64 = fileData.toString("base64");
        if (totalBase64Bytes + base64.length > MAX_TOTAL_BASE64) {
          blocks.push({ type: "text", text: `[Skipped ${file} — total attachment size would exceed API limit]` });
          continue;
        }
        totalBase64Bytes += base64.length;
        blocks.push({
          type: "image",
          source: { type: "base64", media_type: IMAGE_MIME_TYPES[ext], data: base64 },
        });
        blocks.push({ type: "text", text: `[Attached image: ${file}]` });
      } else if (OFFICE_XML_FORMATS.has(ext)) {
        // Modern Office formats — extract text from XML inside the zip
        const text = extractOfficeText(filePath, ext);
        if (text) {
          blocks.push({ type: "text", text: `--- ${file} (extracted text) ---\n${text}` });
        } else {
          blocks.push({ type: "text", text: `[Could not extract text from ${file}]` });
        }
      } else if (LEGACY_OFFICE_FORMATS.has(ext)) {
        blocks.push({ type: "text", text: `[Unsupported legacy format: ${file} — please re-upload as PDF or .pptx/.docx]` });
      } else {
        blocks.push({ type: "text", text: `[Skipped unsupported file: ${file}]` });
      }
    } catch (err) {
      blocks.push({ type: "text", text: `[Failed to read ${file}: ${err.message}]` });
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// AI Invocation Helpers (isolated for swapability)
// ---------------------------------------------------------------------------

/**
 * Invoke Claude to extract a narrative from mission materials.
 * Uses the Anthropic SDK directly with extended thinking.
 *
 * Embeds the full @narrative-strategist methodology:
 * - Story discovery over structure application
 * - Emotional arc mapping
 * - Self-critique loop (flow, salesy, length, proof checks)
 * - Banned word list
 * - Gut-check framework
 */
async function invokeClaudeNarrative(project, missionContent, materialBlocks, jobId, revisionNotes) {
  const Anthropic = await loadAnthropicSDK();
  const client = new Anthropic();

  const NARRATIVE_SYSTEM_PROMPT = `You are a narrative strategist for PitchApp — a premium scroll-driven presentation platform.

## Core Principle

**Story discovery over structure application.**

Your goal is NOT to organize information into a template. It is to find the arc that's already in the material — the evolution, the proof point, the "oh shit" moment that makes it click. A good narrative makes someone see the world through a new lens. When they finish, they should think: "I get it. And I see where I'd fit."

## First Step

Before writing anything, answer these questions internally:
1. What's the STORY here? Not the business model — the story. Is it evolution? Transformation? A shift someone saw before others?
2. What's the ONE proof point that makes skeptics believe?
3. What would we send if we didn't care about being safe? Not salesy, not hedged — confident.

If you can't answer these, dig deeper into the material before writing.

## Process

### Phase 1: Find the Story
Read the material looking for:
- **The arc** — What's the journey? What led to what? What did one thing prove that opened the next?
- **The turning point** — What moment changed everything? What proof point makes the rest credible?
- **The throughline** — What word or concept connects everything?

Don't categorize yet. Don't organize. Find the spine.

### Phase 2: Draft the Narrative
Write a first pass. Keep it short. Focus on flow, not completeness.
The narrative should be readable in under 2 minutes. If it's longer, you're explaining too much.

## Emotional Arc

Every narrative must manage the reader's emotional state at each beat:

| Beat | Target Emotion | Reader Should Think... |
|------|---------------|----------------------|
| Problem | Recognition + concern | "I've seen this problem — it's real" |
| Insight | Surprise + reframe | "I never thought of it that way" |
| Solution | Excitement + clarity | "This makes sense, this could work" |
| Proof | Confidence + trust | "This is real, not just theory" |
| Team | Credibility + connection | "These people can actually do this" |
| Ask | Urgency + partnership | "I want to be part of this" |

The emotional arc must BUILD — each beat raises the stakes.

## Story Structures

Choose the shape that fits the content:
- **Evolution Arc:** Era 1 → Era 2 → Era 3 → what each proved → where it's going
- **Proof-Led:** The proof point (detailed) → what made it possible → what it unlocks
- **Shift-Led:** The shift happening in the world → why this company is positioned → what they've done
- **Problem-Solution (Classic):** Pain point + why now → insight others missed → what was built → proof it works → what comes next

## BANNED WORDS — Never use these (they signal AI-generated copy):
leverage, unlock, revolutionary, seamlessly, cutting-edge, holistic, robust, scalable, game-changing, innovative, synergy, paradigm, ecosystem, empower, disrupt, transformative, best-in-class, world-class, state-of-the-art, next-generation, end-to-end, turnkey

Replace with specific, human alternatives. If a sentence has 3+ of these, rewrite from scratch.

## Output Format

Produce a structured narrative brief in markdown:

\`\`\`
# [Company Name] - Narrative Brief

## One-Liner
[Single sentence that captures the essence]

## The Story
[The core narrative in 2-3 paragraphs — this is the spine]

## Key Beats
[Bulleted breakdown of main sections/moments, with emotional target for each]

## Strongest Proof Point
[The single most compelling piece of evidence]

## Pull Quotes
> "[Direct quote that captures voice — from materials if available]"

## Unique Angles
- [What makes this different]
- [Contrarian elements worth emphasizing]

## Suggested Section Map
1. Hero — [beat summary]
2. Text-Centered — [beat summary]
3. [Continue mapping beats to PitchApp section types...]

## Open Questions / Gaps
- [Information missing that would strengthen the narrative]

---

## Gut-Check

**Is this the real story?** [Yes/No/Uncertain — and why]

**What's the one thing someone will remember?** [Specific answer]

**What's still weak?** [Honest assessment]

**Confidence level:** [1-10]
\`\`\`

## Quality Standards

The narrative MUST:
- Have a clear arc (not just organized information)
- Elevate the strongest proof point
- Be readable in under 2 minutes
- Sound confident, not salesy
- Be specific to THIS company (no generic business language)

The narrative MUST NOT:
- Feel like separate things stapled together
- Bury the most compelling elements
- Explain when it could show
- Use filler phrases ("we believe", "our mission is", "we're passionate about")
- Use any word from the banned list`;

  const revisionBlock = revisionNotes
    ? `\n\nIMPORTANT — REVISION REQUEST:
The client reviewed a previous version and provided this feedback:
${revisionNotes}

Rework the narrative to address this feedback while preserving what was working. Map the feedback using these common translations:
- "This doesn't feel like us" → You found a structure, not the story
- "It's too long" → You're explaining, not showing
- "It feels salesy" → Too tailored, not confident enough
- "Something's missing" → The real proof point isn't elevated
- "These feel like separate things" → The arc isn't clear — what connects them?`
    : "";

  const messages = [];
  let totalCostCents = 0;

  // --- Turn 1: Generate initial narrative ---
  const turn1Content = [
    { type: "text", text: `Here is the mission data for ${project.company_name} — ${project.project_name}:\n\n${missionContent}` },
    ...(materialBlocks.length > 0 ? [{ type: "text", text: "\nAdditional materials:" }, ...materialBlocks] : []),
    { type: "text", text: `${revisionBlock}\n\nExtract the narrative. Be specific to this company and their story.` },
  ];
  messages.push({ role: "user", content: turn1Content });

  const turn1 = await streamMessage(client, {
    model: MODEL_OPUS,
    max_tokens: 64000,
    thinking: { type: "enabled", budget_tokens: 32000 },
    system: NARRATIVE_SYSTEM_PROMPT,
    messages,
  });

  if (turn1.usage) {
    const turn1Cost = estimateCostCents(turn1.usage, MODEL_OPUS);
    totalCostCents += turn1Cost;
    await logCost(jobId, project.id, turn1Cost, "auto-narrative-t1");
  }

  const draft = extractTextContent(turn1.content);
  messages.push({ role: "assistant", content: draft });

  // --- Turn 2: Self-critique with confidence score ---
  messages.push({
    role: "user",
    content: `Now critique this narrative. Run all four checks:

**Flow check:**
- Does each section lead to the next, or do they feel like separate things stapled together?
- Is there a clear arc?
- Would someone remember this tomorrow?

**Salesy check:**
- Does it sound like it's trying to convince, or does it sound confident?
- Would you be embarrassed to send this to someone smart?

**Length check:**
- Is this the shortest version that tells the whole story?
- What can be cut without losing meaning?

**Proof check:**
- Is the strongest proof point elevated, or is it buried?
- Are there specific numbers, names, outcomes — or just claims?

Also check for banned words: leverage, unlock, revolutionary, seamlessly, cutting-edge, holistic, robust, scalable, game-changing, innovative, synergy, paradigm, ecosystem, empower, disrupt, transformative, best-in-class, world-class, state-of-the-art, next-generation, end-to-end, turnkey.

End your critique with a confidence score: "CONFIDENCE: X/10" where X is how ready this narrative is for the client.`,
  });

  const turn2 = await streamMessage(client, {
    model: MODEL_OPUS,
    max_tokens: 16384,
    thinking: { type: "enabled", budget_tokens: 16000 },
    system: NARRATIVE_SYSTEM_PROMPT,
    messages,
  });

  if (turn2.usage) {
    const turn2Cost = estimateCostCents(turn2.usage, MODEL_OPUS);
    totalCostCents += turn2Cost;
    await logCost(jobId, project.id, turn2Cost, "auto-narrative-t2");
  }

  const critique = extractTextContent(turn2.content);
  messages.push({ role: "assistant", content: critique });

  // Parse confidence score from critique
  const confidenceMatch = critique.match(/CONFIDENCE:\s*(\d+)\s*\/\s*10/i);
  const confidence = confidenceMatch ? parseInt(confidenceMatch[1], 10) : 0;

  // --- Turn 3: Revise (skip if confidence >= 8) ---
  let finalNarrative = draft;

  if (confidence < 8) {
    messages.push({
      role: "user",
      content: `Based on your critique, revise the narrative. Address every issue you identified. Produce the complete revised narrative brief in the same format — not a diff, the full document.`,
    });

    const turn3 = await streamMessage(client, {
      model: MODEL_OPUS,
      max_tokens: 64000,
      thinking: { type: "enabled", budget_tokens: 32000 },
      system: NARRATIVE_SYSTEM_PROMPT,
      messages,
    });

    if (turn3.usage) {
      const turn3Cost = estimateCostCents(turn3.usage, MODEL_OPUS);
      totalCostCents += turn3Cost;
      await logCost(jobId, project.id, turn3Cost, "auto-narrative-t3");
    }

    finalNarrative = extractTextContent(turn3.content);
    messages.push({ role: "assistant", content: finalNarrative });

    // --- Turn 4: Final gut-check ---
    messages.push({
      role: "user",
      content: `Final gut-check on the revised narrative:

1. **Is this the real story?** Yes/No/Uncertain — and why.
2. **What's the one thing someone will remember?**
3. **What's still weak?**
4. **Final confidence:** 1-10

If anything is still below a 7, make one more targeted fix and output the FINAL narrative. Otherwise, confirm the revised version is ready.`,
    });

    const turn4 = await streamMessage(client, {
      model: MODEL_SONNET,
      max_tokens: 16384,
      thinking: { type: "enabled", budget_tokens: 10000 },
      system: NARRATIVE_SYSTEM_PROMPT,
      messages,
    });

    if (turn4.usage) {
      const turn4Cost = estimateCostCents(turn4.usage, MODEL_SONNET);
      totalCostCents += turn4Cost;
      await logCost(jobId, project.id, turn4Cost, "auto-narrative-t4");
    }

    const gutCheck = extractTextContent(turn4.content);

    // If gut-check produced a new narrative (contains the header), use that instead
    if (gutCheck.includes("# ") && gutCheck.includes("## One-Liner")) {
      finalNarrative = gutCheck;
    }
  }

  return finalNarrative;
}

/**
 * Invoke Claude to build PitchApp copy from a narrative.
 * Uses the Anthropic SDK directly with extended thinking.
 *
 * Embeds the full @copywriter methodology:
 * - 13 section types with copy constraints
 * - Specificity test
 * - Banned word list
 * - Hero archetype guidance
 * - AI pattern recognition
 */
async function invokeClaudeBuild(project, narrative, safeName, jobId) {
  const Anthropic = await loadAnthropicSDK();
  const client = new Anthropic();

  const BUILD_SYSTEM_PROMPT = `You are a PitchApp copywriter. Given a narrative brief, generate a complete, production-ready PitchApp copy document.

## Your Job

Transform the narrative brief into polished, section-by-section copy for a scroll-driven PitchApp — a premium alternative to slide decks. The copy must be confident, concise, and specific to THIS company.

## 13 Section Types (with Copy Constraints)

Each section type has specific copy requirements. Write copy that FITS the type — don't force long paragraphs into a Metric Grid or complex layouts into Text-Centered.

| # | Type | Class | Copy Needed | Constraints |
|---|------|-------|-------------|-------------|
| 1 | **Hero** | .section-hero | Title (brand name) + tagline (one line) + scroll prompt | Title + tagline ONLY, minimal text. No paragraphs. |
| 2 | **Text-Centered** | .section-text-centered | Label (eyebrow) + headline with \`<em>\` emphasis | Headline ~15 words max. No body copy. Mark 2-3 words with \`<em>\` for accent color. |
| 3 | **Numbered Grid** | .section-numbered-grid | Label + exactly 4 items (number 01-04 + text with optional \`<strong>\`) | EXACTLY 4 items. Each item: number + short text. No paragraphs. |
| 4 | **Background Stats** | .section-bg-stats | Label + headline (~10 words) + 2-4 stats (\`data-count\`, \`data-prefix\`, \`data-suffix\`) + callout pills | Stats need numeric values for counter animation. Headline ~10 words. |
| 5 | **Metric Grid** | .section-metric-grid | Label + exactly 3 items (big value + description) + optional summary paragraph | EXACTLY 3 metrics. Big numbers with context. |
| 6 | **Background Statement** | .section-bg-statement | Eyebrow label + big title (~8 words, can be italic) + subtitle + optional description | Title should be a bold claim or vision statement. Keep it punchy. |
| 7 | **Card Gallery** | .section-card-gallery | Headline (~12 words) + description + 2-6 cards (image direction + label) | Cards need image descriptions for art direction. |
| 8 | **Split Image+Text** | .section-split | Label + headline (~8 words with \`<em>\`) + description + optional sub-description | 50/50 layout. Copy on one side, image direction for other. |
| 9 | **List** | .section-list | Label + headline (~8 words) + 3-6 items with icons (X for negative, → for positive) | Front-load important words. Parallel structure. |
| 10 | **Dual Panel** | .section-dual-panel | Two panels, each with headline (~4 words) | Very short headlines. Visual contrast does the work. |
| 11 | **Team Grid** | .section-team-grid | Label + headline (~8 words) + 3-9 cards (name + role) | Circular photo layout. Name + role only. |
| 12 | **Summary** | .section-summary | Label ("In Summary") + 3-6 numbered blocks (number + text) | Numbered takeaways. Each should stand alone. |
| 13 | **Closing** | .section-closing | Title (echo hero) + tagline + CTA ("Back to Top") | Brand echo. Match the hero energy. |

## Hero Archetype Guidance

The hero section is the biggest creative decision. Recommend one:

| Archetype | Best For | Copy Tone |
|-----------|----------|-----------|
| **Cinematic Photo** | Emotional, founder-led, storytelling brands | Warm, personal, evocative — let the image do the heavy lifting |
| **Abstract Grid** | Tech-forward, intellectual, data-driven brands | Clean, precise, confident — the grid signals sophistication |
| **Video + Content** | Media, content, social brands — high energy | Bold, dynamic, action-oriented — match the energy of the medium |

Include a hero type recommendation with a one-line rationale.

## Copy Quality Guardrails

### The Specificity Test
If a sentence could appear in ANY company's pitch without modification, it's too generic. Make it specific to THIS company.

**Bad:** "Our innovative platform leverages cutting-edge AI to deliver seamless experiences."
**Good:** "We process 2M images a day. Response time: 40ms. No one else is close."

**Bad:** "A world-class team with deep expertise."
**Good:** "3 ex-Stripe engineers who built the payments API used by 4M businesses."

### BANNED WORDS — Never use these (they signal AI-generated copy):
leverage, unlock, revolutionary, seamlessly, cutting-edge, holistic, robust, scalable, game-changing, innovative, synergy, paradigm, ecosystem, empower, disrupt, transformative, best-in-class, world-class, state-of-the-art, next-generation, end-to-end, turnkey

### Pattern Recognition — Watch for and eliminate:
- **Stacked adjectives:** "innovative, scalable, robust solution" → pick ONE and prove it
- **Empty superlatives:** "best-in-class" without saying best at what, measured how
- **Vague impact claims:** "transforming the industry" → what changed, for whom, by how much?
- **Buzzword density:** If a sentence has 3+ banned words, rewrite from scratch
- **Mirror structure:** "We don't just X, we Y" — this pattern is overused to the point of parody

### Writing Guidelines
- **Headlines:** Lead with benefit or insight, not feature. Use active voice. Be specific.
- **Body copy:** Short sentences. Short paragraphs. One idea per paragraph. Cut every word that doesn't earn its place.
- **Emphasis (\`<em>\`):** Mark words that carry meaning — key metrics, differentiators, emotional hooks. Don't over-emphasize.
- **Bullets:** Parallel structure. Front-load important words. Cut articles (a, an, the).

## Output Format

Produce a structured markdown copy document:

\`\`\`
# PitchApp Section Copy — [Company Name]

## Meta
- **Title:** [For <title> tag and og:title]
- **Subtitle:** [For og:description]
- **OG Description:** [One-line for link previews]

## Hero Type Recommendation
**Type:** [Cinematic Photo / Abstract Grid / Video + Content]
**Rationale:** [One line on why]

## Section 1: Hero — [Company Name]
**Intent:** [What the first impression should feel]
- **Title:** [Company name]
- **Tagline:** [One-liner]
- **Scroll prompt:** "Scroll"

## Section 2: [Type] — [Section Title]
**Intent:** [Why this section exists — what should the reader feel after it?]
- **Label:** "[EYEBROW]"
- **Headline:** [With <em>emphasis</em> if applicable]
[Additional fields per section type]

[Continue for all sections...]

## Section N: Closing
- **Title:** [Brand echo]
- **Tagline:** [Tagline echo]
- **CTA:** "Back to Top"

---

## Animation Notes
[Per-section animation suggestions]

## Image Suggestions
[Per-section image direction]
\`\`\``;

  const messages = [];
  let totalCostCents = 0;

  // --- Turn 1: Generate initial copy ---
  messages.push({
    role: "user",
    content: `Build PitchApp copy for ${project.company_name} — ${project.project_name}.

Narrative brief:
${narrative}

Project type: ${project.type || "investor-deck"}
Target audience: ${project.target_audience || "Not specified"}

Generate the complete section-by-section copy document.`,
  });

  const turn1 = await streamMessage(client, {
    model: MODEL_OPUS,
    max_tokens: 64000,
    thinking: { type: "enabled", budget_tokens: 32000 },
    system: BUILD_SYSTEM_PROMPT,
    messages,
  });

  if (turn1.usage) {
    const turn1Cost = estimateCostCents(turn1.usage, MODEL_OPUS);
    totalCostCents += turn1Cost;
    await logCost(jobId, project.id, turn1Cost, "auto-build-t1");
  }

  const draft = extractTextContent(turn1.content);
  messages.push({ role: "assistant", content: draft });

  // Check budget before Turn 2
  if (await isBuildOverBudget(jobId)) {
    return saveBuildCopy(draft, safeName, "Budget cap reached after Turn 1 — skipped critique.");
  }

  // --- Turn 2: Banned-word check + specificity test ---
  messages.push({
    role: "user",
    content: `Review the copy you just generated. Run these checks:

**Banned Word Scan:**
Check every sentence for these words: leverage, unlock, revolutionary, seamlessly, cutting-edge, holistic, robust, scalable, game-changing, innovative, synergy, paradigm, ecosystem, empower, disrupt, transformative, best-in-class, world-class, state-of-the-art, next-generation, end-to-end, turnkey.

List every instance found with the section and sentence.

**Specificity Test:**
For each section, ask: "Could this sentence appear in any company's pitch without modification?" Flag every generic sentence.

**Pattern Recognition:**
Flag any: stacked adjectives, empty superlatives, vague impact claims, buzzword density (3+ banned words in one sentence), mirror structure ("We don't just X, we Y").

**Section Constraint Check:**
- Hero: title + tagline only? No paragraphs?
- Text-Centered: headline ~15 words? Has <em> tags?
- Numbered Grid: exactly 4 items?
- Background Stats: has data-count values? Headline ~10 words?
- Metric Grid: exactly 3 items?
- Summary: 3-6 numbered blocks?

List all violations. Be thorough.`,
  });

  const turn2 = await streamMessage(client, {
    model: MODEL_SONNET,
    max_tokens: 16384,
    thinking: { type: "enabled", budget_tokens: 10000 },
    system: BUILD_SYSTEM_PROMPT,
    messages,
  });

  if (turn2.usage) {
    const turn2Cost = estimateCostCents(turn2.usage, MODEL_SONNET);
    totalCostCents += turn2Cost;
    await logCost(jobId, project.id, turn2Cost, "auto-build-t2");
  }

  const review = extractTextContent(turn2.content);
  messages.push({ role: "assistant", content: review });

  // Check budget before Turn 3
  if (await isBuildOverBudget(jobId)) {
    return saveBuildCopy(draft, safeName, "Budget cap reached after Turn 2 — used uncorrected draft.");
  }

  // --- Turn 3: Revise based on review ---
  messages.push({
    role: "user",
    content: `Based on your review, produce the FINAL revised copy document. Fix every issue you identified:
- Replace all banned words with specific alternatives
- Make generic sentences specific to ${project.company_name}
- Fix all section constraint violations
- Eliminate pattern tells (stacked adjectives, mirror structure, etc.)

Output the complete copy document — not a diff, the full revised document.`,
  });

  const turn3 = await streamMessage(client, {
    model: MODEL_OPUS,
    max_tokens: 64000,
    thinking: { type: "enabled", budget_tokens: 32000 },
    system: BUILD_SYSTEM_PROMPT,
    messages,
  });

  if (turn3.usage) {
    const turn3Cost = estimateCostCents(turn3.usage, MODEL_OPUS);
    totalCostCents += turn3Cost;
    await logCost(jobId, project.id, turn3Cost, "auto-build-t3");
  }

  const finalCopy = extractTextContent(turn3.content);

  return saveBuildCopy(finalCopy, safeName, "Copy document generated with multi-turn critique.");
}

/**
 * Save build copy to disk and return result metadata.
 */
function saveBuildCopy(copyText, safeName, note) {
  const taskDir = join(ROOT, "tasks", safeName);
  mkdirSync(taskDir, { recursive: true });
  const copyPath = join(taskDir, "pitchapp-copy.md");
  writeFileSync(copyPath, copyText);

  return {
    copy_path: copyPath,
    word_count: copyText.split(/\s+/).length,
    note,
  };
}

/**
 * Extract text content from a Claude API response content array.
 * When extended thinking is enabled, the response may contain both
 * "thinking" blocks and "text" blocks. This returns the first text block.
 */
function extractTextContent(contentBlocks) {
  if (!Array.isArray(contentBlocks)) return "";
  const textBlock = contentBlocks.find((b) => b.type === "text");
  return textBlock?.text || "";
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
  // Main sequence: pull → narrative → [approval] → copy → build-html → review → push
  // Revision sequence: brief → revise → push
  const PIPELINE_SEQUENCE = {
    "auto-pull": "auto-narrative",
    "auto-narrative": null,          // Requires narrative approval before copy
    "auto-build": "auto-build-html", // Legacy alias: copy → html build
    "auto-copy": "auto-build-html",  // Copy doc → HTML build
    "auto-build-html": "auto-review",
    "auto-review": "auto-push",
    "auto-brief": "auto-revise",     // Brief → revise
    "auto-revise": "auto-push",      // Revision → push
    // auto-push is terminal
  };

  // C4: If auto-review completed, check verdict before creating auto-push
  if (completedJob.job_type === "auto-review") {
    const verdict = result?.verdict;
    if (verdict !== "pass" && verdict !== "conditional") {
      await logAutomation("review-blocked-push", {
        previous_job_id: completedJob.id,
        verdict: verdict || "unknown",
      }, completedJob.project_id);
      return; // Don't create auto-push — review didn't pass
    }
  }

  const nextType = PIPELINE_SEQUENCE[completedJob.job_type];
  if (!nextType) return;

  // Project-level job lock: prevent concurrent auto-revise jobs.
  // If an auto-brief just completed and wants to create auto-revise,
  // check that no auto-revise is already queued/running for this project.
  if (nextType === "auto-revise") {
    try {
      const activeRevise = await dbGet(
        "pipeline_jobs",
        `select=id&project_id=eq.${completedJob.project_id}&job_type=eq.auto-revise&status=in.(queued,running)`
      );
      if (activeRevise.length > 0) {
        await logAutomation("revise-job-skipped-concurrent", {
          previous_job_id: completedJob.id,
          existing_job_id: activeRevise[0].id,
        }, completedJob.project_id);
        return; // Don't create — one is already in flight
      }
    } catch {
      // If query fails, proceed cautiously (create the job)
    }
  }

  // Brief accumulation cooldown: if creating auto-revise and cooldown hasn't expired,
  // don't create the job yet. The next pipeline cycle will check again.
  if (nextType === "auto-revise") {
    try {
      const cooldownCheck = await dbGet(
        "projects",
        `select=revision_cooldown_until&id=eq.${completedJob.project_id}`
      );
      const cooldownUntil = cooldownCheck[0]?.revision_cooldown_until;
      if (cooldownUntil && new Date(cooldownUntil) > new Date()) {
        await logAutomation("revise-job-deferred-cooldown", {
          previous_job_id: completedJob.id,
          cooldown_until: cooldownUntil,
        }, completedJob.project_id);
        return; // Don't create yet — client may still be giving feedback
      }
    } catch {
      // If query fails, proceed (create the job)
    }
  }

  // Check project autonomy level for job status
  const projects = await dbGet("projects", `select=autonomy_level&id=eq.${completedJob.project_id}`);
  const autonomy = projects[0]?.autonomy_level || "supervised";

  // H1: auto-build follow-up ALWAYS starts as "pending" (needs narrative approval gate)
  // Everything else: queued for full_auto, pending for supervised
  let jobStatus;
  if (nextType === "auto-build") {
    jobStatus = "pending"; // Always needs narrative approval
  } else {
    jobStatus = autonomy === "full_auto" ? "queued" : "pending";
  }

  // C4: For conditional review verdict, force auto-push to pending (needs human check)
  if (completedJob.job_type === "auto-review" && result?.verdict === "conditional") {
    jobStatus = "pending";
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
// Main — Long-running polling loop
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

async function main() {
  console.log(JSON.stringify({ status: "started", poll_interval_ms: POLL_INTERVAL_MS }));

  while (true) {
    try {
      await run();
    } catch (err) {
      console.error(JSON.stringify({ error: err.message, stack: err.stack }));
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main();
