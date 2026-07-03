import type { FoodLogRow } from "@/lib/repository/types";
import {
  displayName,
  MACRO_KCAL,
  type BubbleEntry,
  type BubbleMode,
  type Macro,
} from "@/lib/foods";
import { kcalBubbleColor, kcalBubbleText } from "@/lib/kcalPalette";

/**
 * FoodLogRow[] → BubbleEntry[].
 *
 *  - "macro": 음식 하나를 탄·단·지 최대 3버블로 분리(기존 동작). 매크로가 모두 0이면
 *    grams 0 placeholder 1개(그릇 미표시 + 슬롯 목록 표시용).
 *  - "kcal": 음식 하나를 버블 1개로. 크기는 총칼로리(sizeKcal), 색은 이름 기반 팔레트.
 *    총칼로리 0이면 macro 모드와 동일한 placeholder.
 *
 *  placeholder는 두 모드 동일: id `${log.id}-0`, macro "carbs", grams 0, 색·sizeKcal 없음.
 *  BubbleField가 (sizeKcal ?? grams) <= 0 을 걸러내므로 그릇에는 안 뜨고,
 *  MealLogList는 이 엔트리로 슬롯 항목을 만든다.
 */
export function logsToBubbles(logs: FoodLogRow[], mode: BubbleMode): BubbleEntry[] {
  const entries: BubbleEntry[] = [];
  for (const log of logs) {
    const foodName = displayName(log.food?.name ?? "");
    const addedAt = new Date(log.created_at).getTime();
    const slot = log.meal_slot;

    if (mode === "kcal") {
      const totalKcal =
        log.carb_g * MACRO_KCAL.carbs +
        log.protein_g * MACRO_KCAL.protein +
        log.fat_g * MACRO_KCAL.fat;
      if (totalKcal > 0) {
        entries.push({
          id: `${log.id}-0`,
          foodLogId: log.id,
          macro: "carbs", // 타입상 필요 — 색·크기는 아래 필드가 우선
          grams: Math.round((log.carb_g + log.protein_g + log.fat_g) * 10) / 10,
          foodName,
          addedAt,
          meal_slot: slot,
          food_id: log.food_id,
          color: kcalBubbleColor(foodName),
          textColor: kcalBubbleText(foodName),
          sizeKcal: totalKcal,
        });
      } else {
        entries.push(placeholder(log, foodName, addedAt, slot));
      }
      continue;
    }

    // mode === "macro"
    const macros: [Macro, number][] = [
      ["carbs", log.carb_g],
      ["protein", log.protein_g],
      ["fat", log.fat_g],
    ];
    let pushed = false;
    macros.forEach(([macro, grams], i) => {
      if (grams > 0) {
        entries.push({
          id: `${log.id}-${i}`,
          foodLogId: log.id,
          macro,
          grams: Math.round(grams * 10) / 10,
          foodName,
          addedAt,
          meal_slot: slot,
          food_id: log.food_id,
        });
        pushed = true;
      }
    });
    if (!pushed) entries.push(placeholder(log, foodName, addedAt, slot));
  }
  return entries;
}

function placeholder(
  log: FoodLogRow,
  foodName: string,
  addedAt: number,
  slot: FoodLogRow["meal_slot"],
): BubbleEntry {
  return {
    id: `${log.id}-0`,
    foodLogId: log.id,
    macro: "carbs",
    grams: 0,
    foodName,
    addedAt,
    meal_slot: slot,
    food_id: log.food_id,
  };
}
