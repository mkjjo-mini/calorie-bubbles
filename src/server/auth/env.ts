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
  /** Step 12 AI 음식 추가 — Google Gemini API key (https://aistudio.google.com) */
  GEMINI_API_KEY?: string;
  /**
   * Cloudflare AI Gateway 인증 토큰.
   * Gemini API를 직접 호출하면 Workers의 outbound IP가 region 제한에 걸려서
   * "User location is not supported" 에러 발생. AI Gateway 거치면 Cloudflare가
   * 적절한 region에서 호출 → 우회.
   * 발급: Cloudflare Dashboard → AI Gateway → tandanji-bubble-ai → Authentication
   */
  CF_AIG_TOKEN?: string;
  /**
   * Step 17 entitlements — 강제 Pro tier 사용자 ID 목록 (comma-separated).
   * RevenueCat 미연동 동안 본인·베타테스터 + 레거시 basic 구독자 Pro comp 적용.
   * 예: FORCE_PRO_USERS=uuid1,uuid2,uuid3
   */
  FORCE_PRO_USERS?: string;
  /**
   * Step 17 비상 스위치 — AI 기능 전체 차단.
   * "false" (문자열) → /api/ai-food/analyze가 503 응답.
   * 비용 폭주·Gemini 장애 시 wrangler secret put으로 즉시 토글.
   * 미설정 또는 "true" → AI 활성.
   */
  AI_FEATURE_ENABLED?: string;
  /**
   * Step 13 RevenueCat — webhook 인증.
   * RevenueCat 대시보드 → Integrations → Webhooks의 Authorization 헤더에 설정한
   * 값과 동일해야 함. 불일치 시 /api/revenuecat/webhook이 401.
   * 발급: 임의 시크릿 문자열 생성 후 RevenueCat·wrangler secret 양쪽에 동일 설정.
   */
  RC_WEBHOOK_AUTH_HEADER?: string;
  /**
   * Step 13 RevenueCat — iOS public API key (클라이언트 SDK configure용).
   * RevenueCat → Project → API keys → Apple App Store의 public key.
   * 클라 노출 OK (public key). VITE_ prefix로 빌드에 주입하거나 서버가 전달.
   */
  RC_PUBLIC_API_KEY_IOS?: string;
  /**
   * Cloudflare Workers AI binding — bge-m3 임베딩 (1024dim, 한국어 지원).
   * wrangler.jsonc `"ai": { "binding": "AI" }` 으로 주입.
   * 로컬 dev: wrangler dev 실행 시 자동 원격 AI 사용.
   */
  AI?: {
    run(
      model: string,
      input: Record<string, unknown>,
    ): Promise<{ data: number[][] } | Record<string, unknown>>;
  };
  /**
   * Cloudflare Vectorize — 식약처 식품영양성분 벡터 인덱스 (food-items).
   * wrangler.jsonc `"vectorize": [{ "binding": "FOOD_VECTORIZE", ... }]` 으로 주입.
   * 인덱스 생성: npx wrangler vectorize create food-items --dimensions=1024 --metric=cosine
   */
  FOOD_VECTORIZE?: {
    query(
      vector: number[],
      options: { topK?: number; returnMetadata?: "all" | "indexed" | "none" },
    ): Promise<{
      matches: Array<{
        id: string;
        score: number;
        metadata?: Record<string, unknown>;
      }>;
    }>;
    upsert(
      vectors: Array<{
        id: string;
        values: number[];
        metadata?: Record<string, unknown>;
      }>,
    ): Promise<{ count: number }>;
  };
}
