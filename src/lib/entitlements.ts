/**
 * 탄단지버블 권한 시스템 — 프론트·백엔드 공통 단일 진실 원천.
 *
 * 새 기능 추가 절차:
 *  1. `Entitlements` 인터페이스에 필드 추가 → TypeScript exhaustive check가 3 tier 모두 강제.
 *  2. `ENTITLEMENTS` 매트릭스의 free/basic/pro 모두 값 채우기.
 *  3. 사용처:
 *     - 프론트: `useEntitlements().entitlements.X`
 *     - 백엔드: `getEntitlements(tier).X`
 *
 * 백엔드와 프론트가 같은 정의를 import → API 우회 차단 (프론트만 막으면 의미 없음).
 *
 * PRD: products/tandanji-bubble/prd/v1-steps/step-17-entitlements.md
 */

export type Tier = "free" | "basic" | "pro";

export interface Entitlements {
  /** 배너·전면 광고 노출 여부 */
  showAds: boolean;

  /**
   * AI 음식 추가 — 계정당 평생(lifetime) 무료 체험 횟수.
   * free/basic: 3 (4회째 paywall)
   * pro: Infinity (단 PER_USER_DAILY_LIMIT=50 abuse cap 별도 적용)
   */
  aiLifetimeFreeUses: number;

  /** pro만 true. UI에서 카운터/paywall skip 판정용 편의 플래그 */
  aiUnlimited: boolean;

  /** 활성(soft-delete 제외) 커스텀 음식 보유 한도 */
  customFoodActiveLimit: number;

  /** 오늘이 아닌 과거 날짜 food_logs 편집 허용 여부 */
  pastDateEditAllowed: boolean;

  /** 푸시 알림 설정 가능 여부 */
  pushNotifications: boolean;

  /** 목표 자동 추천 마법사 가능 여부 (수동 입력은 모든 tier 가능) */
  goalWizard: boolean;
}

const ENTITLEMENTS: Record<Tier, Entitlements> = {
  free: {
    showAds: true,
    aiLifetimeFreeUses: 3,
    aiUnlimited: false,
    customFoodActiveLimit: 3,
    pastDateEditAllowed: false,
    pushNotifications: false,
    goalWizard: false,
  },
  basic: {
    // Basic의 차별점: 광고 제거 + 내 음식 30개 보관 (Free 3개 → 10배).
    // 그 외 (AI·과거 편집·알림·마법사)는 Pro 가치로 보존.
    showAds: false,
    aiLifetimeFreeUses: 3,
    aiUnlimited: false,
    customFoodActiveLimit: 30,
    pastDateEditAllowed: false,
    pushNotifications: false,
    goalWizard: false,
  },
  pro: {
    showAds: false,
    aiLifetimeFreeUses: Number.POSITIVE_INFINITY,
    aiUnlimited: true,
    customFoodActiveLimit: Number.POSITIVE_INFINITY,
    pastDateEditAllowed: true,
    pushNotifications: true,
    goalWizard: true,
  },
};

export function getEntitlements(tier: Tier): Entitlements {
  return ENTITLEMENTS[tier];
}

/** 유효한 Tier 문자열인지 narrow */
export function isTier(v: unknown): v is Tier {
  return v === "free" || v === "basic" || v === "pro";
}
