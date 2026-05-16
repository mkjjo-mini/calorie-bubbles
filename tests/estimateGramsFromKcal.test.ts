import { describe, expect, it } from "vitest";
import {
  CATEGORY_KCAL_PER_GRAM,
  estimateGramsFromKcal,
} from "@/lib/customFoods";

describe("estimateGramsFromKcal", () => {
  it("snack_dessert: 325kcal ≈ 72g (칼로리바란스 76g 라벨과 근사)", () => {
    expect(estimateGramsFromKcal(325, "snack_dessert")).toBe(72);
  });

  it("meat_fish_egg: 165kcal ≈ 83g (닭가슴살 100g 라벨과 근사)", () => {
    expect(estimateGramsFromKcal(165, "meat_fish_egg")).toBe(83);
  });

  it("rice_grain_noodle: 305kcal ≈ 235g (밥 한공기 210g 근사)", () => {
    expect(estimateGramsFromKcal(305, "rice_grain_noodle")).toBe(235);
  });

  it("fruit: 90kcal ≈ 180g (바나나 100g 근사)", () => {
    expect(estimateGramsFromKcal(90, "fruit")).toBe(180);
  });

  it("vegetable_seaweed: 23kcal ≈ 77g (시금치 100g 근사)", () => {
    expect(estimateGramsFromKcal(23, "vegetable_seaweed")).toBe(77);
  });

  it("drink_alcohol: 100kcal ≈ 250g (콜라 약 250ml)", () => {
    expect(estimateGramsFromKcal(100, "drink_alcohol")).toBe(250);
  });

  it("other (default): 150kcal ≈ 100g", () => {
    expect(estimateGramsFromKcal(150, "other")).toBe(100);
  });

  it("rounds to integer", () => {
    const result = estimateGramsFromKcal(77, "rice_grain_noodle");
    expect(Number.isInteger(result)).toBe(true);
  });

  it("returns 0 for 0 kcal", () => {
    expect(estimateGramsFromKcal(0, "other")).toBe(0);
  });

  it("CATEGORY_KCAL_PER_GRAM has entry for every FoodCategory", () => {
    const keys = Object.keys(CATEGORY_KCAL_PER_GRAM);
    expect(keys).toEqual(
      expect.arrayContaining([
        "rice_grain_noodle",
        "meat_fish_egg",
        "dairy",
        "vegetable_seaweed",
        "fruit",
        "snack_dessert",
        "drink_alcohol",
        "other",
      ]),
    );
    expect(keys).toHaveLength(8);
  });

  it("all densities are positive", () => {
    for (const v of Object.values(CATEGORY_KCAL_PER_GRAM)) {
      expect(v).toBeGreaterThan(0);
    }
  });
});
