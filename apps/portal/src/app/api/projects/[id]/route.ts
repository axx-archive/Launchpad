import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET /api/projects/[id] — get a single project
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = isAdmin(user.email);
  const client = admin ? createAdminClient() : supabase;

  const { data, error } = await client
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ project: data });
}

// PATCH /api/projects/[id] — update project fields (admin: all fields, client: limited)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  // Only allow updating specific fields (status changes go through /status endpoint)
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

  const { data, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ project: data });
}

// DELETE /api/projects/[id] — admin-only hard delete
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Clean up storage documents (non-blocking — project delete still succeeds if this fails)
  try {
    const { data: files } = await admin.storage
      .from("documents")
      .list(id);
    if (files?.length) {
      await admin.storage
        .from("documents")
        .remove(files.map((f) => `${id}/${f.name}`));
    }
  } catch (e) {
    console.error(`[delete] storage cleanup failed for ${id}:`, e);
  }

  // Delete project — cascades to scout_messages and notifications
  const { error } = await admin
    .from("projects")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(`[delete] failed for ${id}:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
