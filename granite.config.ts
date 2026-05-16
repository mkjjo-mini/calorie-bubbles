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
    host: "localhost",
    port: 3000,
    commands: {
      dev: "npm run dev",
      build: "npm run build",
    },
  },
  webViewProps: {
    type: "partner",
    bounces: false,
  },
  // 실제로 사용하는 권한만 선언 (과다 선언은 검수 반려 사유).
  permissions: [],
});
