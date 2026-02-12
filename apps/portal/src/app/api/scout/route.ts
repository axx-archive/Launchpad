import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";
import type { Project, ScoutMessage } from "@/types/database";

const RATE_LIMIT_MS = 2000;
const MAX_MESSAGE_LENGTH = 2000;

function buildSystemPrompt(project: Project, briefCount: number): string {
  return `You are Scout, a project assistant for Launchpad by bonfire labs.

<project_context>
Project: ${project.project_name}
Company: ${project.company_name}
Status: ${project.status}
Type: ${project.type}
PitchApp URL: ${project.pitchapp_url || "not yet built"}
Previous edit briefs: ${briefCount}
</project_context>

Your role:
- Help the client request edits to their PitchApp
- Translate vague requests into specific, actionable briefs
- Answer questions about their project status and the process
- Stay focused on this project — redirect off-topic questions

Your voice:
- Concise, direct, warm but not bubbly
- Lowercase. Short sentences. No exclamation marks.
- Use build/deploy/brief vocabulary naturally
- Never say "Sure!", "Of course!", "Absolutely!", "I'd be happy to!"
- No emoji
- Respond in plain text only. No markdown formatting (no bold, no headers, no bullet lists) in conversation. Save structured formatting for edit briefs only.

When the client has described changes they want:
1. Summarize the changes back to them
2. Ask if they want to submit the brief
3. When confirmed, output the brief in this format:

---EDIT_BRIEF---
# Edit Brief — ${project.project_name}
## Requested Changes
1. **{change}** — {details}
---END_BRIEF---`;
}

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

  // --- Rate limit (DB-based: 1 message per 2 seconds across all projects) ---
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

  // --- Load conversation history ---
  const { data: history } = await supabase
    .from("scout_messages")
    .select("role, content")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  const recentHistory = (history ?? []).slice(-20);

  const previousMessages: Anthropic.MessageParam[] = recentHistory.map(
    (msg: Pick<ScoutMessage, "role" | "content">) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })
  );

  // Count previous edit briefs for system prompt context
  const { count: briefCount } = await supabase
    .from("scout_messages")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .not("edit_brief_md", "is", null);

  // Build messages array: history + new user message
  const messages: Anthropic.MessageParam[] = [
    ...previousMessages,
    { role: "user", content: userMessage.trim() },
  ];

  const systemPrompt = buildSystemPrompt(typedProject, briefCount ?? 0);

  // --- Persist user message before streaming (fixes rate limit race condition) ---
  const { error: userMsgErr } = await supabase.from("scout_messages").insert({
    project_id: projectId,
    role: "user",
    content: userMessage.trim(),
  });
  if (userMsgErr) console.error("Failed to persist user message:", userMsgErr.message);

  // --- Stream from Claude ---
  const anthropic = new Anthropic();

  const encoder = new TextEncoder();
  let fullResponse = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const messageStream = anthropic.messages.stream({
          model: process.env.SCOUT_MODEL || "claude-sonnet-4-5-20250929",
          max_tokens: 1024,
          system: systemPrompt,
          messages,
        });

        // Abort Claude stream if client disconnects
        request.signal.addEventListener("abort", () => {
          messageStream.controller.abort();
        });

        for await (const event of messageStream) {
          if (request.signal.aborted) break;
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            fullResponse += text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`)
            );
          }
        }

        // Send done event
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
        );
        controller.close();

        // --- Post-stream: persist assistant response and detect briefs ---
        await persistAssistantResponse(
          supabase,
          projectId,
          fullResponse,
          typedProject
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

async function persistAssistantResponse(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  assistantResponse: string,
  project: Project
) {
  // Check for edit brief markers
  const briefMatch = assistantResponse.match(
    /---EDIT_BRIEF---\s*([\s\S]*?)\s*---END_BRIEF---/
  );
  const editBriefMd = briefMatch ? briefMatch[1].trim() : null;

  // Save assistant message
  const { error: assistMsgErr } = await supabase.from("scout_messages").insert({
    project_id: projectId,
    role: "assistant",
    content: assistantResponse,
    edit_brief_md: editBriefMd,
  });
  if (assistMsgErr) console.error("Failed to persist assistant message:", assistMsgErr.message);

  // If brief detected, create admin notification and update status
  if (editBriefMd) {
    const admin = createAdminClient();

    // Get admin user IDs
    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (adminEmails.length > 0) {
      // NOTE: listUsers() returns paginated results (default 50 per page).
      // Fine for <50 total users. At scale, query admin users by email directly.
      const { data: adminUsers } = await admin.auth.admin.listUsers();

      const adminIds = (adminUsers?.users ?? [])
        .filter((u) => u.email && adminEmails.includes(u.email.toLowerCase()))
        .map((u) => u.id);

      // Create notification for each admin
      if (adminIds.length > 0) {
        const notifications = adminIds.map((adminId) => ({
          user_id: adminId,
          project_id: projectId,
          type: "brief_submitted",
          title: "new edit brief",
          body: `scout generated a brief for ${project.project_name}. review and assign.`,
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
