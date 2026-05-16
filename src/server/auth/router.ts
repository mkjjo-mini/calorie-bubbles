import type { Env } from "./env";
import { handleLogin } from "./login";
import { handleLogout } from "./logout";
import { handleMe } from "./me";

/**
 * Returns a Response if the URL matches an auth route, else null (caller
 * should fall through to the rest of the app).
 */
export async function handleAuth(
  req: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(req.url);
  switch (url.pathname) {
    case "/api/auth/login":
      return handleLogin(req, env);
    case "/api/auth/me":
      return handleMe(req, env);
    case "/api/auth/logout":
      return handleLogout(req, env);
    default:
      return null;
  }
}
