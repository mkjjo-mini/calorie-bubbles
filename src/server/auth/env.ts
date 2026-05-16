/**
 * Cloudflare Worker bindings for this app.
 *
 * 셋업:
 *   - SESSIONS:        `npx wrangler kv namespace create SESSIONS`
 *   - TOSS_MTLS:       `npx wrangler mtls-certificate upload --cert ... --key ...`
 *                      후 wrangler.jsonc `mtls_certificates` binding
 *   - ENVIRONMENT:     wrangler.jsonc `vars.ENVIRONMENT`
 *
 * 미니앱 컨텍스트에서는 OAuth client_id/secret을 발급받지 않음.
 * 대신 mTLS client certificate로 토스 API에 인증.
 * (가이드: https://developers-apps-in-toss.toss.im/login/develop.md
 *  + 콘솔 "mTLS 인증서" 메뉴)
 *
 * dev 환경 (Vite + Node)에서는 mtls_certificates binding이 동작 안 함.
 * .env.local에 cert/key 파일 path를 두고 undici Agent로 처리.
 *
 * PII 복호화는 v1엔 미사용 (TOSS_DECRYPT_KEY는 필요해질 때).
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

interface MtlsFetcher {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

export interface Env {
  SESSIONS: KvNamespace;
  /** CF Worker mtls_certificates binding — prod에서 토스 API mTLS 핸드셰이크 자동 처리 */
  TOSS_MTLS?: MtlsFetcher;
  /** dev (Node) 환경 전용 — PEM 파일 path. wrangler dev/vite dev에서 .env.local로 주입 */
  TOSS_MTLS_CERT_PATH?: string;
  TOSS_MTLS_KEY_PATH?: string;
  /** AES-256 base64. PII 복호화 키. v1엔 미사용. */
  TOSS_DECRYPT_KEY?: string;
  ENVIRONMENT?: "development" | "production";
}
