import type { Env } from "./env";

const TOSS_API_BASE = "https://apps-in-toss-api.toss.im";
const GENERATE_TOKEN_PATH =
  "/api-partner/v1/apps-in-toss/user/oauth2/generate-token";
const LOGIN_ME_PATH = "/api-partner/v1/apps-in-toss/user/oauth2/login-me";

// 가이드 기준: accessToken 1시간, refreshToken 14일.
const ACCESS_TOKEN_TTL_SEC = 60 * 60;
const REFRESH_TOKEN_TTL_SEC = 14 * 24 * 60 * 60;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExp: number; // unix seconds
  refreshTokenExp: number;
}

export class TossOAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "TossOAuthError";
  }
}

/**
 * Exchange `authorizationCode` for accessToken + refreshToken.
 *
 * TODO(2026-05-16): 정확한 토스 API 요청 스키마는
 *   references/dev-guide/login/develop.md
 * 확인 후 조정 필요할 수 있음. 가능한 변동 지점:
 *   - auth 방식: Basic header vs body의 clientId/clientSecret 필드
 *   - body 필드명: authorizationCode vs authorization_code
 *   - response envelope: { accessToken } vs { access_token } vs { data: {...} }
 * 첫 실호출 응답으로 검증.
 */
export async function generateToken(
  env: Env,
  authorizationCode: string,
  referrer: "DEFAULT" | "SANDBOX",
): Promise<TokenPair> {
  if (!env.TOSS_CLIENT_ID || !env.TOSS_CLIENT_SECRET) {
    throw new TossOAuthError(
      "CONFIG_MISSING",
      "TOSS_CLIENT_ID / TOSS_CLIENT_SECRET not set (use `wrangler secret put`)",
    );
  }
  const basic = btoa(`${env.TOSS_CLIENT_ID}:${env.TOSS_CLIENT_SECRET}`);
  const res = await fetch(`${TOSS_API_BASE}${GENERATE_TOKEN_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${basic}`,
    },
    body: JSON.stringify({ authorizationCode, referrer }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const code =
      res.status === 401
        ? "AUTH_CODE_EXPIRED"
        : res.status === 403
          ? "AUTH_CODE_REUSED"
          : "TOSS_TOKEN_ERROR";
    throw new TossOAuthError(
      code,
      `generate-token ${res.status}: ${body.slice(0, 200)}`,
      res.status,
    );
  }
  const data = (await res.json()) as Record<string, unknown>;
  const accessToken = String(data.accessToken ?? data.access_token ?? "");
  const refreshToken = String(data.refreshToken ?? data.refresh_token ?? "");
  if (!accessToken || !refreshToken) {
    throw new TossOAuthError(
      "INVALID_TOKEN_RESPONSE",
      `missing tokens in response: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }
  const now = Math.floor(Date.now() / 1000);
  return {
    accessToken,
    refreshToken,
    accessTokenExp: now + ACCESS_TOKEN_TTL_SEC,
    refreshTokenExp: now + REFRESH_TOKEN_TTL_SEC,
  };
}

/**
 * Fetch userKey using accessToken. Returns a number (토스 사용자 식별자).
 */
export async function fetchUserKey(accessToken: string): Promise<number> {
  const res = await fetch(`${TOSS_API_BASE}${LOGIN_ME_PATH}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new TossOAuthError(
      res.status === 401 ? "TOKEN_EXPIRED" : "LOGIN_ME_ERROR",
      `login-me ${res.status}: ${body.slice(0, 200)}`,
      res.status,
    );
  }
  const data = (await res.json()) as Record<string, unknown>;
  const userKey = Number(data.userKey ?? data.user_key);
  if (!Number.isFinite(userKey)) {
    throw new TossOAuthError(
      "INVALID_USER_KEY",
      `unexpected login-me response: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }
  return userKey;
}
