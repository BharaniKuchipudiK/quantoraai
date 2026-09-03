import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { bridge } from "../lib/bridge.ts";
import { filesFromReply, newMessage, streamChatTurn, type ChatMessage } from "../lib/chat-client.ts";

/*
 * Quantora on the folder. Each turn sends the folder's text files as the
 * desk, streams the reply, and writes the files the reply changed back to
 * disk — then says exactly which files it wrote, or which edits did not
 * apply. Nothing is claimed that was not written.
 */

export function ChatPanel({ resetToken, onFilesWritten, onBusy }: {
  resetToken: number;
  onFilesWritten: (paths: string[]) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { setMessages([]); setInput(""); }, [resetToken]);
  useEffect(() => { feedRef.current?.scrollTo(0, feedRef.current.scrollHeight); }, [messages]);
  useEffect(() => { onBusy?.(busy); }, [busy, onBusy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const userMessage = newMessage("user", text);
    const aiMessage = newMessage("ai", "");
    const history = messages;
    setMessages((prev) => [...prev, userMessage, aiMessage]);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const patch = (update: Partial<ChatMessage>) => setMessages((prev) => prev.map((m) => (m.id === aiMessage.id ? { ...m, ...update } : m)));
    try {
      const snapshot = await bridge().files.snapshot();
      const result = await streamChatTurn({
        message: text,
        history,
        vfs: snapshot.vfs,
        signal: controller.signal,
        onDelta: (partial) => patch({ text: partial }),
      });
      const { changed, failures } = filesFromReply(result.text, snapshot.vfs);
      let note = "";
      let written: string[] = [];
      if (changed.length) {
        const sync = await bridge().files.sync(changed);
        if (sync.ok) {
          written = changed.map((c) => c.path);
          note = `Wrote ${written.length} file${written.length === 1 ? "" : "s"}: ${written.join(", ")}`;
          onFilesWritten(written);
        } else {
          note = `Could not write files: ${sync.error}`;
        }
      }
      if (failures.length) note = `${note ? `${note}. ` : ""}Did not apply: ${failures.join("; ")}`;
      if (snapshot.truncated) note = `${note ? `${note}. ` : ""}Only the first ${snapshot.files} text files were sent.`;
      patch({ text: result.text, provider: result.provider, filesChanged: written, note });
    } catch (err: any) {
      const aborted = controller.signal.aborted;
      patch({ text: aborted ? "Stopped." : (err?.message || "Quantora could not answer."), error: !aborted });
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function stop() {
    abortRef.current?.abort("user");
  }

  return (
    <div className="chat" data-qd-chat="true">
      <div className="chat-head"><span>Quantora</span><span className="faint">Auto model</span></div>
      <div ref={feedRef} className="chat-feed" data-qd-chat-feed="true">
        {messages.length === 0 ? (
          <div className="chat-empty">Describe what to build or change. Quantora reads this folder, writes files into it, and tells you exactly which ones.</div>
        ) : messages.map((m) => (
          <div key={m.id} className={`msg ${m.sender}${m.error ? " error" : ""}`} data-qd-message={m.sender} data-qd-message-error={m.error ? "true" : undefined}>
            {m.sender === "user" ? <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div> : (
              m.text ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown> : <span className="faint">Thinking…</span>
            )}
            {m.note ? <div className="meta" data-qd-message-note="true">{m.note}</div> : null}
          </div>
        ))}
      </div>
      <div className="chat-compose">
        <textarea
          data-qd-chat-input="true"
          placeholder="Ask Quantora to build or change something in this folder…"
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <div className="chat-compose-row">
          <span>Enter to send · Shift+Enter for a new line</span>
          {busy ? (
            <button type="button" className="btn btn-sm" data-qd-chat-stop="true" onClick={stop}>Stop</button>
          ) : (
            <button type="button" className="btn btn-sm btn-primary" data-qd-chat-send="true" disabled={!input.trim()} onClick={send}>Send</button>
          )}
        </div>
      </div>
    </div>
  );
}
