/**
 * /api/user-notifications — 푸시 알림 시각 관리.
 *
 * GET  /api/user-notifications  → 본인 알림 시각 목록 반환 { times: string[] }
 * PUT  /api/user-notifications  → 전체 교체
 *                                 body: { times: string[] (HH:MM, 30분 단위) }
 *                                 빈 배열 허용 (알림 off)
 */
import type { Env } from "../auth/env";
import { jsonError, withSession } from "../auth/middleware";
import { getSupabase } from "../db/supabase";

const NOTIFY_TIME_RE = /^([01][0-9]|2[0-3]):(00|30)$/;

export async function handleUserNotifications(
  req: Request,
  env: Env,
): Promise<Response> {
  return withSession(req, env, async (userKey) => {
    const supabase = getSupabase(env);

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("user_notifications")
        .select("time")
        .eq("user_key", userKey)
        .order("time");
      if (error) return jsonError(500, "DB_ERROR", error.message);
      const times = (data ?? []).map((r: { time: string }) => r.time);
      return Response.json({ times });
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

      if (!Array.isArray(b.times)) {
        return jsonError(
          400,
          "INVALID_BODY",
          "times must be an array of HH:MM strings",
        );
      }
      for (const t of b.times) {
        if (typeof t !== "string" || !NOTIFY_TIME_RE.test(t)) {
          return jsonError(
            400,
            "INVALID_BODY",
            `times: invalid 30-min slot "${String(t)}"`,
          );
        }
      }
      // dedupe + sort
      const times = Array.from(new Set(b.times as string[])).sort();

      // 전체 교체: DELETE all → INSERT new rows
      const { error: delError } = await supabase
        .from("user_notifications")
        .delete()
        .eq("user_key", userKey);
      if (delError) return jsonError(500, "DB_ERROR", delError.message);

      if (times.length > 0) {
        const rows = times.map((time) => ({ user_key: userKey, time }));
        const { error: insError } = await supabase
          .from("user_notifications")
          .insert(rows);
        if (insError) return jsonError(500, "DB_ERROR", insError.message);
      }

      return Response.json({ times });
    }

    return new Response("Method Not Allowed", { status: 405 });
  });
}
