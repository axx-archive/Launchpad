import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUserIds } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";
import type { Project, ScoutMessage, ProjectNarrative, MessageAttachment } from "@/types/database";
import type { PitchAppManifest } from "@/lib/scout/types";
import { buildSystemPrompt } from "@/lib/scout/context";
import { SCOUT_TOOLS, handleToolCall, type ToolContext } from "@/lib/scout/tools";
import { sendEditBriefReceivedEmail } from "@/lib/email";

export const maxDuration = 120;

/**
 * Ensure strict user/assistant alternation in message history.
 * Consecutive same-role messages are merged into one.
 * Also ensures the first message is from the user role.
 */
function sanitizeHistory(
  msgs: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  if (msgs.length === 0) return [];

  const result: Anthropic.MessageParam[] = [];

  for (const msg of msgs) {
    const prev = result[result.length - 1];
    if (prev && prev.role === msg.role) {
      // Merge consecutive same-role messages
      const prevText =
        typeof prev.content === "string"
          ? prev.content
          : prev.content.map((b) => ("text" in b ? b.text : "")).join("");
      const curText =
        typeof msg.content === "string"
          ? msg.content
          : msg.content.map((b) => ("text" in b ? b.text : "")).join("");
      prev.content = `${prevText}\n\n${curText}`;
    } else {
      result.push({ ...msg });
    }
  }

  // Ensure first message is user role (Anthropic API requirement)
  while (result.length > 0 && result[0].role !== "user") {
    result.shift();
  }

  return result;
}

// ---------------------------------------------------------------------------
// Attachment → Claude content block helpers
// ---------------------------------------------------------------------------

async function buildAttachmentContentBlocks(
  attachments: MessageAttachment[],
  adminClient: ReturnType<typeof createAdminClient>,
): Promise<Anthropic.ContentBlockParam[]> {
  const blocks: Anthropic.ContentBlockParam[] = [];

  for (const attachment of attachments) {
    const isImage = IMAGE_MIME_TYPES.has(attachment.mime_type);

    if (isImage) {
      // Download from storage and convert to base64 for vision
      try {
        const { data: blob, error } = await adminClient.storage
          .from("brand-assets")
          .download(attachment.storage_path);

        if (error || !blob) {
          blocks.push({
            type: "text",
            text: `[attached image: ${attachment.file_name} — could not load for preview]`,
          });
          continue;
        }

        const buffer = await blob.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const mediaType = attachment.mime_type as "image/png" | "image/jpeg" | "image/webp" | "image/gif";

        blocks.push({
          type: "image",
          source: { type: "base64", media_type: mediaType, data: base64 },
        });
        blocks.push({
          type: "text",
          text: `[attached image: ${attachment.file_name}, ${(attachment.file_size / (1024 * 1024)).toFixed(1)}MB]`,
        });
      } catch {
        blocks.push({
          type: "text",
          text: `[attached image: ${attachment.file_name} — failed to load]`,
        });
      }
    } else {
      // Non-image: include as text reference (the build team handles the actual file)
      blocks.push({
        type: "text",
        text: `[attached file: ${attachment.file_name}, ${attachment.mime_type}, ${(attachment.file_size / (1024 * 1024)).toFixed(1)}MB — available as brand asset for the build team]`,
      });
    }
  }

  return blocks;
}

const RATE_LIMIT_MS = 2000;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TOOL_ROUNDS = 3;
const DAILY_MESSAGE_CAP = 50;
const MAX_ATTACHMENTS_PER_MESSAGE = 3;
const MAX_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024; // 20MB total per message
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  // --- Auth ---
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // --- Parse body ---
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "invalid json body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const projectId = body.project_id;
  const userMessage = body.message;
  const attachments = (body.attachments ?? []) as MessageAttachment[];

  if (!projectId || typeof projectId !== "string") {
    return new Response(
      JSON.stringify({ error: "project_id is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Message text is optional when attachments are present
  const hasAttachments = attachments.length > 0;
  if (!hasAttachments && (!userMessage || typeof userMessage !== "string" || !userMessage.trim())) {
    return new Response(
      JSON.stringify({ error: "message is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (userMessage && typeof userMessage === "string" && userMessage.length > MAX_MESSAGE_LENGTH) {
    return new Response(
      JSON.stringify({ error: `message must be ${MAX_MESSAGE_LENGTH} characters or fewer` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Validate attachments
  if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return new Response(
      JSON.stringify({ error: `max ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const totalAttachmentBytes = attachments.reduce((sum, a) => sum + (a.file_size || 0), 0);
  if (totalAttachmentBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
    return new Response(
      JSON.stringify({ error: "attachments exceed 20MB total limit" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // --- Rate limit: per-second ---
  const { data: lastMsg } = await supabase
    .from("scout_messages")
    .select("created_at")
    .eq("project_id", projectId)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (lastMsg) {
    const elapsed = Date.now() - new Date(lastMsg.created_at).getTime();
    if (elapsed < RATE_LIMIT_MS) {
      return new Response(
        JSON.stringify({ error: "too many requests. wait a moment and try again." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // --- Rate limit: daily cap per project ---
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count: todayCount } = await supabase
    .from("scout_messages")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("role", "user")
    .gte("created_at", todayStart.toISOString());

  if ((todayCount ?? 0) >= DAILY_MESSAGE_CAP) {
    return new Response(
      JSON.stringify({
        error: `daily message limit reached (${DAILY_MESSAGE_CAP} messages per project per day). try again tomorrow.`,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  // --- Load project (RLS ensures user owns it) ---
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return new Response(
      JSON.stringify({ error: "project not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const typedProject = project as Project;

  // --- Load manifest + documents (parallel) ---
  const admin = createAdminClient();

  const [manifestResult, docsResult, narrativeResult, brandAssetsResult] = await Promise.all([
    supabase
      .from("pitchapp_manifests")
      .select("*")
      .eq("project_id", projectId)
      .single(),
    admin.storage
      .from("documents")
      .list(projectId, { limit: 20 }),
    supabase
      .from("project_narratives")
      .select("*")
      .eq("project_id", projectId)
      .neq("status", "superseded")
      .order("version", { ascending: false })
      .limit(1)
      .single(),
    admin
      .from("brand_assets")
      .select("category, source")
      .eq("project_id", projectId),
  ]);

  const manifest = (manifestResult.data as PitchAppManifest) ?? null;
  const narrative = (narrativeResult.data as ProjectNarrative) ?? null;
  const documentNames = (docsResult.data ?? [])
    .filter((f) => f.name !== ".emptyFolderPlaceholder")
    .map((f) => f.name.replace(/^\d+_/, ""));

  // Build brand asset summary for system prompt
  const brandAssetRows = (brandAssetsResult.data ?? []) as { category: string; source: string }[];
  const brandAssets = brandAssetRows.length > 0
    ? {
        total: brandAssetRows.length,
        byCategory: brandAssetRows.reduce<Record<string, number>>((acc, a) => {
          acc[a.category] = (acc[a.category] || 0) + 1;
          return acc;
        }, {}),
        revisionCount: brandAssetRows.filter((a) => a.source === "revision").length,
      }
    : null;

  // --- Load conversation history (with summary for long threads) ---
  const { data: history } = await supabase
    .from("scout_messages")
    .select("role, content")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  const allHistory = history ?? [];
  const SUMMARY_THRESHOLD = 30;
  const RECENT_WINDOW = 20;

  let previousMessages: Anthropic.MessageParam[];
  let conversationSummary: string | null = null;

  if (allHistory.length > SUMMARY_THRESHOLD) {
    // Summarize older messages, keep recent window in full
    const olderMessages = allHistory.slice(0, -RECENT_WINDOW);
    const recentMessages = allHistory.slice(-RECENT_WINDOW);

    // Build a condensed summary of older conversation
    const summaryParts: string[] = [];
    let briefMentions = 0;
    for (const msg of olderMessages) {
      const m = msg as Pick<ScoutMessage, "role" | "content">;
      if (m.role === "user") {
        // Extract key topics from user messages
        const trimmed = m.content.trim().slice(0, 100);
        summaryParts.push(`client asked: "${trimmed}${m.content.length > 100 ? "..." : ""}"`);
      }
      if (m.content.includes("EDIT_BRIEF") || m.content.includes("brief_submitted")) {
        briefMentions++;
      }
    }

    conversationSummary = [
      `[conversation summary: ${olderMessages.length} earlier messages condensed]`,
      summaryParts.slice(-8).join("; "), // Last 8 user topics
      briefMentions > 0 ? `(${briefMentions} edit brief(s) were submitted in earlier conversation)` : "",
    ].filter(Boolean).join("\n");

    previousMessages = recentMessages.map(
      (msg: Pick<ScoutMessage, "role" | "content">) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })
    );
  } else {
    previousMessages = allHistory.slice(-RECENT_WINDOW).map(
      (msg: Pick<ScoutMessage, "role" | "content">) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })
    );
  }

  // Count previous edit briefs for system prompt context
  const { count: briefCount } = await supabase
    .from("scout_messages")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .not("edit_brief_md", "is", null);

  const systemPrompt = buildSystemPrompt({
    project: typedProject,
    manifest,
    narrative,
    documentNames,
    briefCount: briefCount ?? 0,
    brandAssets,
    conversationSummary,
  });

  // --- Verify attachments belong to this project (use DB paths, not client-provided) ---
  let verifiedAttachments = attachments;
  if (hasAttachments) {
    const assetIds = attachments.map((a) => a.asset_id).filter(Boolean);
    if (assetIds.length > 0) {
      const { data: verified } = await admin
        .from("brand_assets")
        .select("id, storage_path, file_name, mime_type, file_size")
        .in("id", assetIds)
        .eq("project_id", projectId);

      const verifiedMap = new Map(
        (verified ?? []).map((v: { id: string; storage_path: string; file_name: string; mime_type: string; file_size: number }) => [v.id, v])
      );
      verifiedAttachments = attachments
        .filter((a) => verifiedMap.has(a.asset_id))
        .map((a) => {
          const db = verifiedMap.get(a.asset_id)!;
          return { ...a, storage_path: db.storage_path };
        });
    }
  }

  // --- Persist user message before streaming ---
  const messageText = (userMessage && typeof userMessage === "string" ? userMessage.trim() : "") ||
    (hasAttachments ? `[${attachments.length} file${attachments.length > 1 ? "s" : ""} attached]` : "");
  const insertPayload: Record<string, unknown> = {
    project_id: projectId,
    role: "user",
    content: messageText,
  };
  if (verifiedAttachments.length > 0) {
    insertPayload.attachments = verifiedAttachments;
  }
  const { data: userMsgRow, error: userMsgErr } = await supabase
    .from("scout_messages")
    .insert(insertPayload)
    .select("id")
    .single();
  if (userMsgErr) console.error("Failed to persist user message:", userMsgErr.message);

  // Link uploaded assets to this message (audit trail)
  if (verifiedAttachments.length > 0 && userMsgRow?.id) {
    const verifiedAssetIds = verifiedAttachments.map((a) => a.asset_id).filter(Boolean);
    if (verifiedAssetIds.length > 0) {
      await admin
        .from("brand_assets")
        .update({ linked_message_id: userMsgRow.id })
        .in("id", verifiedAssetIds)
        .eq("project_id", projectId);
    }
  }

  // --- Tool context (scoped to this project — NEVER accept projectId from Claude) ---
  const toolCtx: ToolContext = {
    projectId,
    supabase,
    adminClient: admin,
    manifest,
  };

  // --- Stream with tool use loop ---
  const anthropic = new Anthropic();
  const encoder = new TextEncoder();

  // Build the current user message — with vision content blocks if attachments present
  let currentUserContent: Anthropic.ContentBlockParam[] | string;
  if (verifiedAttachments.length > 0) {
    const attachmentBlocks = await buildAttachmentContentBlocks(verifiedAttachments, admin);
    currentUserContent = [
      ...attachmentBlocks,
      { type: "text" as const, text: messageText },
    ];
  } else {
    currentUserContent = messageText;
  }

  // Build initial messages array (sanitize to ensure strict alternation)
  const messages: Anthropic.MessageParam[] = sanitizeHistory([
    ...previousMessages,
    { role: "user", content: currentUserContent },
  ]);

  let fullResponse = "";
  let briefData: { brief_json: unknown; brief_md: string; summary: string } | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let toolRound = 0;

        while (toolRound <= MAX_TOOL_ROUNDS) {
          if (request.signal.aborted) break;

          // --- Call Claude (streaming) ---
          const messageStream = anthropic.messages.stream({
            model: process.env.SCOUT_MODEL || "claude-sonnet-4-5-20250929",
            max_tokens: 2048,
            system: systemPrompt,
            messages,
            tools: SCOUT_TOOLS,
          });

          request.signal.addEventListener("abort", () => {
            messageStream.controller.abort();
          }, { once: true });

          // Collect the full response for this round
          const contentBlocks: Anthropic.ContentBlock[] = [];
          let roundText = "";
          let stopReason: string | null = null;

          for await (const event of messageStream) {
            if (request.signal.aborted) break;

            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const text = event.delta.text;
              roundText += text;
              fullResponse += text;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`)
              );
            }

            // Collect content blocks from the final message
            if (event.type === "message_stop") {
              const finalMessage = await messageStream.finalMessage();
              contentBlocks.push(...finalMessage.content);
              stopReason = finalMessage.stop_reason;
            }
          }

          if (request.signal.aborted) break;

          // --- If no tool use, we're done ---
          if (stopReason !== "tool_use") {
            break;
          }

          // --- Tool use round ---
          toolRound++;

          // Add assistant message with all content blocks to conversation
          messages.push({ role: "assistant", content: contentBlocks });

          // Process each tool use block
          const toolUseBlocks = contentBlocks.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );

          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const toolUse of toolUseBlocks) {
            // Send tool_start SSE
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "tool_start", tool: toolUse.name })}\n\n`
              )
            );

            // Execute tool (always scoped to authenticated projectId)
            const result = await handleToolCall(
              toolUse.name,
              toolUse.input as Record<string, unknown>,
              toolCtx,
            );

            // Check if this is a narrative revision submission
            if (toolUse.name === "submit_narrative_revision" && typeof result === "string") {
              try {
                const parsed = JSON.parse(result);
                if (parsed.__narrative_revision_submitted) {
                  // Perform the narrative rejection using admin client
                  await handleNarrativeRevision(
                    admin,
                    projectId,
                    typedProject,
                    user,
                    parsed.notes,
                  );

                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "narrative_revision_submitted",
                        summary: parsed.summary,
                        change_count: parsed.section_count,
                      })}\n\n`
                    )
                  );
                }
              } catch {
                // Not a JSON response
              }
            }

            // Check if this is a brief submission (string result with JSON marker)
            if (toolUse.name === "submit_edit_brief" && typeof result === "string") {
              try {
                const parsed = JSON.parse(result);
                if (parsed.__brief_submitted) {
                  briefData = {
                    brief_json: parsed.brief_json,
                    brief_md: parsed.brief_md,
                    summary: parsed.summary,
                  };

                  // Send brief_submitted SSE
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "brief_submitted",
                        summary: parsed.summary,
                        change_count: parsed.change_count,
                      })}\n\n`
                    )
                  );
                }
              } catch {
                // Not a JSON response — tool returned an error string
              }
            }

            // Check if this is a feedback finalization
            if (toolUse.name === "finalize_feedback" && typeof result === "string") {
              try {
                const parsed = JSON.parse(result);
                if (parsed.__feedback_finalized) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: "feedback_finalized",
                        confirmation: parsed.confirmation,
                      })}\n\n`
                    )
                  );
                }
              } catch {
                // Not a JSON response
              }
            }

            // Build tool result — supports both string and content block arrays (for images)
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: typeof result === "string" ? result : result,
            });

            // Send tool_done SSE
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "tool_done", tool: toolUse.name })}\n\n`
              )
            );
          }

          // Add tool results to conversation
          messages.push({ role: "user", content: toolResults });
        }

        // --- Persist BEFORE closing stream (serverless may kill after close) ---
        // For tool-only responses (no text streamed), use brief summary or skip
        const responseToSave = fullResponse.trim()
          ? fullResponse
          : briefData
            ? `[tool response] ${briefData.summary}`
            : "";

        if (responseToSave) {
          await persistAssistantResponse(
            supabase,
            projectId,
            responseToSave,
            typedProject,
            briefData,
          );
        }

        // Send done event and close
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
        );
        controller.close();
      } catch (err) {
        // Clean up orphaned user message (no assistant reply will follow)
        supabase
          .from("scout_messages")
          .delete()
          .eq("project_id", projectId)
          .eq("role", "user")
          .eq("content", messageText)
          .order("created_at", { ascending: false })
          .limit(1)
          .then(({ error: delErr }) => {
            if (delErr) console.error("Failed to clean up orphaned user message:", delErr.message);
          });

        if (request.signal.aborted) {
          controller.close();
          return;
        }
        const message =
          err instanceof Error ? err.message : "stream failed";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ---------------------------------------------------------------------------
// Persistence + brief handling
// ---------------------------------------------------------------------------

async function persistAssistantResponse(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  assistantResponse: string,
  project: Project,
  briefData: { brief_json: unknown; brief_md: string; summary: string } | null,
) {
  // Check for legacy regex-based edit brief markers (backwards compat)
  const briefMatch = assistantResponse.match(
    /---EDIT_BRIEF---\s*([\s\S]*?)\s*---END_BRIEF---/
  );
  const legacyBriefMd = briefMatch ? briefMatch[1].trim() : null;

  // Determine which brief to persist (tool-based takes priority)
  const editBriefMd = briefData?.brief_md ?? legacyBriefMd;
  const editBriefJson = briefData?.brief_json ?? null;
  const hasBrief = editBriefMd !== null;

  // Save assistant message
  const { error: assistMsgErr } = await supabase.from("scout_messages").insert({
    project_id: projectId,
    role: "assistant",
    content: assistantResponse,
    edit_brief_md: editBriefMd,
    edit_brief_json: editBriefJson,
  });
  if (assistMsgErr) console.error("Failed to persist assistant message:", assistMsgErr.message);

  // If brief detected, create admin notification and update status
  if (hasBrief) {
    const admin = createAdminClient();

    const adminIds = await getAdminUserIds(admin);

    if (adminIds.length > 0) {
      const briefSummary = briefData?.summary ?? "edit brief submitted";
      const notifications = adminIds.map((adminId) => ({
        user_id: adminId,
        project_id: projectId,
        type: "brief_submitted",
        title: "new edit brief",
        body: `scout generated a brief for ${project.project_name}: ${briefSummary}`,
      }));

      await admin.from("notifications").insert(notifications);

      // Send email to admin users about the new edit brief
      const adminEmails = (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      for (const email of adminEmails) {
        sendEditBriefReceivedEmail(email, project.project_name).catch((err) =>
          console.error("Failed to send edit brief email:", err)
        );
      }
    }

    // Auto-transition project status to 'revision' if currently 'review'
    // Also set brief accumulation cooldown (5 min) so auto-revise waits for more feedback
    const cooldownUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    if (project.status === "review") {
      await admin
        .from("projects")
        .update({ status: "revision", revision_cooldown_until: cooldownUntil })
        .eq("id", projectId)
        .eq("status", "review");
    } else {
      // Already in revision — just bump cooldown
      await admin
        .from("projects")
        .update({ revision_cooldown_until: cooldownUntil })
        .eq("id", projectId);
    }
  }
}

// ---------------------------------------------------------------------------
// Narrative revision handler — performs the reject flow via admin client
// (avoids circular unauthenticated HTTP call to our own API endpoint)
// ---------------------------------------------------------------------------

async function handleNarrativeRevision(
  adminClient: ReturnType<typeof createAdminClient>,
  projectId: string,
  project: Project,
  user: { id: string; email?: string },
  notes: string,
) {
  // Fetch the current pending_review narrative
  const { data: narratives } = await adminClient
    .from("project_narratives")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "pending_review")
    .order("version", { ascending: false })
    .limit(1);

  if (!narratives || narratives.length === 0) return;

  const narrative = narratives[0];

  // Update narrative status to rejected
  await adminClient
    .from("project_narratives")
    .update({
      status: "rejected",
      revision_notes: notes,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", narrative.id);

  // Log to automation_log
  await adminClient.from("automation_log").insert({
    project_id: projectId,
    event: "narrative-rejected",
    details: {
      narrative_id: narrative.id,
      version: narrative.version,
      rejected_by: user.id,
      via: "scout",
    },
  });

  // Create auto-narrative pipeline job with revision notes
  await adminClient.from("pipeline_jobs").insert({
    project_id: projectId,
    job_type: "auto-narrative",
    status: "queued",
    payload: {
      revision_notes: notes,
      previous_narrative_id: narrative.id,
      previous_version: narrative.version,
    },
    attempts: 0,
    max_attempts: 3,
    created_at: new Date().toISOString(),
  });

  // Notify admins
  const adminIds = await getAdminUserIds(adminClient);
  if (adminIds.length > 0) {
    await adminClient.from("notifications").insert(
      adminIds.map((adminId) => ({
        user_id: adminId,
        project_id: projectId,
        type: "narrative_rejected",
        title: "narrative revision requested via scout",
        body: `${project.company_name} requested narrative changes on "${project.project_name}".`,
      }))
    );
  }
}
