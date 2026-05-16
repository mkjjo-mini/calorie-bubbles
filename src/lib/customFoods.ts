/**
 * Pure helpers spec'd by Step 03 PRD (customFoods, category estimation,
 * Atwater calorie calc) and Step 02 (4-stage feedback, foodLogId triple).
 *
 * Status: REFERENCE IMPLEMENTATION. The /add route and direct-registration
 * form do not yet consume these helpers (Step 03 form is not implemented in
 * v1). Tests lock this PRD-faithful behavior so that the eventual UI wiring
 * has a known-good contract to call.
 *
 * All functions are pure (no localStorage, no Date.now) so they can be
 * unit-tested deterministically.
 */
import {
  MACRO_KCAL,
  type BubbleEntry,
  type Macro,
  type MealSlot,
} from "./foods";

/* ------------------------------------------------------------------ */
/* Stage (Step 02 — 4-stage visual feedback)                          */
/* ------------------------------------------------------------------ */

export type Stage = 1 | 2 | 3 | 4;

/**
 * Map rawPct (totalKcal / goalKcal * 100, unclamped) to a 1..4 stage.
 * Boundaries match src/routes/index.tsx:
 *   <50%   → 1
 *   50–99% → 2
 *  100–119% → 3
 *  ≥120%   → 4
 */
export function stageForPct(rawPct: number): Stage {
  if (rawPct >= 120) return 4;
  if (rawPct >= 100) return 3;
  if (rawPct >= 50) return 2;
  return 1;
}

/** Compression multiplier applied to bubble radii. Matches index.tsx. */
export function compressionForStage(stage: Stage): number {
  if (stage === 4) return 0.7;
  if (stage === 3) return 0.78;
  return 1;
}

/* ------------------------------------------------------------------ */
/* Atwater calorie calculation                                        */
/* ------------------------------------------------------------------ */

export interface Macros {
  carbs: number;
  protein: number;
  fat: number;
}

/** kcal = 4·carb + 4·protein + 9·fat (Atwater). Rounded to nearest int. */
export function kcalFromMacros(m: Macros): number {
  return Math.round(
    m.carbs * MACRO_KCAL.carbs +
      m.protein * MACRO_KCAL.protein +
      m.fat * MACRO_KCAL.fat,
  );
}

/* ------------------------------------------------------------------ */
/* Category-based macro estimation (Step 03 §양방향 자동 계산)         */
/* ------------------------------------------------------------------ */

export type FoodCategory =
  | "rice_grain_noodle" // 밥·곡류·면
  | "meat_fish_egg" // 고기·생선·계란
  | "dairy" // 유제품
  | "vegetable_seaweed" // 채소·해조류
  | "fruit" // 과일
  | "snack_dessert" // 간식·디저트
  | "drink_alcohol" // 음료·주류
  | "other"; // 기타·일반식 (default)

/** Ratios are percent of TOTAL kcal coming from each macro. */
export const CATEGORY_RATIOS: Record<
  FoodCategory,
  { carb: number; protein: number; fat: number }
> = {
  rice_grain_noodle: { carb: 75, protein: 13, fat: 12 },
  meat_fish_egg: { carb: 5, protein: 55, fat: 40 },
  dairy: { carb: 30, protein: 25, fat: 45 },
  vegetable_seaweed: { carb: 60, protein: 25, fat: 15 },
  fruit: { carb: 90, protein: 5, fat: 5 },
  snack_dessert: { carb: 55, protein: 10, fat: 35 },
  drink_alcohol: { carb: 80, protein: 5, fat: 15 },
  other: { carb: 50, protein: 25, fat: 25 },
};

/**
 * Distribute kcal across carb/protein/fat grams using the category ratio.
 * grams = (kcal * ratio% / 100) / kcal_per_gram
 * Rounded to 1 decimal place.
 */
export function estimateMacrosFromKcal(
  kcal: number,
  category: FoodCategory,
): Macros {
  const r = CATEGORY_RATIOS[category];
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    carbs: round1((kcal * r.carb) / 100 / MACRO_KCAL.carbs),
    protein: round1((kcal * r.protein) / 100 / MACRO_KCAL.protein),
    fat: round1((kcal * r.fat) / 100 / MACRO_KCAL.fat),
  };
}

/* ------------------------------------------------------------------ */
/* customFoods array management                                       */
/* ------------------------------------------------------------------ */

export interface CustomFood {
  id: string;
  name: string;
  serving_unit: "개" | "봉" | "잔" | "조각" | "g" | "ml";
  serving_amount: number;
  serving_g: number;
  kcal: number;
  carb_g: number;
  protein_g: number;
  fat_g: number;
  is_estimated: boolean;
  category?: FoodCategory;
  created_at: number;
  updated_at: number;
}

/**
 * Prepend a new CustomFood and dedupe by name (case-insensitive).
 * Newer entry wins. Returns a new array.
 */
export function prependCustomFood(
  list: CustomFood[],
  next: CustomFood,
): CustomFood[] {
  const nameLower = next.name.toLowerCase();
  const filtered = list.filter((c) => c.name.toLowerCase() !== nameLower);
  return [next, ...filtered];
}

/**
 * After a user manually overwrites one of the estimated macros, recompute
 * the is_estimated flag. PRD §"is_estimated 플래그 변화":
 *   "추정 배지가 달린 음식 편집 후 매크로 직접 입력 시 배지 사라짐"
 *
 * Returns the updated CustomFood. We consider a food no longer estimated
 * the moment any macro field is user-typed (i.e., differs from the
 * category-estimated value, or original is_estimated=false is preserved).
 *
 * Simplified contract used here: pass `manualOverride=true` whenever the
 * user finishes editing macros by hand, regardless of value. This matches
 * the QA criterion (badge disappears after user edit).
 */
export function recomputeEstimatedFlag(
  food: CustomFood,
  manualOverride: boolean,
): CustomFood {
  if (!manualOverride) return food;
  return { ...food, is_estimated: false };
}

/* ------------------------------------------------------------------ */
/* BubbleEntry triple builder (Step 02 — same foodLogId, same slot)   */
/* ------------------------------------------------------------------ */

export interface BuildBubbleTripleOptions {
  /** Source food. Either a CustomFood or anything with macros+name. */
  foodName: string;
  carbs: number;
  protein: number;
  fat: number;
  /** Now/addedAt timestamp (deterministic for tests). */
  addedAt: number;
  /** Meal slot (computed via inferMealSlot at the caller). */
  meal_slot: MealSlot;
  /** Random suffix generator — injectable for deterministic tests. */
  randomSuffix?: () => string;
}

/**
 * Build the 3-bubble triple for a single food log.
 * - All entries share the same foodLogId
 * - Zero-gram macros are skipped (no empty bubble)
 * - All entries share the same meal_slot
 */
export function buildBubbleTriple(opts: BuildBubbleTripleOptions): BubbleEntry[] {
  const suffix = (opts.randomSuffix ?? defaultRandomSuffix)();
  const foodLogId = `${opts.addedAt}-${suffix}`;
  const macros: Record<Macro, number> = {
    carbs: opts.carbs,
    protein: opts.protein,
    fat: opts.fat,
  };
  const out: BubbleEntry[] = [];
  (["carbs", "protein", "fat"] as Macro[]).forEach((m, i) => {
    const grams = Math.round(macros[m] * 10) / 10;
    if (grams > 0) {
      out.push({
        id: `${foodLogId}-${i}`,
        foodLogId,
        macro: m,
        grams,
        foodName: opts.foodName,
        addedAt: opts.addedAt,
        meal_slot: opts.meal_slot,
      });
    }
  });
  return out;
}

function defaultRandomSuffix(): string {
  return Math.random().toString(36).slice(2, 9);
}

/* ------------------------------------------------------------------ */
/* Legacy meal_slot backfill (Step 02 §식사 슬롯 자동 분류)            */
/* ------------------------------------------------------------------ */

import { inferMealSlot } from "./foods";

/**
 * Returns { entries, mutated } where mutated=true means at least one
 * legacy entry was backfilled and the caller should persist to localStorage.
 */
export function backfillMealSlots(
  entries: BubbleEntry[],
): { entries: BubbleEntry[]; mutated: boolean } {
  let mutated = false;
  const next = entries.map((e) => {
    if (!e.meal_slot) {
      mutated = true;
      return { ...e, meal_slot: inferMealSlot(e.addedAt) };
    }
    return e;
  });
  return { entries: next, mutated };
}
