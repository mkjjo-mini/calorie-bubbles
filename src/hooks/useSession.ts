/**
 * Supabase Auth 세션 훅.
 *
 *  - 초기 마운트: supabase.auth.getSession()
 *  - 이후: onAuthStateChange 구독 (로그인/로그아웃/토큰 refresh 자동 반영)
 *  - status:
 *      "loading"          → 초기 조회 중
 *      "authenticated"    → 세션 있음 (userId, email 사용 가능)
 *      "unauthenticated"  → 세션 없음 (로그인 화면으로 가드)
 *      "error"            → 환경변수 미설정 등 (가드 통과 X)
 */
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase-browser";

export type SessionStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

export interface AuthSession {
  userId: string;
  email: string | null;
  raw: Session;
}

export interface SessionState {
  session: AuthSession | null;
  status: SessionStatus;
  error: string | null;
  signOut: () => Promise<void>;
}

function fromRaw(raw: Session | null): AuthSession | null {
  if (!raw?.user) return null;
  return { userId: raw.user.id, email: raw.user.email ?? null, raw };
}

export function useSession(): SessionState {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let supabase;
    try {
      supabase = getBrowserSupabase();
    } catch (e) {
      setError(e instanceof Error ? e.message : "supabase init failed");
      setStatus("error");
      return;
    }

    let cancelled = false;
    supabase.auth.getSession().then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setStatus("error");
        return;
      }
      const s = fromRaw(data.session);
      setSession(s);
      setStatus(s ? "authenticated" : "unauthenticated");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, raw) => {
      if (cancelled) return;
      const s = fromRaw(raw);
      setSession(s);
      setStatus(s ? "authenticated" : "unauthenticated");
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getBrowserSupabase();
    await supabase.auth.signOut();
    // onAuthStateChange가 status를 unauthenticated로 갱신
  }, []);

  return { session, status, error, signOut };
}
