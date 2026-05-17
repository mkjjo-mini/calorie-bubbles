/**
 * user_goals row → 실제 사용할 ResolvedGoal 변환.
 *
 * 각 영양소가 value + direction을 가짐. direction:
 *   - "max" (ceiling) — "이 이하로 먹기"
 *   - "min" (floor)   — "이 이상 먹기"
 *
 * Default direction (우리 v1 셋팅):
 *   칼로리·탄수화물·지방 = max (초과 X)
 *   단백질              = min (최소 이상)
 *
 * 사용자는 Step 06 설정 화면 "고급" 모드에서 direction 변경 가능 (벌크업 등).
 * v2에 추가 영양소(당류·식이섬유 등) 도입 시 같은 패턴.
 *
 * 서버(API 라우트)와 클라이언트(캘린더·진척률 표시) 모두 사용.
 */

export type MacroDirection = "min" | "max";

export interface MacroGoal {
  value: number;
  dir: MacroDirection;
}

/** Supabase user_goals row 모양 (Postgres에서 받아온 형태) */
export interface UserGoalRow {
  id: string;
  effective_from: string;
  effective_to: string | null;
  daily_kcal_value: number;
  daily_kcal_dir: MacroDirection;
  protein_g_value: number | null;
  protein_g_dir: MacroDirection;
  carb_g_value: number | null;
  carb_g_dir: MacroDirection;
  fat_g_value: number | null;
  fat_g_dir: MacroDirection;
  notification_time: string | null;
}

export interface ResolvedGoal {
  daily_kcal: MacroGoal;
  protein_g: MacroGoal;
  carb_g: MacroGoal;
  fat_g: MacroGoal;
  notification_time: string | null;
}

export const DEFAULT_GOAL: ResolvedGoal = {
  daily_kcal: { value: 2000, dir: "max" },
  protein_g: { value: 40, dir: "min" },
  carb_g: { value: 250, dir: "max" },
  fat_g: { value: 60, dir: "max" },
  notification_time: null,
};

function cloneDefault(): ResolvedGoal {
  return {
    daily_kcal: { ...DEFAULT_GOAL.daily_kcal },
    protein_g: { ...DEFAULT_GOAL.protein_g },
    carb_g: { ...DEFAULT_GOAL.carb_g },
    fat_g: { ...DEFAULT_GOAL.fat_g },
    notification_time: DEFAULT_GOAL.notification_time,
  };
}

export function resolveGoal(
  row: UserGoalRow | null | undefined,
): ResolvedGoal {
  if (!row) return cloneDefault();
  return {
    daily_kcal: {
      value: row.daily_kcal_value,
      dir: row.daily_kcal_dir,
    },
    protein_g: {
      value: row.protein_g_value ?? DEFAULT_GOAL.protein_g.value,
      dir: row.protein_g_dir,
    },
    carb_g: {
      value: row.carb_g_value ?? DEFAULT_GOAL.carb_g.value,
      dir: row.carb_g_dir,
    },
    fat_g: {
      value: row.fat_g_value ?? DEFAULT_GOAL.fat_g.value,
      dir: row.fat_g_dir,
    },
    notification_time: row.notification_time,
  };
}

/** UI에서 사용. "이하" / "이상" */
export function formatDirection(dir: MacroDirection): string {
  return dir === "min" ? "이상" : "이하";
}
