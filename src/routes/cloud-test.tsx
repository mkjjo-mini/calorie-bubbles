/**
 * /cloud-test — Step 07 cloud Repository 검증용 화면.
 *
 * 기존 화면(index/add/history)과 독립. useStorage()로 직접 cloud 호출 →
 * Supabase Dashboard에서 row 생성 확인 가능. 메인 흐름과 정합성 없음.
 *
 * v2 마이그레이션 시 기존 컴포넌트가 useStorage 사용하면 이 화면은 제거 가능.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useStorage } from "@/hooks/useStorage";
import { todayKST } from "@/lib/time";
import type {
  FavoriteRow,
  FoodInsert,
  FoodLogInsert,
  FoodLogRow,
  FoodRow,
} from "@/lib/repository/types";
import { CloudAuthError } from "@/lib/repository/types";
import type { ResolvedGoal } from "@/lib/goal";

export const Route = createFileRoute("/cloud-test")({
  component: CloudTestPage,
});

interface FormState {
  name: string;
  kcal: string;
  carb: string;
  protein: string;
  fat: string;
  grams: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  kcal: "",
  carb: "",
  protein: "",
  fat: "",
  grams: "100",
};

function CloudTestPage() {
  const navigate = useNavigate();
  const repo = useStorage();
  const today = todayKST();

  const [foods, setFoods] = useState<FoodRow[]>([]);
  const [logs, setLogs] = useState<FoodLogRow[]>([]);
  const [favs, setFavs] = useState<FavoriteRow[]>([]);
  const [goal, setGoal] = useState<ResolvedGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setAuthError(false);
    try {
      const [foodsRes, logsRes, favsRes, goalRes] = await Promise.all([
        repo.foods.list(),
        repo.foodLogs.listByDate(today),
        repo.favorites.list(),
        repo.userGoal.get(today),
      ]);
      setFoods(foodsRes);
      setLogs(logsRes);
      setFavs(favsRes);
      setGoal(goalRes);
    } catch (e) {
      if (e instanceof CloudAuthError) {
        setAuthError(true);
      } else {
        toast.error(`load 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      setLoading(false);
    }
  }, [repo, today]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleAdd() {
    const kcal = Number.parseFloat(form.kcal);
    const carb = Number.parseFloat(form.carb || "0");
    const protein = Number.parseFloat(form.protein || "0");
    const fat = Number.parseFloat(form.fat || "0");
    const grams = Number.parseFloat(form.grams || "100");
    if (!form.name.trim() || !Number.isFinite(kcal) || kcal <= 0) {
      toast.error("이름과 kcal 입력 필요");
      return;
    }

    setSubmitting(true);
    try {
      // 1. foods.create (또는 기존 음식 재사용 — 단순화 위해 매번 create)
      const foodPayload: FoodInsert = {
        source: "user",
        food_code: null,
        name: form.name.trim(),
        serving_unit: "g",
        serving_amount: grams,
        serving_g: grams,
        kcal,
        carb_g: carb,
        protein_g: protein,
        fat_g: fat,
        category: null,
        is_estimated: false,
      };
      const food = await repo.foods.create(foodPayload);

      // 2. food_logs.create
      const logPayload: FoodLogInsert = {
        food_id: food.id,
        logged_date: today,
        meal_slot: "snack",
        grams,
        kcal,
        carb_g: carb,
        protein_g: protein,
        fat_g: fat,
      };
      await repo.foodLogs.create(logPayload);

      toast.success(`${food.name} 추가됨 (cloud)`);
      setForm(EMPTY_FORM);
      await refresh();
    } catch (e) {
      if (e instanceof CloudAuthError) {
        setAuthError(true);
      } else {
        toast.error(`추가 실패: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteLog(id: string) {
    try {
      await repo.foodLogs.remove(id);
      toast.success("삭제됨");
      await refresh();
    } catch (e) {
      toast.error(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleToggleFav(food: FoodRow) {
    const isFav = favs.some((f) => f.food_id === food.id);
    try {
      if (isFav) {
        await repo.favorites.remove(food.id);
        toast.success("즐겨찾기 해제");
      } else {
        await repo.favorites.add(food.id);
        toast.success("즐겨찾기 추가");
      }
      await refresh();
    } catch (e) {
      toast.error(`토글 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleDeleteFood(food: FoodRow) {
    if (!confirm(`"${food.name}" 음식을 삭제하시겠어요?`)) return;
    try {
      await repo.foods.remove(food.id);
      toast.success("음식 삭제됨");
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("FOOD_IN_USE")) {
        toast.error("이 음식을 사용한 식사 기록이 있어 삭제 불가");
      } else {
        toast.error(`삭제 실패: ${msg}`);
      }
    }
  }

  if (authError) {
    return (
      <main className="min-h-screen w-full bg-white flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-lg font-bold">로그인 필요</h1>
          <p className="text-sm text-neutral-500">
            토스 샌드박스 앱에서 미니앱 부팅 후 다시 접속하세요.
            <br />
            (브라우저에선 토스 SDK 미지원으로 인증 불가)
          </p>
          <button
            onClick={() => navigate({ to: "/" })}
            className="mt-3 inline-block px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm"
          >
            홈으로
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-white flex justify-center pb-24">
      <div className="w-full max-w-[640px] p-4 space-y-6">
        <header className="border-b border-neutral-200 pb-3">
          <h1 className="text-base font-bold">cloud-test</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Step 07 Supabase end-to-end 검증용. 메인 화면(/)과 무관.
          </p>
        </header>

        {/* 신규 음식 추가 form */}
        <section>
          <h2 className="text-sm font-semibold mb-2">신규 음식 + 오늘 기록 추가</h2>
          <div className="space-y-2">
            <Input
              label="이름"
              value={form.name}
              onChange={(v) => setForm((s) => ({ ...s, name: v }))}
            />
            <div className="grid grid-cols-4 gap-2">
              <Input
                label="kcal"
                value={form.kcal}
                onChange={(v) => setForm((s) => ({ ...s, kcal: v }))}
              />
              <Input
                label="탄(g)"
                value={form.carb}
                onChange={(v) => setForm((s) => ({ ...s, carb: v }))}
              />
              <Input
                label="단(g)"
                value={form.protein}
                onChange={(v) => setForm((s) => ({ ...s, protein: v }))}
              />
              <Input
                label="지(g)"
                value={form.fat}
                onChange={(v) => setForm((s) => ({ ...s, fat: v }))}
              />
            </div>
            <Input
              label="1회 분량(g)"
              value={form.grams}
              onChange={(v) => setForm((s) => ({ ...s, grams: v }))}
            />
            <button
              disabled={submitting}
              onClick={handleAdd}
              className="w-full h-11 rounded-xl bg-neutral-900 text-white text-sm font-semibold disabled:opacity-40"
            >
              {submitting ? "추가 중…" : "Cloud에 추가"}
            </button>
          </div>
        </section>

        {/* 목표 */}
        <section>
          <h2 className="text-sm font-semibold mb-1">목표 (오늘)</h2>
          {goal ? (
            <p className="text-xs text-neutral-700">
              {goal.daily_kcal} kcal · 탄 {goal.carb_ratio}% / 단{" "}
              {goal.protein_ratio}% / 지 {goal.fat_ratio}%
            </p>
          ) : (
            <p className="text-xs text-neutral-400">{loading ? "로딩…" : "없음"}</p>
          )}
        </section>

        {/* 오늘 기록 */}
        <section>
          <h2 className="text-sm font-semibold mb-2">
            오늘 식사 ({today}) · {logs.length}건
          </h2>
          {loading && <p className="text-xs text-neutral-400">로딩…</p>}
          {!loading && logs.length === 0 && (
            <p className="text-xs text-neutral-400">없음</p>
          )}
          <ul className="space-y-1.5">
            {logs.map((log) => (
              <li
                key={log.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {log.food?.name ?? "(no name)"}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {log.kcal}kcal · 탄 {log.carb_g} / 단 {log.protein_g} / 지{" "}
                    {log.fat_g} · {log.grams}g · {log.meal_slot}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteLog(log.id)}
                  className="text-xs text-red-500 px-2 py-1 rounded hover:bg-red-50"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* 음식 라이브러리 */}
        <section>
          <h2 className="text-sm font-semibold mb-2">
            내 음식 라이브러리 · {foods.length}개
          </h2>
          {!loading && foods.length === 0 && (
            <p className="text-xs text-neutral-400">없음</p>
          )}
          <ul className="space-y-1.5">
            {foods.map((food) => {
              const isFav = favs.some((f) => f.food_id === food.id);
              return (
                <li
                  key={food.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {food.name}
                      {isFav && <span className="ml-1.5 text-yellow-500">★</span>}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {food.kcal}kcal · {food.serving_g}g · {food.source}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleFav(food)}
                      className="text-xs px-2 py-1 rounded border border-neutral-200"
                    >
                      {isFav ? "★ 해제" : "☆ 즐겨찾기"}
                    </button>
                    <button
                      onClick={() => handleDeleteFood(food)}
                      className="text-xs text-red-500 px-2 py-1 rounded hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <footer className="pt-4 border-t border-neutral-200 text-xs text-neutral-400 text-center">
          ← <button onClick={() => navigate({ to: "/" })}>홈으로</button>
        </footer>
      </div>
    </main>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-neutral-500 block mb-0.5">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 px-3 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300"
      />
    </label>
  );
}
