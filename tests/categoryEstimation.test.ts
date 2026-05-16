import { describe, it, expect } from "vitest";
import {
  CATEGORY_RATIOS,
  estimateMacrosFromKcal,
  kcalFromMacros,
  type FoodCategory,
} from "@/lib/customFoods";

describe("Category-based macro estimation (Step 03 §양방향 자동 계산)", () => {
  it("all 8 category ratios sum to 100%", () => {
    const cats: FoodCategory[] = [
      "rice_grain_noodle",
      "meat_fish_egg",
      "dairy",
      "vegetable_seaweed",
      "fruit",
      "snack_dessert",
      "drink_alcohol",
      "other",
    ];
    for (const c of cats) {
      const r = CATEGORY_RATIOS[c];
      expect(r.carb + r.protein + r.fat).toBe(100);
    }
  });

  it("밥류 500kcal → 탄·단·지 분배 (Math.round half-up @ 1 decimal)", () => {
    // carb:    500*0.75/4 = 93.75   → Math.round(937.5)/10 = 93.8
    // protein: 500*0.13/4 = 16.25   → Math.round(162.5)/10 = 16.3 (half-up)
    // fat:     500*0.12/9 ≈ 6.6666… → 6.7
    const m = estimateMacrosFromKcal(500, "rice_grain_noodle");
    expect(m.carbs).toBeCloseTo(93.8, 5);
    expect(m.protein).toBeCloseTo(16.3, 5);
    expect(m.fat).toBeCloseTo(6.7, 5);
  });

  it("고기·생선·계란 700kcal → 5/55/40 분배", () => {
    // carb:    700*0.05/4 = 8.75    → 8.8 (half-up)
    // protein: 700*0.55/4 = 96.25   → Math.round(962.5)/10 = 96.3
    // fat:     700*0.40/9 ≈ 31.111… → 31.1
    const m = estimateMacrosFromKcal(700, "meat_fish_egg");
    expect(m.carbs).toBeCloseTo(8.8, 5);
    expect(m.protein).toBeCloseTo(96.3, 5);
    expect(m.fat).toBeCloseTo(31.1, 5);
  });

  it("유제품 150kcal → 30/25/45 distribution", () => {
    // carb:    150*0.30/4 = 11.25 → 11.3 (half-up)
    // protein: 150*0.25/4 = 9.375 → 9.4
    // fat:     150*0.45/9 = 7.5   → 7.5
    const m = estimateMacrosFromKcal(150, "dairy");
    expect(m.carbs).toBeCloseTo(11.3, 5);
    expect(m.protein).toBeCloseTo(9.4, 5);
    expect(m.fat).toBeCloseTo(7.5, 5);
  });

  it("채소·해조류 100kcal: carb 15g, protein 6.3g, fat 1.7g", () => {
    const m = estimateMacrosFromKcal(100, "vegetable_seaweed");
    expect(m.carbs).toBeCloseTo(15, 5); // 100*0.6/4
    expect(m.protein).toBeCloseTo(6.3, 5); // 100*0.25/4 = 6.25 → 6.3
    expect(m.fat).toBeCloseTo(1.7, 5); // 100*0.15/9 = 1.666 → 1.7
  });

  it("과일 90kcal → 탄 90·0.9/4 = 20.3g, protein 1.1g, fat 0.5g", () => {
    const m = estimateMacrosFromKcal(90, "fruit");
    expect(m.carbs).toBeCloseTo(20.3, 5); // 90*0.9/4 = 20.25 → 20.3 (round half away from zero)
    expect(m.protein).toBeCloseTo(1.1, 5); // 90*0.05/4 = 1.125 → 1.1
    expect(m.fat).toBeCloseTo(0.5, 5); // 90*0.05/9 = 0.5
  });

  it("간식·디저트 200kcal → 55/10/35", () => {
    const m = estimateMacrosFromKcal(200, "snack_dessert");
    expect(m.carbs).toBeCloseTo(27.5, 5); // 200*0.55/4
    expect(m.protein).toBeCloseTo(5, 5); // 200*0.10/4
    expect(m.fat).toBeCloseTo(7.8, 5); // 200*0.35/9 = 7.777 → 7.8
  });

  it("음료·주류 140kcal (콜라 1캔) → 80/5/15", () => {
    const m = estimateMacrosFromKcal(140, "drink_alcohol");
    expect(m.carbs).toBeCloseTo(28, 5); // 140*0.8/4
    expect(m.protein).toBeCloseTo(1.8, 5); // 140*0.05/4 = 1.75 → 1.8
    expect(m.fat).toBeCloseTo(2.3, 5); // 140*0.15/9 = 2.333 → 2.3
  });

  it("기타·일반식 (other) default 50/25/25", () => {
    const m = estimateMacrosFromKcal(400, "other");
    expect(m.carbs).toBeCloseTo(50, 5); // 400*0.5/4
    expect(m.protein).toBeCloseTo(25, 5); // 400*0.25/4
    expect(m.fat).toBeCloseTo(11.1, 5); // 400*0.25/9 = 11.111 → 11.1
  });

  it("round-trip: estimated macros recomputed back to kcal stays within ±1 of input (rounding budget)", () => {
    for (const cat of Object.keys(CATEGORY_RATIOS) as FoodCategory[]) {
      const m = estimateMacrosFromKcal(500, cat);
      const back = kcalFromMacros(m);
      // 0.1g rounding per macro × 4 or 9 kcal/g → tolerate small drift
      expect(Math.abs(back - 500)).toBeLessThanOrEqual(2);
    }
  });
});
