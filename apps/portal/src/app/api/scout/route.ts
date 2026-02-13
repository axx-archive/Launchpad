import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";
import type { Project, ScoutMessage } from "@/types/database";
import type { PitchAppManifest } from "@/lib/scout/types";
import { buildSystemPrompt } from "@/lib/scout/context";
import { SCOUT_TOOLS, handleToolCall, type ToolContext } from "@/lib/scout/tools";

const RATE_LIMIT_MS = 2000;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TOOL_ROUNDS = 3;
const DAILY_MESSAGE_CAP = 50;

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

  if (!projectId || typeof projectId !== "string") {
    return new Response(
      JSON.stringify({ error: "project_id is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!userMessage || typeof userMessage !== "string" || !userMessage.trim()) {
    return new Response(
      JSON.stringify({ error: "message is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (userMessage.length > MAX_MESSAGE_LENGTH) {
    return new Response(
      JSON.stringify({ error: `message must be ${MAX_MESSAGE_LENGTH} characters or fewer` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // --- Rate limit: per-second ---
  const { data: lastMsg } = await supabase
    .from("scout_messages")
    .select("created_at")
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

  const [manifestResult, docsResult] = await Promise.all([
    supabase
      .from("pitchapp_manifests")
      .select("*")
      .eq("project_id", projectId)
      .single(),
    admin.storage
      .from("documents")
      .list(projectId, { limit: 20 }),
  ]);

  const manifest = (manifestResult.data as PitchAppManifest) ?? null;
  const documentNames = (docsResult.data ?? [])
    .filter((f) => f.name !== ".emptyFolderPlaceholder")
    .map((f) => f.name.replace(/^\d+_/, ""));

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
    documentNames,
    briefCount: briefCount ?? 0,
    conversationSummary,
  });

  // --- Persist user message before streaming ---
  const { error: userMsgErr } = await supabase.from("scout_messages").insert({
    project_id: projectId,
    role: "user",
    content: userMessage.trim(),
  });
  if (userMsgErr) console.error("Failed to persist user message:", userMsgErr.message);

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

  // Build initial messages array
  const messages: Anthropic.MessageParam[] = [
    ...previousMessages,
    { role: "user", content: userMessage.trim() },
  ];

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

        // Send done event
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
        );
        controller.close();

        // --- Post-stream: persist and handle briefs ---
        await persistAssistantResponse(
          supabase,
          projectId,
          fullResponse,
          typedProject,
          briefData,
        );
      } catch (err) {
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

    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (adminEmails.length > 0) {
      const { data: adminUsers } = await admin.auth.admin.listUsers();

      const adminIds = (adminUsers?.users ?? [])
        .filter((u) => u.email && adminEmails.includes(u.email.toLowerCase()))
        .map((u) => u.id);

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
      }
    }

    // Auto-transition project status to 'revision' if currently 'review'
    if (project.status === "review") {
      await admin
        .from("projects")
        .update({ status: "revision" })
        .eq("id", projectId)
        .eq("status", "review");
    }
  }
}
