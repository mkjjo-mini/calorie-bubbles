/**
 * useStorage() — v1엔 cloud-only (Step 07 4차 결정).
 * 무료/유료 분기는 v2 BM 확정 후 부활. 그땐 useIsPaidUser 다시 활용.
 *
 * 신규 컴포넌트(Step 08 캘린더 등) + 마이그레이션된 기존 컴포넌트가 사용.
 * UX 캐시(lastQtyByName, recentFoods, searchHistory)는 여전히 localStorage 직접 사용.
 */
import { cloudRepository } from "@/lib/repository/cloud";
import type { Repository } from "@/lib/repository/types";

export function useStorage(): Repository {
  return cloudRepository;
}
