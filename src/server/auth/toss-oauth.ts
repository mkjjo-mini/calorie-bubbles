/**
 * 앱인토스 토스 로그인 OAuth (서버측).
 *
 * 가이드: https://developers-apps-in-toss.toss.im/login/develop.md
 *
 * 미니앱은 client_id/secret 미발급 — mTLS client certificate로 인증.
 * 응답은 { resultType, success | error } envelope으로 래핑됨.
 *
 * 환경별 mTLS 처리:
 *   - prod (CF Workers): env.TOSS_MTLS binding의 fetch 사용 (binding이 핸드셰이크 자동 처리)
 *   - dev (Vite/Node):   undici Agent + .env.local의 PEM 파일 path
 */

import type { Env } from "./env";

const TOSS_API_BASE = "https://apps-in-toss-api.toss.im";
const GENERATE_TOKEN_PATH =
  "/api-partner/v1/apps-in-toss/user/oauth2/generate-token";
const REFRESH_TOKEN_PATH =
  "/api-partner/v1/apps-in-toss/user/oauth2/refresh-token";
const LOGIN_ME_PATH = "/api-partner/v1/apps-in-toss/user/oauth2/login-me";
const REVOKE_BY_ACCESS_TOKEN_PATH =
  "/api-partner/v1/apps-in-toss/user/oauth2/access/remove-by-access-token";

const REFRESH_TOKEN_TTL_SEC = 14 * 24 * 60 * 60;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExp: number;
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

/* ---------------- mTLS dispatcher (dev/Node only) ---------------- */

let cachedDispatcher: unknown = null;

async function getNodeDispatcher(
  certPath: string,
  keyPath: string,
): Promise<unknown> {
  if (cachedDispatcher) return cachedDispatcher;
  // 동적 import — 이 모듈은 Node 전용 (CF Worker 빌드에는 포함 X)
  const { readFileSync } = await import("node:fs");
  const { Agent } = await import("undici");
  cachedDispatcher = new Agent({
    connect: {
      cert: readFileSync(certPath),
      key: readFileSync(keyPath),
    },
  });
  return cachedDispatcher;
}

/**
 * 토스 API 호출 entry point. 환경에 따라 mTLS 처리 분기.
 */
async function tossFetch(
  env: Env,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  // (a) CF Worker binding (prod). binding이 mTLS 핸드셰이크 자동 처리.
  if (env.TOSS_MTLS && typeof env.TOSS_MTLS.fetch === "function") {
    return env.TOSS_MTLS.fetch(url, init);
  }
  // (b) Node dev: undici Agent
  if (env.TOSS_MTLS_CERT_PATH && env.TOSS_MTLS_KEY_PATH) {
    const dispatcher = await getNodeDispatcher(
      env.TOSS_MTLS_CERT_PATH,
      env.TOSS_MTLS_KEY_PATH,
    );
    return fetch(url, { ...init, dispatcher } as RequestInit & {
      dispatcher: unknown;
    });
  }
  // (c) mTLS 미구성
  throw new TossOAuthError(
    "MTLS_NOT_CONFIGURED",
    "mTLS 인증서가 구성되지 않았습니다. dev: .env.local의 TOSS_MTLS_CERT_PATH/KEY_PATH. prod: wrangler.jsonc의 mtls_certificates binding",
  );
}

/* ---------------- 응답 envelope 파싱 ---------------- */

function parseTossError(data: Record<string, unknown>, status: number): TossOAuthError {
  if (typeof data.error === "string") {
    const code = data.error.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    return new TossOAuthError(code, `토스 오류: ${data.error}`, status);
  }
  if (data.resultType === "FAIL" && typeof data.error === "object" && data.error) {
    const err = data.error as { errorCode?: string; reason?: string };
    return new TossOAuthError(
      err.errorCode ?? "TOSS_FAIL",
      err.reason ?? "토스 처리 실패",
      status,
    );
  }
  return new TossOAuthError(
    "TOSS_UNEXPECTED",
    `예상치 못한 응답: ${JSON.stringify(data).slice(0, 200)}`,
    status,
  );
}

interface GenerateTokenSuccess {
  tokenType: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}

/* ---------------- public API ---------------- */

export async function generateToken(
  env: Env,
  authorizationCode: string,
  referrer: "DEFAULT" | "SANDBOX",
): Promise<TokenPair> {
  const res = await tossFetch(env, `${TOSS_API_BASE}${GENERATE_TOKEN_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ authorizationCode, referrer }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.resultType !== "SUCCESS" || data.error) {
    throw parseTossError(data, res.status);
  }
  const success = data.success as GenerateTokenSuccess | undefined;
  if (!success?.accessToken || !success?.refreshToken) {
    throw new TossOAuthError(
      "INVALID_TOKEN_RESPONSE",
      `success 페이로드 누락: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = Number(success.expiresIn) || 3600;
  return {
    accessToken: success.accessToken,
    refreshToken: success.refreshToken,
    accessTokenExp: now + expiresIn,
    refreshTokenExp: now + REFRESH_TOKEN_TTL_SEC,
  };
}

export async function refreshAccessToken(
  env: Env,
  refreshToken: string,
): Promise<TokenPair> {
  const res = await tossFetch(env, `${TOSS_API_BASE}${REFRESH_TOKEN_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.resultType !== "SUCCESS" || data.error) {
    throw parseTossError(data, res.status);
  }
  const success = data.success as GenerateTokenSuccess | undefined;
  if (!success?.accessToken || !success?.refreshToken) {
    throw new TossOAuthError(
      "INVALID_REFRESH_RESPONSE",
      `success 페이로드 누락: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = Number(success.expiresIn) || 3600;
  return {
    accessToken: success.accessToken,
    refreshToken: success.refreshToken,
    accessTokenExp: now + expiresIn,
    refreshTokenExp: now + REFRESH_TOKEN_TTL_SEC,
  };
}

interface LoginMeSuccess {
  userKey: number;
  scope: string;
  agreedTerms?: string[];
}

export async function fetchUserKey(
  env: Env,
  accessToken: string,
): Promise<number> {
  const res = await tossFetch(env, `${TOSS_API_BASE}${LOGIN_ME_PATH}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.resultType !== "SUCCESS" || data.error) {
    throw parseTossError(data, res.status);
  }
  const success = data.success as LoginMeSuccess | undefined;
  const userKey = Number(success?.userKey);
  if (!Number.isFinite(userKey)) {
    throw new TossOAuthError(
      "INVALID_USER_KEY",
      `userKey 누락/형식 오류: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }
  return userKey;
}

export async function revokeByAccessToken(
  env: Env,
  accessToken: string,
): Promise<void> {
  // best-effort — 실패해도 우리 KV 세션 삭제가 권위 있는 로그아웃
  await tossFetch(env, `${TOSS_API_BASE}${REVOKE_BY_ACCESS_TOKEN_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
  }).catch((e) => {
    console.warn("[auth/revoke] failed (ignored)", e);
  });
}
