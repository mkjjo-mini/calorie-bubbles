import { describe, it, expect } from "vitest";
import {
  KCAL_PALETTE,
  hash01,
  kcalPaletteEntry,
  kcalBubbleColor,
  kcalBubbleText,
} from "@/lib/kcalPalette";

describe("kcalPalette", () => {
  it("팔레트는 10색이고 각 항목에 color/text가 있다", () => {
    expect(KCAL_PALETTE).toHaveLength(10);
    for (const e of KCAL_PALETTE) {
      expect(typeof e.color).toBe("string");
      expect(typeof e.text).toBe("string");
    }
  });

  it("같은 이름은 항상 같은 색(결정적)", () => {
    expect(kcalBubbleColor("사과")).toBe(kcalBubbleColor("사과"));
    expect(kcalBubbleText("사과")).toBe(kcalBubbleText("사과"));
  });

  it("반환 색은 팔레트 안의 값이다", () => {
    const entry = kcalPaletteEntry("닭가슴살");
    expect(KCAL_PALETTE).toContainEqual(entry);
  });

  it("hash01은 [0,1) 범위의 결정적 값", () => {
    const a = hash01("밥", 1);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(hash01("밥", 1)).toBe(a);
  });
});
