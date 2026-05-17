/**
 * resolveFoodId — 어떤 source의 음식이든 cloud foods 테이블의 food_id(UUID)로 매핑.
 *
 * preset / api: food_code로 기존 row를 먼저 찾고, 없으면 INSERT.
 * user: 항상 새 INSERT (호출자가 중복 방지 책임).
 *
 * 모듈 수준 캐시(Map)으로 같은 food_code의 반복 lookup을 피함.
 * 페이지 새로고침 시 초기화되는 인메모리 캐시이므로 stale 우려 없음.
 */
import { cloudRepository } from "@/lib/repository/cloud";
import type { FoodInsert } from "@/lib/repository/types";

/** food_code → food UUID 캐시 (preset / api 전용) */
const codeCache = new Map<string, string>();

export async function resolveFoodId(
  input:
    | { source: "preset"; food_code: string; insert: FoodInsert }
    | { source: "api"; food_code: string; insert: FoodInsert }
    | { source: "user"; insert: FoodInsert },
): Promise<string> {
  if (input.source === "preset" || input.source === "api") {
    const { food_code } = input;

    // 1) 인메모리 캐시 히트
    const cached = codeCache.get(food_code);
    if (cached) return cached;

    // 2) 서버 food 목록에서 food_code 일치하는 row 탐색
    const foods = await cloudRepository.foods.list();
    const existing = foods.find((f) => f.food_code === food_code);
    if (existing) {
      codeCache.set(food_code, existing.id);
      return existing.id;
    }

    // 3) 없으면 INSERT
    const created = await cloudRepository.foods.create(input.insert);
    codeCache.set(food_code, created.id);
    return created.id;
  }

  // source === "user": 항상 새 INSERT
  const created = await cloudRepository.foods.create(input.insert);
  return created.id;
}
