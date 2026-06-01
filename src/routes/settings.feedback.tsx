import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/settings/feedback")({
  component: FeedbackPage,
});

type FeedbackType = "bug" | "feature";

const SEVERITY_LABELS: Record<number, string> = {
  1: "미관상 문제, 사용에는 지장 없음",
  2: "조금 불편하지만 사용은 가능함",
  3: "핵심 기능이 작동하지 않음",
  4: "앱을 아예 사용할 수 없음",
};

function FeedbackPage() {
  const navigate = useNavigate();
  const { session } = useSession();
  const [type, setType] = React.useState<FeedbackType>("bug");
  const [severity, setSeverity] = React.useState<number | null>(null);
  const [content, setContent] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    if (type === "bug" && severity === null) {
      toast.error("심각도를 선택해주세요");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          severity: type === "bug" ? severity : undefined,
          content: content.trim(),
        }),
      });
      if (!res.ok) throw new Error("제출 실패");
      toast.success("소중한 의견 감사해요!");
      navigate({ to: "/settings" });
    } catch {
      toast.error("제출에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-white flex justify-center">
      <main className="w-full max-w-[390px] flex flex-col">
        <header className="sticky top-[env(safe-area-inset-top)] z-10 flex items-center gap-2 border-b border-neutral-100 bg-white/95 px-4 py-3 backdrop-blur">
          <button
            type="button"
            aria-label="뒤로"
            onClick={() => navigate({ to: "/settings" })}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 active:bg-neutral-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-semibold text-neutral-900">피드백 보내기</h1>
        </header>

        <form onSubmit={handleSubmit} className="flex-1 px-4 pt-5 pb-12 space-y-5">
          {/* 발신자 */}
          {session?.email && (
            <div className="rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-3">
              <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">보내는 계정</p>
              <p className="mt-1 text-sm text-neutral-700">{session.email}</p>
            </div>
          )}

          {/* 유형 탭 */}
          <div>
            <p className="text-xs font-semibold text-neutral-700 mb-2">유형</p>
            <div className="flex overflow-hidden rounded-2xl border border-neutral-200">
              {(["bug", "feature"] as FeedbackType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setType(t); setSeverity(null); }}
                  className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                    type === t ? "bg-neutral-900 text-white" : "bg-white text-neutral-500"
                  }`}
                >
                  {t === "bug" ? "🐛 오류 · 버그" : "✨ 기능 요청"}
                </button>
              ))}
            </div>
          </div>

          {/* 심각도 (버그 시만) */}
          {type === "bug" && (
            <div>
              <p className="text-xs font-semibold text-neutral-700 mb-2">심각도</p>
              <div className="space-y-2">
                {([1, 2, 3, 4] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeverity(s)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                      severity === s
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-100 bg-white text-neutral-700"
                    }`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      severity === s ? "bg-white text-neutral-900" : "bg-neutral-100"
                    }`}>{s}</span>
                    <span className="text-sm">{SEVERITY_LABELS[s]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 내용 */}
          <div>
            <p className="text-xs font-semibold text-neutral-700 mb-2">
              {type === "bug" ? "어떤 문제가 있었나요?" : "어떤 기능이 있으면 좋겠나요?"}
            </p>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder={type === "bug"
                ? "어떤 화면에서, 무엇을 했을 때 문제가 생겼는지 알려주세요."
                : "원하는 기능이나 개선 아이디어를 자유롭게 적어주세요."}
              className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-neutral-900 resize-none"
              required
            />
          </div>

          <button
            type="submit"
            disabled={saving || !content.trim() || (type === "bug" && severity === null)}
            className="h-12 w-full rounded-2xl bg-neutral-900 text-base font-semibold text-white disabled:opacity-40 active:bg-neutral-800"
          >
            {saving ? "제출 중…" : "제출"}
          </button>
        </form>
      </main>
    </div>
  );
}
