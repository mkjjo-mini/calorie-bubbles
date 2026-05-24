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
import { applyCookies, createAdminSupabase, createServerSupabase } from "./supabase-server";
import {
  evaluateCompliance,
  handleConsentGrant,
  handleConsentStatus,
  handleConsentWithdraw,
} from "../api/consent";

export async function handleAuth(req: Request, env: Env): Promise<Response | null> {
  const url = new URL(req.url);

  if (url.pathname === "/api/auth/me") {
    return handleMe(req, env);
  }
  if (url.pathname === "/api/auth/logout") {
    return handleLogout(req, env);
  }
  if (url.pathname === "/api/auth/delete-account") {
    return handleDeleteAccount(req, env);
  }
  if (url.pathname === "/api/auth/callback") {
    return handleCallback(req, env);
  }
  if (url.pathname === "/api/auth/consent-status") {
    return handleConsentStatus(req, env);
  }
  if (url.pathname === "/api/auth/consent") {
    return handleConsentGrant(req, env);
  }
  if (url.pathname === "/api/auth/consent/withdraw") {
    return handleConsentWithdraw(req, env);
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
 * 회원 탈퇴 — Supabase auth.users 삭제 + CASCADE로 모든 사용자 데이터 자동 파기.
 *
 *  보안: 쿠키로 본인 확인 → admin client으로 본인 자신의 user만 삭제.
 *  다른 사용자 ID를 body로 받지 않음 (탈취 방지).
 *
 *  PIPA "동의 철회" 권리도 사실상 이 흐름으로 처리됨 (별도 옵션이 없으므로).
 */
async function handleDeleteAccount(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") {
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

  try {
    const admin = createAdminSupabase(env);

    // Storage 폴더 비우기 (food-photos/<user_id>/*.jpg)
    // auth.users CASCADE는 storage.objects에 적용되지 않으므로 직접 정리.
    // 베스트 에포트 — 실패해도 auth.users 삭제는 계속 진행 (사용자 권리 보장 우선).
    try {
      const { data: files, error: listErr } = await admin.storage
        .from("food-photos")
        .list(user.id, { limit: 1000 });
      if (listErr) {
        console.warn("[auth/delete-account] storage list failed", listErr.message);
      } else if (files && files.length > 0) {
        const paths = files.map((f) => `${user.id}/${f.name}`);
        const { error: removeErr } = await admin.storage.from("food-photos").remove(paths);
        if (removeErr) {
          console.warn("[auth/delete-account] storage remove failed", removeErr.message);
        }
      }
    } catch (storageErr) {
      console.warn("[auth/delete-account] storage cleanup error", storageErr);
    }

    const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id);
    if (deleteErr) {
      console.error("[auth/delete-account]", deleteErr.message);
      return new Response(JSON.stringify({ code: "DELETE_FAILED", message: deleteErr.message }), {
        status: 500,
        headers: NO_STORE_JSON_HEADERS,
      });
    }
    // 서버측에서 세션도 함께 정리
    await ctx.supabase.auth.signOut();
    const res = new Response(null, { status: 204 });
    return applyCookies(res, ctx.cookiesToSet);
  } catch (e) {
    console.error("[auth/delete-account] unexpected", e);
    return new Response(JSON.stringify({ code: "INTERNAL", message: (e as Error).message }), {
      status: 500,
      headers: NO_STORE_JSON_HEADERS,
    });
  }
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

  // Step 18 — consent 가드.
  //
  //   /auth/login 진입 후 소셜 클릭 → callback. 이 경로엔 동의 체크박스가 없음.
  //   신규 가입자(또는 약관 갱신 미동의 기존 사용자)를 여기서 catch해 /auth/consent로
  //   강제 우회. 동의 완료 후 본래 next로 이동.
  //
  //   ⚠️ /auth/signup → 소셜 흐름도 같은 callback을 거치는데, signup 화면이
  //   이미 클라가 약관 체크를 강제하지만 백엔드에 동의 row를 아직 안 만들었으면
  //   여기서도 catch됨 → /auth/consent 한 번 더 거침. 이건 안전한 idempotent UX
  //   (PRD는 사용자가 의도 임시 저장하는 옵션도 언급하지만, 최소 픽스로는 이
  //   "한 번 더 동의" 흐름이 가장 단순·신뢰성 있음).
  try {
    const {
      data: { user },
    } = await ctx.supabase.auth.getUser();
    if (user) {
      const admin = createAdminSupabase(env);
      const result = await evaluateCompliance(admin, user.id);
      if ("error" in result) {
        console.error("[auth/callback] compliance check failed", result.error);
        // 검사 실패는 fail-open (가드 무력화) — 가입은 통과시키되 AppShell이
        // 다음 페이지에서 다시 검사. 사용자가 막히지 않음.
      } else if (!result.compliant) {
        const consentUrl = new URL("/auth/consent", url.origin);
        consentUrl.searchParams.set("next", next.startsWith("/") ? next : "/");
        const redir = Response.redirect(consentUrl.toString(), 303);
        const mutable = new Response(null, { status: 303, headers: redir.headers });
        return applyCookies(mutable, ctx.cookiesToSet);
      }
    }
  } catch (e) {
    console.error("[auth/callback] consent guard error", e);
    // fail-open — 가입은 통과 (AppShell이 catch).
  }

  const target = new URL(next.startsWith("/") ? next : "/", url.origin);
  // Response.redirect는 immutable headers — 복제해서 Set-Cookie 머지 가능하게.
  const tmp = Response.redirect(target.toString(), 303);
  const mutable = new Response(null, { status: 303, headers: tmp.headers });
  return applyCookies(mutable, ctx.cookiesToSet);
}
