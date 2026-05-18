import { useState, type FormEvent } from "react";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { z } from "zod";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { AppleIcon, GoogleIcon } from "@/components/auth/SocialIcons";

const searchSchema = z.object({
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth/signup")({
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    try {
      const supabase = getBrowserSupabase();
      const { data } = await supabase.auth.getSession();
      if (data.session) throw redirect({ to: search.next ?? "/" });
    } catch (e) {
      if (e && typeof e === "object" && "isRedirect" in e) throw e;
    }
  },
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth/signup" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState<null | "email" | "google" | "apple">(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setErr(null);
    setInfo(null);
    if (password.length < 8) {
      setErr("비밀번호는 최소 8자 이상이어야 해요.");
      return;
    }
    setLoading("email");
    try {
      const supabase = getBrowserSupabase();
      const next = search.next ?? "/";
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) {
        setErr(translateAuthError(error.message));
        return;
      }
      // Supabase 프로젝트 설정에 따라:
      //  - confirm-email ON → data.session === null, 이메일 인증 필요
      //  - confirm-email OFF → data.session 즉시 발급
      if (data.session) {
        navigate({ to: next });
      } else {
        setInfo("이메일로 인증 링크를 보냈어요. 메일함을 확인하세요.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "회원가입 실패");
    } finally {
      setLoading(null);
    }
  }

  async function onOAuth(provider: "google" | "apple") {
    if (loading) return;
    setErr(null);
    setLoading(provider);
    try {
      const supabase = getBrowserSupabase();
      const next = search.next ?? "/";
      const redirectTo = `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) {
        setErr(translateAuthError(error.message));
        setLoading(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "회원가입 실패");
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen w-full bg-white flex justify-center px-5 pt-16 pb-10">
      <main className="w-full max-w-[375px] flex flex-col">
        <h1 className="text-2xl font-bold text-neutral-900 leading-tight">
          탄단지 버블에 처음 오셨나요?
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          이메일로 가입하거나 소셜 계정을 연결하세요.
        </p>

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
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-neutral-700">
              비밀번호 <span className="text-neutral-400 font-normal">(최소 8자)</span>
            </span>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-neutral-900 pr-12"
                placeholder="비밀번호"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                aria-label={showPw ? "비밀번호 숨김" : "비밀번호 보기"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
          {info && <p className="text-xs text-emerald-600 mt-1">{info}</p>}

          <button
            type="submit"
            disabled={loading !== null || !email || !password}
            className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-neutral-900 text-sm font-semibold text-white disabled:opacity-40 active:bg-neutral-800"
          >
            {loading === "email" && <Loader2 className="h-4 w-4 animate-spin" />}
            계정 만들기
          </button>
        </form>

        <div className="flex items-center gap-3 my-7">
          <div className="flex-1 h-px bg-neutral-100" />
          <span className="text-[11px] text-neutral-400">또는</span>
          <div className="flex-1 h-px bg-neutral-100" />
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => onOAuth("apple")}
            disabled={loading !== null}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-black text-sm font-semibold text-white disabled:opacity-40 active:bg-neutral-800"
          >
            {loading === "apple" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <AppleIcon className="h-5 w-5" />
            )}
            Apple로 계속하기
          </button>
          <button
            onClick={() => onOAuth("google")}
            disabled={loading !== null}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-900 disabled:opacity-40 active:bg-neutral-50"
          >
            {loading === "google" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GoogleIcon className="h-5 w-5" />
            )}
            Google로 계속하기
          </button>
        </div>

        <p className="mt-8 text-xs text-neutral-500 text-center">
          이미 계정이 있나요?{" "}
          <Link
            to="/auth/login"
            search={search.next ? { next: search.next } : undefined}
            className="font-semibold text-neutral-900"
          >
            로그인
          </Link>
        </p>
      </main>
    </div>
  );
}

function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("already registered") || m.includes("user already")) {
    return "이미 가입된 이메일이에요. 로그인을 시도해보세요.";
  }
  if (m.includes("password should be at least")) {
    return "비밀번호는 최소 8자 이상이어야 해요.";
  }
  if (m.includes("invalid email")) {
    return "이메일 형식이 올바르지 않아요.";
  }
  if (m.includes("rate limit")) {
    return "잠시 후 다시 시도해주세요.";
  }
  return msg;
}
