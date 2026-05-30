import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor 설정 — 원격 URL 모드.
 *
 * 탄단지버블은 TanStack Start(SSR) + Cloudflare Workers 앱이라 정적 번들이
 * 불가. 네이티브 셸의 WebView가 배포된 실사이트를 직접 로드한다.
 * Capacitor 브리지는 원격 콘텐츠에도 주입되므로 네이티브 플러그인
 * (haptics·push·camera·IAP)은 정상 동작.
 *
 * ⚠️ server.url 운영값은 prod 도메인. 로컬 테스트 시 LAN IP로 임시 변경.
 *    (예: http://192.168.0.10:3000 — 단 http는 iOS ATS 예외 필요)
 *
 * webDir: 원격 모드라도 Capacitor가 디렉터리 존재를 요구 → 최소 플레이스홀더.
 */
const config: CapacitorConfig = {
  appId: "app.tandanjibubble",
  appName: "탄단지버블",
  webDir: "capacitor-shell",
  server: {
    // 운영 도메인 — Capacitor WebView가 직접 로드
    url: "https://tandanjibubble.app",
    cleartext: false,
  },
  ios: {
    // 콘텐츠가 노치/홈바 영역까지 안전하게 렌더되도록
    contentInset: "always",
    // 키보드 오픈 시 WebView 리사이즈 차단 — 레이아웃 깜박임 방지
    keyboard: {
      resize: "none",
    },
  },
};

export default config;
