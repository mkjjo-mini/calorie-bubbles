/**
 * 구독 관리 (설정 → 구독 관리).
 *
 *  - 현재 플랜 표시 (티어·갱신일/만료일·자동갱신 여부)
 *  - 무료: Pro 업그레이드 진입 (PaywallModal)
 *  - 유료: Apple 구독 관리(해지·플랜변경) + 구매 복원
 *  - 환불: Apple 정책 안내 (앱 내 직접 환불 X — PRD §3.3)
 *
 * IAP 구독은 앱에서 직접 취소 불가 → manageSubscriptions로 Apple 시트 위임.
 */
import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  RotateCcw,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";
import { PaywallModal } from "@/components/PaywallModal";
import { ENTITLEMENTS_QUERY_KEY, useEntitlements } from "@/hooks/useEntitlements";
import { productLabel } from "@/lib/iap-products";
import { isPurchaseSupported, manageSubscriptions, restorePurchases } from "@/lib/purchases";

export const Route = createFileRoute("/settings/subscription")({
  component: SubscriptionPage,
});

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function SubscriptionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tier, subscription, isLoading } = useEntitlements();
  const [paywallOpen, setPaywallOpen] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);
  const canPurchase = isPurchaseSupported();

  const isPaid = tier !== "free";
  const planLabel =
    productLabel(subscription.productId) ?? (tier === "pro" ? "Pro" : "무료");
  const expiry = formatDate(subscription.expiresAt);

  function handleManage() {
    const ok = manageSubscriptions();
    if (!ok) toast("구독은 앱에서 관리할 수 있어요.");
  }

  async function handleRestore() {
    if (restoring) return;
    setRestoring(true);
    const r = await restorePurchases();
    setRestoring(false);
    if (r.status === "success") {
      toast.success("구매 내역을 확인했어요.");
      void queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_QUERY_KEY });
    } else if (r.status === "unsupported") {
      toast("구매 복원은 앱에서 할 수 있어요.");
    } else {
      toast.error("복원할 구매 내역이 없어요.");
    }
  }

  return (
    <div className="min-h-screen w-full bg-white flex justify-center">
      <main className="w-full max-w-[390px] flex flex-col">
        <header className="sticky top-[env(safe-area-inset-top)] z-10 flex items-center gap-2 border-b border-neutral-100 bg-white/95 px-4 py-3 backdrop-blur">
          <button
            type="button"
            aria-label="뒤로"
            onClick={() => navigate({ to: "/settings" })}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 active:bg-neutral-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-semibold text-neutral-900">구독 관리</h1>
        </header>

        <div className="flex-1 px-4 pt-5 pb-12 space-y-4">
          {/* 현재 플랜 */}
          {isLoading ? (
            <div className="h-24 rounded-2xl border border-neutral-100 bg-neutral-50 animate-pulse" />
          ) : isPaid ? (
            <div className="rounded-2xl border border-neutral-900 bg-neutral-50 px-4 py-4">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-semibold text-neutral-900">{planLabel}</span>
                <span className="text-[10px] font-semibold text-white bg-neutral-900 rounded-full px-2 py-0.5">
                  이용 중
                </span>
              </div>
              {expiry ? (
                <p className="mt-2 text-xs text-neutral-600">
                  {subscription.autoRenew === false
                    ? `${expiry}에 만료돼요 · 자동 갱신 꺼짐`
                    : `${expiry}에 자동 갱신돼요`}
                </p>
              ) : (
                <p className="mt-2 text-xs text-neutral-500">상시 이용 중</p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-100 bg-white px-4 py-4">
              <p className="text-sm font-semibold text-neutral-900">무료 플랜</p>
              <p className="mt-1 text-xs text-neutral-500 leading-relaxed">
                AI 기록·지난 날 편집·고급 기능은 Pro에서 이용할 수 있어요.
              </p>
              <button
                onClick={() => setPaywallOpen(true)}
                className="mt-3 h-11 w-full rounded-xl bg-neutral-900 text-white text-sm font-semibold active:bg-neutral-800 inline-flex items-center justify-center gap-1.5"
              >
                <Sparkles className="h-4 w-4" />
                Pro 시작하기
              </button>
            </div>
          )}

          {/* 구독 관리 (유료 + 네이티브) */}
          {isPaid && canPurchase && (
            <button
              onClick={handleManage}
              className="flex w-full items-center justify-between rounded-2xl border border-neutral-100 bg-white px-4 py-4 active:bg-neutral-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <SettingsIcon className="h-4 w-4 text-neutral-500" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-neutral-900">구독 관리</p>
                  <p className="mt-0.5 text-xs text-neutral-500">해지 · 플랜 변경</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" />
            </button>
          )}

          {/* 구매 복원 (네이티브) */}
          {canPurchase && (
            <button
              onClick={handleRestore}
              disabled={restoring}
              className="flex w-full items-center justify-between rounded-2xl border border-neutral-100 bg-white px-4 py-4 active:bg-neutral-50 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                {restoring ? (
                  <Loader2 className="h-4 w-4 text-neutral-500 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4 text-neutral-500" />
                )}
                <div className="text-left">
                  <p className="text-sm font-semibold text-neutral-900">구매 복원</p>
                  <p className="mt-0.5 text-xs text-neutral-500">기기 변경·재설치 후</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" />
            </button>
          )}

          {/* 환불 안내 */}
          <div className="rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-3.5">
            <p className="text-xs font-semibold text-neutral-700">환불 안내</p>
            <p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">
              환불은 Apple 정책에 따라 처리돼요. App Store에서 직접 신청해주세요.
            </p>
            <a
              href="https://reportaproblem.apple.com"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-900 active:opacity-70"
            >
              Apple에서 환불 신청하기
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* 웹 안내 */}
          {!canPurchase && (
            <p className="text-[11px] text-neutral-400 text-center leading-relaxed">
              구독 결제·관리는 iOS 앱에서 할 수 있어요.
            </p>
          )}
        </div>
      </main>

      <PaywallModal feature="upgrade" open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
}
