/**
 * PaywallModal — feature별 paywall (PRD §7).
 *
 * 사용:
 *   const [open, setOpen] = useState(false);
 *   <PaywallModal feature="ai" open={open} onOpenChange={setOpen} />
 *
 * 톤 (부록 §):
 *   "차단" X → "초대" ⭐
 *   "AI 체험 3회 다 사용하셨어요. 무광고 무제한으로 계속하시려면..."
 *
 * v1 (RevenueCat 미연동): CTA "곧 열려요" 안내 + 닫기. 결제 흐름 없음.
 * v2 (RevenueCat 통합 후): "월 ₩4,900으로 시작하기" → Apple StoreKit 시트.
 */
import { Check, Sparkles, X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

export type PaywallFeature =
  | "ai"
  | "custom_food"
  | "past_edit"
  | "notifications"
  | "goal_wizard"
  | "ads";

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
      "AI 음식 추가",
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
              <PlanCard key={plan.key} plan={plan} recommended={copy.recommended === plan.key} />
            ))}
          </div>

          {/* v1: 결제 흐름 미연동 — 정직한 안내. RevenueCat 통합 후 교체 */}
          <div className="mt-4 rounded-xl bg-neutral-50 px-3 py-2.5 text-[11px] text-neutral-600 leading-relaxed text-center">
            구독 결제는 앱스토어 심사 후 곧 열려요. 알림 받고 싶다면{" "}
            <span className="font-medium text-neutral-800">설정 → 도움말</span>에서 문의해 주세요.
          </div>

          <button
            onClick={() => onOpenChange(false)}
            className="mt-3 w-full h-12 rounded-xl bg-neutral-900 text-white text-sm font-semibold active:bg-neutral-800 inline-flex items-center justify-center gap-2"
          >
            <X className="h-4 w-4" />
            닫기
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function PlanCard({ plan, recommended }: { plan: TierPlan; recommended: boolean }) {
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

      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-[11px] text-neutral-600">연 결제 {plan.yearly} · {plan.yearlyDailyEquivalent}</span>
        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5">
          20% 할인
        </span>
      </div>

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
    </div>
  );
}
