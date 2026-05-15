import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Search, Star } from "lucide-react";
import { toast } from "sonner";
import foodPresets from "@/data/food-presets.json";
import { displayName, type BubbleEntry, type Macro } from "@/lib/foods";

export const Route = createFileRoute("/add")({
  component: AddFoodPage,
});

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

function todayKey() {
  const d = new Date();
  return `cal-tracker-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function readArr(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function AddFoodPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [activeFood, setActiveFood] = useState<FoodPreset | null>(null);

  useEffect(() => {
    setFavorites(readArr(FAV_KEY));
    setRecents(readArr(RECENT_KEY));
    setHydrated(true);
  }, []);

  function toggleFav(id: string) {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PRESETS;
    return PRESETS.filter((p) => p.name.toLowerCase().includes(q));
  }, [query]);

  const favList = hydrated
    ? favorites
        .map((id) => PRESETS.find((p) => p.id === id))
        .filter((x): x is FoodPreset => !!x)
        .filter((p) => filtered.includes(p))
    : [];
  const recentList = hydrated
    ? recents
        .slice(0, 10)
        .map((id) => PRESETS.find((p) => p.id === id))
        .filter((x): x is FoodPreset => !!x)
        .filter((p) => filtered.includes(p))
    : [];

  function handleAdd(food: FoodPreset, mode: "serving" | "gram", qty: number) {
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

    // Append to today's entries (same key as home)
    const key = todayKey();
    let existing: BubbleEntry[] = [];
    try {
      existing = JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      existing = [];
    }
    localStorage.setItem(key, JSON.stringify([...existing, ...additions]));

    // Update recents
    const nextRecent = [food.id, ...recents.filter((x) => x !== food.id)].slice(0, 10);
    localStorage.setItem(RECENT_KEY, JSON.stringify(nextRecent));

    toast(`${displayName(food.name)} 추가됨`);
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen w-full bg-white flex justify-center">
      <main className="w-full max-w-[375px] flex flex-col pb-10">
        {/* Header */}
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
          {favList.length > 0 && (
            <Section title="⭐ 즐겨찾기">
              <FoodGrid foods={favList} favorites={favorites} onToggleFav={toggleFav} onPick={setActiveFood} />
            </Section>
          )}

          {recentList.length > 0 && (
            <Section title="🕐 최근 사용">
              <FoodGrid foods={recentList} favorites={favorites} onToggleFav={toggleFav} onPick={setActiveFood} />
            </Section>
          )}

          <Section title="전체 음식">
            <FoodGrid foods={filtered} favorites={favorites} onToggleFav={toggleFav} onPick={setActiveFood} />
          </Section>
        </div>
      </main>

      {activeFood && (
        <QuantitySheet
          food={activeFood}
          onClose={() => setActiveFood(null)}
          onAdd={(mode, qty) => handleAdd(activeFood, mode, qty)}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-800 mb-2">{title}</h2>
      {children}
    </section>
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
      {foods.map((f) => {
        const isFav = favorites.includes(f.id);
        return (
          <div
            key={f.id}
            className="relative rounded-xl border border-neutral-200 bg-white p-3 transition active:scale-95 hover:border-neutral-300"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFav(f.id);
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
            <button onClick={() => onPick(f)} className="text-left w-full pr-6">
              <div className="text-sm font-bold text-neutral-900 leading-tight">{f.name}</div>
              <div className="text-xs text-neutral-400 mt-1">{f.kcal} kcal</div>
            </button>
          </div>
        );
      })}
    </div>
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
  const [qtyStr, setQtyStr] = useState("1");
  const qty = parseFloat(qtyStr) || 0;
  const mult = mode === "serving" ? qty : qty / food.serving_g;
  const carb = Math.round(food.carb * mult * 10) / 10;
  const protein = Math.round(food.protein * mult * 10) / 10;
  const fat = Math.round(food.fat * mult * 10) / 10;
  const kcal = Math.round(food.kcal * mult);
  const disabled = qty <= 0;

  // Reset qty when switching modes
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
        <p className="text-xs text-neutral-400 mt-0.5">1{mode === "serving" ? "인분" : "00g"} 기준 · {food.kcal} kcal / {food.serving_g}g</p>

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
