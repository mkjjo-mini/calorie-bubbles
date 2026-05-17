/**
 * 목표 칼로리·매크로 추천 계산기 (Step 06).
 *
 * PRD § 추천 로직 기반:
 * - BMR: Mifflin-St Jeor
 * - TDEE: BMR × activity factor
 * - 목표 칼로리: 감량/증량 deficit/surplus (체중·기간 기반 또는 기본값 500)
 * - 매크로: 체중 기반 단백질·지방 우선 배정, 탄수화물 나머지
 */
import type { UserProfileInsert, UserProfileRow } from "./repository/types";

export interface RecommendedGoal {
  daily_kcal: { value: number; dir: "min" | "max" };
  protein_g: { value: number; dir: "min" | "max" };
  carb_g: { value: number; dir: "min" | "max" };
  fat_g: { value: number; dir: "min" | "max" };
}

type ActivityLevel = UserProfileRow["activity_level"];
type Goal = UserProfileRow["goal"];
type ProfileForCalc = Pick<
  UserProfileRow | UserProfileInsert,
  | "height_cm"
  | "weight_kg"
  | "sex"
  | "birth_year"
  | "activity_level"
  | "goal"
  | "target_weight_kg"
  | "target_period_weeks"
>;

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** 현재 연도 - birth_year */
export function calculateAge(birth_year: number): number {
  return new Date().getFullYear() - birth_year;
}

/** Mifflin-St Jeor BMR (kcal/day) */
export function calculateBMR(profile: ProfileForCalc): number {
  const { height_cm, weight_kg, sex, birth_year } = profile;
  const age = calculateAge(birth_year);
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

/** TDEE = BMR × activity factor */
export function calculateTDEE(bmr: number, level: ActivityLevel): number {
  return bmr * ACTIVITY_FACTOR[level];
}

/**
 * 목표별 일일 칼로리 (kcal).
 * 최솟값 800 clamp는 recommendGoal에서 적용.
 */
export function calculateTargetCalories(
  tdee: number,
  profile: ProfileForCalc,
): number {
  const goal: Goal = profile.goal ?? "maintain";

  if (goal === "maintain") return tdee;

  const deltaKg =
    profile.target_weight_kg != null
      ? Math.abs(profile.target_weight_kg - profile.weight_kg)
      : null;
  const weeks =
    profile.target_period_weeks != null ? profile.target_period_weeks : null;

  let dailyDelta = 500; // default
  if (deltaKg != null && weeks != null && weeks > 0) {
    // |Δ체중| × 7700 kcal/kg ÷ (기간주 × 7일), clamp 300~1000
    const raw = (deltaKg * 7700) / (weeks * 7);
    dailyDelta = Math.min(1000, Math.max(300, raw));
  }

  return goal === "loss" ? tdee - dailyDelta : tdee + dailyDelta;
}

/**
 * 매크로 (g) 계산.
 * 단백질·지방 먼저 배정, 탄수화물 = 나머지 (음수 방지용 0 clamp).
 */
export function calculateMacros(
  kcal: number,
  weight: number,
  goal: Goal,
): { protein_g: number; carb_g: number; fat_g: number } {
  let proteinPerKg: number;
  let fatPerKg: number;

  switch (goal) {
    case "loss":
      proteinPerKg = 1.8;
      fatPerKg = 0.8;
      break;
    case "gain":
      proteinPerKg = 1.6;
      fatPerKg = 1.0;
      break;
    case "maintain":
    default:
      proteinPerKg = 1.4;
      fatPerKg = 0.9;
      break;
  }

  const protein_g = Math.round(weight * proteinPerKg);
  const fat_g = Math.round(weight * fatPerKg);
  // 단백질 4kcal/g, 지방 9kcal/g, 탄수화물 4kcal/g
  const carbKcal = kcal - protein_g * 4 - fat_g * 9;
  const carb_g = Math.max(0, Math.round(carbKcal / 4));

  return { protein_g, carb_g, fat_g };
}

/**
 * 목표별 dir 추천.
 * - 칼로리: loss/maintain → max (이하), gain → min (이상)
 * - 단백질: 항상 min (이상)
 * - 탄/지: 항상 max (이하)
 */
export function recommendDirs(goal: Goal): {
  kcal_dir: "min" | "max";
  protein_dir: "min" | "max";
  carb_dir: "min" | "max";
  fat_dir: "min" | "max";
} {
  return {
    kcal_dir: goal === "gain" ? "min" : "max",
    protein_dir: "min",
    carb_dir: "max",
    fat_dir: "max",
  };
}

/**
 * 프로필에서 추천 목표를 계산.
 * activity_level / goal 미설정 시 기본값(moderate / maintain) 사용.
 * daily_kcal 최솟값 800 clamp.
 */
export function recommendGoal(
  profile: ProfileForCalc,
): RecommendedGoal {
  const activityLevel: ActivityLevel = profile.activity_level ?? "moderate";
  const goal: Goal = profile.goal ?? "maintain";

  const profileWithDefaults: ProfileForCalc = {
    ...profile,
    activity_level: activityLevel,
    goal,
  };

  const bmr = calculateBMR(profileWithDefaults);
  const tdee = calculateTDEE(bmr, activityLevel);
  const rawKcal = calculateTargetCalories(tdee, profileWithDefaults);
  const kcal = Math.max(800, Math.round(rawKcal));

  const { protein_g, carb_g, fat_g } = calculateMacros(
    kcal,
    profile.weight_kg,
    goal,
  );
  const dirs = recommendDirs(goal);

  return {
    daily_kcal: { value: kcal, dir: dirs.kcal_dir },
    protein_g: { value: protein_g, dir: dirs.protein_dir },
    carb_g: { value: carb_g, dir: dirs.carb_dir },
    fat_g: { value: fat_g, dir: dirs.fat_dir },
  };
}
