/**
 * 백엔드 권한 가드. tier 조회, AI lifetime 카운터, paywall 응답.
 *
 * 호출 시점 (PRD §3 게이팅 인벤토리):
 *  - POST /api/ai-food/analyze   : tier·lifetime 검사 → 통과 시 호출, 성공 시 increment
 *  - POST /api/foods             : (P1) customFoodActiveLimit 검사
 *  - POST /api/food-logs         : (P1) pastDateEditAllowed 검사
 *
 * 우회 차단 원칙:
 *  프론트(useEntitlements)가 같은 src/lib/entitlements.ts 매트릭스를 쓰지만,
 *  결국 결정은 백엔드 → API 직접 호출도 같은 가드에 막힘.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEntitlements, isTier, type Tier } from "@/lib/entitlements";
import type { Env } from "./env";
import { NO_STORE_JSON_HEADERS } from "./middleware";

/**
 * PaywallModal과 1:1 매핑되는 feature 식별자.
 * PRD §7.1 표와 일치.
 */
export type PaywallFeature =
  | "ai"
  | "custom_food"
  | "past_edit"
  | "notifications"
  | "goal_wizard"
  | "ads";

/**
 * 사용자의 현재 tier 결정.
 *
 * 우선순위:
 *   1. env FORCE_PRO_USERS / FORCE_BASIC_USERS — 테스트·관리자·베타 강제
 *   2. user_entitlements.tier — RevenueCat webhook이 갱신
 *   3. 기본값 'free' — row가 없으면 ensure_user_entitlements로 생성
 */
export async function getUserTier(env: Env, admin: SupabaseClient, userId: string): Promise<Tier> {
  if (
    env.FORCE_PRO_USERS?.split(",")
      .map((s) => s.trim())
      .includes(userId)
  ) {
    return "pro";
  }
  if (
    env.FORCE_BASIC_USERS?.split(",")
      .map((s) => s.trim())
      .includes(userId)
  ) {
    return "basic";
  }

  const { data, error } = await admin
    .from("user_entitlements")
    .select("tier")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[entitlements] tier 조회 실패", error.message);
    // 안전 우선 — 조회 실패 시 free 처리 (유료 기능을 임의로 풀어주지 않음).
    return "free";
  }

  if (!data) {
    // 첫 호출인 사용자 — row 생성 (race-safe, ON CONFLICT NOTHING)
    await admin.rpc("ensure_user_entitlements", { p_user_id: userId });
    return "free";
  }

  return isTier(data.tier) ? data.tier : "free";
}

/** AI 평생 사용량. row 없으면 0. */
export async function getAiLifetimeUsed(admin: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await admin
    .from("user_entitlements")
    .select("ai_lifetime_used_count")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[entitlements] ai count 조회 실패", error.message);
    // 안전 우선 — 조회 실패 시 사용량을 작게 보지 않고 0 반환.
    // 4회째 paywall 차단은 increment 후 RETURNING 값으로 한번 더 검증되므로 OK.
    return 0;
  }
  return data?.ai_lifetime_used_count ?? 0;
}

/**
 * AI 호출 성공 후 호출. 원자적 증가 + 최신 카운트 반환.
 * 실패 시 0 반환 (소비 누락 → free 사용자는 의도하지 않게 한도 우회 가능,
 * 단 로그 남고 운영 모니터링).
 */
export async function incrementAiLifetimeUsed(
  admin: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await admin.rpc("increment_ai_lifetime_used", {
    p_user_id: userId,
  });
  if (error) {
    console.error("[entitlements] increment_ai_lifetime_used 실패", error.message);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

/** 402 PAYMENT_REQUIRED + paywall 메타. 클라이언트 PaywallModal이 feature로 분기. */
export function jsonPaywall(feature: PaywallFeature, message?: string): Response {
  return new Response(
    JSON.stringify({
      code: "PAYMENT_REQUIRED",
      feature,
      message: message ?? "이 기능은 Pro 플랜에서 이용할 수 있어요.",
    }),
    { status: 402, headers: NO_STORE_JSON_HEADERS },
  );
}

/**
 * AI 게이팅 헬퍼. Free/Basic이 lifetime 한도 초과면 paywall.
 * pro는 항상 통과 (단 abuse cap은 별도 guardrails에서 처리).
 */
export async function checkAiEntitlement(
  admin: SupabaseClient,
  userId: string,
  tier: Tier,
): Promise<{ ok: true; used: number } | { ok: false; response: Response }> {
  const ent = getEntitlements(tier);
  const used = await getAiLifetimeUsed(admin, userId);

  if (!ent.aiUnlimited && used >= ent.aiLifetimeFreeUses) {
    return {
      ok: false,
      response: jsonPaywall(
        "ai",
        "AI 음식 추가 무료 체험을 모두 사용하셨어요. Pro에서 무제한으로 이용해보세요.",
      ),
    };
  }
  return { ok: true, used };
}
