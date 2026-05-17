import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { MoreVertical, Pencil, ArrowLeftRight, Trash2 } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  MACRO_COLORS,
  MACRO_KCAL,
  MEAL_SLOT_META,
  MEAL_SLOT_ORDER,
  type BubbleEntry,
  type Macro,
  type MealSlot,
} from "@/lib/foods";
import foodPresets from "@/data/food-presets.json";

interface FoodPreset {
  id: string;
  name: string;
  kcal: number;
  carb: number;
  protein: number;
  fat: number;
  serving_g: number;
}
const PRESETS = foodPresets as FoodPreset[];

interface Baseline {
  name: string;
  kcal: number;
  carb: number;
  protein: number;
  fat: number;
  serving_g: number;
}

interface CustomFoodLite {
  name: string;
  kcal: number;
  carb_g: number;
  protein_g: number;
  fat_g: number;
  serving_g: number;
}

function readCustomFoods(): CustomFoodLite[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("customFoods") || "[]");
  } catch {
    return [];
  }
}

function findBaselineByName(name: string): Baseline | undefined {
  const lower = name.toLowerCase();
  const preset =
    PRESETS.find((p) => p.name.split(" ")[0] === name) ??
    PRESETS.find((p) => p.name.toLowerCase() === lower);
  if (preset) {
    return {
      name: preset.name,
      kcal: preset.kcal,
      carb: preset.carb,
      protein: preset.protein,
      fat: preset.fat,
      serving_g: preset.serving_g,
    };
  }
  const c = readCustomFoods().find((x) => x.name.toLowerCase() === lower);
  if (c) {
    return {
      name: c.name,
      kcal: c.kcal,
      carb: c.carb_g,
      protein: c.protein_g,
      fat: c.fat_g,
      serving_g: c.serving_g,
    };
  }
  return undefined;
}

interface Props {
  entries: BubbleEntry[];
  onChangeSlot: (foodLogId: string, slot: MealSlot) => void;
  onDelete: (foodLogId: string, foodName: string) => void;
  onReplaceQty: (foodLogId: string, newEntries: BubbleEntry[]) => void;
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

export function MealLogList({ entries, onChangeSlot, onDelete, onReplaceQty }: Props) {
  // Expose onDelete ref so DraggableLogRow can call it without prop-drilling through DndContext
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const [actionFor, setActionFor] = useState<LogItem | null>(null);
  const [slotSheetFor, setSlotSheetFor] = useState<LogItem | null>(null);
  const [editFor, setEditFor] = useState<LogItem | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    // 가벼운 터치/스크롤로 drag 오발동 방지 — 꾹 눌러야 활성화
    useSensor(PointerSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
  );

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

  const itemById = useMemo(() => {
    const m = new Map<string, LogItem>();
    for (const slot of MEAL_SLOT_ORDER) {
      for (const it of grouped[slot]) m.set(it.foodLogId, it);
    }
    return m;
  }, [grouped]);

  const isDragging = activeId !== null;
  const activeItem = activeId ? itemById.get(activeId) ?? null : null;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15);
  }

  function handleDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    setActiveId(null);
    const item = itemById.get(id);
    if (!item || !e.over) return;
    const target = e.over.id as MealSlot;
    if (!MEAL_SLOT_ORDER.includes(target)) return;
    if (target === item.slot) return;
    onChangeSlot(item.foodLogId, target);
    const meta = MEAL_SLOT_META[target];
    toast(`${meta.label}으로 옮겼어요`);
  }

  function openActions(item: LogItem) {
    setActionFor(item);
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <section className="px-5 mt-2">
          <div
            className="rounded-2xl border border-neutral-100 bg-white"
          >
            {MEAL_SLOT_ORDER.map((slot, idx) => {
              const items = grouped[slot];
              const meta = MEAL_SLOT_META[slot];
              const slotKcal = items.reduce((s, x) => s + x.kcal, 0);
              return (
                <div
                  key={slot}
                  className={idx > 0 ? "border-t border-neutral-100" : ""}
                >
                  <SlotDropZone slot={slot} isDragging={isDragging}>
                    <div className="px-4 py-1.5 text-[12px] font-semibold text-neutral-700 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5">
                        <meta.Icon className="h-3.5 w-3.5 text-neutral-500" strokeWidth={2.2} />
                        {meta.label}
                      </span>
                      <span className="text-neutral-400 tabular-nums">{slotKcal} kcal</span>
                    </div>
                    {items.length === 0 ? (
                      <div className="px-4 py-2 text-[12px] text-neutral-300">
                        {isDragging ? "여기에 놓아 옮기기" : "비어 있음"}
                      </div>
                    ) : (
                      <AnimatePresence initial={false}>
                        {items.map((it) => (
                          <DraggableLogRow
                            key={it.foodLogId}
                            item={it}
                            onOpenActions={() => openActions(it)}
                            onDelete={(id, name) => onDeleteRef.current(id, name)}
                          />
                        ))}
                      </AnimatePresence>
                    )}
                  </SlotDropZone>
                </div>
              );
            })}
          </div>
        </section>

        <DragOverlay dropAnimation={null}>
          {activeItem ? <LogRowVisual item={activeItem} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {actionFor && (
        <ActionSheet
          item={actionFor}
          canEdit={true}
          onClose={() => setActionFor(null)}
          onPick={(action) => {
            const target = actionFor;
            setActionFor(null);
            if (action === "edit") setEditFor(target);
            else if (action === "slot") setSlotSheetFor(target);
            else if (action === "delete") onDelete(target.foodLogId, target.foodName);
          }}
        />
      )}

      {slotSheetFor && (
        <SlotSheet
          item={slotSheetFor}
          onClose={() => setSlotSheetFor(null)}
          onPick={(slot) => {
            const target = slotSheetFor;
            setSlotSheetFor(null);
            if (slot === target.slot) return;
            onChangeSlot(target.foodLogId, slot);
            const meta = MEAL_SLOT_META[slot];
            toast(`${meta.label}으로 옮겼어요`);
          }}
        />
      )}

      {editFor && (
        <EditQuantitySheet
          item={editFor}
          onClose={() => setEditFor(null)}
          onConfirm={(newEntries) => {
            const target = editFor;
            setEditFor(null);
            onReplaceQty(target.foodLogId, newEntries);
            toast("수정했어요");
          }}
        />
      )}
    </>
  );
}

function SlotDropZone({
  slot,
  isDragging,
  children,
}: {
  slot: MealSlot;
  isDragging: boolean;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: slot });
  return (
    <motion.div
      ref={setNodeRef}
      layout
      className="py-2 transition-all"
      animate={{
        backgroundColor: isOver ? "rgba(243,244,246,1)" : "rgba(255,255,255,0)",
        scale: isOver ? 1.01 : 1,
      }}
      style={{
        borderRadius: 12,
        outline: isDragging && isOver ? "2px dashed rgba(115,115,115,0.4)" : "none",
        outlineOffset: -4,
      }}
    >
      {children}
    </motion.div>
  );
}


function DraggableLogRow({
  item,
  onOpenActions,
  onDelete,
}: {
  item: LogItem;
  onOpenActions: () => void;
  onDelete: (foodLogId: string, foodName: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.foodLogId,
  });
  const [primed, setPrimed] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if (isDragging) setPrimed(false);
  }, [isDragging]);

  useEffect(() => () => clearTimer(), []);

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0 : 1,
    // vertical scroll 양보 — dnd-kit은 long-press 250ms 후 preventDefault로 capture
    touchAction: "pan-y",
  };

  // Compose with dnd-kit's listeners so drag activation still works.
  const dndListeners = listeners ?? {};
  const composed = {
    onPointerDown: (e: React.PointerEvent) => {
      dndListeners.onPointerDown?.(e);
      clearTimer();
      startPos.current = { x: e.clientX, y: e.clientY };
      timerRef.current = window.setTimeout(() => {
        setPrimed(true);
        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15);
      }, 300);
    },
    onPointerMove: (e: React.PointerEvent) => {
      dndListeners.onPointerMove?.(e);
      if (primed || !startPos.current) return;
      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;
      if (dx * dx + dy * dy > 64) clearTimer(); // ~8px tolerance
    },
    onPointerUp: (e: React.PointerEvent) => {
      dndListeners.onPointerUp?.(e);
      clearTimer();
      setPrimed(false);
      startPos.current = null;
    },
    onPointerCancel: (e: React.PointerEvent) => {
      dndListeners.onPointerCancel?.(e);
      clearTimer();
      setPrimed(false);
      startPos.current = null;
    },
    onKeyDown: dndListeners.onKeyDown as React.KeyboardEventHandler<HTMLDivElement> | undefined,
  };

  return (
    <motion.div
      ref={setNodeRef}
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{
        opacity: isDragging ? 0 : 1,
        scale: primed ? 1.02 : 1,
      }}
      transition={{ scale: { type: "spring", stiffness: 400, damping: 28 } }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      style={style}
      {...attributes}
      {...composed}
      onContextMenu={(e) => e.preventDefault()}
      className={`select-none rounded-xl transition-shadow ${
        primed ? "bg-white shadow-lg ring-1 ring-neutral-200" : ""
      }`}
    >
      <LogRowVisual item={item} onOpenActions={onOpenActions} />
    </motion.div>
  );
}

function LogRowVisual({
  item,
  dragging = false,
  onOpenActions,
}: {
  item: LogItem;
  dragging?: boolean;
  onOpenActions?: () => void;
}) {
  const dot = MACRO_COLORS[dominantMacro(item)];
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 ${
        dragging ? "bg-white rounded-xl shadow-xl scale-[1.03]" : "active:bg-neutral-50"
      }`}
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
      {onOpenActions && (
        <button
          type="button"
          aria-label="더보기"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenActions();
          }}
          className="p-1.5 -mr-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 active:scale-95 transition flex items-center justify-center"
          style={{ minWidth: 32, minHeight: 32 }}
        >
          <MoreVertical size={16} />
        </button>
      )}
    </div>
  );
}

/* ----------------------------- Action Sheet ----------------------------- */

type ActionKind = "edit" | "slot" | "delete";

function ActionSheet({
  item,
  canEdit,
  onClose,
  onPick,
}: {
  item: LogItem;
  canEdit: boolean;
  onClose: () => void;
  onPick: (action: ActionKind) => void;
}) {
  return (
    <SheetShell onClose={onClose} title="이 음식" subtitle={item.foodName}>
      <button
        disabled={!canEdit}
        onClick={() => onPick("edit")}
        className="w-full h-12 rounded-xl text-left px-4 text-[15px] font-medium text-neutral-800 hover:bg-neutral-50 active:scale-[0.98] transition disabled:opacity-40 flex items-center gap-3"
      >
        <Pencil className="h-[18px] w-[18px] text-neutral-600" strokeWidth={2} />
        수량 편집
      </button>
      <button
        onClick={() => onPick("slot")}
        className="w-full h-12 rounded-xl text-left px-4 text-[15px] font-medium text-neutral-800 hover:bg-neutral-50 active:scale-[0.98] transition flex items-center gap-3"
      >
        <ArrowLeftRight className="h-[18px] w-[18px] text-neutral-600" strokeWidth={2} />
        슬롯 변경
      </button>
      <button
        onClick={() => onPick("delete")}
        className="w-full h-12 rounded-xl text-left px-4 text-[15px] font-medium text-red-600 hover:bg-red-50 active:scale-[0.98] transition flex items-center gap-3"
      >
        <Trash2 className="h-[18px] w-[18px] text-red-600" strokeWidth={2} />
        삭제
      </button>
      <button
        onClick={onClose}
        className="mt-2 w-full h-12 rounded-xl text-[15px] font-semibold text-neutral-500 border border-neutral-200 active:scale-[0.98] transition"
      >
        취소
      </button>
    </SheetShell>
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
    <SheetShell onClose={onClose} title="슬롯 변경" subtitle={item.foodName}>
      {MEAL_SLOT_ORDER.map((slot) => {
        const meta = MEAL_SLOT_META[slot];
        const active = item.slot === slot;
        return (
          <button
            key={slot}
            onClick={() => onPick(slot)}
            className={`w-full h-12 rounded-xl text-left px-4 text-[15px] font-medium active:scale-[0.98] transition flex items-center gap-2.5 ${
              active ? "bg-neutral-100 text-neutral-900" : "text-neutral-800 hover:bg-neutral-50"
            }`}
          >
            <meta.Icon className="h-4 w-4 text-neutral-500" strokeWidth={2.2} />
            {meta.label}으로
          </button>
        );
      })}
      <button
        onClick={onClose}
        className="mt-2 w-full h-12 rounded-xl text-[15px] font-semibold text-neutral-500 border border-neutral-200 active:scale-[0.98] transition"
      >
        취소
      </button>
    </SheetShell>
  );
}

function SheetShell({
  onClose,
  title,
  subtitle,
  children,
}: {
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative w-full max-w-[375px] rounded-t-2xl bg-white p-4 pb-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200" />
        <div className="px-2 pb-2 text-[13px] text-neutral-500">
          {title}
          {subtitle ? (
            <> · <span className="text-neutral-800 font-medium">{subtitle}</span></>
          ) : null}
        </div>
        <div className="space-y-1">{children}</div>
      </motion.div>
    </div>
  );
}

/* ----------------------------- Edit Quantity ----------------------------- */

function EditQuantitySheet({
  item,
  onClose,
  onConfirm,
}: {
  item: LogItem;
  onClose: () => void;
  onConfirm: (newEntries: BubbleEntry[]) => void;
}) {
  const baseline: Baseline = useMemo(() => {
    const found = findBaselineByName(item.foodName);
    if (found) return found;
    // Fallback: derive a 1-serving baseline from the log entry itself.
    const itemKcal = Math.round(item.carbs * 4 + item.protein * 4 + item.fat * 9);
    const approxG = Math.max(
      1,
      Math.round(item.carbs + item.protein + item.fat),
    );
    return {
      name: item.foodName,
      kcal: itemKcal,
      carb: item.carbs,
      protein: item.protein,
      fat: item.fat,
      serving_g: approxG,
    };
  }, [item]);

  // Compute current grams from any non-zero macro ratio.
  const initialGrams = useMemo(() => {
    const candidates: [number, number][] = [
      [item.carbs, baseline.carb],
      [item.protein, baseline.protein],
      [item.fat, baseline.fat],
    ];
    for (const [cur, base] of candidates) {
      if (base > 0 && cur > 0) return Math.round(baseline.serving_g * (cur / base));
    }
    return baseline.serving_g;
  }, [item, baseline]);

  const [mode, setMode] = useState<"serving" | "gram">("gram");
  const [qtyStr, setQtyStr] = useState(String(initialGrams || 100));

  useEffect(() => {
    setQtyStr(mode === "serving" ? "1" : String(initialGrams || baseline.serving_g));
  }, [mode, initialGrams, baseline]);

  const qty = parseFloat(qtyStr) || 0;
  const mult = mode === "serving" ? qty : qty / baseline.serving_g;
  const carb = Math.round(baseline.carb * mult * 10) / 10;
  const protein = Math.round(baseline.protein * mult * 10) / 10;
  const fat = Math.round(baseline.fat * mult * 10) / 10;
  const kcal = Math.round(baseline.kcal * mult);
  const disabled = qty <= 0;

  function handleConfirm() {
    const macros: Record<Macro, number> = { carbs: carb, protein: protein, fat: fat };
    const newEntries: BubbleEntry[] = [];
    (["carbs", "protein", "fat"] as Macro[]).forEach((m, i) => {
      const grams = Math.round(macros[m] * 10) / 10;
      if (grams > 0) {
        newEntries.push({
          id: `${item.foodLogId}-${i}`,
          foodLogId: item.foodLogId,
          macro: m,
          grams,
          foodName: item.foodName,
          addedAt: item.addedAt,
          meal_slot: item.slot,
        });
      }
    });
    onConfirm(newEntries);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative w-full max-w-[375px] rounded-t-2xl bg-white p-5 pb-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-200" />
        <h3 className="text-base font-bold text-neutral-900">{baseline.name}</h3>
        <p className="text-xs text-neutral-400 mt-0.5">
          {baseline.kcal} kcal / {baseline.serving_g}g 기준
        </p>

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1">
          {(["serving", "gram"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`h-8 rounded-md text-sm font-medium transition ${
                mode === m ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
              }`}
            >
              {m === "serving" ? "인분" : "그램(g)"}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={qtyStr}
            onChange={(e) => setQtyStr(e.target.value)}
            min={0}
            step={mode === "serving" ? 0.5 : 10}
            className="flex-1 h-12 px-3 rounded-xl border border-neutral-200 text-base font-semibold text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-300"
          />
          <span className="text-sm text-neutral-500 w-10 text-center">
            {mode === "serving" ? "인분" : "g"}
          </span>
        </div>

        <div className="mt-4 rounded-xl bg-neutral-50 px-4 py-3">
          <div className="text-xs text-neutral-500">예상 영양</div>
          <div className="mt-1 text-sm font-medium text-neutral-800">
            <span style={{ color: "#b58a00" }}>탄 {carb}g</span>
            <span className="mx-2 text-neutral-300">·</span>
            <span style={{ color: "#d63838" }}>단 {protein}g</span>
            <span className="mx-2 text-neutral-300">·</span>
            <span style={{ color: "#3478d6" }}>지 {fat}g</span>
          </div>
          <div className="mt-1 text-xs text-neutral-500">{kcal} kcal</div>
        </div>

        <button
          disabled={disabled}
          onClick={handleConfirm}
          className="mt-5 w-full h-12 rounded-xl bg-neutral-900 text-white text-sm font-semibold disabled:opacity-40 active:scale-95 transition"
        >
          수정하기
        </button>
      </motion.div>
    </div>
  );
}
