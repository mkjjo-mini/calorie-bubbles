/**
 * Dev-only env fallback. CF Workers의 binding 시스템(env)이 vite dev
 * (cloudflare plugin은 build-only)에서 주입 안 됨 → Node process.env에서
 * 직접 읽고 KV는 in-memory Map으로 대체.
 *
 * prod 빌드에서는 router.ts의 `import.meta.env.DEV` 가드로 호출되지 않음.
 */

import type { Env } from "./env";

interface KvNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

function createInMemoryKV(): KvNamespace {
  // 단일 dev process scope. 서버 재시작 시 세션 사라짐 — dev 의도에 부합.
  const store = new Map<string, string>();
  return {
    async get(k) {
      return store.get(k) ?? null;
    },
    async put(k, v) {
      store.set(k, v);
    },
    async delete(k) {
      store.delete(k);
    },
  };
}

let cachedDevEnv: Env | null = null;

/**
 * Node dev 환경에서 .env.local 기반으로 Env 객체 합성.
 * vite dev에선 process.env가 .env.local 값을 자동 주입함.
 */
export function getDevEnv(): Env {
  if (cachedDevEnv) return cachedDevEnv;
  const env: Env = {
    SESSIONS: createInMemoryKV(),
    TOSS_MTLS_CERT_PATH: process.env.TOSS_MTLS_CERT_PATH,
    TOSS_MTLS_KEY_PATH: process.env.TOSS_MTLS_KEY_PATH,
    TOSS_DECRYPT_KEY: process.env.TOSS_DECRYPT_KEY,
    ENVIRONMENT:
      (process.env.ENVIRONMENT as "development" | "production") ?? "development",
  };
  cachedDevEnv = env;
  return env;
}
