/**
 * Cloud-backed history data adapter.
 *
 * Phase 2 (history.tsx만) 적용 — food_logs + user_goals/month cloud 조회.
 * favorites는 다음 세션 (add.tsx 마이그와 함께) 진행 예정 — 그동안 localStorage 그대로.
 *
 * 호출자 (history.tsx) 변경:
 *   loadMonth(year, month0) — 동기 → async, 반환 DayData[] 동일
 *   loadFavorites/saveFavorites — 그대로 (localStorage 기반, name Set)
 *   progressColor — DayData + 선택 매크로 + ResolvedGoal(dir) 반영
 */
import { MACRO_KCAL, type Macro } from "./foods";
import { cloudRepository } from "./repository/cloud";
import type { FoodLogRow } from "./repository/types";
import { DEFAULT_GOAL, type MacroDirection, type ResolvedGoal } from "./goal";

export type MetricMode = "kcal" | Macro;

export interface FoodAgg {
  foodLogId: string;
  /** cloud foods FK — 즐겨찾기 토글에 사용 */
  food_id: string;
  foodName: string;
  ts: number;
  meal_slot: "breakfast" | "lunch" | "dinner" | "snack";
  carbs: number;
  protein: number;
  fat: number;
  kcal: number;
  dominantMacro: Macro;
}

export interface DayData {
  dateKey: string; // YYYY-M-D (호환 위해 기존 포맷 유지)
  date: Date;
  foods: FoodAgg[];
  totalKcal: number;
  totals: Record<Macro, number>;
  /** 그 일자의 effective ResolvedGoal — null이면 DEFAULT_GOAL */
  goal: ResolvedGoal;
}

export function daysInMonth(year: number, month0: number) {
  return new Date(year, month0 + 1, 0).getDate();
}

/** YYYY-MM-DD (server-friendly, KST 가정 — 클라 측 Date 그대로 사용) */
function dateStr(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Cloud FoodLogRow → 화면용 FoodAgg 변환 */
function rowToFoodAgg(row: FoodLogRow): FoodAgg {
  const carbs = Number(row.carb_g ?? 0);
  const protein = Number(row.protein_g ?? 0);
  const fat = Number(row.fat_g ?? 0);
  const arr: [Macro, number][] = [
    ["carbs", carbs * MACRO_KCAL.carbs],
    ["protein", protein * MACRO_KCAL.protein],
    ["fat", fat * MACRO_KCAL.fat],
  ];
  arr.sort((a, b) => b[1] - a[1]);
  return {
    foodLogId: row.id,
    food_id: row.food_id,
    foodName: row.food?.name ?? "(이름 없음)",
    ts: row.created_at ? new Date(row.created_at).getTime() : 0,
    meal_slot: row.meal_slot ?? "snack",
    carbs,
    protein,
    fat,
    kcal: Number(row.kcal ?? 0),
    dominantMacro: arr[0][0],
  };
}

/**
 * 월별 데이터 로드 — cloud food_logs + user_goals/month 일괄 조회.
 * 일자별 DayData 배열 반환 (빈 날도 포함).
 */
export async function loadMonth(year: number, month0: number): Promise<DayData[]> {
  const n = daysInMonth(year, month0);
  const yyyymm = `${year}-${String(month0 + 1).padStart(2, "0")}`;
  const from = `${yyyymm}-01`;
  const to = `${yyyymm}-${String(n).padStart(2, "0")}`;

  let logs: FoodLogRow[] = [];
  let goalsByDate: Record<string, ResolvedGoal> = {};
  try {
    const [l, g] = await Promise.all([
      cloudRepository.foodLogs.listByRange(from, to),
      cloudRepository.userGoal.getMonth(yyyymm),
    ]);
    logs = l ?? [];
    goalsByDate = g ?? {};
  } catch {
    // 미인증/네트워크 실패 시 빈 화면 (호출자가 catch해서 재로그인 유도)
    logs = [];
    goalsByDate = {};
  }

  // 일자별 그룹
  const byDate = new Map<string, FoodLogRow[]>();
  for (const row of logs) {
    const key = row.logged_date;
    if (!key) continue;
    const arr = byDate.get(key) ?? [];
    arr.push(row);
    byDate.set(key, arr);
  }

  const out: DayData[] = [];
  for (let day = 1; day <= n; day++) {
    const d = new Date(year, month0, day);
    const iso = dateStr(year, month0, day);
    const rows = byDate.get(iso) ?? [];
    const foods = rows
      .map(rowToFoodAgg)
      .sort((a, b) => a.ts - b.ts);
    const totals: Record<Macro, number> = { carbs: 0, protein: 0, fat: 0 };
    let totalKcal = 0;
    for (const f of foods) {
      totals.carbs += f.carbs;
      totals.protein += f.protein;
      totals.fat += f.fat;
      totalKcal += f.kcal;
    }
    out.push({
      dateKey: `${year}-${month0 + 1}-${day}`,
      date: d,
      foods,
      totals,
      totalKcal: Math.round(totalKcal),
      goal: goalsByDate[iso] ?? DEFAULT_GOAL,
    });
  }
  return out;
}

export interface DotStyle {
  /** fill 색. "transparent"이면 흰색(빈 카드) */
  fill: string;
  /** border 색. undefined면 없음 */
  border?: string;
}

/**
 * 선택 매크로 기준 진척 도트 스타일.
 *   - 음식 등록 없음: 흰색 + 회색 테두리
 *   - 음식 있음 + 매크로 비활성(목표 없음): 회색 fill
 *   - dir(max) 충족(≤1): green / ±20% 이내: yellow / 초과: red
 *   - dir(min) 충족(≥1): green / ±20% 이내: yellow / 미달: red
 */
export function progressColor(day: DayData, mode: MetricMode): DotStyle {
  if (day.foods.length === 0) {
    return { fill: "transparent", border: "#D4D4D8" };
  }
  const macroGoal = pickGoal(day.goal, mode);
  if (macroGoal === null || macroGoal.value <= 0) {
    return { fill: "#9CA3AF" };
  }
  const actual = mode === "kcal" ? day.totalKcal : day.totals[mode];
  const ratio = actual / macroGoal.value;
  if (macroGoal.dir === "max") {
    if (ratio <= 1) return { fill: "#22C55E" };
    if (ratio <= 1.2) return { fill: "#FBBF24" };
    return { fill: "#EF4444" };
  }
  if (ratio >= 1) return { fill: "#22C55E" };
  if (ratio >= 0.8) return { fill: "#FBBF24" };
  return { fill: "#EF4444" };
}

function pickGoal(
  goal: ResolvedGoal,
  mode: MetricMode,
): { value: number; dir: MacroDirection } | null {
  if (mode === "kcal") return goal.daily_kcal;
  if (mode === "carbs") return goal.carb_g;
  if (mode === "protein") return goal.protein_g;
  return goal.fat_g;
}

export function metricValue(f: FoodAgg, mode: MetricMode): number {
  if (mode === "kcal") return f.kcal;
  return f[mode];
}

/* ---------- favorites — cloud food_id Set ---------- */

/** cloudRepository.favorites.list() → Set<food_id> */
export async function loadFavorites(): Promise<Set<string>> {
  try {
    const rows = await cloudRepository.favorites.list();
    return new Set((rows ?? []).map((r) => r.food_id));
  } catch {
    return new Set();
  }
}

export async function addFavorite(food_id: string): Promise<void> {
  await cloudRepository.favorites.add(food_id);
}

export async function removeFavorite(food_id: string): Promise<void> {
  await cloudRepository.favorites.remove(food_id);
}
