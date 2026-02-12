#!/usr/bin/env node

/**
 * Launchpad CLI — Bridge between PitchApp build pipeline and Launchpad Portal
 *
 * Usage:
 *   node scripts/launchpad-cli.mjs missions                    List active missions
 *   node scripts/launchpad-cli.mjs pull <id>                   Pull mission data + documents
 *   node scripts/launchpad-cli.mjs push <id> <url>             Push PitchApp URL, set status to review
 *   node scripts/launchpad-cli.mjs briefs <id>                 Get Scout edit briefs
 *   node scripts/launchpad-cli.mjs status <id> <status>        Update project status
 *
 * Reads credentials from apps/portal/.env.local (SUPABASE_URL + SERVICE_ROLE_KEY).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadEnv() {
  const envPath = join(ROOT, "apps/portal/.env.local");
  if (!existsSync(envPath)) {
    console.error("Error: apps/portal/.env.local not found.");
    console.error("Make sure you're running from the PitchApp root.");
    process.exit(1);
  }

  const content = readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (match) env[match[1]] = match[2].trim();
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
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
      p.company_name.toLowerCase().includes(needle) ||
      p.project_name.toLowerCase().includes(needle)
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
  const projects = await dbGet(
    url,
    key,
    "projects",
    "select=id,project_name,company_name,type,status,pitchapp_url,created_at,updated_at&order=updated_at.desc"
  );

  if (projects.length === 0) {
    console.log("No missions found.");
    return;
  }

  console.log(`\n  LAUNCHPAD MISSIONS (${projects.length} total)\n`);
  console.log("  " + "-".repeat(100));

  for (const p of projects) {
    const status = p.status.padEnd(12);
    const type = p.type.replace("_", " ").padEnd(16);
    const updated = new Date(p.updated_at).toLocaleDateString();
    const hasUrl = p.pitchapp_url ? "+" : "-";
    console.log(
      `  [${hasUrl}] ${status} ${p.company_name.padEnd(20)} ${type} ${updated.padEnd(12)} ${p.id}`
    );
  }

  console.log("\n  " + "-".repeat(100));
  console.log("  [+] = has PitchApp URL   [-] = no URL yet");
  console.log("  Tip: you can use a company name or ID prefix instead of the full UUID.");
  console.log(`\n  Use: node scripts/launchpad-cli.mjs pull <id-or-name>\n`);

  return projects;
}

async function cmdPull(idOrName) {
  if (!idOrName) {
    console.error("Usage: node scripts/launchpad-cli.mjs pull <id-or-name>");
    console.error("\nRun 'missions' first to see available projects.");
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
    console.error(`Project not found: ${projectId}`);
    process.exit(1);
  }

  const project = projects[0];
  const safeName = project.company_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const taskDir = join(ROOT, "tasks", safeName);

  console.log(`\n  Pulling mission: ${project.project_name} (${project.company_name})`);
  console.log(`  Status: ${project.status}`);
  console.log(`  Type: ${project.type}`);

  // Create task directory
  mkdirSync(taskDir, { recursive: true });
  mkdirSync(join(taskDir, "materials"), { recursive: true });

  // Download documents
  let docCount = 0;
  try {
    const files = await storageList(url, key, "documents", `${projectId}/`);
    const realFiles = files.filter((f) => f.name !== ".emptyFolderPlaceholder");

    if (realFiles.length > 0) {
      console.log(`  Downloading ${realFiles.length} document(s)...`);

      for (const file of realFiles) {
        const filePath = `${projectId}/${file.name}`;
        // Strip timestamp prefix for local filename
        const localName = file.name.replace(/^\d+_/, "");
        const localPath = join(taskDir, "materials", localName);

        try {
          const res = await storageDownload(url, key, "documents", filePath);
          const buffer = Buffer.from(await res.arrayBuffer());
          writeFileSync(localPath, buffer);
          console.log(`    -> ${localName} (${formatSize(buffer.length)})`);
          docCount++;
        } catch (err) {
          console.error(`    !! Failed to download ${file.name}: ${err.message}`);
        }
      }
    }
  } catch {
    console.log("  No documents found (or bucket not accessible).");
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
  console.log(`\n  Mission file: ${missionPath}`);

  // Write briefs if any
  if (briefs.length > 0) {
    mkdirSync(join(taskDir, "briefs"), { recursive: true });
    for (let i = 0; i < briefs.length; i++) {
      const brief = briefs[i];
      const briefPath = join(taskDir, "briefs", `brief-${i + 1}.md`);
      writeFileSync(briefPath, brief.edit_brief_md);
      console.log(`  Brief ${i + 1}: ${briefPath}`);
    }
  }

  console.log(`\n  Mission pulled to: ${taskDir}/`);
  console.log("  Ready for build pipeline.\n");

  return { project, taskDir, docCount, briefs };
}

async function cmdPush(idOrName, pitchappUrl) {
  if (!idOrName || !pitchappUrl) {
    console.error("Usage: node scripts/launchpad-cli.mjs push <id-or-name> <pitchapp-url>");
    process.exit(1);
  }

  if (!pitchappUrl.startsWith("https://")) {
    console.error("Error: PitchApp URL must start with https://");
    process.exit(1);
  }

  const { url, key } = loadEnv();
  const projectId = await resolveProjectId(url, key, idOrName);

  // Update project with URL and set status to review
  const updated = await dbPatch(url, key, "projects", `id=eq.${projectId}`, {
    pitchapp_url: pitchappUrl,
    status: "review",
    updated_at: new Date().toISOString(),
  });

  if (updated.length === 0) {
    console.error(`Project not found: ${projectId}`);
    process.exit(1);
  }

  const project = updated[0];
  console.log(`\n  PitchApp URL pushed to Launchpad.`);
  console.log(`  Project: ${project.project_name} (${project.company_name})`);
  console.log(`  URL: ${pitchappUrl}`);
  console.log(`  Status: review`);
  console.log(`\n  The client can now preview their PitchApp in the portal.\n`);

  return project;
}

async function cmdBriefs(idOrName) {
  if (!idOrName) {
    console.error("Usage: node scripts/launchpad-cli.mjs briefs <id-or-name>");
    process.exit(1);
  }

  const { url, key } = loadEnv();
  const projectId = await resolveProjectId(url, key, idOrName);

  // Fetch project name
  const projects = await dbGet(url, key, "projects", `select=id,project_name,company_name&id=eq.${projectId}`);
  if (projects.length === 0) {
    console.error(`Project not found: ${projectId}`);
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

  if (briefs.length === 0) {
    console.log(`\n  No edit briefs found for: ${project.project_name} (${project.company_name})`);
    console.log("  The client hasn't requested any changes via Scout yet.\n");
    return [];
  }

  const safeName = project.company_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const briefDir = join(ROOT, "tasks", safeName, "briefs");
  mkdirSync(briefDir, { recursive: true });

  console.log(`\n  Edit briefs for: ${project.project_name} (${project.company_name})`);
  console.log(`  ${briefs.length} brief(s) found.\n`);

  for (let i = 0; i < briefs.length; i++) {
    const brief = briefs[i];
    const date = new Date(brief.created_at).toLocaleDateString();
    const briefPath = join(briefDir, `brief-${i + 1}.md`);
    writeFileSync(briefPath, brief.edit_brief_md);
    console.log(`  Brief ${i + 1} (${date}):`);
    // Show first 3 lines as preview
    const preview = brief.edit_brief_md.split("\n").slice(0, 3).join("\n");
    console.log(`    ${preview.replace(/\n/g, "\n    ")}`);
    console.log(`    -> Saved to: ${briefPath}\n`);
  }

  console.log(`  Briefs saved to: ${briefDir}/`);
  console.log("  Ready for revision pipeline.\n");

  return briefs;
}

async function cmdStatus(idOrName, status) {
  const VALID = ["requested", "in_progress", "review", "revision", "live", "on_hold"];

  if (!idOrName || !status) {
    console.error("Usage: node scripts/launchpad-cli.mjs status <id-or-name> <status>");
    console.error(`Valid statuses: ${VALID.join(", ")}`);
    process.exit(1);
  }

  if (!VALID.includes(status)) {
    console.error(`Invalid status: ${status}`);
    console.error(`Valid statuses: ${VALID.join(", ")}`);
    process.exit(1);
  }

  const { url, key } = loadEnv();
  const projectId = await resolveProjectId(url, key, idOrName);

  const updated = await dbPatch(url, key, "projects", `id=eq.${projectId}`, {
    status,
    updated_at: new Date().toISOString(),
  });

  if (updated.length === 0) {
    console.error(`Project not found: ${projectId}`);
    process.exit(1);
  }

  const project = updated[0];
  console.log(`\n  Status updated.`);
  console.log(`  Project: ${project.project_name} (${project.company_name})`);
  console.log(`  Status: ${status}\n`);

  return project;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const [, , command, ...args] = process.argv;

const commands = {
  missions: () => cmdMissions(),
  pull: () => cmdPull(args[0]),
  push: () => cmdPush(args[0], args[1]),
  briefs: () => cmdBriefs(args[0]),
  status: () => cmdStatus(args[0], args[1]),
};

if (!command || !commands[command]) {
  console.log(`
  Launchpad CLI — Bridge between PitchApp pipeline and Launchpad Portal

  Commands:
    missions                    List active missions
    pull <project-id>           Pull mission data + documents
    push <project-id> <url>     Push PitchApp URL, set status to review
    briefs <project-id>         Get Scout edit briefs
    status <project-id> <s>     Update status (requested|in_progress|review|revision|live|on_hold)

  Examples:
    node scripts/launchpad-cli.mjs missions
    node scripts/launchpad-cli.mjs pull abc123-def456-...
    node scripts/launchpad-cli.mjs push abc123-def456-... https://pitch.vercel.app
    node scripts/launchpad-cli.mjs briefs abc123-def456-...
  `);
  process.exit(0);
}

try {
  await commands[command]();
} catch (err) {
  console.error(`\n  Error: ${err.message}\n`);
  process.exit(1);
}
