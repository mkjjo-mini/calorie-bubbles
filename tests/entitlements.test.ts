/**
 * Step 17 — Entitlements 매트릭스 검증 (PRD §11.1).
 *
 * 새 기능 추가 시 각 tier 값 채우는지 TypeScript exhaustive check가 1차 방어,
 * 본 테스트가 의미적 정합성(예: pro의 aiUnlimited=true) 2차 방어.
 */
import { describe, expect, it } from "vitest";
import { getEntitlements, isTier, type Tier } from "../src/lib/entitlements";

const TIERS: Tier[] = ["free", "pro"];

describe("getEntitlements", () => {
  it("모든 tier 정의되어 있다", () => {
    for (const tier of TIERS) {
      const ent = getEntitlements(tier);
      expect(ent).toBeDefined();
      expect(typeof ent.showAds).toBe("boolean");
      expect(typeof ent.aiUnlimited).toBe("boolean");
      expect(typeof ent.aiLifetimeFreeUses).toBe("number");
    }
  });

  it("free: 광고 비활성 + AI 체험 3회 + 한도 있음", () => {
    const ent = getEntitlements("free");
    expect(ent.showAds).toBe(false); // 광고 전면 비활성 (코드는 보존)
    expect(ent.aiUnlimited).toBe(false);
    expect(ent.aiLifetimeFreeUses).toBe(3);
    expect(ent.customFoodActiveLimit).toBe(3);
    expect(ent.pastDateEditAllowed).toBe(false);
    expect(ent.pushNotifications).toBe(false);
    expect(ent.goalWizard).toBe(false);
  });

  it("pro: 모든 고급 기능 해제 + AI 무제한", () => {
    const ent = getEntitlements("pro");
    expect(ent.showAds).toBe(false);
    expect(ent.aiUnlimited).toBe(true);
    expect(ent.aiLifetimeFreeUses).toBe(Number.POSITIVE_INFINITY);
    expect(ent.customFoodActiveLimit).toBe(Number.POSITIVE_INFINITY);
    expect(ent.pastDateEditAllowed).toBe(true);
    expect(ent.pushNotifications).toBe(true);
    expect(ent.goalWizard).toBe(true);
  });

  it("aiUnlimited 플래그는 aiLifetimeFreeUses=Infinity와 일치한다", () => {
    for (const tier of TIERS) {
      const ent = getEntitlements(tier);
      expect(ent.aiUnlimited).toBe(ent.aiLifetimeFreeUses === Number.POSITIVE_INFINITY);
    }
  });
});

describe("isTier", () => {
  it("유효한 tier 문자열만 통과", () => {
    expect(isTier("free")).toBe(true);
    expect(isTier("pro")).toBe(true);
    expect(isTier("basic")).toBe(false); // 레거시 제거 — 더 이상 유효하지 않음
    expect(isTier("FREE")).toBe(false);
    expect(isTier("premium")).toBe(false);
    expect(isTier(null)).toBe(false);
    expect(isTier(undefined)).toBe(false);
    expect(isTier(0)).toBe(false);
  });
});
