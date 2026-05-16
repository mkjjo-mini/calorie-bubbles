import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="min-h-screen w-full bg-white flex justify-center">
      <main className="w-full max-w-[375px] flex flex-col items-center justify-center px-6 pt-24 pb-32 text-center">
        <div className="text-5xl">⚙️</div>
        <h1 className="mt-4 text-lg font-semibold text-neutral-900">설정</h1>
        <p className="mt-2 text-sm text-neutral-500">
          목표 칼로리와 알림을 설정할 수 있어요
        </p>
        <p className="mt-1 text-xs text-neutral-400">곧 만나요</p>
      </main>
    </div>
  );
}
