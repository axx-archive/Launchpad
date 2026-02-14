import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectAccess } from "@/lib/auth";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { BrandAnalysis } from "@/types/database";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
const MAX_IMAGES = 8; // Limit vision API calls
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // Skip images over 5MB for vision

// POST /api/projects/[id]/analyze-brand — extract brand DNA from uploaded assets
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await verifyProjectAccess(id, ["owner", "editor"]);

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const adminClient = createAdminClient();

  // Fetch brand assets for this project
  const { data: assets, error: assetsError } = await adminClient
    .from("brand_assets")
    .select("*")
    .eq("project_id", id)
    .order("category")
    .order("sort_order");

  if (assetsError) {
    return NextResponse.json({ error: "failed to load brand assets" }, { status: 500 });
  }

  if (!assets || assets.length === 0) {
    return NextResponse.json({ error: "no brand assets uploaded yet" }, { status: 400 });
  }

  // Filter to image assets that Vision API can analyze
  const imageAssets = assets.filter(
    (a) => IMAGE_TYPES.includes(a.mime_type) && a.file_size <= MAX_IMAGE_BYTES && a.storage_path,
  );

  if (imageAssets.length === 0) {
    return NextResponse.json(
      { error: "no analyzable images found — upload logos or brand images" },
      { status: 400 },
    );
  }

  // Download images and build content blocks for Vision API
  const selectedAssets = imageAssets.slice(0, MAX_IMAGES);
  const imageBlocks: Anthropic.Messages.ImageBlockParam[] = [];
  const assetDescriptions: string[] = [];

  for (const asset of selectedAssets) {
    try {
      const { data: signedData } = await adminClient.storage
        .from("brand-assets")
        .createSignedUrl(asset.storage_path, 300);

      if (!signedData?.signedUrl) continue;

      const res = await fetch(signedData.signedUrl);
      if (!res.ok) continue;

      const buffer = await res.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");

      // Map mime types to Vision API media types
      const mediaType = asset.mime_type === "image/svg+xml"
        ? "image/png" as const // SVGs get rasterized on upload, but handle edge case
        : asset.mime_type as "image/png" | "image/jpeg" | "image/webp" | "image/gif";

      imageBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: base64,
        },
      });

      assetDescriptions.push(`- ${asset.file_name} (${asset.category})`);
    } catch (err) {
      console.error(`[analyze-brand] Failed to download ${asset.file_name}:`, err);
    }
  }

  if (imageBlocks.length === 0) {
    return NextResponse.json(
      { error: "failed to download brand assets for analysis" },
      { status: 500 },
    );
  }

  // Build font context from non-image assets (font files, Google Fonts links)
  const fontAssets = assets.filter((a) => a.category === "font");
  const fontContext = fontAssets.length > 0
    ? `\n\nFont assets provided:\n${fontAssets.map((f) => `- ${f.file_name}${f.label ? ` (${f.label})` : ""}`).join("\n")}`
    : "";

  // Call Claude Vision API
  const anthropic = new Anthropic();

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `Analyze these brand assets and extract the brand DNA. The assets are:
${assetDescriptions.join("\n")}${fontContext}

Return ONLY valid JSON — no markdown fences, no commentary outside the JSON.

JSON shape:
{
  "colors": {
    "primary": "#hex — the dominant brand color",
    "secondary": "#hex or null — secondary brand color if identifiable",
    "accent": "#hex or null — accent/highlight color if present",
    "background": "#hex or null — suggested background (dark palette default)",
    "text": "#hex or null — suggested text color for readability"
  },
  "fonts": {
    "heading": "Font name or null — identified or suggested display font",
    "body": "Font name or null — identified or suggested body font"
  },
  "style_direction": "One of: modern-minimal, classic-elegant, bold-energetic, corporate-professional, playful-creative, tech-forward, luxury-refined, organic-natural",
  "logo_notes": "Brief notes about logo treatment — light/dark background suitability, spacing, any notable characteristics"
}

Rules:
- Extract colors from the actual imagery — dominant colors from logos, brand guides, screenshots
- If a brand guide PDF was mentioned, prioritize any explicit color values shown
- For fonts: if font files are provided, use those names. Otherwise identify or suggest closest Google Fonts match
- style_direction should reflect the overall visual tone of the brand
- Colors should be exact hex values, not approximations like "blue"
- For dark PitchApp themes: suggest background as near-black (#0a0a0a to #1a1a1a) unless brand clearly demands light
- primary color becomes the CSS --color-accent in the PitchApp build`,
            },
          ],
        },
      ],
    });

    // Extract text response
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "no response from analysis" }, { status: 500 });
    }

    // Parse JSON response
    const cleaned = textBlock.text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[analyze-brand] Failed to parse response:", cleaned.slice(0, 500));
      return NextResponse.json({ error: "failed to parse brand analysis" }, { status: 500 });
    }

    // Validate and structure the result
    const colors = parsed.colors as Record<string, string | null> | undefined;
    const fonts = parsed.fonts as Record<string, string | null> | undefined;

    const analysis: BrandAnalysis = {
      colors: {
        primary: colors?.primary ?? "#c8a44e",
        secondary: colors?.secondary ?? null,
        accent: colors?.accent ?? null,
        background: colors?.background ?? null,
        text: colors?.text ?? null,
      },
      fonts: {
        heading: fonts?.heading ?? null,
        body: fonts?.body ?? null,
      },
      style_direction: (parsed.style_direction as string) ?? "modern-minimal",
      logo_notes: (parsed.logo_notes as string) ?? null,
      analyzed_at: new Date().toISOString(),
      asset_count: imageBlocks.length,
    };

    // Store in projects.brand_analysis
    const { error: updateError } = await adminClient
      .from("projects")
      .update({
        brand_analysis: analysis,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("[analyze-brand] Failed to store analysis:", updateError.message);
      return NextResponse.json({ error: "failed to save brand analysis" }, { status: 500 });
    }

    return NextResponse.json({ analysis });
  } catch (err) {
    console.error("[analyze-brand] Vision API error:", err);
    return NextResponse.json(
      { error: "brand analysis failed — try again" },
      { status: 500 },
    );
  }
}

// GET /api/projects/[id]/analyze-brand — retrieve stored brand analysis
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await verifyProjectAccess(id);

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const adminClient = createAdminClient();
  const { data: project, error } = await adminClient
    .from("projects")
    .select("brand_analysis")
    .eq("id", id)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  return NextResponse.json({ analysis: project.brand_analysis });
}
