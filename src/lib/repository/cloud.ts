/**
 * Cloud Repository — fetch /api/* (Supabase 백엔드).
 * 세션 쿠키는 credentials: "include"로 Supabase Auth가 발급한 sb-* 쿠키 자동 전송.
 * 401 응답은 즉시 /auth/login으로 redirect 후 CloudAuthError throw.
 */
import {
  CloudAuthError,
  CloudPaywallError,
  type FavoriteRow,
  type FoodInsert,
  type FoodLogInsert,
  type FoodLogRow,
  type FoodRow,
  type PaywallFeature,
  type Repository,
  type UserGoalInsert,
  type UserNotifications,
  type UserProfileInsert,
  type UserProfileRow,
} from "./types";
import type { ResolvedGoal } from "@/lib/goal";

async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    // iOS WebView가 GET 응답을 적극 캐시 — 추가/삭제 후 stale 방지
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (res.status === 401) {
    // 세션 만료 — 즉시 로그인으로 이동. 현재 경로를 next로 보관해 복귀 가능.
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth/")) {
      const next = window.location.pathname + window.location.search;
      window.location.assign(`/auth/login?next=${encodeURIComponent(next)}`);
    }
    throw new CloudAuthError();
  }
  if (res.status === 402) {
    // Step 17 entitlements 한도 초과 — feature를 담아 caller가 PaywallModal 표시.
    const json = (await res.json().catch(() => ({}))) as {
      code?: string;
      feature?: PaywallFeature;
      message?: string;
    };
    throw new CloudPaywallError(
      json.feature ?? "ai",
      json.message ?? "Pro 플랜에서 이용할 수 있어요.",
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`api ${path} ${res.status}: ${body.slice(0, 200)}`);
  }
  // 빈 body 응답 처리 (204 또는 201 with null body 등) — JSON parse 실패 방지
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}

export const cloudRepository: Repository = {
  foods: {
    list: () => api<FoodRow[]>("/foods"),
    create: (food: FoodInsert) =>
      api<FoodRow>("/foods", { method: "POST", body: JSON.stringify(food) }),
    update: (id: string, patch: Partial<FoodInsert>) =>
      api<void>(`/foods?id=${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      }),
    remove: (id: string) => api<void>(`/foods?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  foodLogs: {
    listByDate: (date: string) => api<FoodLogRow[]>(`/food-logs?date=${encodeURIComponent(date)}`),
    listByRange: (from: string, to: string) =>
      api<FoodLogRow[]>(`/food-logs?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    create: (log: FoodLogInsert) =>
      api<FoodLogRow>("/food-logs", {
        method: "POST",
        body: JSON.stringify(log),
      }),
    remove: (id: string) =>
      api<void>(`/food-logs?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
  },
  userGoal: {
    get: (date?: string) =>
      api<ResolvedGoal>(`/user-goals${date ? `?date=${encodeURIComponent(date)}` : ""}`),
    getMonth: (yyyymm: string) =>
      api<Record<string, ResolvedGoal>>(`/user-goals/month?yyyymm=${encodeURIComponent(yyyymm)}`),
    put: (goal: UserGoalInsert) =>
      api<void>("/user-goals", {
        method: "POST",
        body: JSON.stringify(goal),
      }),
  },
  favorites: {
    list: () => api<FavoriteRow[]>("/favorites"),
    add: (food_id: string) =>
      api<void>("/favorites", {
        method: "POST",
        body: JSON.stringify({ food_id }),
      }),
    remove: (food_id: string) =>
      api<void>(`/favorites?food_id=${encodeURIComponent(food_id)}`, {
        method: "DELETE",
      }),
  },
  userProfile: {
    get: () => api<UserProfileRow | null>("/user-profile"),
    put: (profile: UserProfileInsert) =>
      api<UserProfileRow>("/user-profile", {
        method: "PUT",
        body: JSON.stringify(profile),
      }),
  },
  userNotifications: {
    get: () => api<UserNotifications>("/user-notifications"),
    put: (times: string[], enabled?: boolean) =>
      api<UserNotifications>("/user-notifications", {
        method: "PUT",
        body: JSON.stringify({ times, ...(enabled !== undefined && { enabled }) }),
      }),
  },
};
