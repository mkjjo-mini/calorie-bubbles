/**
 * Cloudflare Worker bindings for this app.
 *
 * 셋업:
 *   - SESSIONS:        `npx wrangler kv namespace create SESSIONS`
 *   - TOSS_CLIENT_*:   `npx wrangler secret put TOSS_CLIENT_ID` / `..._SECRET`
 *   - ENVIRONMENT:     wrangler.jsonc `vars.ENVIRONMENT` ("development" | "production")
 *
 * Step 07에서 `DB: D1Database`가 추가됩니다.
 */
interface KvNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  SESSIONS: KvNamespace;
  TOSS_CLIENT_ID?: string;
  TOSS_CLIENT_SECRET?: string;
  ENVIRONMENT?: "development" | "production";
}
