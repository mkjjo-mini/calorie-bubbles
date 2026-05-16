import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { MoreVertical } from "lucide-react";
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

function findPresetByName(name: string): FoodPreset | undefined {
  return PRESETS.find((p) => p.name.split(" ")[0] === name);
}

interface Props {
  entries: BubbleEntry[];
  onChangeSlot: (foodLogId: string, slot: MealSlot) => void;
  onDelete: (foodLogId: string) => void;
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
  const [actionFor, setActionFor] = useState<LogItem | null>(null);
  const [slotSheetFor, setSlotSheetFor] = useState<LogItem | null>(null);
  const [editFor, setEditFor] = useState<LogItem | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
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
    toast(`${meta.emoji} ${meta.label}으로 옮겼어요`);
  }

  function handleArmedRelease(item: LogItem) {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20);
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
            className="overflow-y-auto rounded-2xl border border-neutral-100 bg-white"
            style={{ maxHeight: 280 }}
          >
            {MEAL_SLOT_ORDER.map((slot) => {
              const items = grouped[slot];
              const meta = MEAL_SLOT_META[slot];
              const slotKcal = items.reduce((s, x) => s + x.kcal, 0);
              return (
                <SlotDropZone key={slot} slot={slot} isDragging={isDragging}>
                  <div className="px-4 py-1.5 text-[12px] font-semibold text-neutral-700 flex items-baseline justify-between">
                    <span>
                      {meta.emoji} {meta.label}
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
                          isAnyDragging={isDragging}
                          onArmedRelease={() => handleArmedRelease(it)}
                        />
                      ))}
                    </AnimatePresence>
                  )}
                </SlotDropZone>
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
          canEdit={!!findPresetByName(actionFor.foodName)}
          onClose={() => setActionFor(null)}
          onPick={(action) => {
            const target = actionFor;
            setActionFor(null);
            if (action === "edit") setEditFor(target);
            else if (action === "slot") setSlotSheetFor(target);
            else if (action === "delete") onDelete(target.foodLogId);
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
            toast(`${meta.emoji} ${meta.label}으로 옮겼어요`);
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
  isAnyDragging,
  onArmedRelease,
}: {
  item: LogItem;
  isAnyDragging: boolean;
  onArmedRelease: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.foodLogId,
  });
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [armed, setArmed] = useState(false);
  const armedRef = useRef(false);
  const movedRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  function clearTimer() {
    if (longPressRef.current) clearTimeout(longPressRef.current);
    longPressRef.current = null;
  }
  function reset() {
    clearTimer();
    armedRef.current = false;
    setArmed(false);
    movedRef.current = false;
    startRef.current = null;
  }

  function onPointerDown(e: React.PointerEvent) {
    startRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    armedRef.current = false;
    setArmed(false);
    longPressRef.current = setTimeout(() => {
      if (!movedRef.current) {
        armedRef.current = true;
        setArmed(true);
        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20);
      }
    }, 400);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.hypot(dx, dy) >= 8) movedRef.current = true;
  }
  function onPointerUp() {
    if (armedRef.current && !movedRef.current) {
      onArmedRelease();
    }
    reset();
  }

  // Hide original while dragging via overlay
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0 : 1,
    touchAction: "none",
  };

  return (
    <motion.div
      ref={setNodeRef}
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{
        opacity: isDragging ? 0 : 1,
        y: armed && !isDragging ? -2 : 0,
        boxShadow: armed && !isDragging ? "0 6px 14px rgba(0,0,0,0.10)" : "0 0 0 rgba(0,0,0,0)",
      }}
      exit={{ opacity: 0 }}
      style={style}
      {...attributes}
      {...listeners}
      onPointerDown={(e) => {
        listeners?.onPointerDown?.(e as never);
        onPointerDown(e);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
      onPointerLeave={() => {
        if (!isAnyDragging) reset();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className="select-none"
    >
      <LogRowVisual item={item} />
    </motion.div>
  );
}

function LogRowVisual({ item, dragging = false }: { item: LogItem; dragging?: boolean }) {
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
        className="w-full h-12 rounded-xl text-left px-4 text-[15px] font-medium text-neutral-800 hover:bg-neutral-50 active:scale-[0.98] transition disabled:opacity-40"
      >
        ✏️ 수량 편집
      </button>
      <button
        onClick={() => onPick("slot")}
        className="w-full h-12 rounded-xl text-left px-4 text-[15px] font-medium text-neutral-800 hover:bg-neutral-50 active:scale-[0.98] transition"
      >
        🔁 슬롯 변경
      </button>
      <button
        onClick={() => onPick("delete")}
        className="w-full h-12 rounded-xl text-left px-4 text-[15px] font-medium text-red-600 hover:bg-red-50 active:scale-[0.98] transition"
      >
        🗑️ 삭제
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
  const preset = findPresetByName(item.foodName);

  // Compute current grams from any non-zero macro ratio.
  const initialGrams = useMemo(() => {
    if (!preset) return 0;
    const candidates: [number, number][] = [
      [item.carbs, preset.carb],
      [item.protein, preset.protein],
      [item.fat, preset.fat],
    ];
    for (const [cur, base] of candidates) {
      if (base > 0 && cur > 0) return Math.round(preset.serving_g * (cur / base));
    }
    return preset.serving_g;
  }, [item, preset]);

  const [mode, setMode] = useState<"serving" | "gram">("gram");
  const [qtyStr, setQtyStr] = useState(String(initialGrams || 100));

  useEffect(() => {
    if (!preset) return;
    setQtyStr(mode === "serving" ? "1" : String(initialGrams || preset.serving_g));
  }, [mode, initialGrams, preset]);

  if (!preset) return null;

  const qty = parseFloat(qtyStr) || 0;
  const mult = mode === "serving" ? qty : qty / preset.serving_g;
  const carb = Math.round(preset.carb * mult * 10) / 10;
  const protein = Math.round(preset.protein * mult * 10) / 10;
  const fat = Math.round(preset.fat * mult * 10) / 10;
  const kcal = Math.round(preset.kcal * mult);
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
        <h3 className="text-base font-bold text-neutral-900">{preset.name}</h3>
        <p className="text-xs text-neutral-400 mt-0.5">
          {preset.kcal} kcal / {preset.serving_g}g 기준
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
          추가하기
        </button>
      </motion.div>
    </div>
  );
}
