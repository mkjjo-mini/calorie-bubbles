import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { toast } from "sonner";
import { BubbleField } from "@/components/BubbleField";
import { Wave } from "@/components/Wave";
import { EmptyStomach } from "@/components/EmptyStomach";
import { QuickAddTray } from "@/components/QuickAddTray";
import { Plus } from "lucide-react";
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
import { MealLogList } from "@/components/MealLogList";
import {
  DAILY_GOAL_KCAL,
  displayName,
  FOOD_PRESETS,
  inferMealSlot,
  MACRO_COLORS,
  MACRO_KCAL,
  MACRO_LABELS,
  type BubbleEntry,
  type Macro,
  type MealSlot,
} from "@/lib/foods";

export const Route = createFileRoute("/")({
  component: Index,
});

function todayKey() {
  const d = new Date();
  return `cal-tracker-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function loadEntries(): BubbleEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(todayKey());
    if (!raw) return [];
    return JSON.parse(raw) as BubbleEntry[];
  } catch {
    return [];
  }
}

function Index() {
  const [entries, setEntries] = useState<BubbleEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const loaded = loadEntries();
    let mutated = false;
    const backfilled = loaded.map((e) => {
      if (!e.meal_slot) {
        mutated = true;
        return { ...e, meal_slot: inferMealSlot(e.addedAt) };
      }
      return e;
    });
    setEntries(backfilled);
    setHydrated(true);
    if (mutated) {
      localStorage.setItem(todayKey(), JSON.stringify(backfilled));
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(todayKey(), JSON.stringify(entries));
  }, [entries, hydrated]);

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

  // Stage by progress: 1 (<50%), 2 (50-100%), 3 (100-120%), 4 (120%+)
  const stage = rawPct >= 120 ? 4 : rawPct >= 100 ? 3 : rawPct >= 50 ? 2 : 1;
  // Bubbles keep their visual size; compression only shrinks the collision
  // radius so they overlap and feel cramped once the goal is exceeded.
  const compression = stage === 4 ? 0.65 : stage === 3 ? 0.82 : 1;
  // 0..1: how full the bowl is (clamped at 1 so overflow squeezes vs grows).
  const fillness = Math.min(1, rawPct / 100);

  const bowlControls = useAnimationControls();
  const prevLenRef = useRef(0);
  useEffect(() => {
    if (entries.length > prevLenRef.current && stage === 4) {
      bowlControls.start({
        x: [0, -4, 4, -4, 4, 0],
        transition: { duration: 0.3 },
      });
    }
    prevLenRef.current = entries.length;
  }, [entries.length, stage, bowlControls]);

  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bowlRef = useRef<HTMLDivElement>(null);
  const [openResetDialog, setOpenResetDialog] = useState(false);

  function addPreset(presetId: string) {
    const p = FOOD_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    const now = Date.now();
    const foodLogId = `${now}-${Math.random().toString(36).slice(2, 9)}`;
    const additions: BubbleEntry[] = [];
    const slot = inferMealSlot(now);
    (["carbs", "protein", "fat"] as Macro[]).forEach((m, i) => {
      const grams = p[m];
      if (grams > 0) {
        additions.push({
          id: `${foodLogId}-${i}`,
          foodLogId,
          macro: m,
          grams,
          foodName: displayName(p.name),
          addedAt: now,
          meal_slot: slot,
        });
      }
    });
    setEntries((prev) => [...prev, ...additions]);
  }

  function changeSlot(foodLogId: string, slot: MealSlot) {
    setEntries((prev) =>
      prev.map((e) => (e.foodLogId === foodLogId ? { ...e, meal_slot: slot } : e)),
    );
  }

  const lastToastIdRef = useRef<string | number | null>(null);

  function removeByLogId(logId: string, label?: string) {
    const removed = entries.filter((e) => e.foodLogId === logId);
    if (removed.length === 0) return;
    setEntries((prev) => prev.filter((e) => e.foodLogId !== logId));

    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (lastToastIdRef.current != null) toast.dismiss(lastToastIdRef.current);

    const tid = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    lastToastIdRef.current = tid;
    const name = label ?? removed[0]?.foodName ?? "음식";

    toast(`${name} 삭제했어요`, {
      id: tid,
      duration: 5000,
      action: {
        label: "되돌리기",
        onClick: () => {
          setEntries((prev) => [...prev, ...removed]);
          if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
          lastToastIdRef.current = null;
        },
      },
    });

    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      lastToastIdRef.current = null;
    }, 5000);
  }

  function removeBubble(id: string) {
    const target = entries.find((e) => e.id === id);
    if (!target) return;
    removeByLogId(target.foodLogId);
  }

  function replaceQty(logId: string, newEntries: BubbleEntry[]) {
    setEntries((prev) => {
      const without = prev.filter((e) => e.foodLogId !== logId);
      return [...without, ...newEntries];
    });
  }

  function reset() {
    setOpenResetDialog(true);
  }

  function confirmReset() {
    setEntries([]);
    setOpenResetDialog(false);
    toast("오늘 기록을 지웠어요");
  }

  // Mobile-first: viewport width up to 375 for the bubble field
  const fieldWidth = 375;
  const fieldHeight = 380;

  return (
    <div className="min-h-screen w-full bg-white flex justify-center">
      <main className="w-full max-w-[375px] flex flex-col">
        {/* Header */}
        <header className="px-5 pt-6 pb-3">
          <div className="flex items-baseline justify-between">
            <h1 className="text-lg font-semibold text-neutral-900">오늘의 칼로리</h1>
            <button
              onClick={reset}
              className="text-xs text-neutral-400 hover:text-neutral-600"
            >
              초기화
            </button>
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

        {/* Bubble field — bowl/stomach container */}
        <section className="relative mx-auto px-5" style={{ width: fieldWidth }}>
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
                compression={compression}
                fillness={fillness}
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

          {/* Stage warning */}
          <AnimatePresence>
            {stage >= 3 && (
              <motion.p
                key={stage}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className={`mt-2 text-center text-xs font-medium ${
                  stage === 4 ? "text-red-500" : "text-amber-600"
                }`}
              >
                {stage === 4 ? "배 터질 것 같아요 😵" : "목표를 초과했어요"}
              </motion.p>
            )}
          </AnimatePresence>
        </section>

        {/* Quick add tray */}
        <QuickAddTray
          bubbleContainerRef={bowlRef}
          onAdd={(items) => {
            const stamped = items.map((it) =>
              it.meal_slot ? it : { ...it, meal_slot: inferMealSlot(it.addedAt) },
            );
            setEntries((prev) => [...prev, ...stamped]);
          }}
        />

        <MealLogList
          entries={entries}
          onChangeSlot={changeSlot}
          onDelete={(logId) => removeByLogId(logId)}
          onReplaceQty={replaceQty}
        />

        <p className="px-5 pt-2 pb-6 text-[11px] text-neutral-400 text-center">
          버블을 탭하면 제거됩니다
        </p>

        <AlertDialog open={openResetDialog} onOpenChange={setOpenResetDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>오늘 기록을 모두 지울까요?</AlertDialogTitle>
              <AlertDialogDescription className="text-[13px] text-neutral-500">
                지운 기록은 되돌릴 수 없어요.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setOpenResetDialog(false)}>
                취소
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmReset}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                지우기
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>

      {/* FAB */}
      <button
        onClick={() => navigate({ to: "/add" })}
        aria-label="음식 추가"
        className="fixed z-40 flex items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg active:scale-95 transition hover:bg-neutral-800"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 88px)", right: 20, width: 44, height: 44 }}
      >
        <Plus className="w-5 h-5" />
      </button>
    </div>
  );
}
