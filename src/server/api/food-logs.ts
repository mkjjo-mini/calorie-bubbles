/**
 * /api/food-logs — 식사 기록 CRUD.
 *
 * GET    /api/food-logs?date=YYYY-MM-DD       → 해당 날짜 logs (foods JOIN으로 name 포함)
 * POST   /api/food-logs                       → INSERT
 *                                                body: { food_id, logged_date, meal_slot,
 *                                                        grams, kcal, carb_g, protein_g, fat_g }
 * DELETE /api/food-logs?id=<uuid>             → DELETE
 */
import type { Env } from "../auth/env";
import { jsonError, withSession } from "../auth/middleware";
import { getSupabase } from "../db/supabase";

export async function handleFoodLogs(req: Request, env: Env): Promise<Response> {
  return withSession(req, env, async (userKey) => {
    const supabase = getSupabase(env);
    const url = new URL(req.url);

    if (req.method === "GET") {
      const date = url.searchParams.get("date");
      if (!date) return jsonError(400, "INVALID_BODY", "missing date");
      const { data, error } = await supabase
        .from("food_logs")
        .select("*, food:foods(name, food_code, source, is_estimated)")
        .eq("user_key", userKey)
        .eq("logged_date", date)
        .order("created_at", { ascending: true });
      if (error) return jsonError(500, "DB_ERROR", error.message);
      return Response.json(data ?? []);
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
      const insert = { ...(body as Record<string, unknown>), user_key: userKey };
      delete (insert as Record<string, unknown>).id;
      delete (insert as Record<string, unknown>).created_at;
      const { data, error } = await supabase
        .from("food_logs")
        .insert(insert)
        .select()
        .single();
      if (error) {
        // food_id FK 위반 (food 없음)
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
      const { error } = await supabase
        .from("food_logs")
        .delete()
        .eq("user_key", userKey)
        .eq("id", id);
      if (error) return jsonError(500, "DB_ERROR", error.message);
      return new Response(null, { status: 204 });
    }

    return new Response("Method Not Allowed", { status: 405 });
  });
}
