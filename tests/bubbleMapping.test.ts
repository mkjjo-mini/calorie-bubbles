import { describe, it, expect } from "vitest";
import { logsToBubbles, sumMacroTotals } from "@/lib/bubbleMapping";
import { kcalBubbleColor } from "@/lib/kcalPalette";
import type { FoodLogRow } from "@/lib/repository/types";

// 최소 FoodLogRow 픽스처 (테스트에 필요한 필드만)
function log(partial: Partial<FoodLogRow>): FoodLogRow {
  return {
    id: "log1",
    food_id: "f1",
    carb_g: 0,
    protein_g: 0,
    fat_g: 0,
    meal_slot: "lunch",
    created_at: "2026-07-03T00:00:00.000Z",
    food: { name: "테스트" },
    ...(partial as FoodLogRow),
  } as FoodLogRow;
}

describe("logsToBubbles — macro 모드(기존 동작)", () => {
  it("탄단지 있는 음식 → 매크로별 엔트리, 같은 foodLogId", () => {
    const entries = logsToBubbles(
      [log({ id: "L", carb_g: 68, protein_g: 5, fat_g: 0.5, food: { name: "밥" } })],
      "macro",
    );
    expect(entries).toHaveLength(3);
    expect(new Set(entries.map((e) => e.foodLogId))).toEqual(new Set(["L"]));
    expect(entries.every((e) => e.color === undefined)).toBe(true);
  });

  it("0칼로리 음식 → placeholder 1개(grams 0, 색 없음)", () => {
    const entries = logsToBubbles([log({ id: "W", food: { name: "물" } })], "macro");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.grams).toBe(0);
    expect(entries[0]?.foodLogId).toBe("W");
    expect(entries[0]?.color).toBeUndefined();
  });
});

describe("logsToBubbles — kcal 모드", () => {
  it("음식 1개 → 엔트리 1개, sizeKcal=총칼로리, 색은 팔레트", () => {
    const entries = logsToBubbles(
      [log({ id: "R", carb_g: 68, protein_g: 5, fat_g: 0.5, food: { name: "밥" } })],
      "kcal",
    );
    expect(entries).toHaveLength(1);
    // 68*4 + 5*4 + 0.5*9 = 296.5
    expect(entries[0]?.sizeKcal).toBeCloseTo(296.5, 5);
    expect(entries[0]?.color).toBe(kcalBubbleColor("밥"));
    expect(entries[0]?.textColor).toBeDefined();
    expect(entries[0]?.foodLogId).toBe("R");
  });

  it("같은 음식 이름 두 로그 → 같은 색", () => {
    const entries = logsToBubbles(
      [
        log({ id: "A", carb_g: 10, food: { name: "사과" } }),
        log({ id: "B", carb_g: 20, food: { name: "사과" } }),
      ],
      "kcal",
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]?.color).toBe(entries[1]?.color);
  });

  it("0칼로리 음식 → placeholder 1개(grams 0, 색·sizeKcal 없음)", () => {
    const entries = logsToBubbles([log({ id: "W", food: { name: "물" } })], "kcal");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.grams).toBe(0);
    expect(entries[0]?.sizeKcal).toBeUndefined();
    expect(entries[0]?.color).toBeUndefined();
  });
});

describe("sumMacroTotals", () => {
  it("여러 로그의 매크로를 합산(모드 무관)", () => {
    const totals = sumMacroTotals([
      log({ id: "A", carb_g: 68, protein_g: 5, fat_g: 0.5 }),
      log({ id: "B", carb_g: 10, protein_g: 20, fat_g: 3 }),
    ]);
    expect(totals).toEqual({ carbs: 78, protein: 25, fat: 3.5 });
  });

  it("빈 배열 → 모두 0", () => {
    expect(sumMacroTotals([])).toEqual({ carbs: 0, protein: 0, fat: 0 });
  });
});
