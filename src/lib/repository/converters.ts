/**
 * food_logs row ↔ BubbleEntry 변환.
 * 클라이언트 (홈 화면 d3-force 시각화) ↔ 서버 정규화 모델 간의 bridge.
 */
import { displayName, type BubbleEntry, type Macro } from "@/lib/foods";
import type { FoodLogRow } from "./types";

/**
 * food_logs 1 row → BubbleEntry up to 3 (탄/단/지).
 * 매크로가 0g이면 해당 BubbleEntry skip (빈 버블 방지).
 * foodLogId = food_logs.id (서버 uuid) 그대로 사용 — 클라이언트가 별도 생성 X.
 */
export function foodLogToBubbleEntries(log: FoodLogRow): BubbleEntry[] {
  const addedAt = new Date(log.created_at).getTime();
  const foodName = displayName(log.food?.name ?? "음식");
  const macros: [Macro, number][] = [
    ["carbs", log.carb_g],
    ["protein", log.protein_g],
    ["fat", log.fat_g],
  ];
  const out: BubbleEntry[] = [];
  for (const [macro, grams] of macros) {
    const rounded = Math.round(grams * 10) / 10;
    if (rounded > 0) {
      out.push({
        id: `${log.id}-${macro}`,
        foodLogId: log.id,
        macro,
        grams: rounded,
        foodName,
        addedAt,
        meal_slot: log.meal_slot,
      });
    }
  }
  return out;
}

/** 여러 row를 flatMap. 캘린더·홈 화면에서 일자별 BubbleEntry[] 만들 때. */
export function foodLogsToBubbleEntries(logs: FoodLogRow[]): BubbleEntry[] {
  return logs.flatMap(foodLogToBubbleEntries);
}
