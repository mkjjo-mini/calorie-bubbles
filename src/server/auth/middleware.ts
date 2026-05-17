/**
 * `/api/*` 모든 라우트가 거치는 인증 미들웨어.
 *
 * Step 01의 세션 쿠키로 userKey 확정 → handler에 주입.
 * 세션 없거나 만료면 401 SESSION_EXPIRED. 클라이언트의 useSession이 자동 재로그인.
 */
import type { Env } from "./env";
import { resolveSession } from "./session";

export function jsonError(
  status: number,
  code: string,
  message: string,
): Response {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function withSession(
  req: Request,
  env: Env,
  handler: (userKey: number) => Promise<Response>,
): Promise<Response> {
  const session = await resolveSession(req, env);
  if (!session) {
    return jsonError(401, "SESSION_EXPIRED", "no valid session");
  }
  return handler(session.userKey);
}
