/**
 * RevenueCat 클라이언트 결제 래퍼 (iOS Capacitor 전용).
 *
 * 원격 URL 모드라 같은 번들이 웹·iOS WebView 모두에서 로드됨 → 모든 진입점에
 * isPurchaseSupported() 가드. 웹/SSR에서는 RevenueCat SDK를 import조차 하지 않도록
 * 동적 import 사용(네이티브 전용 모듈이 SSR 번들에 섞이지 않게).
 *
 * 사용 흐름:
 *   1. 앱 진입(로그인 후): initPurchases(userId, apiKey)  ← RevenueCat configure
 *   2. Paywall 결제 버튼:   purchaseTier("pro", "annual")
 *   3. 결제 성공:           subscription-status invalidate → tier 갱신
 *      (실제 tier 반영은 RevenueCat webhook → user_subscriptions → 트리거)
 *
 * PRD: products/tandanji-bubble/prd/v1-steps/step-13-iap-subscription.md §5.2
 */
import { Capacitor } from "@capacitor/core";
import type { Tier } from "@/lib/entitlements";
import { type BillingPeriod, type IapProductId, productIdFor } from "@/lib/iap-products";

/**
 * 결제 가능 여부.
 *  - 네이티브(iOS)이면서
 *  - RevenueCat 'Purchases' 플러그인이 실제로 등록돼 있을 때만 true.
 *
 * 원격 URL 모드라 cap sync 안 된 구버전 앱도 새 웹을 로드한다. 그 경우 플러그인이
 * 없어 isPluginAvailable=false → 결제 버튼 대신 "앱에서 결제" 안내로 안전 폴백.
 */
export function isPurchaseSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Purchases");
}

let configuredUser: string | null = null;

/** RevenueCat SDK 초기화. appUserID = Supabase user_id로 매핑(webhook의 app_user_id). */
export async function initPurchases(userId: string, apiKey: string): Promise<void> {
  if (!isPurchaseSupported() || !apiKey) return;
  if (configuredUser === userId) return; // 중복 configure 방지
  try {
    const { Purchases, LOG_LEVEL } = await import("@revenuecat/purchases-capacitor");
    await Purchases.setLogLevel({
      level: import.meta.env.DEV ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR,
    });
    await Purchases.configure({ apiKey, appUserID: userId });
    configuredUser = userId;
  } catch (e) {
    // 플러그인 미등록·configure 실패 — 앱 부팅을 막지 않고 조용히 skip(결제만 비활성).
    console.error("[purchases] init 실패", (e as Error).message);
  }
}

export type PurchaseStatus = "success" | "cancelled" | "unsupported" | "error";
export interface PurchaseResult {
  status: PurchaseStatus;
  message?: string;
}

/** 제품 ID로 결제. RevenueCat current offering에서 매칭 package 탐색 후 구매. */
export async function purchaseProduct(productId: IapProductId): Promise<PurchaseResult> {
  if (!isPurchaseSupported()) return { status: "unsupported" };
  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages.find(
      (p) => p.product.identifier === productId,
    );
    if (!pkg) {
      return { status: "error", message: `상품을 찾을 수 없어요 (${productId})` };
    }
    await Purchases.purchasePackage({ aPackage: pkg });
    return { status: "success" };
  } catch (e) {
    const err = e as { code?: string; userCancelled?: boolean; message?: string };
    // 사용자가 Apple 결제 시트에서 취소 — 에러 아님
    if (err.userCancelled || err.code === "PURCHASE_CANCELLED") {
      return { status: "cancelled" };
    }
    console.error("[purchases] 결제 실패", err.message);
    return { status: "error", message: err.message };
  }
}

/** (tier, period) 편의 래퍼 — PaywallModal plan 버튼용. */
export async function purchaseTier(
  tier: Exclude<Tier, "free">,
  period: BillingPeriod,
): Promise<PurchaseResult> {
  return purchaseProduct(productIdFor(tier, period));
}

/** 구매 복원 (기기 변경·재설치 후). 설정 화면 "구매 복원" 버튼용. */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (!isPurchaseSupported()) return { status: "unsupported" };
  try {
    const { Purchases } = await import("@revenuecat/purchases-capacitor");
    await Purchases.restorePurchases();
    return { status: "success" };
  } catch (e) {
    return { status: "error", message: (e as Error).message };
  }
}

/**
 * Apple 구독 관리 페이지 열기 (취소·플랜 변경).
 * IAP 구독은 앱에서 직접 취소 불가 — iOS 표준 구독 관리 딥링크로 위임(정책).
 * (RevenueCat Capacitor SDK엔 전용 메서드가 없어 Apple URL을 직접 연다)
 * 웹/미지원 환경에서는 false 반환 → 호출부가 "앱에서 관리" 안내.
 */
export function manageSubscriptions(): boolean {
  if (!isPurchaseSupported()) return false;
  try {
    // '_system' → Capacitor가 외부(App Store 앱)로 연다
    window.open("https://apps.apple.com/account/subscriptions", "_system");
    return true;
  } catch (e) {
    console.error("[purchases] 구독 관리 열기 실패", (e as Error).message);
    return false;
  }
}
