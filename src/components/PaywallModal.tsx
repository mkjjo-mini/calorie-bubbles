/**
 * PaywallModal — feature별 paywall (PRD §7).
 *
 * 사용:
 *   const [open, setOpen] = useState(false);
 *   <PaywallModal feature="ai" open={open} onOpenChange={setOpen} />
 *
 * 톤 (부록 §):
 *   "차단" X → "초대" ⭐
 *
 * 결제 (Step 13 RevenueCat):
 *   - iOS 네이티브: 각 plan에 월/연 결제 버튼 → purchaseTier → Apple 결제 시트.
 *     성공 시 tier 캐시 invalidate (실제 반영은 webhook → user_subscriptions → 트리거).
 *   - 웹/SSR: 결제 불가 → "앱에서 결제" 안내 (isPurchaseSupported=false).
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ENTITLEMENTS_QUERY_KEY } from "@/hooks/useEntitlements";
import type { BillingPeriod } from "@/lib/iap-products";
import { isPurchaseSupported, purchaseTier } from "@/lib/purchases";

export type PaywallFeature =
  | "ai"
  | "custom_food"
  | "past_edit"
  | "notifications"
  | "goal_wizard"
  | "ads"
  | "upgrade";

type RecommendedTier = "basic" | "pro";

interface FeatureCopy {
  headline: string;
  body: string;
  recommended: RecommendedTier;
}

const FEATURE_COPY: Record<PaywallFeature, FeatureCopy> = {
  ai: {
    headline: "AI로 더 빠르게 기록해요",
    body: "AI 음식 추가 체험 3회를 다 사용하셨어요. Pro에서 무광고로 계속 이용할 수 있어요.",
    recommended: "pro",
  },
  custom_food: {
    headline: "내 음식을 자유롭게",
    body: "활성 커스텀 음식 3개 한도에 도달했어요. Pro에서 더 많이 모아두세요.",
    recommended: "pro",
  },
  past_edit: {
    headline: "지난 날의 기록도 자유롭게",
    body: "어제·지난주 기록까지 자유롭게 편집하고 싶다면 Pro에서 함께해요.",
    recommended: "pro",
  },
  notifications: {
    headline: "식사 알림으로 습관 만들기",
    body: "원하는 시간에 식사 알림을 받아 트래킹 습관을 자연스럽게 만들어요.",
    recommended: "pro",
  },
  goal_wizard: {
    headline: "체형과 목표에 맞춘 자동 추천",
    body: "체중·키·활동량을 입력하면 1일 칼로리와 탄·단·지 비율을 자동으로 추천해 드려요.",
    recommended: "pro",
  },
  ads: {
    headline: "광고 없이 깨끗하게",
    body: "Basic은 광고만 제거, Pro는 AI 기록까지 함께해요.",
    recommended: "basic",
  },
  upgrade: {
    headline: "탄단지 Pro로 더 강력하게",
    body: "AI 기록·광고 제거·지난 날 편집·식사 알림까지 한 번에 누리세요.",
    recommended: "pro",
  },
};

interface TierPlan {
  key: "basic" | "pro";
  name: string;
  monthly: string;
  yearly: string;
  dailyEquivalent: string;
  yearlyDailyEquivalent: string;
  bullets: string[];
}

const PLANS: TierPlan[] = [
  {
    key: "basic",
    name: "Basic",
    monthly: "₩1,900",
    yearly: "₩18,000",
    dailyEquivalent: "월 ₩1,900 · 하루 ₩63",
    yearlyDailyEquivalent: "하루 ₩49",
    bullets: ["광고 제거"],
  },
  {
    key: "pro",
    name: "Pro",
    monthly: "₩4,900",
    yearly: "₩47,000",
    dailyEquivalent: "월 ₩4,900 · 하루 ₩163",
    yearlyDailyEquivalent: "하루 ₩129",
    bullets: [
      "AI 음식 추가 마음껏",
      "커스텀 음식 등록",
      "지난 날 기록 편집",
      "식사 알림 · 목표 자동 추천",
      "광고 제거",
    ],
  },
];

interface Props {
  feature: PaywallFeature;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PaywallModal({ feature, open, onOpenChange }: Props) {
  const copy = FEATURE_COPY[feature];
  const queryClient = useQueryClient();
  const canPurchase = isPurchaseSupported();
  // 진행 중 결제의 식별자 ("pro:annual" 등). 버튼 로딩·중복결제 방지용.
  const [pending, setPending] = useState<string | null>(null);

  async function handlePurchase(tier: "basic" | "pro", period: BillingPeriod) {
    if (pending) return;
    setPending(`${tier}:${period}`);
    const result = await purchaseTier(tier, period);
    setPending(null);

    switch (result.status) {
      case "success":
        toast.success("결제가 완료됐어요! 잠시 후 반영돼요.");
        // 즉시 + webhook 처리 여유(2s) 후 한 번 더 — tier 반영은 webhook 경유.
        void queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_QUERY_KEY });
        window.setTimeout(() => {
          void queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_QUERY_KEY });
        }, 2000);
        onOpenChange(false);
        break;
      case "cancelled":
        // 사용자가 Apple 시트에서 취소 — 조용히 무시
        break;
      case "unsupported":
        toast("앱에서 결제할 수 있어요.");
        break;
      default:
        toast.error(result.message ?? "결제에 실패했어요. 잠시 후 다시 시도해주세요.");
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="text-left pb-1">
          <DrawerTitle className="flex items-center gap-1.5 text-base">
            <Sparkles className="h-4 w-4 text-amber-500" />
            {copy.headline}
          </DrawerTitle>
          <DrawerDescription className="text-[12px] leading-relaxed text-neutral-600">
            {copy.body}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-[max(env(safe-area-inset-bottom),16px)] overflow-y-auto">
          <div className="flex flex-col gap-3 pt-2">
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.key}
                plan={plan}
                recommended={copy.recommended === plan.key}
                canPurchase={canPurchase}
                pending={pending}
                onPurchase={handlePurchase}
              />
            ))}
          </div>

          {canPurchase ? (
            <p className="mt-4 text-[11px] text-neutral-500 leading-relaxed text-center">
              결제 후 Apple 계정에서 자동 갱신돼요. 언제든 해지할 수 있어요.
            </p>
          ) : (
            // 웹/SSR — 결제 native 필수. 정직한 안내.
            <div className="mt-4 rounded-xl bg-neutral-50 px-3 py-2.5 text-[11px] text-neutral-600 leading-relaxed text-center">
              구독 결제는 <span className="font-medium text-neutral-800">앱에서</span> 진행할 수 있어요.
            </div>
          )}

          <button
            onClick={() => onOpenChange(false)}
            className="mt-3 w-full h-12 rounded-xl bg-neutral-100 text-neutral-700 text-sm font-semibold active:bg-neutral-200 inline-flex items-center justify-center gap-2"
          >
            <X className="h-4 w-4" />
            닫기
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function PlanCard({
  plan,
  recommended,
  canPurchase,
  pending,
  onPurchase,
}: {
  plan: TierPlan;
  recommended: boolean;
  canPurchase: boolean;
  pending: string | null;
  onPurchase: (tier: "basic" | "pro", period: BillingPeriod) => void;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3.5 ${
        recommended ? "border-neutral-900 bg-neutral-50 shadow-sm" : "border-neutral-200 bg-white"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-neutral-900">{plan.name}</span>
          {recommended && (
            <span className="text-[10px] font-semibold text-white bg-neutral-900 rounded-full px-2 py-0.5">
              추천
            </span>
          )}
        </div>
        <div className="text-right">
          <div className="text-base font-bold text-neutral-900">{plan.monthly}</div>
          <div className="text-[10px] text-neutral-500">월 결제</div>
        </div>
      </div>

      <div className="mt-1 text-[11px] text-neutral-500">{plan.dailyEquivalent}</div>

      <ul className="mt-3 space-y-1.5">
        {plan.bullets.map((b) => (
          <li key={b} className="flex items-start gap-1.5 text-[12px] text-neutral-700">
            <Check
              className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
                recommended ? "text-neutral-900" : "text-neutral-400"
              }`}
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {canPurchase ? (
        // iOS 네이티브 — 월/연 결제 버튼
        <div className="mt-3 grid grid-cols-2 gap-2">
          <PurchaseButton
            label={`월 ${plan.monthly}`}
            sublabel={plan.dailyEquivalent.split("·")[1]?.trim()}
            primary={recommended}
            loading={pending === `${plan.key}:monthly`}
            disabled={pending !== null}
            onClick={() => onPurchase(plan.key, "monthly")}
          />
          <PurchaseButton
            label={`연 ${plan.yearly}`}
            sublabel="20% 할인"
            primary={recommended}
            loading={pending === `${plan.key}:annual`}
            disabled={pending !== null}
            onClick={() => onPurchase(plan.key, "annual")}
          />
        </div>
      ) : (
        // 웹 — 가격 안내만
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[11px] text-neutral-600">
            연 결제 {plan.yearly} · {plan.yearlyDailyEquivalent}
          </span>
          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5">
            20% 할인
          </span>
        </div>
      )}
    </div>
  );
}

function PurchaseButton({
  label,
  sublabel,
  primary,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  sublabel?: string;
  primary: boolean;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative h-12 rounded-xl text-[13px] font-semibold inline-flex flex-col items-center justify-center gap-0.5 disabled:opacity-50 ${
        primary
          ? "bg-neutral-900 text-white active:bg-neutral-800"
          : "border border-neutral-300 text-neutral-800 active:bg-neutral-100"
      }`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <span>{label}</span>
          {sublabel && (
            <span className={`text-[10px] font-medium ${primary ? "text-neutral-300" : "text-emerald-600"}`}>
              {sublabel}
            </span>
          )}
        </>
      )}
    </button>
  );
}
