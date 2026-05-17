import {
  DAILY_GOAL_KCAL,
  MACRO_KCAL,
  type BubbleEntry,
  type Macro,
  type MealSlot,
} from "./foods";

export interface FoodAgg {
  foodLogId: string;
  foodName: string;
  ts: number;
  meal_slot: MealSlot;
  carbs: number;
  protein: number;
  fat: number;
  kcal: number;
  dominantMacro: Macro;
}

export interface DayData {
  dateKey: string; // YYYY-M-D
  date: Date;
  entries: BubbleEntry[];
  foods: FoodAgg[];
  totalKcal: number;
  totals: Record<Macro, number>;
}

export type MetricMode = "kcal" | Macro;

export function dateKey(d: Date) {
  return `cal-tracker-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function loadDay(d: Date): BubbleEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(dateKey(d));
    if (!raw) return [];
    return JSON.parse(raw) as BubbleEntry[];
  } catch {
    return [];
  }
}

export function daysInMonth(year: number, month0: number) {
  return new Date(year, month0 + 1, 0).getDate();
}

export function aggregateFoods(entries: BubbleEntry[]): FoodAgg[] {
  const byLog = new Map<string, FoodAgg>();
  for (const e of entries) {
    const slot = e.meal_slot ?? "snack";
    let f = byLog.get(e.foodLogId);
    if (!f) {
      f = {
        foodLogId: e.foodLogId,
        foodName: e.foodName,
        ts: e.addedAt,
        meal_slot: slot,
        carbs: 0,
        protein: 0,
        fat: 0,
        kcal: 0,
        dominantMacro: "carbs",
      };
      byLog.set(e.foodLogId, f);
    }
    f[e.macro] += e.grams;
    f.ts = Math.min(f.ts, e.addedAt);
  }
  for (const f of byLog.values()) {
    f.kcal = Math.round(
      f.carbs * MACRO_KCAL.carbs +
        f.protein * MACRO_KCAL.protein +
        f.fat * MACRO_KCAL.fat,
    );
    // dominant by kcal contribution
    const arr: [Macro, number][] = [
      ["carbs", f.carbs * MACRO_KCAL.carbs],
      ["protein", f.protein * MACRO_KCAL.protein],
      ["fat", f.fat * MACRO_KCAL.fat],
    ];
    arr.sort((a, b) => b[1] - a[1]);
    f.dominantMacro = arr[0][0];
  }
  return Array.from(byLog.values()).sort((a, b) => a.ts - b.ts);
}

export function loadMonth(year: number, month0: number): DayData[] {
  const n = daysInMonth(year, month0);
  const out: DayData[] = [];
  for (let day = 1; day <= n; day++) {
    const d = new Date(year, month0, day);
    const entries = loadDay(d);
    const foods = aggregateFoods(entries);
    const totals = { carbs: 0, protein: 0, fat: 0 } as Record<Macro, number>;
    for (const f of foods) {
      totals.carbs += f.carbs;
      totals.protein += f.protein;
      totals.fat += f.fat;
    }
    const totalKcal = Math.round(
      totals.carbs * MACRO_KCAL.carbs +
        totals.protein * MACRO_KCAL.protein +
        totals.fat * MACRO_KCAL.fat,
    );
    out.push({
      dateKey: `${year}-${month0 + 1}-${day}`,
      date: d,
      entries,
      foods,
      totals,
      totalKcal,
    });
  }
  return out;
}

/** Color of progress dot vs goal. Returns null when no record. */
export function progressColor(day: DayData): string | null {
  if (day.foods.length === 0) return null;
  const ratio = day.totalKcal / DAILY_GOAL_KCAL;
  if (ratio >= 0.8 && ratio <= 1.2) {
    if (ratio >= 0.9 && ratio <= 1.1) return "#22C55E"; // green
    return "#FBBF24"; // yellow within ±20%
  }
  return "#EF4444";
}

export function metricValue(f: FoodAgg, mode: MetricMode): number {
  if (mode === "kcal") return f.kcal;
  return f[mode];
}

/* ---------- favorites ---------- */

const FAV_KEY = "tandanji-favorites";

export function loadFavorites(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function saveFavorites(s: Set<string>) {
  localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(s)));
}
