/**
 * IAP 상품 정의 — 프론트·백엔드 공통 단일 진실 원천.
 *
 * App Store Connect 등록값 + RevenueCat entitlement와 1:1 일치해야 함.
 *   - 제품 ID:     App Store Connect "제품 ID" (변경 불가)
 *   - entitlement: RevenueCat 대시보드에서 정의한 식별자 (pro / basic)
 *
 * PRD: products/tandanji-bubble/prd/v1-steps/step-13-iap-subscription.md §9
 *
 * 의존성 없음(순수) → webhook(서버)·purchases.ts(클라) 양쪽에서 import.
 */
import type { Tier } from "./entitlements";

/** App Store Connect에 등록한 4개 구독 상품 ID (= RevenueCat product identifier) */
export const IAP_PRODUCTS = {
  PRO_MONTHLY: "pro_monthly",
  PRO_ANNUAL: "pro_annual",
  BASIC_MONTHLY: "basic_monthly",
  BASIC_ANNUAL: "basic_annual",
} as const;

export type IapProductId = (typeof IAP_PRODUCTS)[keyof typeof IAP_PRODUCTS];

/** RevenueCat 대시보드에서 정의할 entitlement 식별자 (상품 → 권한) */
export const RC_ENTITLEMENTS = {
  PRO: "pro",
  BASIC: "basic",
} as const;

/** 결제 주기 */
export type BillingPeriod = "monthly" | "annual";

/** 제품 ID → 유료 tier 매핑. 월/연 모두 같은 tier로 귀결. */
const PRODUCT_TIER: Record<string, Exclude<Tier, "free">> = {
  [IAP_PRODUCTS.PRO_MONTHLY]: "pro",
  [IAP_PRODUCTS.PRO_ANNUAL]: "pro",
  [IAP_PRODUCTS.BASIC_MONTHLY]: "basic",
  [IAP_PRODUCTS.BASIC_ANNUAL]: "basic",
};

/**
 * 제품 ID로부터 부여할 tier 결정.
 * 알 수 없는 상품이면 null (webhook이 "원장 변경 없이 로그만" 처리하도록).
 */
export function productIdToTier(productId: string | null | undefined): Exclude<Tier, "free"> | null {
  if (!productId) return null;
  return PRODUCT_TIER[productId] ?? null;
}

/** (tier, period) → 제품 ID. PaywallModal의 plan 버튼이 사용. */
export function productIdFor(tier: Exclude<Tier, "free">, period: BillingPeriod): IapProductId {
  if (tier === "pro") {
    return period === "annual" ? IAP_PRODUCTS.PRO_ANNUAL : IAP_PRODUCTS.PRO_MONTHLY;
  }
  return period === "annual" ? IAP_PRODUCTS.BASIC_ANNUAL : IAP_PRODUCTS.BASIC_MONTHLY;
}
