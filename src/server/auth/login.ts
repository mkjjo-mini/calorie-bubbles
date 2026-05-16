import type { Env } from "./env";
import {
  generateSessionId,
  setCookieHeader,
  writeSession,
  type SessionPayload,
} from "./session";
import { fetchUserKey, generateToken, TossOAuthError } from "./toss-oauth";

interface LoginBody {
  authorizationCode: string;
  referrer: "DEFAULT" | "SANDBOX";
}

function isLoginBody(x: unknown): x is LoginBody {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.authorizationCode === "string" &&
    o.authorizationCode.length > 0 &&
    (o.referrer === "DEFAULT" || o.referrer === "SANDBOX")
  );
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleLogin(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_BODY", "body must be JSON");
  }
  if (!isLoginBody(body)) {
    return jsonError(
      400,
      "INVALID_BODY",
      "missing authorizationCode or referrer",
    );
  }

  try {
    const tokens = await generateToken(
      env,
      body.authorizationCode,
      body.referrer,
    );
    const userKey = await fetchUserKey(env, tokens.accessToken);

    const sessionId = generateSessionId();
    const payload: SessionPayload = {
      userKey,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExp: tokens.accessTokenExp,
      refreshTokenExp: tokens.refreshTokenExp,
      createdAt: Math.floor(Date.now() / 1000),
    };
    await writeSession(env, sessionId, payload);

    const secure = env.ENVIRONMENT !== "development";
    return new Response(JSON.stringify({ userKey }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": setCookieHeader(sessionId, secure),
      },
    });
  } catch (e) {
    if (e instanceof TossOAuthError) {
      console.error("[auth/login]", e.code, e.message);
      return jsonError(401, e.code, "login failed");
    }
    console.error("[auth/login] unexpected", e);
    return jsonError(500, "INTERNAL", "login failed");
  }
}
