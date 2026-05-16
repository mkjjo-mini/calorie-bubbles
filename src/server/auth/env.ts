/**
 * Cloudflare Worker bindings for this app.
 *
 * 셋업:
 *   - SESSIONS:        `npx wrangler kv namespace create SESSIONS`
 *   - ENVIRONMENT:     wrangler.jsonc `vars.ENVIRONMENT` ("development" | "production")
 *
 * 앱인토스 미니앱은 OAuth client_id/secret을 사용하지 않음 (authorizationCode 자체로
 * 인증). 가이드: https://developers-apps-in-toss.toss.im/login/develop.md
 *
 * PII 복호화가 필요해지면 `TOSS_DECRYPT_KEY` (AES-256 base64) 시크릿 추가:
 *   `npx wrangler secret put TOSS_DECRYPT_KEY`
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
  /** AES-256 base64. 이메일로 받은 PII 복호화 키. v1엔 미사용. */
  TOSS_DECRYPT_KEY?: string;
  ENVIRONMENT?: "development" | "production";
}
