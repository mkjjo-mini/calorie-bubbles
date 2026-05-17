import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, X } from "lucide-react";
import { toast } from "sonner";
import { cloudRepository } from "@/lib/repository/cloud";
import { CloudAuthError } from "@/lib/repository/types";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/settings/notifications")({
  component: NotificationsPage,
});

/** 30분 단위 시간 슬롯 배열 생성 (00:00 ~ 23:30) */
function buildTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      slots.push(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      );
    }
  }
  return slots;
}

const TIME_SLOTS = buildTimeSlots();

function NotificationsPage() {
  const navigate = useNavigate();

  const [times, setTimes] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [selectedSlot, setSelectedSlot] = React.useState<string>(TIME_SLOTS[16] ?? "08:00"); // 기본값 08:00

  React.useEffect(() => {
    let alive = true;
    cloudRepository.userNotifications
      .get()
      .then((data) => {
        if (alive) setTimes(data.times ?? []);
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof CloudAuthError) {
          toast.error("로그인이 필요해요");
        } else {
          toast.error("알림 시간을 불러오지 못했어요");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  function addTime() {
    if (times.includes(selectedSlot)) {
      toast.error("이미 추가된 시간이에요");
      return;
    }
    setTimes((prev) => [...prev, selectedSlot].sort());
  }

  function removeTime(t: string) {
    setTimes((prev) => prev.filter((x) => x !== t));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await cloudRepository.userNotifications.put(times);
      toast.success("알림 시간이 저장되었어요");
      navigate({ to: "/settings" });
    } catch (e) {
      if (e instanceof CloudAuthError) {
        toast.error("로그인이 필요해요");
      } else {
        toast.error("저장에 실패했어요");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-white flex justify-center">
      <main className="w-full max-w-[390px] flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-neutral-100 bg-white/95 px-4 py-3 backdrop-blur">
          <button
            type="button"
            aria-label="뒤로"
            onClick={() => navigate({ to: "/settings" })}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 active:bg-neutral-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-semibold text-neutral-900">알림 설정</h1>
        </header>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-neutral-400">
            불러오는 중…
          </div>
        ) : (
          <div className="flex-1 px-4 pt-4 pb-12 space-y-4">
            <div className="rounded-2xl border border-neutral-100 bg-white p-4">
              <p className="text-sm font-semibold text-neutral-900 mb-3">
                매일 받을 시간
              </p>

              {times.length === 0 ? (
                <p className="text-sm text-neutral-400 text-center py-4">
                  알림 시간이 없어요. 아래에서 추가하세요
                </p>
              ) : (
                <ul className="space-y-2 mb-3">
                  {times.map((t) => (
                    <li
                      key={t}
                      className="flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2"
                    >
                      <span className="text-sm font-medium text-neutral-900 tabular-nums">
                        {t}
                      </span>
                      <button
                        type="button"
                        aria-label={`${t} 제거`}
                        onClick={() => removeTime(t)}
                        className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 active:bg-neutral-200 hover:text-neutral-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* + 시간 추가 */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedSlot}
                  onChange={(e) => setSelectedSlot(e.target.value)}
                  className="flex-1 h-10 px-3 rounded-xl border border-neutral-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-300"
                >
                  {TIME_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addTime}
                  className="h-10 px-4 rounded-xl border border-neutral-900 text-sm font-semibold text-neutral-900 active:bg-neutral-100 shrink-0"
                >
                  + 추가
                </button>
              </div>

              <p className="text-[11px] text-neutral-400 mt-2">
                추가한 시간마다 매일 알림을 받아요
              </p>
            </div>

            <Button
              onClick={handleSave}
              disabled={saving}
              className="h-12 w-full rounded-2xl bg-neutral-900 text-base font-semibold text-white hover:bg-neutral-800"
            >
              {saving ? "저장 중…" : "저장"}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
