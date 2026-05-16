import { useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Star, Clock } from "lucide-react";
import foodPresets from "@/data/food-presets.json";
import { displayName, MACRO_COLORS, type BubbleEntry, type Macro } from "@/lib/foods";

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
const FAV_KEY = "favorites";
const RECENT_KEY = "recentFoods";
const CUSTOM_KEY = "customFoods";

interface CustomFoodLite {
  id: string;
  name: string;
  kcal: number;
  carb_g: number;
  protein_g: number;
  fat_g: number;
  serving_g: number;
}

function customToPreset(c: CustomFoodLite): FoodPreset {
  return {
    id: c.id,
    name: c.name,
    kcal: c.kcal,
    carb: c.carb_g,
    protein: c.protein_g,
    fat: c.fat_g,
    serving_g: c.serving_g,
  };
}

function readArr(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function dominantMacro(p: FoodPreset): Macro {
  const m: [Macro, number][] = [
    ["carbs", p.carb],
    ["protein", p.protein],
    ["fat", p.fat],
  ];
  m.sort((a, b) => b[1] - a[1]);
  return m[0][0];
}

function buildEntries(p: FoodPreset, mode: "serving" | "gram", qty: number): BubbleEntry[] {
  const mult = mode === "serving" ? qty : qty / p.serving_g;
  const macros: Record<Macro, number> = {
    carbs: p.carb * mult,
    protein: p.protein * mult,
    fat: p.fat * mult,
  };
  const now = Date.now();
  const foodLogId = `${now}-${Math.random().toString(36).slice(2, 9)}`;
  const out: BubbleEntry[] = [];
  (["carbs", "protein", "fat"] as Macro[]).forEach((m, i) => {
    const grams = Math.round(macros[m] * 10) / 10;
    if (grams > 0) {
      out.push({
        id: `${foodLogId}-${i}`,
        foodLogId,
        macro: m,
        grams,
        foodName: displayName(p.name),
        addedAt: now,
      });
    }
  });
  return out;
}

interface FlyState {
  id: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  curveDir: 1 | -1;
  curveAmt: number;
  color: string;
  entries: BubbleEntry[];
}

interface Props {
  bubbleContainerRef: RefObject<HTMLDivElement | null>;
  onAdd: (entries: BubbleEntry[]) => void;
}

export function QuickAddTray({ bubbleContainerRef, onAdd }: Props) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [sheet, setSheet] = useState<FoodPreset | null>(null);
  const [flying, setFlying] = useState<FlyState[]>([]);
  const flyIdRef = useRef(0);

  useEffect(() => {
    setFavorites(readArr(FAV_KEY));
    setRecents(readArr(RECENT_KEY));
    setHydrated(true);
  }, []);

  function pushRecent(id: string) {
    const next = [id, ...recents.filter((x) => x !== id)].slice(0, 10);
    setRecents(next);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  }

  function fly(p: FoodPreset, chipEl: HTMLElement, entries: BubbleEntry[]) {
    const chipRect = chipEl.getBoundingClientRect();
    const containerRect = bubbleContainerRef.current?.getBoundingClientRect();
    if (!containerRect) {
      onAdd(entries);
      return;
    }
    const from = {
      x: chipRect.left + chipRect.width / 2,
      y: chipRect.top + chipRect.height / 2,
    };
    // pop where chip meets the nearest bowl edge (straight line from chip to bowl center)
    const cx = containerRect.left + containerRect.width / 2;
    const cy = containerRect.top + containerRect.height / 2;
    const dx = cx - from.x;
    const dy = cy - from.y;
    // approximate bowl as ellipse inscribed in containerRect
    const rx = containerRect.width / 2;
    const ry = containerRect.height / 2;
    // ray from (from) toward (cx,cy): point on ellipse where it enters
    // parametrize as P = from + t*(d), find smallest t>0 where ((P.x-cx)/rx)^2 + ((P.y-cy)/ry)^2 = 1
    const ox = from.x - cx;
    const oy = from.y - cy;
    const A = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
    const B = 2 * ((ox * dx) / (rx * rx) + (oy * dy) / (ry * ry));
    const C = (ox * ox) / (rx * rx) + (oy * oy) / (ry * ry) - 1;
    const disc = B * B - 4 * A * C;
    let t = 1;
    if (disc >= 0 && A > 0) {
      const t1 = (-B - Math.sqrt(disc)) / (2 * A);
      const t2 = (-B + Math.sqrt(disc)) / (2 * A);
      const candidates = [t1, t2].filter((v) => v > 0 && v <= 1);
      if (candidates.length) t = Math.min(...candidates);
    }
    const to = { x: from.x + dx * t, y: from.y + dy * t };
    const id = ++flyIdRef.current;
    const color = MACRO_COLORS[dominantMacro(p)];
    const curveDir: 1 | -1 = Math.random() > 0.5 ? 1 : -1;
    const curveAmt = 40 + Math.random() * 60;
    setFlying((prev) => [...prev, { id, from, to, curveDir, curveAmt, color, entries }]);
  }

  function handleTap(p: FoodPreset, chipEl: HTMLElement) {
    const entries = buildEntries(p, "serving", 1);
    if (entries.length === 0) return;
    pushRecent(p.id);
    fly(p, chipEl, entries);
  }

  function handleSheetAdd(mode: "serving" | "gram", qty: number) {
    if (!sheet) return;
    const entries = buildEntries(sheet, mode, qty);
    if (entries.length > 0) {
      pushRecent(sheet.id);
      onAdd(entries);
    }
    setSheet(null);
  }

  if (!hydrated) return null;

  const favList = favorites
    .map((id) => PRESETS.find((p) => p.id === id))
    .filter((x): x is FoodPreset => !!x);
  const recentList = recents
    .slice(0, 10)
    .map((id) => PRESETS.find((p) => p.id === id))
    .filter((x): x is FoodPreset => !!x);

  if (favList.length === 0 && recentList.length === 0) return null;

  return (
    <>
      <div className="px-5 pt-3 pb-1 space-y-3">
        {favList.length > 0 && (
          <ChipRow label={<><Star className="w-3 h-3 text-neutral-500" strokeWidth={2.4} />즐겨찾기</>} foods={favList} onTap={handleTap} onLongPress={setSheet} />
        )}
        {recentList.length > 0 && (
          <ChipRow label={<><Clock className="w-3 h-3 text-neutral-500" strokeWidth={2.4} />최근 사용</>} foods={recentList} onTap={handleTap} onLongPress={setSheet} />
        )}
      </div>

      {/* flying chips */}
      <AnimatePresence>
        {flying.map((f) => (
          <motion.div
            key={f.id}
            initial={{ x: f.from.x, y: f.from.y, scale: 0.6, opacity: 1 }}
            animate={{
              x: [
                f.from.x,
                f.from.x + f.curveDir * f.curveAmt * 0.4,
                f.to.x,
              ],
              y: [
                f.from.y,
                (f.from.y + f.to.y) / 2 - 20,
                f.to.y,
              ],
              scale: [0.6, 1.05, 1.6],
              opacity: [1, 1, 0],
            }}
            transition={{
              duration: 0.75,
              ease: [0.22, 0.61, 0.36, 1],
            }}
            onAnimationComplete={() => {
              onAdd(f.entries);
              setFlying((prev) => prev.filter((x) => x.id !== f.id));
            }}
            style={{
              position: "fixed",
              left: 0,
              top: 0,
              width: 24,
              height: 24,
              marginLeft: -12,
              marginTop: -12,
              borderRadius: "50%",
              background: f.color,
              boxShadow: `0 4px 14px ${f.color}80`,
              pointerEvents: "none",
              zIndex: 60,
            }}
          />
        ))}
      </AnimatePresence>

      {sheet && (
        <QuantitySheet food={sheet} onClose={() => setSheet(null)} onAdd={handleSheetAdd} />
      )}
    </>
  );
}

function ChipRow({
  label,
  foods,
  onTap,
  onLongPress,
}: {
  label: React.ReactNode;
  foods: FoodPreset[];
  onTap: (p: FoodPreset, el: HTMLElement) => void;
  onLongPress: (p: FoodPreset) => void;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium text-neutral-500 mb-1.5 inline-flex items-center gap-1">{label}</div>
      <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1 scrollbar-none">
        {foods.map((f) => (
          <Chip key={f.id} food={f} onTap={onTap} onLongPress={onLongPress} />
        ))}
      </div>
    </div>
  );
}

function Chip({
  food,
  onTap,
  onLongPress,
}: {
  food: FoodPreset;
  onTap: (p: FoodPreset, el: HTMLElement) => void;
  onLongPress: (p: FoodPreset) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);
  const [echo, setEcho] = useState(0);

  function start() {
    longPressedRef.current = false;
    timerRef.current = setTimeout(() => {
      longPressedRef.current = true;
      onLongPress(food);
    }, 400);
  }
  function cancel() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }
  function release() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!longPressedRef.current && ref.current) {
      setEcho((n) => n + 1);
      onTap(food, ref.current);
    }
  }

  return (
    <motion.button
      ref={ref}
      animate={echo > 0 ? { scale: [1, 0.92, 1.05, 1] } : { scale: 1 }}
      transition={{ duration: 0.4 }}
      onPointerDown={start}
      onPointerUp={release}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className="shrink-0 rounded-[20px] border border-neutral-200 bg-white text-left active:scale-95 transition"
      style={{
        padding: "10px 14px",
        minWidth: 88,
        maxWidth: 140,
      }}
    >
      <div className="text-[13px] font-bold text-neutral-900 truncate leading-tight">
        {food.name}
      </div>
      <div className="text-[11px] text-neutral-400 mt-0.5">{food.kcal} kcal</div>
    </motion.button>
  );
}

function QuantitySheet({
  food,
  onClose,
  onAdd,
}: {
  food: FoodPreset;
  onClose: () => void;
  onAdd: (mode: "serving" | "gram", qty: number) => void;
}) {
  const [mode, setMode] = useState<"serving" | "gram">("serving");
  const [qty, setQty] = useState(1);

  useEffect(() => {
    setQty(mode === "serving" ? 1 : food.serving_g);
  }, [mode, food.serving_g]);

  const mult = mode === "serving" ? qty : qty / food.serving_g;
  const carb = Math.round(food.carb * mult * 10) / 10;
  const protein = Math.round(food.protein * mult * 10) / 10;
  const fat = Math.round(food.fat * mult * 10) / 10;
  const kcal = Math.round(food.kcal * mult);
  const step = mode === "serving" ? 0.5 : 10;

  function bump(delta: number) {
    setQty((q) => Math.max(0, Math.round((q + delta) * 10) / 10));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-[375px] rounded-t-2xl bg-white p-5 pb-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-200" />
        <h3 className="text-base font-bold text-neutral-900">{food.name}</h3>

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
          <button
            onClick={() => bump(-step)}
            className="h-12 w-12 rounded-xl border border-neutral-200 text-lg font-semibold active:scale-95"
          >
            −
          </button>
          <input
            type="number"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(parseFloat(e.target.value) || 0)}
            className="flex-1 h-12 px-3 rounded-xl border border-neutral-200 text-base font-semibold text-neutral-900 text-center focus:outline-none focus:ring-2 focus:ring-neutral-300"
          />
          <button
            onClick={() => bump(step)}
            className="h-12 w-12 rounded-xl border border-neutral-200 text-lg font-semibold active:scale-95"
          >
            +
          </button>
          <span className="text-sm text-neutral-500 w-8 text-center">
            {mode === "serving" ? "인분" : "g"}
          </span>
        </div>

        <div className="mt-4 rounded-xl bg-neutral-50 px-4 py-3">
          <div className="text-sm font-medium text-neutral-800">
            <span style={{ color: "#b58a00" }}>탄 {carb}g</span>
            <span className="mx-2 text-neutral-300">·</span>
            <span style={{ color: "#d63838" }}>단 {protein}g</span>
            <span className="mx-2 text-neutral-300">·</span>
            <span style={{ color: "#3478d6" }}>지 {fat}g</span>
          </div>
          <div className="mt-1 text-xs text-neutral-500">{kcal} kcal</div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-12 rounded-xl border border-neutral-200 text-sm font-semibold text-neutral-700 active:scale-95"
          >
            취소
          </button>
          <button
            disabled={qty <= 0}
            onClick={() => onAdd(mode, qty)}
            className="flex-[2] h-12 rounded-xl bg-neutral-900 text-white text-sm font-semibold disabled:opacity-40 active:scale-95"
          >
            추가하기
          </button>
        </div>
      </div>
    </div>
  );
}
