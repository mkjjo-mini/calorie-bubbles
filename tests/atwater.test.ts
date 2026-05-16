import { describe, it, expect } from "vitest";
import { MACRO_KCAL, caloriesFor } from "@/lib/foods";
import { kcalFromMacros } from "@/lib/customFoods";

describe("Atwater calorie calculation", () => {
  it("MACRO_KCAL constants match the Atwater system (4/4/9)", () => {
    expect(MACRO_KCAL.carbs).toBe(4);
    expect(MACRO_KCAL.protein).toBe(4);
    expect(MACRO_KCAL.fat).toBe(9);
  });

  it("caloriesFor: 밥 한공기 (탄68, 단5, 지0.5) ≈ 296.5 kcal", () => {
    expect(caloriesFor({ carbs: 68, protein: 5, fat: 0.5 })).toBeCloseTo(
      68 * 4 + 5 * 4 + 0.5 * 9,
      5,
    );
  });

  it("kcalFromMacros: 닭가슴살 100g (탄0, 단31, 지3.6) → round(4·0 + 4·31 + 9·3.6) = 156", () => {
    // 4*31 = 124, 9*3.6 = 32.4, total 156.4 → round 156
    expect(kcalFromMacros({ carbs: 0, protein: 31, fat: 3.6 })).toBe(156);
  });

  it("kcalFromMacros: 0 macros → 0 kcal", () => {
    expect(kcalFromMacros({ carbs: 0, protein: 0, fat: 0 })).toBe(0);
  });

  it("kcalFromMacros: 삼겹살 200g (탄0, 단40, 지60) = 4·0 + 4·40 + 9·60 = 700 kcal", () => {
    expect(kcalFromMacros({ carbs: 0, protein: 40, fat: 60 })).toBe(700);
  });

  it("kcalFromMacros rounds to nearest integer (Atwater fractional)", () => {
    // 4*0.6 + 4*6 + 9*5 = 2.4 + 24 + 45 = 71.4 → 71
    expect(kcalFromMacros({ carbs: 0.6, protein: 6, fat: 5 })).toBe(71);
  });
});
