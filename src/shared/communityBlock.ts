/**
 * A `claude-community` fenced block in a markdown document. brpt joins the community as the
 * block's `name` and shows the conversation between that handle and `handle`:
 *
 *     ```claude-community
 *     name: finding-3
 *     community: pr-1719
 *     handle: reviewer-03
 *     ```
 */

export const COMMUNITY_BLOCK_LANG = "claude-community";

const HANDLE = /^[a-z0-9][a-z0-9-]*$/;
const HANDLE_MAX = 32;
const COMMUNITY_MAX = 64;
const RESERVED_HANDLES = new Set(["all", "user"]);
const FIELDS = ["name", "community", "handle"] as const;

export interface CommunityBlockSpec {
  /** The block's name, which is also its handle in the community. */
  name: string;
  /** A community name, or the path of a community's socket. */
  community: string;
  /** The member the block messages. */
  handle: string;
}

export type ParsedCommunityBlock =
  | { ok: true; spec: CommunityBlockSpec }
  | { ok: false; error: string };

export type CommunityBlockStatus =
  | "not-installed"
  | "connecting"
  | "hosting"
  | "joined"
  | "ended"
  | "dropped"
  | "failed";

export interface CommunityMessage {
  from: string;
  to: "all" | string[];
  body: string;
  ts: string;
}

export interface CommunityBlockSnapshot {
  path: string;
  name: string;
  handle: string;
  status: CommunityBlockStatus;
  /** The CLI path for `not-installed`, and what went wrong for `failed`. */
  detail?: string;
  /** Messages between the block and `handle`, oldest first. */
  messages: CommunityMessage[];
}

/** True when a fenced block's info string marks it as a `claude-community` block. */
export function isCommunityBlockLang(lang: string | undefined): boolean {
  return (lang ?? "").trim().split(/\s+/)[0] === COMMUNITY_BLOCK_LANG;
}

function handleError(field: string, value: string): string | null {
  if (value.length > HANDLE_MAX || !HANDLE.test(value)) {
    return `\`${field}\` must be lowercase letters, digits and "-", start with a letter or digit, and be at most ${HANDLE_MAX} characters.`;
  }
  if (RESERVED_HANDLES.has(value)) {
    return `\`${field}\` can't be "all" or "user".`;
  }
  return null;
}

function communityError(value: string): string | null {
  if (value.includes("/")) {
    return null;
  }
  if (value.length > COMMUNITY_MAX || !HANDLE.test(value)) {
    return `\`community\` must be a socket path, or lowercase letters, digits and "-", starting with a letter or digit, at most ${COMMUNITY_MAX} characters.`;
  }
  return null;
}

/** Parses the body of a `claude-community` block: one `key: value` line for each of `name`, `community` and `handle`. */
export function parseCommunityBlock(text: string): ParsedCommunityBlock {
  const fields = new Map<string, string>();
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "") {
      continue;
    }
    const colon = line.indexOf(":");
    if (colon === -1) {
      return { ok: false, error: `Expected a \`key: value\` line, got \`${line}\`.` };
    }
    const key = line.slice(0, colon).trim();
    if (!(FIELDS as readonly string[]).includes(key)) {
      return { ok: false, error: `Unknown field \`${key}\`. The fields are \`name\`, \`community\` and \`handle\`.` };
    }
    fields.set(key, line.slice(colon + 1).trim());
  }

  const missing = FIELDS.filter((field) => !fields.get(field));
  if (missing.length > 0) {
    return { ok: false, error: `Missing ${missing.map((field) => `\`${field}\``).join(", ")}.` };
  }

  const spec: CommunityBlockSpec = {
    name: fields.get("name")!,
    community: fields.get("community")!,
    handle: fields.get("handle")!,
  };
  const error = handleError("name", spec.name) ?? handleError("handle", spec.handle) ?? communityError(spec.community);
  if (error) {
    return { ok: false, error };
  }
  if (spec.name === spec.handle) {
    return { ok: false, error: "`name` and `handle` must be different members." };
  }
  return { ok: true, spec };
}

/** True when `message` is part of the conversation between the block `name` and `handle`. */
export function isBlockConversation(message: CommunityMessage, name: string, handle: string): boolean {
  if (message.to === "all") {
    return false;
  }
  return (message.from === name && message.to.includes(handle)) ||
    (message.from === handle && message.to.includes(name));
}

const PREAMBLE_TAG = /^\[brpt [^\]\n]*\]$/;
const PREAMBLE_SENTENCE = "Sent by a person from block ";

/**
 * The body brpt posts for text typed into a block: a tag naming the block, the document and the
 * block's line, then a sentence telling the agent what the message is and where to reply.
 */
export function composeBlockMessage(name: string, path: string, line: number, text: string): string {
  return [
    `[brpt ${name} · ${path}:${line}]`,
    `${PREAMBLE_SENTENCE}\`${name}\` in that document, at that line. Reply to \`${name}\` in this channel.`,
    "",
    text,
  ].join("\n");
}

/** The text a person typed, without the lines `composeBlockMessage` adds. Other bodies are returned unchanged. */
export function stripBlockPreamble(body: string): string {
  const lines = body.split("\n");
  if (lines.length >= 3 && PREAMBLE_TAG.test(lines[0]) && lines[1].startsWith(PREAMBLE_SENTENCE) && lines[2] === "") {
    return lines.slice(3).join("\n");
  }
  return body;
}
