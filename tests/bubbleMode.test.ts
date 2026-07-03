import { describe, it, expect, beforeEach } from "vitest";
import { getStoredBubbleMode, setStoredBubbleMode } from "@/lib/bubbleMode";

describe("bubbleMode 저장/로드", () => {
  beforeEach(() => localStorage.clear());

  it("저장값 없으면 기본 kcal", () => {
    expect(getStoredBubbleMode()).toBe("kcal");
  });

  it("저장 후 로드하면 그 값", () => {
    setStoredBubbleMode("macro");
    expect(getStoredBubbleMode()).toBe("macro");
  });

  it("잘못된 값은 kcal로 폴백", () => {
    localStorage.setItem("tandanji_bubble_mode", "weird");
    expect(getStoredBubbleMode()).toBe("kcal");
  });
});
