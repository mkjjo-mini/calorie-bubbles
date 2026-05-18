/**
 * /api/user-profile — 사용자 프로필 (신체정보 + 목표).
 *
 * GET  /api/user-profile  → 본인 row (없으면 null)
 * PUT  /api/user-profile  → UPSERT (onConflict: user_id)
 */
import type { Env } from "../auth/env";
import { jsonError, withUser } from "../auth/middleware";

const VALID_ACTIVITY = new Set([
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
]);
const VALID_GOAL = new Set(["loss", "maintain", "gain"]);

export async function handleUserProfile(
  req: Request,
  env: Env,
): Promise<Response> {
  return withUser(req, env, async ({ userId, admin }) => {
    if (req.method === "GET") {
      const { data, error } = await admin
        .from("user_profiles")
        .select("*")
        .eq("user_id", userId)
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

      const height = Number(b.height_cm);
      if (!Number.isFinite(height) || height < 50 || height > 300) {
        return jsonError(400, "INVALID_BODY", "height_cm must be 50–300");
      }
      const weight = Number(b.weight_kg);
      if (!Number.isFinite(weight) || weight < 10 || weight > 500) {
        return jsonError(400, "INVALID_BODY", "weight_kg must be 10–500");
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
        return jsonError(400, "INVALID_BODY", "birth_year must be valid");
      }
      if (b.activity_level !== undefined && !VALID_ACTIVITY.has(b.activity_level as string)) {
        return jsonError(400, "INVALID_BODY", "invalid activity_level");
      }
      if (b.goal !== undefined && !VALID_GOAL.has(b.goal as string)) {
        return jsonError(400, "INVALID_BODY", "invalid goal");
      }
      const targetWeight =
        b.target_weight_kg !== undefined && b.target_weight_kg !== null
          ? Number(b.target_weight_kg)
          : null;
      if (
        targetWeight !== null &&
        (!Number.isFinite(targetWeight) || targetWeight < 10 || targetWeight > 500)
      ) {
        return jsonError(400, "INVALID_BODY", "target_weight_kg must be 10–500 or null");
      }
      const targetPeriod =
        b.target_period_weeks !== undefined && b.target_period_weeks !== null
          ? Number(b.target_period_weeks)
          : null;
      if (
        targetPeriod !== null &&
        (!Number.isInteger(targetPeriod) || targetPeriod < 1 || targetPeriod > 520)
      ) {
        return jsonError(400, "INVALID_BODY", "target_period_weeks 1–520 or null");
      }

      const upsertRow = {
        user_id: userId,
        height_cm: height,
        weight_kg: weight,
        sex: b.sex as "male" | "female",
        birth_year: birthYear,
        ...(b.activity_level !== undefined ? { activity_level: b.activity_level } : {}),
        ...(b.goal !== undefined ? { goal: b.goal } : {}),
        target_weight_kg: targetWeight,
        target_period_weeks: targetPeriod,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await admin
        .from("user_profiles")
        .upsert(upsertRow, { onConflict: "user_id" })
        .select()
        .single();
      if (error) return jsonError(500, "DB_ERROR", error.message);
      return Response.json(data);
    }

    return new Response("Method Not Allowed", { status: 405 });
  });
}
