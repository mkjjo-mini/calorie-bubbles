/**
 * 앱인토스 토스 로그인 OAuth (서버측).
 *
 * 가이드: https://developers-apps-in-toss.toss.im/login/develop.md
 *
 * 미니앱 컨텍스트에서는 토스가 별도의 Client ID/Secret을 발급하지 않는다.
 * 발급된 authorizationCode (10분 일회성)만으로 generate-token 호출이 인증됨.
 * 응답은 { resultType, success | error } envelope으로 래핑됨.
 *
 * 받은 "복호화 키"는 PII(name/phone/birthday/ci/gender/nationality/email) AES-256-GCM
 * 복호화 전용. v1엔 userKey만 활용하므로 사용 안 함 (TOSS_DECRYPT_KEY는 필요해질 때 추가).
 */

const TOSS_API_BASE = "https://apps-in-toss-api.toss.im";
const GENERATE_TOKEN_PATH =
  "/api-partner/v1/apps-in-toss/user/oauth2/generate-token";
const REFRESH_TOKEN_PATH =
  "/api-partner/v1/apps-in-toss/user/oauth2/refresh-token";
const LOGIN_ME_PATH = "/api-partner/v1/apps-in-toss/user/oauth2/login-me";
const REVOKE_BY_ACCESS_TOKEN_PATH =
  "/api-partner/v1/apps-in-toss/user/oauth2/access/remove-by-access-token";

// 가이드 기준: refreshToken 14일. accessToken은 응답의 expiresIn(초) 사용.
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
 * 두 가지 실패 응답 envelope 모두 처리:
 *   (a) { "error": "invalid_grant" }                          — 인가코드 만료/재사용
 *   (b) { "resultType": "FAIL", "error": { errorCode, reason } } — 일반 에러
 */
function parseTossError(data: Record<string, unknown>, status: number): TossOAuthError {
  // (a) 단순 error 문자열
  if (typeof data.error === "string") {
    const code = data.error.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    return new TossOAuthError(code, `토스 오류: ${data.error}`, status);
  }
  // (b) resultType=FAIL + error 객체
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

/**
 * 인가코드 → accessToken + refreshToken 교환.
 * 미니앱은 별도 client 인증 헤더 없이 authorizationCode + referrer 만 전송.
 */
export async function generateToken(
  authorizationCode: string,
  referrer: "DEFAULT" | "SANDBOX",
): Promise<TokenPair> {
  const res = await fetch(`${TOSS_API_BASE}${GENERATE_TOKEN_PATH}`, {
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
  const expiresIn = Number(success.expiresIn) || 3600; // 기본 1h
  return {
    accessToken: success.accessToken,
    refreshToken: success.refreshToken,
    accessTokenExp: now + expiresIn,
    refreshTokenExp: now + REFRESH_TOKEN_TTL_SEC,
  };
}

/**
 * refreshToken으로 accessToken 갱신.
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenPair> {
  const res = await fetch(`${TOSS_API_BASE}${REFRESH_TOKEN_PATH}`, {
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
  // PII 필드들 (암호화된 base64 문자열). v1엔 사용 안 함.
  name?: string | null;
  phone?: string | null;
  birthday?: string | null;
  ci?: string | null;
  gender?: string | null;
  nationality?: string | null;
  email?: string | null;
}

/**
 * accessToken으로 userKey 조회. userKey는 number 타입.
 * PII 필드는 모두 암호화된 base64. v1엔 무시.
 */
export async function fetchUserKey(accessToken: string): Promise<number> {
  const res = await fetch(`${TOSS_API_BASE}${LOGIN_ME_PATH}`, {
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

/**
 * accessToken으로 토스 로그인 연결 끊기. logout 시 best-effort.
 * 실패해도 우리 세션 무효화는 별도로 진행.
 */
export async function revokeByAccessToken(accessToken: string): Promise<void> {
  await fetch(`${TOSS_API_BASE}${REVOKE_BY_ACCESS_TOKEN_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
  });
  // 응답 무시 — 우리 측 KV 세션 삭제가 권위 있는 로그아웃.
}
