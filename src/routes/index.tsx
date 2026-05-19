import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { toast } from "sonner";
import { BubbleField } from "@/components/BubbleField";
import { Wave } from "@/components/Wave";
import { EmptyStomach } from "@/components/EmptyStomach";
import { QuickAddTray } from "@/components/QuickAddTray";
import { AiAddSheet } from "@/components/AiAddSheet";
import { Plus, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { MealLogList } from "@/components/MealLogList";
import {
  DAILY_GOAL_KCAL,
  displayName,
  MACRO_COLORS,
  MACRO_KCAL,
  MACRO_LABELS,
  type BubbleEntry,
  type Macro,
  type MealSlot,
} from "@/lib/foods";
import { cloudRepository } from "@/lib/repository/cloud";
import { CloudAuthError, type FoodLogRow } from "@/lib/repository/types";
import { todayKST } from "@/lib/time";

const homeSearchSchema = z.object({
  date: fallback(z.string(), todayKST()).default(todayKST()),
});

export const Route = createFileRoute("/")({
  validateSearch: zodValidator(homeSearchSchema),
  component: Index,
});

/** Parse YYYY-MM-DD as a local-date (no timezone shift). */
function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

/** YYYY-MM-DD from a Date in local time (used after Calendar select). */
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
function formatPastDate(ymd: string): string {
  const d = parseYmd(ymd);
  return `${d.getMonth() + 1}/${d.getDate()} ${WEEKDAY_KO[d.getDay()]}`;
}

function addDays(ymd: string, delta: number): string {
  const d = parseYmd(ymd);
  d.setDate(d.getDate() + delta);
  return toYmd(d);
}

/**
 * Convert cloud FoodLogRow[] → BubbleEntry[] for the existing bubble/UI system.
 * Each FoodLogRow maps to up to 3 BubbleEntries (one per macro with grams > 0).
 * Uses the log's id as foodLogId so delete by foodLogId still works.
 */
function logsToBubbles(logs: FoodLogRow[]): BubbleEntry[] {
  const entries: BubbleEntry[] = [];
  for (const log of logs) {
    const foodName = displayName(log.food?.name ?? "");
    const addedAt = new Date(log.created_at).getTime();
    const slot = log.meal_slot;

    const macros: [Macro, number][] = [
      ["carbs", log.carb_g],
      ["protein", log.protein_g],
      ["fat", log.fat_g],
    ];
    macros.forEach(([macro, grams], i) => {
      if (grams > 0) {
        entries.push({
          id: `${log.id}-${i}`,
          foodLogId: log.id,
          macro,
          grams: Math.round(grams * 10) / 10,
          foodName,
          addedAt,
          meal_slot: slot,
          food_id: log.food_id,
        });
      }
    });
  }
  return entries;
}

function Index() {
  // Cloud food logs for the selected date (defaults to today via search param)
  const [logs, setLogs] = useState<FoodLogRow[]>([]);
  const [aiSheetOpen, setAiSheetOpen] = useState(false);
  /** bowl 좌우 스와이프 추적 (날짜 이동) */
  const swipeStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  /** 다른 모달 열려있을 때는 shake 무시 — 콜백에서 최신값 참조용 */
  const shakeBlockedRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const navigate = useNavigate();
  const { date: selectedDate } = Route.useSearch();
  const today = todayKST();
  const isToday = selectedDate === today;
  
  const [calendarOpen, setCalendarOpen] = useState(false);

  function setSelectedDate(next: string) {
    void navigate({ to: "/", search: { date: next } });
  }

  useEffect(() => {
    setHydrated(false);
    void loadLogsForDate(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  async function loadLogsForDate(date: string) {
    try {
      const fetched = await cloudRepository.foodLogs.listByDate(date);
      setLogs(fetched);
    } catch (e) {
      if (e instanceof CloudAuthError) {
        toast.error("로그인이 필요해요");
      } else {
        toast.error(`기록 로드 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      setHydrated(true);
    }
  }

  // Convert cloud logs to BubbleEntry[] for all existing UI components
  const entries = useMemo(() => logsToBubbles(logs), [logs]);

  const totals = useMemo(() => {
    const t = { carbs: 0, protein: 0, fat: 0 };
    for (const e of entries) t[e.macro] += e.grams;
    return t;
  }, [entries]);

  const totalKcal = Math.round(
    totals.carbs * MACRO_KCAL.carbs +
      totals.protein * MACRO_KCAL.protein +
      totals.fat * MACRO_KCAL.fat,
  );
  const rawPct = (totalKcal / DAILY_GOAL_KCAL) * 100;
  const pct = Math.min(100, rawPct);

  const stage = rawPct >= 120 ? 4 : rawPct >= 100 ? 3 : rawPct >= 50 ? 2 : 1;
  const compression = stage === 4 ? 0.7 : stage === 3 ? 0.85 : 1;

  const bowlControls = useAnimationControls();
  const prevLenRef = useRef(0);
  useEffect(() => {
    const added = entries.length > prevLenRef.current;
    if (added && stage === 4) {
      bowlControls.start({
        x: [0, -4, 4, -4, 4, 0],
        transition: { duration: 0.3 },
      });
    }
    // 목표 초과 후 음식 추가될 때마다 햅틱 — stage 3(100~120%)=짧게, stage 4(≥120%)=강하게.
    // ⚠️ Android Chrome/PWA만 동작. iOS Safari는 navigator.vibrate 미지원.
    //    Capacitor 도입 후 @capacitor/haptics로 교체 예정 (launch-roadmap Week 1).
    if (added && stage >= 3 && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(stage === 4 ? [40, 30, 60] : 40);
    }
    prevLenRef.current = entries.length;
  }, [entries.length, stage, bowlControls]);

  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Maps logId → pending cloud DELETE so we can cancel on undo
  const pendingDeleteRef = useRef<Map<string, { log: FoodLogRow; timerId: ReturnType<typeof setTimeout> }>>(new Map());
  const bowlRef = useRef<HTMLDivElement>(null);
  const [openResetDialog, setOpenResetDialog] = useState(false);

  // Flush all pending deletes on unmount
  useEffect(() => {
    return () => {
      for (const [logId, { timerId }] of pendingDeleteRef.current) {
        clearTimeout(timerId);
        // Fire-and-forget cloud DELETE on unmount
        void cloudRepository.foodLogs.remove(logId);
      }
      pendingDeleteRef.current.clear();
    };
  }, []);

  // 흔들기로 비우기 — DeviceMotion API. iOS 13+ 권한 필요, 첫 사용자 탭 시 1회 요청
  // 한 번 흔들면 비우기 dialog 열림 (확인 한 번 더 받음). 빈 상태일 때는 무시.
  useEffect(() => {
    shakeBlockedRef.current =
      openResetDialog || aiSheetOpen || calendarOpen || logs.length === 0;
  });
  useEffect(() => {
    const SHAKE_THRESHOLD = 18; // m/s² — 우연한 움직임 차단
    const COOLDOWN_MS = 2000;
    let lastShake = 0;
    let attached = false;

    function onMotion(e: DeviceMotionEvent) {
      if (shakeBlockedRef.current) return;
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
      if (mag < SHAKE_THRESHOLD) return;
      const now = Date.now();
      if (now - lastShake < COOLDOWN_MS) return;
      lastShake = now;
      setOpenResetDialog(true);
    }

    function attach() {
      if (attached) return;
      attached = true;
      window.addEventListener("devicemotion", onMotion);
    }

    // iOS 13+ Safari: DeviceMotionEvent.requestPermission() 필요. 반드시 user gesture 안에서 호출.
    const dme = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (typeof dme?.requestPermission === "function") {
      const onFirstTouch = async () => {
        document.removeEventListener("click", onFirstTouch);
        document.removeEventListener("touchend", onFirstTouch);
        try {
          const status = await dme.requestPermission!();
          if (status === "granted") attach();
        } catch {
          /* 사용자 거절·dev 환경 — silent */
        }
      };
      document.addEventListener("click", onFirstTouch, { once: true });
      document.addEventListener("touchend", onFirstTouch, { once: true });
      return () => {
        document.removeEventListener("click", onFirstTouch);
        document.removeEventListener("touchend", onFirstTouch);
        if (attached) window.removeEventListener("devicemotion", onMotion);
      };
    }
    // Android·기타: 권한 없이 바로 청취
    attach();
    return () => {
      if (attached) window.removeEventListener("devicemotion", onMotion);
    };
  }, []);

  function changeSlot(foodLogId: string, slot: MealSlot) {
    setLogs((prev) =>
      prev.map((log) =>
        log.id === foodLogId ? { ...log, meal_slot: slot } : log,
      ),
    );
  }

  const lastToastIdRef = useRef<string | number | null>(null);

  function removeByLogId(logId: string, label?: string) {
    // Find in current logs OR in pending-delete map (edge case: double-delete)
    const target = logs.find((l) => l.id === logId) ?? pendingDeleteRef.current.get(logId)?.log;
    if (!target) return;

    // Cancel any existing pending delete for this id (restart timer)
    const existing = pendingDeleteRef.current.get(logId);
    if (existing) {
      clearTimeout(existing.timerId);
      pendingDeleteRef.current.delete(logId);
    }

    // Dismiss previous undo toast
    if (lastToastIdRef.current != null) toast.dismiss(lastToastIdRef.current);

    // Optimistic remove from UI
    setLogs((prev) => prev.filter((l) => l.id !== logId));

    const tid = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    lastToastIdRef.current = tid;
    const name = label ?? target.food?.name ?? "음식";

    // Schedule deferred cloud DELETE after 5 s
    const timerId = setTimeout(() => {
      pendingDeleteRef.current.delete(logId);
      lastToastIdRef.current = null;
      void cloudRepository.foodLogs.remove(logId).catch((e) => {
        // Revert on failure — add back to logs
        setLogs((prev) => [...prev, target]);
        if (e instanceof CloudAuthError) {
          toast.error("로그인이 필요해요");
        } else {
          toast.error("삭제 실패");
        }
      });
    }, 5000);

    pendingDeleteRef.current.set(logId, { log: target, timerId });

    toast(`${displayName(name)}을 지웠어요`, {
      id: tid,
      // 되돌리기 토스트는 하단(엄지 닿기 좋은 위치) + 5초로 명시
      position: "bottom-center",
      duration: 5000,
      action: {
        label: "되살리기",
        onClick: () => {
          const pending = pendingDeleteRef.current.get(logId);
          if (pending) {
            clearTimeout(pending.timerId);
            pendingDeleteRef.current.delete(logId);
          }
          // Restore to UI at original position (append — will re-sort by addedAt)
          setLogs((prev) => {
            if (prev.some((l) => l.id === logId)) return prev; // already there
            return [...prev, target];
          });
          lastToastIdRef.current = null;
        },
      },
    });

    // Keep undoTimerRef for compatibility (unused logic removed)
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
    }, 5000);
  }

  function removeBubble(id: string) {
    // id format: "{logId}-{macroIndex}"
    const logId = id.split("-").slice(0, -1).join("-");
    void removeByLogId(logId);
  }

  function replaceQty(logId: string, newEntries: BubbleEntry[]) {
    // Compute aggregated macros from newEntries
    const carb = newEntries.filter((e) => e.macro === "carbs").reduce((s, e) => s + e.grams, 0);
    const protein = newEntries.filter((e) => e.macro === "protein").reduce((s, e) => s + e.grams, 0);
    const fat = newEntries.filter((e) => e.macro === "fat").reduce((s, e) => s + e.grams, 0);
    const kcal = Math.round(carb * 4 + protein * 4 + fat * 9);
    const grams = Math.round(carb + protein + fat);

    setLogs((prev) =>
      prev.map((log) =>
        log.id === logId
          ? { ...log, carb_g: carb, protein_g: protein, fat_g: fat, kcal, grams }
          : log,
      ),
    );
  }

  function reset() {
    setOpenResetDialog(true);
  }

  async function confirmReset() {
    const toDelete = [...logs];
    setLogs([]);
    setOpenResetDialog(false);

    try {
      await Promise.all(toDelete.map((l) => cloudRepository.foodLogs.remove(l.id)));
      toast(isToday ? "오늘 기록을 지웠어요" : `${formatPastDate(selectedDate)} 기록을 지웠어요`);
    } catch (e) {
      // Revert
      setLogs(toDelete);
      if (e instanceof CloudAuthError) {
        toast.error("로그인이 필요해요");
      } else {
        toast.error("비우기 실패");
      }
    }
  }

  const fieldWidth = 375;
  const fieldHeight = 380;

  return (
    <div className="min-h-screen w-full bg-white flex justify-center">
      <main className="w-full max-w-[375px] flex flex-col">
        {/* Header */}
        <header className="px-5 pt-6 pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <button
                type="button"
                onClick={() => setSelectedDate(addDays(selectedDate, -1))}
                aria-label="이전 날짜"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="rounded-md px-1 text-lg font-semibold text-neutral-900 hover:bg-neutral-100 tabular-nums"
                  >
                    {isToday ? "오늘의 칼로리" : formatPastDate(selectedDate)}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={parseYmd(selectedDate)}
                    onSelect={(d) => {
                      if (d) {
                        setSelectedDate(toYmd(d));
                        setCalendarOpen(false);
                      }
                    }}
                    disabled={(d) => toYmd(d) > today}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <button
                type="button"
                onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                aria-label="다음 날짜"
                disabled={isToday}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              {!isToday && (
                <button
                  onClick={() => setSelectedDate(today)}
                  className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
                >
                  오늘
                </button>
              )}
              <button
                onClick={reset}
                className="text-xs text-neutral-400 hover:text-neutral-600"
              >
                비우기
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-3xl font-bold tabular-nums text-neutral-900">
              {totalKcal}
            </span>
            <span className="text-sm text-neutral-400">/ {DAILY_GOAL_KCAL} kcal</span>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: `linear-gradient(90deg, ${MACRO_COLORS.carbs}, ${MACRO_COLORS.protein}, ${MACRO_COLORS.fat})`,
              }}
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>

          <div className="mt-3 flex justify-between text-[11px] text-neutral-500">
            {(["carbs", "protein", "fat"] as Macro[]).map((m) => (
              <div key={m} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: MACRO_COLORS[m] }}
                />
                <span>
                  {MACRO_LABELS[m]} {Math.round(totals[m])}g
                </span>
              </div>
            ))}
          </div>
        </header>

        {/* Bubble field — bowl/stomach container.
            좌우 스와이프(60px 임계값, |dy|<40) → 전일/다음일 이동. 짧은 탭은 영향 X. */}
        <section
          className="relative mx-auto px-5 touch-pan-y"
          style={{ width: fieldWidth }}
          onPointerDown={(e) => {
            swipeStartRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
          }}
          onPointerUp={(e) => {
            const s = swipeStartRef.current;
            swipeStartRef.current = null;
            if (!s) return;
            const dx = e.clientX - s.x;
            const dy = e.clientY - s.y;
            const dt = Date.now() - s.t;
            // 빠르고(700ms 이내) 가로 우세한(|dx|>60, |dy|<40) 움직임만 스와이프로 인정
            if (dt > 700) return;
            if (Math.abs(dx) < 60 || Math.abs(dy) > 40) return;
            if (dx > 0) setSelectedDate(addDays(selectedDate, -1));
            else setSelectedDate(addDays(selectedDate, 1));
          }}
          onPointerCancel={() => {
            swipeStartRef.current = null;
          }}
        >
          <motion.div
            ref={bowlRef}
            animate={bowlControls}
            className={`relative overflow-hidden shadow-inner ${
              stage === 3 ? "animate-pulse" : ""
            }`}
            style={{
              width: fieldWidth - 40,
              height: fieldHeight,
              borderRadius: "44% 44% 38% 38% / 18% 18% 50% 50%",
              background:
                "radial-gradient(120% 80% at 50% 10%, #f8fafc 0%, #eef2f6 60%, #e5eaf0 100%)",
              border: `${stage >= 2 ? 2 : 1}px solid ${
                stage >= 3
                  ? "rgba(255,107,107,0.85)"
                  : stage === 2
                    ? "rgba(255,193,7,0.85)"
                    : "rgba(229,231,235,0.7)"
              }`,
              boxShadow:
                stage >= 3
                  ? "0 0 24px rgba(255,107,107,0.45), inset 0 4px 12px rgba(0,0,0,0.04)"
                  : stage === 2
                    ? "0 0 22px rgba(255,193,7,0.45), inset 0 4px 12px rgba(0,0,0,0.04)"
                    : "inset 0 4px 12px rgba(0,0,0,0.04)",
              transition: "border-color 0.4s, box-shadow 0.4s",
            }}
          >
            <AnimatePresence>
              <BubbleField
                bubbles={entries}
                width={fieldWidth - 40}
                height={fieldHeight}
                onRemove={removeBubble}
                goalKcal={DAILY_GOAL_KCAL}
                compression={compression}
              />
            </AnimatePresence>

            {/* Wave at bottom of bowl */}
            <Wave width={fieldWidth - 40} height={48} />

            {/* Empty state */}
            {entries.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <EmptyStomach />
              </div>
            )}
          </motion.div>

          {/* Stage warning — 평소엔 안내 문구, stage>=3엔 경고로 대체 */}
          <AnimatePresence mode="wait">
            <motion.p
              key={stage >= 3 ? `warn-${stage}` : "hint"}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className={`mt-2 text-center text-xs font-medium ${
                stage === 4
                  ? "text-red-500"
                  : stage === 3
                    ? "text-amber-600"
                    : "text-neutral-400"
              }`}
            >
              {stage === 4
                ? "배 터질 것 같아요 😵"
                : stage === 3
                  ? "목표를 초과했어요"
                  : "버블을 탭하면 제거됩니다"}
            </motion.p>
          </AnimatePresence>
        </section>

        {/* Quick add tray */}
        <QuickAddTray
          bubbleContainerRef={bowlRef}
          loggedDate={selectedDate}
          onAdded={(log) => {
            setLogs((prev) => [...prev, log]);
          }}
        />

        {hydrated && (
          <MealLogList
            entries={entries}
            onChangeSlot={changeSlot}
            onDelete={(logId, foodName) => removeByLogId(logId, foodName)}
            onReplaceQty={replaceQty}
          />
        )}

        <AlertDialog open={openResetDialog} onOpenChange={setOpenResetDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{isToday ? "오늘 기록을 모두 지울까요?" : `${formatPastDate(selectedDate)} 기록을 모두 지울까요?`}</AlertDialogTitle>
              <AlertDialogDescription className="text-[13px] text-neutral-500">
                지운 기록은 되돌릴 수 없어요.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="!flex-row !justify-between !space-x-2">
              <AlertDialogAction
                onClick={() => void confirmReset()}
                className="flex-1 bg-white text-red-600 border border-neutral-200 hover:bg-red-50"
              >
                지우기
              </AlertDialogAction>
              <AlertDialogCancel
                onClick={() => setOpenResetDialog(false)}
                className="flex-1 mt-0 bg-neutral-900 text-white hover:bg-neutral-800 border-0"
              >
                취소
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>

      {/* FAB — AI 시트 트리거. Material Design FAB 표준 (56pt button + 24pt icon) */}
      <button
        onClick={() => setAiSheetOpen(true)}
        aria-label="AI로 음식 추가"
        className="fixed z-40 flex items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg active:scale-95 transition hover:bg-neutral-800"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 88px)", right: 20, width: 56, height: 56 }}
      >
        <Sparkles className="w-6 h-6" />
      </button>

      <AiAddSheet
        open={aiSheetOpen}
        onOpenChange={setAiSheetOpen}
        loggedDate={selectedDate}
        onRegistered={() => {
          // logs 재조회 (Optimistic insert 대신 — AI 결과/사진 등 신뢰성 위해 서버 단일 진실)
          void (async () => {
            try {
              const fetched = await cloudRepository.foodLogs.listByDate(selectedDate);
              setLogs(fetched);
            } catch {
              /* 다음 탐색에서 자동 복구 */
            }
          })();
        }}
      />
    </div>
  );
}

