import { describe, it, expect } from "vitest";
import { buildBubbleTriple } from "@/lib/customFoods";

describe("buildBubbleTriple (Step 02 — foodLogId group consistency)", () => {
  const fixedSuffix = () => "abc1234";
  const T = 1_715_000_000_000; // pinned ms timestamp

  it("rice (탄68, 단5, 지0.5) → 3 entries with same foodLogId and meal_slot", () => {
    const entries = buildBubbleTriple({
      foodName: "밥 한공기",
      carbs: 68,
      protein: 5,
      fat: 0.5,
      addedAt: T,
      meal_slot: "lunch",
      randomSuffix: fixedSuffix,
    });
    expect(entries).toHaveLength(3);
    const ids = new Set(entries.map((e) => e.foodLogId));
    expect(ids.size).toBe(1);
    const slots = new Set(entries.map((e) => e.meal_slot));
    expect(slots).toEqual(new Set(["lunch"]));
    // suffix derived foodLogId
    expect(entries[0]?.foodLogId).toBe(`${T}-abc1234`);
    // macros mapped 1:1
    expect(entries.find((e) => e.macro === "carbs")?.grams).toBe(68);
    expect(entries.find((e) => e.macro === "protein")?.grams).toBe(5);
    expect(entries.find((e) => e.macro === "fat")?.grams).toBe(0.5);
  });

  it("skips zero-gram macros (no empty bubble) — 닭가슴살 100g has 0 carbs", () => {
    const entries = buildBubbleTriple({
      foodName: "닭가슴살",
      carbs: 0,
      protein: 31,
      fat: 3.6,
      addedAt: T,
      meal_slot: "dinner",
      randomSuffix: fixedSuffix,
    });
    expect(entries).toHaveLength(2);
    expect(entries.some((e) => e.macro === "carbs")).toBe(false);
    // remaining entries still share foodLogId
    expect(new Set(entries.map((e) => e.foodLogId)).size).toBe(1);
  });

  it("아메리카노 (탄2, 단0, 지0) → only 1 entry", () => {
    const entries = buildBubbleTriple({
      foodName: "아메리카노",
      carbs: 2,
      protein: 0,
      fat: 0,
      addedAt: T,
      meal_slot: "snack",
      randomSuffix: fixedSuffix,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.macro).toBe("carbs");
    expect(entries[0]?.grams).toBe(2);
  });

  it("all-zero macros → empty array", () => {
    const entries = buildBubbleTriple({
      foodName: "물",
      carbs: 0,
      protein: 0,
      fat: 0,
      addedAt: T,
      meal_slot: "snack",
      randomSuffix: fixedSuffix,
    });
    expect(entries).toEqual([]);
  });

  it("grams are rounded to 1 decimal place", () => {
    const entries = buildBubbleTriple({
      foodName: "test",
      carbs: 1.234567,
      protein: 2.789,
      fat: 0.04, // → 0.0 → skipped
      addedAt: T,
      meal_slot: "breakfast",
      randomSuffix: fixedSuffix,
    });
    expect(entries.find((e) => e.macro === "carbs")?.grams).toBe(1.2);
    expect(entries.find((e) => e.macro === "protein")?.grams).toBe(2.8);
    expect(entries.find((e) => e.macro === "fat")).toBeUndefined();
  });

  it("entry ids are stable and unique within the triple", () => {
    const entries = buildBubbleTriple({
      foodName: "밥",
      carbs: 10,
      protein: 10,
      fat: 10,
      addedAt: T,
      meal_slot: "breakfast",
      randomSuffix: fixedSuffix,
    });
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    // suffix index encoded
    expect(ids[0]?.endsWith("-0")).toBe(true);
    expect(ids[1]?.endsWith("-1")).toBe(true);
    expect(ids[2]?.endsWith("-2")).toBe(true);
  });
});
