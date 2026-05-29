/**
 * /api/user-notifications — 알림 시간 관리 (Pro 전용).
 *
 * GET  /api/user-notifications  → { times: string[], enabled: boolean }
 * PUT  /api/user-notifications  → body: { times?: HH:MM[], enabled?: boolean }
 */
import type { Env } from "../auth/env";
import { jsonError, withUser } from "../auth/middleware";
import { getUserTier, jsonPaywall } from "../auth/entitlements";
import { getEntitlements } from "@/lib/entitlements";

const NOTIFY_TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const MAX_NOTIFICATIONS = 24;

export async function handleUserNotifications(
  req: Request,
  env: Env,
): Promise<Response> {
  return withUser(req, env, async ({ userId, admin }) => {
    if (req.method === "GET") {
      const [notifRes, entRes] = await Promise.all([
        admin.from("user_notifications").select("time").eq("user_id", userId).order("time"),
        admin
          .from("user_entitlements")
          .select("notifications_enabled")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      if (notifRes.error) return jsonError(500, "DB_ERROR", notifRes.error.message);
      const times = (notifRes.data ?? []).map((r: { time: string }) => r.time);
      const enabled = entRes.data?.notifications_enabled ?? true;
      return Response.json({ times, enabled });
    }

    if (req.method === "PUT") {
      // Pro 게이트
      const tier = await getUserTier(env, admin, userId);
      if (!getEntitlements(tier).pushNotifications) {
        return jsonPaywall("notifications");
      }

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

      // 마스터 토글 업데이트
      if (typeof b.enabled === "boolean") {
        const { error } = await admin
          .from("user_entitlements")
          .upsert(
            { user_id: userId, notifications_enabled: b.enabled },
            { onConflict: "user_id" },
          );
        if (error) return jsonError(500, "DB_ERROR", error.message);
      }

      // times가 없으면 enabled 토글만 하고 반환
      if (b.times === undefined) {
        const { data: entData } = await admin
          .from("user_entitlements")
          .select("notifications_enabled")
          .eq("user_id", userId)
          .maybeSingle();
        const { data: notifData } = await admin
          .from("user_notifications")
          .select("time")
          .eq("user_id", userId)
          .order("time");
        return Response.json({
          times: (notifData ?? []).map((r: { time: string }) => r.time),
          enabled: entData?.notifications_enabled ?? true,
        });
      }

      if (!Array.isArray(b.times)) {
        return jsonError(400, "INVALID_BODY", "times must be array");
      }
      for (const t of b.times) {
        if (typeof t !== "string" || !NOTIFY_TIME_RE.test(t)) {
          return jsonError(400, "INVALID_BODY", `invalid time "${String(t)}" — must be HH:MM`);
        }
      }
      const times = Array.from(new Set(b.times as string[])).sort();
      if (times.length > MAX_NOTIFICATIONS) {
        return jsonError(422, "TOO_MANY_NOTIFICATIONS", `최대 ${MAX_NOTIFICATIONS}개까지 추가할 수 있어요`);
      }

      const { error: delError } = await admin
        .from("user_notifications")
        .delete()
        .eq("user_id", userId);
      if (delError) return jsonError(500, "DB_ERROR", delError.message);

      if (times.length > 0) {
        const rows = times.map((time) => ({ user_id: userId, time }));
        const { error: insError } = await admin.from("user_notifications").insert(rows);
        if (insError) return jsonError(500, "DB_ERROR", insError.message);
      }

      const { data: entData } = await admin
        .from("user_entitlements")
        .select("notifications_enabled")
        .eq("user_id", userId)
        .maybeSingle();

      return Response.json({ times, enabled: entData?.notifications_enabled ?? true });
    }

    return new Response("Method Not Allowed", { status: 405 });
  });
}
