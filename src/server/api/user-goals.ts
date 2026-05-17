/**
 * /api/user-goals — history pattern.
 *
 * GET   /api/user-goals?date=YYYY-MM-DD  → 그 날짜에 적용되는 goal (없으면 default)
 *                                           date 생략 시 오늘 KST
 * POST  /api/user-goals                  → 새 row INSERT (override는 새 row로)
 *                                           body: { daily_kcal, effective_from?, effective_to?,
 *                                                   carb_ratio?, protein_ratio?, fat_ratio?,
 *                                                   notification_time? }
 *
 * 변경은 항상 INSERT (history 보존). 기존 row update 없음.
 */
import type { Env } from "../auth/env";
import { jsonError, withSession } from "../auth/middleware";
import { getSupabase } from "../db/supabase";
import { resolveGoal, type UserGoalRow } from "@/lib/goal";
import { todayKST } from "@/lib/time";

export async function handleUserGoals(req: Request, env: Env): Promise<Response> {
  return withSession(req, env, async (userKey) => {
    const supabase = getSupabase(env);
    const url = new URL(req.url);

    if (req.method === "GET") {
      const date = url.searchParams.get("date") ?? todayKST();
      const { data, error } = await supabase
        .from("user_goals")
        .select("*")
        .eq("user_key", userKey)
        .lte("effective_from", date)
        .or(`effective_to.is.null,effective_to.gte.${date}`)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return jsonError(500, "DB_ERROR", error.message);
      // 코드 측 default fallback (탄단지 nullable)
      return Response.json(resolveGoal(data as UserGoalRow | null));
    }

    if (req.method === "POST") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return jsonError(400, "INVALID_BODY", "body must be JSON");
      }
      if (!body || typeof body !== "object") {
        return jsonError(400, "INVALID_BODY", "body must be object");
      }
      const b = body as Record<string, unknown>;
      const dailyKcal = Number(b.daily_kcal);
      if (!Number.isFinite(dailyKcal) || dailyKcal <= 0) {
        return jsonError(400, "INVALID_BODY", "daily_kcal must be positive number");
      }
      const insert = {
        user_key: userKey,
        daily_kcal: Math.round(dailyKcal),
        effective_from: (b.effective_from as string | undefined) ?? todayKST(),
        effective_to: (b.effective_to as string | null | undefined) ?? null,
        carb_ratio: (b.carb_ratio as number | null | undefined) ?? null,
        protein_ratio: (b.protein_ratio as number | null | undefined) ?? null,
        fat_ratio: (b.fat_ratio as number | null | undefined) ?? null,
        notification_time:
          (b.notification_time as string | null | undefined) ?? null,
      };
      const { data, error } = await supabase
        .from("user_goals")
        .insert(insert)
        .select()
        .single();
      if (error) return jsonError(500, "DB_ERROR", error.message);
      return Response.json(data, { status: 201 });
    }

    return new Response("Method Not Allowed", { status: 405 });
  });
}
