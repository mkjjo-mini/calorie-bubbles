/**
 * LocalStorage Repository — v1 stub.
 *
 * 기존 컴포넌트(add.tsx, index.tsx 등)가 localStorage를 직접 호출하는 부분은
 * 점진 마이그레이션 (별도 PR). 이 어댑터는 신규 컴포넌트(Step 08 캘린더 등)가
 * useStorage()로 통합 인터페이스를 쓸 수 있게 제공.
 *
 * v1 stub: 실제 구현은 기존 localStorage key 매핑(customFoods, cal-tracker-*,
 * favorites 등)을 거쳐서 FoodRow/FoodLogRow 형태로 변환. 별도 마이그레이션 PR에서.
 */
import { DEFAULT_GOAL } from "@/lib/goal";
import type { Repository } from "./types";

function notImplemented(method: string): never {
  throw new Error(
    `[localRepository] ${method} 미구현. 무료 사용자용 어댑터는 별도 PR에서 완성 예정. v1엔 cloud 어댑터(유료)만 검증.`,
  );
}

export const localRepository: Repository = {
  foods: {
    list: async () => [],
    create: async () => notImplemented("foods.create"),
    update: async () => notImplemented("foods.update"),
    remove: async () => notImplemented("foods.remove"),
  },
  foodLogs: {
    listByDate: async () => [],
    listByRange: async () => [],
    create: async () => notImplemented("foodLogs.create"),
    remove: async () => notImplemented("foodLogs.remove"),
  },
  userGoal: {
    get: async () => ({ ...DEFAULT_GOAL }),
    getMonth: async () => ({}),
    put: async () => notImplemented("userGoal.put"),
  },
  favorites: {
    list: async () => [],
    add: async () => notImplemented("favorites.add"),
    remove: async () => notImplemented("favorites.remove"),
  },
  userProfile: {
    get: async () => null,
    put: async () => {
      throw new Error("[localRepository] userProfile.put 미구현");
    },
  },
};
