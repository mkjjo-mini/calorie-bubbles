/**
 * IAP 상품 정의 — 프론트·백엔드 공통 단일 진실 원천.
 *
 * App Store Connect 등록값 + RevenueCat entitlement와 1:1 일치해야 함.
 *   - 제품 ID:     App Store Connect "제품 ID" (변경 불가)
 *   - entitlement: RevenueCat 대시보드에서 정의한 식별자 (pro)
 *
 * PRD: products/tandanji-bubble/prd/v1-steps/step-13-iap-subscription.md §9
 *
 * 의존성 없음(순수) → webhook(서버)·purchases.ts(클라) 양쪽에서 import.
 */
import type { Tier } from "./entitlements";

/**
 * App Store Connect에 등록한 Pro 구독 상품 ID (= RevenueCat product identifier).
 * 레거시 basic_monthly/basic_annual은 제거됨 — 기존 basic 구독자는 FORCE_PRO_USERS로 Pro comp 처리.
 */
export const IAP_PRODUCTS = {
  PRO_MONTHLY: "pro_monthly",
  PRO_ANNUAL: "pro_annual",
} as const;

export type IapProductId = (typeof IAP_PRODUCTS)[keyof typeof IAP_PRODUCTS];

/** RevenueCat 대시보드에서 정의할 entitlement 식별자 (상품 → 권한) */
export const RC_ENTITLEMENTS = {
  PRO: "pro",
} as const;

/** 결제 주기 */
export type BillingPeriod = "monthly" | "annual";

/** 제품 ID → 유료 tier 매핑. 월/연 모두 같은 tier로 귀결. */
const PRODUCT_TIER: Record<string, Exclude<Tier, "free">> = {
  [IAP_PRODUCTS.PRO_MONTHLY]: "pro",
  [IAP_PRODUCTS.PRO_ANNUAL]: "pro",
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
  void tier; // 현재 유료 tier는 pro 하나 — 시그니처는 향후 확장 대비 유지
  return period === "annual" ? IAP_PRODUCTS.PRO_ANNUAL : IAP_PRODUCTS.PRO_MONTHLY;
}

/** 제품 ID → 사용자 표시명 (구독 관리 화면). 알 수 없으면 null. */
const PRODUCT_LABEL: Record<string, string> = {
  [IAP_PRODUCTS.PRO_MONTHLY]: "Pro · 월간",
  [IAP_PRODUCTS.PRO_ANNUAL]: "Pro · 연간",
};

export function productLabel(productId: string | null | undefined): string | null {
  if (!productId) return null;
  return PRODUCT_LABEL[productId] ?? null;
}
