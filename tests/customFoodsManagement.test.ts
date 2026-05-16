import { describe, it, expect } from "vitest";
import {
  prependCustomFood,
  recomputeEstimatedFlag,
  type CustomFood,
} from "@/lib/customFoods";

function makeFood(over: Partial<CustomFood> = {}): CustomFood {
  return {
    id: "id-1",
    name: "편의점 김밥",
    serving_unit: "봉",
    serving_amount: 1,
    serving_g: 230,
    kcal: 480,
    carb_g: 60,
    protein_g: 10,
    fat_g: 8,
    is_estimated: false,
    category: undefined,
    created_at: 1_700_000_000_000,
    updated_at: 1_700_000_000_000,
    ...over,
  };
}

describe("customFoods management", () => {
  it("prependCustomFood pushes new entry at index 0", () => {
    const existing = [makeFood({ id: "a", name: "당근 스무디" })];
    const next = makeFood({ id: "b", name: "프로틴쉐이크" });
    const result = prependCustomFood(existing, next);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("b");
    expect(result[1]?.id).toBe("a");
  });

  it("prependCustomFood dedupes by name (case-insensitive); newer wins", () => {
    const existing = [
      makeFood({ id: "a", name: "당근 스무디" }),
      makeFood({ id: "b", name: "편의점 김밥" }),
    ];
    const next = makeFood({ id: "c", name: "편의점 김밥", kcal: 999 });
    const result = prependCustomFood(existing, next);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("c");
    expect(result[0]?.kcal).toBe(999);
    // older "편의점 김밥" removed
    expect(result.find((f) => f.id === "b")).toBeUndefined();
    // unrelated entry untouched
    expect(result[1]?.id).toBe("a");
  });

  it("prependCustomFood dedupes ignoring case", () => {
    const existing = [makeFood({ id: "a", name: "Salad bowl" })];
    const next = makeFood({ id: "b", name: "SALAD BOWL" });
    const result = prependCustomFood(existing, next);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("b");
  });

  it("prependCustomFood into empty list", () => {
    const next = makeFood();
    expect(prependCustomFood([], next)).toEqual([next]);
  });

  it("recomputeEstimatedFlag: manualOverride=false → unchanged", () => {
    const f = makeFood({ is_estimated: true });
    expect(recomputeEstimatedFlag(f, false)).toBe(f);
  });

  it("recomputeEstimatedFlag: manualOverride=true flips is_estimated to false", () => {
    const f = makeFood({ is_estimated: true });
    const next = recomputeEstimatedFlag(f, true);
    expect(next.is_estimated).toBe(false);
    expect(next).not.toBe(f); // immutability
    // identity of other fields preserved
    expect(next.id).toBe(f.id);
    expect(next.name).toBe(f.name);
  });

  it("recomputeEstimatedFlag: idempotent when already false", () => {
    const f = makeFood({ is_estimated: false });
    const next = recomputeEstimatedFlag(f, true);
    expect(next.is_estimated).toBe(false);
  });
});
