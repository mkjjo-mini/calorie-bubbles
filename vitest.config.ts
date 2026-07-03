/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Vitest runs in isolation from the TanStack Start / Cloudflare dev stack.
// We deliberately do NOT load the full vite.config.ts here because the
// @lovable.dev/vite-tanstack-config plugin chain assumes a SSR build context
// that vitest does not provide. We re-declare the @/* path alias inline
// (vite-tsconfig-paths did not pick up tsconfig paths reliably under vitest 4).
const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost",
      },
    },
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    css: false,
    // Keep tests fast and deterministic; framer-motion animations and dnd-kit
    // are NOT exercised here — see QA.md for the manual coverage matrix.
  },
});
