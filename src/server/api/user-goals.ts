/**
 * /api/user-goals — history-style (INSERT-only).
 *
 * GET   /api/user-goals?date=YYYY-MM-DD
 * GET   /api/user-goals/month?yyyymm=YYYY-MM
 * POST  /api/user-goals
 */
import type { Env } from "../auth/env";
import { jsonError, withUser } from "../auth/middleware";
import { DEFAULT_GOAL, resolveGoal, type UserGoalRow } from "@/lib/goal";
import { todayKST } from "@/lib/time";

const YYYYMM_RE = /^\d{4}-\d{2}$/;

export async function handleUserGoals(req: Request, env: Env): Promise<Response> {
  return withUser(req, env, async ({ userId, admin }) => {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const date = url.searchParams.get("date") ?? todayKST();
      const { data, error } = await admin
        .from("user_goals")
        .select("*")
        .eq("user_id", userId)
        .lte("effective_from", date)
        .or(`effective_to.is.null,effective_to.gte.${date}`)
        .order("effective_from", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return jsonError(500, "DB_ERROR", error.message);
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
        return jsonError(400, "INVALID_BODY", "daily_kcal_value must be positive");
      }
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

      const prevDate = new Date(newEffectiveFrom);
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().slice(0, 10);

      const { error: closeError } = await admin
        .from("user_goals")
        .update({ effective_to: prevDateStr })
        .eq("user_id", userId)
        .is("effective_to", null)
        .lt("effective_from", newEffectiveFrom);
      if (closeError) return jsonError(500, "DB_ERROR", closeError.message);

      // 같은 날 중복 행 방지 — effective_from이 동일한 기존 행 삭제 후 신규 삽입
      const { error: deleteError } = await admin
        .from("user_goals")
        .delete()
        .eq("user_id", userId)
        .eq("effective_from", newEffectiveFrom);
      if (deleteError) return jsonError(500, "DB_ERROR", deleteError.message);

      const insert = {
        user_id: userId,
        daily_kcal_value: Math.round(dailyKcal),
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
      const { data, error } = await admin
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

export async function handleUserGoalsMonth(
  req: Request,
  env: Env,
): Promise<Response> {
  return withUser(req, env, async ({ userId, admin }) => {
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
    const month = Number(monthStr);
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthStart = `${yyyymm}-01`;
    const monthEnd = `${yyyymm}-${String(daysInMonth).padStart(2, "0")}`;

    const { data, error } = await admin
      .from("user_goals")
      .select("*")
      .eq("user_id", userId)
      .lte("effective_from", monthEnd)
      .or(`effective_to.is.null,effective_to.gte.${monthStart}`)
      .order("effective_from", { ascending: true });
    if (error) return jsonError(500, "DB_ERROR", error.message);

    const rows = (data ?? []) as UserGoalRow[];
    const result: Record<string, ReturnType<typeof resolveGoal>> = {};
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${yyyymm}-${String(day).padStart(2, "0")}`;
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
