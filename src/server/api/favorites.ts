/**
 * /api/favorites
 *
 * GET    /api/favorites                  → list (food JOIN으로 name 포함)
 * POST   /api/favorites                  → body: { food_id }
 * DELETE /api/favorites?food_id=<uuid>   → DELETE
 *
 * favorites.food_id → foods(id) ON DELETE CASCADE 라 음식 삭제 시 자동 정리.
 */
import type { Env } from "../auth/env";
import { jsonError, withSession } from "../auth/middleware";
import { getSupabase } from "../db/supabase";

export async function handleFavorites(req: Request, env: Env): Promise<Response> {
  return withSession(req, env, async (userKey) => {
    const supabase = getSupabase(env);
    const url = new URL(req.url);

    if (req.method === "GET") {
      // foods JOIN에 deleted_at 같이 가져와 클라이언트 측에서 필터.
      // (soft delete된 음식의 즐겨찾기는 UI에서 숨김 — 음식 복구 시 자동 부활)
      const { data, error } = await supabase
        .from("favorites")
        .select("*, food:foods(name, food_code, source, deleted_at)")
        .eq("user_key", userKey)
        .order("added_at", { ascending: false });
      if (error) return jsonError(500, "DB_ERROR", error.message);
      const filtered = (data ?? []).filter(
        (row: { food?: { deleted_at?: string | null } | null }) =>
          row.food?.deleted_at == null,
      );
      return Response.json(filtered);
    }

    if (req.method === "POST") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return jsonError(400, "INVALID_BODY", "body must be JSON");
      }
      const foodId = (body as { food_id?: string })?.food_id;
      if (!foodId || typeof foodId !== "string") {
        return jsonError(400, "INVALID_BODY", "missing food_id");
      }
      // upsert로 멱등성 (이미 즐겨찾기면 added_at만 갱신)
      const { error } = await supabase
        .from("favorites")
        .upsert(
          { user_key: userKey, food_id: foodId },
          { onConflict: "user_key,food_id" },
        );
      if (error) {
        if (error.code === "23503") {
          return jsonError(400, "INVALID_FOOD_ID", "food_id가 유효하지 않습니다");
        }
        return jsonError(500, "DB_ERROR", error.message);
      }
      return new Response(null, { status: 201 });
    }

    if (req.method === "DELETE") {
      const foodId = url.searchParams.get("food_id");
      if (!foodId) return jsonError(400, "INVALID_BODY", "missing food_id");
      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("user_key", userKey)
        .eq("food_id", foodId);
      if (error) return jsonError(500, "DB_ERROR", error.message);
      return new Response(null, { status: 204 });
    }

    return new Response("Method Not Allowed", { status: 405 });
  });
}
