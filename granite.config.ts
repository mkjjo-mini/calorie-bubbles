import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "tandanji-bubble",
  brand: {
    displayName: "탄단지버블",
    primaryColor: "#FFD700",
    // TODO: 실제 CDN URL로 교체 (앱인토스 콘솔 등록 아이콘과 일치).
    // 로컬 상대경로 불가 — public/dist 경로도 안 됨.
    icon: "https://placeholder.example.com/tandanji-bubble-icon.png",
  },
  web: {
    // 샌드박스앱이 폰에서 접근하므로 PC LAN IP 사용 (localhost는 폰이 자기 자신 찾음).
    // 같은 Wi-Fi 망에 있는 폰만 접근 가능. 다른 망이면 cloudflared tunnel 권장.
    // 라이브 배포 시엔 production 도메인으로 교체.
    host: "192.168.45.115",
    // ⚠️ 8081은 metro(RN) 전용 포트. vite는 5173 등 다른 포트로 분리해야 함
    // (가이드: tutorials/webview.md 트러블슈팅 §"PC웹에서 Not Found")
    port: 5173,
    commands: {
      // --host: 0.0.0.0 binding (LAN IP 접근), --port 5173: metro(8081)와 충돌 회피
      // 명시적 --port 없으면 lovable의 sandbox detection이 8080→8081 fallback 시도
      dev: "vite --host --port 5173",
      build: "vite build",
    },
  },
  webViewProps: {
    type: "partner",
    bounces: false,
  },
  // 실제로 사용하는 권한만 선언 (과다 선언은 검수 반려 사유).
  permissions: [],
});
