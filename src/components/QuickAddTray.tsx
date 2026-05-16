import { useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Star, Clock } from "lucide-react";
import foodPresets from "@/data/food-presets.json";
import { displayName, MACRO_COLORS, type BubbleEntry, type Macro } from "@/lib/foods";
import {
  QuantitySheet,
  type Pickable,
  type LastQty,
} from "@/components/QuantitySheet";

interface FoodPreset {
  id: string;
  name: string;
  kcal: number;
  carb: number;
  protein: number;
  fat: number;
  serving_g: number;
  /** undefined → 정적 preset, "custom"/"api" → customFood로부터 변환됨 */
  source?: "preset" | "custom" | "api";
}

const PRESETS = foodPresets as FoodPreset[];
const FAV_KEY = "favorites";
const LAST_QTY_KEY = "lastQtyByName";

type LastQtyMap = Record<string, LastQty>;

function formatQty(food: FoodPreset, last: LastQty | undefined): string {
  if (!last) return "1인분";
  return last.mode === "gram"
    ? `${last.qty}g`
    : last.qty === 1
      ? "1인분"
      : `${last.qty}인분`;
}
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
  /** customFood의 source — Pickable 변환 시 saveAsBase UI 분기에 사용 */
  source?: "user" | "api";
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
    source: c.source === "api" ? "api" : "custom",
  };
}

function toPickable(p: FoodPreset): Pickable {
  return {
    source: p.source ?? "preset",
    id: p.id,
    name: p.name,
    kcal: p.kcal,
    carb: p.carb,
    protein: p.protein,
    fat: p.fat,
    serving_g: p.serving_g,
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

/**
 * Build BubbleEntry triple from any source shape (FoodPreset or Pickable).
 * Both expose carb/protein/fat/serving_g/name with identical semantics.
 */
type EntrySource = {
  name: string;
  carb: number;
  protein: number;
  fat: number;
  serving_g: number;
};

function buildEntries(p: EntrySource, mode: "serving" | "gram", qty: number): BubbleEntry[] {
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
  const [customs, setCustoms] = useState<CustomFoodLite[]>([]);
  const [lastQtyMap, setLastQtyMap] = useState<LastQtyMap>({});
  const [hydrated, setHydrated] = useState(false);
  const [sheet, setSheet] = useState<Pickable | null>(null);
  const [flying, setFlying] = useState<FlyState[]>([]);
  const flyIdRef = useRef(0);

  useEffect(() => {
    setFavorites(readArr(FAV_KEY));
    setRecents(readArr(RECENT_KEY));
    try {
      setCustoms(JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]"));
    } catch {
      setCustoms([]);
    }
    try {
      setLastQtyMap(JSON.parse(localStorage.getItem(LAST_QTY_KEY) || "{}"));
    } catch {
      setLastQtyMap({});
    }
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

  function persistLastQty(name: string, qty: number, mode: "serving" | "gram") {
    const next = { ...lastQtyMap, [name]: { qty, mode } };
    setLastQtyMap(next);
    localStorage.setItem(LAST_QTY_KEY, JSON.stringify(next));
  }

  function handleTap(p: FoodPreset, chipEl: HTMLElement) {
    const last = lastQtyMap[p.name];
    const mode = last?.mode ?? "serving";
    const qty = last?.qty ?? 1;
    const entries = buildEntries(p, mode, qty);
    if (entries.length === 0) return;
    pushRecent(p.id);
    persistLastQty(p.name, qty, mode);
    fly(p, chipEl, entries);
  }

  function handleSheetAdd(mode: "serving" | "gram", qty: number, saveAsBase: boolean) {
    if (!sheet) return;
    const entries = buildEntries(sheet, mode, qty);
    if (entries.length > 0) {
      pushRecent(sheet.id);

      if (saveAsBase) {
        // customFood의 기준 단위 자체를 이 양으로 변경 (serving_g + kcal + 매크로 비례 환산)
        try {
          const fullList = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]");
          const idx = fullList.findIndex((x: { id: string }) => x.id === sheet.id);
          if (idx >= 0) {
            const c = fullList[idx];
            const oldServingG = c.serving_g;
            const newServingG = mode === "gram" ? qty : qty * oldServingG;
            if (oldServingG > 0 && newServingG > 0) {
              const ratio = newServingG / oldServingG;
              fullList[idx] = {
                ...c,
                serving_g: newServingG,
                serving_amount: newServingG,
                serving_unit: "g",
                kcal: Math.round(c.kcal * ratio),
                carb_g: Math.round(c.carb_g * ratio * 10) / 10,
                protein_g: Math.round(c.protein_g * ratio * 10) / 10,
                fat_g: Math.round(c.fat_g * ratio * 10) / 10,
                updated_at: Date.now(),
              };
              localStorage.setItem(CUSTOM_KEY, JSON.stringify(fullList));
              setCustoms(
                fullList.map((x: CustomFoodLite) => ({
                  id: x.id,
                  name: x.name,
                  kcal: x.kcal,
                  carb_g: x.carb_g,
                  protein_g: x.protein_g,
                  fat_g: x.fat_g,
                  serving_g: x.serving_g,
                  source: x.source,
                })),
              );
              // 기준 단위가 바뀌었으므로 lastQty는 1인분으로 reset
              persistLastQty(sheet.name, 1, "serving");
            } else {
              persistLastQty(sheet.name, qty, mode);
            }
          } else {
            persistLastQty(sheet.name, qty, mode);
          }
        } catch {
          persistLastQty(sheet.name, qty, mode);
        }
      } else {
        persistLastQty(sheet.name, qty, mode);
      }

      onAdd(entries);
    }
    setSheet(null);
  }

  if (!hydrated) return null;

  const favList = favorites
    .map((key) => {
      // favorites에는 preset id 또는 customFood id/name이 들어올 수 있음 (혼재)
      const preset = PRESETS.find((p) => p.id === key);
      if (preset) return preset;
      const customById = customs.find((c) => c.id === key);
      if (customById) return customToPreset(customById);
      const lower = key.toLowerCase();
      const customByName = customs.find((c) => c.name.toLowerCase() === lower);
      return customByName ? customToPreset(customByName) : undefined;
    })
    .filter((x): x is FoodPreset => !!x);
  const recentList = recents
    .slice(0, 10)
    .map((id) => {
      const p = PRESETS.find((x) => x.id === id);
      if (p) return p;
      const c = customs.find((x) => x.id === id);
      return c ? customToPreset(c) : undefined;
    })
    .filter((x): x is FoodPreset => !!x);

  if (favList.length === 0 && recentList.length === 0) return null;

  return (
    <>
      <div className="px-5 pt-3 pb-1 space-y-3">
        {favList.length > 0 && (
          <ChipRow label={<><Star className="w-3 h-3 text-neutral-500" strokeWidth={2.4} />즐겨찾기</>} foods={favList} lastQtyMap={lastQtyMap} onTap={handleTap} onLongPress={(p) => setSheet(toPickable(p))} />
        )}
        {recentList.length > 0 && (
          <ChipRow label={<><Clock className="w-3 h-3 text-neutral-500" strokeWidth={2.4} />최근 사용</>} foods={recentList} lastQtyMap={lastQtyMap} onTap={handleTap} onLongPress={(p) => setSheet(toPickable(p))} />
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
        <QuantitySheet
          food={sheet}
          last={lastQtyMap[sheet.name]}
          onClose={() => setSheet(null)}
          onAdd={handleSheetAdd}
        />
      )}
    </>
  );
}

function ChipRow({
  label,
  foods,
  lastQtyMap,
  onTap,
  onLongPress,
}: {
  label: React.ReactNode;
  foods: FoodPreset[];
  lastQtyMap: LastQtyMap;
  onTap: (p: FoodPreset, el: HTMLElement) => void;
  onLongPress: (p: FoodPreset) => void;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium text-neutral-500 mb-1.5 inline-flex items-center gap-1">{label}</div>
      <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1 scrollbar-none">
        {foods.map((f) => (
          <Chip
            key={f.id}
            food={f}
            last={lastQtyMap[f.name]}
            onTap={onTap}
            onLongPress={onLongPress}
          />
        ))}
      </div>
    </div>
  );
}

function Chip({
  food,
  last,
  onTap,
  onLongPress,
}: {
  food: FoodPreset;
  last: LastQty | undefined;
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
      <div className="text-[11px] text-neutral-400 mt-0.5">
        {formatQty(food, last)} · {food.kcal} kcal
      </div>
    </motion.button>
  );
}

