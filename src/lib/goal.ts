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
  daily_kcal: MacroGoal;        // 항상 필수
  protein_g: MacroGoal | null;  // null = 비활성 (진척 추적 X)
  carb_g: MacroGoal | null;
  fat_g: MacroGoal | null;
  notification_time: string | null;
}

/** 칼로리 기본값 (row 없을 때만 사용) */
export const DEFAULT_KCAL_GOAL: MacroGoal = { value: 2000, dir: "max" };

/** 하위호환용 — 코드 내 DEFAULT_GOAL 참조가 남아있는 곳에서 사용 */
export const DEFAULT_GOAL: ResolvedGoal = {
  daily_kcal: DEFAULT_KCAL_GOAL,
  protein_g: null,
  carb_g: null,
  fat_g: null,
  notification_time: null,
};

export function resolveGoal(
  row: UserGoalRow | null | undefined,
): ResolvedGoal {
  if (!row) {
    return {
      daily_kcal: { ...DEFAULT_KCAL_GOAL },
      protein_g: null,
      carb_g: null,
      fat_g: null,
      notification_time: null,
    };
  }
  return {
    daily_kcal: {
      value: row.daily_kcal_value,
      dir: row.daily_kcal_dir,
    },
    protein_g:
      row.protein_g_value != null
        ? { value: row.protein_g_value, dir: row.protein_g_dir }
        : null,
    carb_g:
      row.carb_g_value != null
        ? { value: row.carb_g_value, dir: row.carb_g_dir }
        : null,
    fat_g:
      row.fat_g_value != null
        ? { value: row.fat_g_value, dir: row.fat_g_dir }
        : null,
    notification_time: row.notification_time,
  };
}

/** UI에서 사용. "이하" / "이상" */
export function formatDirection(dir: MacroDirection): string {
  return dir === "min" ? "이상" : "이하";
}
