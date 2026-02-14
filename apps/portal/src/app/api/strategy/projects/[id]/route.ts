import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifyProjectAccess } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET /api/strategy/projects/[id] — get a single strategy project (any member)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await verifyProjectAccess(id);

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const client = access.isAdmin ? createAdminClient() : await createClient();

  const { data, error } = await client
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("department", "strategy")
    .single();

  if (error) {
    return NextResponse.json({ error: "strategy project not found" }, { status: 404 });
  }

  return NextResponse.json({ project: data });
}

// PATCH /api/strategy/projects/[id] — update strategy project fields (owner/editor)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await verifyProjectAccess(id, ["owner", "editor"]);

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const allowedFields = [
    "company_name",
    "project_name",
    "target_audience",
    "notes",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("projects")
    .update(updates)
    .eq("id", id)
    .eq("department", "strategy")
    .select()
    .single();

  if (error) {
    console.error("Failed to update strategy project:", error.message);
    return NextResponse.json({ error: "failed to update project" }, { status: 500 });
  }

  return NextResponse.json({ project: data });
}
