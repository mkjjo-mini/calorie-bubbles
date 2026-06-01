import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Sparkles } from "lucide-react";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/settings/")({
  component: SettingsMenuPage,
});

interface MenuItem {
  title: string;
  subtitle: string;
  to: string;
}

const MENU_ITEMS: MenuItem[] = [
  {
    title: "프로필 관리",
    subtitle: "키·몸무게·신체정보·다이어트 목표",
    to: "/settings/profile",
  },
  {
    title: "목표 관리",
    subtitle: "칼로리·탄·단·지 · 적용일",
    to: "/settings/goal",
  },
  {
    title: "알림 설정",
    subtitle: "매일 알림 받을 시간",
    to: "/settings/notifications",
  },
];

function SettingsMenuPage() {
  const { session } = useSession();

  return (
    <div className="w-full bg-white flex justify-center">
      <main className="w-full max-w-[375px] flex flex-col">
        <header className="sticky top-[env(safe-area-inset-top)] z-20 border-b border-neutral-100 bg-white px-5 py-3">
          <h1 className="text-lg font-semibold text-neutral-900">Settings</h1>
        </header>

        {session?.email && (
          <div className="px-5 pt-4">
            <Link
              to="/settings/account"
              className="flex w-full items-center justify-between rounded-2xl border border-neutral-100 bg-white px-4 py-4 active:bg-neutral-50 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                  로그인 계정
                </p>
                <p className="mt-1 text-sm font-semibold text-neutral-900 truncate">
                  {session.email}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0 ml-2" />
            </Link>
          </div>
        )}

        <div className="px-5 pt-4 pb-4">
          <div className="rounded-2xl border border-neutral-100 bg-white overflow-hidden">
            {MENU_ITEMS.map((item, idx) => (
              <React.Fragment key={item.to}>
                {idx !== 0 && <div className="h-px bg-neutral-100 mx-4" />}
                <Link
                  to={item.to}
                  className="flex w-full items-center justify-between px-4 py-4 text-left active:bg-neutral-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{item.title}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{item.subtitle}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0 ml-2" />
                </Link>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* 실험실(AI 테스트) — 평소 숨김. 직원 테스트 필요 시 false→true 로 복구.
            라우트 /lab/ai-foods 는 유지되므로 URL 직접 접근은 계속 가능. */}
        {false && (
        <div className="px-5 pt-2 pb-2">
          <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2 px-1">
            실험실
          </p>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 overflow-hidden">
            <Link
              to="/lab/ai-foods"
              className="flex w-full items-center justify-between px-4 py-4 text-left active:bg-amber-100/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-600" />
                <div>
                  <p className="text-sm font-semibold text-neutral-900">
                    🧪 AI 음식 추가 테스트
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    사진·자연어·식당 검색 (Gemini) — DB 저장 X
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0 ml-2" />
            </Link>
          </div>
        </div>
        )}
      </main>
    </div>
  );
}
