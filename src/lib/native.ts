/**
 * 네이티브(Capacitor) vs 웹 환경 통합 래퍼.
 *
 * 같은 코드가 vite dev / 배포 웹 / Capacitor 네이티브 앱 모두에서 동작.
 * - 네이티브: @capacitor/haptics, status-bar 등 네이티브 API
 * - 웹: navigator.vibrate (Android Chrome만 지원)
 * - SSR: no-op
 *
 * `Capacitor.isNativePlatform()`은 빌드·SSR·웹·네이티브 모두 안전하게 동작.
 */
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { StatusBar, Style } from "@capacitor/status-bar";

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/* ---------------- Haptics ---------------- */

/** 가벼운 탭(50% 초과 등 살짝 강조). 너무 자주 호출하지 말 것. */
export async function hapticLight(): Promise<void> {
  if (isNative()) {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      /* silent */
    }
    return;
  }
  webVibrate(30);
}

/** 강한 탭(목표 초과 시). */
export async function hapticHeavy(): Promise<void> {
  if (isNative()) {
    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch {
      /* silent */
    }
    return;
  }
  webVibrate([40, 30, 60]);
}

/** 에러/경고 — 짧은 진동 + native에선 별도 패턴. */
export async function hapticWarning(): Promise<void> {
  if (isNative()) {
    try {
      await Haptics.notification({ type: NotificationType.Warning });
    } catch {
      /* silent */
    }
    return;
  }
  webVibrate(40);
}

function webVibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* silent */
  }
}

/* ---------------- Status Bar ---------------- */

/**
 * iOS 상태바 텍스트 색상 지정. 웹/SSR에선 no-op.
 * - "dark": 검정 텍스트 (밝은 배경에 적합 — 우리 앱 기본)
 * - "light": 흰 텍스트 (어두운 배경)
 */
export async function setStatusBarStyle(style: "dark" | "light"): Promise<void> {
  if (!isNative()) return;
  try {
    await StatusBar.setStyle({
      style: style === "dark" ? Style.Dark : Style.Light,
    });
  } catch {
    /* silent */
  }
}
