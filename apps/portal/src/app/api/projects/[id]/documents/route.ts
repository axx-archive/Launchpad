import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB per file
const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25MB total per project
const MAX_FILES_PER_PROJECT = 10;
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/msword",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
];

/** Verify the user owns this project or is an admin */
async function verifyAccess(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "unauthorized", status: 401 } as const;
  }

  const admin = isAdmin(user.email);
  const client = admin ? createAdminClient() : supabase;

  const { data: project, error } = await client
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .single();

  if (error || !project) {
    return { error: "project not found", status: 404 } as const;
  }

  if (!admin && project.user_id !== user.id) {
    return { error: "forbidden", status: 403 } as const;
  }

  return { user, isAdmin: admin } as const;
}

// GET /api/projects/[id]/documents — list files for a project
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await verifyAccess(id);

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient.storage
    .from("documents")
    .list(id, { sortBy: { column: "created_at", order: "asc" } });

  if (error) {
    console.error("Failed to list documents:", error.message);
    return NextResponse.json({ error: "failed to list documents" }, { status: 500 });
  }

  // Filter out the .emptyFolderPlaceholder file Supabase creates
  const files = (data ?? []).filter((f) => f.name !== ".emptyFolderPlaceholder");
  const totalSize = files.reduce((sum, f) => sum + (f.metadata?.size ?? 0), 0);

  return NextResponse.json({ documents: files, totalSize });
}

// POST /api/projects/[id]/documents — get a signed upload URL
// Accepts JSON: { fileName, fileSize, fileType }
// Returns: { signedUrl, token, path }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await verifyAccess(id);

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: { fileName?: string; fileSize?: number; fileType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const { fileName, fileSize, fileType } = body;

  if (!fileName || !fileSize || !fileType) {
    return NextResponse.json(
      { error: "fileName, fileSize, and fileType are required" },
      { status: 400 }
    );
  }

  // Validate file type
  if (!ALLOWED_TYPES.includes(fileType)) {
    return NextResponse.json(
      { error: `file type not allowed: ${fileType}` },
      { status: 400 }
    );
  }

  // Validate file size
  if (fileSize > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "file too large. max 25MB per file." },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // Check file count + total size
  const { data: existing } = await adminClient.storage
    .from("documents")
    .list(id);

  const existingFiles = (existing ?? []).filter(
    (f) => f.name !== ".emptyFolderPlaceholder"
  );

  if (existingFiles.length >= MAX_FILES_PER_PROJECT) {
    return NextResponse.json(
      { error: `max ${MAX_FILES_PER_PROJECT} files per project.` },
      { status: 400 }
    );
  }

  const currentTotalSize = existingFiles.reduce(
    (sum, f) => sum + (f.metadata?.size ?? 0),
    0
  );
  if (currentTotalSize + fileSize > MAX_TOTAL_SIZE) {
    const remainingMB = Math.max(0, (MAX_TOTAL_SIZE - currentTotalSize) / (1024 * 1024));
    return NextResponse.json(
      { error: `would exceed 25MB project limit. ${remainingMB.toFixed(1)}MB remaining.` },
      { status: 400 }
    );
  }

  // Build storage path: {projectId}/{timestamp}_{filename}
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${id}/${Date.now()}_${safeName}`;

  const { data, error } = await adminClient.storage
    .from("documents")
    .createSignedUploadUrl(storagePath);

  if (error) {
    console.error("Failed to create signed upload URL:", error.message);
    return NextResponse.json({ error: "failed to prepare upload" }, { status: 500 });
  }

  return NextResponse.json(
    {
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path,
    },
    { status: 200 }
  );
}

// DELETE /api/projects/[id]/documents — delete a file by name
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await verifyAccess(id);

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: { fileName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (!body.fileName) {
    return NextResponse.json({ error: "fileName is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const storagePath = `${id}/${body.fileName}`;

  const { error } = await adminClient.storage
    .from("documents")
    .remove([storagePath]);

  if (error) {
    console.error("Failed to delete document:", error.message);
    return NextResponse.json({ error: "failed to delete" }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
