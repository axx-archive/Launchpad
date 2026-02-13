import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { ProjectType } from "@/types/database";

const VALID_TYPES: ProjectType[] = [
  "investor_pitch",
  "client_proposal",
  "research_report",
  "website",
  "other",
];

const VALID_TIMELINES = ["no rush", "2-3 weeks", "asap"];

function safeString(val: unknown, maxLen = 500): string | null {
  if (val == null) return null;
  if (typeof val !== "string") return null;
  return val.trim().slice(0, maxLen) || null;
}

// GET /api/projects — list projects for authenticated user (or all for admin)
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = isAdmin(user.email);

  // Admins use service role client to bypass RLS and see all projects
  const client = admin ? createAdminClient() : supabase;

  const { data, error } = await client
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Failed to list projects:", error.message);
    return NextResponse.json({ error: "failed to load projects" }, { status: 500 });
  }

  return NextResponse.json({ projects: data, isAdmin: admin });
}

// POST /api/projects — create a new project
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  // Validate required fields
  const errors: Record<string, string> = {};

  if (
    !body.company_name ||
    typeof body.company_name !== "string" ||
    !body.company_name.trim()
  ) {
    errors.company_name = "company is required";
  }

  if (
    !body.project_name ||
    typeof body.project_name !== "string" ||
    !body.project_name.trim()
  ) {
    errors.project_name = "project name is required";
  }

  if (!body.type || !VALID_TYPES.includes(body.type as ProjectType)) {
    errors.type = "pick a valid type";
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "validation failed", fields: errors }, { status: 400 });
  }

  // Sanitize optional fields
  const timelinePref = safeString(body.timeline_preference);
  const validatedTimeline =
    timelinePref && VALID_TIMELINES.includes(timelinePref) ? timelinePref : null;

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      company_name: (body.company_name as string).trim().slice(0, 200),
      project_name: (body.project_name as string).trim().slice(0, 200),
      type: body.type,
      target_audience: safeString(body.target_audience, 500),
      timeline_preference: validatedTimeline,
      notes: safeString(body.notes, 2000),
    })
    .select()
    .single();

  if (error) {
    console.error("Failed to create project:", error.message);
    return NextResponse.json({ error: "failed to create project" }, { status: 500 });
  }

  // --- Notify admins about new project ---
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length > 0) {
    try {
      const admin = createAdminClient();
      const { data: adminUsers } = await admin.auth.admin.listUsers();

      const adminIds = (adminUsers?.users ?? [])
        .filter((u) => u.email && adminEmails.includes(u.email.toLowerCase()))
        .map((u) => u.id);

      if (adminIds.length > 0) {
        const notifications = adminIds.map((adminId) => ({
          user_id: adminId,
          project_id: data.id,
          type: "project_created",
          title: "new mission requested",
          body: `${data.company_name} submitted "${data.project_name}".`,
        }));

        await admin.from("notifications").insert(notifications);
      }
    } catch (err) {
      // Non-blocking — don't fail the request if notification fails
      console.error("Failed to send admin notification:", err);
    }
  }

  return NextResponse.json({ project: data }, { status: 201 });
}
