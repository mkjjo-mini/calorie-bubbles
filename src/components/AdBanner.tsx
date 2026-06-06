// 홈 하단 배너 광고 — 무료 사용자에게만 노출.
//
//  - Web dev 환경에서는 보이지 않음 (Capacitor native에서만 동작).
//  - 유료 사용자에게는 호출 자체 skip.
//  - 60초마다 자동 갱신 (SDK 기본).
//
//  PRD: step-15-admob-integration.md §3.5

import { useEffect } from "react";
import {
  AdMob,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
} from "@capacitor-community/admob";
import { Capacitor } from "@capacitor/core";
import { useEntitlements } from "@/hooks/useEntitlements";
import { getAdUnitId, initAdMob } from "@/lib/ads";

// 배너는 native overlay로 WebView 위에 떠 있어서 React가 높이를 알 수 없다.
// SDK SizeChanged 이벤트로 실제 px 높이를 받아 CSS 변수에 세팅 → 탭바/콘텐츠가 그만큼 위로 회피.
const AD_HEIGHT_VAR = "--ad-banner-height";

// AdMob iOS 구현은 banner를 safeAreaLayoutGuide에 붙여 home indicator 위에 띄움.
// 디바이스의 safe-area-inset-bottom을 픽셀로 측정해 음수 margin으로 상쇄 → 화면 맨 밑까지 깔린다.
// height:env(...)는 일부 WebView에서 0으로 평가되므로 padding-bottom 방식을 사용한다.
function measureSafeAreaBottomPx(): number {
  if (typeof window === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:0;bottom:0;width:1px;height:0;padding-bottom:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none;";
  document.body.appendChild(probe);
  // 레이아웃 강제 갱신
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  probe.offsetHeight;
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return Math.round(h);
}

export function AdBanner() {
  const { entitlements, isLoading } = useEntitlements();
  const showAds = entitlements.showAds;

  useEffect(() => {
    // tier 응답 도착 전엔 init 보류 — race로 Pro 사용자가 광고 보는 문제 방지.
    // (entitlements는 데이터 없을 때 free로 default → showAds=true → 잘못된 init)
    if (isLoading) return;
    if (!showAds) return;
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    const setHeight = (h: number) => {
      document.documentElement.style.setProperty(AD_HEIGHT_VAR, `${h}px`);
    };

    const sizeListenerPromise = AdMob.addListener(
      BannerAdPluginEvents.SizeChanged,
      (info: { width: number; height: number }) => {
        setHeight(info.height ?? 0);
      },
    );

    // 모달(Sheet/Drawer/Dialog) 열림 감지 → 광고 일시 숨김.
    // Radix Dialog/Sheet/Drawer 모두 [role=dialog|alertdialog][data-state=open] 패턴을 가진다.
    // 모달이 열린 동안 광고는 hideBanner로 가리고, 닫히면 resumeBanner로 복귀.
    let isBannerShown = false; // showBanner 호출 완료 여부
    let isHiddenByModal = false;
    let openModalCount = 0;
    const countOpenModals = (): number =>
      document.querySelectorAll(
        // Radix Dialog/Sheet + Radix AlertDialog + Vaul Drawer 전부 커버
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-vaul-drawer][data-state="open"]',
      ).length;

    // 라우트 전환 시 일시적으로 모달처럼 보이는 DOM 요소가 잠깐 떠서
    // hide/show 깜빡임 발생 → 200ms debounce로 transient 매치 무시.
    // 진짜 모달은 항상 200ms 이상 떠 있어 영향 없음.
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const HIDE_DEBOUNCE_MS = 200;

    const syncBannerVisibility = () => {
      if (!isBannerShown) return;
      const shouldHide = openModalCount > 0;
      if (shouldHide && !isHiddenByModal) {
        // 진짜 모달이면 200ms 이상 떠 있을 것 — 그때 hide 호출
        if (!hideTimer) {
          hideTimer = setTimeout(() => {
            hideTimer = null;
            if (openModalCount > 0 && isBannerShown && !isHiddenByModal) {
              isHiddenByModal = true;
              AdMob.hideBanner().catch(() => {});
            }
          }, HIDE_DEBOUNCE_MS);
        }
      } else if (!shouldHide) {
        // 닫혔으면 대기 중인 hide 취소 + 이미 숨겼던 경우만 resume
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
        if (isHiddenByModal) {
          isHiddenByModal = false;
          AdMob.resumeBanner().catch(() => {});
        }
      }
    };

    const observer = new MutationObserver(() => {
      const next = countOpenModals();
      if (next === openModalCount) return;
      openModalCount = next;
      syncBannerVisibility();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "role"],
    });

    (async () => {
      await initAdMob(showAds);
      if (cancelled) return;
      try {
        const safeBottom = measureSafeAreaBottomPx();
        console.log("[ads] safe-area-inset-bottom =", safeBottom, "→ margin", -safeBottom);
        // 광고 표시 전 미리 추정 높이 세팅 → 탭바가 미리 위로 회피 (타이밍 겹침 방지)
        setHeight(50);
        await AdMob.showBanner({
          adId: getAdUnitId("banner"),
          adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          // 음수 margin = safe area 상쇄 → home indicator 영역까지 배너로 채움
          margin: -safeBottom,
          isTesting: true, // TODO: 앱스토어 제출 전 import.meta.env.DEV 로 원복
        });
        isBannerShown = true;
        // 첫 노출 시점에 이미 열려있던 모달이 있었으면 즉시 숨김 처리
        openModalCount = countOpenModals();
        syncBannerVisibility();
      } catch (e) {
        console.warn("[ads] showBanner failed", e);
      }
    })();

    return () => {
      cancelled = true;
      if (hideTimer) clearTimeout(hideTimer);
      observer.disconnect();
      setHeight(0);
      sizeListenerPromise.then((l) => l.remove()).catch(() => {});
      // 화면 떠날 때 배너 제거 — 메모리·네트워크 절약
      AdMob.removeBanner().catch(() => {});
    };
  }, [showAds, isLoading]);

  // 배너는 native overlay라 React 트리에 렌더할 게 없음
  return null;
}
