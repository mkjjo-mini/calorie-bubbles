import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bell, BellOff, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { cloudRepository } from "@/lib/repository/cloud";
import { CloudAuthError } from "@/lib/repository/types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useEntitlements } from "@/hooks/useEntitlements";
import { PaywallModal } from "@/components/PaywallModal";
import { isNative } from "@/lib/native";
import {
  rescheduleNotifications,
  fireTestNotification,
  getPermissionStatus,
} from "@/lib/notifications";

export const Route = createFileRoute("/settings/notifications")({
  component: NotificationsPage,
});

const MAX_TIMES = 24;

function NotificationsPage() {
  const navigate = useNavigate();
  const { entitlements, isLoading: tierLoading } = useEntitlements();
  const [paywallOpen, setPaywallOpen] = React.useState(false);

  const [times, setTimes] = React.useState<string[]>([]);
  const [enabled, setEnabled] = React.useState(true);
  const [permDenied, setPermDenied] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [inputTime, setInputTime] = React.useState("08:00");

  const gated = !tierLoading && !entitlements.pushNotifications;

  React.useEffect(() => {
    let alive = true;
    cloudRepository.userNotifications
      .get()
      .then((data) => {
        if (!alive) return;
        setTimes(data.times ?? []);
        setEnabled(data.enabled ?? true);
      })
      .catch((e) => {
        if (!alive) return;
        if (!(e instanceof CloudAuthError)) toast.error("알림 시간을 불러오지 못했어요");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  // 권한 상태 확인 (네이티브만)
  React.useEffect(() => {
    if (!isNative()) return;
    getPermissionStatus().then((status) => {
      setPermDenied(status === "denied");
    });
  }, []);

  function addTime() {
    if (times.length >= MAX_TIMES) {
      toast.error(`최대 ${MAX_TIMES}개까지 추가할 수 있어요`);
      return;
    }
    if (times.includes(inputTime)) {
      toast.error("이미 추가된 시간이에요");
      return;
    }
    setTimes((prev) => [...prev, inputTime].sort());
  }

  function removeTime(t: string) {
    setTimes((prev) => prev.filter((x) => x !== t));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await cloudRepository.userNotifications.put(times, enabled);
      await rescheduleNotifications(enabled, times);
      toast.success("알림 시간이 저장되었어요");
      navigate({ to: "/settings" });
    } catch (e) {
      if (!(e instanceof CloudAuthError)) toast.error("저장에 실패했어요. 잠시 후 다시 시도해주세요");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      await fireTestNotification();
      toast.success("3초 후 알림이 와요");
    } catch {
      toast.error("알림 전송에 실패했어요");
    } finally {
      setTesting(false);
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

        {gated ? (
          <div className="flex-1 px-4 pt-6 pb-12 space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-center">
              <Sparkles className="mx-auto h-6 w-6 text-amber-500" />
              <p className="mt-2 text-sm font-semibold text-neutral-900">
                식사 알림으로 트래킹 습관 만들기
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-neutral-600">
                원하는 시간에 알림을 받아 트래킹을 자연스럽게 이어가요.
                <br />
                Pro에서 이용할 수 있어요.
              </p>
              <button
                type="button"
                onClick={() => setPaywallOpen(true)}
                className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-neutral-900 px-5 text-sm font-semibold text-white active:bg-neutral-800"
              >
                Pro 보기
              </button>
            </div>
          </div>
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-neutral-400">
            불러오는 중…
          </div>
        ) : (
          <div className="flex-1 px-4 pt-4 pb-12 space-y-4">

            {/* 권한 거부 배너 */}
            {permDenied && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
                <BellOff className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-[12px] text-red-700 leading-relaxed">
                  알림 권한이 꺼져 있어요. 설정 앱 → 탄단지버블 → 알림에서 허용해주세요.
                </p>
              </div>
            )}

            {/* 마스터 토글 */}
            <div className="rounded-2xl border border-neutral-100 bg-white px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-neutral-600" />
                <span className="text-sm font-semibold text-neutral-900">알림 받기</span>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                aria-label="알림 전체 켜기/끄기"
              />
            </div>

            {/* 시간 목록 + 추가 */}
            <div className={`rounded-2xl border border-neutral-100 bg-white p-4 transition-opacity ${!enabled ? "opacity-40 pointer-events-none" : ""}`}>
              <p className="text-sm font-semibold text-neutral-900 mb-3">
                매일 받을 시간
                {times.length > 0 && (
                  <span className="ml-1.5 text-xs font-normal text-neutral-400">
                    {times.length}/{MAX_TIMES}
                  </span>
                )}
              </p>

              {times.length === 0 ? (
                <p className="text-sm text-neutral-400 text-center py-4">
                  아래에서 시간을 추가해보세요
                </p>
              ) : (
                <ul className="space-y-2 mb-3">
                  {times.map((t) => (
                    <li
                      key={t}
                      className="flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2"
                    >
                      <span className="text-sm font-medium text-neutral-900 tabular-nums">{t}</span>
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

              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={inputTime}
                  onChange={(e) => setInputTime(e.target.value)}
                  className="flex-1 h-10 px-3 rounded-xl border border-neutral-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-300"
                />
                <button
                  type="button"
                  onClick={addTime}
                  disabled={times.length >= MAX_TIMES}
                  className="h-10 px-4 rounded-xl border border-neutral-900 text-sm font-semibold text-neutral-900 active:bg-neutral-100 shrink-0 disabled:opacity-40 disabled:pointer-events-none"
                >
                  + 추가
                </button>
              </div>

              <p className="text-[11px] text-neutral-400 mt-2">
                추가한 시간마다 매일 알림이 와요
              </p>
            </div>

            {/* 시험 알림 (네이티브만) */}
            {isNative() && (
              <div className="rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-4 space-y-3">
                <p className="text-xs text-neutral-500 leading-relaxed">
                  저장 전에 알림이 실제로 오는지 확인해보세요.
                  <br />
                  버튼을 누르면 3초 후 테스트 알림이 도착해요.
                </p>
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing || permDenied}
                  className="w-full h-11 rounded-xl bg-white border border-neutral-200 text-sm font-semibold text-neutral-800 active:bg-neutral-100 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <Bell className="h-4 w-4" />
                  {testing ? "전송 중…" : "지금 테스트해보기"}
                </button>
              </div>
            )}

            <Button
              onClick={handleSave}
              disabled={saving}
              className="h-12 w-full rounded-2xl bg-neutral-900 text-base font-semibold text-white hover:bg-neutral-800"
            >
              {saving ? "저장 중…" : "저장"}
            </Button>

            <p className="text-[11px] text-neutral-400 text-center whitespace-nowrap overflow-hidden text-ellipsis px-2">
              알림이 안 오면 설정 앱 → 알림 → 탄단지버블을 확인해보세요
            </p>
          </div>
        )}
      </main>

      <PaywallModal feature="notifications" open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
}
