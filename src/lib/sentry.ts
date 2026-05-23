// Sentry 에러 모니터링 초기화 — 클라이언트(브라우저·Capacitor WebView) 전용.
// SSR/Cloudflare Workers 환경에서는 skip (@sentry/cloudflare는 별도 통합 필요).
//
// 정책 고지: 약관·정책 v2 제5조(처리 위탁)에 향후 추가 예정.
//   현재는 sendDefaultPii=false로 IP·쿠키 자동 수집 X — 익명 에러 데이터만 전송.

import * as Sentry from "@sentry/react";

let initialized = false;

export function initSentry() {
  if (initialized) return;
  if (typeof window === "undefined") return;

  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    if (import.meta.env.DEV) {
      console.warn("[sentry] VITE_SENTRY_DSN not set — skipping init");
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
  initialized = true;
}
