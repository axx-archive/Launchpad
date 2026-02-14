import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectAccess } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// GET /api/projects/[id]/documents/download?fileName=xxx — get a signed download URL (any member)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await verifyProjectAccess(id);

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const fileName = request.nextUrl.searchParams.get("fileName");
  if (!fileName) {
    return NextResponse.json({ error: "fileName is required" }, { status: 400 });
  }

  if (fileName.includes("/") || fileName.includes("..")) {
    return NextResponse.json({ error: "invalid fileName" }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const storagePath = `${id}/${fileName}`;

  const { data, error } = await adminClient.storage
    .from("documents")
    .createSignedUrl(storagePath, 60); // 60 second expiry

  if (error) {
    console.error("Failed to create signed download URL:", error.message);
    return NextResponse.json({ error: "failed to generate download link" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
