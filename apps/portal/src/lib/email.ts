import { Resend } from "resend";
import type { ProjectStatus } from "@/types/database";

// ---------------------------------------------------------------------------
// Resend client — lazy-initialized, no-ops gracefully if key is missing
// ---------------------------------------------------------------------------

let resend: Resend | null = null;

function getResend(): Resend | null {
  if (resend) return resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY not set — emails disabled");
    return null;
  }
  resend = new Resend(key);
  return resend;
}

const FROM_ADDRESS = process.env.EMAIL_FROM ?? "Launchpad <notifications@bonfire.tools>";

// ---------------------------------------------------------------------------
// HTML escaping — prevent injection in email templates
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Email templates — minimal HTML matching the terminal aesthetic
// ---------------------------------------------------------------------------

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,system-ui,sans-serif;">
  <div style="max-width:520px;margin:40px auto;padding:32px 24px;">
    <div style="margin-bottom:24px;">
      <span style="font-family:monospace;font-size:10px;letter-spacing:3px;color:#c8a44e;text-transform:lowercase;">launchpad</span>
    </div>
    ${content}
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #1e1e1e;">
      <span style="font-family:monospace;font-size:10px;color:#9a9388;">bonfire labs</span>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send email when a project status changes to a client-relevant state.
 */
export async function sendStatusChangeEmail(
  to: string,
  projectName: string,
  newStatus: ProjectStatus,
  pitchappUrl?: string | null,
): Promise<void> {
  const client = getResend();
  if (!client) return;

  const safeName = escapeHtml(projectName);
  const safeUrl = pitchappUrl ? escapeHtml(pitchappUrl) : null;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://launchpad.bonfire.tools";

  const templates: Partial<Record<ProjectStatus, { subject: string; body: string }>> = {
    narrative_review: {
      subject: `${projectName} — story arc ready for review`,
      body: baseTemplate(`
        <h2 style="color:#f0ede8;font-size:20px;font-weight:400;margin:0 0 12px;">your story arc is ready</h2>
        <p style="color:#9a9388;font-size:14px;line-height:1.6;margin:0 0 20px;">
          the narrative for ${safeName} is ready for your review. read through it and let us know if it captures your story.
        </p>
        <a href="${escapeHtml(siteUrl)}/dashboard" style="display:inline-block;font-family:monospace;font-size:12px;color:#c8a44e;border:1px solid rgba(200,164,78,0.3);padding:10px 20px;text-decoration:none;letter-spacing:1px;">review your narrative &rarr;</a>
      `),
    },
    in_progress: {
      subject: `${projectName} — build started`,
      body: baseTemplate(`
        <h2 style="color:#f0ede8;font-size:20px;font-weight:400;margin:0 0 12px;">your build is underway</h2>
        <p style="color:#9a9388;font-size:14px;line-height:1.6;margin:0 0 20px;">
          the narrative for ${safeName} has been approved and the build team is now working on your launchpad.
        </p>
      `),
    },
    review: {
      subject: `${projectName} is ready for review`,
      body: baseTemplate(`
        <h2 style="color:#f0ede8;font-size:20px;font-weight:400;margin:0 0 12px;">your pitchapp is ready</h2>
        <p style="color:#9a9388;font-size:14px;line-height:1.6;margin:0 0 20px;">
          ${safeName} is ready for your review. scroll through it and let us know what you think.
        </p>
        ${safeUrl ? `<a href="${safeUrl}" style="display:inline-block;font-family:monospace;font-size:12px;color:#c8a44e;border:1px solid rgba(200,164,78,0.3);padding:10px 20px;text-decoration:none;letter-spacing:1px;">view your pitchapp &rarr;</a>` : ""}
      `),
    },
    live: {
      subject: `${projectName} is live`,
      body: baseTemplate(`
        <h2 style="color:#f0ede8;font-size:20px;font-weight:400;margin:0 0 12px;">your pitchapp is live</h2>
        <p style="color:#9a9388;font-size:14px;line-height:1.6;margin:0 0 20px;">
          ${safeName} is deployed and ready to share. send the link to your audience.
        </p>
        ${safeUrl ? `<a href="${safeUrl}" style="display:inline-block;font-family:monospace;font-size:12px;color:#c8a44e;border:1px solid rgba(200,164,78,0.3);padding:10px 20px;text-decoration:none;letter-spacing:1px;">view your pitchapp &rarr;</a>` : ""}
      `),
    },
  };

  const template = templates[newStatus];
  if (!template) return;

  try {
    await client.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: template.subject,
      html: template.body,
    });
  } catch (err) {
    console.error(`[email] Failed to send status change email to ${to}:`, err);
  }
}

/**
 * Send email to admin when a new edit brief is received via Scout.
 */
export async function sendEditBriefReceivedEmail(
  to: string,
  projectName: string,
): Promise<void> {
  const client = getResend();
  if (!client) return;

  const safeName = escapeHtml(projectName);
  const dashboardUrl = escapeHtml(
    `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://launchpad.bonfire.tools"}/admin`
  );

  try {
    await client.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `new edit brief: ${projectName}`,
      html: baseTemplate(`
        <h2 style="color:#f0ede8;font-size:20px;font-weight:400;margin:0 0 12px;">new edit brief</h2>
        <p style="color:#9a9388;font-size:14px;line-height:1.6;margin:0 0 20px;">
          scout generated a new edit brief for ${safeName}. check the admin dashboard for details.
        </p>
        <a href="${dashboardUrl}" style="display:inline-block;font-family:monospace;font-size:12px;color:#c8a44e;border:1px solid rgba(200,164,78,0.3);padding:10px 20px;text-decoration:none;letter-spacing:1px;">open dashboard &rarr;</a>
      `),
    });
  } catch (err) {
    console.error(`[email] Failed to send edit brief email to ${to}:`, err);
  }
}
