export type Macro = "carbs" | "protein" | "fat";

export interface FoodPreset {
  id: string;
  name: string;
  carbs: number; // grams
  protein: number;
  fat: number;
}

export const FOOD_PRESETS: FoodPreset[] = [
  { id: "rice", name: "밥 한공기", carbs: 68, protein: 6, fat: 1 },
  { id: "chicken", name: "닭가슴살 100g", carbs: 0, protein: 31, fat: 3 },
  { id: "egg", name: "계란 1개", carbs: 1, protein: 6, fat: 5 },
  { id: "banana", name: "바나나 1개", carbs: 27, protein: 1, fat: 0 },
  { id: "kimbap", name: "김밥 1줄", carbs: 60, protein: 10, fat: 8 },
  { id: "ramen", name: "라면 1봉", carbs: 79, protein: 10, fat: 16 },
  { id: "milk", name: "우유 1컵", carbs: 12, protein: 8, fat: 8 },
  { id: "avocado", name: "아보카도 1/2", carbs: 9, protein: 2, fat: 15 },
  { id: "tofu", name: "두부 1/2모", carbs: 3, protein: 12, fat: 7 },
  { id: "americano", name: "아메리카노", carbs: 2, protein: 0, fat: 0 },
  { id: "sweetpotato", name: "고구마 1개", carbs: 30, protein: 2, fat: 0 },
  { id: "samgyeopsal", name: "삼겹살 200g", carbs: 0, protein: 40, fat: 60 },
  { id: "proteinbar", name: "프로틴바 1개", carbs: 20, protein: 20, fat: 5 },
];

export const MACRO_COLORS: Record<Macro, string> = {
  carbs: "#FFD700",
  protein: "#FF6B6B",
  fat: "#74B9FF",
};

export const MACRO_LABELS: Record<Macro, string> = {
  carbs: "탄수화물",
  protein: "단백질",
  fat: "지방",
};

// kcal per gram
export const MACRO_KCAL: Record<Macro, number> = {
  carbs: 4,
  protein: 4,
  fat: 9,
};

export const DAILY_GOAL_KCAL = 2000;

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

import { Sunrise, Sun, Moon, Cookie, type LucideIcon } from "lucide-react";

export const MEAL_SLOT_META: Record<MealSlot, { Icon: LucideIcon; label: string }> = {
  breakfast: { Icon: Sunrise, label: "아침" },
  lunch: { Icon: Sun, label: "점심" },
  dinner: { Icon: Moon, label: "저녁" },
  snack: { Icon: Cookie, label: "간식" },
};

export const MEAL_SLOT_ORDER: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

/** Infer meal slot from timestamp using Asia/Seoul hour. */
export function inferMealSlot(addedAt: number): MealSlot {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Seoul",
    }).format(new Date(addedAt)),
  ) % 24;
  if (hour >= 5 && hour <= 10) return "breakfast";
  if (hour >= 11 && hour <= 13) return "lunch";
  if (hour >= 17 && hour <= 20) return "dinner";
  return "snack";
}

export interface BubbleEntry {
  id: string;
  foodLogId: string;
  macro: Macro;
  grams: number;
  foodName: string;
  addedAt: number;
  meal_slot?: MealSlot;
}

export function caloriesFor(entry: { carbs: number; protein: number; fat: number }) {
  return entry.carbs * 4 + entry.protein * 4 + entry.fat * 9;
}

/** Strip quantity suffix (e.g. "닭가슴살 100g" -> "닭가슴살") */
export function displayName(fullName: string): string {
  return fullName.split(" ")[0];
}
