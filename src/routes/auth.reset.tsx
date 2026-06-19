/**
 * /auth/reset — 비밀번호 재설정 (forgot-password 메일 링크 착지점).
 *
 * 흐름:
 *   1. 메일 링크 = /auth/reset?token_hash=...&type=recovery (Supabase 이메일 템플릿이
 *      {{ .TokenHash }} 사용 → PKCE 우회. 외부 Safari·어느 브라우저에서나 동작)
 *   2. verifyOtp({ token_hash, type: 'recovery' }) → 임시 recovery 세션 확보
 *   3. 새 비밀번호 입력 → updateUser({ password })
 *   4. 변경 후 signOut → "앱에서 로그인" 안내 (웹 세션 미유지 — 제품 완결성은 앱에서)
 *
 * ⚠️ Supabase 설정 필요:
 *   Dashboard → Authentication → Email Templates → Reset Password 링크를
 *   <a href="{{ .SiteURL }}/auth/reset?token_hash={{ .TokenHash }}&type=recovery">
 *   로 변경. Site URL = https://tandanjibubble.app.
 */
import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase-browser";

const searchSchema = z.object({
  token_hash: z.string().optional(),
  type: z.string().optional(),
});

export const Route = createFileRoute("/auth/reset")({
  validateSearch: searchSchema,
  component: ResetPasswordPage,
});

type Phase = "verifying" | "ready" | "invalid" | "done";

function ResetPasswordPage() {
  const { token_hash } = Route.useSearch();
  const [phase, setPhase] = useState<Phase>("verifying");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 1. 메일 토큰 검증 → recovery 세션 확보
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getBrowserSupabase();

      // token_hash가 있으면 PKCE 없이 검증.
      if (token_hash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash,
          type: "recovery",
        });
        if (cancelled) return;
        setPhase(error ? "invalid" : "ready");
        return;
      }

      // token_hash 없음 — 이미 recovery 세션이 있는지 확인 (fallback).
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setPhase(data.session ? "ready" : "invalid");
    })();
    return () => {
      cancelled = true;
    };
  }, [token_hash]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setErr(null);
    if (pw1.length < 8) {
      setErr("비밀번호는 최소 8자 이상이어야 해요.");
      return;
    }
    if (pw1 !== pw2) {
      setErr("두 비밀번호가 일치하지 않아요.");
      return;
    }
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) {
        setErr(
          error.message.includes("New password should be different")
            ? "기존과 다른 비밀번호를 입력해주세요."
            : error.message,
        );
        return;
      }
      // 웹 세션은 유지하지 않음 — 로그인은 앱에서 (제품 완결성).
      await supabase.auth.signOut().catch(() => {});
      setPhase("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "변경에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-white flex justify-center px-5 pt-16 pb-10">
      <main className="w-full max-w-[375px] flex flex-col">
        {phase === "verifying" && (
          <div className="flex flex-col items-center gap-3 pt-20 text-neutral-500">
            <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
            <p className="text-xs">링크를 확인하고 있어요…</p>
          </div>
        )}

        {phase === "invalid" && (
          <>
            <h1 className="text-2xl font-bold text-neutral-900 leading-tight">
              링크가 만료됐어요
            </h1>
            <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
              비밀번호 재설정 링크가 만료되었거나 이미 사용됐어요. 탄단지버블 앱에서 다시
              요청해주세요.
            </p>
          </>
        )}

        {phase === "ready" && (
          <>
            <h1 className="text-2xl font-bold text-neutral-900 leading-tight">
              새 비밀번호를 설정해주세요
            </h1>
            <p className="mt-2 text-sm text-neutral-500">
              변경 후 탄단지버블 앱에서 새 비밀번호로 로그인할 수 있어요.
            </p>

            <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-neutral-700">
                  새 비밀번호 <span className="text-neutral-400 font-normal">(최소 8자)</span>
                </span>
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={pw1}
                    onChange={(e) => setPw1(e.target.value)}
                    className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-neutral-900 pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                    aria-label={show ? "비밀번호 숨김" : "비밀번호 보기"}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-neutral-700">새 비밀번호 확인</span>
                <input
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  className="rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-neutral-900"
                />
              </label>

              {err && <p className="text-xs text-red-600 mt-1">{err}</p>}

              <button
                type="submit"
                disabled={loading || !pw1 || !pw2}
                className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-neutral-900 text-sm font-semibold text-white disabled:opacity-40 active:bg-neutral-800"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                비밀번호 변경
              </button>
            </form>
          </>
        )}

        {phase === "done" && (
          <div className="flex flex-col items-center text-center pt-16">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <h1 className="mt-4 text-xl font-bold text-neutral-900">비밀번호가 변경됐어요</h1>
            <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
              이 창은 닫고, <span className="font-semibold text-neutral-800">탄단지버블 앱</span>을
              열어 새 비밀번호로 로그인해주세요.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
