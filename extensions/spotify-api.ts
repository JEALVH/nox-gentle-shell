import type { SpotifyAuth } from "./spotify-auth.js";

export interface Playback {
  is_playing: boolean;
  progress_ms: number | null;
  item: {
    name: string;
    duration_ms: number;
    external_urls?: { spotify?: string };
    artists?: Array<{ name: string }>;
  } | null;
  device?: { name: string; is_active: boolean };
  currently_playing_type?: string;
}

export class SpotifySessionUnavailable extends Error {
  constructor() {
    super(
      "No usable Spotify session; reconnect with /nox-spotify connect or unlock your keyring",
    );
    this.name = "SpotifySessionUnavailable";
  }
}

export class SpotifyApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly retryAfterMs?: number,
  ) {
    super(
      status === 401
        ? "Spotify authorization expired or revoked"
        : status === 403
          ? "Spotify playback is forbidden or restricted"
          : status === 429
            ? "Spotify rate limit reached"
            : `Spotify request failed (${status})`,
    );
    this.name = "SpotifyApiError";
  }
}

export interface SpotifyApiOptions {
  auth: Pick<SpotifyAuth, "getAccessToken"> &
    Partial<Pick<SpotifyAuth, "refreshRejectedToken">>;
  fetch?: typeof fetch;
}

/** Web API only: every method targets Spotify's currently active Connect device. */
export function createSpotifyApi(options: SpotifyApiOptions) {
  const request = options.fetch ?? fetch;
  async function send(
    path: string,
    method: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    let token: string | null;
    try {
      token = await options.auth.getAccessToken(signal);
    } catch {
      throw new SpotifySessionUnavailable();
    }
    if (!token) throw new SpotifySessionUnavailable();
    const attempt = (credential: string) =>
      request(`https://api.spotify.com/v1/me/player${path}`, {
        method,
        headers: { Authorization: `Bearer ${credential}` },
        signal,
      });
    let response: Response;
    try {
      response = await attempt(token);
      if (
        response.status === 401 &&
        options.auth.refreshRejectedToken &&
        !signal?.aborted
      ) {
        const fresh = await options.auth.refreshRejectedToken(token, signal);
        if (fresh && fresh !== token && !signal?.aborted)
          response = await attempt(fresh);
      }
    } catch {
      throw new Error("Spotify request unavailable; retry later.");
    }
    if (!response.ok && response.status !== 204) {
      const raw = response.headers.get("Retry-After");
      const seconds = raw && /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : 0;
      throw new SpotifyApiError(
        response.status,
        response.status === 429
          ? Math.min(2_147_483_647, Math.max(0, seconds * 1000))
          : undefined,
      );
    }
    return response;
  }
  return {
    async getPlayback(signal?: AbortSignal): Promise<Playback | null> {
      const response = await send("", "GET", signal);
      return response.status === 204
        ? null
        : ((await response.json()) as Playback);
    },
    async play(signal?: AbortSignal): Promise<void> {
      await send("/play", "PUT", signal);
    },
    async pause(signal?: AbortSignal): Promise<void> {
      await send("/pause", "PUT", signal);
    },
    async next(signal?: AbortSignal): Promise<void> {
      await send("/next", "POST", signal);
    },
    async previous(signal?: AbortSignal): Promise<void> {
      await send("/previous", "POST", signal);
    },
  };
}
export type SpotifyApi = ReturnType<typeof createSpotifyApi>;
