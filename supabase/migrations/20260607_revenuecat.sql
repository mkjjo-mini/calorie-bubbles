-- ============================================================================
--  RevenueCat IAP 구독 연동 — 결제 원장 보강 + 이벤트 로그 + tier 동기화
--
--  PRD: products/tandanji-bubble/prd/v1-steps/step-13-iap-subscription.md
--
--  선행: 20260524_entitlements.sql (user_entitlements, user_subscriptions 생성)
--
--  본 마이그레이션이 채우는 빈칸:
--   1. user_subscriptions에 auto_renew · refund_count 컬럼 추가
--        - auto_renew:   CANCELLATION/RENEWAL 추적 (해지해도 expires_at까지 유지)
--        - refund_count: 환불 어뷰즈 차단 (PRD §5.4 — 3회 이상 시 결제 제한)
--   2. subscription_events — RevenueCat webhook 원장 (멱등성 + 운영 분석)
--   3. sync_entitlement_tier — user_subscriptions.tier → user_entitlements.tier 동기 트리거
--        (20260524 주석이 "webhook UPSERT → trigger 동기화"로 설계만 해둔 것을 구현)
--
--  실행: Supabase Dashboard → SQL Editor → 본 파일 전체 → Run
-- ============================================================================

-- ============================================================================
--  1. user_subscriptions 컬럼 보강
-- ============================================================================
ALTER TABLE public.user_subscriptions
  -- 자동 갱신 ON/OFF. CANCELLATION 시 false(즉시 강등 X, expires_at까지 Pro 유지).
  ADD COLUMN IF NOT EXISTS auto_renew   boolean,
  -- 환불 누적 횟수. REFUND 이벤트마다 +1. 3 이상이면 paywall에서 결제 차단(어뷰즈).
  ADD COLUMN IF NOT EXISTS refund_count integer NOT NULL DEFAULT 0;

-- ============================================================================
--  2. subscription_events — RevenueCat webhook 이벤트 원장
--      rc_event_id UNIQUE로 중복 webhook 멱등 처리(같은 이벤트 재전송 방지).
--      raw_payload는 디버깅·정합성 검증용 원본 보관.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  -- INITIAL_PURCHASE / RENEWAL / CANCELLATION / EXPIRATION /
  -- BILLING_ISSUE / PRODUCT_CHANGE / REFUND / TRANSFER / UNCANCELLATION ...
  event_type   text NOT NULL,
  product_id   text,
  store        text,              -- APP_STORE / PLAY_STORE
  amount_kr    integer,           -- 결제 금액(원). RevenueCat price * 환율 추정 또는 null
  rc_event_id  text UNIQUE,       -- RevenueCat event id — 중복 처리 방지 키
  raw_payload  jsonb,             -- webhook 원본 (정합성·디버깅)
  occurred_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_events_user_idx
  ON public.subscription_events (user_id, occurred_at DESC);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
-- 정책 없음 — service_role(서버 webhook)만 접근. 결제 이벤트는 클라 노출 X.

-- ============================================================================
--  3. sync_entitlement_tier — 결제 원장 → 권한 테이블 tier 동기화
--      user_subscriptions(진실의 출처)가 바뀌면 user_entitlements.tier를 맞춘다.
--      webhook이 user_subscriptions를 UPSERT하면 이 트리거가 자동 반영.
--      row가 없으면 생성(ON CONFLICT) — 모든 사용자 권한 row 보장.
--
--      ※ 런타임 getUserTier는 FORCE_PRO_USERS/FORCE_BASIC_USERS(env)를 먼저 보므로,
--        강제 tier 사용자는 이 동기화 결과와 무관하게 env가 우선한다(테스트 안전).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_entitlement_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_entitlements (user_id, tier)
  VALUES (NEW.user_id, NEW.tier)
  ON CONFLICT (user_id)
  DO UPDATE SET tier = EXCLUDED.tier, updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS user_subscriptions_sync_tier ON public.user_subscriptions;
CREATE TRIGGER user_subscriptions_sync_tier
  AFTER INSERT OR UPDATE OF tier ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_entitlement_tier();
