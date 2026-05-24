import { useState, type FormEvent } from "react";
import { createFileRoute, Link, redirect, useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronDown, Eye, EyeOff, Loader2 } from "lucide-react";
import { z } from "zod";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { AppleIcon, GoogleIcon, KakaoIcon } from "@/components/auth/SocialIcons";
import { INLINE_BODIES, useLegalDocuments } from "@/lib/legal";

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
  const [loading, setLoading] = useState<null | "email" | "google" | "apple" | "kakao">(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // 활성 약관 — id 매핑용. 캐시(1h)되므로 비용 미미.
  const { data: legalDocs } = useLegalDocuments();

  // 필수 동의 3종 — 약관·정책의 만 14세 미만 가입 차단 + PIPA 동의 근거
  const [agreeAge14, setAgreeAge14] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  // 마케팅 (선택) — 미체크해도 가입 가능. inline 문구 + 펼치기 상세.
  const [agreeMarketing, setAgreeMarketing] = useState(false);
  const [marketingExpanded, setMarketingExpanded] = useState(false);
  const hasConsent = agreeAge14 && agreeTerms && agreePrivacy;
  const allChecked = hasConsent && agreeMarketing;

  function toggleAll(checked: boolean) {
    setAgreeAge14(checked);
    setAgreeTerms(checked);
    setAgreePrivacy(checked);
    setAgreeMarketing(checked);
  }

  /**
   * 선택된 체크 상태 → 활성 doc id 배열.
   * legalDocs가 아직 로드 안 됐으면 빈 배열 반환 — 호출처가 후속 처리(저장 스킵 + 가드 의존)를 결정.
   */
  function selectedDocIds(): string[] {
    if (!legalDocs) return [];
    const ids: string[] = [];
    const findId = (type: string) => legalDocs.find((d) => d.doc_type === type)?.id;
    if (agreeAge14) {
      const id = findId("age_14");
      if (id) ids.push(id);
    }
    if (agreeTerms) {
      const id = findId("terms");
      if (id) ids.push(id);
    }
    if (agreePrivacy) {
      const id = findId("privacy");
      if (id) ids.push(id);
    }
    if (agreeMarketing) {
      const id = findId("marketing");
      if (id) ids.push(id);
    }
    return ids;
  }

  /**
   * OAuth·이메일 confirm 흐름은 signup 페이지를 떠난 뒤 callback이 동의 row 없음을
   * 보고 /auth/consent로 redirect함. 그 페이지에서 한 번 더 체크박스 표시되는데,
   * 사용자가 여기서 이미 체크한 마케팅 의사를 잃지 않게 sessionStorage에 임시 저장.
   * /auth/consent 페이지가 mount 시 읽고 pre-check 처리 (그 페이지에서 clear).
   */
  function saveMarketingIntent() {
    try {
      sessionStorage.setItem("signup_marketing_intent", agreeMarketing ? "1" : "0");
    } catch {
      // private mode 등에서 실패해도 가입은 계속 — 마케팅 의사만 손실.
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setErr(null);
    setInfo(null);
    if (!hasConsent) {
      setErr("필수 동의 항목을 모두 체크해주세요.");
      return;
    }
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
      // Supabase의 email enumeration 방지 동작 — 이미 가입된 이메일은
      // error를 던지지 않고 user 객체에 identities=[]로 응답. 보안상 누군가
      // "이미 가입됨" 응답으로 가입자 명단을 추출하지 못하게 막는 정책.
      // UX 측면에선 사용자가 가입 시도 → "메일 보냈어요" 표시 → 헷갈림.
      // identities 빈 배열이면 친절히 로그인 유도.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setErr("이미 가입된 이메일이에요. 로그인을 시도해보세요.");
        return;
      }
      // Supabase 프로젝트 설정에 따라:
      //  - confirm-email ON → data.session === null, 이메일 인증 필요
      //  - confirm-email OFF → data.session 즉시 발급
      if (data.session) {
        // 동의 즉시 기록. 실패해도 가입은 통과시키고 AppShell이 catch (fail-open).
        try {
          const docIds = selectedDocIds();
          if (docIds.length > 0) {
            await fetch("/api/auth/consent", {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ document_ids: docIds, source: "signup" }),
            });
          }
        } catch (e) {
          console.warn("[signup] consent persist failed", e);
        }
        navigate({ to: next });
      } else {
        // confirm-email 흐름 — 마케팅 의사를 잃지 않게 임시 저장.
        // 사용자가 메일 링크 클릭 → /api/auth/callback → callback 가드가 /auth/consent로 redirect.
        // 거기서 sessionStorage 읽고 pre-check.
        saveMarketingIntent();
        setInfo("이메일로 인증 링크를 보냈어요. 메일함을 확인하세요.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "회원가입 실패");
    } finally {
      setLoading(null);
    }
  }

  async function onOAuth(provider: "google" | "apple" | "kakao") {
    if (loading) return;
    setErr(null);
    if (!hasConsent) {
      setErr("필수 동의 항목을 모두 체크해주세요.");
      return;
    }
    // OAuth는 페이지를 떠나므로 동의 row를 여기서 INSERT할 수 없다.
    // callback 가드가 /auth/consent로 redirect하면, 그 페이지가 sessionStorage를
    // 읽고 마케팅 체크 상태를 복원 → 한 번의 클릭으로 동의 완료.
    saveMarketingIntent();
    setLoading(provider);
    try {
      const supabase = getBrowserSupabase();
      const next = search.next ?? "/";
      // Capacitor WebView 호환 — skipBrowserRedirect + manual navigate.
      // auth.login.tsx의 onOAuth 주석 참조.
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const scopes = provider === "kakao" ? "account_email" : undefined;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, scopes, skipBrowserRedirect: true },
      });
      if (error) {
        setErr(translateAuthError(error.message));
        setLoading(null);
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
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
        <p className="mt-2 text-sm text-neutral-500">이메일로 가입하거나 소셜 계정을 연결하세요.</p>

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

          {/* 약관 동의 그룹 — 필수 3종 + 선택(마케팅) */}
          <div className="mt-2 rounded-xl border border-neutral-100 bg-neutral-50/60 p-4">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) => toggleAll(e.target.checked)}
                className="h-4 w-4 rounded accent-neutral-900"
              />
              <span className="text-sm font-semibold text-neutral-900">
                전체 동의{" "}
                <span className="text-[11px] font-normal text-neutral-500">(선택 항목 포함)</span>
              </span>
            </label>

            <div className="my-3 h-px bg-neutral-200/70" />

            <div className="space-y-2.5">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreeAge14}
                  onChange={(e) => setAgreeAge14(e.target.checked)}
                  className="h-4 w-4 rounded accent-neutral-900"
                />
                <span className="text-xs text-neutral-700">
                  <span className="font-semibold text-neutral-900">[필수]</span> 만 14세 이상입니다
                </span>
              </label>

              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="h-4 w-4 rounded accent-neutral-900"
                  />
                  <span className="text-xs text-neutral-700">
                    <span className="font-semibold text-neutral-900">[필수]</span> 이용약관 동의
                  </span>
                </label>
                <Link
                  to="/legal/terms"
                  target="_blank"
                  rel="noopener"
                  className="text-[11px] text-neutral-500 underline underline-offset-2"
                >
                  보기
                </Link>
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={agreePrivacy}
                    onChange={(e) => setAgreePrivacy(e.target.checked)}
                    className="h-4 w-4 rounded accent-neutral-900"
                  />
                  <span className="text-xs text-neutral-700">
                    <span className="font-semibold text-neutral-900">[필수]</span> 개인정보처리방침
                    동의
                  </span>
                </label>
                <Link
                  to="/legal/privacy"
                  target="_blank"
                  rel="noopener"
                  className="text-[11px] text-neutral-500 underline underline-offset-2"
                >
                  보기
                </Link>
              </div>

              {/* 마케팅 동의 (선택) — inline 문구 + "자세히" 펼치기.
                  PIPA 권장 요건: 수신 채널·정보 유형·철회 방법을 명시. INLINE_BODIES.detail이 충족. */}
              <div>
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={agreeMarketing}
                      onChange={(e) => setAgreeMarketing(e.target.checked)}
                      className="h-4 w-4 rounded accent-neutral-900"
                    />
                    <span className="text-xs text-neutral-700">
                      <span className="font-medium text-neutral-500">[선택]</span> 마케팅 정보 수신
                      (이메일·푸시)
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setMarketingExpanded((v) => !v)}
                    className="text-[11px] text-neutral-500 inline-flex items-center gap-0.5"
                    aria-label="자세히"
                  >
                    자세히
                    <ChevronDown
                      className={`h-3 w-3 transition-transform ${marketingExpanded ? "rotate-180" : ""}`}
                    />
                  </button>
                </div>
                {marketingExpanded && (
                  <p className="mt-2 ml-7 text-[11px] leading-relaxed text-neutral-500 whitespace-pre-line">
                    {INLINE_BODIES["inline:marketing"]?.detail}
                  </p>
                )}
              </div>
            </div>
          </div>

          {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
          {info && <p className="text-xs text-emerald-600 mt-1">{info}</p>}

          <button
            type="submit"
            disabled={loading !== null || !email || !password || !hasConsent}
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
            onClick={() => onOAuth("kakao")}
            disabled={loading !== null || !hasConsent}
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
            disabled={loading !== null || !hasConsent}
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
            disabled={loading !== null || !hasConsent}
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
        {!hasConsent && (
          <p className="mt-2 text-[11px] text-neutral-400 text-center">
            소셜 가입도 약관 동의가 필요해요.
          </p>
        )}

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
