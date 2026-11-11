import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import {
  stripBlockPreamble,
  type CommunityBlockSnapshot,
  type CommunityBlockSpec,
  type CommunityMessage,
} from "../../../shared/communityBlock";
import { classNames } from "../classNames";
import { renderMermaidBlocks, useActivePalette } from "../mermaidBlocks";
import type { Palette } from "../themes";

const { mdview } = window;

/** Block states sent by the main process, by document path and block name. */
const snapshots = new Map<string, CommunityBlockSnapshot>();
const listeners = new Set<() => void>();

/** Unsent text, by document path and block name, so a draft survives the document re-rendering. */
const drafts = new Map<string, string>();

function blockKey(path: string, name: string): string {
  return `${path}\n${name}`;
}

function storeSnapshot(snapshot: CommunityBlockSnapshot): void {
  snapshots.set(blockKey(snapshot.path, snapshot.name), snapshot);
  for (const listener of listeners) {
    listener();
  }
}

mdview.onCommunityBlockUpdated(storeSnapshot);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Fetches the state of a document's blocks, which the main process started before the document was shown. */
export function loadCommunityBlocks(path: string): void {
  mdview.getCommunityBlocks(path).then((list) => {
    for (const snapshot of list) {
      storeSnapshot(snapshot);
    }
  });
}

export interface CommunityBlockHost {
  key: string;
  element: HTMLElement;
  /** The block's opening fence line. */
  line: number;
  spec: CommunityBlockSpec | null;
  error: string | null;
}

/**
 * The `claude-community` placeholders in rendered markdown. A block with the same name as an
 * earlier one gets an error, because the main process only joins the first.
 */
export function findCommunityBlockHosts(root: HTMLElement): CommunityBlockHost[] {
  const names = new Set<string>();
  return Array.from(root.querySelectorAll<HTMLElement>(".community-block")).map((element, index) => {
    const line = Number(element.dataset.sourceLine ?? 0);
    const { name, community, handle, error } = element.dataset;
    if (error || !name || !community || !handle) {
      return { key: `invalid-${index}`, element, line, spec: null, error: error ?? "This block couldn't be read." };
    }
    if (names.has(name)) {
      // Sized like an invalid block before it mounts, so the gutter measures the right height.
      element.classList.add("community-block--invalid");
      return { key: `duplicate-${index}`, element, line, spec: null, error: `An earlier block in this document is named \`${name}\`.` };
    }
    names.add(name);
    return { key: name, element, line, spec: { name, community, handle }, error: null };
  });
}

function statusMarkdown(snapshot: CommunityBlockSnapshot | undefined, community: string): string | null {
  if (!snapshot) {
    return "Connecting…";
  }
  switch (snapshot.status) {
    case "not-installed":
      return `claude-community isn't installed at \`${snapshot.detail}\`. Set its path with \`brpt set-ccc-path <path>\`.`;
    case "connecting":
      return "Connecting…";
    case "hosting":
      return `Starting the community \`${community}\`…`;
    case "joined":
      return null;
    case "ended":
      return "The community has ended.";
    case "dropped":
      return "The connection to the community dropped.";
    case "failed":
      return `claude-community failed:\n\n\`\`\`\n${snapshot.detail ?? ""}\n\`\`\``;
  }
}

function formatTime(ts: string): string {
  try {
    return Temporal.Instant.from(ts)
      .toZonedDateTimeISO(Temporal.Now.timeZoneId())
      .toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

interface MarkdownProps {
  text: string;
  palette: Palette;
  className?: string;
}

/** Message markdown, with HTML cards and mermaid diagrams as in documents. */
function Markdown({ text, palette, className }: MarkdownProps): ReactNode {
  const html = useMemo(() => mdview.renderMessageMarkdown(text), [text]);
  const ref = useRef<HTMLDivElement>(null);

  // Set innerHTML through the ref so React never resets it and removes the drawn diagrams.
  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = html;
    }
  }, [html]);

  useEffect(() => {
    if (!ref.current) {
      return;
    }
    return renderMermaidBlocks(Array.from(ref.current.querySelectorAll<HTMLElement>(".mermaid-block")), palette);
  }, [html, palette]);

  return <div ref={ref} className={classNames("markdown-body", className)} />;
}

interface MessageItemProps {
  message: CommunityMessage;
  name: string;
  palette: Palette;
}

function MessageItem({ message, name, palette }: MessageItemProps): ReactNode {
  const own = message.from === name;
  return (
    <div className={classNames("community-message", own && "community-message--own")}>
      <div className="community-message-meta">
        <span className="community-message-from">{message.from}</span>
        <span className="community-message-time">{formatTime(message.ts)}</span>
      </div>
      <Markdown
        className="community-message-body"
        text={own ? stripBlockPreamble(message.body) : message.body}
        palette={palette}
      />
    </div>
  );
}

interface CommunityBlockProps {
  path: string;
  line: number;
  spec: CommunityBlockSpec | null;
  error: string | null;
}

/** The conversation between a block's `name` and its `handle`, with an input for messaging `handle`. */
export function CommunityBlock({ path, line, spec, error }: CommunityBlockProps): ReactNode {
  if (!spec) {
    return (
      <div className="community-block-card community-block-card--invalid">
        <div className="community-block-header">
          <span>claude-community</span>
          <span className="community-block-header-sep">·</span>
          <span className="community-block-invalid">invalid</span>
          <span className="community-block-header-sep">·</span>
          <span>{withInlineCode(error ?? "This block couldn't be read.")}</span>
        </div>
      </div>
    );
  }
  return <Conversation path={path} line={line} spec={spec} />;
}

/** Renders `text` with its backtick spans as `<code>`. */
function withInlineCode(text: string): ReactNode[] {
  return text.split("`").map((part, index) => (index % 2 === 1 ? <code key={index}>{part}</code> : part));
}

function Conversation({ path, line, spec }: { path: string; line: number; spec: CommunityBlockSpec }): ReactNode {
  const key = blockKey(path, spec.name);
  const snapshot = useSyncExternalStore(subscribe, () => snapshots.get(key));
  const messages = snapshot?.messages ?? [];
  const status = statusMarkdown(snapshot, spec.community);
  const joined = snapshot?.status === "joined";
  const palette = useActivePalette();

  const [draft, setDraftState] = useState(() => drafts.get(key) ?? "");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  function setDraft(text: string): void {
    drafts.set(key, text);
    setDraftState(text);
  }

  const logRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log) {
      log.scrollTop = log.scrollHeight;
    }
  }, [messages.length, status, sendError]);

  async function send(): Promise<void> {
    const text = draft.trim();
    if (!text || sending || !joined) {
      return;
    }
    setSending(true);
    const result = await mdview.sendCommunityMessage(path, spec.name, line, text);
    setSending(false);
    setSendError(result);
    if (!result) {
      setDraft("");
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    // brpt's shortcuts (Cmd-W, Cmd-B, Cmd-1…) listen on the document; typing a message shouldn't trigger them.
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="community-block-card">
      <div className="community-block-header">
        <span>{spec.community}</span>
        <span className="community-block-header-sep">·</span>
        <span className="community-block-header-name">{spec.name}</span>
        <span className="community-block-header-sep">→</span>
        <span className="community-block-header-name">{spec.handle}</span>
      </div>
      <div className="community-block-log" ref={logRef}>
        {messages.length === 0 && joined && (
          <div className="community-block-empty">No messages with {spec.handle} yet.</div>
        )}
        {messages.map((message, index) => (
          <MessageItem key={`${message.ts}-${index}`} message={message} name={spec.name} palette={palette} />
        ))}
        {status && <Markdown className="community-block-status" text={status} palette={palette} />}
        {sendError && <div className="community-block-send-error">{sendError}</div>}
      </div>
      <div className="community-block-input">
        <textarea
          rows={2}
          value={draft}
          disabled={!joined}
          placeholder={joined ? `Message ${spec.handle} (Enter to send, Shift-Enter for a new line)` : ""}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" disabled={!joined || sending || draft.trim() === ""} onClick={() => void send()}>
          Send
        </button>
      </div>
    </div>
  );
}
