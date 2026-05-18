/**
 * /api/auth/* 라우터 — Supabase Auth 기반.
 *
 *   GET   /api/auth/me        → 현재 사용자 정보 (없으면 401)
 *   POST  /api/auth/logout    → 세션 쿠키 삭제
 *   GET   /api/auth/callback  → OAuth(Apple/Google) 콜백. code → 세션 교환
 *
 *  /api/auth/login은 제거 — 클라이언트가 supabase.auth.signInWithPassword/OAuth를
 *  직접 호출하고 SDK가 쿠키를 발급. 서버는 검증만 책임.
 */
import type { Env } from "./env";
import { NO_STORE_JSON_HEADERS } from "./middleware";
import { applyCookies, createServerSupabase } from "./supabase-server";

export async function handleAuth(
  req: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(req.url);

  if (url.pathname === "/api/auth/me") {
    return handleMe(req, env);
  }
  if (url.pathname === "/api/auth/logout") {
    return handleLogout(req, env);
  }
  if (url.pathname === "/api/auth/callback") {
    return handleCallback(req, env);
  }
  return null;
}

async function handleMe(req: Request, env: Env): Promise<Response> {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const ctx = createServerSupabase(req, env);
  const {
    data: { user },
    error,
  } = await ctx.supabase.auth.getUser();

  if (error || !user) {
    const res = new Response(
      JSON.stringify({ code: "SESSION_EXPIRED", message: "no valid session" }),
      { status: 401, headers: NO_STORE_JSON_HEADERS },
    );
    return applyCookies(res, ctx.cookiesToSet);
  }

  const res = new Response(
    JSON.stringify({
      userId: user.id,
      email: user.email ?? null,
      provider: user.app_metadata?.provider ?? "email",
    }),
    { status: 200, headers: NO_STORE_JSON_HEADERS },
  );
  return applyCookies(res, ctx.cookiesToSet);
}

async function handleLogout(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const ctx = createServerSupabase(req, env);
  await ctx.supabase.auth.signOut();
  const res = new Response(null, { status: 204 });
  return applyCookies(res, ctx.cookiesToSet);
}

/**
 * OAuth 콜백 — Apple/Google 등에서 ?code=...로 redirect됨.
 * exchangeCodeForSession → 쿠키 발급 후 next 경로로 이동.
 */
async function handleCallback(req: Request, env: Env): Promise<Response> {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const err = url.searchParams.get("error");
  const errDesc = url.searchParams.get("error_description");

  if (err) {
    const loginUrl = new URL("/auth/login", url.origin);
    loginUrl.searchParams.set("error", errDesc ?? err);
    return Response.redirect(loginUrl.toString(), 303);
  }
  if (!code) {
    const loginUrl = new URL("/auth/login", url.origin);
    loginUrl.searchParams.set("error", "missing code");
    return Response.redirect(loginUrl.toString(), 303);
  }

  const ctx = createServerSupabase(req, env);
  const { error } = await ctx.supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[auth/callback] exchange failed", error.message);
    const loginUrl = new URL("/auth/login", url.origin);
    loginUrl.searchParams.set("error", error.message);
    return Response.redirect(loginUrl.toString(), 303);
  }

  const target = new URL(next.startsWith("/") ? next : "/", url.origin);
  // Response.redirect는 immutable headers — 복제해서 Set-Cookie 머지 가능하게.
  const tmp = Response.redirect(target.toString(), 303);
  const mutable = new Response(null, { status: 303, headers: tmp.headers });
  return applyCookies(mutable, ctx.cookiesToSet);
}
