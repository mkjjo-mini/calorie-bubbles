/**
 * POST /api/revenuecat/webhook
 *
 * RevenueCat → 우리 서버 결제 이벤트 수신. user_subscriptions(원장) UPSERT
 * → 20260607 트리거가 user_entitlements.tier 동기화.
 *
 * 인증: RevenueCat 대시보드 webhook의 Authorization 헤더에 설정한 값과 대조.
 *       (withUser 미적용 — 호출 주체가 사용자가 아니라 RevenueCat 서버)
 *
 * 멱등성: subscription_events.rc_event_id UNIQUE. 같은 이벤트 재전송 시 23505 →
 *         이미 처리됨으로 간주하고 200 (RevenueCat 재시도 중단 유도).
 *
 * 실패 응답 정책: 검증 실패는 4xx(재시도 무의미), 처리 중 일시 오류는 5xx
 *                (RevenueCat가 최대 며칠간 재시도하므로 데이터 유실 방지).
 *
 * PRD: products/tandanji-bubble/prd/v1-steps/step-13-iap-subscription.md §5.3
 */
import type { Env } from "../auth/env";
import { NO_STORE_JSON_HEADERS } from "../auth/middleware";
import { createAdminSupabase } from "../auth/supabase-server";
import { amountKr, resolveRcEvent, type RcEvent } from "./revenuecat-events";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: NO_STORE_JSON_HEADERS });
}

export async function handleRevenueCatWebhook(req: Request, env: Env): Promise<Response> {
  if (req.method !== "POST") {
    return json(405, { code: "METHOD_NOT_ALLOWED" });
  }

  // 1. 인증 — Authorization 헤더 대조
  const expected = env.RC_WEBHOOK_AUTH_HEADER;
  if (!expected) {
    console.error("[rc-webhook] RC_WEBHOOK_AUTH_HEADER 미설정");
    return json(500, { code: "CONFIG_MISSING" });
  }
  if (req.headers.get("authorization") !== expected) {
    return json(401, { code: "UNAUTHORIZED" });
  }

  // 2. 파싱
  let payload: { event?: RcEvent };
  try {
    payload = (await req.json()) as { event?: RcEvent };
  } catch {
    return json(400, { code: "INVALID_JSON" });
  }
  const event = payload.event;
  if (!event?.id || !event?.type || !event?.app_user_id) {
    return json(400, { code: "INVALID_EVENT" });
  }

  const admin = createAdminSupabase(env);

  // 3. 멱등 로그 — rc_event_id UNIQUE로 중복 차단
  const { error: logErr } = await admin.from("subscription_events").insert({
    user_id: event.app_user_id,
    event_type: event.type,
    product_id: event.product_id ?? null,
    store: event.store ?? null,
    amount_kr: amountKr(event),
    rc_event_id: event.id,
    raw_payload: payload,
  });
  if (logErr) {
    // 23505 = unique_violation → 이미 처리된 이벤트. 멱등 성공 처리.
    if (logErr.code === "23505") {
      return json(200, { ok: true, deduped: true });
    }
    console.error("[rc-webhook] 이벤트 로그 실패", logErr.message);
    return json(500, { code: "LOG_FAILED" }); // RevenueCat 재시도 유도
  }

  // 4. 원장 반영
  const update = resolveRcEvent(event);
  if (!update.applyLedger) {
    // TRANSFER / TEST / 미지원 상품 — 로그만 남기고 종료
    return json(200, { ok: true, applied: false, type: event.type });
  }

  const row: Record<string, unknown> = {
    user_id: update.userId,
    tier: update.tier,
    source: "apple_iap",
    rc_product_id: update.productId,
    expires_at: update.expiresAt,
  };
  if (update.autoRenew !== null) row.auto_renew = update.autoRenew;

  // 환불 누적 — 현재값 + delta (환불 빈도 낮아 read-modify-write 허용)
  if (update.refundDelta > 0) {
    const { data: cur } = await admin
      .from("user_subscriptions")
      .select("refund_count")
      .eq("user_id", update.userId)
      .maybeSingle();
    row.refund_count = (cur?.refund_count ?? 0) + update.refundDelta;
  }

  const { error: upsertErr } = await admin
    .from("user_subscriptions")
    .upsert(row, { onConflict: "user_id" });
  if (upsertErr) {
    console.error("[rc-webhook] user_subscriptions upsert 실패", upsertErr.message);
    return json(500, { code: "LEDGER_FAILED" }); // RevenueCat 재시도 유도
  }

  return json(200, { ok: true, applied: true, tier: update.tier });
}
