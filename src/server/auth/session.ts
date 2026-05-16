import type { Env } from "./env";

const COOKIE_NAME = "session";
const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60; // refreshToken 유효기간과 정렬

export interface SessionPayload {
  userKey: number;
  accessToken: string;
  refreshToken: string;
  accessTokenExp: number; // unix seconds
  refreshTokenExp: number;
  createdAt: number;
}

export function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function kvKey(id: string): string {
  return `session:${id}`;
}

export async function writeSession(
  env: Env,
  id: string,
  payload: SessionPayload,
): Promise<void> {
  await env.SESSIONS.put(kvKey(id), JSON.stringify(payload), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
}

export async function readSession(
  env: Env,
  id: string,
): Promise<SessionPayload | null> {
  const raw = await env.SESSIONS.get(kvKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionPayload;
  } catch {
    return null;
  }
}

export async function deleteSession(env: Env, id: string): Promise<void> {
  await env.SESSIONS.delete(kvKey(id));
}

/* ---------- Cookie helpers ---------- */

export function parseCookie(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  const match = header
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE_NAME}=`));
  return match
    ? decodeURIComponent(match.slice(COOKIE_NAME.length + 1))
    : null;
}

function buildCookie(value: string, maxAge: number, secure: boolean): string {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function setCookieHeader(sessionId: string, secure: boolean): string {
  return buildCookie(sessionId, SESSION_TTL_SECONDS, secure);
}

export function clearCookieHeader(secure: boolean): string {
  return buildCookie("", 0, secure);
}

/* ---------- High-level resolver ---------- */

/**
 * Resolve userKey from session cookie. Returns null if no/invalid session.
 * 토큰 만료 처리는 Step 07 (D1 호출 시 accessToken 필요할 때)에서 refresh 추가.
 * 본 Step 01은 사용자 식별만 책임지므로 세션 존재 = 유효로 간주.
 */
export async function resolveSession(
  req: Request,
  env: Env,
): Promise<{ userKey: number; sessionId: string } | null> {
  const sessionId = parseCookie(req);
  if (!sessionId) return null;
  const payload = await readSession(env, sessionId);
  if (!payload) return null;
  return { userKey: payload.userKey, sessionId };
}
