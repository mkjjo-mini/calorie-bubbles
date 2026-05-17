import { useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouterState } from "@tanstack/react-router";
import { Star, Clock } from "lucide-react";
import { toast } from "sonner";
import { displayName, inferMealSlot, MACRO_COLORS, type BubbleEntry, type Macro } from "@/lib/foods";
import {
  QuantitySheet,
  type Pickable,
  type LastQty,
} from "@/components/QuantitySheet";
import { cloudRepository } from "@/lib/repository/cloud";
import { CloudAuthError, type FoodRow, type FoodLogRow } from "@/lib/repository/types";
import { resolveFoodId } from "@/lib/foods-resolve";
import { todayKST } from "@/lib/time";
import type { FoodInsert } from "@/lib/repository/types";

const LAST_QTY_KEY = "lastQtyByName";
const RECENT_KEY = "recentFoods";

type LastQtyMap = Record<string, LastQty>;

function formatQty(food: FoodRow, last: LastQty | undefined): string {
  if (!last) return "1인분";
  return last.mode === "gram"
    ? `${last.qty}g`
    : last.qty === 1
      ? "1인분"
      : `${last.qty}인분`;
}

function readArr(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function dominantMacro(f: FoodRow): Macro {
  const m: [Macro, number][] = [
    ["carbs", f.carb_g],
    ["protein", f.protein_g],
    ["fat", f.fat_g],
  ];
  m.sort((a, b) => b[1] - a[1]);
  return m[0][0];
}

function foodRowToPickable(f: FoodRow): Pickable {
  const isWeight = f.serving_unit === "g" || f.serving_unit === "ml";
  const label = isWeight
    ? `${f.serving_g}${f.serving_unit}`
    : `${f.serving_amount}${f.serving_unit} (${f.serving_g}g)`;
  return {
    source: f.source === "user" ? "custom" : f.source,
    id: f.id,
    name: f.name,
    kcal: f.kcal,
    carb: f.carb_g,
    protein: f.protein_g,
    fat: f.fat_g,
    serving_g: f.serving_g,
    serving_label: label,
    is_estimated: f.is_estimated,
    food_code: f.food_code ?? undefined,
  };
}

/** FoodRow shape for building BubbleEntry during animation */
type EntrySource = {
  name: string;
  carb_g: number;
  protein_g: number;
  fat_g: number;
  serving_g: number;
};

function buildEntries(
  p: EntrySource,
  mode: "serving" | "gram",
  qty: number,
  foodLogId: string,
  now: number,
  mealSlot: ReturnType<typeof inferMealSlot>,
): BubbleEntry[] {
  const mult = mode === "serving" ? qty : qty / p.serving_g;
  const macros: Record<Macro, number> = {
    carbs: p.carb_g * mult,
    protein: p.protein_g * mult,
    fat: p.fat_g * mult,
  };
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
        meal_slot: mealSlot,
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
  /** pre-built optimistic BubbleEntry[] for fly animation; actual log in newLog */
  entries: BubbleEntry[];
  newLog: FoodLogRow;
}

interface Props {
  bubbleContainerRef: RefObject<HTMLDivElement | null>;
  onAdded: (log: FoodLogRow) => void;
}

export function QuickAddTray({ bubbleContainerRef, onAdded }: Props) {
  const [favFoods, setFavFoods] = useState<FoodRow[]>([]);
  // 모든 source의 cloud foods — recents chip 매칭에 필요 (즐겨찾기 아닌 음식도 포함)
  const [allFoods, setAllFoods] = useState<FoodRow[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [lastQtyMap, setLastQtyMap] = useState<LastQtyMap>({});
  const [hydrated, setHydrated] = useState(false);
  const [sheet, setSheet] = useState<{ food: FoodRow; pickable: Pickable } | null>(null);
  const [flying, setFlying] = useState<FlyState[]>([]);
  const flyIdRef = useRef(0);

  useEffect(() => {
    setRecents(readArr(RECENT_KEY));
    try {
      setLastQtyMap(JSON.parse(localStorage.getItem(LAST_QTY_KEY) || "{}"));
    } catch {
      setLastQtyMap({});
    }
    void loadCloudData();
  }, []);

  // 다른 탭(add.tsx 등)에서 즐겨찾기/음식 변경 후 홈으로 돌아오면 최신화
  // SPA 내 navigation은 visibilitychange가 발동하지 않으므로 라우터 path 변경도 함께 감지
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void loadCloudData();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (pathname === "/") void loadCloudData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function loadCloudData() {
    try {
      const [foods, favs] = await Promise.all([
        cloudRepository.foods.list(),
        cloudRepository.favorites.list(),
      ]);
      const favFoodIdSet = new Set(favs.map((f) => f.food_id));
      setAllFoods(foods);
      setFavFoods(foods.filter((f) => favFoodIdSet.has(f.id)));
    } catch (e) {
      if (e instanceof CloudAuthError) {
        toast.error("로그인이 필요해요");
      }
      // Non-auth failures silently swallowed — tray just won't show favorites
    }
    setHydrated(true);
  }

  function pushRecent(foodId: string) {
    setRecents((prev) => {
      const next = [foodId, ...prev.filter((x) => x !== foodId)].slice(0, 10);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      return next;
    });
  }

  function persistLastQty(name: string, qty: number, mode: "serving" | "gram") {
    setLastQtyMap((prev) => {
      const next = { ...prev, [name]: { qty, mode } };
      localStorage.setItem(LAST_QTY_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function createLog(
    food: FoodRow,
    mode: "serving" | "gram",
    qty: number,
  ): Promise<FoodLogRow> {
    const now = Date.now();
    const mealSlot = inferMealSlot(now);
    const mult = mode === "serving" ? qty : qty / food.serving_g;
    const carbG = Math.round(food.carb_g * mult * 10) / 10;
    const proteinG = Math.round(food.protein_g * mult * 10) / 10;
    const fatG = Math.round(food.fat_g * mult * 10) / 10;
    const kcal = Math.round(carbG * 4 + proteinG * 4 + fatG * 9);
    const grams = mode === "gram" ? qty : Math.round(food.serving_g * qty);

    // Resolve food_id (preset/api may need upsert)
    let foodId: string;
    if (food.source === "user") {
      foodId = food.id;
    } else {
      const food_code = food.food_code ?? food.id;
      const insert: FoodInsert = {
        source: food.source,
        food_code,
        name: food.name,
        serving_unit: food.serving_unit,
        serving_amount: food.serving_amount,
        serving_g: food.serving_g,
        kcal: food.kcal,
        carb_g: food.carb_g,
        protein_g: food.protein_g,
        fat_g: food.fat_g,
        category: food.category ?? null,
        is_estimated: food.is_estimated,
      };
      foodId = await resolveFoodId({ source: food.source, food_code, insert });
    }

    const log = await cloudRepository.foodLogs.create({
      food_id: foodId,
      logged_date: todayKST(),
      meal_slot: mealSlot,
      grams,
      kcal,
      carb_g: carbG,
      protein_g: proteinG,
      fat_g: fatG,
    });

    // Attach food name for display (API returns food join on some backends;
    // fall back to injecting from local FoodRow so bubbles show the name)
    if (!log.food) {
      (log as FoodLogRow).food = {
        name: food.name,
        food_code: food.food_code ?? null,
        source: food.source,
        is_estimated: food.is_estimated,
      };
    }

    return log;
  }

  function fly(food: FoodRow, chipEl: HTMLElement, newLog: FoodLogRow) {
    const now = newLog.created_at
      ? new Date(newLog.created_at).getTime()
      : Date.now();
    const mealSlot = inferMealSlot(now);
    const last = lastQtyMap[food.name];
    const mode = last?.mode ?? "serving";
    const qty = last?.qty ?? 1;
    const entries = buildEntries(food, mode, qty, newLog.id, now, mealSlot);

    const chipRect = chipEl.getBoundingClientRect();
    const containerRect = bubbleContainerRef.current?.getBoundingClientRect();
    if (!containerRect) {
      onAdded(newLog);
      return;
    }
    const from = {
      x: chipRect.left + chipRect.width / 2,
      y: chipRect.top + chipRect.height / 2,
    };
    const cx = containerRect.left + containerRect.width / 2;
    const cy = containerRect.top + containerRect.height / 2;
    const dx = cx - from.x;
    const dy = cy - from.y;
    const rx = containerRect.width / 2;
    const ry = containerRect.height / 2;
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
    const color = MACRO_COLORS[dominantMacro(food)];
    const curveDir: 1 | -1 = Math.random() > 0.5 ? 1 : -1;
    const curveAmt = 40 + Math.random() * 60;
    setFlying((prev) => [
      ...prev,
      { id, from, to, curveDir, curveAmt, color, entries, newLog },
    ]);
  }

  async function handleTap(food: FoodRow, chipEl: HTMLElement) {
    const last = lastQtyMap[food.name];
    const mode = last?.mode ?? "serving";
    const qty = last?.qty ?? 1;
    pushRecent(food.id);
    persistLastQty(food.name, qty, mode);

    try {
      const newLog = await createLog(food, mode, qty);
      fly(food, chipEl, newLog);
    } catch (e) {
      if (e instanceof CloudAuthError) {
        toast.error("로그인이 필요해요");
      } else {
        toast.error(`추가 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  async function handleSheetAdd(mode: "serving" | "gram", qty: number, saveAsBase: boolean) {
    if (!sheet) return;
    const { food } = sheet;
    pushRecent(food.id);

    // saveAsBase: source 무관하게 cloud foods.update (preset은 UI에서 체크박스 숨김)
    if (saveAsBase && food.serving_g > 0) {
      const newServingG = mode === "gram" ? qty : qty * food.serving_g;
      if (newServingG > 0) {
        const ratio = newServingG / food.serving_g;
        const updated = {
          serving_g: newServingG,
          serving_amount: newServingG,
          serving_unit: "g",
          kcal: Math.round(food.kcal * ratio),
          carb_g: Math.round(food.carb_g * ratio * 10) / 10,
          protein_g: Math.round(food.protein_g * ratio * 10) / 10,
          fat_g: Math.round(food.fat_g * ratio * 10) / 10,
        };
        try {
          await cloudRepository.foods.update(food.id, updated);
          // 두 state 모두 즉시 반영 — 다음 sheet/chip 렌더 시 새 값 사용
          const apply = (f: FoodRow) =>
            f.id === food.id ? { ...f, ...updated } : f;
          setFavFoods((prev) => prev.map(apply));
          setAllFoods((prev) => prev.map(apply));
          persistLastQty(food.name, 1, "serving");
          toast.success(`${newServingG}g을 1인분 기준으로 저장했어요`);
        } catch (e) {
          persistLastQty(food.name, qty, mode);
          if (e instanceof CloudAuthError) toast.error("로그인이 필요해요");
          else toast.error(`기준 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else {
        persistLastQty(food.name, qty, mode);
      }
    } else {
      persistLastQty(food.name, qty, mode);
    }

    setSheet(null);

    try {
      const newLog = await createLog(food, mode, qty);
      onAdded(newLog);
    } catch (e) {
      if (e instanceof CloudAuthError) {
        toast.error("로그인이 필요해요");
      } else {
        toast.error(`추가 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  if (!hydrated) return null;

  // Recent list: food_id 기반으로 매칭 (unified cloud UUID)
  const recentList = recents
    // recents food_id → 모든 source(user/preset/api) 매칭
    .slice(0, 10)
    .map((id) => allFoods.find((f) => f.id === id))
    .filter((f): f is FoodRow => !!f);

  if (favFoods.length === 0 && recentList.length === 0) return null;

  return (
    <>
      <div className="px-5 pt-3 pb-1 space-y-3">
        {favFoods.length > 0 && (
          <ChipRow
            label={
              <>
                <Star className="w-3 h-3 text-neutral-500" strokeWidth={2.4} />
                즐겨찾기
              </>
            }
            foods={favFoods}
            lastQtyMap={lastQtyMap}
            onTap={handleTap}
            onLongPress={(f) => setSheet({ food: f, pickable: foodRowToPickable(f) })}
          />
        )}
        {recentList.length > 0 && (
          <ChipRow
            label={
              <>
                <Clock className="w-3 h-3 text-neutral-500" strokeWidth={2.4} />
                최근 사용
              </>
            }
            foods={recentList}
            lastQtyMap={lastQtyMap}
            onTap={handleTap}
            onLongPress={(f) => setSheet({ food: f, pickable: foodRowToPickable(f) })}
          />
        )}
      </div>

      {/* flying chips */}
      <AnimatePresence>
        {flying.map((f) => (
          <motion.div
            key={f.id}
            initial={{ x: f.from.x, y: f.from.y, scale: 0.6, opacity: 1 }}
            animate={{
              x: [f.from.x, f.from.x + f.curveDir * f.curveAmt * 0.4, f.to.x],
              y: [f.from.y, (f.from.y + f.to.y) / 2 - 20, f.to.y],
              scale: [0.6, 1.05, 1.6],
              opacity: [1, 1, 0],
            }}
            transition={{
              duration: 0.75,
              ease: [0.22, 0.61, 0.36, 1],
            }}
            onAnimationComplete={() => {
              onAdded(f.newLog);
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
          food={sheet.pickable}
          last={lastQtyMap[sheet.food.name]}
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
  foods: FoodRow[];
  lastQtyMap: LastQtyMap;
  onTap: (f: FoodRow, el: HTMLElement) => void;
  onLongPress: (f: FoodRow) => void;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium text-neutral-500 mb-1.5 inline-flex items-center gap-1">
        {label}
      </div>
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
  food: FoodRow;
  last: LastQty | undefined;
  onTap: (f: FoodRow, el: HTMLElement) => void;
  onLongPress: (f: FoodRow) => void;
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
      void onTap(food, ref.current);
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
