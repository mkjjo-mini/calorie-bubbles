/**
 * /api/foods — 사용자별 음식 라이브러리 CRUD.
 *
 * GET    /api/foods                 → list (전체, updated_at desc)
 * POST   /api/foods                 → INSERT 새 음식
 * PUT    /api/foods?id=<uuid>       → UPDATE (foods_history trigger 자동 기록)
 * DELETE /api/foods?id=<uuid>       → DELETE (food_logs.food_id ON DELETE RESTRICT라
 *                                    참조 중이면 거부됨)
 *
 * 모든 쿼리는 user_key = ? 강제로 본인 데이터만 접근.
 */
import type { Env } from "../auth/env";
import { jsonError, withSession } from "../auth/middleware";
import { getSupabase } from "../db/supabase";

export async function handleFoods(req: Request, env: Env): Promise<Response> {
  return withSession(req, env, async (userKey) => {
    const supabase = getSupabase(env);
    const url = new URL(req.url);

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("foods")
        .select("*")
        .eq("user_key", userKey)
        .order("updated_at", { ascending: false });
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
      // user_key는 서버가 강제 (클라이언트가 보낸 값 무시)
      const insert = { ...(body as Record<string, unknown>), user_key: userKey };
      delete (insert as Record<string, unknown>).id;
      delete (insert as Record<string, unknown>).created_at;
      delete (insert as Record<string, unknown>).updated_at;
      const { data, error } = await supabase
        .from("foods")
        .insert(insert)
        .select()
        .single();
      if (error) return jsonError(500, "DB_ERROR", error.message);
      return Response.json(data, { status: 201 });
    }

    if (req.method === "PUT") {
      const id = url.searchParams.get("id");
      if (!id) return jsonError(400, "INVALID_BODY", "missing id");
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return jsonError(400, "INVALID_BODY", "body must be JSON");
      }
      if (!body || typeof body !== "object") {
        return jsonError(400, "INVALID_BODY", "body must be object");
      }
      const update = { ...(body as Record<string, unknown>) };
      delete update.id;
      delete update.user_key;
      delete update.created_at;
      update.updated_at = new Date().toISOString();
      const { error } = await supabase
        .from("foods")
        .update(update)
        .eq("user_key", userKey)
        .eq("id", id);
      if (error) return jsonError(500, "DB_ERROR", error.message);
      return new Response(null, { status: 204 });
    }

    if (req.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id) return jsonError(400, "INVALID_BODY", "missing id");
      const { error } = await supabase
        .from("foods")
        .delete()
        .eq("user_key", userKey)
        .eq("id", id);
      if (error) {
        // FK ON DELETE RESTRICT — food_logs에 참조 중이면 23503 (foreign_key_violation)
        if (error.code === "23503") {
          return jsonError(
            409,
            "FOOD_IN_USE",
            "이 음식을 사용한 식사 기록이 있어서 삭제할 수 없습니다",
          );
        }
        return jsonError(500, "DB_ERROR", error.message);
      }
      return new Response(null, { status: 204 });
    }

    return new Response("Method Not Allowed", { status: 405 });
  });
}
