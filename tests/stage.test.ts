import { describe, it, expect } from "vitest";
import {
  compressionForStage,
  stageForPct,
  type Stage,
} from "@/lib/customFoods";

describe("stageForPct — 4-stage visual feedback (Step 02)", () => {
  it.each<[number, Stage]>([
    [0, 1],
    [25, 1],
    [49.999, 1],
    [50, 2],
    [75, 2],
    [99.999, 2],
    [100, 3],
    [119.999, 3],
    [120, 4],
    [200, 4],
    [1000, 4],
  ])("rawPct %s → stage %s", (pct, expected) => {
    expect(stageForPct(pct)).toBe(expected);
  });

  it("matches src/routes/index.tsx mapping exactly", () => {
    // Mirrors the inline ternary in Index():
    //   stage = rawPct >= 120 ? 4 : rawPct >= 100 ? 3 : rawPct >= 50 ? 2 : 1
    for (const pct of [0, 49, 50, 99, 100, 119, 120, 300]) {
      const expected: Stage =
        pct >= 120 ? 4 : pct >= 100 ? 3 : pct >= 50 ? 2 : 1;
      expect(stageForPct(pct)).toBe(expected);
    }
  });
});

describe("compressionForStage — bubble shrink", () => {
  it("stage 1/2 → 1.0 (no compression)", () => {
    expect(compressionForStage(1)).toBe(1);
    expect(compressionForStage(2)).toBe(1);
  });
  it("stage 3 → 0.78", () => {
    expect(compressionForStage(3)).toBe(0.78);
  });
  it("stage 4 → 0.7", () => {
    expect(compressionForStage(4)).toBe(0.7);
  });
});
