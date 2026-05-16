import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

function HistoryPage() {
  return (
    <div className="min-h-screen w-full bg-white flex justify-center">
      <main className="w-full max-w-[375px] flex flex-col items-center justify-center px-6 pt-24 pb-32 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-700">
          <CalendarDays className="h-7 w-7" strokeWidth={2} />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-neutral-900">기록</h1>
        <p className="mt-2 text-sm text-neutral-500">
          지난 식사 기록을 모아 볼 수 있어요
        </p>
        <p className="mt-1 text-xs text-neutral-400">곧 만나요</p>
      </main>
    </div>
  );
}
