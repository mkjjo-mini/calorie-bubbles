import { describe, it, expect } from "vitest";
import { layoutBubbles } from "@/features/share-story/bubbleLayout";
import { MACRO_COLORS, type BubbleEntry } from "@/lib/foods";

function entry(partial: Partial<BubbleEntry>): BubbleEntry {
  return {
    id: "e1",
    foodLogId: "L1",
    macro: "carbs",
    grams: 10,
    foodName: "테스트",
    addedAt: 0,
    ...partial,
  };
}

const opts = { width: 400, height: 400, goalKcal: 2000 };

describe("layoutBubbles 색·크기 — 홈 버블과 동일 규칙", () => {
  it("칼로리 모드 엔트리: color/textColor를 그대로 사용", () => {
    const laid = layoutBubbles(
      [entry({ macro: "carbs", grams: 50, color: "#5EC4B6", textColor: "#fff", sizeKcal: 300 })],
      opts,
    );
    expect(laid).toHaveLength(1);
    expect(laid[0]?.color).toBe("#5EC4B6");
    expect(laid[0]?.textColor).toBe("#fff");
  });

  it("탄단지 모드 엔트리(색 없음): 매크로 색·carbs=#333 폴백", () => {
    const laid = layoutBubbles([entry({ macro: "carbs", grams: 50 })], opts);
    expect(laid[0]?.color).toBe(MACRO_COLORS.carbs);
    expect(laid[0]?.textColor).toBe("#333");
  });

  it("탄단지 모드 protein 엔트리: 텍스트 #fff 폴백", () => {
    const laid = layoutBubbles([entry({ macro: "protein", grams: 30 })], opts);
    expect(laid[0]?.color).toBe(MACRO_COLORS.protein);
    expect(laid[0]?.textColor).toBe("#fff");
  });

  it("0칼로리 placeholder(grams 0, sizeKcal 없음)는 배치에서 제외", () => {
    const laid = layoutBubbles(
      [
        entry({ id: "z", grams: 0 }),
        entry({ id: "ok", macro: "carbs", grams: 40, color: "#E58CA8", textColor: "#fff", sizeKcal: 160 }),
      ],
      opts,
    );
    expect(laid).toHaveLength(1);
    expect(laid[0]?.id).toBe("ok");
  });
});
