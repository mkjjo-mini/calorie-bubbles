/**
 * `/api/*` 인증 미들웨어 (Supabase Auth 기반).
 *
 * - 요청 쿠키에서 Supabase 세션 파싱 → auth.getUser()로 검증된 user.id 추출
 * - admin 클라이언트(service_role)를 핸들러에 전달 — 코드가 user_id WHERE 절 강제
 * - 미인증/세션 만료 → 401 SESSION_EXPIRED
 * - getUser()가 토큰을 refresh했다면 Set-Cookie를 응답에 머지
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import {
  applyCookies,
  createAdminSupabase,
  createServerSupabase,
} from "./supabase-server";

export function jsonError(
  status: number,
  code: string,
  message: string,
): Response {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: NO_STORE_JSON_HEADERS,
  });
}

/**
 * /api/* 응답 공통 헤더. iOS WebView의 GET 캐시 차단 (추가/삭제 후 stale 방지).
 */
export const NO_STORE_JSON_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store, private",
} as const;

export interface UserContext {
  userId: string;
  admin: SupabaseClient;
}

export async function withUser(
  req: Request,
  env: Env,
  handler: (ctx: UserContext) => Promise<Response>,
): Promise<Response> {
  let serverCtx;
  try {
    serverCtx = createServerSupabase(req, env);
  } catch (e) {
    console.error("[auth] env config error", e);
    return jsonError(500, "ENV_MISSING", (e as Error).message);
  }

  const {
    data: { user },
    error,
  } = await serverCtx.supabase.auth.getUser();

  if (error || !user) {
    const res = jsonError(401, "SESSION_EXPIRED", "no valid session");
    return applyCookies(res, serverCtx.cookiesToSet);
  }

  const admin = createAdminSupabase(env);
  const res = await handler({ userId: user.id, admin });
  return applyCookies(res, serverCtx.cookiesToSet);
}
