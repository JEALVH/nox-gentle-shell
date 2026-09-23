import { spawn } from "node:child_process";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

/** A lease encloses the complete credential read / network exchange / mutation. */
export interface CredentialLease {
  run<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T>;
}

export class CredentialLeaseLost extends Error {
  constructor() {
    super(
      "Spotify credential coordination ended unexpectedly; credential state may be uncertain.",
    );
  }
}
export class CredentialLockUnavailable extends Error {
  constructor() {
    super(
      "Spotify credential coordination unavailable; credentials were not persisted.",
    );
  }
}
const failure = () => new CredentialLockUnavailable();

function lockDescriptor(
  kind: "credential" | "intent",
  clientId?: string,
): number {
  if (process.platform !== "linux" || !process.env.XDG_RUNTIME_DIR)
    throw failure();
  const parent = process.env.XDG_RUNTIME_DIR;
  const owner = process.getuid?.();
  const validDirectory = (path: string, mode: number) => {
    const info = lstatSync(path);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      info.uid !== owner ||
      (info.mode & mode) !== 0
    )
      throw failure();
  };
  validDirectory(parent, 0o022);
  const directory = join(parent, "nox-spotify-auth");
  try {
    mkdirSync(directory, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw failure();
  }
  validDirectory(directory, 0o077);
  const path = join(
    directory,
    kind === "credential"
      ? "credential.lock"
      : `intent-${createHash("sha256").update(clientId!).digest("hex")}.lock`,
  );
  const fd = openSync(
    path,
    constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    const info = fstatSync(fd);
    const name = lstatSync(path);
    if (
      !info.isFile() ||
      info.nlink !== 1 ||
      info.uid !== owner ||
      (info.mode & 0o177) !== 0 ||
      info.dev !== name.dev ||
      info.ino !== name.ino ||
      statSync(directory).ino !== lstatSync(directory).ino
    )
      throw failure();
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

export function linuxCredentialLease(
  timeoutMs = 5000,
  intentClientId?: string,
): CredentialLease {
  if (intentClientId !== undefined && !intentClientId) throw failure();
  return {
    async run<T>(
      operation: (signal: AbortSignal) => Promise<T>,
      signal?: AbortSignal,
    ): Promise<T> {
      if (signal?.aborted) throw failure();
      let fd: number;
      try {
        fd = lockDescriptor(
          intentClientId === undefined ? "credential" : "intent",
          intentClientId,
        );
      } catch {
        throw failure();
      }
      let child: ReturnType<typeof spawn>;
      try {
        // Descriptor mode locks the inherited open-file description, not cwd/"3".
        child = spawn(
          "flock",
          ["-x", "-w", String(Math.max(1, Math.ceil(timeoutMs / 1000))), "3"],
          {
            stdio: ["ignore", "ignore", "ignore", fd],
          },
        );
      } catch {
        closeSync(fd);
        throw failure();
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      let closed = false;
      child.once("close", () => {
        closed = true;
      });
      const abort = () => child.kill();
      signal?.addEventListener("abort", abort, { once: true });
      try {
        const code = await new Promise<number | null>((resolve, reject) => {
          child.once("error", reject);
          child.once("close", resolve);
          timer = setTimeout(() => {
            child.kill();
            reject(failure());
          }, timeoutMs);
          if (signal?.aborted) {
            child.kill();
            reject(failure());
          }
        });
        if (code !== 0 || signal?.aborted) throw failure();
        const result = await operation(signal ?? new AbortController().signal);
        if (signal?.aborted) throw new CredentialLeaseLost();
        return result;
      } finally {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        if (!closed) {
          const finished = new Promise<void>((resolve) =>
            child.once("close", () => resolve()),
          );
          child.kill();
          await finished;
        }
        closeSync(fd);
      }
    },
  };
}
