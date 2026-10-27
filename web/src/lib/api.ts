import type { Snapshot } from "../types";

const ROOT = "/api/hand-and-foot";
let csrf: string | undefined;
let initializing: Promise<void> | undefined;
let sessionGeneration = 0;
export function invalidateGameSession() {
  sessionGeneration++;
  csrf = undefined;
  initializing = undefined;
}
async function session() {
  const generation = sessionGeneration;
  if (!initializing)
    initializing = fetch(`${ROOT}/session`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("The game service is unavailable. Please try again.");
        const result = await response.json();
        if (generation === sessionGeneration) csrf = result.csrf;
      })
      .catch((error) => {
        if (generation === sessionGeneration) initializing = undefined;
        throw error;
      });
  await initializing;
  if (generation !== sessionGeneration) await session();
}
export class GameApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, body?: unknown): Promise<T> {
  await session();
  const response = await fetch(`${ROOT}${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Handandfoot-CSRF": csrf!,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({
    error: "The game service returned an unreadable response.",
  }));
  if (!response.ok) {
    if (result.code === "CSRF_INVALID") {
      csrf = undefined;
      initializing = undefined;
    }
    throw new GameApiError(
      result.error || "Something went wrong. Please try again.",
      response.status,
      result.code,
    );
  }
  return result as T;
}
export const getRoom = (code: string) =>
  request<Snapshot>(`/rooms/${encodeURIComponent(code)}`);
export const command = (
  snapshot: Snapshot,
  type: string,
  payload: Record<string, unknown> = {},
) =>
  request<Snapshot>(`/rooms/${snapshot.code}/commands`, {
    actionId: crypto.randomUUID(),
    revision: snapshot.revision,
    token: snapshot.token,
    type,
    ...payload,
  });
export async function socketCredentials() {
  await session();
  return { csrf };
}
