/**
 * /api/food-logs — 식사 기록 CRUD.
 *
 * GET    /api/food-logs?date=YYYY-MM-DD
 * GET    /api/food-logs?from=YYYY-MM-DD&to=YYYY-MM-DD
 * GET    /api/food-logs?recent=N — 최근 사용한 distinct food_id N개 (디바이스 sync용)
 * POST   /api/food-logs
 * DELETE /api/food-logs?id=<uuid>
 */
import type { Env } from "../auth/env";
import { jsonError, withUser } from "../auth/middleware";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function handleFoodLogs(req: Request, env: Env): Promise<Response> {
  return withUser(req, env, async ({ userId, admin }) => {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const date = url.searchParams.get("date");
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const recentParam = url.searchParams.get("recent");

      // 최근 사용한 distinct food_id (디바이스 간 sync용 — localStorage 대체)
      if (recentParam) {
        const n = Math.min(Math.max(parseInt(recentParam, 10) || 10, 1), 50);
        // 최근 30일 / 최대 500 row 조회 후 클라이언트 distinct (DISTINCT ON은 PostgREST 미지원)
        const { data, error } = await admin
          .from("food_logs")
          .select("food_id, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) return jsonError(500, "DB_ERROR", error.message);
        const seen = new Set<string>();
        const result: string[] = [];
        for (const row of data ?? []) {
          if (!row.food_id || seen.has(row.food_id)) continue;
          seen.add(row.food_id);
          result.push(row.food_id);
          if (result.length >= n) break;
        }
        return Response.json(result);
      }

      if (date) {
        if (!DATE_RE.test(date)) {
          return jsonError(400, "INVALID_BODY", "date must be YYYY-MM-DD");
        }
        const { data, error } = await admin
          .from("food_logs")
          .select("*, food:foods(name, food_code, source, is_estimated, deleted_at)")
          .eq("user_id", userId)
          .eq("logged_date", date)
          .order("created_at", { ascending: true });
        if (error) return jsonError(500, "DB_ERROR", error.message);
        return Response.json(data ?? []);
      }

      if (from && to) {
        if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
          return jsonError(400, "INVALID_BODY", "from/to must be YYYY-MM-DD");
        }
        if (from > to) {
          return jsonError(400, "INVALID_BODY", "from must be <= to");
        }
        const { data, error } = await admin
          .from("food_logs")
          .select("*, food:foods(name, food_code, source, is_estimated, deleted_at)")
          .eq("user_id", userId)
          .gte("logged_date", from)
          .lte("logged_date", to)
          .order("logged_date", { ascending: true })
          .order("created_at", { ascending: true });
        if (error) return jsonError(500, "DB_ERROR", error.message);
        return Response.json(data ?? []);
      }

      return jsonError(400, "INVALID_BODY", "missing date or from/to");
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
      const insert = { ...(body as Record<string, unknown>), user_id: userId };
      delete (insert as Record<string, unknown>).id;
      delete (insert as Record<string, unknown>).user_key;
      delete (insert as Record<string, unknown>).created_at;
      const { data, error } = await admin
        .from("food_logs")
        .insert(insert)
        .select()
        .single();
      if (error) {
        if (error.code === "23503") {
          return jsonError(400, "INVALID_FOOD_ID", "food_id가 유효하지 않습니다");
        }
        return jsonError(500, "DB_ERROR", error.message);
      }
      return Response.json(data, { status: 201 });
    }

    if (req.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id) return jsonError(400, "INVALID_BODY", "missing id");
      const { error } = await admin
        .from("food_logs")
        .delete()
        .eq("user_id", userId)
        .eq("id", id);
      if (error) return jsonError(500, "DB_ERROR", error.message);
      return new Response(null, { status: 204 });
    }

    return new Response("Method Not Allowed", { status: 405 });
  });
}
