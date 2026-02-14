import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB total per project
const MAX_ASSETS_PER_PROJECT = 50;
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  // Office formats for brand guide slot
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Font formats
  "font/woff", "font/woff2", "font/ttf", "font/otf",
  "application/font-woff", "application/font-woff2",
  "application/x-font-ttf", "application/x-font-otf",
];
const VALID_CATEGORIES = ["logo", "hero", "team", "background", "font", "other"];

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

// GET /api/projects/[id]/brand-assets — list all assets with signed download URLs
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

  const { data, error } = await adminClient
    .from("brand_assets")
    .select("*")
    .eq("project_id", id)
    .order("category")
    .order("sort_order");

  if (error) {
    console.error("Failed to list brand assets:", error.message);
    return NextResponse.json({ error: "failed to list brand assets" }, { status: 500 });
  }

  // Generate signed download URLs for each asset
  const assets = await Promise.all(
    (data ?? []).map(async (asset) => {
      const { data: signedData } = await adminClient.storage
        .from("brand-assets")
        .createSignedUrl(asset.storage_path, 3600); // 1 hour expiry

      return {
        ...asset,
        download_url: signedData?.signedUrl ?? null,
      };
    })
  );

  const totalSize = (data ?? []).reduce((sum, a) => sum + (a.file_size ?? 0), 0);

  return NextResponse.json({ assets, totalSize });
}

// POST /api/projects/[id]/brand-assets — create signed upload URL + DB record
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await verifyAccess(id);

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: {
    fileName?: string;
    fileSize?: number;
    fileType?: string;
    category?: string;
    label?: string;
    source?: "initial" | "revision";
    linkedMessageId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const { fileName, fileSize, fileType, category, label, source, linkedMessageId } = body;

  if (!fileName || !fileSize || !fileType || !category) {
    return NextResponse.json(
      { error: "fileName, fileSize, fileType, and category are required" },
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

  // Validate category
  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json(
      { error: `invalid category: ${category}` },
      { status: 400 }
    );
  }

  // Validate file size
  if (fileSize > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "file too large. max 20MB per file." },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // Check file count + total size using DB
  const { data: existingAssets, error: listError } = await adminClient
    .from("brand_assets")
    .select("file_size")
    .eq("project_id", id);

  if (listError) {
    console.error("Failed to list brand assets:", listError.message);
    return NextResponse.json({ error: "failed to check asset limits" }, { status: 500 });
  }

  if ((existingAssets?.length ?? 0) >= MAX_ASSETS_PER_PROJECT) {
    return NextResponse.json(
      { error: `max ${MAX_ASSETS_PER_PROJECT} brand assets per project.` },
      { status: 400 }
    );
  }

  const currentTotalSize = (existingAssets ?? []).reduce(
    (sum, a) => sum + (a.file_size ?? 0),
    0
  );
  if (currentTotalSize + fileSize > MAX_TOTAL_SIZE) {
    const remainingMB = Math.max(0, (MAX_TOTAL_SIZE - currentTotalSize) / (1024 * 1024));
    return NextResponse.json(
      { error: `would exceed 50MB project limit. ${remainingMB.toFixed(1)}MB remaining.` },
      { status: 400 }
    );
  }

  // Build storage path: {projectId}/{category}/{timestamp}_{filename}
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${id}/${category}/${Date.now()}_${safeName}`;

  // Validate source if provided
  const assetSource = source || "initial";
  if (assetSource !== "initial" && assetSource !== "revision") {
    return NextResponse.json(
      { error: "source must be 'initial' or 'revision'" },
      { status: 400 }
    );
  }

  // Create DB record
  const { data: asset, error: insertError } = await adminClient
    .from("brand_assets")
    .insert({
      project_id: id,
      category,
      file_name: safeName,
      storage_path: storagePath,
      file_size: fileSize,
      mime_type: fileType,
      label: label || null,
      source: assetSource,
      linked_message_id: linkedMessageId || null,
    })
    .select()
    .single();

  if (insertError || !asset) {
    console.error("Failed to create brand asset record:", insertError?.message);
    return NextResponse.json({ error: "failed to create asset record" }, { status: 500 });
  }

  // Create signed upload URL
  const { data: uploadData, error: uploadError } = await adminClient.storage
    .from("brand-assets")
    .createSignedUploadUrl(storagePath);

  if (uploadError || !uploadData) {
    // Required Change #2: Clean up orphan DB record if signed URL creation fails
    await adminClient.from("brand_assets").delete().eq("id", asset.id);
    console.error("Failed to create signed upload URL:", uploadError?.message);
    return NextResponse.json({ error: "failed to prepare upload" }, { status: 500 });
  }

  return NextResponse.json(
    {
      signedUrl: uploadData.signedUrl,
      token: uploadData.token,
      asset,
    },
    { status: 200 }
  );
}

// DELETE /api/projects/[id]/brand-assets — delete an asset by ID
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await verifyAccess(id);

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: { assetId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (!body.assetId) {
    return NextResponse.json({ error: "assetId is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Fetch the asset to get storage path
  const { data: asset, error: fetchError } = await adminClient
    .from("brand_assets")
    .select("*")
    .eq("id", body.assetId)
    .eq("project_id", id)
    .single();

  if (fetchError || !asset) {
    return NextResponse.json({ error: "asset not found" }, { status: 404 });
  }

  // Delete from storage first (if this fails, DB record remains for retry)
  const { error: storageError } = await adminClient.storage
    .from("brand-assets")
    .remove([asset.storage_path]);

  if (storageError) {
    console.error("Failed to delete from storage:", storageError.message);
    // Continue to delete DB record anyway — storage ghost is acceptable
  }

  // Delete from DB
  const { error: dbError } = await adminClient
    .from("brand_assets")
    .delete()
    .eq("id", body.assetId);

  if (dbError) {
    console.error("Failed to delete brand asset record:", dbError.message);
    return NextResponse.json({ error: "failed to delete asset" }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}

// PATCH /api/projects/[id]/brand-assets — update asset metadata
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await verifyAccess(id);

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: { assetId?: string; category?: string; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (!body.assetId) {
    return NextResponse.json({ error: "assetId is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.category) {
    if (!VALID_CATEGORIES.includes(body.category)) {
      return NextResponse.json({ error: `invalid category: ${body.category}` }, { status: 400 });
    }
    updates.category = body.category;
  }

  if (body.label !== undefined) {
    updates.label = body.label || null;
  }

  const adminClient = createAdminClient();

  const { data: asset, error } = await adminClient
    .from("brand_assets")
    .update(updates)
    .eq("id", body.assetId)
    .eq("project_id", id)
    .select()
    .single();

  if (error || !asset) {
    console.error("Failed to update brand asset:", error?.message);
    return NextResponse.json({ error: "failed to update asset" }, { status: 500 });
  }

  return NextResponse.json({ asset });
}
