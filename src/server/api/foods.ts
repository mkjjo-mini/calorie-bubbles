/**
 * /api/foods — 사용자별 음식 라이브러리 CRUD.
 *
 * GET    /api/foods                 → list (활성, updated_at desc)
 * POST   /api/foods                 → INSERT 새 음식
 * PUT    /api/foods?id=<uuid>       → UPDATE
 * DELETE /api/foods?id=<uuid>       → Soft delete (deleted_at)
 *
 * 모든 쿼리는 user_id = ? 강제로 본인 데이터만 접근.
 */
import type { Env } from "../auth/env";
import { jsonError, withUser } from "../auth/middleware";

export async function handleFoods(req: Request, env: Env): Promise<Response> {
  return withUser(req, env, async ({ userId, admin }) => {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const { data, error } = await admin
        .from("foods")
        .select("*")
        .eq("user_id", userId)
        .is("deleted_at", null)
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
      const insert = { ...(body as Record<string, unknown>), user_id: userId };
      delete (insert as Record<string, unknown>).id;
      delete (insert as Record<string, unknown>).user_key; // legacy 무시
      delete (insert as Record<string, unknown>).created_at;
      delete (insert as Record<string, unknown>).updated_at;
      const { data, error } = await admin
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
      delete update.user_id;
      delete update.user_key;
      delete update.created_at;
      update.updated_at = new Date().toISOString();
      const { error } = await admin
        .from("foods")
        .update(update)
        .eq("user_id", userId)
        .eq("id", id);
      if (error) return jsonError(500, "DB_ERROR", error.message);
      return new Response(null, { status: 204 });
    }

    if (req.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id) return jsonError(400, "INVALID_BODY", "missing id");
      const { error } = await admin
        .from("foods")
        .update({ deleted_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("id", id)
        .is("deleted_at", null);
      if (error) return jsonError(500, "DB_ERROR", error.message);
      return new Response(null, { status: 204 });
    }

    return new Response("Method Not Allowed", { status: 405 });
  });
}
