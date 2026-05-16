import type { Env } from "./env";
import { clearCookieHeader, deleteSession, parseCookie } from "./session";

export async function handleLogout(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const sessionId = parseCookie(req);
  if (sessionId) {
    try {
      await deleteSession(env, sessionId);
    } catch {
      /* ignore — KV 일시 장애 시에도 쿠키는 만료시킴 */
    }
  }
  const secure = env.ENVIRONMENT !== "development";
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": clearCookieHeader(secure) },
  });
}
