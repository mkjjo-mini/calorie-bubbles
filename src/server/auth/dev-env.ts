/**
 * Dev-only env fallback. vite dev에는 CF Workers binding이 없어
 * Node process.env에서 직접 읽음. prod 빌드에선 호출되지 않음
 * (server.ts의 import.meta.env.DEV 가드).
 */
import type { Env } from "./env";

let cachedDevEnv: Env | null = null;

export function getDevEnv(): Env {
  if (cachedDevEnv) return cachedDevEnv;
  const env: Env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    FOOD_API_KEY: process.env.FOOD_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    FORCE_PAID: process.env.FORCE_PAID,
    // Step 17 entitlements
    FORCE_PRO_USERS: process.env.FORCE_PRO_USERS,
    FORCE_BASIC_USERS: process.env.FORCE_BASIC_USERS,
    AI_FEATURE_ENABLED: process.env.AI_FEATURE_ENABLED,
    // Step 13 RevenueCat
    RC_WEBHOOK_AUTH_HEADER: process.env.RC_WEBHOOK_AUTH_HEADER,
    RC_PUBLIC_API_KEY_IOS: process.env.RC_PUBLIC_API_KEY_IOS,
    ENVIRONMENT:
      (process.env.ENVIRONMENT as "development" | "production") ?? "development",
  };
  cachedDevEnv = env;
  return env;
}
