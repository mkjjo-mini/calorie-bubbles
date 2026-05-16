import type { Env } from "./env";
import { handleLogin } from "./login";
import { handleLogout } from "./logout";
import { handleMe } from "./me";

/**
 * Returns a Response if the URL matches an auth route, else null (caller
 * should fall through to the rest of the app).
 *
 * env가 undefined인 경우(vite dev — cloudflare plugin이 build-only라 binding
 * 미주입)에는 dev fallback (Node process.env + in-memory KV)로 합성.
 * prod 빌드에선 import.meta.env.DEV가 false라 dynamic import가 dead code로 제거됨.
 */
export async function handleAuth(
  req: Request,
  env: Env | undefined,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/api/auth/")) return null;

  let effectiveEnv = env;
  if (!effectiveEnv) {
    if (!import.meta.env?.DEV) {
      return new Response(
        JSON.stringify({
          code: "ENV_MISSING",
          message: "Worker bindings 누락",
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }
    const { getDevEnv } = await import("./dev-env");
    effectiveEnv = getDevEnv();
  }

  switch (url.pathname) {
    case "/api/auth/login":
      return handleLogin(req, effectiveEnv);
    case "/api/auth/me":
      return handleMe(req, effectiveEnv);
    case "/api/auth/logout":
      return handleLogout(req, effectiveEnv);
    default:
      return null;
  }
}
