/**
 * /api/subscription-status
 *
 * v1 mock — env.FORCE_PAID === "true"면 isPaid=true, 아니면 false.
 * BM 확정 (2026-06-13 마감) 후 실제 구독 조회 로직으로 교체:
 *   - 토스 인앱 결제 상태 API 호출
 *   - 또는 Supabase subscriptions 테이블 조회
 *
 * 클라이언트 useIsPaidUser 훅이 sessionStorage 5분 캐시 + fallback.
 */
import type { Env } from "../auth/env";
import { withSession } from "../auth/middleware";

export async function handleSubscriptionStatus(
  req: Request,
  env: Env,
): Promise<Response> {
  return withSession(req, env, async (_userKey) => {
    if (req.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const isPaid = env.FORCE_PAID === "true";
    return Response.json({ isPaid, source: "v1-mock" });
  });
}
