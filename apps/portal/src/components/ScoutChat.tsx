"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import TerminalChrome from "@/components/TerminalChrome";
import ChatAttachmentButton from "@/components/ChatAttachmentButton";
import StagedFiles from "@/components/StagedFiles";
import MessageAttachmentDisplay, {
  type MessageAttachmentFile,
} from "@/components/MessageAttachment";
import { uploadFileViaSignedUrl } from "@/components/FileUpload";
import { routeFile, ALL_ALLOWED_MIME_TYPES } from "@/lib/file-routing";
import type { ScoutMessage, MessageAttachment } from "@/types/database";

interface ScoutChatProps {
  projectId: string;
  projectName: string;
  initialMessages: ScoutMessage[];
  projectStatus?: string;
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  isError?: boolean;
  attachments?: MessageAttachmentFile[];
}

const DEFAULT_PROMPTS = [
  "walk me through my pitchapp",
  "i have changes",
  "what can you help with?",
  "explain this section",
];

const REVIEW_PROMPTS = [
  "walk me through it",
  "i have feedback",
  "what stands out?",
];

const NARRATIVE_REVIEW_PROMPTS = [
  "walk me through the story",
  "why this opening?",
  "i'd change something",
  "what's the strongest part?",
];

function relativeTime(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

const TYPING_SPEED_MS = 15;
const MAX_INPUT_LENGTH = 2000;
const SLOW_RESPONSE_MS = 10_000;

// File upload constraints
const MAX_STAGED_BYTES = 20 * 1024 * 1024; // 20MB total per message
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file

/** Statuses where file upload is enabled */
function isUploadEnabled(status?: string): boolean {
  return !!status && status !== "requested" && status !== "live";
}

const GREETING_LINES = [
  "hey. i'm scout — your project assistant for {project_name}.",
  "i can help you request edits, check on progress, or answer questions about your launchpad. describe what you need and i'll get it queued.",
];

const REVIEW_GREETING_LINES = [
  "hey. i'm scout — your project assistant for {project_name}.",
  "your launchpad is ready for review. i can walk you through it, take notes on what you'd like changed, or submit edit briefs to the build team.",
  "you can also drop images or documents here if you want to swap visuals.",
];

const NARRATIVE_GREETING_LINES = [
  "hey. i'm scout — your project assistant for {project_name}.",
  "your story arc is ready for review. i can walk you through the narrative, explain why we structured it this way, or take notes on what you'd like changed.",
];

export default function ScoutChat({
  projectId,
  projectName,
  initialMessages,
  projectStatus,
}: ScoutChatProps) {
  // Fix 8 — stable message keys via counter ref
  const messageIdRef = useRef(initialMessages.length);

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialMessages.map((m, i) => ({
      id: i,
      role: m.role,
      content: m.content,
      timestamp: m.created_at,
      attachments: (m.attachments ?? []).map((a) => ({
        file_name: a.file_name,
        mime_type: a.mime_type,
        file_size: a.file_size,
        progress: null,
      })),
    }))
  );

  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showGreeting, setShowGreeting] = useState(false);
  const [greetingText, setGreetingText] = useState("");
  const [greetingDone, setGreetingDone] = useState(false);
  const [briefSubmitted, setBriefSubmitted] = useState(false);
  const [briefSummary, setBriefSummary] = useState("");
  const [revisionSubmitted, setRevisionSubmitted] = useState(false);
  const [slowResponse, setSlowResponse] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);

  // File upload state
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Streaming refs
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamDoneRef = useRef(false);
  const charIndexRef = useRef(0);
  const fullTextRef = useRef("");
  // Fix 5 — AbortController
  const abortRef = useRef<AbortController | null>(null);
  // Fix 6 — slow response timer
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // H4 — streaming ref for race condition guard
  const streamingRef = useRef(false);
  // M8 — connection timeout ref
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canUpload = isUploadEnabled(projectStatus);

  // Fix 3 — smart auto-scroll (only if near bottom)
  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 60;
    if (isNearBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  // Force scroll (after user sends)
  const forceScrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, displayedText, greetingText, scrollToBottom]);

  // Show greeting if no messages
  useEffect(() => {
    if (initialMessages.length === 0 && !showGreeting && !greetingDone) {
      setShowGreeting(true);
      const greetingLines =
        projectStatus === "narrative_review"
          ? NARRATIVE_GREETING_LINES
          : projectStatus === "review" || projectStatus === "revision"
            ? REVIEW_GREETING_LINES
            : GREETING_LINES;
      const fullGreeting = greetingLines.map((line) =>
        line.replace("{project_name}", projectName)
      ).join("\n\n");

      let idx = 0;
      const interval = setInterval(() => {
        idx++;
        setGreetingText(fullGreeting.slice(0, idx));
        if (idx >= fullGreeting.length) {
          clearInterval(interval);
          setGreetingDone(true);
          setMessages([
            {
              id: messageIdRef.current++,
              role: "assistant",
              content: fullGreeting,
              timestamp: new Date().toISOString(),
            },
          ]);
          setShowGreeting(false);
          setGreetingText("");
        }
      }, TYPING_SPEED_MS);

      return () => clearInterval(interval);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fix 4 — focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Focus input when streaming ends
  useEffect(() => {
    if (!isStreaming && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      // Fix 5 — abort in-flight request
      abortRef.current?.abort();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // File handling
  // ---------------------------------------------------------------------------

  function validateFile(file: File): string | null {
    if (!ALL_ALLOWED_MIME_TYPES.includes(file.type)) {
      return `"${file.name}" — unsupported format`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `"${file.name}" — too large, 20MB max per file`;
    }
    return null;
  }

  function handleFileSelect(files: File[]) {
    setUploadError("");
    const currentBytes = stagedFiles.reduce((sum, f) => sum + f.size, 0);

    const toAdd: File[] = [];
    let runningBytes = currentBytes;
    for (const file of files) {
      const err = validateFile(file);
      if (err) {
        setUploadError(err);
        setTimeout(() => setUploadError(""), 5000);
        return;
      }
      if (runningBytes + file.size > MAX_STAGED_BYTES) {
        setUploadError("20MB max per message");
        setTimeout(() => setUploadError(""), 5000);
        break;
      }
      runningBytes += file.size;
      toAdd.push(file);
    }

    if (toAdd.length > 0) {
      setStagedFiles((prev) => [...prev, ...toAdd]);
    }
  }

  function handleRemoveStagedFile(index: number) {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
    setUploadError("");
  }

  // ---------------------------------------------------------------------------
  // Drag-and-drop (desktop only)
  // ---------------------------------------------------------------------------

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!canUpload || isStreaming) return;
    // Ignore non-file drags
    if (!e.dataTransfer.types.includes("Files")) return;
    setDragOver(true);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Only dismiss if leaving the container (not entering a child)
    const rect = scrollContainerRef.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = e;
      if (
        clientX <= rect.left ||
        clientX >= rect.right ||
        clientY <= rect.top ||
        clientY >= rect.bottom
      ) {
        setDragOver(false);
      }
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (!canUpload || isStreaming) return;
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(Array.from(e.dataTransfer.files));
    }
  }

  // ---------------------------------------------------------------------------
  // Clipboard paste
  // ---------------------------------------------------------------------------

  function handlePaste(e: React.ClipboardEvent) {
    if (!canUpload || isStreaming) return;
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;

    e.preventDefault();
    const files: File[] = [];
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
    if (files.length > 0) {
      handleFileSelect(files);
    }
  }

  // ---------------------------------------------------------------------------
  // Streaming
  // ---------------------------------------------------------------------------

  function clearSlowTimer() {
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
    setSlowResponse(false);
  }

  function startTypingAnimation() {
    if (typingIntervalRef.current) return;

    typingIntervalRef.current = setInterval(() => {
      const full = fullTextRef.current;
      const idx = charIndexRef.current;

      if (idx < full.length) {
        charIndexRef.current++;
        setDisplayedText(full.slice(0, charIndexRef.current));
      } else if (streamDoneRef.current) {
        if (typingIntervalRef.current) {
          clearInterval(typingIntervalRef.current);
          typingIntervalRef.current = null;
        }
        clearSlowTimer();
        const finalContent = fullTextRef.current;
        setMessages((prev) => [
          ...prev,
          {
            id: messageIdRef.current++,
            role: "assistant",
            content: finalContent,
            timestamp: new Date().toISOString(),
          },
        ]);
        setDisplayedText("");
        setIsStreaming(false);
        setIsTyping(false);
        fullTextRef.current = "";
        charIndexRef.current = 0;
        streamDoneRef.current = false;

        // Legacy brief detection (Phase 1 compat — Phase 2 uses SSE brief_submitted event)
        if (finalContent.includes("---EDIT_BRIEF---") && !briefSubmitted) {
          setBriefSubmitted(true);
          setTimeout(() => {
            setBriefSubmitted(false);
            setBriefSummary("");
          }, 4000);
        }
      }
    }, TYPING_SPEED_MS);
  }

  async function sendMessage(
    userMessage: string,
    attachments?: MessageAttachment[],
  ) {
    streamingRef.current = true;
    setIsStreaming(true);
    setIsTyping(true);
    setDisplayedText("");
    fullTextRef.current = "";
    charIndexRef.current = 0;
    streamDoneRef.current = false;

    // Fix 6 — start slow response timer
    slowTimerRef.current = setTimeout(() => {
      setSlowResponse(true);
    }, SLOW_RESPONSE_MS);

    try {
      // Fix 5 — AbortController
      abortRef.current = new AbortController();

      // M8 — 90-second connection timeout
      connectionTimeoutRef.current = setTimeout(() => {
        abortRef.current?.abort();
      }, 90_000);

      const body: Record<string, unknown> = {
        project_id: projectId,
        message: userMessage,
      };
      if (attachments && attachments.length > 0) {
        body.attachments = attachments;
      }

      const res = await fetch("/api/scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "something went wrong. try again.");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("no response stream");

      const decoder = new TextDecoder();
      setIsTyping(false);
      startTypingAnimation();

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "chunk" && parsed.text) {
              fullTextRef.current += parsed.text;
            } else if (parsed.type === "done") {
              streamDoneRef.current = true;
              setToolStatus(null);
            } else if (parsed.type === "error") {
              streamDoneRef.current = true;
              setToolStatus(null);
              if (!fullTextRef.current) {
                fullTextRef.current =
                  parsed.message || "something went wrong. try again.";
              }
            } else if (parsed.type === "tool_start") {
              const labels: Record<string, string> = {
                read_document: "reading your documents",
                get_section_detail: "reviewing section details",
                list_edit_briefs: "checking previous briefs",
                submit_edit_brief: "submitting your brief",
                submit_narrative_revision: "submitting narrative revision",
                view_screenshot: "viewing screenshot",
                list_brand_assets: "checking brand assets",
              };
              setToolStatus(labels[parsed.tool] ?? "thinking");
              clearSlowTimer();
            } else if (parsed.type === "tool_done") {
              setToolStatus(null);
            } else if (parsed.type === "brief_submitted") {
              setBriefSummary(parsed.summary || "");
              setBriefSubmitted(true);
              setTimeout(() => {
                setBriefSubmitted(false);
                setBriefSummary("");
              }, 5000);
            } else if (parsed.type === "narrative_revision_submitted") {
              setRevisionSubmitted(true);
              setTimeout(() => {
                setRevisionSubmitted(false);
              }, 5000);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }

      streamDoneRef.current = true;
      // M8 — clear connection timeout on success
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      streamingRef.current = false;
    } catch (err) {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
      clearSlowTimer();
      // M8 — clear connection timeout on error
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      streamingRef.current = false;

      // Don't show error for intentional aborts
      if (err instanceof DOMException && err.name === "AbortError") {
        setIsStreaming(false);
        setIsTyping(false);
        return;
      }

      const errorMsg =
        err instanceof Error
          ? err.message
          : "something went wrong. try again.";
      setMessages((prev) => [
        ...prev,
        { id: messageIdRef.current++, role: "assistant", content: errorMsg, timestamp: new Date().toISOString(), isError: true },
      ]);
      setDisplayedText("");
      setIsStreaming(false);
      setIsTyping(false);
      fullTextRef.current = "";
      charIndexRef.current = 0;
      streamDoneRef.current = false;
    }
  }

  async function handleSend() {
    const trimmed = input.trim();
    const hasFiles = stagedFiles.length > 0;
    if ((!trimmed && !hasFiles) || isStreaming) return;

    const userMessage = trimmed || "";
    const filesToUpload = [...stagedFiles];

    // Clear input and staged files immediately
    setInput("");
    setStagedFiles([]);
    setUploadError("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    // Build attachment display objects (start with progress: 0)
    const attachmentDisplays: MessageAttachmentFile[] = filesToUpload.map(
      (f) => ({
        file_name: f.name,
        mime_type: f.type,
        file_size: f.size,
        progress: 0,
      })
    );

    // Add user message to the chat (with attachments if any)
    const msgId = messageIdRef.current++;
    setMessages((prev) => [
      ...prev,
      {
        id: msgId,
        role: "user",
        content: userMessage,
        timestamp: new Date().toISOString(),
        attachments: attachmentDisplays.length > 0 ? attachmentDisplays : undefined,
      },
    ]);
    setTimeout(forceScrollToBottom, 0);

    // Upload files if any — smart routing by file type
    const uploadedAttachments: MessageAttachment[] = [];
    const routingSummary: string[] = [];
    if (filesToUpload.length > 0) {
      for (let i = 0; i < filesToUpload.length; i++) {
        const file = filesToUpload[i];
        const route = routeFile(file.name);

        const onProgress = (pct: number) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== msgId || !m.attachments) return m;
              const updated = [...m.attachments];
              updated[i] = { ...updated[i], progress: pct };
              return { ...m, attachments: updated };
            })
          );
        };

        let result: { ok: boolean; error?: string; asset?: Record<string, unknown> };

        if (route.bucket === "documents") {
          // Route to documents bucket
          result = await uploadFileViaSignedUrl(
            file,
            projectId,
            onProgress,
            { endpoint: `/api/projects/${projectId}/documents` }
          );
          if (result.ok) routingSummary.push(`${file.name} → documents`);
        } else {
          // Route to brand-assets with correct category
          result = await uploadFileViaSignedUrl(
            file,
            projectId,
            onProgress,
            {
              endpoint: `/api/projects/${projectId}/brand-assets`,
              extraBody: { category: route.category, source: "revision" },
            }
          );
          if (result.ok) routingSummary.push(`${file.name} → brand assets (${route.label})`);
        }

        if (result.ok) {
          // Mark complete (progress: null)
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== msgId || !m.attachments) return m;
              const updated = [...m.attachments];
              updated[i] = { ...updated[i], progress: null };
              return { ...m, attachments: updated };
            })
          );

          // Only brand-asset uploads return an asset record for Scout attachments
          if (result.asset) {
            const asset = result.asset as Record<string, string>;
            uploadedAttachments.push({
              asset_id: asset.id,
              file_name: asset.file_name ?? file.name,
              mime_type: asset.mime_type ?? file.type,
              file_size: Number(asset.file_size) || file.size,
              storage_path: asset.storage_path ?? "",
            });
          }
        } else {
          // Mark failed
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== msgId || !m.attachments) return m;
              const updated = [...m.attachments];
              updated[i] = {
                ...updated[i],
                progress: null,
                error: "upload failed — try again",
              };
              return { ...m, attachments: updated };
            })
          );
        }
      }
    }

    // Build message text — include routing summary so Scout can confirm
    let messageForScout = userMessage || "(attached files)";
    if (routingSummary.length > 0) {
      const suffix = `\n[uploaded: ${routingSummary.join(", ")}]`;
      messageForScout = userMessage ? `${userMessage}${suffix}` : suffix.trim();
    }

    // Send message to Scout (with or without attachments)
    // Even if some uploads failed, send the message with whatever succeeded
    await sendMessage(
      messageForScout,
      uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
    );
  }

  // Fix 2 — Enter to send, Shift+Enter for newline
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Fix 2 — auto-resize textarea
  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    // Cap at ~4 lines (4 * line-height ~24px = 96px)
    el.style.height = Math.min(el.scrollHeight, 96) + "px";
  }

  function handlePromptClick(prompt: string) {
    if (isStreaming) return;
    setInput(prompt);
    // Auto-submit after a tick so the input updates
    setTimeout(() => {
      // H4 — check ref inside callback to prevent double-submit race
      if (streamingRef.current) return;
      const trimmed = prompt.trim();
      if (!trimmed) return;
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      setMessages((prev) => [
        ...prev,
        { id: messageIdRef.current++, role: "user", content: trimmed, timestamp: new Date().toISOString() },
      ]);
      setTimeout(forceScrollToBottom, 0);
      sendMessage(trimmed);
    }, 0);
  }

  // Fix 1 — correct END_BRIEF marker
  function cleanContent(text: string): string {
    return text
      .replace(/---EDIT_BRIEF---[\s\S]*?---END_BRIEF---/g, "")
      .trim();
  }

  function formatExport(msgs: ChatMessage[], name: string): string {
    const header = `# Scout Conversation — ${name}\n\nExported: ${new Date().toISOString()}\n\n---\n\n`;
    const body = msgs
      .map((m) => {
        const ts = m.timestamp ? ` _(${m.timestamp})_` : "";
        const role = m.role === "user" ? "**you**" : "**scout**";
        return `${role}${ts}\n\n${cleanContent(m.content)}`;
      })
      .join("\n\n---\n\n");
    return header + body;
  }

  function handleExport() {
    if (messages.length === 0) return;
    const content = formatExport(messages, projectName);
    const safeName = projectName.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
    const date = new Date().toISOString().split("T")[0];
    const filename = `scout-${safeName}-${date}.md`;

    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Determine dynamic placeholder
  const placeholder = stagedFiles.length > 0
    ? stagedFiles.length === 1
      ? "what should i do with this?"
      : "what should i do with these?"
    : "describe what you'd like to change...";

  // Send button visibility: show when text OR files are staged
  const canSend = (input.trim() || stagedFiles.length > 0) && !isStreaming;

  // Desktop detection for drag-drop (hide overlay on touch devices)
  const isDesktop =
    typeof window !== "undefined" &&
    !window.matchMedia("(pointer: coarse)").matches;

  return (
    <TerminalChrome
      title="scout"
      headerActions={
        messages.length > 0 ? (
          <button
            onClick={handleExport}
            className="font-mono text-[10px] text-text-muted/50 hover:text-accent transition-colors cursor-pointer px-1.5 py-0.5"
            title="Export conversation as markdown"
          >
            [export]
          </button>
        ) : undefined
      }
    >
      {/* Fix 9 — ARIA attributes + drag-and-drop zone */}
      <div
        ref={scrollContainerRef}
        role="log"
        aria-live="polite"
        aria-label="Scout conversation"
        className="max-h-[55vh] sm:max-h-[50vh] overflow-y-auto -mx-6 px-6 pb-2 scout-messages relative"
        onDragEnter={canUpload && isDesktop ? handleDragEnter : undefined}
        onDragOver={canUpload && isDesktop ? handleDragOver : undefined}
        onDragLeave={canUpload && isDesktop ? handleDragLeave : undefined}
        onDrop={canUpload && isDesktop ? handleDrop : undefined}
      >
        {/* Drag-and-drop overlay (desktop only) */}
        {dragOver && canUpload && isDesktop && (
          <div className="absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-accent/30 bg-accent/5 rounded-[3px]">
            <span className="font-mono text-[13px] text-accent/70">
              $ drop to attach
            </span>
          </div>
        )}

        {/* Greeting animation */}
        {showGreeting && greetingText && (
          <div className="mb-1">
            <span className="text-text">
              <span className="text-accent/70">scout: </span>
              {greetingText}
              <span className="inline-block w-[6px] h-[14px] bg-accent/60 ml-[2px] align-middle scout-cursor" />
            </span>
          </div>
        )}

        {/* Fix 8 — stable keys */}
        {messages.map((msg, i) => {
          const isLast = i === messages.length - 1;
          const showTime = msg.timestamp && (isLast || messages[i + 1]?.role !== msg.role);
          return (
            <div key={msg.id} className="mb-1">
              {msg.role === "user" ? (
                <div>
                  <span className="text-text-muted">
                    <span className="text-text-muted/70">you: </span>
                    {msg.content}
                  </span>
                  {/* Inline attachments */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="ml-0 mt-0.5">
                      {msg.attachments.map((att, j) => (
                        <MessageAttachmentDisplay
                          key={`${msg.id}-att-${j}`}
                          attachment={att}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <span className={msg.isError ? "text-warning/50" : "text-text"}>
                  <span className="text-accent/70">scout: </span>
                  {msg.isError && <span className="text-warning/60">! </span>}
                  <span className="whitespace-pre-wrap">
                    {cleanContent(msg.content)}
                  </span>
                </span>
              )}
              {showTime && msg.timestamp && (
                <div className="text-[10px] text-text-muted/30 mt-0.5 pl-0">
                  {relativeTime(msg.timestamp)}
                </div>
              )}
            </div>
          );
        })}

        {/* Tool status indicator */}
        {toolStatus && isStreaming && (
          <div className="mb-1">
            <span className="text-text-muted/60 text-[12px]">
              <span className="inline-flex gap-[3px] mr-1.5 align-middle scout-typing-dots">
                <span className="w-[3px] h-[3px] rounded-full bg-accent/40" />
                <span className="w-[3px] h-[3px] rounded-full bg-accent/40" />
                <span className="w-[3px] h-[3px] rounded-full bg-accent/40" />
              </span>
              {toolStatus}...
            </span>
          </div>
        )}

        {/* Typing indicator */}
        {isTyping && !displayedText && !toolStatus && (
          <div className="mb-1">
            <span className="text-accent/70">scout: </span>
            <span className="inline-flex gap-[3px] ml-1 align-middle scout-typing-dots">
              <span className="w-[4px] h-[4px] rounded-full bg-text-muted/60" />
              <span className="w-[4px] h-[4px] rounded-full bg-text-muted/60" />
              <span className="w-[4px] h-[4px] rounded-full bg-text-muted/60" />
            </span>
          </div>
        )}

        {/* Currently streaming message */}
        {displayedText && (
          <div className="mb-1">
            <span className="text-text">
              <span className="text-accent/70">scout: </span>
              <span className="whitespace-pre-wrap">
                {cleanContent(displayedText)}
              </span>
              {isStreaming && (
                <span className="inline-block w-[6px] h-[14px] bg-accent/60 ml-[2px] align-middle scout-cursor" />
              )}
            </span>
          </div>
        )}

        {/* Fix 6 — slow response feedback */}
        {slowResponse && isStreaming && (
          <div className="mb-1">
            <span className="text-text-muted/60 text-[12px]">
              still working on this — hang tight.
            </span>
          </div>
        )}

        {/* Brief submitted indicator */}
        {briefSubmitted && (
          <div className="mb-1 mt-2">
            <span className="text-success/80 text-[12px]">
              brief submitted{briefSummary ? `: ${briefSummary}` : ""}. the team will pick this up shortly.
            </span>
          </div>
        )}

        {/* Narrative revision submitted indicator */}
        {revisionSubmitted && (
          <div className="mb-1 mt-2">
            <span className="text-success/80 text-[12px]">
              revision notes submitted. the team will rework the narrative.
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested prompts — show when no user messages yet */}
      {messages.filter((m) => m.role === "user").length === 0 && !isStreaming && greetingDone && (
        <div className="flex flex-wrap gap-1.5 mt-2 mb-1">
          {(projectStatus === "narrative_review"
            ? NARRATIVE_REVIEW_PROMPTS
            : projectStatus === "review"
              ? REVIEW_PROMPTS
              : DEFAULT_PROMPTS
          ).map(
            (prompt) => (
              <button
                key={prompt}
                onClick={() => handlePromptClick(prompt)}
                className="px-2.5 py-1 rounded-[3px] border border-white/8 text-[11px] text-text-muted/70 hover:border-accent/30 hover:text-accent hover:bg-accent/5 transition-all cursor-pointer"
              >
                {prompt}
              </button>
            )
          )}
        </div>
      )}

      {/* Staged files + upload error */}
      {canUpload && (
        <div className="-mx-6 px-6">
          <StagedFiles files={stagedFiles} onRemove={handleRemoveStagedFile} />
          {uploadError && (
            <p className="text-warning text-[11px] font-mono mb-2" role="alert">
              {uploadError}
            </p>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="pt-3 mt-2 -mx-6 px-6">
        <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-white/[0.06] bg-white/[0.02] transition-colors focus-within:border-accent/20 focus-within:bg-white/[0.03]">
          {/* Attachment button (revision statuses only) */}
          {canUpload && (
            <ChatAttachmentButton
              onFileSelect={handleFileSelect}
              disabled={isStreaming || stagedFiles.reduce((s, f) => s + f.size, 0) >= MAX_STAGED_BYTES}
            />
          )}
          {/* Fix 2 — textarea instead of input */}
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={canUpload ? handlePaste : undefined}
            placeholder={placeholder}
            disabled={isStreaming}
            maxLength={MAX_INPUT_LENGTH}
            className="flex-1 bg-transparent border-0 text-text font-mono text-inherit leading-[1.7] outline-none focus:outline-none focus:ring-0 focus-visible:outline-none placeholder:text-text-muted/30 disabled:opacity-50 disabled:cursor-not-allowed resize-none overflow-hidden"
            autoComplete="off"
          />
          {/* Fix 10 — always rendered, toggled with opacity */}
          <button
            onClick={handleSend}
            className={`text-text-muted/30 hover:text-accent transition-all cursor-pointer shrink-0 ${
              canSend
                ? "opacity-100"
                : "opacity-0 pointer-events-none"
            }`}
            aria-label="Send message"
            tabIndex={canSend ? 0 : -1}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
            >
              <path
                d="M1 7h10M8 4l3 3-3 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        {/* Fix 7 — character limit feedback */}
        {input.length > 1800 && (
          <p
            className={`text-[10px] text-right mt-1 ${
              input.length >= 1950 ? "text-warning" : "text-text-muted/40"
            }`}
          >
            {input.length} / {MAX_INPUT_LENGTH}
          </p>
        )}
      </div>
    </TerminalChrome>
  );
}
