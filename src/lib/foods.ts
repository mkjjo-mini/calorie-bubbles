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

export interface BubbleEntry {
  id: string;
  macro: Macro;
  grams: number;
  foodName: string;
  addedAt: number;
}

export function caloriesFor(entry: { carbs: number; protein: number; fat: number }) {
  return entry.carbs * 4 + entry.protein * 4 + entry.fat * 9;
}
