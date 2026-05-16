import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Search, Star, Clock, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import foodPresets from "@/data/food-presets.json";
import { displayName, type BubbleEntry, type Macro } from "@/lib/foods";
import {
  type CustomFood,
  type FoodCategory,
  kcalFromMacros,
  estimateMacrosFromKcal,
  estimateGramsFromKcal,
  prependCustomFood,
} from "@/lib/customFoods";
import { type FoodApiResult } from "@/lib/food-search";
import { useFoodSearch } from "@/hooks/use-food-search";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

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

/** Unified shape consumed by QuantitySheet. */
interface Pickable {
  source: "preset" | "custom" | "api";
  id: string;
  name: string;
  kcal: number;
  carb: number;
  protein: number;
  fat: number;
  serving_g: number;
  serving_label: string; // e.g. "1봉 (40g)" or "100g"
  is_estimated?: boolean;
}

const PRESETS = foodPresets as FoodPreset[];

const FAV_KEY = "favorites";
const RECENT_KEY = "recentFoods";
const CUSTOM_KEY = "customFoods";
const SEARCH_HISTORY_KEY = "searchHistory";
const SEARCH_HISTORY_MAX = 8;

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

function todayKey() {
  const d = new Date();
  return `cal-tracker-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
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
  };
}

function customToPickable(c: CustomFood): Pickable {
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
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [customFoods, setCustomFoods] = useState<CustomFood[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [activeFood, setActiveFood] = useState<Pickable | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<Partial<CustomFood> | null>(null);
  const [actionTarget, setActionTarget] = useState<CustomFood | null>(null);
  

  useEffect(() => {
    setFavorites(readArr<string>(FAV_KEY));
    setRecents(readArr<string>(RECENT_KEY));
    setCustomFoods(readArr<CustomFood>(CUSTOM_KEY));
    setSearchHistory(readArr<string>(SEARCH_HISTORY_KEY));
    setHydrated(true);
  }, []);

  function persistCustom(next: CustomFood[]) {
    setCustomFoods(next);
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
  }

  function persistFavs(next: string[]) {
    setFavorites(next);
    localStorage.setItem(FAV_KEY, JSON.stringify(next));
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

  function toggleFav(id: string) {
    const next = favorites.includes(id)
      ? favorites.filter((x) => x !== id)
      : [...favorites, id];
    persistFavs(next);
  }

  function toggleFavByName(name: string) {
    const next = favorites.includes(name)
      ? favorites.filter((x) => x !== name)
      : [...favorites, name];
    persistFavs(next);
  }

  const q = query.trim().toLowerCase();

  // search-results mode = 1+ chars (한글 1글자 음식: 김·밥·닭·면·떡 등)
  const inSearch = q.length >= 1;

  const customMatches = useMemo(() => {
    if (!inSearch) return [];
    return customFoods.filter((c) => c.name.toLowerCase().includes(q));
  }, [customFoods, q, inSearch]);

  const presetMatches = useMemo(() => {
    if (!inSearch) return PRESETS;
    const customNames = new Set(customMatches.map((c) => c.name.toLowerCase()));
    return PRESETS.filter(
      (p) => p.name.toLowerCase().includes(q) && !customNames.has(p.name.toLowerCase()),
    );
  }, [q, inSearch, customMatches]);

  // External API (식약처) — debounced + 24h cached
  const { results: apiResults, loading: apiLoading, error: apiError } =
    useFoodSearch(query);

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

  // favorites array는 preset id 또는 customFood id/name 혼재 가능
  function lookupForFavOrRecent(key: string): FoodPreset | undefined {
    const p = PRESETS.find((x) => x.id === key);
    if (p) return p;
    const byId = customFoods.find((c) => c.id === key);
    const c = byId ?? customFoods.find((c) => c.name.toLowerCase() === key.toLowerCase());
    if (!c) return undefined;
    return {
      id: c.id,
      name: c.name,
      kcal: c.kcal,
      carb: c.carb_g,
      protein: c.protein_g,
      fat: c.fat_g,
      serving_g: c.serving_g,
    } as FoodPreset;
  }

  const favList = hydrated
    ? favorites
        .map((key) => lookupForFavOrRecent(key))
        .filter((x): x is FoodPreset => !!x)
    : [];
  const recentList = hydrated
    ? recents
        .slice(0, 10)
        .map((id) => {
          const p = PRESETS.find((x) => x.id === id);
          if (p) return p;
          const c = customFoods.find((x) => x.id === id);
          if (c) {
            // Adapt CustomFood to FoodPreset shape so it renders in FoodGrid
            return {
              id: c.id,
              name: c.name,
              kcal: c.kcal,
              carb: c.carb_g,
              protein: c.protein_g,
              fat: c.fat_g,
              serving_g: c.serving_g,
            } as FoodPreset;
          }
          return undefined;
        })
        .filter((x): x is FoodPreset => !!x)
    : [];

  const sortedCustom = useMemo(
    () => [...customFoods].sort((a, b) => b.created_at - a.created_at),
    [customFoods],
  );

  /* ---------------- add to today ---------------- */

  function handleAdd(food: Pickable, mode: "serving" | "gram", qty: number) {
    // API food → customFoods로 자동 저장 (다음 빠른 추가 트레이·검색에 노출되도록)
    let effectiveId = food.id;
    if (food.source === "api") {
      const existingByName = customFoods.find(
        (c) => c.name.toLowerCase() === food.name.toLowerCase(),
      );
      if (existingByName) {
        effectiveId = existingByName.id;
      } else {
        const newCustom: CustomFood = {
          id: safeRandomId(),
          name: food.name,
          serving_unit: "g",
          serving_amount: food.serving_g,
          serving_g: food.serving_g,
          kcal: food.kcal,
          carb_g: food.carb,
          protein_g: food.protein,
          fat_g: food.fat,
          is_estimated: false,
          created_at: Date.now(),
          updated_at: Date.now(),
        };
        const next = prependCustomFood(customFoods, newCustom);
        persistCustom(next);
        effectiveId = newCustom.id;
        // API 음식 첫 추가 시 자동 즐겨찾기 (사용자가 별표 토글로 언제든 해제 가능)
        if (!favorites.includes(newCustom.id) && !favorites.includes(newCustom.name)) {
          const nextFav = [newCustom.id, ...favorites];
          setFavorites(nextFav);
          localStorage.setItem(FAV_KEY, JSON.stringify(nextFav));
        }
      }
    }

    const mult = mode === "serving" ? qty : qty / food.serving_g;
    const macros: Record<Macro, number> = {
      carbs: food.carb * mult,
      protein: food.protein * mult,
      fat: food.fat * mult,
    };
    const now = Date.now();
    const foodLogId = `${now}-${Math.random().toString(36).slice(2, 9)}`;
    const additions: BubbleEntry[] = [];
    (["carbs", "protein", "fat"] as Macro[]).forEach((m, i) => {
      const grams = Math.round(macros[m] * 10) / 10;
      if (grams > 0) {
        additions.push({
          id: `${foodLogId}-${i}`,
          foodLogId,
          macro: m,
          grams,
          foodName: displayName(food.name),
          addedAt: now,
        });
      }
    });
    const key = todayKey();
    let existing: BubbleEntry[] = [];
    try {
      existing = JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      existing = [];
    }
    localStorage.setItem(key, JSON.stringify([...existing, ...additions]));

    const nextRecent = [effectiveId, ...recents.filter((x) => x !== effectiveId)].slice(0, 10);
    localStorage.setItem(RECENT_KEY, JSON.stringify(nextRecent));
    setRecents(nextRecent);
    toast(`${displayName(food.name)} 추가됨`);
    navigate({ to: "/" });
  }

  /* ---------------- form save ---------------- */

  function handleFormSave(food: CustomFood) {
    const existingIdx = customFoods.findIndex((c) => c.id === food.id);
    let next: CustomFood[];
    if (existingIdx >= 0) {
      next = customFoods.map((c) => (c.id === food.id ? food : c));
    } else {
      next = prependCustomFood(customFoods, food);
    }
    persistCustom(next);
    // Do not auto-favorite — the star is a user-controlled favorite toggle only.
    setFormOpen(false);
    setFormInitial(null);
    // Continuous flow: open quantity sheet right after
    setActiveFood(customToPickable(food));
  }

  /* ---------------- delete with undo ---------------- */

  function handleDelete(food: CustomFood) {
    const idx = customFoods.findIndex((c) => c.id === food.id);
    if (idx < 0) return;
    const wasFav = favorites.includes(food.name);
    const nextList = customFoods.filter((c) => c.id !== food.id);
    persistCustom(nextList);
    if (wasFav) persistFavs(favorites.filter((f) => f !== food.name));
    setActionTarget(null);

    toast("삭제했어요", {
      duration: 5000,
      action: {
        label: "되돌리기",
        onClick: () => {
          const restored = [...nextList];
          restored.splice(Math.min(idx, restored.length), 0, food);
          persistCustom(restored);
          if (wasFav) {
            const favs = readArr<string>(FAV_KEY);
            if (!favs.includes(food.name)) persistFavs([...favs, food.name]);
          }
        },
      },
    });
  }

  /* ---------------- render ---------------- */

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

              {favList.length > 0 && (
                <Section
                  title={
                    <>
                      <Star className="w-3.5 h-3.5 text-neutral-500" strokeWidth={2.4} />
                      즐겨찾기
                    </>
                  }
                >
                  <FoodGrid
                    foods={favList}
                    favorites={favorites}
                    onToggleFav={toggleFav}
                    onPick={(p) => {
                      const c = customFoods.find((x) => x.id === p.id);
                      setActiveFood(c ? customToPickable(c) : presetToPickable(p));
                    }}
                  />
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
                  <FoodGrid
                    foods={recentList}
                    favorites={favorites}
                    onToggleFav={toggleFav}
                    onPick={(p) => {
                      const c = customFoods.find((x) => x.id === p.id);
                      setActiveFood(c ? customToPickable(c) : presetToPickable(p));
                    }}
                  />
                </Section>
              )}

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
                        className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white pl-3 pr-1 py-1 text-xs text-neutral-700"
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
                          className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {sortedCustom.length > 0 && (
                <Section title="내가 등록한 음식">
                  <CustomFoodGrid
                    foods={sortedCustom}
                    favorites={favorites}
                    onToggleFav={toggleFavByName}
                    onPick={(c) => setActiveFood(customToPickable(c))}
                    onLongPress={(c) => setActionTarget(c)}
                  />
                </Section>
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
                      isFav={favorites.includes(c.name)}
                      onToggleFav={() => toggleFavByName(c.name)}
                      onPick={() => setActiveFood(customToPickable(c))}
                      onLongPress={() => setActionTarget(c)}
                    />
                  ))}
                  {presetMatches.map((p) => (
                    <PresetCard
                      key={p.id}
                      food={p}
                      isFav={favorites.includes(p.id)}
                      onToggleFav={() => toggleFav(p.id)}
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
          onClose={() => setActiveFood(null)}
          onAdd={(mode, qty) => handleAdd(activeFood, mode, qty)}
        />
      )}

      <CustomFoodFormSheet
        open={formOpen}
        initial={formInitial}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setFormInitial(null);
        }}
        onSave={handleFormSave}
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
          onDelete={() => handleDelete(actionTarget)}
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
  favorites,
  onToggleFav,
  onPick,
}: {
  foods: FoodPreset[];
  favorites: string[];
  onToggleFav: (id: string) => void;
  onPick: (f: FoodPreset) => void;
}) {
  if (foods.length === 0) {
    return <p className="text-xs text-neutral-400">결과가 없어요</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {foods.map((f) => (
        <PresetCard
          key={f.id}
          food={f}
          isFav={favorites.includes(f.id)}
          onToggleFav={() => onToggleFav(f.id)}
          onPick={() => onPick(f)}
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
  favorites,
  onToggleFav,
  onPick,
  onLongPress,
}: {
  foods: CustomFood[];
  favorites: string[];
  onToggleFav: (name: string) => void;
  onPick: (f: CustomFood) => void;
  onLongPress: (f: CustomFood) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {foods.map((f) => (
        <CustomFoodCard
          key={f.id}
          food={f}
          isFav={favorites.includes(f.name)}
          onToggleFav={() => onToggleFav(f.name)}
          onPick={() => onPick(f)}
          onLongPress={() => onLongPress(f)}
        />
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const isWeight = food.serving_unit === "g" || food.serving_unit === "ml";
  const servingLabel = isWeight
    ? `${food.serving_g}${food.serving_unit}`
    : `${food.serving_amount}${food.serving_unit} (${food.serving_g}g)`;

  function start() {
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, 500);
  }
  function cancel() {
    if (timerRef.current) clearTimeout(timerRef.current);
  }

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
      <button
        onClick={() => {
          if (!firedRef.current) onPick();
        }}
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => {
          e.preventDefault();
          onLongPress();
        }}
        className="text-left w-full pr-6"
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

/* ---------------- Quantity sheet (works for both preset + custom) ---------------- */

function QuantitySheet({
  food,
  onClose,
  onAdd,
}: {
  food: Pickable;
  onClose: () => void;
  onAdd: (mode: "serving" | "gram", qty: number) => void;
}) {
  const [mode, setMode] = useState<"serving" | "gram">("serving");
  const [qtyStr, setQtyStr] = useState("1");
  const qty = parseFloat(qtyStr) || 0;
  const mult = mode === "serving" ? qty : qty / food.serving_g;
  const carb = Math.round(food.carb * mult * 10) / 10;
  const protein = Math.round(food.protein * mult * 10) / 10;
  const fat = Math.round(food.fat * mult * 10) / 10;
  const kcal = Math.round(food.kcal * mult);
  const disabled = qty <= 0;

  useEffect(() => {
    setQtyStr(mode === "serving" ? "1" : String(food.serving_g));
  }, [mode, food.serving_g]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-[375px] rounded-t-2xl bg-white p-5 pb-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-200" />
        <h3 className="text-base font-bold text-neutral-900">{food.name}</h3>
        <p className="text-xs text-neutral-400 mt-0.5">
          {food.serving_label} · {food.kcal} kcal
          {food.is_estimated ? " · 추정" : ""}
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
          onClick={() => onAdd(mode, qty)}
          className="mt-5 w-full h-12 rounded-xl bg-neutral-900 text-white text-sm font-semibold disabled:opacity-40 active:scale-95 transition"
        >
          추가하기
        </button>
      </div>
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
  // is_estimated flag — true only when macros came from [매크로 추정] or
  // were filled in 추정 mode AND not hand-edited since.
  const [isEstimated, setIsEstimated] = useState(false);
  // Mode-switch confirm (manual → estimate when macros have user values)
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

  // In estimate mode, macros are derived live from kcal+category (read-only).
  const estimateMacros = useMemo(() => {
    if (mode !== "estimate" || !kcalFilled) return null;
    return estimateMacrosFromKcal(kcalN, category);
  }, [mode, kcalFilled, kcalN, category]);

  // Atwater consistency check (manual mode, inline notice only)
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

  // Inline preview values surfaced as input placeholders
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
    // manual: serving_g resolves at save time (g/ml unit OR user grams OR macro-sum fallback)
    return kcalFilled || allMacrosFilled;
  })();

  function switchToManual() {
    // 추정 → 직접: copy current (estimated) values so they remain editable
    if (mode === "estimate" && estimateMacros) {
      setCarb(String(estimateMacros.carbs));
      setProtein(String(estimateMacros.protein));
      setFat(String(estimateMacros.fat));
    }
    setMode("manual");
  }

  function requestSwitchToEstimate() {
    // 직접 → 추정: if any macro has a value, ask before overwriting
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
      // Auto-fill macros from kcal + default category when only kcal is given
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

    // serving_g fallback: kcal × category density first; macro-sum as last resort
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

  // Values shown in macro inputs/badges
  const carbShown =
    mode === "estimate" ? (estimateMacros ? String(estimateMacros.carbs) : "") : carb;
  const proteinShown =
    mode === "estimate" ? (estimateMacros ? String(estimateMacros.protein) : "") : protein;
  const fatShown =
    mode === "estimate" ? (estimateMacros ? String(estimateMacros.fat) : "") : fat;

  const showEstimateMacrosBtn =
    mode === "manual" && kcalFilled && !!category && categoryOpen && macrosEmpty;

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

          {/* Category — always visible, helps macro estimation when only kcal is given */}
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

          {/* kcal field */}
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
                💡 탄단지 g 기준 계산: {atwaterNotice.atwater} kcal ({atwaterNotice.diff} kcal 차이)
              </p>
            )}
          </Field>

          {/* Macro row */}
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

          {/* Estimation previews are surfaced as input placeholders (see kcal/macro/gram inputs) */}

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
