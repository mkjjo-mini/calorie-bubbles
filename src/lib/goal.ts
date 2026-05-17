/**
 * user_goals row → 실제 사용할 ResolvedGoal 변환.
 * 탄단지 비율이 nullable이라 코드 측 fallback (50/30/20).
 * 서버(API 라우트)와 클라이언트(캘린더 표시) 모두 사용.
 */

export interface UserGoalRow {
  id: string;
  effective_from: string;
  effective_to: string | null;
  daily_kcal: number;
  carb_ratio: number | null;
  protein_ratio: number | null;
  fat_ratio: number | null;
  notification_time: string | null;
}

export interface ResolvedGoal {
  daily_kcal: number;
  carb_ratio: number;
  protein_ratio: number;
  fat_ratio: number;
  notification_time: string | null;
}

export const DEFAULT_GOAL: ResolvedGoal = {
  daily_kcal: 2000,
  carb_ratio: 50,
  protein_ratio: 30,
  fat_ratio: 20,
  notification_time: null,
};

export function resolveGoal(row: UserGoalRow | null | undefined): ResolvedGoal {
  if (!row) return { ...DEFAULT_GOAL };
  return {
    daily_kcal: row.daily_kcal,
    carb_ratio: row.carb_ratio ?? DEFAULT_GOAL.carb_ratio,
    protein_ratio: row.protein_ratio ?? DEFAULT_GOAL.protein_ratio,
    fat_ratio: row.fat_ratio ?? DEFAULT_GOAL.fat_ratio,
    notification_time: row.notification_time,
  };
}
