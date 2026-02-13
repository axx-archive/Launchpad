#!/usr/bin/env node

/**
 * Health Monitor — Checks that all live PitchApp URLs are responding.
 *
 * Designed to run every 6 hours via PM2 cron.
 *
 * For each project with status "live" and a pitchapp_url:
 * - HTTP HEAD request to the URL
 * - Check for 200 response
 * - Log results to automation_log
 * - Alert on non-200 responses
 *
 * Output: JSON (machine-readable)
 */

import { dbGet, dbPost, logAutomation, isAutomationEnabled } from "./lib/supabase.mjs";

const REQUEST_TIMEOUT_MS = 15000;

async function checkUrl(url) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);

    return {
      status_code: res.status,
      response_time_ms: Date.now() - start,
      ok: res.ok,
    };
  } catch (err) {
    return {
      status_code: 0,
      response_time_ms: Date.now() - start,
      ok: false,
      error: err.name === "AbortError" ? "timeout" : err.message,
    };
  }
}

async function run() {
  if (!isAutomationEnabled()) {
    console.log(JSON.stringify({ status: "skipped", reason: "automation disabled" }));
    process.exit(0);
  }

  const results = {
    timestamp: new Date().toISOString(),
    checked: 0,
    healthy: 0,
    unhealthy: 0,
    details: [],
    errors: [],
  };

  try {
    const projects = await dbGet(
      "projects",
      "select=id,project_name,company_name,pitchapp_url&status=eq.live&pitchapp_url=not.is.null"
    );

    results.checked = projects.length;

    for (const project of projects) {
      const check = await checkUrl(project.pitchapp_url);

      const detail = {
        project_id: project.id,
        company_name: project.company_name,
        url: project.pitchapp_url,
        ...check,
      };

      results.details.push(detail);

      // Log to automation_log
      await logAutomation("health-check", {
        url: project.pitchapp_url,
        status_code: check.status_code,
        response_time_ms: check.response_time_ms,
        ok: check.ok,
        error: check.error || null,
      }, project.id);

      if (check.ok) {
        results.healthy++;
      } else {
        results.unhealthy++;

        // Create a notification for admin
        try {
          // Find admin users — query users with admin role
          // For now, log the alert; notification creation requires admin user IDs
          await logAutomation("health-check-failed", {
            url: project.pitchapp_url,
            status_code: check.status_code,
            error: check.error || null,
            project_name: project.project_name,
            company_name: project.company_name,
          }, project.id);
        } catch (err) {
          results.errors.push({
            action: "create-alert",
            project_id: project.id,
            error: err.message,
          });
        }
      }
    }
  } catch (err) {
    results.errors.push({ action: "fetch-projects", error: err.message });
  }

  console.log(JSON.stringify(results, null, 2));
}

run().catch((err) => {
  console.error(JSON.stringify({ error: err.message, stack: err.stack }));
  process.exit(1);
});
