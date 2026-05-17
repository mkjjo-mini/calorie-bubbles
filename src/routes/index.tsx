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
  inferMealSlot,
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

export const Route = createFileRoute("/")({
  component: Index,
});

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
        });
      }
    });
  }
  return entries;
}

function Index() {
  // Cloud food logs for today
  const [logs, setLogs] = useState<FoodLogRow[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    void loadTodayLogs();
  }, []);

  async function loadTodayLogs() {
    try {
      const today = todayKST();
      const fetched = await cloudRepository.foodLogs.listByDate(today);
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

  function changeSlot(foodLogId: string, slot: MealSlot) {
    setLogs((prev) =>
      prev.map((log) =>
        log.id === foodLogId ? { ...log, meal_slot: slot } : log,
      ),
    );
  }

  const lastToastIdRef = useRef<string | number | null>(null);

  async function removeByLogId(logId: string, label?: string) {
    const target = logs.find((l) => l.id === logId);
    if (!target) return;

    // Optimistic remove
    setLogs((prev) => prev.filter((l) => l.id !== logId));

    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (lastToastIdRef.current != null) toast.dismiss(lastToastIdRef.current);

    const tid = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    lastToastIdRef.current = tid;
    const name = label ?? target.food?.name ?? "음식";

    try {
      await cloudRepository.foodLogs.remove(logId);
    } catch (e) {
      // Revert on failure
      setLogs((prev) => [...prev, target]);
      if (e instanceof CloudAuthError) {
        toast.error("로그인이 필요해요");
      } else {
        toast.error("삭제 실패");
      }
      return;
    }

    toast(`${displayName(name)} 삭제했어요`, {
      id: tid,
      duration: 5000,
      action: {
        label: "되돌리기",
        onClick: async () => {
          try {
            // Re-create the log
            const restored = await cloudRepository.foodLogs.create({
              food_id: target.food_id,
              logged_date: target.logged_date,
              meal_slot: target.meal_slot,
              grams: target.grams,
              kcal: target.kcal,
              carb_g: target.carb_g,
              protein_g: target.protein_g,
              fat_g: target.fat_g,
            });
            setLogs((prev) => [
              ...prev,
              { ...restored, food: target.food },
            ]);
            if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
            lastToastIdRef.current = null;
          } catch {
            toast.error("되돌리기 실패");
          }
        },
      },
    });

    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      lastToastIdRef.current = null;
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
      toast("오늘 기록을 지웠어요");
    } catch (e) {
      // Revert
      setLogs(toDelete);
      if (e instanceof CloudAuthError) {
        toast.error("로그인이 필요해요");
      } else {
        toast.error("초기화 실패");
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
            // QuickAddTray delivers BubbleEntry[] — convert to synthetic FoodLogRow
            // grouped by foodLogId for display; cloud sync happens in add.tsx
            const byLogId = new Map<string, BubbleEntry[]>();
            for (const it of items) {
              const arr = byLogId.get(it.foodLogId) ?? [];
              arr.push(it);
              byLogId.set(it.foodLogId, arr);
            }
            const syntheticLogs: FoodLogRow[] = [];
            const now = Date.now();
            byLogId.forEach((group, logId) => {
              const carb = group.filter((e) => e.macro === "carbs").reduce((s, e) => s + e.grams, 0);
              const protein = group.filter((e) => e.macro === "protein").reduce((s, e) => s + e.grams, 0);
              const fat = group.filter((e) => e.macro === "fat").reduce((s, e) => s + e.grams, 0);
              const kcal = Math.round(carb * 4 + protein * 4 + fat * 9);
              syntheticLogs.push({
                id: logId,
                food_id: "",
                logged_date: todayKST(),
                meal_slot: group[0]?.meal_slot ?? inferMealSlot(now),
                grams: Math.round(carb + protein + fat),
                kcal,
                carb_g: carb,
                protein_g: protein,
                fat_g: fat,
                created_at: new Date(group[0]?.addedAt ?? now).toISOString(),
                food: { name: group[0]?.foodName ?? "", food_code: null, source: "preset", is_estimated: false },
              });
            });
            setLogs((prev) => [...prev, ...syntheticLogs]);
          }}
        />

        {hydrated && (
          <MealLogList
            entries={entries}
            onChangeSlot={changeSlot}
            onDelete={(logId) => void removeByLogId(logId)}
            onReplaceQty={replaceQty}
          />
        )}

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
                onClick={() => void confirmReset()}
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

