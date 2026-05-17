/**
 * Supabase 클라이언트 helper. CF Workers + Node dev 환경 모두 동작.
 * service_role 키 사용 → RLS 자동 우회. 클라이언트(브라우저)에선 절대 import 금지.
 *
 * 셋업: .env.local (dev) 또는 wrangler secret (prod)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../auth/env";

let cached: SupabaseClient | null = null;

export function getSupabase(env: Env): SupabaseClient {
  if (cached) return cached;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락. .env.local (dev) 또는 wrangler secret (prod) 확인",
    );
  }
  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
