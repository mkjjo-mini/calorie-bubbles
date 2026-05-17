import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight } from "lucide-react";

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
    title: "알림 등록",
    subtitle: "매일 알림 받을 시간",
    to: "/settings/notifications",
  },
];

function SettingsMenuPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen w-full bg-[#FFFDF5] flex justify-center">
      <main className="w-full max-w-[390px] flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-neutral-100 bg-[#FFFDF5]/95 px-4 py-3 backdrop-blur">
          <button
            type="button"
            aria-label="뒤로"
            onClick={() => navigate({ to: "/" })}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 active:bg-neutral-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-semibold text-neutral-900">설정</h1>
        </header>

        <div className="flex-1 px-4 pt-4 pb-12">
          <div className="rounded-2xl border border-neutral-100 bg-white overflow-hidden">
            {MENU_ITEMS.map((item, idx) => (
              <React.Fragment key={item.to}>
                {idx !== 0 && (
                  <div className="h-px bg-neutral-100 mx-4" />
                )}
                <button
                  type="button"
                  onClick={() => navigate({ to: item.to as "/settings/profile" | "/settings/goal" | "/settings/notifications" })}
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
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
