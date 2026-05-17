import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Search, Star, Clock, Plus, Pencil, Trash2, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import foodPresets from "@/data/food-presets.json";
import { displayName, type Macro } from "@/lib/foods";
import {
  type CustomFood,
  type FoodCategory,
  kcalFromMacros,
  estimateMacrosFromKcal,
  estimateGramsFromKcal,
} from "@/lib/customFoods";
import { type FoodApiResult } from "@/lib/food-search";
import { useFoodSearch } from "@/hooks/use-food-search";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  QuantitySheet,
  type Pickable,
  type LastQty,
} from "@/components/QuantitySheet";
import { cloudRepository } from "@/lib/repository/cloud";
import { CloudAuthError, type FoodInsert, type FavoriteRow, type FoodRow } from "@/lib/repository/types";
import { resolveFoodId } from "@/lib/foods-resolve";
import { todayKST } from "@/lib/time";
import { inferMealSlot } from "@/lib/foods";

export const Route = createFileRoute("/add")({
  component: AddFoodPage,
});

/* ---------------- types ---------------- */

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

// UX-only localStorage keys (device-local, no cloud)
const RECENT_KEY = "recentFoods";
const SEARCH_HISTORY_KEY = "searchHistory";
const SEARCH_HISTORY_MAX = 8;
const LAST_QTY_KEY = "lastQtyByName";

const CATEGORY_LABELS: { value: FoodCategory; label: string }[] = [
  { value: "rice_grain_noodle", label: "밥·곡류·면 (밥·면·떡·빵)" },
  { value: "meat_fish_egg", label: "고기·생선·계란 (닭·돼지·생선·계란)" },
  { value: "dairy", label: "유제품 (우유·요거트·치즈)" },
  { value: "vegetable_seaweed", label: "채소·해조류 (채소·김·미역)" },
  { value: "fruit", label: "과일 (사과·바나나·딸기)" },
  { value: "snack_dessert", label: "간식·디저트 (과자·시리얼바·초콜릿)" },
  { value: "drink_alcohol", label: "음료·주류 (음료·커피·맥주)" },
  { value: "other", label: "기타·일반식 (가공식품·양념)" },
];

/* ---------------- helpers ---------------- */

/**
 * crypto.randomUUID() requires a secure context (HTTPS or localhost).
 * On LAN IP dev (e.g. 192.168.45.x:8080) it throws — fall back to a
 * timestamp + random suffix.
 */
function safeRandomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      /* fall through */
    }
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function readArr<T = string>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function presetToPickable(p: FoodPreset): Pickable {
  return {
    source: "preset",
    id: p.id,
    name: p.name,
    kcal: p.kcal,
    carb: p.carb,
    protein: p.protein,
    fat: p.fat,
    serving_g: p.serving_g,
    serving_label: `${p.serving_g}g`,
  };
}

function apiToPickable(a: FoodApiResult): Pickable {
  return {
    source: "api",
    id: `api-${a.code}`,
    name: a.name,
    kcal: a.kcal,
    carb: a.carb_g,
    protein: a.protein_g,
    fat: a.fat_g,
    serving_g: a.serving_g,
    serving_label: `${a.serving_g}g`,
    food_code: a.code,
    raw_category: a.category,
  };
}

/**
 * 식약처 GROUP_NAME (FOOD_CAT1_NM) 한국어 텍스트를 우리 FoodCategory enum으로 매핑.
 * 매치 안 되면 "other". 음식 이름까지 fallback으로 검사.
 */
function inferCategory(
  rawCategory: string | undefined,
  foodName: string,
): FoodCategory {
  const blob = `${rawCategory ?? ""} ${foodName}`.toLowerCase();
  if (/도넛|과자|디저트|초콜릿|쿠키|케이크|아이스크림|시리얼바|머핀|와플|파이|빵/.test(blob))
    return "snack_dessert";
  if (/밥|면|국수|쌀|떡|곡류/.test(blob)) return "rice_grain_noodle";
  if (/고기|생선|계란|닭|돼지|소고기|어류|해산물|새우|오징어|참치/.test(blob))
    return "meat_fish_egg";
  if (/우유|요거트|요구르트|치즈|버터|유제품/.test(blob)) return "dairy";
  if (/채소|야채|해조류|김|미역|버섯|샐러드/.test(blob)) return "vegetable_seaweed";
  if (/과일|사과|바나나|딸기|포도|오렌지|배|복숭아/.test(blob)) return "fruit";
  if (/음료|주류|커피|차|맥주|소주|와인|쥬스|콜라|사이다/.test(blob))
    return "drink_alcohol";
  return "other";
}

/**
 * 식약처 API 음식 데이터의 매크로 합 vs 라벨 kcal 일관성 검증.
 * 차이가 20%+ 이거나 매크로 모두 0인데 kcal>0이면 카테고리 기반으로 자동 보정.
 */
function reconcileApiMacros(food: Pickable): {
  carb: number;
  protein: number;
  fat: number;
  is_estimated: boolean;
  category: FoodCategory;
} {
  const category = inferCategory(food.raw_category, food.name);
  if (food.source !== "api" || food.kcal <= 0) {
    return {
      carb: food.carb,
      protein: food.protein,
      fat: food.fat,
      is_estimated: false,
      category,
    };
  }
  const atwater = kcalFromMacros({
    carbs: food.carb,
    protein: food.protein,
    fat: food.fat,
  });
  const diffRatio = Math.abs(atwater - food.kcal) / food.kcal;
  if (diffRatio < 0.2) {
    return {
      carb: food.carb,
      protein: food.protein,
      fat: food.fat,
      is_estimated: false,
      category,
    };
  }
  const est = estimateMacrosFromKcal(food.kcal, category);
  return {
    carb: est.carbs,
    protein: est.protein,
    fat: est.fat,
    is_estimated: true,
    category,
  };
}

function cloudFoodToPickable(f: FoodRow): Pickable {
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

/** FoodRow → CustomFood shape for UI components that expect CustomFood */
function foodRowToCustomFood(f: FoodRow): CustomFood {
  return {
    id: f.id,
    name: f.name,
    serving_unit: (f.serving_unit as CustomFood["serving_unit"]) ?? "g",
    serving_amount: f.serving_amount,
    serving_g: f.serving_g,
    kcal: f.kcal,
    carb_g: f.carb_g,
    protein_g: f.protein_g,
    fat_g: f.fat_g,
    is_estimated: f.is_estimated,
    category: (f.category as FoodCategory) ?? undefined,
    source: f.source === "preset" ? "user" : f.source,
    food_code: f.food_code ?? undefined,
    created_at: new Date(f.created_at).getTime(),
    updated_at: new Date(f.updated_at).getTime(),
  };
}

function customFoodToPickable(c: CustomFood): Pickable {
  const isWeight = c.serving_unit === "g" || c.serving_unit === "ml";
  const label = isWeight
    ? `${c.serving_g}${c.serving_unit}`
    : `${c.serving_amount}${c.serving_unit} (${c.serving_g}g)`;
  return {
    source: "custom",
    id: c.id,
    name: c.name,
    kcal: c.kcal,
    carb: c.carb_g,
    protein: c.protein_g,
    fat: c.fat_g,
    serving_g: c.serving_g,
    serving_label: label,
    is_estimated: c.is_estimated,
  };
}

/* ---------------- page ---------------- */

function AddFoodPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  // Cloud-backed state
  // favorites: Set of food_id (UUID) for O(1) lookup
  const [favFoodIds, setFavFoodIds] = useState<Set<string>>(new Set());
  // user foods from cloud (source='user') — UI 검색/CRUD용
  const [userFoods, setUserFoods] = useState<FoodRow[]>([]);
  // 모든 source의 cloud foods — 즐겨찾기 표시용 (preset/api 즐겨찾기도 보여야 함)
  const [allFoods, setAllFoods] = useState<FoodRow[]>([]);
  // cloud loading state
  const [cloudLoading, setCloudLoading] = useState(false);

  // UX-only (localStorage) state
  const [recents, setRecents] = useState<string[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showAllFavs, setShowAllFavs] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [activeFood, setActiveFood] = useState<Pickable | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<Partial<CustomFood> | null>(null);
  const [actionTarget, setActionTarget] = useState<CustomFood | null>(null);
  const [lastQtyMap, setLastQtyMap] = useState<Record<string, LastQty>>({});

  // Load UX-only localStorage data + cloud data on mount
  useEffect(() => {
    setRecents(readArr<string>(RECENT_KEY));
    setSearchHistory(readArr<string>(SEARCH_HISTORY_KEY));
    try {
      setLastQtyMap(
        JSON.parse(localStorage.getItem(LAST_QTY_KEY) || "{}") as Record<
          string,
          LastQty
        >,
      );
    } catch {
      /* ignore */
    }
    setHydrated(true);

    // Load cloud data
    void loadCloudData();
  }, []);

  // 다른 탭(history 등)에서 즐겨찾기/음식 변경했을 때 add 페이지로 돌아오면 최신화
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void loadCloudData();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCloudData() {
    setCloudLoading(true);
    try {
      const [foods, favs] = await Promise.all([
        cloudRepository.foods.list(),
        cloudRepository.favorites.list(),
      ]);
      // user-registered foods only (not api-auto-saved presets shown in search)
      setUserFoods(foods.filter((f) => f.source === "user"));
      // 모든 source 보관 — preset/api 즐겨찾기 표시에 필요
      setAllFoods(foods);
      setFavFoodIds(new Set(favs.map((f: FavoriteRow) => f.food_id)));
    } catch (e) {
      if (e instanceof CloudAuthError) {
        toast.error("로그인이 필요해요");
      } else {
        toast.error(`데이터 로드 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      setCloudLoading(false);
    }
  }

  // 검색어 1초 이상 유지되면 최근 검색에 push (디바운스, dedupe, 최대 8개)
  useEffect(() => {
    if (!hydrated) return;
    const q = query.trim();
    if (q.length < 1) return;
    const t = setTimeout(() => {
      setSearchHistory((prev) => {
        const next = [q, ...prev.filter((x) => x !== q)].slice(0, SEARCH_HISTORY_MAX);
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
        return next;
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [query, hydrated]);

  function removeSearchHistory(q: string) {
    const next = searchHistory.filter((x) => x !== q);
    setSearchHistory(next);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
  }

  async function toggleFav(foodId: string) {
    const isFav = favFoodIds.has(foodId);
    // Optimistic update
    const next = new Set(favFoodIds);
    if (isFav) next.delete(foodId);
    else next.add(foodId);
    setFavFoodIds(next);

    try {
      if (isFav) {
        await cloudRepository.favorites.remove(foodId);
      } else {
        await cloudRepository.favorites.add(foodId);
      }
    } catch (e) {
      // Revert optimistic update
      setFavFoodIds(favFoodIds);
      if (e instanceof CloudAuthError) {
        toast.error("로그인이 필요해요");
      } else {
        toast.error("즐겨찾기 변경 실패");
      }
    }
  }

  /**
   * preset/api 음식의 즐겨찾기 토글: food_code로 cloud에서 food_id 확보 후 토글
   */
  async function toggleFavForPickable(food: Pickable) {
    if (food.source === "custom") {
      // cloud food_id = food.id (UUID)
      await toggleFav(food.id);
      return;
    }

    // preset or api: food_code로 cloud에서 food row 확보
    const food_code = food.food_code ?? food.id;
    const insert: FoodInsert = {
      source: food.source === "api" ? "api" : "preset",
      food_code,
      name: food.name,
      serving_unit: "g",
      serving_amount: food.serving_g,
      serving_g: food.serving_g,
      kcal: food.kcal,
      carb_g: food.carb,
      protein_g: food.protein,
      fat_g: food.fat,
      category: null,
      is_estimated: false,
    };
    try {
      const resolvedId = await resolveFoodId({
        source: food.source as "preset" | "api",
        food_code,
        insert,
      });
      await toggleFav(resolvedId);
    } catch (e) {
      if (e instanceof CloudAuthError) {
        toast.error("로그인이 필요해요");
      } else {
        toast.error("즐겨찾기 변경 실패");
      }
    }
  }

  const q = query.trim().toLowerCase();

  // search-results mode = 1+ chars
  const inSearch = q.length >= 1;

  const customMatches = useMemo(() => {
    if (!inSearch) return [];
    return userFoods
      .filter((f) => f.name.toLowerCase().includes(q))
      .map(foodRowToCustomFood);
  }, [userFoods, q, inSearch]);

  const presetMatches = useMemo(() => {
    if (!inSearch) return PRESETS;
    const customNames = new Set(customMatches.map((c) => c.name.toLowerCase()));
    return PRESETS.filter(
      (p) => p.name.toLowerCase().includes(q) && !customNames.has(p.name.toLowerCase()),
    );
  }, [q, inSearch, customMatches]);

  // External API (식약처) — debounced + 24h cached + pagination (loadMore)
  const {
    results: apiResults,
    loading: apiLoading,
    loadingMore: apiLoadingMore,
    error: apiError,
    hasMore: apiHasMore,
    loadMore: apiLoadMore,
  } = useFoodSearch(query);

  const apiMatches = useMemo<FoodApiResult[]>(() => {
    if (!inSearch) return [];
    const seen = new Set<string>([
      ...customMatches.map((c) => c.name.toLowerCase()),
      ...presetMatches.map((p) => p.name.toLowerCase()),
    ]);
    const out: FoodApiResult[] = [];
    for (const a of apiResults) {
      const k = a.name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(a);
    }
    return out;
  }, [apiResults, customMatches, presetMatches, inSearch]);

  // 즐겨찾기 목록: 모든 source(user/preset/api) 통합
  // history 탭이나 add 검색에서 토글한 preset/api 즐겨찾기도 함께 표시
  const favUserFoods = useMemo(
    () => allFoods.filter((f) => favFoodIds.has(f.id)),
    [allFoods, favFoodIds],
  );

  // Recent list from localStorage (UX-only, preset ids or cloud food UUIDs)
  const recentList = useMemo(() => {
    if (!hydrated) return [];
    return recents
      .slice(0, 10)
      .map((id) => {
        // Check presets first
        const p = PRESETS.find((x) => x.id === id);
        if (p) return { type: "preset" as const, data: p };
        // Check user foods
        const f = userFoods.find((x) => x.id === id);
        if (f) return { type: "user" as const, data: f };
        return null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [recents, hydrated, userFoods]);

  // "내가 등록한 음식" — user source only, sorted by created_at desc
  const sortedUserFoods = useMemo(
    () =>
      [...userFoods].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [userFoods],
  );

  /* ---------------- add to today ---------------- */

  async function handleAdd(
    food: Pickable,
    mode: "serving" | "gram",
    qty: number,
    saveAsBase: boolean = false,
  ) {
    const reconciled = reconcileApiMacros(food);

    const mult = mode === "serving" ? qty : qty / food.serving_g;
    const carbG = Math.round(reconciled.carb * mult * 10) / 10;
    const proteinG = Math.round(reconciled.protein * mult * 10) / 10;
    const fatG = Math.round(reconciled.fat * mult * 10) / 10;
    const kcal = Math.round(
      carbG * 4 + proteinG * 4 + fatG * 9,
    );
    const grams = mode === "gram" ? qty : Math.round(food.serving_g * qty);
    const now = Date.now();
    const loggedDate = todayKST();
    const mealSlot = inferMealSlot(now);

    try {
      let foodId: string;

      if (food.source === "custom") {
        // Already a cloud UUID
        foodId = food.id;

        // saveAsBase: update serving_g in cloud
        if (saveAsBase) {
          const target = userFoods.find((f) => f.id === food.id);
          if (!target) {
            toast.error("기준 저장 실패: 음식을 찾지 못했어요");
          } else if (target.serving_g <= 0) {
            toast.error("기준 저장 실패: 현재 1인분 값이 비정상이에요");
          } else {
            const newServingG = mode === "gram" ? qty : qty * target.serving_g;
            if (newServingG > 0) {
              const ratio = newServingG / target.serving_g;
              try {
                await cloudRepository.foods.update(food.id, {
                  serving_g: newServingG,
                  serving_amount: newServingG,
                  serving_unit: "g",
                  kcal: Math.round(target.kcal * ratio),
                  carb_g: Math.round(target.carb_g * ratio * 10) / 10,
                  protein_g: Math.round(target.protein_g * ratio * 10) / 10,
                  fat_g: Math.round(target.fat_g * ratio * 10) / 10,
                });
                // await로 변경 — UI 갱신 보장 (이후 foodLogs.create 전에 완료)
                await loadCloudData();
                toast.success(`${newServingG}g을 1인분 기준으로 저장했어요`);
              } catch (e) {
                if (e instanceof CloudAuthError) {
                  toast.error("로그인이 필요해요");
                } else {
                  toast.error(`기준 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
                }
              }
            }
          }
        }
      } else if (food.source === "preset") {
        const insert: FoodInsert = {
          source: "preset",
          food_code: food.id,
          name: food.name,
          serving_unit: "g",
          serving_amount: food.serving_g,
          serving_g: food.serving_g,
          kcal: food.kcal,
          carb_g: food.carb,
          protein_g: food.protein,
          fat_g: food.fat,
          category: null,
          is_estimated: false,
        };
        foodId = await resolveFoodId({ source: "preset", food_code: food.id, insert });
      } else {
        // api source
        const food_code = food.food_code ?? food.id;
        const insert: FoodInsert = {
          source: "api",
          food_code,
          name: food.name,
          serving_unit: "g",
          serving_amount: food.serving_g,
          serving_g: food.serving_g,
          kcal: food.kcal,
          carb_g: reconciled.carb,
          protein_g: reconciled.protein,
          fat_g: reconciled.fat,
          category: reconciled.category,
          is_estimated: reconciled.is_estimated,
        };
        foodId = await resolveFoodId({ source: "api", food_code, insert });
        if (reconciled.is_estimated) {
          toast(`${displayName(food.name)} 탄단지 자동 추정`, {
            description: "라벨 칼로리와 매크로 합이 안 맞아 카테고리 기준으로 보정했어요",
          });
        }

        // saveAsBase: api 음식도 1인분 기준 cloud 갱신 (custom 분기와 동일 패턴)
        if (saveAsBase && food.serving_g > 0) {
          const newServingG = mode === "gram" ? qty : qty * food.serving_g;
          if (newServingG > 0) {
            const ratio = newServingG / food.serving_g;
            try {
              await cloudRepository.foods.update(foodId, {
                serving_g: newServingG,
                serving_amount: newServingG,
                serving_unit: "g",
                kcal: Math.round(food.kcal * ratio),
                carb_g: Math.round(reconciled.carb * ratio * 10) / 10,
                protein_g: Math.round(reconciled.protein * ratio * 10) / 10,
                fat_g: Math.round(reconciled.fat * ratio * 10) / 10,
              });
              await loadCloudData();
              toast.success(`${newServingG}g을 1인분 기준으로 저장했어요`);
            } catch (e) {
              if (e instanceof CloudAuthError) {
                toast.error("로그인이 필요해요");
              } else {
                toast.error(`기준 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
          }
        }
      }

      await cloudRepository.foodLogs.create({
        food_id: foodId,
        logged_date: loggedDate,
        meal_slot: mealSlot,
        grams,
        kcal,
        carb_g: carbG,
        protein_g: proteinG,
        fat_g: fatG,
      });

      // Update recents (UX-only localStorage)
      const effectiveId = food.source === "custom" ? food.id : food.id;
      const nextRecent = [effectiveId, ...recents.filter((x) => x !== effectiveId)].slice(0, 10);
      localStorage.setItem(RECENT_KEY, JSON.stringify(nextRecent));
      setRecents(nextRecent);

      // Persist lastQty (UX-only localStorage)
      const lastQtyToPersist =
        saveAsBase && food.source === "custom"
          ? { qty: 1, mode: "serving" as const }
          : { qty, mode };
      try {
        const raw = JSON.parse(localStorage.getItem(LAST_QTY_KEY) || "{}");
        const next = { ...raw, [food.name]: lastQtyToPersist };
        localStorage.setItem(LAST_QTY_KEY, JSON.stringify(next));
      } catch {
        localStorage.setItem(LAST_QTY_KEY, JSON.stringify({ [food.name]: lastQtyToPersist }));
      }

      toast(`${displayName(food.name)} 추가됨`);
      navigate({ to: "/" });
    } catch (e) {
      if (e instanceof CloudAuthError) {
        toast.error("로그인이 필요해요");
      } else {
        toast.error(`추가 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  /* ---------------- form save ---------------- */

  async function handleFormSave(food: CustomFood) {
    try {
      const existingRow = userFoods.find((f) => f.id === food.id);

      if (existingRow) {
        // Edit: update in cloud
        await cloudRepository.foods.update(food.id, {
          name: food.name,
          serving_unit: food.serving_unit,
          serving_amount: food.serving_amount,
          serving_g: food.serving_g,
          kcal: food.kcal,
          carb_g: food.carb_g,
          protein_g: food.protein_g,
          fat_g: food.fat_g,
          is_estimated: food.is_estimated,
          category: food.category ?? null,
        });
        setUserFoods((prev) =>
          prev.map((f) =>
            f.id === food.id
              ? {
                  ...f,
                  name: food.name,
                  serving_unit: food.serving_unit,
                  serving_amount: food.serving_amount,
                  serving_g: food.serving_g,
                  kcal: food.kcal,
                  carb_g: food.carb_g,
                  protein_g: food.protein_g,
                  fat_g: food.fat_g,
                  is_estimated: food.is_estimated,
                  category: food.category ?? null,
                }
              : f,
          ),
        );
      } else {
        // New: insert into cloud
        const insert: FoodInsert = {
          source: "user",
          food_code: null,
          name: food.name,
          serving_unit: food.serving_unit,
          serving_amount: food.serving_amount,
          serving_g: food.serving_g,
          kcal: food.kcal,
          carb_g: food.carb_g,
          protein_g: food.protein_g,
          fat_g: food.fat_g,
          is_estimated: food.is_estimated,
          category: food.category ?? null,
        };
        const created = await cloudRepository.foods.create(insert);
        setUserFoods((prev) => [created, ...prev]);
        // Update food.id to cloud UUID for the quantity sheet below
        food = { ...food, id: created.id };
      }

      setFormOpen(false);
      setFormInitial(null);
      // Continuous flow: open quantity sheet right after
      setActiveFood(customFoodToPickable(food));
    } catch (e) {
      if (e instanceof CloudAuthError) {
        toast.error("로그인이 필요해요");
      } else {
        toast.error(`저장 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  /* ---------------- delete with undo ---------------- */

  async function handleDelete(food: CustomFood) {
    const prevFoods = [...userFoods];
    // Optimistic remove
    setUserFoods((prev) => prev.filter((f) => f.id !== food.id));
    const wasFav = favFoodIds.has(food.id);
    if (wasFav) {
      const next = new Set(favFoodIds);
      next.delete(food.id);
      setFavFoodIds(next);
    }
    setActionTarget(null);

    try {
      await cloudRepository.foods.remove(food.id);
    } catch (e) {
      // Revert
      setUserFoods(prevFoods);
      if (wasFav) setFavFoodIds((prev) => new Set([...prev, food.id]));
      if (e instanceof CloudAuthError) {
        toast.error("로그인이 필요해요");
      } else {
        toast.error(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }

    toast("삭제했어요", {
      duration: 5000,
      action: {
        label: "되돌리기",
        onClick: async () => {
          try {
            // Re-create the food
            const insert: FoodInsert = {
              source: "user",
              food_code: null,
              name: food.name,
              serving_unit: food.serving_unit,
              serving_amount: food.serving_amount,
              serving_g: food.serving_g,
              kcal: food.kcal,
              carb_g: food.carb_g,
              protein_g: food.protein_g,
              fat_g: food.fat_g,
              is_estimated: food.is_estimated,
              category: food.category ?? null,
            };
            const restored = await cloudRepository.foods.create(insert);
            setUserFoods((prev) => [restored, ...prev]);
            if (wasFav) {
              await cloudRepository.favorites.add(restored.id);
              setFavFoodIds((prev) => new Set([...prev, restored.id]));
            }
          } catch {
            toast.error("되돌리기 실패");
          }
        },
      },
    });
  }

  /* ---------------- render ---------------- */

  // For favorites grid display: use favUserFoods as CustomFood[]
  const favCustomFoods = useMemo(
    () => favUserFoods.map(foodRowToCustomFood),
    [favUserFoods],
  );

  return (
    <div className="min-h-screen w-full bg-white flex justify-center">
      <main className="w-full max-w-[375px] flex flex-col pb-10">
        <header className="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 pt-4 pb-3 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate({ to: "/" })}
              className="p-2 -ml-2 rounded-full hover:bg-neutral-100"
              aria-label="뒤로"
            >
              <ArrowLeft className="w-5 h-5 text-neutral-700" />
            </button>
            <h1 className="text-base font-semibold text-neutral-900">음식 추가</h1>
          </div>
          <div className="mt-3 relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="음식 이름을 검색해보세요"
              className="w-full h-10 pl-9 pr-3 rounded-xl bg-neutral-100 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-300"
            />
          </div>
        </header>

        <div className="px-4 py-4 space-y-6">
          {!inSearch && (
            <>
              <DirectRegisterCard
                onClick={() => {
                  setFormInitial({});
                  setFormOpen(true);
                }}
              />

              {hydrated && searchHistory.length > 0 && (
                <Section
                  title={
                    <>
                      <Search className="w-3.5 h-3.5 text-neutral-500" strokeWidth={2.4} />
                      최근 검색
                    </>
                  }
                >
                  <div className="flex flex-wrap gap-2">
                    {searchHistory.map((q) => (
                      <span
                        key={q}
                        className="inline-flex items-center gap-0.5 rounded-full border border-neutral-100 bg-neutral-50 pl-2.5 pr-0.5 py-0.5 text-[11px] text-neutral-600"
                      >
                        <button
                          type="button"
                          onClick={() => setQuery(q)}
                          className="active:scale-95"
                        >
                          {q}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSearchHistory(q)}
                          aria-label="검색 기록 삭제"
                          className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 text-[10px]"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {sortedUserFoods.length > 0 && (
                <Section title="내가 등록한 음식">
                  <CustomFoodGrid
                    foods={sortedUserFoods.map(foodRowToCustomFood)}
                    favFoodIds={favFoodIds}
                    onToggleFav={(id) => void toggleFav(id)}
                    onPick={(c) => setActiveFood(customFoodToPickable(c))}
                    onLongPress={(c) => setActionTarget(c)}
                  />
                </Section>
              )}

              {favCustomFoods.length > 0 && (
                <Section
                  title={
                    <>
                      <Star className="w-3.5 h-3.5 text-neutral-500" strokeWidth={2.4} />
                      즐겨찾기
                    </>
                  }
                >
                  <FoodGrid
                    foods={showAllFavs ? favCustomFoods : favCustomFoods.slice(0, 10)}
                    favFoodIds={favFoodIds}
                    onToggleFav={(id) => void toggleFav(id)}
                    onPick={(c) => setActiveFood(customFoodToPickable(c))}
                  />
                  {favCustomFoods.length > 10 && (
                    <button
                      type="button"
                      onClick={() => setShowAllFavs((v) => !v)}
                      className="mt-2 w-full h-9 rounded-lg border border-neutral-200 bg-white text-xs font-medium text-neutral-600 active:scale-[0.98]"
                    >
                      {showAllFavs ? "접기" : `더 보기 (${favCustomFoods.length - 10}개 더)`}
                    </button>
                  )}
                </Section>
              )}

              {recentList.length > 0 && (
                <Section
                  title={
                    <>
                      <Clock className="w-3.5 h-3.5 text-neutral-500" strokeWidth={2.4} />
                      최근 사용
                    </>
                  }
                >
                  <div className="grid grid-cols-2 gap-2">
                    {recentList.map((item) => {
                      if (item.type === "preset") {
                        const p = item.data as FoodPreset;
                        return (
                          <PresetCard
                            key={p.id}
                            food={p}
                            isFav={false}
                            onToggleFav={() => void toggleFavForPickable(presetToPickable(p))}
                            onPick={() => setActiveFood(presetToPickable(p))}
                          />
                        );
                      }
                      const f = item.data as FoodRow;
                      const c = foodRowToCustomFood(f);
                      return (
                        <CustomFoodCard
                          key={f.id}
                          food={c}
                          isFav={favFoodIds.has(f.id)}
                          onToggleFav={() => void toggleFav(f.id)}
                          onPick={() => setActiveFood(customFoodToPickable(c))}
                          onLongPress={() => setActionTarget(c)}
                        />
                      );
                    })}
                  </div>
                </Section>
              )}

              {cloudLoading && (
                <p className="text-[11px] text-neutral-400 text-center">불러오는 중…</p>
              )}
            </>
          )}

          {inSearch && (
            <Section title="검색 결과">
              {(customMatches.length > 0 ||
                presetMatches.length > 0 ||
                apiMatches.length > 0) && (
                <div className="grid grid-cols-2 gap-2">
                  {customMatches.map((c) => (
                    <CustomFoodCard
                      key={c.id}
                      food={c}
                      isFav={favFoodIds.has(c.id)}
                      onToggleFav={() => void toggleFav(c.id)}
                      onPick={() => setActiveFood(customFoodToPickable(c))}
                      onLongPress={() => setActionTarget(c)}
                    />
                  ))}
                  {presetMatches.map((p) => (
                    <PresetCard
                      key={p.id}
                      food={p}
                      isFav={false}
                      onToggleFav={() => void toggleFavForPickable(presetToPickable(p))}
                      onPick={() => setActiveFood(presetToPickable(p))}
                    />
                  ))}
                  {apiMatches.map((a) => (
                    <button
                      key={`api-${a.code}`}
                      onClick={() => setActiveFood(apiToPickable(a))}
                      className="rounded-xl border border-neutral-200 bg-white p-3 text-left transition active:scale-[0.98] hover:border-neutral-300"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-sm font-semibold text-neutral-900 line-clamp-2">
                          {a.name}
                        </span>
                        <span className="text-[10px] text-neutral-400 px-1 py-0.5 rounded bg-neutral-100 shrink-0">
                          식약처
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {Math.round(a.kcal)} kcal · {a.serving_g}g
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {apiLoading && (
                <p className="text-[11px] text-neutral-400 mt-2 text-center">
                  외부 검색 중…
                </p>
              )}
              {apiError && !apiLoading && apiMatches.length === 0 && (
                <p className="text-[11px] text-amber-600 mt-2 text-center">
                  외부 검색 실패 ({apiError})
                </p>
              )}
              {apiHasMore && (
                <button
                  type="button"
                  onClick={apiLoadMore}
                  disabled={apiLoadingMore}
                  className="mt-2 w-full h-9 rounded-lg border border-neutral-200 bg-white text-xs font-medium text-neutral-600 active:scale-[0.98] disabled:opacity-50"
                >
                  {apiLoadingMore ? "불러오는 중…" : "더 보기"}
                </button>
              )}
              <button
                onClick={() => {
                  setFormInitial({ name: query.trim() });
                  setFormOpen(true);
                }}
                className="mt-3 w-full rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-left transition active:scale-[0.98] hover:border-neutral-400"
              >
                <div className="text-sm text-neutral-500">찾는 음식이 없나요?</div>
                <div className="mt-0.5 inline-flex items-center gap-1 text-sm font-semibold text-neutral-900">
                  <Plus className="w-4 h-4" />
                  직접 등록
                </div>
              </button>
            </Section>
          )}
        </div>
      </main>

      {activeFood && (
        <QuantitySheet
          food={activeFood}
          last={lastQtyMap[activeFood.name]}
          onClose={() => setActiveFood(null)}
          onAdd={(mode, qty, saveAsBase) =>
            void handleAdd(activeFood, mode, qty, saveAsBase)
          }
        />
      )}

      <CustomFoodFormSheet
        open={formOpen}
        initial={formInitial}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setFormInitial(null);
        }}
        onSave={(food) => void handleFormSave(food)}
      />

      {actionTarget && (
        <ActionSheet
          food={actionTarget}
          onClose={() => setActionTarget(null)}
          onEdit={() => {
            setFormInitial(actionTarget);
            setActionTarget(null);
            setFormOpen(true);
          }}
          onDelete={() => void handleDelete(actionTarget)}
        />
      )}
    </div>
  );
}

/* ---------------- small UI pieces ---------------- */

function Section({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-800 mb-2 inline-flex items-center gap-1.5">
        {title}
      </h2>
      {children}
    </section>
  );
}

function DirectRegisterCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-left transition active:scale-[0.98] hover:border-neutral-400 flex items-center gap-3"
    >
      <div className="w-9 h-9 rounded-full bg-neutral-100 flex items-center justify-center">
        <Plus className="w-5 h-5 text-neutral-700" />
      </div>
      <div>
        <div className="text-sm font-semibold text-neutral-900">직접 등록</div>
        <div className="text-xs text-neutral-500 mt-0.5">
          목록에 없는 음식을 직접 추가해요
        </div>
      </div>
    </button>
  );
}

function FoodGrid({
  foods,
  favFoodIds,
  onToggleFav,
  onPick,
}: {
  foods: CustomFood[];
  favFoodIds: Set<string>;
  onToggleFav: (id: string) => void;
  onPick: (f: CustomFood) => void;
}) {
  if (foods.length === 0) {
    return <p className="text-xs text-neutral-400">결과가 없어요</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {foods.map((f) => (
        <CustomFoodCard
          key={f.id}
          food={f}
          isFav={favFoodIds.has(f.id)}
          onToggleFav={() => onToggleFav(f.id)}
          onPick={() => onPick(f)}
          onLongPress={() => {/* favorites grid doesn't need long-press actions */}}
        />
      ))}
    </div>
  );
}

function PresetCard({
  food,
  isFav,
  onToggleFav,
  onPick,
}: {
  food: FoodPreset;
  isFav: boolean;
  onToggleFav: () => void;
  onPick: () => void;
}) {
  return (
    <div className="relative rounded-xl border border-neutral-200 bg-white p-3 transition active:scale-95 hover:border-neutral-300">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFav();
        }}
        className="absolute top-2 right-2 p-1 rounded-full hover:bg-neutral-100"
        aria-label="즐겨찾기"
      >
        <Star
          className="w-4 h-4"
          fill={isFav ? "#FFD700" : "none"}
          stroke={isFav ? "#FFD700" : "#9ca3af"}
        />
      </button>
      <button onClick={onPick} className="text-left w-full pr-6">
        <div className="text-sm font-bold text-neutral-900 leading-tight">
          {food.name}
        </div>
        <div className="text-xs text-neutral-400 mt-1">{food.kcal} kcal</div>
      </button>
    </div>
  );
}

function CustomFoodGrid({
  foods,
  favFoodIds,
  onToggleFav,
  onPick,
  onLongPress,
}: {
  foods: CustomFood[];
  favFoodIds: Set<string>;
  onToggleFav: (id: string) => void;
  onPick: (f: CustomFood) => void;
  onLongPress: (f: CustomFood) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1 scrollbar-none">
      {foods.map((f) => (
        <div key={f.id} className="shrink-0 w-[180px]">
          <CustomFoodCard
            food={f}
            isFav={favFoodIds.has(f.id)}
            onToggleFav={() => onToggleFav(f.id)}
            onPick={() => onPick(f)}
            onLongPress={() => onLongPress(f)}
          />
        </div>
      ))}
    </div>
  );
}

function CustomFoodCard({
  food,
  isFav,
  onToggleFav,
  onPick,
  onLongPress,
}: {
  food: CustomFood;
  isFav: boolean;
  onToggleFav: () => void;
  onPick: () => void;
  onLongPress: () => void;
}) {
  const isWeight = food.serving_unit === "g" || food.serving_unit === "ml";
  const servingLabel = isWeight
    ? `${food.serving_g}${food.serving_unit}`
    : `${food.serving_amount}${food.serving_unit} (${food.serving_g}g)`;

  return (
    <div className="relative rounded-xl border border-neutral-200 bg-white p-3 transition active:scale-95 hover:border-neutral-300">
      <div className="absolute top-2 right-2 flex items-center gap-0.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFav();
          }}
          className="p-1 rounded-full hover:bg-neutral-100"
          aria-label="즐겨찾기"
        >
          <Star
            className="w-4 h-4"
            fill={isFav ? "#FFD700" : "none"}
            stroke={isFav ? "#FFD700" : "#9ca3af"}
          />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onLongPress();
          }}
          className="p-1 rounded-full hover:bg-neutral-100"
          aria-label="편집 / 삭제"
        >
          <MoreVertical className="w-4 h-4 text-neutral-400" />
        </button>
      </div>
      <button
        onClick={onPick}
        className="text-left w-full pr-14"
      >
        <div className="text-[14px] font-bold text-neutral-900 leading-tight">
          {food.name}
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-[12px] text-neutral-500">{food.kcal} kcal</span>
          {food.is_estimated && (
            <span className="text-[10px] px-1.5 py-px rounded-full bg-neutral-100 text-neutral-500">
              추정
            </span>
          )}
        </div>
        <div className="text-[11px] text-neutral-400 mt-0.5">{servingLabel}</div>
      </button>
    </div>
  );
}

/* ---------------- Action sheet (long-press) ---------------- */

function ActionSheet({
  food,
  onClose,
  onEdit,
  onDelete,
}: {
  food: CustomFood;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-[375px] rounded-t-2xl bg-white p-3 pb-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200" />
        <div className="px-3 py-2 text-xs text-neutral-500">{food.name}</div>
        <button
          onClick={onEdit}
          className="w-full px-3 py-3 flex items-center gap-3 rounded-lg hover:bg-neutral-50 text-left"
        >
          <Pencil className="w-4 h-4 text-neutral-600" />
          <span className="text-sm text-neutral-900">편집</span>
        </button>
        <button
          onClick={onDelete}
          className="w-full px-3 py-3 flex items-center gap-3 rounded-lg hover:bg-neutral-50 text-left"
        >
          <Trash2 className="w-4 h-4 text-red-500" />
          <span className="text-sm text-red-600">삭제</span>
        </button>
      </div>
    </div>
  );
}

/* ---------------- Form sheet ---------------- */

type Unit = CustomFood["serving_unit"];
const UNITS: Unit[] = ["개", "봉", "잔", "조각", "g", "ml"];

type FormMode = "estimate" | "manual";

function CustomFoodFormSheet({
  open,
  initial,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  initial: Partial<CustomFood> | null;
  onOpenChange: (o: boolean) => void;
  onSave: (f: CustomFood) => void;
}) {
  const [mode, setMode] = useState<FormMode>("manual");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<Unit>("개");
  const [amount, setAmount] = useState("1");
  const [gramConv, setGramConv] = useState("");
  const [kcal, setKcal] = useState("");
  const [carb, setCarb] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [category, setCategory] = useState<FoodCategory>("other");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [isEstimated, setIsEstimated] = useState(false);
  const [switchConfirm, setSwitchConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("manual");
    setName(initial?.name ?? "");
    setUnit((initial?.serving_unit as Unit) ?? "개");
    setAmount(initial?.serving_amount ? String(initial.serving_amount) : "1");
    setGramConv(initial?.serving_g ? String(initial.serving_g) : "");
    setKcal(initial?.kcal ? String(initial.kcal) : "");
    setCarb(initial?.carb_g ? String(initial.carb_g) : "");
    setProtein(initial?.protein_g ? String(initial.protein_g) : "");
    setFat(initial?.fat_g ? String(initial.fat_g) : "");
    setCategory(initial?.category ?? "other");
    setCategoryOpen(!!initial?.category && initial?.category !== "other");
    setIsEstimated(initial?.is_estimated ?? false);
    setSwitchConfirm(false);
  }, [open, initial]);

  const isWeightUnit = unit === "g" || unit === "ml";
  const carbN = parseFloat(carb);
  const proteinN = parseFloat(protein);
  const fatN = parseFloat(fat);
  const kcalN = parseFloat(kcal);
  const amountN = parseFloat(amount);
  const gramConvN = parseFloat(gramConv);

  const kcalFilled = !Number.isNaN(kcalN) && kcalN > 0;
  const allMacrosFilled =
    !Number.isNaN(carbN) && !Number.isNaN(proteinN) && !Number.isNaN(fatN);
  const macrosEmpty = !carb && !protein && !fat;
  const servingG = isWeightUnit ? amountN : gramConvN;
  const servingGValid = !Number.isNaN(servingG) && servingG > 0;

  const estimateMacros = useMemo(() => {
    if (mode !== "estimate" || !kcalFilled) return null;
    return estimateMacrosFromKcal(kcalN, category);
  }, [mode, kcalFilled, kcalN, category]);

  const atwaterNotice = useMemo(() => {
    if (mode !== "manual" || !kcalFilled || !allMacrosFilled) return null;
    const atwater = kcalFromMacros({
      carbs: carbN,
      protein: proteinN,
      fat: fatN,
    });
    const kcalUser = Math.round(kcalN);
    const diff = Math.abs(kcalUser - atwater);
    if (kcalUser === 0 || diff / kcalUser <= 0.05) return null;
    return { atwater, diff };
  }, [mode, kcalFilled, allMacrosFilled, kcalN, carbN, proteinN, fatN]);

  const previewEffectiveKcal = kcalFilled
    ? kcalN
    : allMacrosFilled
      ? kcalFromMacros({ carbs: carbN, protein: proteinN, fat: fatN })
      : 0;
  const previewMacros =
    macrosEmpty && kcalFilled
      ? estimateMacrosFromKcal(kcalN, category)
      : null;
  const previewKcal =
    !kcalFilled && allMacrosFilled ? previewEffectiveKcal : null;
  const previewGrams =
    !servingGValid && previewEffectiveKcal > 0
      ? estimateGramsFromKcal(previewEffectiveKcal, category)
      : null;

  const canSave = (() => {
    const base = name.trim().length > 0 && !Number.isNaN(amountN) && amountN > 0;
    if (!base) return false;
    if (mode === "estimate") return kcalFilled && !!category && servingGValid;
    return kcalFilled || allMacrosFilled;
  })();

  function switchToManual() {
    if (mode === "estimate" && estimateMacros) {
      setCarb(String(estimateMacros.carbs));
      setProtein(String(estimateMacros.protein));
      setFat(String(estimateMacros.fat));
    }
    setMode("manual");
  }

  function requestSwitchToEstimate() {
    if (!macrosEmpty) {
      setSwitchConfirm(true);
      return;
    }
    setMode("estimate");
  }

  function confirmSwitchToEstimate() {
    setCarb("");
    setProtein("");
    setFat("");
    setIsEstimated(false);
    setSwitchConfirm(false);
    setMode("estimate");
  }

  function handleAutoCalcKcal() {
    if (!allMacrosFilled) {
      toast("탄단지 g를 먼저 입력하세요");
      return;
    }
    const k = kcalFromMacros({ carbs: carbN, protein: proteinN, fat: fatN });
    setKcal(String(k));
  }

  function handleEstimateMacros() {
    if (!kcalFilled) return;
    const m = estimateMacrosFromKcal(kcalN, category);
    setCarb(String(m.carbs));
    setProtein(String(m.protein));
    setFat(String(m.fat));
    setIsEstimated(true);
  }

  function handleManualMacroChange(
    key: "carb" | "protein" | "fat",
    value: string,
  ) {
    const setters = { carb: setCarb, protein: setProtein, fat: setFat };
    setters[key](value);
    if (isEstimated) setIsEstimated(false);
  }

  // suppress unused variable warnings for functions used only via UI
  void switchToManual;
  void requestSwitchToEstimate;
  void confirmSwitchToEstimate;
  void handleAutoCalcKcal;
  void handleEstimateMacros;
  void switchConfirm;

  function handleSubmit() {
    if (!canSave) return;

    let finalCarb: number;
    let finalProtein: number;
    let finalFat: number;
    let finalKcal: number;
    let finalIsEstimated: boolean;
    let finalCategory: FoodCategory | undefined;

    if (mode === "estimate") {
      const m = estimateMacros ?? estimateMacrosFromKcal(kcalN, category);
      finalCarb = m.carbs;
      finalProtein = m.protein;
      finalFat = m.fat;
      finalKcal = Math.round(kcalN);
      finalIsEstimated = true;
      finalCategory = category;
    } else {
      if (macrosEmpty && kcalFilled) {
        const m = estimateMacrosFromKcal(kcalN, category || "other");
        finalCarb = m.carbs;
        finalProtein = m.protein;
        finalFat = m.fat;
        finalIsEstimated = true;
        finalCategory = category || "other";
      } else {
        finalCarb = Number.isNaN(carbN) ? 0 : carbN;
        finalProtein = Number.isNaN(proteinN) ? 0 : proteinN;
        finalFat = Number.isNaN(fatN) ? 0 : fatN;
        finalIsEstimated = isEstimated;
        finalCategory = categoryOpen ? category : initial?.category;
      }
      finalKcal = kcalFilled
        ? Math.round(kcalN)
        : kcalFromMacros({
            carbs: finalCarb,
            protein: finalProtein,
            fat: finalFat,
          });
    }

    const fallbackCategory: FoodCategory = finalCategory ?? category ?? "other";
    const resolvedServingG = servingGValid
      ? servingG
      : finalKcal > 0
        ? estimateGramsFromKcal(finalKcal, fallbackCategory)
        : finalCarb + finalProtein + finalFat;

    const food: CustomFood = {
      id: initial?.id ?? safeRandomId(),
      name: name.trim(),
      serving_unit: unit,
      serving_amount: amountN,
      serving_g: resolvedServingG,
      kcal: finalKcal,
      carb_g: finalCarb,
      protein_g: finalProtein,
      fat_g: finalFat,
      is_estimated: finalIsEstimated,
      category: finalCategory,
      created_at: initial?.created_at ?? Date.now(),
      updated_at: Date.now(),
    };
    onSave(food);
  }

  const carbShown =
    mode === "estimate" ? (estimateMacros ? String(estimateMacros.carbs) : "") : carb;
  const proteinShown =
    mode === "estimate" ? (estimateMacros ? String(estimateMacros.protein) : "") : protein;
  const fatShown =
    mode === "estimate" ? (estimateMacros ? String(estimateMacros.fat) : "") : fat;

  const showEstimateMacrosBtn =
    mode === "manual" && kcalFilled && !!category && categoryOpen && macrosEmpty;
  void showEstimateMacrosBtn;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[92vh] overflow-y-auto rounded-t-2xl p-0"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle className="text-base">
            {initial?.id ? "음식 편집" : "직접 등록"}
          </SheetTitle>
        </SheetHeader>

        <div className="px-5 py-4 space-y-4">
          <Field label="음식 이름" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 닭가슴살 샐러드"
              className="w-full h-11 px-3 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300"
            />
          </Field>

          <Field label="1회 제공량" required>
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min={0}
                className="flex-1 h-11 px-3 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as Unit)}
                className="w-24 h-11 px-2 rounded-xl border border-neutral-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-300"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            {!isWeightUnit && (
              <div className="mt-2">
                <label className="text-xs text-neutral-500 block mb-1">
                  그램 환산 (g) <span className="text-neutral-400 text-[11px] font-normal">선택</span>
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={gramConv}
                  onChange={(e) => setGramConv(e.target.value)}
                  placeholder={previewGrams != null ? `≈ ${previewGrams}` : "예: 40"}
                  min={0}
                  className={`w-full h-11 px-3 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300 ${
                    previewGrams != null
                      ? "placeholder:text-neutral-500 placeholder:font-medium"
                      : "placeholder:text-neutral-300"
                  }`}
                />
              </div>
            )}
          </Field>

          <div className="flex items-center gap-3 py-2">
            <div className="flex-1 h-px bg-neutral-200" />
            <span className="text-xs text-neutral-400">영양 정보</span>
            <div className="flex-1 h-px bg-neutral-200" />
          </div>

          <Field label="카테고리">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as FoodCategory)}
              className="w-full h-11 px-3 rounded-xl border border-neutral-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-300"
            >
              {CATEGORY_LABELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-neutral-400 mt-1">
              비어 있는 영양 정보와 1회 제공량 g을 카테고리 기준으로 자동 추정해요
            </p>
          </Field>

          <Field label="열량 (kcal)">
            <input
              type="number"
              inputMode="decimal"
              value={kcal}
              onChange={(e) => setKcal(e.target.value)}
              placeholder={previewKcal != null ? `≈ ${previewKcal}` : "비우면 자동"}
              min={0}
              className={`w-full h-11 px-3 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300 ${
                previewKcal != null
                  ? "placeholder:text-neutral-500 placeholder:font-medium"
                  : "placeholder:text-neutral-300"
              }`}
            />
            {atwaterNotice && (
              <p className="text-[12px] text-neutral-500 mt-1.5">
                탄단지 g 기준 계산: {atwaterNotice.atwater} kcal ({atwaterNotice.diff} kcal 차이)
              </p>
            )}
          </Field>

          <div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { key: "carb" as const, label: "탄수화물 (g)", val: carbShown, preview: previewMacros?.carbs },
                  { key: "protein" as const, label: "단백질 (g)", val: proteinShown, preview: previewMacros?.protein },
                  { key: "fat" as const, label: "지방 (g)", val: fatShown, preview: previewMacros?.fat },
                ]
              ).map((row) => (
                <div key={row.key}>
                  <label className="text-xs text-neutral-600 font-medium mb-1.5 flex items-center gap-1">
                    {row.label}
                    {isEstimated ? (
                      <span className="text-[10px] text-neutral-400 px-1 py-0.5 rounded bg-neutral-100">
                        추정
                      </span>
                    ) : null}
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={row.val}
                    onChange={(e) =>
                      handleManualMacroChange(row.key, e.target.value)
                    }
                    min={0}
                    placeholder={row.preview != null ? `≈ ${row.preview}` : "자동"}
                    className={`w-full h-11 px-3 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300 ${
                      row.preview != null
                        ? "placeholder:text-neutral-500 placeholder:font-medium"
                        : "placeholder:text-neutral-300"
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>

          <button
            disabled={!canSave}
            onClick={handleSubmit}
            className="w-full h-12 rounded-xl bg-neutral-900 text-white text-sm font-semibold disabled:opacity-40 active:scale-95 transition mt-2"
          >
            저장하기
          </button>
          {!canSave && (() => {
            const missing: string[] = [];
            if (name.trim().length === 0) missing.push("음식 이름");
            if (Number.isNaN(amountN) || amountN <= 0) missing.push("1회 제공량");
            if (!kcalFilled && !allMacrosFilled)
              missing.push("열량 또는 탄·단·지 g");
            if (missing.length === 0) return null;
            return (
              <p className="text-[11px] text-neutral-500 text-center mt-1.5">
                {missing.join(" · ")} 입력 후 저장할 수 있어요
              </p>
            );
          })()}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs text-neutral-600 font-medium block mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
