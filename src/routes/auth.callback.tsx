/**
 * /auth/callback — OAuth implicit flow의 client-side 콜백.
 *
 * Capacitor 환경에서 PKCE storage가 WebView ↔ 외부 Safari 사이에서
 * 공유되지 않는 문제로 implicit flow를 사용. token은 URL fragment(#...)로
 * 도착하므로 server callback(/api/auth/callback)이 처리 못 함 — 이 client
 * 페이지가 자동 fragment 파싱 후 세션 저장.
 *
 * createBrowserClient는 페이지 로드 시 fragment를 자동 감지해 세션을 만들고
 * 쿠키에 저장. 그 후 next 파라미터로 navigate.
 */
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase-browser";

const searchSchema = z.object({
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth/callback")({
  validateSearch: searchSchema,
  component: CallbackPage,
});

function CallbackPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth/callback" });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserSupabase();

    // Supabase는 createBrowserClient mount 시 URL fragment를 detect해 세션을 만든다.
    // 짧은 polling으로 세션 발급을 기다린 뒤 next로 이동.
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 50; // ~5s

    const check = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      if (error) {
        setErr(error.message);
        return;
      }
      if (data.session) {
        const next = search.next ?? "/";
        navigate({ to: next, replace: true });
        return;
      }
      attempts++;
      if (attempts >= maxAttempts) {
        setErr("로그인 처리 실패. 다시 시도해주세요.");
        return;
      }
      setTimeout(() => void check(), 100);
    };
    void check();

    return () => {
      cancelled = true;
    };
  }, [navigate, search.next]);

  if (err) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-white px-6">
        <div className="max-w-sm text-center">
          <h2 className="text-base font-semibold text-neutral-900">
            로그인할 수 없어요
          </h2>
          <p className="mt-2 text-xs text-red-600">{err}</p>
          <button
            type="button"
            onClick={() =>
              navigate({ to: "/auth/login", search: { error: err }, replace: true })
            }
            className="mt-5 inline-flex h-10 items-center rounded-lg bg-neutral-900 px-4 text-xs font-semibold text-white"
          >
            로그인 화면으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-3 text-neutral-600">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        <p className="text-xs">로그인 중…</p>
      </div>
    </div>
  );
}
