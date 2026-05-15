import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  MACRO_COLORS,
  MACRO_KCAL,
  MEAL_SLOT_META,
  MEAL_SLOT_ORDER,
  type BubbleEntry,
  type Macro,
  type MealSlot,
} from "@/lib/foods";

interface Props {
  entries: BubbleEntry[];
  onChangeSlot: (foodLogId: string, slot: MealSlot) => void;
}

interface LogItem {
  foodLogId: string;
  foodName: string;
  carbs: number;
  protein: number;
  fat: number;
  kcal: number;
  addedAt: number;
  slot: MealSlot;
}

function dominantMacro(item: LogItem): Macro {
  const arr: [Macro, number][] = [
    ["carbs", item.carbs],
    ["protein", item.protein],
    ["fat", item.fat],
  ];
  arr.sort((a, b) => b[1] - a[1]);
  return arr[0][0];
}

export function MealLogList({ entries, onChangeSlot }: Props) {
  const [sheetFor, setSheetFor] = useState<LogItem | null>(null);

  const grouped = useMemo(() => {
    const byLog = new Map<string, LogItem>();
    for (const e of entries) {
      const slot: MealSlot = e.meal_slot ?? "snack";
      const cur = byLog.get(e.foodLogId);
      if (!cur) {
        byLog.set(e.foodLogId, {
          foodLogId: e.foodLogId,
          foodName: e.foodName,
          carbs: e.macro === "carbs" ? e.grams : 0,
          protein: e.macro === "protein" ? e.grams : 0,
          fat: e.macro === "fat" ? e.grams : 0,
          kcal: 0,
          addedAt: e.addedAt,
          slot,
        });
      } else {
        if (e.macro === "carbs") cur.carbs += e.grams;
        if (e.macro === "protein") cur.protein += e.grams;
        if (e.macro === "fat") cur.fat += e.grams;
        cur.addedAt = Math.max(cur.addedAt, e.addedAt);
      }
    }
    const items = Array.from(byLog.values()).map((it) => ({
      ...it,
      kcal: Math.round(
        it.carbs * MACRO_KCAL.carbs + it.protein * MACRO_KCAL.protein + it.fat * MACRO_KCAL.fat,
      ),
    }));

    const groups: Record<MealSlot, LogItem[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    };
    for (const it of items) groups[it.slot].push(it);
    for (const slot of MEAL_SLOT_ORDER) {
      groups[slot].sort((a, b) => b.addedAt - a.addedAt);
    }
    return groups;
  }, [entries]);

  const isEmpty = MEAL_SLOT_ORDER.every((s) => grouped[s].length === 0);
  if (isEmpty) return null;

  return (
    <>
      <section className="px-5 mt-2">
        <div
          className="overflow-y-auto rounded-2xl border border-neutral-100 bg-white"
          style={{ maxHeight: 280 }}
        >
          {MEAL_SLOT_ORDER.map((slot) => {
            const items = grouped[slot];
            if (items.length === 0) return null;
            const meta = MEAL_SLOT_META[slot];
            const slotKcal = items.reduce((s, x) => s + x.kcal, 0);
            return (
              <motion.div key={slot} layout className="py-2">
                <div className="px-4 py-1.5 text-[12px] font-semibold text-neutral-700 flex items-baseline justify-between">
                  <span>
                    {meta.emoji} {meta.label}
                  </span>
                  <span className="text-neutral-400 tabular-nums">{slotKcal} kcal</span>
                </div>
                <AnimatePresence initial={false}>
                  {items.map((it) => (
                    <LogRow
                      key={it.foodLogId}
                      item={it}
                      onLongPress={() => setSheetFor(it)}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </section>

      {sheetFor && (
        <SlotSheet
          item={sheetFor}
          onClose={() => setSheetFor(null)}
          onPick={(slot) => {
            onChangeSlot(sheetFor.foodLogId, slot);
            const meta = MEAL_SLOT_META[slot];
            setSheetFor(null);
            toast(`${meta.emoji} ${meta.label}으로 옮겼어요`);
          }}
        />
      )}
    </>
  );
}

function LogRow({ item, onLongPress }: { item: LogItem; onLongPress: () => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const dot = MACRO_COLORS[dominantMacro(item)];

  function start() {
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, 450);
  }
  function cancel() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className="flex items-center gap-3 px-4 py-2 active:bg-neutral-50 select-none"
    >
      <span
        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
        style={{ background: dot }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-bold text-neutral-900 truncate">{item.foodName}</div>
        <div className="text-[12px] text-neutral-400 mt-0.5">
          탄 {Math.round(item.carbs)}g · 단 {Math.round(item.protein)}g · 지 {Math.round(item.fat)}g
        </div>
      </div>
      <div className="text-[14px] font-bold tabular-nums text-neutral-900">{item.kcal}</div>
    </motion.div>
  );
}

function SlotSheet({
  item,
  onClose,
  onPick,
}: {
  item: LogItem;
  onClose: () => void;
  onPick: (slot: MealSlot) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 animate-fade-in" />
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative w-full max-w-[375px] rounded-t-2xl bg-white p-4 pb-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200" />
        <div className="px-2 pb-2 text-[13px] text-neutral-500">
          슬롯 변경 · <span className="text-neutral-800 font-medium">{item.foodName}</span>
        </div>
        <div className="space-y-1">
          {MEAL_SLOT_ORDER.map((slot) => {
            const meta = MEAL_SLOT_META[slot];
            const active = item.slot === slot;
            return (
              <button
                key={slot}
                onClick={() => onPick(slot)}
                className={`w-full h-12 rounded-xl text-left px-4 text-[15px] font-medium active:scale-[0.98] transition ${
                  active ? "bg-neutral-100 text-neutral-900" : "text-neutral-800 hover:bg-neutral-50"
                }`}
              >
                {meta.emoji} {meta.label}으로
              </button>
            );
          })}
          <button
            onClick={onClose}
            className="mt-2 w-full h-12 rounded-xl text-[15px] font-semibold text-neutral-500 border border-neutral-200 active:scale-[0.98] transition"
          >
            취소
          </button>
        </div>
      </motion.div>
    </div>
  );
}
