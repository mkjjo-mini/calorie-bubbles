/**
 * POST /api/feedback
 * Body: { type: "bug"|"feature", severity?: 1|2|3|4, content: string }
 */
import type { Env } from "../auth/env";
import { jsonError, withUser } from "../auth/middleware";

export async function handleFeedback(req: Request, env: Env): Promise<Response> {
  return withUser(req, env, async ({ userId, admin }) => {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    let body: unknown;
    try { body = await req.json(); } catch {
      return jsonError(400, "INVALID_BODY", "body must be JSON");
    }
    const b = body as Record<string, unknown>;
    if (b.type !== "bug" && b.type !== "feature") {
      return jsonError(400, "INVALID_BODY", "type must be bug or feature");
    }
    if (!b.content || typeof b.content !== "string" || !b.content.trim()) {
      return jsonError(400, "INVALID_BODY", "content is required");
    }
    const severity = b.type === "bug" && typeof b.severity === "number" ? b.severity : null;
    if (severity !== null && (severity < 1 || severity > 4)) {
      return jsonError(400, "INVALID_BODY", "severity must be 1-4");
    }

    // 이메일은 auth.users에서 조회
    const { data: userData } = await admin.auth.admin.getUserById(userId);
    const userEmail = userData?.user?.email ?? null;

    const { error } = await admin.from("feedback").insert({
      user_id: userId,
      user_email: userEmail,
      type: b.type,
      severity,
      content: b.content.trim(),
    });
    if (error) return jsonError(500, "DB_ERROR", error.message);
    return new Response(null, { status: 201 });
  });
}
