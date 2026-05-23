// AdMob 초기화 + 등급 분기.
//
//  - Web (브라우저 dev)에서는 SDK가 동작하지 않으므로 모든 호출이 no-op.
//  - iOS Capacitor 네이티브에서만 실제 광고 표시.
//  - 유료 사용자(Basic/Pro)는 SDK init 자체 skip → 광고 노출 없음.
//
//  PRD: step-15-admob-integration.md

import { AdMob } from "@capacitor-community/admob";
import { Capacitor } from "@capacitor/core";

let initialized = false;
let initPromise: Promise<void> | null = null;

/** SDK 초기화. 유료 사용자거나 web 환경이면 즉시 반환. */
export async function initAdMob(isPaid: boolean): Promise<void> {
  if (isPaid) return;
  if (!Capacitor.isNativePlatform()) return;
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await AdMob.initialize({
        // dev 빌드에서만 테스트 디바이스 강제 (실제 광고 클릭 방지)
        initializeForTesting: import.meta.env.DEV,
      });
      // iOS 14.5+ App Tracking Transparency 권한 요청 (거부 시 비개인화 광고).
      // Android·구버전 iOS에선 메서드가 no-op 또는 throw — 안전하게 catch.
      try {
        await AdMob.requestTrackingAuthorization();
      } catch {
        /* ATT 미지원 환경 — 무시 */
      }
      initialized = true;
    } catch (e) {
      console.warn("[ads] AdMob init failed", e);
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export function isAdMobReady(): boolean {
  return initialized && Capacitor.isNativePlatform();
}

/** dev/prod에 따라 실제 ID vs Google 공식 테스트 ID 반환. */
export function getAdUnitId(type: "banner" | "interstitial" | "rewarded"): string {
  // dev에서는 Google 공식 테스트 ID 사용 (실수로 진짜 광고 클릭해도 정책 위반 X)
  if (import.meta.env.DEV) {
    const TEST_IDS = {
      banner: "ca-app-pub-3940256099942544/2934735716",
      interstitial: "ca-app-pub-3940256099942544/4411468910",
      rewarded: "ca-app-pub-3940256099942544/1712485313",
    };
    return TEST_IDS[type];
  }

  const REAL_IDS = {
    banner: import.meta.env.VITE_ADMOB_BANNER_ID,
    interstitial: import.meta.env.VITE_ADMOB_INTERSTITIAL_ID,
    rewarded: import.meta.env.VITE_ADMOB_REWARDED_ID,
  } as Record<string, string | undefined>;
  return REAL_IDS[type] ?? "";
}
