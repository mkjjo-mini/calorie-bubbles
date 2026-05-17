/**
 * /api/user-goals — history pattern.
 *
 * GET   /api/user-goals?date=YYYY-MM-DD       → 그 날짜에 적용되는 goal (없으면 default)
 *                                                date 생략 시 오늘 KST
 * GET   /api/user-goals/month?yyyymm=YYYY-MM  → 그 월의 일자별 ResolvedGoal map
 *                                                (캘린더 진척 도트용)
 * POST  /api/user-goals                       → 새 row INSERT (override는 새 row로)
 *                                                body: { daily_kcal_value, daily_kcal_dir?,
 *                                                        protein_g_value?, protein_g_dir?,
 *                                                        carb_g_value?, carb_g_dir?,
 *                                                        fat_g_value?, fat_g_dir?,
 *                                                        effective_from?, effective_to?,
 *                                                        notification_time? }
 *
 * 변경은 항상 INSERT (history 보존). 기존 row update 없음.
 */
import type { Env } from "../auth/env";
import { jsonError, withSession } from "../auth/middleware";
import { getSupabase } from "../db/supabase";
import { DEFAULT_GOAL, resolveGoal, type UserGoalRow } from "@/lib/goal";
import { todayKST } from "@/lib/time";

const YYYYMM_RE = /^\d{4}-\d{2}$/;

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
      const dailyKcal = Number(b.daily_kcal_value);
      if (!Number.isFinite(dailyKcal) || dailyKcal <= 0) {
        return jsonError(
          400,
          "INVALID_BODY",
          "daily_kcal_value must be positive number",
        );
      }
      // dir 값 검증 — DB CHECK도 있지만 명시적으로 차단
      const dirOk = (v: unknown) => v === "min" || v === "max" || v === undefined;
      if (
        !dirOk(b.daily_kcal_dir) ||
        !dirOk(b.protein_g_dir) ||
        !dirOk(b.carb_g_dir) ||
        !dirOk(b.fat_g_dir)
      ) {
        return jsonError(400, "INVALID_BODY", "dir must be 'min' or 'max'");
      }

      const newEffectiveFrom =
        (b.effective_from as string | undefined) ?? todayKST();

      // 새 row의 effective_from 이전에 시작하고 아직 열려 있는 row를 닫는다.
      // (effective_to IS NULL AND effective_from < newEffectiveFrom AND user_key = ?)
      // effective_to = newEffectiveFrom 의 하루 전 날짜
      const prevDate = new Date(newEffectiveFrom);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().slice(0, 10);

      const { error: closeError } = await supabase
        .from("user_goals")
        .update({ effective_to: prevDateStr })
        .eq("user_key", userKey)
        .is("effective_to", null)
        .lt("effective_from", newEffectiveFrom);
      if (closeError) return jsonError(500, "DB_ERROR", closeError.message);

      const insert = {
        user_key: userKey,
        daily_kcal_value: Math.round(dailyKcal),
        // dir은 undefined 시 DB default (max for kcal/carb/fat, min for protein) 적용
        ...(b.daily_kcal_dir ? { daily_kcal_dir: b.daily_kcal_dir } : {}),
        protein_g_value: (b.protein_g_value as number | null | undefined) ?? null,
        ...(b.protein_g_dir ? { protein_g_dir: b.protein_g_dir } : {}),
        carb_g_value: (b.carb_g_value as number | null | undefined) ?? null,
        ...(b.carb_g_dir ? { carb_g_dir: b.carb_g_dir } : {}),
        fat_g_value: (b.fat_g_value as number | null | undefined) ?? null,
        ...(b.fat_g_dir ? { fat_g_dir: b.fat_g_dir } : {}),
        effective_from: newEffectiveFrom,
        effective_to: (b.effective_to as string | null | undefined) ?? null,
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

/**
 * GET /api/user-goals/month?yyyymm=YYYY-MM
 * → Record<dateStr, ResolvedGoal>  (그 월 각 일자별 effective 목표)
 *
 * 클라(캘린더)는 한 달치 일자별 진척 도트를 그리기 위해 그 월에 적용되는 goal을 일자별로 알아야 함.
 * 서버 측에서 그 월 시작일 기준 마지막 effective row + effective_from이 그 월 안인 row들을 합산해
 * 일자별 map으로 응답.
 */
export async function handleUserGoalsMonth(
  req: Request,
  env: Env,
): Promise<Response> {
  return withSession(req, env, async (userKey) => {
    if (req.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const url = new URL(req.url);
    const yyyymm = url.searchParams.get("yyyymm");
    if (!yyyymm || !YYYYMM_RE.test(yyyymm)) {
      return jsonError(400, "INVALID_BODY", "yyyymm must be YYYY-MM");
    }
    const [yearStr, monthStr] = yyyymm.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr); // 1-12
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthStart = `${yyyymm}-01`;
    const monthEnd = `${yyyymm}-${String(daysInMonth).padStart(2, "0")}`;

    const supabase = getSupabase(env);
    // 그 월에 effective(인)인 모든 row 가져오기:
    //  effective_from <= monthEnd AND (effective_to IS NULL OR effective_to >= monthStart)
    const { data, error } = await supabase
      .from("user_goals")
      .select("*")
      .eq("user_key", userKey)
      .lte("effective_from", monthEnd)
      .or(`effective_to.is.null,effective_to.gte.${monthStart}`)
      .order("effective_from", { ascending: true });
    if (error) return jsonError(500, "DB_ERROR", error.message);

    const rows = (data ?? []) as UserGoalRow[];
    const result: Record<string, ReturnType<typeof resolveGoal>> = {};
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${yyyymm}-${String(day).padStart(2, "0")}`;
      // 일자별 effective row = effective_from <= dateStr AND (effective_to IS NULL OR effective_to >= dateStr) 중 가장 최근
      let chosen: UserGoalRow | null = null;
      for (const r of rows) {
        if (r.effective_from > dateStr) continue;
        if (r.effective_to !== null && r.effective_to < dateStr) continue;
        if (!chosen || r.effective_from > chosen.effective_from) chosen = r;
      }
      result[dateStr] = chosen ? resolveGoal(chosen) : DEFAULT_GOAL;
    }
    return Response.json(result);
  });
}
