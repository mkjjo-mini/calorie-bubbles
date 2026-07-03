/**
 * Step 13 — RevenueCat 이벤트 → 구독 원장 변경 로직 검증.
 *
 * PRD: products/tandanji-bubble/prd/v1-steps/step-13-iap-subscription.md §5.3
 *  - REFUND/EXPIRATION → free 강등
 *  - CANCELLATION/BILLING_ISSUE → 강등 X (만료일·grace까지 유지)
 *  - INITIAL_PURCHASE/RENEWAL → product 기반 tier 부여
 *  - TRANSFER/TEST/미지원 상품 → 로그만(applyLedger=false)
 */
import { describe, expect, it } from "vitest";
import { productIdFor, productIdToTier } from "../src/lib/iap-products";
import { resolveRcEvent, type RcEvent } from "../src/server/api/revenuecat-events";

const EXP_MS = 1_800_000_000_000; // 고정 timestamp (결정적 테스트)

function ev(partial: Partial<RcEvent> & { type: string }): RcEvent {
  return {
    id: "evt_1",
    app_user_id: "user_1",
    product_id: "pro_annual",
    store: "APP_STORE",
    expiration_at_ms: EXP_MS,
    ...partial,
  };
}

describe("productIdToTier", () => {
  it("pro 상품은 pro", () => {
    expect(productIdToTier("pro_monthly")).toBe("pro");
    expect(productIdToTier("pro_annual")).toBe("pro");
  });
  it("레거시 basic 상품은 null (더 이상 매핑 없음)", () => {
    expect(productIdToTier("basic_monthly")).toBeNull();
    expect(productIdToTier("basic_annual")).toBeNull();
  });
  it("알 수 없는/빈 상품은 null", () => {
    expect(productIdToTier("unknown")).toBeNull();
    expect(productIdToTier(null)).toBeNull();
    expect(productIdToTier(undefined)).toBeNull();
  });
});

describe("productIdFor", () => {
  it("(tier, period) → 제품 ID", () => {
    expect(productIdFor("pro", "monthly")).toBe("pro_monthly");
    expect(productIdFor("pro", "annual")).toBe("pro_annual");
  });
});

describe("resolveRcEvent", () => {
  it("INITIAL_PURCHASE: product tier 부여 + auto_renew on + 만료일", () => {
    const u = resolveRcEvent(ev({ type: "INITIAL_PURCHASE", product_id: "pro_annual" }));
    expect(u).toMatchObject({
      applyLedger: true,
      tier: "pro",
      autoRenew: true,
      productId: "pro_annual",
      refundDelta: 0,
    });
    expect(u.expiresAt).toBe(new Date(EXP_MS).toISOString());
  });

  it("RENEWAL: pro 상품이면 pro 유지", () => {
    const u = resolveRcEvent(ev({ type: "RENEWAL", product_id: "pro_monthly" }));
    expect(u).toMatchObject({ applyLedger: true, tier: "pro", autoRenew: true });
  });

  it("RENEWAL: 레거시 basic 상품은 원장 미변경 (매핑 없음 → 기존 tier 보존)", () => {
    const u = resolveRcEvent(ev({ type: "RENEWAL", product_id: "basic_monthly" }));
    expect(u.applyLedger).toBe(false);
  });

  it("REFUND: 즉시 free 강등 + refundDelta 1", () => {
    const u = resolveRcEvent(ev({ type: "REFUND" }));
    expect(u).toMatchObject({
      applyLedger: true,
      tier: "free",
      autoRenew: false,
      expiresAt: null,
      refundDelta: 1,
    });
  });

  it("EXPIRATION: free 강등", () => {
    const u = resolveRcEvent(ev({ type: "EXPIRATION" }));
    expect(u).toMatchObject({ applyLedger: true, tier: "free", autoRenew: false, refundDelta: 0 });
    expect(u.expiresAt).toBeNull();
  });

  it("CANCELLATION: 강등하지 않고 auto_renew만 off (만료일까지 유지)", () => {
    const u = resolveRcEvent(ev({ type: "CANCELLATION", product_id: "pro_monthly" }));
    expect(u).toMatchObject({ applyLedger: true, tier: "pro", autoRenew: false });
    // 만료일 보존 — 즉시 강등 아님
    expect(u.expiresAt).toBe(new Date(EXP_MS).toISOString());
  });

  it("BILLING_ISSUE: grace 동안 tier 유지, auto_renew 미변경(null)", () => {
    const u = resolveRcEvent(ev({ type: "BILLING_ISSUE", product_id: "pro_annual" }));
    expect(u).toMatchObject({ applyLedger: true, tier: "pro", autoRenew: null });
  });

  it("PRODUCT_CHANGE: 바뀐 상품 tier 적용", () => {
    const u = resolveRcEvent(ev({ type: "PRODUCT_CHANGE", product_id: "pro_annual" }));
    expect(u).toMatchObject({ applyLedger: true, tier: "pro", autoRenew: true });
  });

  it("TRANSFER: 원장 미변경(로그만)", () => {
    const u = resolveRcEvent(ev({ type: "TRANSFER" }));
    expect(u.applyLedger).toBe(false);
  });

  it("TEST: 원장 미변경", () => {
    const u = resolveRcEvent(ev({ type: "TEST" }));
    expect(u.applyLedger).toBe(false);
  });

  it("미지원 상품의 활성 이벤트: 원장 미변경(잘못 부여 방지)", () => {
    const u = resolveRcEvent(ev({ type: "INITIAL_PURCHASE", product_id: "lifetime_xyz" }));
    expect(u.applyLedger).toBe(false);
  });

  it("app_user_id를 userId로 전달", () => {
    const u = resolveRcEvent(ev({ type: "RENEWAL", app_user_id: "abc-123" }));
    expect(u.userId).toBe("abc-123");
  });
});
