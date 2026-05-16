import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "tandanji-bubble",
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
});
