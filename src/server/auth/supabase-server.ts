/**
 * 서버측 Supabase 클라이언트 (@supabase/ssr).
 *
 * 1) createServerSupabase(req, env)
 *    - 요청 쿠키를 읽어 인증된 SupabaseClient 반환
 *    - auth.getUser()로 검증된 user.id 사용
 *    - getUser() 호출 시 토큰이 refresh되면 응답에 Set-Cookie 추가 필요 →
 *      cookiesToSet 배열에 누적, 핸들러가 응답에 머지
 *
 * 2) createAdminSupabase(env)
 *    - service_role 키. RLS 우회. 사용자 컨텍스트 없는 admin 작업용
 *    - **클라이언트에서 절대 import 금지**
 *
 * 미들웨어 withUser가 위 두 함수를 활용:
 *   - getUser()로 user.id 추출
 *   - admin 클라이언트로 DB 쿼리 (user_id WHERE 절은 코드가 강제)
 */
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
  type CookieOptions,
} from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";

export interface CookieToSet {
  name: string;
  value: string;
  options: CookieOptions;
}

export interface ServerSupabaseContext {
  supabase: SupabaseClient;
  /** auth.getUser/refresh 도중 발급된 Set-Cookie. 응답에 머지해야 함 */
  cookiesToSet: CookieToSet[];
}

export function createServerSupabase(
  req: Request,
  env: Env,
): ServerSupabaseContext {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_ANON_KEY 누락. .env.local (dev) 또는 wrangler vars (prod)",
    );
  }
  const cookiesToSet: CookieToSet[] = [];
  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        const header = req.headers.get("cookie") ?? "";
        return parseCookieHeader(header).map((c) => ({
          name: c.name,
          value: c.value ?? "",
        }));
      },
      setAll(items) {
        for (const it of items) {
          cookiesToSet.push({
            name: it.name,
            value: it.value,
            options: it.options ?? {},
          });
        }
      },
    },
  });
  return { supabase, cookiesToSet };
}

let cachedAdmin: SupabaseClient | null = null;

export function createAdminSupabase(env: Env): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락. service_role 키는 서버 전용",
    );
  }
  cachedAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}

/**
 * 핸들러가 만든 Response에 cookiesToSet 머지.
 * 다중 Set-Cookie는 headers.append 사용 (덮어쓰기 X).
 */
export function applyCookies(res: Response, cookiesToSet: CookieToSet[]): Response {
  if (cookiesToSet.length === 0) return res;
  for (const c of cookiesToSet) {
    res.headers.append("set-cookie", serializeCookieHeader(c.name, c.value, c.options));
  }
  return res;
}
