/**
 * 브라우저측 Supabase 클라이언트 (@supabase/ssr).
 *
 *  - 쿠키 기반 세션 (httpOnly 아님 — Supabase SDK가 자체 access/refresh 토큰 쿠키 관리)
 *  - signInWithPassword / signInWithOAuth / signUp / signOut / onAuthStateChange
 *  - 서버측과 동일한 anon key 사용. RLS로 보호.
 *
 *  Vite는 클라이언트 번들에 import.meta.env.VITE_* 만 주입함.
 *  → .env.local에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 필요.
 *
 *  PKCE flow (default). Capacitor 환경에선 OAuth가 외부 Safari로 빠지지 않게
 *  signInWithOAuth({ skipBrowserRedirect: true }) + window.location.href 패턴
 *  사용 (auth.login.tsx / auth.signup.tsx 참고). 이러면 verifier가 WebView
 *  storage에 그대로 유지되어 callback 시 정상 교환.
 *
 *  카카오 provider는 implicit flow 미지원 — 코드 흐름만 동작.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 누락. .env.local 확인",
    );
  }
  cached = createBrowserClient(url, anon);
  return cached;
}
