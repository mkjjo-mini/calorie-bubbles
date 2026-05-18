/**
 * /api/favorites
 *
 * GET    /api/favorites
 * POST   /api/favorites
 * DELETE /api/favorites?food_id=<uuid>
 */
import type { Env } from "../auth/env";
import { jsonError, withUser } from "../auth/middleware";

export async function handleFavorites(req: Request, env: Env): Promise<Response> {
  return withUser(req, env, async ({ userId, admin }) => {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const { data, error } = await admin
        .from("favorites")
        .select("*, food:foods(name, food_code, source, deleted_at)")
        .eq("user_id", userId)
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
      const { error } = await admin
        .from("favorites")
        .upsert(
          { user_id: userId, food_id: foodId },
          { onConflict: "user_id,food_id" },
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
      const { error } = await admin
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("food_id", foodId);
      if (error) return jsonError(500, "DB_ERROR", error.message);
      return new Response(null, { status: 204 });
    }

    return new Response("Method Not Allowed", { status: 405 });
  });
}
