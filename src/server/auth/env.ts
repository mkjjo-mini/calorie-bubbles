/**
 * Cloudflare Worker bindings.
 *
 * Standalone Auth 전환 후 — Apps in Toss SDK / mTLS / KV 세션 모두 제거.
 * Supabase Auth가 쿠키 기반 세션을 직접 관리.
 *
 * 셋업:
 *   - SUPABASE_URL, SUPABASE_ANON_KEY:        클라이언트·서버 모두 사용 (auth)
 *   - SUPABASE_SERVICE_ROLE_KEY:              서버 전용. RLS 우회 admin 작업
 *   - ENVIRONMENT=development:                dev에서 Secure 쿠키 off
 *
 * dev: .env.local (Vite가 VITE_ prefix를 클라 노출, 그 외는 server 전용)
 * prod: wrangler secret put (SERVICE_ROLE_KEY) + wrangler.jsonc vars (URL/ANON)
 */
export interface Env {
  /** Supabase project URL (e.g., https://xxx.supabase.co). 클라/서버 공통 */
  SUPABASE_URL?: string;
  /** Supabase anon key. 클라이언트 노출 OK (RLS로 보호) */
  SUPABASE_ANON_KEY?: string;
  /** Supabase service_role key. **서버 전용**. 절대 클라에 노출 X */
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** Cookie Secure flag 분기. dev=http=development, prod=production */
  ENVIRONMENT?: "development" | "production";
  /** Step 04 식약처 API */
  FOOD_API_KEY?: string;
  /** v1 mock — 유료 사용자 강제 토글 (BM 확정 전까지) */
  FORCE_PAID?: string;
}
