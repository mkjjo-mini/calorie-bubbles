/**
 * RevenueCat webhook 이벤트 → 구독 원장(user_subscriptions) 변경 결정.
 *
 * 순수 함수 — DB·네트워크 의존 없음 → 단위 테스트 대상(tests/revenuecatEvents.test.ts).
 * 실제 DB 반영은 revenuecat-webhook.ts가 이 결과를 받아 수행.
 *
 * PRD: products/tandanji-bubble/prd/v1-steps/step-13-iap-subscription.md §5.3
 *
 * 이벤트 타입 레퍼런스: https://www.revenuecat.com/docs/webhooks/event-types-and-fields
 */
import type { Tier } from "@/lib/entitlements";
import { productIdToTier } from "@/lib/iap-products";

/** RevenueCat webhook payload의 `event` 객체 (필요 필드만) */
export interface RcEvent {
  /** INITIAL_PURCHASE / RENEWAL / CANCELLATION / EXPIRATION / BILLING_ISSUE /
   *  PRODUCT_CHANGE / REFUND / TRANSFER / UNCANCELLATION / SUBSCRIPTION_EXTENDED / TEST ... */
  type: string;
  /** RevenueCat 고유 이벤트 ID — 멱등 처리 키 */
  id: string;
  /** Purchases.configure(appUserID)로 넘긴 값 = Supabase user_id */
  app_user_id: string;
  /** 활성/대상 상품 ID */
  product_id?: string | null;
  /** APP_STORE / PLAY_STORE */
  store?: string | null;
  /** 구독 만료(또는 갱신 예정) 시각 (epoch ms) */
  expiration_at_ms?: number | null;
  /** 구매 통화 기준 금액 (KRW면 원 단위) */
  price_in_purchased_currency?: number | null;
  currency?: string | null;
}

/** webhook이 user_subscriptions에 반영할 변경 사항 */
export interface SubscriptionUpdate {
  /** false면 원장 변경 없이 subscription_events 로그만 남김 (TRANSFER/TEST/미지원 상품) */
  applyLedger: boolean;
  userId: string;
  /** 적용할 tier. 'free' = 강등(만료/환불) */
  tier: Tier;
  /** 자동 갱신 ON/OFF. null = 변경하지 않음(현행 유지) */
  autoRenew: boolean | null;
  /** 만료 시각 ISO. null = 비움(강등) 또는 미상 */
  expiresAt: string | null;
  productId: string | null;
  /** refund_count 증가량 (REFUND=1, 그 외 0) */
  refundDelta: number;
}

/** 결제 성공/유지로 "활성 권한 부여" 그룹 */
const GRANT_ACTIVE = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
]);

function msToIso(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  return new Date(ms).toISOString();
}

/** KRW 결제만 원 단위 정수로 환산(분석용). 그 외 통화는 null. */
function amountKr(event: RcEvent): number | null {
  if (event.currency === "KRW" && typeof event.price_in_purchased_currency === "number") {
    return Math.round(event.price_in_purchased_currency);
  }
  return null;
}

/**
 * 이벤트 → 원장 변경 결정.
 *
 *  REFUND        : 즉시 free 강등 + refund_count++ (어뷰즈 추적)
 *  EXPIRATION    : 즉시 free 강등
 *  CANCELLATION  : 강등 X — auto_renew=false만. expires_at까지 Pro 유지
 *  BILLING_ISSUE : 강등 X — grace period 동안 현 tier 유지
 *  GRANT_ACTIVE  : product → tier 부여 + auto_renew=true
 *  그 외(TRANSFER/TEST/미지원): 로그만
 */
export function resolveRcEvent(event: RcEvent): SubscriptionUpdate {
  const base = {
    userId: event.app_user_id,
    productId: event.product_id ?? null,
    expiresAt: msToIso(event.expiration_at_ms),
  };
  const tierFromProduct = productIdToTier(event.product_id);

  switch (event.type) {
    case "REFUND":
      return {
        ...base,
        applyLedger: true,
        tier: "free",
        autoRenew: false,
        expiresAt: null,
        refundDelta: 1,
      };

    case "EXPIRATION":
      return {
        ...base,
        applyLedger: true,
        tier: "free",
        autoRenew: false,
        expiresAt: null,
        refundDelta: 0,
      };

    case "CANCELLATION":
      // 해지 예약 — 즉시 강등하지 않는다. 만료일까지 권한 유지.
      return {
        ...base,
        applyLedger: tierFromProduct != null,
        tier: tierFromProduct ?? "free",
        autoRenew: false,
        refundDelta: 0,
      };

    case "BILLING_ISSUE":
      // grace period — 결제 재시도 동안 현 tier 유지(강등 X).
      return {
        ...base,
        applyLedger: tierFromProduct != null,
        tier: tierFromProduct ?? "free",
        autoRenew: null,
        refundDelta: 0,
      };

    default:
      if (GRANT_ACTIVE.has(event.type) && tierFromProduct != null) {
        return {
          ...base,
          applyLedger: true,
          tier: tierFromProduct,
          autoRenew: true,
          refundDelta: 0,
        };
      }
      // TRANSFER / TEST / 알 수 없는 상품 → 이벤트 로그만, 원장 미변경.
      return {
        ...base,
        applyLedger: false,
        tier: "free",
        autoRenew: null,
        refundDelta: 0,
      };
  }
}

export { amountKr };
