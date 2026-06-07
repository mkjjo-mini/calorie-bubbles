/**
 * Repository 추상화 — Cloud 어댑터(/api/* + Supabase) 한 가지만 사용.
 * (v1 BM 결정 시 LocalStorage 어댑터는 v2로 미뤘음)
 *
 *  Standalone Auth 전환 후 — user_id (uuid, auth.users.id) 사용.
 */
import type { ResolvedGoal } from "@/lib/goal";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export interface FoodRow {
  id: string;
  user_id: string;
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
  /** AI 음식 추가 메타데이터 (step-12) */
  created_via?: "manual" | "search" | "ai_photo" | "ai_text";
  photo_url?: string | null;
  source_text?: string | null;
  source_refs?: Array<{ title?: string; url?: string }> | null;
  ai_confidence?: number | null;
  created_at: string;
  updated_at: string;
}

export type FoodInsert = Omit<FoodRow, "id" | "user_id" | "created_at" | "updated_at">;

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
  user_id: string;
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

export interface UserNotifications {
  /** "HH:MM" 시간 배열 (예: ["08:00","12:30"]). 최대 24개 */
  times: string[];
  /** 마스터 on/off 토글. false면 times가 있어도 알림 비활성 */
  enabled: boolean;
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
    /** 부분 수정 — meal_slot 변경·grams 조정 등 */
    patch(id: string, patch: { meal_slot?: string; qty_g?: number }): Promise<void>;
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
  userNotifications: {
    get(): Promise<UserNotifications>;
    put(times: string[], enabled?: boolean): Promise<UserNotifications>;
  };
}

/**
 * Worker가 401 SESSION_EXPIRED 응답 시 — Supabase 세션이 만료되거나 잘못된 경우.
 * cloud.ts의 api() 래퍼가 자동으로 /auth/login으로 redirect 후 throw.
 */
export class CloudAuthError extends Error {
  constructor() {
    super("CloudAuthError");
    this.name = "CloudAuthError";
  }
}

/**
 * Worker가 402 PAYMENT_REQUIRED 응답 시 — Step 17 entitlements 한도 초과.
 * 호출 측이 catch해서 `feature`에 맞는 PaywallModal을 표시한다.
 *
 *   try { await cloudRepository.foods.create(insert); }
 *   catch (e) {
 *     if (e instanceof CloudPaywallError) {
 *       setPaywall({ feature: e.feature, open: true });
 *     } else { ... }
 *   }
 */
export type PaywallFeature =
  | "ai"
  | "custom_food"
  | "past_edit"
  | "notifications"
  | "goal_wizard"
  | "ads";

export class CloudPaywallError extends Error {
  readonly feature: PaywallFeature;
  readonly serverMessage: string;
  constructor(feature: PaywallFeature, message: string) {
    super(`CloudPaywallError(${feature})`);
    this.name = "CloudPaywallError";
    this.feature = feature;
    this.serverMessage = message;
  }
}
