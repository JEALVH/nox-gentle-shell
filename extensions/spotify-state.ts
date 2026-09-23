import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type CredentialState = {
  version: 1 | 2;
  client: string;
  status: "connected" | "disconnected";
  generation: string;
  intent?: { generation: string; operation: "login" | "refresh" | "logout" };
};
export interface SpotifyState {
  read(): CredentialState | null;
  reserve(status: CredentialState["status"]): CredentialState;
  reserveIntent?(
    operation: "login" | "refresh" | "logout",
  ): NonNullable<CredentialState["intent"]>;
  commitIntent?(
    expectedGeneration: string,
    status: CredentialState["status"],
  ): boolean;
  isCurrent?(generation: string): boolean;
}
export const clientFingerprint = (client: string) =>
  createHash("sha256").update(client).digest("hex");
const invalid = () =>
  new Error("Spotify credential state unavailable; reconnect required.");

/** Missing/corrupt state fails closed. The caller must hold the credential lease for mutations. */
export function durableSpotifyState(
  clientId: string,
  root = process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"),
): SpotifyState &
  Required<Pick<SpotifyState, "reserveIntent" | "commitIntent" | "isCurrent">> {
  const client = clientFingerprint(clientId);
  const directory = join(root, "nox-spotify-auth");
  const path = join(directory, `credential-state-${client}.json`);
  const owner = process.getuid?.();
  const checkDirectory = (name: string) => {
    const info = lstatSync(name);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      info.uid !== owner ||
      (info.mode & 0o022) !== 0
    )
      throw invalid();
  };
  const prepare = () => {
    checkDirectory(root);
    try {
      mkdirSync(directory, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const info = lstatSync(directory);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      info.uid !== owner ||
      (info.mode & 0o077) !== 0
    )
      throw invalid();
  };
  const read = (): CredentialState | null => {
    try {
      prepare();
      const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const info = fstatSync(fd);
        const name = lstatSync(path);
        if (
          !info.isFile() ||
          info.nlink !== 1 ||
          info.uid !== owner ||
          (info.mode & 0o177) !== 0 ||
          info.ino !== name.ino ||
          info.dev !== name.dev
        )
          throw invalid();
        const value: unknown = JSON.parse(readFileSync(fd, "utf8"));
        if (!value || typeof value !== "object") throw invalid();
        const state = value as CredentialState;
        if (
          state.version !== 2 ||
          state.client !== client ||
          !["connected", "disconnected"].includes(state.status) ||
          !/^[a-f0-9]{64}$/.test(state.generation) ||
          Object.keys(state).length !== 5 ||
          !state.intent ||
          typeof state.intent !== "object" ||
          Object.keys(state.intent).length !== 2 ||
          !/^[a-f0-9]{64}$/.test(state.intent.generation) ||
          !["login", "refresh", "logout"].includes(state.intent.operation)
        )
          throw invalid();
        return state;
      } finally {
        closeSync(fd);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw invalid();
    }
  };
  const persist = (state: CredentialState) => {
    try {
      prepare();
      // Refuse to overwrite malformed or mismatched state.
      read();
      const temporary = join(
        directory,
        `.credential-${randomBytes(16).toString("hex")}`,
      );
      const fd = openSync(
        temporary,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
      try {
        writeSync(fd, JSON.stringify(state));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, path);
      const parent = openSync(
        directory,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      try {
        fsyncSync(parent);
      } finally {
        closeSync(parent);
      }
      return state;
    } catch {
      throw invalid();
    }
  };
  return {
    read,
    reserve(status) {
      const generation = randomBytes(32).toString("hex");
      return persist({
        version: 2,
        client,
        status,
        generation,
        intent: {
          generation,
          operation: status === "connected" ? "login" : "logout",
        },
      });
    },
    reserveIntent(operation) {
      if (!["login", "refresh", "logout"].includes(operation)) throw invalid();
      const previous = read();
      const intent = { generation: randomBytes(32).toString("hex"), operation };
      persist(
        previous
          ? { ...previous, intent }
          : {
              version: 2,
              client,
              status: "disconnected",
              generation: randomBytes(32).toString("hex"),
              intent,
            },
      );
      return intent;
    },
    commitIntent(expectedGeneration, status) {
      if (
        !["connected", "disconnected"].includes(status) ||
        !/^[a-f0-9]{64}$/.test(expectedGeneration)
      )
        throw invalid();
      const previous = read();
      if (
        !previous?.intent ||
        previous.intent.generation !== expectedGeneration
      )
        return false;
      persist({ ...previous, generation: expectedGeneration, status });
      return true;
    },
    isCurrent(generation) {
      const state = read();
      return (
        !!state &&
        state.status === "connected" &&
        state.generation === generation &&
        state.intent?.generation === generation &&
        state.intent.operation !== "logout"
      );
    },
  };
}
