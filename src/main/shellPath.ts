import { execFile } from "child_process";

const MARKER = "__BRPT_SHELL_PATH__";
const LOOKUP_TIMEOUT_MS = 5000;

let lookup: Promise<string | undefined> | null = null;

/**
 * Runs the user's login shell to read its PATH. On macOS, an app started from Finder or with
 * `open` gets launchd's minimal PATH, which doesn't include where tools like node are installed.
 * Only PATH is read; the rest of the shell's environment is ignored. Falls back to brpt's own
 * PATH when the shell fails or takes longer than LOOKUP_TIMEOUT_MS.
 */
function lookUpShellPath(): Promise<string | undefined> {
  const fallback = process.env.PATH;
  if (process.platform === "win32") {
    return Promise.resolve(fallback);
  }
  const shell = process.env.SHELL || "/bin/zsh";
  // Interactive login shells can print other output from their startup files, so the PATH is
  // read from between the markers. The braces matter: `$PATH__BRPT...` would name another variable.
  const command = `printf '%s' "${MARKER}\${PATH}${MARKER}"`;
  return new Promise((resolvePath) => {
    execFile(shell, ["-ilc", command], { timeout: LOOKUP_TIMEOUT_MS, encoding: "utf8" }, (_error, stdout) => {
      const match = stdout?.match(new RegExp(`${MARKER}(.*?)${MARKER}`, "s"));
      resolvePath(match?.[1] || fallback);
    });
  });
}

/** Starts reading the login shell's PATH without waiting for it. */
export function startShellPathLookup(): void {
  lookup ??= lookUpShellPath();
}

/** The login shell's PATH, from the lookup `startShellPathLookup` started, or a new one. */
export function shellPath(): Promise<string | undefined> {
  startShellPathLookup();
  return lookup!;
}
