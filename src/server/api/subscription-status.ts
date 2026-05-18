/**
 * /api/subscription-status
 *
 * v1 mock — env.FORCE_PAID === "true" → isPaid=true.
 * 추후 Supabase subscriptions 테이블 or RevenueCat 등으로 교체.
 */
import type { Env } from "../auth/env";
import { withUser } from "../auth/middleware";

export async function handleSubscriptionStatus(
  req: Request,
  env: Env,
): Promise<Response> {
  return withUser(req, env, async () => {
    if (req.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const isPaid = env.FORCE_PAID === "true";
    return Response.json({ isPaid, source: "v1-mock" });
  });
}
