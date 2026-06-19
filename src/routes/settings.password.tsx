/**
 * 설정 → 비밀번호 변경 (인앱 완결).
 *
 * 로그인된 사용자가 새 비밀번호를 직접 설정. 이메일·웹·PKCE 불필요 —
 * 활성 세션으로 updateUser({ password }) 직접 호출.
 * (forgot-password와 달리 세션이 있으므로 메일 링크가 필요 없음)
 *
 * 노출 조건: 이메일 가입자만 (소셜 로그인은 비밀번호 없음 — settings.account에서 가드).
 */
import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getBrowserSupabase } from "@/lib/supabase-browser";

export const Route = createFileRoute("/settings/password")({
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
        // 동일 비밀번호 등 Supabase 거부 메시지
        setErr(
          error.message.includes("New password should be different")
            ? "기존과 다른 비밀번호를 입력해주세요."
            : error.message,
        );
        return;
      }
      toast.success("비밀번호가 변경됐어요.");
      navigate({ to: "/settings/account", replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "변경에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-white flex justify-center">
      <main className="w-full max-w-[390px] flex flex-col">
        <header className="sticky top-[env(safe-area-inset-top)] z-10 flex items-center gap-2 border-b border-neutral-100 bg-white/95 px-4 py-3 backdrop-blur">
          <button
            type="button"
            aria-label="뒤로"
            onClick={() => navigate({ to: "/settings/account" })}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 active:bg-neutral-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-semibold text-neutral-900">비밀번호 변경</h1>
        </header>

        <form onSubmit={onSubmit} className="flex-1 px-4 pt-6 pb-12 flex flex-col gap-3">
          <p className="text-sm text-neutral-500 leading-relaxed">
            앞으로 새 비밀번호로 로그인할 수 있어요.
          </p>

          <label className="mt-4 flex flex-col gap-1.5">
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
      </main>
    </div>
  );
}
