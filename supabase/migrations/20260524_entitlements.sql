-- ============================================================================
--  Entitlements — Free·Basic·Pro 3-tier 권한 시스템
--
--  PRD: products/tandanji-bubble/prd/v1-steps/step-17-entitlements.md
--
--  ⚠️ 본 프로젝트에는 public.users가 없다 (Supabase Auth만 사용). 그래서 PRD §6.1의
--      "ALTER TABLE users ADD COLUMN tier" 대신 별도 테이블 public.user_entitlements를
--      만든다. profile 데이터(user_profiles)와 권한 데이터를 섞지 않는 이점도 있음.
--
--  - public.user_entitlements:    한 사용자당 한 row. tier + ai 평생 사용량.
--  - public.user_subscriptions:   RevenueCat·IAP 결제 원장. tier의 source of truth.
--                                 webhook이 여기 UPSERT → trigger가 user_entitlements.tier 동기.
--  - increment_ai_lifetime_used:  원자적 카운터 증가 RPC.
--  - ensure_user_entitlements:    row 자동 생성 (idempotent UPSERT).
--
--  실행: Supabase Dashboard → SQL Editor → 본 파일 전체 → Run
-- ============================================================================

-- ============================================================================
--  1. user_entitlements — 사용자별 tier + AI 평생 카운터
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_entitlements (
  user_id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier                     text NOT NULL DEFAULT 'free' CHECK (tier IN ('free','basic','pro')),
  -- 계정당 평생 AI 무료 체험 사용량. monthly reset 없음.
  -- free/basic 사용자가 4회째부터 paywall (값 >= aiLifetimeFreeUses).
  -- pro 사용자도 카운트 증가하지만 paywall 적용 X (운영 분석용).
  ai_lifetime_used_count   integer NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_entitlements_tier_idx
  ON public.user_entitlements (tier);

ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;

-- 본인 row 읽기만 허용. UPDATE는 서비스(service_role)만 (결제·카운터는 서버 권한).
CREATE POLICY user_entitlements_owner_read ON public.user_entitlements
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
--  2. user_subscriptions — 결제 원장 (RevenueCat webhook 대상)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier              text NOT NULL CHECK (tier IN ('free','basic','pro')),
  -- 결제 출처. 'force_env'는 .env의 FORCE_PRO_USERS로 강제된 케이스(테스트·관리자).
  -- 'manual'은 운영자가 SQL로 부여한 케이스.
  source            text NOT NULL CHECK (source IN ('apple_iap','google_iap','force_env','manual')),
  started_at        timestamptz NOT NULL DEFAULT now(),
  -- 만료 시간 (구독 갱신 실패 후 grace period 끝). NULL = 영구 (manual·force_env).
  expires_at        timestamptz,
  rc_subscriber_id  text,
  rc_product_id     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_subscriptions_expires_idx
  ON public.user_subscriptions (expires_at);

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
-- 정책 없음 — service_role만 접근 (결제 원장은 절대 클라 노출 X).

-- ============================================================================
--  3. updated_at 트리거 (기존 touch_updated_at 재사용)
-- ============================================================================
CREATE TRIGGER user_entitlements_touch_updated_at
  BEFORE UPDATE ON public.user_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER user_subscriptions_touch_updated_at
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================================
--  4. ensure_user_entitlements — row 자동 생성 (idempotent).
--     첫 호출 시 free·0으로 INSERT, 이후 호출은 no-op.
--     백엔드의 getUserTier가 첫 진입 시 호출 → 모든 사용자 row 보장.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ensure_user_entitlements(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_entitlements (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END $$;

-- ============================================================================
--  5. increment_ai_lifetime_used — AI 분석 성공 시 호출.
--     UPSERT + RETURNING으로 race-safe.
--     (PRD §6.2의 RPC. 본 함수가 반환하는 값이 "이 호출 직후 누적 카운트")
-- ============================================================================
CREATE OR REPLACE FUNCTION public.increment_ai_lifetime_used(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO public.user_entitlements (user_id, ai_lifetime_used_count)
  VALUES (p_user_id, 1)
  ON CONFLICT (user_id)
  DO UPDATE SET
    ai_lifetime_used_count = public.user_entitlements.ai_lifetime_used_count + 1,
    updated_at = now()
  RETURNING ai_lifetime_used_count INTO new_count;
  RETURN new_count;
END $$;
