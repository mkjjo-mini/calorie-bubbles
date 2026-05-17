import * as React from "react";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/settings")({
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
  // /settings 자식 라우트(/settings/profile 등)는 Outlet으로 위임
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/settings") return <Outlet />;
  return (
    <div className="w-full bg-white flex justify-center">
      <main className="w-full max-w-[375px] flex flex-col">
        <header className="border-b border-neutral-100 bg-white px-5 pt-6 pb-3">
          <h1 className="text-lg font-semibold text-neutral-900">Settings</h1>
        </header>

        <div className="px-5 pt-4 pb-4">
          <div className="rounded-2xl border border-neutral-100 bg-white overflow-hidden">
            {MENU_ITEMS.map((item, idx) => (
              <React.Fragment key={item.to}>
                {idx !== 0 && (
                  <div className="h-px bg-neutral-100 mx-4" />
                )}
                <Link
                  to={item.to}
                  className="flex w-full items-center justify-between px-4 py-4 text-left active:bg-neutral-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {item.subtitle}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0 ml-2" />
                </Link>
              </React.Fragment>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
