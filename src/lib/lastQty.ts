export type QtyMode = "serving" | "gram";

export interface LastQty {
  qty: number;
  mode: QtyMode;
}

/**
 * "기준으로 저장"으로 음식의 1인분 기준이 방금 먹은 양으로 재설정(rebase)됐는지에 따라
 * 다음에 기억할 lastQty를 결정한다.
 *
 *  - rebased=true  → 음식 base가 이미 먹은 양이 됐으므로 lastQty는 1인분(serving).
 *  - rebased=false → 사용자가 조정한 qty/mode를 그대로 기억.
 *
 * source(custom/api/preset)가 아니라 **rebase 발생 여부**만이 기준이다.
 * (과거 버그: api 음식은 rebase돼도 source!=="custom"이라 리셋 안 돼 lastQty가 남아
 *  다음 탭에서 배수가 이중 적용됐음.)
 */
export function nextLastQty(rebased: boolean, qty: number, mode: QtyMode): LastQty {
  return rebased ? { qty: 1, mode: "serving" } : { qty, mode };
}
