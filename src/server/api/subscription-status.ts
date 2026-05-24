/**
 * /api/subscription-status
 *
 * Step 17 entitlements 응답:
 *   {
 *     tier:             "free" | "basic" | "pro",
 *     aiLifetimeUsed:   number,   // 평생 AI 사용량 (free/basic 한도 3 비교용)
 *     isPaid:           boolean,  // 광고 노출 분기 (Basic/Pro = true). useIsPaidUser 호환
 *     source:           string,
 *   }
 *
 * - `tier`는 신규 useEntitlements 훅이 사용.
 * - `isPaid`는 기존 useIsPaidUser·AdBanner 호환 유지 (마이그레이션은 P1).
 *   - "광고 없음" = Basic 또는 Pro → isPaid = true. (Free만 false)
 * - RevenueCat 미연동 동안 tier 결정은 env FORCE_PRO_USERS/FORCE_BASIC_USERS + FORCE_PAID.
 */
import type { Env } from "../auth/env";
import { getAiLifetimeUsed, getUserTier } from "../auth/entitlements";
import { NO_STORE_JSON_HEADERS, withUser } from "../auth/middleware";

export async function handleSubscriptionStatus(req: Request, env: Env): Promise<Response> {
  return withUser(req, env, async ({ userId, admin }) => {
    if (req.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let tier = await getUserTier(env, admin, userId);

    // FORCE_PAID legacy env — tier가 free일 때만 basic으로 끌어올려 useIsPaidUser 호환.
    // (이미 force_pro/force_basic으로 결정된 경우는 그 결과 존중)
    if (tier === "free" && env.FORCE_PAID === "true") {
      tier = "basic";
    }

    const aiLifetimeUsed = await getAiLifetimeUsed(admin, userId);
    const isPaid = tier !== "free";

    return new Response(
      JSON.stringify({
        tier,
        aiLifetimeUsed,
        isPaid,
        source: "v1-entitlements",
      }),
      { status: 200, headers: NO_STORE_JSON_HEADERS },
    );
  });
}
