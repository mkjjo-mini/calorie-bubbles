import { useCallback, useEffect, useState } from "react";
import { startLogin } from "@/lib/toss-sdk";

export interface Session {
  userKey: number;
}

export type SessionStatus =
  | "idle"
  | "loading"
  | "ready"
  | "unauthenticated"
  | "error";

export interface SessionState {
  session: Session | null;
  status: SessionStatus;
  error: string | null;
  retry: () => void;
}

/**
 * Bootstraps Toss session:
 *   1. GET /api/auth/me (기존 세션 쿠키로 시도)
 *   2. 401 → appLogin() → POST /api/auth/login (쿠키 발급 후 ready)
 *
 * 앱인토스 외부 (일반 브라우저 dev) — appLogin이 throw하면 `unauthenticated`로
 * surface. 앱은 localStorage 기반으로 계속 동작 (무료 사용자 경험과 동일).
 */
export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);

    (async () => {
      // 1. 기존 세션 쿠키로 me 시도
      try {
        const me = await fetch("/api/auth/me", { credentials: "include" });
        if (me.ok) {
          const data = (await me.json()) as { userKey: number };
          if (cancelled) return;
          setSession({ userKey: data.userKey });
          setStatus("ready");
          return;
        }
        if (me.status !== 401) {
          throw new Error(`/api/auth/me ${me.status}`);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "me check failed");
        setStatus("error");
        return;
      }

      // 2. appLogin → /api/auth/login
      try {
        const { authorizationCode, referrer } = await startLogin();
        if (cancelled) return;
        const loginRes = await fetch("/api/auth/login", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ authorizationCode, referrer }),
        });
        if (!loginRes.ok) {
          let code = `LOGIN_${loginRes.status}`;
          try {
            const body = (await loginRes.json()) as { code?: string };
            if (body.code) code = body.code;
          } catch {
            /* ignore */
          }
          throw new Error(code);
        }
        const data = (await loginRes.json()) as { userKey: number };
        if (cancelled) return;
        setSession({ userKey: data.userKey });
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setSession(null);
        setError(e instanceof Error ? e.message : "login failed");
        // Soft fail — 앱은 localStorage 모드로 계속.
        setStatus("unauthenticated");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { session, status, error, retry };
}
