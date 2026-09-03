import { assembleStudioPreview } from "@web/lib/studio-preview-helpers.js";
import type { VfsFile } from "./bridge.ts";

/*
 * The desktop's chat client for /api/chat (proxied by the host, bearer
 * attached there). Same wire format the website speaks — `data:` lines of
 * {text, provider, latencyMs, error} — and the same reply parser
 * (assembleStudioPreview) that turns the model's FILES blocks and patches
 * into a set of files. The desk's files ARE the open folder.
 */

export type ChatMessage = {
  id: string;
  sender: "user" | "ai";
  text: string;
  error?: boolean;
  provider?: string;
  filesChanged?: string[];
  note?: string;
};

export type TurnResult = { text: string; provider: string };

function messageId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newMessage(sender: ChatMessage["sender"], text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: messageId(sender), sender, text, ...extra };
}

export async function streamChatTurn(input: {
  message: string;
  history: ChatMessage[];
  vfs: Record<string, VfsFile>;
  signal: AbortSignal;
  onDelta: (text: string) => void;
}): Promise<TurnResult> {
  const fileCount = Object.keys(input.vfs).length;
  const body = {
    message: input.message,
    history: input.history.filter((m) => !m.error && m.text).map((m) => ({ sender: m.sender, text: m.text })),
    modelId: "auto",
    modelName: "Auto",
    taskCategory: "coding",
    buildMode: true,
    hasVFS: fileCount > 0,
    vfs: input.vfs,
    isWorkspaceMode: true,
    webSearch: false,
    qualityHints: { fileCount, repair: false },
    desktop: true,
  };

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: input.signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error || `Quantora answered ${response.status}.`);
  }
  if (!response.body) throw new Error("Quantora sent an empty reply.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let provider = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6);
      if (payload === "[DONE]") continue;
      let parsed: any;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      if (parsed?.error?.message) throw new Error(parsed.error.message);
      if (typeof parsed?.text === "string") {
        text += parsed.text;
        input.onDelta(text);
      }
      if (typeof parsed?.provider === "string") provider = parsed.provider;
    }
  }
  return { text, provider };
}

export type ReplyFiles = { changed: Array<{ path: string; content: string }>; failures: string[] };

/** Files the reply creates or edits, relative to the current folder snapshot. */
export function filesFromReply(replyText: string, current: Record<string, VfsFile>): ReplyFiles {
  const assembled = assembleStudioPreview(replyText, current) as {
    vfs: Record<string, { content?: string }>;
    patchFailures?: Array<{ path?: string; reason?: string } | string>;
  };
  const changed: Array<{ path: string; content: string }> = [];
  for (const [path, file] of Object.entries(assembled.vfs || {})) {
    if (!file || typeof file.content !== "string") continue;
    if (current[path]?.content === file.content) continue;
    changed.push({ path, content: file.content });
  }
  const failures = (assembled.patchFailures || []).map((failure) =>
    typeof failure === "string" ? failure : `${failure.path || "a file"}: ${failure.reason || "patch did not apply"}`,
  );
  return { changed, failures };
}
