/**
 * Cloud Repository — fetch /api/* (Step 07 Supabase 백엔드).
 * 세션 쿠키는 credentials: "include"로 자동 첨부 (Step 01 발급).
 * 401 응답은 CloudAuthError throw — useStorage twin-write가 catch해서 localStorage 폴백.
 */
import {
  CloudAuthError,
  type FavoriteRow,
  type FoodInsert,
  type FoodLogInsert,
  type FoodLogRow,
  type FoodRow,
  type Repository,
  type UserGoalInsert,
} from "./types";
import type { ResolvedGoal } from "@/lib/goal";

async function api<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
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
  if (res.status === 401) throw new CloudAuthError();
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`api ${path} ${res.status}: ${body.slice(0, 200)}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
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
    remove: (id: string) =>
      api<void>(`/foods?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  foodLogs: {
    listByDate: (date: string) =>
      api<FoodLogRow[]>(`/food-logs?date=${encodeURIComponent(date)}`),
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
      api<ResolvedGoal>(
        `/user-goals${date ? `?date=${encodeURIComponent(date)}` : ""}`,
      ),
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
};
