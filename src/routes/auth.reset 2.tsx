import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase-browser";

export const Route = createFileRoute("/auth/reset 2")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
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
        setErr(error.message);
        return;
      }
      navigate({ to: "/" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "변경 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-white flex justify-center px-5 pt-16 pb-10">
      <main className="w-full max-w-[375px] flex flex-col">
        <h1 className="text-2xl font-bold text-neutral-900 leading-tight">
          새 비밀번호를 설정해주세요
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          앞으로 새 비밀번호로 로그인할 수 있어요.
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
      </main>
    </div>
  );
}
