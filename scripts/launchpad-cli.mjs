#!/usr/bin/env node

/**
 * Launchpad CLI — Bridge between PitchApp build pipeline and Launchpad Portal
 *
 * Usage:
 *   node scripts/launchpad-cli.mjs missions                    List active missions
 *   node scripts/launchpad-cli.mjs pull <id-or-name>           Pull mission data + documents
 *   node scripts/launchpad-cli.mjs push <id-or-name> <dir>     Deploy to Vercel + push URL to portal
 *   node scripts/launchpad-cli.mjs briefs <id-or-name>         Get Scout edit briefs
 *   node scripts/launchpad-cli.mjs status <id-or-name> <s>     Update project status
 *   node scripts/launchpad-cli.mjs manifest <id-or-name> <dir> Extract + push manifest independently
 *   node scripts/launchpad-cli.mjs preview <id-or-name>        Open deployed PitchApp URL in browser
 *
 * Reads credentials from env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
 * with fallback to apps/portal/.env.local.
 *
 * Flags:
 *   --json           Output machine-readable JSON instead of formatted text
 *   --status <s>     Filter missions by status (comma-separated)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Flag parsing
// ---------------------------------------------------------------------------

const rawArgs = process.argv.slice(2);
const JSON_MODE = rawArgs.includes("--json");

function extractFlag(args, flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return { value: null, rest: args };
  const value = args[idx + 1] || null;
  const rest = [...args.slice(0, idx), ...args.slice(idx + (value ? 2 : 1))];
  return { value, rest };
}

// Strip --json and --status from args before passing to commands
let cleanArgs = rawArgs.filter((a) => a !== "--json");
const statusFilter = extractFlag(cleanArgs, "--status");
const STATUS_FILTER = statusFilter.value;
cleanArgs = statusFilter.rest;

/** Print to stdout only when not in --json mode */
function log(...args) {
  if (!JSON_MODE) console.log(...args);
}

/** Print to stderr (always visible, even in --json mode) */
function logErr(...args) {
  console.error(...args);
}

/** Output JSON result and exit (for --json mode) */
function outputJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// Config — env var fallback
// ---------------------------------------------------------------------------

function readFromEnvFile(key) {
  const envPath = join(ROOT, "apps/portal/.env.local");
  if (!existsSync(envPath)) return undefined;

  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (match && match[1] === key) return match[2].trim();
  }
  return undefined;
}

function loadEnv() {
  const url = process.env.SUPABASE_URL || readFromEnvFile("NEXT_PUBLIC_SUPABASE_URL");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || readFromEnvFile("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) {
    logErr("Error: Missing Supabase credentials.");
    logErr("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars,");
    logErr("or ensure apps/portal/.env.local exists with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  return { url, key };
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

function headers(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function dbGet(url, key, table, query = "") {
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    headers: headers(key),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DB GET ${table} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function dbPatch(url, key, table, query, body) {
  const h = headers(key);
  h["Prefer"] = "return=representation";
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: h,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DB PATCH ${table} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function dbPost(url, key, table, body) {
  const h = headers(key);
  h["Prefer"] = "return=representation,resolution=merge-duplicates";
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DB POST ${table} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function storageList(url, key, bucket, prefix) {
  const res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify({ prefix, limit: 100 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Storage list failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function storageDownload(url, key, bucket, path) {
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Storage download failed (${res.status}): ${path}`);
  }
  return res;
}

async function storageUpload(url, key, bucket, path, fileBuffer, contentType = "image/png") {
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: fileBuffer,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Storage upload failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// ID Resolution — supports full UUIDs, prefixes, and company name matching
// ---------------------------------------------------------------------------

async function resolveProjectId(url, key, idOrName) {
  // Try exact UUID match first
  if (idOrName.match(/^[0-9a-f]{8}-[0-9a-f]{4}-/i)) {
    return idOrName;
  }

  // Fetch all projects and match by prefix or company name
  const projects = await dbGet(
    url,
    key,
    "projects",
    "select=id,project_name,company_name&order=updated_at.desc"
  );

  // Try ID prefix match
  const byPrefix = projects.filter((p) => p.id.startsWith(idOrName));
  if (byPrefix.length === 1) return byPrefix[0].id;
  if (byPrefix.length > 1) {
    console.error(`Ambiguous ID prefix "${idOrName}" matches ${byPrefix.length} projects:`);
    byPrefix.forEach((p) => console.error(`  ${p.id}  ${p.company_name} — ${p.project_name}`));
    process.exit(1);
  }

  // Try company name match (case-insensitive, partial)
  const needle = idOrName.toLowerCase();
  const byName = projects.filter(
    (p) =>
      (p.company_name || '').toLowerCase().includes(needle) ||
      (p.project_name || '').toLowerCase().includes(needle)
  );
  if (byName.length === 1) return byName[0].id;
  if (byName.length > 1) {
    console.error(`"${idOrName}" matches ${byName.length} projects:`);
    byName.forEach((p) => console.error(`  ${p.id}  ${p.company_name} — ${p.project_name}`));
    console.error("Use a more specific name or the full ID.");
    process.exit(1);
  }

  console.error(`No project found matching: ${idOrName}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdMissions() {
  const { url, key } = loadEnv();
  let projects = await dbGet(
    url,
    key,
    "projects",
    "select=id,project_name,company_name,type,status,pitchapp_url,created_at,updated_at&order=updated_at.desc"
  );

  // Apply --status filter if provided
  if (STATUS_FILTER) {
    const statuses = STATUS_FILTER.split(",").map((s) => s.trim().toLowerCase());
    projects = projects.filter((p) => statuses.includes(p.status));
  }

  if (JSON_MODE) {
    outputJson(projects);
    return projects;
  }

  if (projects.length === 0) {
    log("No missions found.");
    return [];
  }

  log(`\n  LAUNCHPAD MISSIONS (${projects.length} total)\n`);
  log("  " + "-".repeat(100));

  for (const p of projects) {
    const status = p.status.padEnd(12);
    const type = p.type.replace("_", " ").padEnd(16);
    const updated = new Date(p.updated_at).toLocaleDateString();
    const hasUrl = p.pitchapp_url ? "+" : "-";
    log(
      `  [${hasUrl}] ${status} ${p.company_name.padEnd(20)} ${type} ${updated.padEnd(12)} ${p.id}`
    );
  }

  log("\n  " + "-".repeat(100));
  log("  [+] = has PitchApp URL   [-] = no URL yet");
  log("  Tip: you can use a company name or ID prefix instead of the full UUID.");
  log(`\n  Use: node scripts/launchpad-cli.mjs pull <id-or-name>\n`);

  return projects;
}

async function cmdPull(idOrName) {
  if (!idOrName) {
    logErr("Usage: node scripts/launchpad-cli.mjs pull <id-or-name>");
    logErr("\nRun 'missions' first to see available projects.");
    process.exit(1);
  }

  const { url, key } = loadEnv();
  const projectId = await resolveProjectId(url, key, idOrName);

  // Fetch project
  const projects = await dbGet(
    url,
    key,
    "projects",
    `select=*&id=eq.${projectId}`
  );

  if (projects.length === 0) {
    logErr(`Project not found: ${projectId}`);
    process.exit(1);
  }

  const project = projects[0];
  const safeName = project.company_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const taskDir = join(ROOT, "tasks", safeName);

  log(`\n  Pulling mission: ${project.project_name} (${project.company_name})`);
  log(`  Status: ${project.status}`);
  log(`  Type: ${project.type}`);

  // Create task directory
  mkdirSync(taskDir, { recursive: true });
  mkdirSync(join(taskDir, "materials"), { recursive: true });

  // Download documents
  let docCount = 0;
  const downloadedDocs = [];
  try {
    const files = await storageList(url, key, "documents", `${projectId}/`);
    const realFiles = files.filter((f) => f.name !== ".emptyFolderPlaceholder");

    if (realFiles.length > 0) {
      log(`  Downloading ${realFiles.length} document(s)...`);

      for (const file of realFiles) {
        const filePath = `${projectId}/${file.name}`;
        // Strip timestamp prefix for local filename
        const localName = file.name.replace(/^\d+_/, "");
        const localPath = join(taskDir, "materials", localName);

        try {
          const res = await storageDownload(url, key, "documents", filePath);
          const buffer = Buffer.from(await res.arrayBuffer());
          writeFileSync(localPath, buffer);
          log(`    -> ${localName} (${formatSize(buffer.length)})`);
          docCount++;
          downloadedDocs.push({ name: localName, size: buffer.length, path: localPath });
        } catch (err) {
          logErr(`    !! Failed to download ${file.name}: ${err.message}`);
        }
      }
    }
  } catch {
    log("  No documents found (or bucket not accessible).");
  }

  // Download brand assets
  let assetCount = 0;
  try {
    const assets = await dbGet(
      url,
      key,
      "brand_assets",
      `select=*&project_id=eq.${projectId}&order=category,sort_order`
    );

    if (assets.length > 0) {
      log(`  Downloading ${assets.length} brand asset(s)...`);
      for (const asset of assets) {
        const localDir = join(taskDir, "brand-assets", asset.category);
        mkdirSync(localDir, { recursive: true });

        const localName = asset.file_name;
        const localPath = join(localDir, localName);

        try {
          const res = await storageDownload(url, key, "brand-assets", asset.storage_path);
          const buffer = Buffer.from(await res.arrayBuffer());
          writeFileSync(localPath, buffer);
          log(`    -> brand-assets/${asset.category}/${localName} (${formatSize(buffer.length)})`);
          assetCount++;
        } catch (err) {
          logErr(`    !! Failed to download brand asset ${asset.file_name}: ${err.message}`);
        }
      }
    }
  } catch {
    log("  No brand assets found (or table not accessible).");
  }

  // Fetch edit briefs (scout messages with edit_brief_md)
  let briefs = [];
  try {
    briefs = await dbGet(
      url,
      key,
      "scout_messages",
      `select=id,content,edit_brief_md,created_at&project_id=eq.${projectId}&edit_brief_md=not.is.null&order=created_at.desc`
    );
  } catch {
    // Table may not exist yet or no briefs
  }

  // Write mission.md
  const missionMd = buildMissionMd(project, docCount, briefs);
  const missionPath = join(taskDir, "mission.md");
  writeFileSync(missionPath, missionMd);
  log(`\n  Mission file: ${missionPath}`);

  // Write briefs if any
  if (briefs.length > 0) {
    mkdirSync(join(taskDir, "briefs"), { recursive: true });
    for (let i = 0; i < briefs.length; i++) {
      const brief = briefs[i];
      const briefPath = join(taskDir, "briefs", `brief-${i + 1}.md`);
      writeFileSync(briefPath, brief.edit_brief_md);
      log(`  Brief ${i + 1}: ${briefPath}`);
    }
  }

  // Auto-update status to in_progress if currently requested
  let statusChanged = false;
  if (project.status === "requested") {
    await dbPatch(url, key, "projects", `id=eq.${projectId}`, {
      status: "in_progress",
      updated_at: new Date().toISOString(),
    });
    log(`  Status: requested → in_progress`);
    statusChanged = true;
  }

  log(`\n  Mission pulled to: ${taskDir}/`);
  log("  Ready for build pipeline.\n");

  const result = { project, taskDir, docCount, assetCount, documents: downloadedDocs, briefs: briefs.length, statusChanged };

  if (JSON_MODE) {
    outputJson(result);
  }

  return result;
}

async function cmdPush(arg1, arg2, arg3) {
  // Two modes:
  //   push <id-or-name> <local-path>            — deploy to Vercel, then push URL
  //   push <id-or-name> <url> [local-path]       — push an already-deployed URL (legacy)
  if (!arg1 || !arg2) {
    logErr("Usage: node scripts/launchpad-cli.mjs push <id-or-name> <local-path>");
    logErr("       node scripts/launchpad-cli.mjs push <id-or-name> <url> [local-path]");
    process.exit(1);
  }

  let pitchappUrl;
  let localPath;

  if (arg2.startsWith("https://")) {
    // Legacy mode: URL provided directly
    pitchappUrl = arg2;
    localPath = arg3 || null;
  } else {
    // New mode: deploy first, then push
    localPath = arg2;
    const dirPath = resolve(localPath);
    if (!existsSync(dirPath)) {
      logErr(`Error: Directory not found: ${dirPath}`);
      process.exit(1);
    }
    if (!existsSync(join(dirPath, "index.html"))) {
      logErr(`Error: No index.html found in ${dirPath}`);
      logErr("Make sure you're pointing to the PitchApp directory.");
      process.exit(1);
    }

    log(`\n  Deploying to Vercel from: ${dirPath}`);
    pitchappUrl = deployToVercel(dirPath);
  }

  const { url, key } = loadEnv();
  const projectId = await resolveProjectId(url, key, arg1);

  // Update project with URL and set status to review
  const updated = await dbPatch(url, key, "projects", `id=eq.${projectId}`, {
    pitchapp_url: pitchappUrl,
    status: "review",
    updated_at: new Date().toISOString(),
  });

  if (updated.length === 0) {
    logErr(`Project not found: ${projectId}`);
    process.exit(1);
  }

  const project = updated[0];
  log(`\n  PitchApp URL pushed to Launchpad.`);
  log(`  Project: ${project.project_name} (${project.company_name})`);
  log(`  URL: ${pitchappUrl}`);
  log(`  Status: review`);

  // Extract and push manifest
  let manifestResult = null;
  if (localPath) {
    const dirPath = resolve(localPath);
    if (existsSync(dirPath)) {
      log(`\n  Extracting manifest from: ${dirPath}`);
      const manifest = extractManifest(dirPath);
      if (manifest) {
        manifest.meta.source_url = pitchappUrl;
        try {
          await dbPost(url, key, "pitchapp_manifests", {
            project_id: projectId,
            sections: manifest.sections,
            design_tokens: manifest.design_tokens,
            raw_copy: manifest.raw_copy,
            meta: manifest.meta,
            updated_at: new Date().toISOString(),
          });
          log(`  Manifest pushed: ${manifest.meta.total_sections} sections, ${manifest.meta.total_words} words`);
          log(`  Design tokens: ${Object.keys(manifest.design_tokens.colors).length} colors, ${Object.keys(manifest.design_tokens.fonts).length} fonts`);
          manifestResult = manifest.meta;
        } catch (err) {
          logErr(`  Warning: Failed to push manifest: ${err.message}`);
          logErr("  The URL was pushed successfully. Manifest can be retried.");
        }
      }
    }
  }

  // Capture and upload screenshots (soft dependency — skip if Playwright unavailable)
  if (!JSON_MODE) {
    await captureScreenshots(url, key, projectId, pitchappUrl);
  }

  log(`\n  The client can now preview their PitchApp in the portal.\n`);

  const result = {
    project_id: project.id,
    project_name: project.project_name,
    company_name: project.company_name,
    pitchapp_url: pitchappUrl,
    status: "review",
    manifest: manifestResult,
  };

  if (JSON_MODE) {
    outputJson(result);
  }

  return project;
}

// ---------------------------------------------------------------------------
// Vercel Deploy — runs `vercel --prod` and extracts the production URL
// ---------------------------------------------------------------------------

function deployToVercel(dirPath) {
  try {
    const output = execSync("vercel --prod --yes 2>&1", {
      cwd: dirPath,
      encoding: "utf-8",
      timeout: 120000,
    });

    // Vercel outputs the production URL — find it in the output
    // Typical output includes a line like: Production: https://app-name.vercel.app [Xs]
    // or just the URL on its own line
    const urlMatch = output.match(/https:\/\/[^\s\[\]]+\.vercel\.app/);
    if (!urlMatch) {
      // Check for custom domain URLs
      const customMatch = output.match(/https:\/\/[^\s\[\]]+\.[^\s\[\]]+/g);
      if (customMatch && customMatch.length > 0) {
        // Last URL is typically the production one
        const prodUrl = customMatch[customMatch.length - 1];
        console.log(`  Deployed: ${prodUrl}`);
        return prodUrl;
      }
      console.error("\n  Vercel deployment output:");
      console.error(output);
      console.error("\n  Error: Could not extract production URL from Vercel output.");
      console.error("  Deploy manually with `vercel --prod` and use the URL mode:");
      console.error("    push <id-or-name> <url> <local-path>");
      process.exit(1);
    }

    console.log(`  Deployed: ${urlMatch[0]}`);
    return urlMatch[0];
  } catch (err) {
    const stderr = err.stderr || err.stdout || err.message || "";
    console.error(`\n  Vercel deploy failed:`);
    console.error(`  ${stderr.split("\n").slice(0, 5).join("\n  ")}`);
    console.error("\n  Make sure Vercel CLI is installed and the project is linked.");
    console.error("  Run `vercel link` in the PitchApp directory first if needed.");
    process.exit(1);
  }
}

async function cmdBriefs(idOrName) {
  if (!idOrName) {
    logErr("Usage: node scripts/launchpad-cli.mjs briefs <id-or-name>");
    process.exit(1);
  }

  const { url, key } = loadEnv();
  const projectId = await resolveProjectId(url, key, idOrName);

  // Fetch project name
  const projects = await dbGet(url, key, "projects", `select=id,project_name,company_name&id=eq.${projectId}`);
  if (projects.length === 0) {
    logErr(`Project not found: ${projectId}`);
    process.exit(1);
  }

  const project = projects[0];

  // Fetch edit briefs
  const briefs = await dbGet(
    url,
    key,
    "scout_messages",
    `select=id,content,edit_brief_md,created_at&project_id=eq.${projectId}&edit_brief_md=not.is.null&order=created_at.desc`
  );

  if (JSON_MODE) {
    outputJson(briefs);
    return briefs;
  }

  if (briefs.length === 0) {
    log(`\n  No edit briefs found for: ${project.project_name} (${project.company_name})`);
    log("  The client hasn't requested any changes via Scout yet.\n");
    return [];
  }

  const safeName = project.company_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const briefDir = join(ROOT, "tasks", safeName, "briefs");
  mkdirSync(briefDir, { recursive: true });

  log(`\n  Edit briefs for: ${project.project_name} (${project.company_name})`);
  log(`  ${briefs.length} brief(s) found.\n`);

  for (let i = 0; i < briefs.length; i++) {
    const brief = briefs[i];
    const date = new Date(brief.created_at).toLocaleDateString();
    const briefPath = join(briefDir, `brief-${i + 1}.md`);
    writeFileSync(briefPath, brief.edit_brief_md);
    log(`  Brief ${i + 1} (${date}):`);
    // Show first 3 lines as preview
    const preview = brief.edit_brief_md.split("\n").slice(0, 3).join("\n");
    log(`    ${preview.replace(/\n/g, "\n    ")}`);
    log(`    -> Saved to: ${briefPath}\n`);
  }

  log(`  Briefs saved to: ${briefDir}/`);
  log("  Ready for revision pipeline.\n");

  return briefs;
}

async function cmdStatus(idOrName, status) {
  const VALID = ["requested", "brand_collection", "in_progress", "review", "revision", "live", "on_hold"];

  if (!idOrName || !status) {
    logErr("Usage: node scripts/launchpad-cli.mjs status <id-or-name> <status>");
    logErr(`Valid statuses: ${VALID.join(", ")}`);
    process.exit(1);
  }

  if (!VALID.includes(status)) {
    logErr(`Invalid status: ${status}`);
    logErr(`Valid statuses: ${VALID.join(", ")}`);
    process.exit(1);
  }

  const { url, key } = loadEnv();
  const projectId = await resolveProjectId(url, key, idOrName);

  const updated = await dbPatch(url, key, "projects", `id=eq.${projectId}`, {
    status,
    updated_at: new Date().toISOString(),
  });

  if (updated.length === 0) {
    logErr(`Project not found: ${projectId}`);
    process.exit(1);
  }

  const project = updated[0];

  if (JSON_MODE) {
    outputJson({ project_id: project.id, project_name: project.project_name, company_name: project.company_name, status });
    return project;
  }

  log(`\n  Status updated.`);
  log(`  Project: ${project.project_name} (${project.company_name})`);
  log(`  Status: ${status}\n`);

  return project;
}

// ---------------------------------------------------------------------------
// Screenshot Capture — uses Playwright to capture desktop + mobile screenshots
// ---------------------------------------------------------------------------

async function captureScreenshots(url, key, projectId, pitchappUrl) {
  // Check if Playwright is available
  try {
    execSync("npx playwright --version", { stdio: "ignore" });
  } catch {
    console.log("\n  Skipping screenshots (Playwright not available).");
    console.log("  Install with: npx playwright install chromium");
    return;
  }

  console.log("\n  Capturing screenshots...");

  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    const tmpFile = join(ROOT, `.tmp-screenshot-${vp.name}.png`);
    try {
      execSync(
        `npx playwright screenshot --viewport-size="${vp.width},${vp.height}" --full-page "${pitchappUrl}" "${tmpFile}"`,
        { stdio: "pipe", timeout: 30000 }
      );

      const buffer = readFileSync(tmpFile);
      await storageUpload(url, key, "screenshots", `${projectId}/${vp.name}.png`, buffer);
      console.log(`    ${vp.name} (${vp.width}x${vp.height}): uploaded (${formatSize(buffer.length)})`);

      unlinkSync(tmpFile);
    } catch (err) {
      console.error(`    ${vp.name}: failed — ${err.message?.split("\n")[0] || "unknown error"}`);
      try { unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Manifest Extraction — parse PitchApp HTML + CSS into structured data
// ---------------------------------------------------------------------------

function extractManifest(dirPath) {
  const htmlPath = join(dirPath, "index.html");
  const cssPath = join(dirPath, "css/style.css");

  if (!existsSync(htmlPath)) {
    console.error(`  Warning: ${htmlPath} not found, skipping manifest extraction.`);
    return null;
  }

  const html = readFileSync(htmlPath, "utf-8");
  const css = existsSync(cssPath) ? readFileSync(cssPath, "utf-8") : "";

  // --- Parse sections from HTML ---
  const sections = [];
  const sectionRegex = /<section\b([^>]*)>([\s\S]*?)<\/section>/gi;
  let match;

  while ((match = sectionRegex.exec(html)) !== null) {
    const attrs = match[1];
    const inner = match[2];

    // Extract id
    const idMatch = attrs.match(/\bid="([^"]+)"/);
    const id = idMatch ? idMatch[1] : null;

    // Extract class — derive type from class like "section-hero" → "hero"
    const classMatch = attrs.match(/\bclass="([^"]+)"/);
    const classes = classMatch ? classMatch[1] : "";
    const typeMatch = classes.match(/section-(\w[\w-]*)/);
    const type = typeMatch ? typeMatch[1] : "unknown";

    // Extract label from data-section-name
    const labelMatch = attrs.match(/data-section-name="([^"]*)"/);
    const label = labelMatch ? labelMatch[1] : "";

    // Extract headlines (h1, h2, h3) — get text content
    const headlines = [];
    const headlineRegex = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
    let hMatch;
    while ((hMatch = headlineRegex.exec(inner)) !== null) {
      const text = hMatch[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
      if (text) headlines.push(text);
    }

    // Extract body copy — p tags, excluding very short or class-specific ones
    const copyParts = [];
    const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch;
    while ((pMatch = pRegex.exec(inner)) !== null) {
      const text = pMatch[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
      if (text.length > 10) copyParts.push(text);
    }

    // Extract list item copy — li tags
    const liRegex = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRegex.exec(inner)) !== null) {
      const text = liMatch[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
      if (text.length > 10) copyParts.push(text);
    }

    // Detect metrics (data-count attributes)
    const hasMetrics = /data-count=/.test(inner);

    // Detect background images (<img> tags or background-image in inline styles)
    const hasBackgroundImage = /<img\b/.test(inner) || /background-image/.test(inner);

    sections.push({
      id,
      label: label || null,
      type,
      headline: headlines[0] || null,
      copy_preview: copyParts.slice(0, 2).join(" ").slice(0, 300) || null,
      has_background_image: hasBackgroundImage,
      has_metrics: hasMetrics,
    });
  }

  // --- Parse design tokens from CSS ---
  const colors = {};
  const colorRegex = /--(color-[\w-]+)\s*:\s*([^;]+);/g;
  let cMatch;
  while ((cMatch = colorRegex.exec(css)) !== null) {
    colors[cMatch[1]] = cMatch[2].trim();
  }

  const fonts = {};
  const fontRegex = /--(font-[\w-]+)\s*:\s*([^;]+);/g;
  let fMatch;
  while ((fMatch = fontRegex.exec(css)) !== null) {
    fonts[fMatch[1]] = fMatch[2].trim();
  }

  // --- Build raw copy (all text content) ---
  const allText = [];
  for (const s of sections) {
    if (s.headline) allText.push(s.headline);
    if (s.copy_preview) allText.push(s.copy_preview);
  }
  const rawCopy = allText.join("\n\n");
  const totalWords = rawCopy.split(/\s+/).filter(Boolean).length;

  // --- Check for images directory ---
  const imagesDir = join(dirPath, "images");
  const hasImages = existsSync(imagesDir);

  // --- Extract meta tags ---
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const ogTitleMatch = html.match(/og:title"\s+content="([^"]+)"/);
  const ogDescMatch = html.match(/og:description"\s+content="([^"]+)"/);

  const manifest = {
    sections,
    design_tokens: { colors, fonts },
    raw_copy: rawCopy,
    meta: {
      extracted_at: new Date().toISOString(),
      total_sections: sections.length,
      total_words: totalWords,
      has_images: hasImages,
      title: titleMatch ? titleMatch[1] : null,
      og_title: ogTitleMatch ? ogTitleMatch[1] : null,
      og_description: ogDescMatch ? ogDescMatch[1] : null,
    },
  };

  return manifest;
}

function buildMissionMd(project, docCount, briefs) {
  const lines = [
    `# Mission: ${project.project_name}`,
    "",
    `**Company:** ${project.company_name}`,
    `**Type:** ${project.type.replace("_", " ")}`,
    `**Status:** ${project.status}`,
    `**Project ID:** ${project.id}`,
    `**Created:** ${new Date(project.created_at).toLocaleDateString()}`,
    `**Updated:** ${new Date(project.updated_at).toLocaleDateString()}`,
    "",
  ];

  if (project.pitchapp_url) {
    lines.push(`**PitchApp URL:** ${project.pitchapp_url}`, "");
  }

  if (project.target_audience) {
    lines.push(`**Target Audience:** ${project.target_audience}`, "");
  }

  if (project.timeline_preference) {
    lines.push(`**Timeline:** ${project.timeline_preference}`, "");
  }

  if (project.notes) {
    lines.push("## Notes", "", project.notes, "");
  }

  if (project.materials_link) {
    lines.push(`**Materials Link:** ${project.materials_link}`, "");
  }

  if (docCount > 0) {
    lines.push(
      "## Uploaded Documents",
      "",
      `${docCount} document(s) downloaded to \`materials/\` directory.`,
      ""
    );
  }

  if (briefs.length > 0) {
    lines.push(
      "## Edit Briefs",
      "",
      `${briefs.length} edit brief(s) from Scout. See \`briefs/\` directory.`,
      ""
    );
  }

  lines.push(
    "---",
    "",
    "*Pulled from Launchpad Portal via `scripts/launchpad-cli.mjs`*",
    ""
  );

  return lines.join("\n");
}

async function cmdManifest(idOrName, localPath) {
  if (!idOrName || !localPath) {
    logErr("Usage: node scripts/launchpad-cli.mjs manifest <id-or-name> <local-path>");
    logErr("\nExtracts a manifest from a local PitchApp directory and pushes it to the portal.");
    process.exit(1);
  }

  const dirPath = resolve(localPath);
  if (!existsSync(dirPath)) {
    logErr(`Error: Directory not found: ${dirPath}`);
    process.exit(1);
  }

  const { url, key } = loadEnv();
  const projectId = await resolveProjectId(url, key, idOrName);

  log(`\n  Extracting manifest from: ${dirPath}`);
  const manifest = extractManifest(dirPath);

  if (!manifest) {
    logErr("  Manifest extraction failed.");
    process.exit(1);
  }

  // Fetch project to get pitchapp_url for source_url
  const projects = await dbGet(url, key, "projects", `select=id,project_name,company_name,pitchapp_url&id=eq.${projectId}`);
  if (projects.length === 0) {
    logErr(`Project not found: ${projectId}`);
    process.exit(1);
  }

  const project = projects[0];
  manifest.meta.source_url = project.pitchapp_url || null;

  await dbPost(url, key, "pitchapp_manifests", {
    project_id: projectId,
    sections: manifest.sections,
    design_tokens: manifest.design_tokens,
    raw_copy: manifest.raw_copy,
    meta: manifest.meta,
    updated_at: new Date().toISOString(),
  });

  if (JSON_MODE) {
    outputJson(manifest);
    return manifest;
  }

  log(`  Project: ${project.project_name} (${project.company_name})`);
  log(`  Sections: ${manifest.meta.total_sections}`);
  log(`  Words: ${manifest.meta.total_words}`);
  log(`  Colors: ${Object.keys(manifest.design_tokens.colors).length}`);
  log(`  Fonts: ${Object.keys(manifest.design_tokens.fonts).length}`);
  log(`\n  Manifest pushed to Launchpad.\n`);

  return manifest;
}

async function cmdPreview(idOrName) {
  if (!idOrName) {
    logErr("Usage: node scripts/launchpad-cli.mjs preview <id-or-name>");
    logErr("\nOpens the deployed PitchApp URL in the browser.");
    process.exit(1);
  }

  const { url, key } = loadEnv();
  const projectId = await resolveProjectId(url, key, idOrName);

  const projects = await dbGet(url, key, "projects", `select=id,project_name,company_name,pitchapp_url&id=eq.${projectId}`);
  if (projects.length === 0) {
    logErr(`Project not found: ${projectId}`);
    process.exit(1);
  }

  const project = projects[0];

  if (!project.pitchapp_url) {
    logErr(`\n  No PitchApp URL set for: ${project.project_name} (${project.company_name})`);
    logErr("  Deploy first with: node scripts/launchpad-cli.mjs push <id-or-name> <local-path>\n");
    process.exit(1);
  }

  if (JSON_MODE) {
    outputJson({ project_id: project.id, pitchapp_url: project.pitchapp_url });
    return project;
  }

  log(`\n  Opening: ${project.pitchapp_url}`);
  log(`  Project: ${project.project_name} (${project.company_name})\n`);
  execSync(`open "${project.pitchapp_url}"`);

  return project;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const [command, ...args] = cleanArgs;

const commands = {
  missions: () => cmdMissions(),
  pull: () => cmdPull(args[0]),
  push: () => cmdPush(args[0], args[1], args[2]),
  briefs: () => cmdBriefs(args[0]),
  status: () => cmdStatus(args[0], args[1]),
  manifest: () => cmdManifest(args[0], args[1]),
  preview: () => cmdPreview(args[0]),
};

if (!command || !commands[command]) {
  console.log(`
  Launchpad CLI — Bridge between PitchApp pipeline and Launchpad Portal

  Commands:
    missions                         List active missions
    pull <id-or-name>                Pull mission data + documents
    push <id-or-name> <local-path>   Deploy to Vercel + push URL to portal
    push <id-or-name> <url> [path]   Push an already-deployed URL (legacy)
    briefs <id-or-name>              Get Scout edit briefs
    status <id-or-name> <s>          Update status (requested|brand_collection|in_progress|review|revision|live|on_hold)
    manifest <id-or-name> <dir>      Extract + push manifest independently
    preview <id-or-name>             Open deployed PitchApp URL in browser

  Flags:
    --json                           Output JSON instead of formatted text
    --status <s>                     Filter missions by status (comma-separated)

  <id-or-name> can be a full UUID, an ID prefix, or a company/project name.

  Environment:
    SUPABASE_URL                     Supabase project URL (fallback: .env.local)
    SUPABASE_SERVICE_ROLE_KEY        Supabase service role key (fallback: .env.local)

  Examples:
    node scripts/launchpad-cli.mjs missions
    node scripts/launchpad-cli.mjs missions --json --status review,requested
    node scripts/launchpad-cli.mjs pull acme --json
    node scripts/launchpad-cli.mjs push acme apps/acme/
    node scripts/launchpad-cli.mjs briefs acme --json
    node scripts/launchpad-cli.mjs manifest acme apps/acme/
    node scripts/launchpad-cli.mjs preview acme
  `);
  process.exit(0);
}

try {
  await commands[command]();
} catch (err) {
  if (JSON_MODE) {
    console.error(JSON.stringify({ error: err.message }));
  } else {
    console.error(`\n  Error: ${err.message}\n`);
  }
  process.exit(1);
}
