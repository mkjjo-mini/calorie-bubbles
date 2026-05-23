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
    // ⚠️ TEMP: 로컬 빌드 검증용. 검증 후 https://tandanjibubble.app + cleartext:false 로 복구.
    //    LAN IP라 같은 Wi-Fi의 시뮬레이터·실기기 모두 접근 가능. dev 서버 떠 있어야 함.
    url: "http://192.168.45.222:3000",
    cleartext: true,
  },
  ios: {
    // 콘텐츠가 노치/홈바 영역까지 안전하게 렌더되도록
    contentInset: "always",
  },
};

export default config;
