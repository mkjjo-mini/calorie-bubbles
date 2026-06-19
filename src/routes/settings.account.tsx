import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, KeyRound, LogOut, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/settings/account")({
  component: AccountPage,
});

function AccountPage() {
  const { session, signOut } = useSession();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  // 이메일 가입자만 비밀번호 변경 노출 (소셜 로그인은 비밀번호 없음)
  const isEmailUser = session?.raw.user.app_metadata?.provider === "email";

  async function handleLogout() {
    if (loggingOut) return;
    if (!confirm("로그아웃 할까요?")) return;
    setLoggingOut(true);
    try {
      await signOut();
      navigate({ to: "/auth/login", replace: true });
    } finally {
      setLoggingOut(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleting) return;
    const first = confirm(
      "정말 회원 탈퇴 할까요?\n\n모든 기록·즐겨찾기·구독 정보가 즉시 삭제되며 되돌릴 수 없어요.",
    );
    if (!first) return;
    const second = prompt('확인을 위해 "탈퇴"를 입력해주세요');
    if (second?.trim() !== "탈퇴") {
      toast.error("입력이 정확하지 않아 탈퇴가 취소됐어요");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.text().catch(() => "");
        throw new Error(body || `HTTP ${res.status}`);
      }
      await signOut().catch(() => {});
      toast.success("회원 탈퇴가 완료됐어요");
      navigate({ to: "/auth/login", replace: true });
    } catch (e) {
      toast.error(
        `탈퇴 처리 실패: ${e instanceof Error ? e.message : String(e)}. 잠시 후 다시 시도하거나 문의해주세요`,
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="w-full bg-white flex justify-center">
      <main className="w-full max-w-[375px] flex flex-col min-h-screen">
        <header className="border-b border-neutral-100 bg-white px-5 pt-6 pb-3 flex items-center gap-2">
          <Link
            to="/settings"
            className="-ml-2 p-2 rounded-full active:bg-neutral-100 transition-colors"
            aria-label="뒤로"
          >
            <ArrowLeft className="h-5 w-5 text-neutral-700" />
          </Link>
          <h1 className="text-lg font-semibold text-neutral-900">계정</h1>
        </header>

        {/* 계정 정보 카드 */}
        <div className="px-5 pt-4 pb-2">
          <div className="rounded-2xl border border-neutral-100 bg-white px-4 py-4">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
              로그인 계정
            </p>
            <p className="mt-1 text-sm font-semibold text-neutral-900 break-all">
              {session?.email ?? "—"}
            </p>
          </div>
        </div>

        {/* 비밀번호 변경 — 이메일 가입자만 (인앱 완결, 웹·메일 불필요) */}
        {isEmailUser && (
          <div className="px-5 pt-2 pb-0">
            <div className="rounded-2xl border border-neutral-100 bg-white overflow-hidden">
              <Link
                to="/settings/password"
                className="flex w-full items-center justify-between px-4 py-4 text-left active:bg-neutral-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-neutral-500" />
                  <span className="text-sm font-semibold text-neutral-900">비밀번호 변경</span>
                </div>
                <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" />
              </Link>
            </div>
          </div>
        )}

        {/* 로그아웃 + 회원 탈퇴 — 같은 레벨, 같은 톤 */}
        <div className="px-5 pt-2 pb-4">
          <div className="rounded-2xl border border-neutral-100 bg-white overflow-hidden">
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex w-full items-center justify-between px-4 py-4 text-left active:bg-neutral-50 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <LogOut className="h-4 w-4 text-neutral-500" />
                <span className="text-sm font-semibold text-neutral-900">
                  로그아웃
                </span>
              </div>
            </button>
            <div className="h-px bg-neutral-100 mx-4" />
            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="flex w-full items-center justify-between px-4 py-4 text-left active:bg-neutral-50 transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <UserMinus className="h-4 w-4 text-neutral-500" />
                <span className="text-sm font-semibold text-neutral-900">
                  회원 탈퇴
                </span>
              </div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
