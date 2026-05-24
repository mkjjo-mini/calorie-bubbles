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
import { AppleIcon, GoogleIcon, KakaoIcon } from "@/components/auth/SocialIcons";

const searchSchema = z.object({
  next: z.string().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/auth/login")({
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    // 이미 로그인된 사용자는 홈으로 (next 우선)
    try {
      const supabase = getBrowserSupabase();
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        throw redirect({ to: search.next ?? "/" });
      }
    } catch (e) {
      if (e && typeof e === "object" && "isRedirect" in e) throw e;
      // env 미설정은 표시만 — 화면이 에러 알려줌
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth/login" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState<null | "email" | "google" | "apple" | "kakao">(null);
  const [err, setErr] = useState<string | null>(search.error ?? null);

  async function onEmailSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setErr(null);
    setLoading("email");
    try {
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErr(translateAuthError(error.message));
        return;
      }
      navigate({ to: search.next ?? "/" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "로그인 실패");
    } finally {
      setLoading(null);
    }
  }

  async function onOAuth(provider: "google" | "apple" | "kakao") {
    if (loading) return;
    setErr(null);
    setLoading(provider);
    try {
      const supabase = getBrowserSupabase();
      const next = search.next ?? "/";
      // implicit flow — token이 URL fragment로 오므로 server callback이 아닌
      // client-side /auth/callback에서 처리. Capacitor WebView 호환.
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      // 카카오는 콘솔에서 활성화한 scope만 요청 가능 — 비활성화된 scope 요청 시 KOE205.
      // 우리는 이메일만 받으니까 카카오 한정으로 scopes를 account_email로 제한.
      const scopes = provider === "kakao" ? "account_email" : undefined;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, scopes },
      });
      if (error) {
        setErr(translateAuthError(error.message));
        setLoading(null);
      }
      // 성공 시 브라우저가 provider로 redirect됨 — loading 유지
    } catch (e) {
      setErr(e instanceof Error ? e.message : "로그인 실패");
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen w-full bg-white flex justify-center px-5 pt-16 pb-10">
      <main className="w-full max-w-[375px] flex flex-col">
        <h1 className="text-2xl font-bold text-neutral-900 leading-tight">
          돌아오신 걸 환영해요
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          이메일로 로그인하거나 소셜 계정을 사용하세요.
        </p>

        <form onSubmit={onEmailSubmit} className="mt-8 flex flex-col gap-3">
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
            <span className="text-xs font-semibold text-neutral-700">비밀번호</span>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                required
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

          {err && (
            <p className="text-xs text-red-600 mt-1">{err}</p>
          )}

          <button
            type="submit"
            disabled={loading !== null || !email || !password}
            className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-neutral-900 text-sm font-semibold text-white disabled:opacity-40 active:bg-neutral-800"
          >
            {loading === "email" && <Loader2 className="h-4 w-4 animate-spin" />}
            이메일로 로그인
          </button>
        </form>

        <div className="flex items-center gap-3 my-7">
          <div className="flex-1 h-px bg-neutral-100" />
          <span className="text-[11px] text-neutral-400">또는</span>
          <div className="flex-1 h-px bg-neutral-100" />
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => onOAuth("kakao")}
            disabled={loading !== null}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#FEE500] text-sm font-semibold text-[rgba(0,0,0,0.85)] disabled:opacity-40 active:bg-[#FDD835]"
          >
            {loading === "kakao" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <KakaoIcon className="h-5 w-5" />
            )}
            카카오로 계속하기
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
        </div>

        <div className="mt-8 flex items-center justify-between text-xs">
          <Link
            to="/auth/forgot"
            className="text-neutral-500 active:text-neutral-900"
          >
            비밀번호 찾기
          </Link>
          <Link
            to="/auth/signup"
            search={search.next ? { next: search.next } : undefined}
            className="font-semibold text-neutral-900"
          >
            계정 만들기 →
          </Link>
        </div>
      </main>
    </div>
  );
}

function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid_credentials")) {
    return "이메일 또는 비밀번호가 일치하지 않아요.";
  }
  if (m.includes("email not confirmed")) {
    return "이메일 인증을 완료해주세요. 받은 메일함을 확인하세요.";
  }
  if (m.includes("rate limit")) {
    return "잠시 후 다시 시도해주세요.";
  }
  return msg;
}
