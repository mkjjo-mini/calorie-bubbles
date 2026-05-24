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
 *  ⚠️ flowType: 'implicit' — Capacitor iOS 호환.
 *    PKCE 기본값은 code_verifier를 storage(쿠키)에 저장하는데,
 *    Capacitor WebView가 OAuth를 외부 Safari로 열면 storage가 분리되어
 *    callback 시 "PKCE code verifier not found" 에러 발생.
 *    Implicit은 token을 URL fragment로 받아 storage 의존성 X.
 *    장기적으론 Universal Link + deep link로 PKCE 복원 검토.
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
  cached = createBrowserClient(url, anon, {
    auth: {
      flowType: "implicit",
    },
  });
  return cached;
}
