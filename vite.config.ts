import { sentryVitePlugin } from "@sentry/vite-plugin";
// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },

  vite: {
    server: {
      port: 3000,
      // 3000이 점유돼 있어도 다른 포트로 fallback하지 말고 실패 — Supabase Site URL과 일치 보장
      strictPort: true,
      // tunneling (cloudflared, ngrok 등) 통한 외부 host 허용 — dev only
      allowedHosts: true,
    },
  },

  build: {
    sourcemap: true,
  },

  plugins: [
    sentryVitePlugin({
      org: "imnaco805",
      project: "tandanji-bubble",
    }),
  ],
});
