import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase-browser";

export const Route = createFileRoute("/auth/forgot 2")({
  component: ForgotPage,
});

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setErr(null);
    setLoading(true);
    try {
      const supabase = getBrowserSupabase();
      // 비밀번호 재설정 메일 → 링크 클릭 시 /auth/reset?code=...
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/auth/reset`,
      });
      if (error) {
        setErr(error.message);
        return;
      }
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "전송 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-white flex justify-center px-5 pt-16 pb-10">
      <main className="w-full max-w-[375px] flex flex-col">
        <h1 className="text-2xl font-bold text-neutral-900 leading-tight">
          비밀번호를 잊으셨나요?
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          가입한 이메일을 입력하시면 재설정 링크를 보내드릴게요.
        </p>

        {!sent ? (
          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-neutral-700">이메일</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-neutral-900"
                placeholder="you@example.com"
              />
            </label>
            {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
            <button
              type="submit"
              disabled={loading || !email}
              className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-neutral-900 text-sm font-semibold text-white disabled:opacity-40 active:bg-neutral-800"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              재설정 링크 받기
            </button>
          </form>
        ) : (
          <div className="mt-8 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
            <p className="text-sm text-emerald-800">
              {email} 으로 비밀번호 재설정 링크를 보냈어요. 메일함을 확인하세요.
            </p>
          </div>
        )}

        <Link
          to="/auth/login"
          className="mt-6 text-center text-xs text-neutral-500 active:text-neutral-900"
        >
          ← 로그인으로 돌아가기
        </Link>
      </main>
    </div>
  );
}
