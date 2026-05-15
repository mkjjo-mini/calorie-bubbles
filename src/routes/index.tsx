import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { BubbleField } from "@/components/BubbleField";
import { Wave } from "@/components/Wave";
import { EmptyStomach } from "@/components/EmptyStomach";
import {
  caloriesFor,
  DAILY_GOAL_KCAL,
  displayName,
  FOOD_PRESETS,
  MACRO_COLORS,
  MACRO_KCAL,
  MACRO_LABELS,
  type BubbleEntry,
  type Macro,
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

  useEffect(() => {
    setEntries(loadEntries());
    setHydrated(true);
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
  const compression = stage === 4 ? 0.7 : stage === 3 ? 0.78 : 1;

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

  function addPreset(presetId: string) {
    const p = FOOD_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    const now = Date.now();
    const additions: BubbleEntry[] = [];
    (["carbs", "protein", "fat"] as Macro[]).forEach((m, i) => {
      const grams = p[m];
      if (grams > 0) {
        additions.push({
          id: `${now}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          macro: m,
          grams,
          foodName: displayName(p.name),
          addedAt: now,
        });
      }
    });
    setEntries((prev) => [...prev, ...additions]);
  }

  function removeBubble(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function reset() {
    setEntries([]);
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


        {/* Input panel */}
        <section className="px-5 py-4">
          <h2 className="text-xs font-medium text-neutral-500 mb-2">음식 추가</h2>
          <div className="grid grid-cols-2 gap-2">
            {FOOD_PRESETS.map((p) => {
              const kcal = Math.round(caloriesFor(p));
              return (
                <button
                  key={p.id}
                  onClick={() => addPreset(p.id)}
                  className="flex flex-col items-start rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left transition active:scale-95 hover:border-neutral-300 hover:bg-neutral-50"
                >
                  <span className="text-sm font-medium text-neutral-900">{p.name}</span>
                  <span className="text-[11px] text-neutral-400">{kcal} kcal</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-neutral-400 text-center">
            버블을 탭하면 제거됩니다
          </p>
        </section>
      </main>
    </div>
  );
}
