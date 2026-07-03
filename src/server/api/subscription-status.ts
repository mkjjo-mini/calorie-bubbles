/**
 * /api/subscription-status
 *
 * Step 17 entitlements 응답:
 *   {
 *     tier:             "free" | "pro",
 *     aiLifetimeUsed:   number,   // 평생 AI 사용량 (free 한도 3 비교용)
 *     isPaid:           boolean,  // 유료 여부 (Pro = true, Free = false)
 *     source:           string,
 *   }
 *
 * - `tier`는 useEntitlements 훅이 사용.
 * - RevenueCat 미연동 동안 tier 결정은 env FORCE_PRO_USERS + user_entitlements.tier.
 */
import type { Env } from "../auth/env";
import { getAiLifetimeUsed, getUserTier } from "../auth/entitlements";
import { NO_STORE_JSON_HEADERS, withUser } from "../auth/middleware";

export async function handleSubscriptionStatus(req: Request, env: Env): Promise<Response> {
  return withUser(req, env, async ({ userId, admin }) => {
    if (req.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const tier = await getUserTier(env, admin, userId);

    const aiLifetimeUsed = await getAiLifetimeUsed(admin, userId);
    const isPaid = tier !== "free";

    // 구독 상세 (구독 관리 화면용). free·force_env·row 없으면 null.
    const { data: sub } = await admin
      .from("user_subscriptions")
      .select("expires_at, auto_renew, rc_product_id")
      .eq("user_id", userId)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        tier,
        aiLifetimeUsed,
        isPaid,
        expiresAt: sub?.expires_at ?? null,
        autoRenew: sub?.auto_renew ?? null,
        productId: sub?.rc_product_id ?? null,
        source: "v1-entitlements",
      }),
      { status: 200, headers: NO_STORE_JSON_HEADERS },
    );
  });
}
