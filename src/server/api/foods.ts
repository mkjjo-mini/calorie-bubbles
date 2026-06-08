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
import { getEntitlements } from "@/lib/entitlements";
import { getUserTier, jsonPaywall } from "../auth/entitlements";
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
      const insert: Record<string, unknown> = {
        ...(body as Record<string, unknown>),
        user_id: userId,
      };
      delete insert.id;
      delete insert.user_key; // legacy 무시
      delete insert.created_at;
      delete insert.updated_at;

      // Step 17 P1 — 커스텀 음식 활성 보유 한도 (Free/Basic: 3·30, Pro: 무제한).
      // source='user'만 카운트. preset/api 자동 추가는 한도 외 (사용자가 의식적으로 등록한 게 아님).
      // AI 등록(created_via in ai_photo/ai_text)도 한도 외 — AI는 lifetime 3회로 이미 통제됨.
      //   이중 제약 방지 (사용자가 AI 쓰고 음식 한도까지 깎이는 부담 X).
      // 신규 INSERT가 AI 등록이면 검사 자체 skip; 기존 AI row도 카운트에서 제외.
      const isAiInsert = insert.created_via === "ai_photo" || insert.created_via === "ai_text";
      if (insert.source === "user" && !isAiInsert) {
        const tier = await getUserTier(env, admin, userId);
        const ent = getEntitlements(tier);
        if (Number.isFinite(ent.customFoodActiveLimit)) {
          const { count, error: cntErr } = await admin
            .from("foods")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("source", "user")
            .is("deleted_at", null)
            // AI 등록 row 제외 (NULL/manual/search만 카운트)
            .or("created_via.is.null,created_via.eq.manual,created_via.eq.search");
          if (cntErr) return jsonError(500, "DB_ERROR", cntErr.message);
          if ((count ?? 0) >= ent.customFoodActiveLimit) {
            return jsonPaywall(
              "custom_food",
              `내 음식은 ${ent.customFoodActiveLimit}개까지 활성 보관할 수 있어요. Pro에서 무제한으로 모아두세요.`,
            );
          }
        }
      }

      const { data, error } = await admin.from("foods").insert(insert).select().single();
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
      const { error } = await admin.from("foods").update(update).eq("user_id", userId).eq("id", id);
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
