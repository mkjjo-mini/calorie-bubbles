import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { handleAuth } from "./server/auth/router";
import type { Env } from "./server/auth/env";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

async function resolveEnv(env: unknown): Promise<Env | null> {
  if (env) return env as Env;
  // dev (vite + cloudflare plugin is build-only) — Node process.env + in-memory KV fallback.
  // prod 빌드에선 import.meta.env.DEV가 false라 dynamic import가 dead code로 제거됨.
  if (import.meta.env?.DEV) {
    const { getDevEnv } = await import("./server/auth/dev-env");
    return getDevEnv();
  }
  return null;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);

      // /api/* — Worker fetch handler에서 직접 처리 (createServerFn RPC는 cookie 발급 불충분).
      // env fallback (dev only)를 중앙화 — auth router와 api router 모두 effectiveEnv 사용.
      if (url.pathname.startsWith("/api/")) {
        const effectiveEnv = await resolveEnv(env);
        if (!effectiveEnv) {
          return new Response(
            JSON.stringify({
              code: "ENV_MISSING",
              message: "Worker bindings 누락",
            }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
        // 1) /api/auth/*
        if (url.pathname.startsWith("/api/auth/")) {
          const res = await handleAuth(request, effectiveEnv);
          if (res) return res;
        } else {
          // 2) /api/* (foods, food-logs, user-goals, favorites, subscription-status)
          const { handleApi } = await import("./server/api/router");
          const res = await handleApi(request, effectiveEnv);
          if (res) return res;
        }
      }

      // 3) 그 외 — TanStack Start로 위임
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
