/**
 * 사용자 권한 + AI 평생 사용량 훅.
 *
 *  - tier·entitlements: PRD §2 매트릭스 (src/lib/entitlements.ts)
 *  - aiLifetimeUsed:    AI 분석 평생 사용 횟수 (free 한도 3 비교)
 *
 * staleTime 5분 — tier는 거의 안 변하지만 aiLifetimeUsed가 호출마다 +1이라 짧게.
 * AI 분석 성공 시 AiAddSheet가 ENTITLEMENTS_QUERY_KEY로 invalidate.
 *
 * AdBanner는 entitlements.showAds로 광고 분기 (Step 17 P1 마이그레이션 완료).
 *
 * PRD §5.3.
 */
import { useQuery } from "@tanstack/react-query";
import { getEntitlements, isTier, type Entitlements, type Tier } from "@/lib/entitlements";

export const ENTITLEMENTS_QUERY_KEY = ["subscription-status"] as const;

interface SubscriptionResponse {
  tier?: Tier;
  aiLifetimeUsed?: number;
  isPaid?: boolean;
  expiresAt?: string | null;
  autoRenew?: boolean | null;
  productId?: string | null;
  source?: string;
}

/** 구독 상세 — 구독 관리 화면용. free면 모두 null */
export interface SubscriptionDetail {
  expiresAt: string | null;
  autoRenew: boolean | null;
  productId: string | null;
}

interface UseEntitlementsResult {
  tier: Tier;
  entitlements: Entitlements;
  /** AI 평생 사용 횟수. 미인증·로딩 중엔 0 */
  aiLifetimeUsed: number;
  /** Free 한정 — "체험 X/3회 남음"의 X (음수면 0 clamp) */
  aiUsesRemaining: number;
  /** 구독 상세 (만료일·자동갱신·상품). free면 모두 null */
  subscription: SubscriptionDetail;
  isLoading: boolean;
}

export function useEntitlements(): UseEntitlementsResult {
  const { data, isLoading } = useQuery({
    queryKey: ENTITLEMENTS_QUERY_KEY,
    queryFn: async (): Promise<SubscriptionResponse> => {
      const res = await fetch("/api/subscription-status", { credentials: "include" });
      if (res.status === 401) return { tier: "free", aiLifetimeUsed: 0, isPaid: false };
      if (!res.ok) throw new Error(`subscription-status ${res.status}`);
      return (await res.json()) as SubscriptionResponse;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const tier: Tier = isTier(data?.tier) ? data.tier : "free";
  const entitlements = getEntitlements(tier);
  const aiLifetimeUsed = data?.aiLifetimeUsed ?? 0;

  const aiUsesRemaining = entitlements.aiUnlimited
    ? Number.POSITIVE_INFINITY
    : Math.max(0, entitlements.aiLifetimeFreeUses - aiLifetimeUsed);

  return {
    tier,
    entitlements,
    aiLifetimeUsed,
    aiUsesRemaining,
    subscription: {
      expiresAt: data?.expiresAt ?? null,
      autoRenew: data?.autoRenew ?? null,
      productId: data?.productId ?? null,
    },
    isLoading,
  };
}
