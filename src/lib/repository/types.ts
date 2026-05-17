/**
 * Repository 추상화 — LocalStorage 어댑터와 Cloud 어댑터가 같은 인터페이스 구현.
 * useStorage() 훅이 isPaidUser 기준으로 어느 어댑터 사용할지 결정.
 *
 * 신규 컴포넌트는 useStorage()를 사용해서 자연스럽게 cloud 동기화 받음.
 * 기존 컴포넌트(add.tsx 등)의 localStorage 직접 호출은 점진 마이그레이션 (별도 PR).
 */
import type { ResolvedGoal } from "@/lib/goal";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export interface FoodRow {
  id: string;
  user_key: number;
  source: "user" | "api" | "preset";
  food_code?: string | null;
  name: string;
  serving_unit: string;
  serving_amount: number;
  serving_g: number;
  kcal: number;
  carb_g: number;
  protein_g: number;
  fat_g: number;
  category?: string | null;
  is_estimated: boolean;
  created_at: string;
  updated_at: string;
}

export type FoodInsert = Omit<
  FoodRow,
  "id" | "user_key" | "created_at" | "updated_at"
>;

export interface FoodLogRow {
  id: string;
  food_id: string;
  logged_date: string;
  meal_slot: MealSlot;
  grams: number;
  kcal: number;
  carb_g: number;
  protein_g: number;
  fat_g: number;
  created_at: string;
  /** GET 시 foods JOIN으로 채워짐 */
  food?: {
    name: string;
    food_code?: string | null;
    source: "user" | "api" | "preset";
    is_estimated: boolean;
  };
}

export type FoodLogInsert = Omit<FoodLogRow, "id" | "created_at" | "food">;

export interface FavoriteRow {
  food_id: string;
  added_at: string;
  food?: {
    name: string;
    food_code?: string | null;
    source: "user" | "api" | "preset";
  };
}

export interface UserGoalInsert {
  /** 일일 칼로리 목표 (kcal). 필수 */
  daily_kcal_value: number;
  daily_kcal_dir?: "min" | "max"; // default 'max' (서버측)
  /** 매크로 목표 (g). nullable — 미설정 시 코드 측 DEFAULT_GOAL fallback */
  protein_g_value?: number | null;
  protein_g_dir?: "min" | "max"; // default 'min'
  carb_g_value?: number | null;
  carb_g_dir?: "min" | "max"; // default 'max'
  fat_g_value?: number | null;
  fat_g_dir?: "min" | "max"; // default 'max'
  effective_from?: string;
  effective_to?: string | null;
  notification_time?: string | null;
}

export interface UserProfileRow {
  user_key: number;
  height_cm: number;
  weight_kg: number;
  sex: "male" | "female";
  birth_year: number;
  activity_level: "sedentary" | "light" | "moderate" | "active" | "very_active";
  goal: "loss" | "maintain" | "gain";
  target_weight_kg: number | null;
  target_period_weeks: number | null;
  created_at: string;
  updated_at: string;
}

export interface UserProfileInsert {
  height_cm: number;
  weight_kg: number;
  sex: "male" | "female";
  birth_year: number;
  activity_level?: "sedentary" | "light" | "moderate" | "active" | "very_active";
  goal?: "loss" | "maintain" | "gain";
  target_weight_kg?: number | null;
  target_period_weeks?: number | null;
}

export interface Repository {
  foods: {
    list(): Promise<FoodRow[]>;
    create(food: FoodInsert): Promise<FoodRow>;
    update(id: string, patch: Partial<FoodInsert>): Promise<void>;
    remove(id: string): Promise<void>;
  };
  foodLogs: {
    /** date: "YYYY-MM-DD" (KST) */
    listByDate(date: string): Promise<FoodLogRow[]>;
    /** from/to: "YYYY-MM-DD" (KST), inclusive — 캘린더 월별 일괄 조회 */
    listByRange(from: string, to: string): Promise<FoodLogRow[]>;
    create(log: FoodLogInsert): Promise<FoodLogRow>;
    remove(id: string): Promise<void>;
  };
  userGoal: {
    /** date 생략 시 오늘 (서버측 todayKST) */
    get(date?: string): Promise<ResolvedGoal>;
    /** yyyymm: "YYYY-MM" — 그 월 일자별 effective ResolvedGoal map */
    getMonth(yyyymm: string): Promise<Record<string, ResolvedGoal>>;
    put(goal: UserGoalInsert): Promise<void>;
  };
  favorites: {
    list(): Promise<FavoriteRow[]>;
    add(food_id: string): Promise<void>;
    remove(food_id: string): Promise<void>;
  };
  userProfile: {
    get(): Promise<UserProfileRow | null>;
    put(profile: UserProfileInsert): Promise<UserProfileRow>;
  };
}

/** Worker가 401 SESSION_EXPIRED 응답 시 — useSession 자동 재로그인 트리거 */
export class CloudAuthError extends Error {
  constructor() {
    super("CloudAuthError");
    this.name = "CloudAuthError";
  }
}
