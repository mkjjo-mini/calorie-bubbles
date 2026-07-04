import { describe, it, expect } from "vitest";
import { nextLastQty } from "@/lib/lastQty";

describe("nextLastQty — 재기준화(rebase) 여부로 lastQty 결정", () => {
  it("rebase되면 1인분(serving)으로 리셋 — source 무관", () => {
    // 음식 base가 방금 먹은 양으로 재설정됐으므로 다음 기억은 1인분.
    expect(nextLastQty(true, 0.5, "serving")).toEqual({ qty: 1, mode: "serving" });
    expect(nextLastQty(true, 120, "gram")).toEqual({ qty: 1, mode: "serving" });
  });

  it("rebase 안 되면 사용자가 조정한 qty/mode 유지", () => {
    expect(nextLastQty(false, 0.5, "serving")).toEqual({ qty: 0.5, mode: "serving" });
    expect(nextLastQty(false, 80, "gram")).toEqual({ qty: 80, mode: "gram" });
  });

  it("회귀: 공공DB(api) 음식을 0.5로 기준저장하면 rebase=true → lastQty 1 (이중 적용 방지)", () => {
    // 버그: 예전엔 source==='custom'만 리셋해서 api는 0.5로 남아 다음 탭에서 40이 됐음.
    const persisted = nextLastQty(true, 0.5, "serving");
    // 재기준화된 base(80kcal) × persisted.qty(1) = 80 (먹은 양 그대로)
    expect(persisted.qty).toBe(1);
  });
});
