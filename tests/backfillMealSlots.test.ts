import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { backfillMealSlots } from "@/lib/customFoods";
import type { BubbleEntry } from "@/lib/foods";

// Helper: KST wall-clock → absolute ms (UTC+9, no DST)
function kstTs(hour: number, minute = 0): number {
  return Date.UTC(2026, 4, 16, hour - 9, minute);
}

describe("backfillMealSlots — Step 02 legacy meal_slot persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(kstTs(12, 0)));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("entries without meal_slot are inferred from addedAt", () => {
    const entries: BubbleEntry[] = [
      {
        id: "a",
        foodLogId: "log-1",
        macro: "carbs",
        grams: 30,
        foodName: "토스트",
        addedAt: kstTs(8, 0), // breakfast
      },
      {
        id: "b",
        foodLogId: "log-2",
        macro: "protein",
        grams: 20,
        foodName: "닭가슴살",
        addedAt: kstTs(13, 30), // lunch
      },
    ];
    const { entries: next, mutated } = backfillMealSlots(entries);
    expect(mutated).toBe(true);
    expect(next[0]?.meal_slot).toBe("breakfast");
    expect(next[1]?.meal_slot).toBe("lunch");
  });

  it("entries with existing meal_slot are not touched (mutated=false)", () => {
    const entries: BubbleEntry[] = [
      {
        id: "a",
        foodLogId: "log-1",
        macro: "carbs",
        grams: 30,
        foodName: "토스트",
        addedAt: kstTs(8, 0),
        meal_slot: "snack", // user-corrected to snack
      },
    ];
    const { entries: next, mutated } = backfillMealSlots(entries);
    expect(mutated).toBe(false);
    expect(next[0]?.meal_slot).toBe("snack"); // preserved, NOT re-inferred
  });

  it("mixed list: only legacy entries marked mutated", () => {
    const entries: BubbleEntry[] = [
      {
        id: "a",
        foodLogId: "l1",
        macro: "carbs",
        grams: 10,
        foodName: "rice",
        addedAt: kstTs(8, 0),
        meal_slot: "breakfast",
      },
      {
        id: "b",
        foodLogId: "l2",
        macro: "fat",
        grams: 5,
        foodName: "egg",
        addedAt: kstTs(22, 0), // → snack
      },
    ];
    const { entries: next, mutated } = backfillMealSlots(entries);
    expect(mutated).toBe(true);
    expect(next[0]?.meal_slot).toBe("breakfast");
    expect(next[1]?.meal_slot).toBe("snack");
  });

  it("empty list → mutated=false", () => {
    const { entries: next, mutated } = backfillMealSlots([]);
    expect(mutated).toBe(false);
    expect(next).toEqual([]);
  });

  it("returns NEW entry objects (immutability) when backfilling", () => {
    const original: BubbleEntry = {
      id: "a",
      foodLogId: "log-1",
      macro: "carbs",
      grams: 30,
      foodName: "토스트",
      addedAt: kstTs(8, 0),
    };
    const { entries: next } = backfillMealSlots([original]);
    expect(next[0]).not.toBe(original); // new reference
    expect(original.meal_slot).toBeUndefined(); // input untouched
  });
});
