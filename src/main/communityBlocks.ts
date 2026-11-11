import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from "child_process";
import fs from "fs";
import { marked, type Tokens } from "marked";
import os from "os";
import { join } from "path";
import { createInterface } from "readline";
import {
  composeBlockMessage,
  isBlockConversation,
  isCommunityBlockLang,
  parseCommunityBlock,
  type CommunityBlockSnapshot,
  type CommunityBlockSpec,
  type CommunityBlockStatus,
  type CommunityMessage,
} from "../shared/communityBlock";

/** Where the community skill installs its CLI. Used when the config doesn't name one. */
export const DEFAULT_CLAUDE_COMMUNITY_PATH = join(os.homedir(), ".claude", "skills", "community", "bin", "claude-community");

const APP_NAME = "brpt";
const ROLE_MAX = 500;
const SNAPSHOT_DELAY_MS = 30;
const STDERR_LINES_KEPT = 20;

interface Block extends CommunityBlockSpec {
  path: string;
  status: CommunityBlockStatus;
  detail?: string;
  /** Every `msg` the `app` process has printed, including history. */
  messages: CommunityMessage[];
  child: ChildProcessWithoutNullStreams | null;
  /** When the current `app` process started, as an ISO string. Messages stamped earlier are history. */
  startedAt: string;
  /** Set once brpt has tried hosting the community for this block, so a failed host isn't retried in a loop. */
  hostAttempted: boolean;
  removed: boolean;
  snapshotTimer: ReturnType<typeof setTimeout> | null;
}

interface Host {
  /** Null until the PATH lookup finishes and `create` is spawned. */
  child: ChildProcess | null;
  ready: Promise<void>;
}

export interface CommunityBlocksOptions {
  /** The path of the claude-community CLI. */
  cliPath: () => string;
  /** The PATH to run the CLI with. Its launcher runs `node`, which brpt's own PATH may not include. */
  cliSearchPath: () => Promise<string | undefined>;
  /** Sends a block's state to the renderer. */
  onSnapshot: (snapshot: CommunityBlockSnapshot) => void;
  /** Called when a block's member replies while the block is joined. */
  onReply: (path: string) => void;
}

export interface CommunityBlocks {
  /** Starts, updates and stops the blocks of a markdown file to match its content. */
  syncFile(path: string, content: string): void;
  /** Stops every block of a file. */
  closeFile(path: string): void;
  snapshots(path: string): CommunityBlockSnapshot[];
  /** Posts `text` from a block to its member. Returns an error message, or null when it was sent. */
  send(path: string, name: string, line: number, text: string): string | null;
  /** Starts the blocks that couldn't find the CLI, after its path changed. */
  retryNotInstalled(): void;
  /** Stops every block and every community brpt hosts. */
  stopAll(): void;
}

/** The valid `claude-community` blocks in a markdown document. When two blocks share a name, the first one is kept. */
function findBlockSpecs(content: string): CommunityBlockSpec[] {
  const specs: CommunityBlockSpec[] = [];
  const names = new Set<string>();
  marked.walkTokens(marked.lexer(content), (token) => {
    if (token.type !== "code" || !isCommunityBlockLang((token as Tokens.Code).lang)) {
      return;
    }
    const parsed = parseCommunityBlock((token as Tokens.Code).text);
    if (!parsed.ok || names.has(parsed.spec.name)) {
      return;
    }
    names.add(parsed.spec.name);
    specs.push(parsed.spec);
  });
  return specs;
}

function isExecutable(path: string): boolean {
  try {
    fs.accessSync(path, fs.constants.X_OK);
    return fs.statSync(path).isFile();
  } catch {
    return false;
  }
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(line);
    return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function toCommunityMessage(raw: Record<string, unknown>): CommunityMessage | null {
  const { from, to, body, ts } = raw;
  if (typeof from !== "string" || typeof body !== "string" || typeof ts !== "string") {
    return null;
  }
  if (to !== "all" && !(Array.isArray(to) && to.every((r) => typeof r === "string"))) {
    return null;
  }
  return { from, to, body, ts };
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function blockKey(path: string, name: string): string {
  return `${path}\n${name}`;
}

function cliEnv(searchPath: string | undefined): NodeJS.ProcessEnv {
  return searchPath ? { ...process.env, PATH: searchPath } : process.env;
}

export function createCommunityBlocks(options: CommunityBlocksOptions): CommunityBlocks {
  const blocks = new Map<string, Block>();
  const hosts = new Map<string, Host>();
  /** Set by `stopAll`, so a host whose spawn was waiting on the PATH lookup isn't started. */
  let stopped = false;

  function snapshotOf(block: Block): CommunityBlockSnapshot {
    return {
      path: block.path,
      name: block.name,
      handle: block.handle,
      status: block.status,
      detail: block.detail,
      messages: block.messages.filter((m) => isBlockConversation(m, block.name, block.handle)),
    };
  }

  function scheduleSnapshot(block: Block): void {
    if (block.snapshotTimer || block.removed) {
      return;
    }
    block.snapshotTimer = setTimeout(() => {
      block.snapshotTimer = null;
      if (!block.removed) {
        options.onSnapshot(snapshotOf(block));
      }
    }, SNAPSHOT_DELAY_MS);
  }

  function setStatus(block: Block, status: CommunityBlockStatus, detail?: string): void {
    block.status = status;
    block.detail = detail;
    scheduleSnapshot(block);
  }

  function blocksOf(path: string): Block[] {
    return [...blocks.values()].filter((b) => b.path === path);
  }

  /** Hosts `community` as a socket community, once. Resolves when it has started. */
  function host(community: string): Promise<void> {
    const existing = hosts.get(community);
    if (existing) {
      return existing.ready;
    }
    const entry: Host = { child: null, ready: Promise.resolve() };
    entry.ready = options.cliSearchPath().then((searchPath) => {
      if (stopped) {
        throw new Error("brpt is quitting.");
      }
      const child = spawn(
        options.cliPath(),
        ["create", community, "--type-local-socket", "--agent-hosted"],
        { cwd: os.homedir(), stdio: ["ignore", "pipe", "pipe"], env: cliEnv(searchPath) },
      );
      entry.child = child;
      const stderr: string[] = [];
      return new Promise<void>((resolvePromise, reject) => {
        createInterface({ input: child.stdout! }).on("line", (line) => {
          const message = parseJsonLine(line);
          if (message?.type === "system" && message.event === "started") {
            resolvePromise();
          }
        });
        createInterface({ input: child.stderr! }).on("line", (line) => stderr.push(line));
        child.on("error", reject);
        child.on("close", (code) => {
          if (hosts.get(community) === entry) {
            hosts.delete(community);
          }
          reject(new Error(stderr.join("\n") || `claude-community create exited with code ${code}`));
        });
      });
    });
    hosts.set(community, entry);
    return entry.ready;
  }

  function handleLine(block: Block, child: ChildProcessWithoutNullStreams, line: string): void {
    if (block.child !== child) {
      return;
    }
    const raw = parseJsonLine(line);
    if (!raw) {
      return;
    }
    if (block.status === "connecting") {
      setStatus(block, "joined");
    }
    if (raw.type === "system" && raw.event === "ended") {
      setStatus(block, "ended");
      return;
    }
    if (raw.type !== "msg") {
      return;
    }
    const message = toCommunityMessage(raw);
    if (!message) {
      return;
    }
    block.messages.push(message);
    if (!isBlockConversation(message, block.name, block.handle)) {
      return;
    }
    scheduleSnapshot(block);
    if (message.from === block.handle && message.ts >= block.startedAt) {
      options.onReply(block.path);
    }
  }

  function handleExit(block: Block, child: ChildProcessWithoutNullStreams, code: number | null, stderr: string[]): void {
    if (block.child !== child) {
      return;
    }
    block.child = null;
    if (block.removed) {
      return;
    }
    if (code === 0) {
      if (block.status !== "ended") {
        setStatus(block, "ended");
      }
      return;
    }

    const text = stderr.join("\n");
    if (text.includes("no such community") && !block.community.includes("/") && !block.hostAttempted) {
      block.hostAttempted = true;
      setStatus(block, "hosting");
      host(block.community).then(
        () => {
          if (!block.removed && block.child === null && block.status === "hosting") {
            start(block);
          }
        },
        (err: unknown) => {
          if (!block.removed) {
            setStatus(block, "failed", errorText(err));
          }
        },
      );
      return;
    }
    if (text.includes("connection dropped")) {
      setStatus(block, "dropped");
      return;
    }
    setStatus(block, "failed", text || `claude-community exited with code ${code}`);
  }

  function start(block: Block): void {
    const cli = options.cliPath();
    if (!isExecutable(cli)) {
      setStatus(block, "not-installed", cli);
      return;
    }
    block.messages = [];
    setStatus(block, "connecting");
    void options.cliSearchPath().then((searchPath) => {
      if (!block.removed && block.child === null && block.status === "connecting") {
        spawnApp(block, cli, searchPath);
      }
    });
  }

  function spawnApp(block: Block, cli: string, searchPath: string | undefined): void {
    block.startedAt = new Date().toISOString();
    const role = `Conversation block in ${block.path}`.slice(0, ROLE_MAX);
    const child = spawn(
      cli,
      ["app", block.community, block.name, "--app", APP_NAME, "--role", role, "--history"],
      { cwd: os.homedir(), env: cliEnv(searchPath) },
    );
    block.child = child;
    const stderr: string[] = [];

    child.stdin.on("error", () => {
      // Writes after the process exits fail with EPIPE; its exit is reported through "close".
    });
    createInterface({ input: child.stdout }).on("line", (line) => handleLine(block, child, line));
    createInterface({ input: child.stderr }).on("line", (line) => {
      stderr.push(line);
      if (stderr.length > STDERR_LINES_KEPT) {
        stderr.shift();
      }
    });
    child.on("error", (err) => {
      if (block.child !== child) {
        return;
      }
      block.child = null;
      if (!block.removed) {
        setStatus(block, "failed", errorText(err));
      }
    });
    child.on("close", (code) => handleExit(block, child, code, stderr));
  }

  function remove(block: Block): void {
    block.removed = true;
    blocks.delete(blockKey(block.path, block.name));
    if (block.snapshotTimer) {
      clearTimeout(block.snapshotTimer);
      block.snapshotTimer = null;
    }
    // Closing stdin makes `app` post `leave` for its session and exit.
    block.child?.stdin.end();
  }

  return {
    syncFile(path, content) {
      const specs = findBlockSpecs(content);
      const wanted = new Map(specs.map((spec) => [spec.name, spec]));

      for (const block of blocksOf(path)) {
        const spec = wanted.get(block.name);
        if (!spec || spec.community !== block.community) {
          remove(block);
          continue;
        }
        if (spec.handle !== block.handle) {
          block.handle = spec.handle;
          scheduleSnapshot(block);
        }
      }

      for (const spec of specs) {
        const key = blockKey(path, spec.name);
        if (blocks.has(key)) {
          continue;
        }
        const block: Block = {
          ...spec,
          path,
          status: "connecting",
          messages: [],
          child: null,
          startedAt: "",
          hostAttempted: false,
          removed: false,
          snapshotTimer: null,
        };
        blocks.set(key, block);
        start(block);
      }
    },

    closeFile(path) {
      for (const block of blocksOf(path)) {
        remove(block);
      }
    },

    snapshots(path) {
      return blocksOf(path).map(snapshotOf);
    },

    send(path, name, line, text) {
      const block = blocks.get(blockKey(path, name));
      if (!block || !block.child || block.status !== "joined") {
        return "This block isn't connected to its community.";
      }
      const body = composeBlockMessage(block.name, block.path, line, text);
      block.child.stdin.write(`${JSON.stringify({ to: [block.handle], body })}\n`);
      return null;
    },

    retryNotInstalled() {
      for (const block of blocks.values()) {
        if (block.status === "not-installed") {
          start(block);
        }
      }
    },

    stopAll() {
      stopped = true;
      for (const block of [...blocks.values()]) {
        remove(block);
      }
      // SIGTERM makes `create` post `ended` and stop the community.
      for (const { child } of hosts.values()) {
        child?.kill("SIGTERM");
      }
      hosts.clear();
    },
  };
}
