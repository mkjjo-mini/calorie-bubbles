/**
 * /api/user-profile — 사용자 프로필 (신체정보 + 목표).
 *
 * GET  /api/user-profile  → 본인 row 반환 (없으면 null)
 * PUT  /api/user-profile  → UPSERT (user_key 서버 강제, onConflict: user_key)

 *                           body: { height_cm, weight_kg, sex, birth_year,
 *                                   activity_level?, goal?,
 *                                   target_weight_kg?, target_period_weeks?,
 *                                   notification_times?: string[] (HH:MM, 30분 단위) }
 */
import type { Env } from "../auth/env";
import { jsonError, withSession } from "../auth/middleware";
import { getSupabase } from "../db/supabase";

const VALID_ACTIVITY = new Set([
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
]);
const VALID_GOAL = new Set(["loss", "maintain", "gain"]);
const NOTIFY_TIME_RE = /^([01][0-9]|2[0-3]):(00|30)$/;

export async function handleUserProfile(
  req: Request,
  env: Env,
): Promise<Response> {
  return withSession(req, env, async (userKey) => {
    const supabase = getSupabase(env);

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_key", userKey)
        .maybeSingle();
      if (error) return jsonError(500, "DB_ERROR", error.message);
      return Response.json(data ?? null);
    }

    if (req.method === "PUT") {
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

      // --- 필수 필드 검증 ---
      const height = Number(b.height_cm);
      if (!Number.isFinite(height) || height < 50 || height > 300) {
        return jsonError(
          400,
          "INVALID_BODY",
          "height_cm must be a number between 50 and 300",
        );
      }
      const weight = Number(b.weight_kg);
      if (!Number.isFinite(weight) || weight < 10 || weight > 500) {
        return jsonError(
          400,
          "INVALID_BODY",
          "weight_kg must be a number between 10 and 500",
        );
      }
      if (b.sex !== "male" && b.sex !== "female") {
        return jsonError(400, "INVALID_BODY", "sex must be 'male' or 'female'");
      }
      const birthYear = Number(b.birth_year);
      if (
        !Number.isInteger(birthYear) ||
        birthYear < 1900 ||
        birthYear > new Date().getFullYear()
      ) {
        return jsonError(
          400,
          "INVALID_BODY",
          "birth_year must be a valid year",
        );
      }

      // --- 선택 필드 검증 ---
      if (b.activity_level !== undefined && !VALID_ACTIVITY.has(b.activity_level as string)) {
        return jsonError(
          400,
          "INVALID_BODY",
          "activity_level must be one of: sedentary, light, moderate, active, very_active",
        );
      }
      if (b.goal !== undefined && !VALID_GOAL.has(b.goal as string)) {
        return jsonError(
          400,
          "INVALID_BODY",
          "goal must be one of: loss, maintain, gain",
        );
      }
      const targetWeight =
        b.target_weight_kg !== undefined && b.target_weight_kg !== null
          ? Number(b.target_weight_kg)
          : null;
      if (
        targetWeight !== null &&
        (!Number.isFinite(targetWeight) || targetWeight < 10 || targetWeight > 500)
      ) {
        return jsonError(
          400,
          "INVALID_BODY",
          "target_weight_kg must be a number between 10 and 500 or null",
        );
      }
      const targetPeriod =
        b.target_period_weeks !== undefined && b.target_period_weeks !== null
          ? Number(b.target_period_weeks)
          : null;
      if (
        targetPeriod !== null &&
        (!Number.isInteger(targetPeriod) || targetPeriod < 1 || targetPeriod > 520)
      ) {
        return jsonError(
          400,
          "INVALID_BODY",
          "target_period_weeks must be a positive integer or null",
        );
      }

      // notification_times: string[] (각 원소 HH:MM, 30분 단위만)
      let notificationTimes: string[] | null = null;
      if (b.notification_times !== undefined && b.notification_times !== null) {
        if (!Array.isArray(b.notification_times)) {
          return jsonError(
            400,
            "INVALID_BODY",
            "notification_times must be an array of HH:MM strings",
          );
        }
        for (const t of b.notification_times) {
          if (typeof t !== "string" || !NOTIFY_TIME_RE.test(t)) {
            return jsonError(
              400,
              "INVALID_BODY",
              `notification_times: invalid 30-min slot "${String(t)}"`,
            );
          }
        }
        // dedupe + sort
        notificationTimes = Array.from(new Set(b.notification_times as string[])).sort();
      }

      const upsertRow = {
        user_key: userKey,
        height_cm: height,
        weight_kg: weight,
        sex: b.sex as "male" | "female",
        birth_year: birthYear,
        ...(b.activity_level !== undefined
          ? { activity_level: b.activity_level }
          : {}),
        ...(b.goal !== undefined ? { goal: b.goal } : {}),
        target_weight_kg: targetWeight,
        target_period_weeks: targetPeriod,
        notification_times: notificationTimes,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("user_profiles")
        .upsert(upsertRow, { onConflict: "user_key" })
        .select()
        .single();
      if (error) return jsonError(500, "DB_ERROR", error.message);
      return Response.json(data);
    }

    return new Response("Method Not Allowed", { status: 405 });
  });
}
