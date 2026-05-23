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
  BannerAdPosition,
  BannerAdSize,
} from "@capacitor-community/admob";
import { Capacitor } from "@capacitor/core";
import { useIsPaidUser } from "@/hooks/useIsPaidUser";
import { getAdUnitId, initAdMob } from "@/lib/ads";

export function AdBanner() {
  const { isPaid } = useIsPaidUser();

  useEffect(() => {
    if (isPaid) return;
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    (async () => {
      await initAdMob(isPaid);
      if (cancelled) return;
      try {
        await AdMob.showBanner({
          adId: getAdUnitId("banner"),
          adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.BOTTOM_CENTER,
          margin: 0,
          isTesting: import.meta.env.DEV,
        });
      } catch (e) {
        console.warn("[ads] showBanner failed", e);
      }
    })();

    return () => {
      cancelled = true;
      // 화면 떠날 때 배너 제거 — 메모리·네트워크 절약
      AdMob.removeBanner().catch(() => {});
    };
  }, [isPaid]);

  // 배너는 native overlay라 React 트리에 렌더할 게 없음
  return null;
}
