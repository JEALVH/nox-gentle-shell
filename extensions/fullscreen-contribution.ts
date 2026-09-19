export const FULLSCREEN_CONTRIBUTION_EVENT =
  "gentle-pi.fullscreen-contribution/v1";

export interface FullscreenContributionDeclaration {
  version: 1;
  key: string;
  surface: "rail";
  render: () => readonly string[];
  fallback: "widget";
}

export interface FullscreenContributionLease {
  update(nextDeclaration: FullscreenContributionDeclaration): void;
  invalidate(): void;
  dispose(): void;
}

export type FullscreenContributionResponse =
  | { accepted: true; lease: FullscreenContributionLease }
  | { accepted: false; reason: "inactive" | "invalid" };

export interface FullscreenContributionRequest {
  version: 1;
  declaration: FullscreenContributionDeclaration;
  respond?: (response: FullscreenContributionResponse) => void;
}

export interface FullscreenContributionEvents {
  emit(event: string, payload: unknown): void;
}

function isLease(value: unknown): value is FullscreenContributionLease {
  if (!value || typeof value !== "object") return false;
  const lease = value as FullscreenContributionLease;
  return (
    typeof lease.update === "function" &&
    typeof lease.invalidate === "function" &&
    typeof lease.dispose === "function"
  );
}

/**
 * Optional public-event adapter. A missing, rejecting, or incompatible host
 * leaves the caller's existing widget fallback in place.
 */
export function createFullscreenContributionClient(
  events: FullscreenContributionEvents | undefined,
) {
  let lease: FullscreenContributionLease | undefined;

  const dispose = () => {
    const current = lease;
    lease = undefined;
    try {
      current?.dispose();
    } catch {
      // Host cleanup is optional and must not prevent the local fallback.
    }
  };

  const update = (declaration: FullscreenContributionDeclaration): boolean => {
    if (lease) {
      try {
        lease.update(declaration);
        return true;
      } catch {
        dispose();
        return false;
      }
    }

    if (!events) return false;
    let response: FullscreenContributionResponse | undefined;
    let emitting = true;
    try {
      events.emit(FULLSCREEN_CONTRIBUTION_EVENT, {
        version: 1,
        declaration,
        respond(next: FullscreenContributionResponse) {
          if (emitting) response = next;
        },
      } satisfies FullscreenContributionRequest);
    } catch {
      return false;
    } finally {
      emitting = false;
    }

    if (!response || !response.accepted || !isLease(response.lease)) {
      return false;
    }
    lease = response.lease;
    return true;
  };

  return {
    update,
    request: update,
    invalidate(): boolean {
      if (!lease) return false;
      try {
        lease.invalidate();
        return true;
      } catch {
        dispose();
        return false;
      }
    },
    dispose,
  };
}
