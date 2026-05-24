import { useEffect, useRef, useState } from "react";

/**
 * Shape consumed by QuantitySheet. Unified across:
 *   - preset (from food-presets.json — static, no saveAsBase)
 *   - custom (user-registered, source="user")
 *   - api    (식약처 검색 결과 또는 자동 저장된 source="api" customFood)
 *
 * QuickAddTray와 /add 모두 이 컴포넌트를 사용한다.
 */
export interface Pickable {
  source: "preset" | "custom" | "api";
  id: string;
  name: string;
  kcal: number;
  carb: number;
  protein: number;
  fat: number;
  serving_g: number;
  /** "1봉 (40g)" / "100g" 등 부제목 (있을 때만 노출) */
  serving_label?: string;
  is_estimated?: boolean;
  /** 식약처 FOOD_CD (source="api"용, v2 D1 lookup 키) */
  food_code?: string;
  /** 식약처 GROUP_NAME / FOOD_CAT1_NM (atwater 보정 시 카테고리 추정 입력) */
  raw_category?: string;
}

export interface LastQty {
  qty: number;
  mode: "serving" | "gram";
}

interface Props {
  food: Pickable;
  /** 같은 음식의 마지막 사용 수량/모드. 있으면 default 값으로 사용. */
  last?: LastQty;
  onClose: () => void;
  /** saveAsBase는 source가 custom 또는 api일 때만 true가 될 수 있음. */
  onAdd: (mode: "serving" | "gram", qty: number, saveAsBase: boolean) => void;
}

export function QuantitySheet({ food, last, onClose, onAdd }: Props) {
  const [mode, setMode] = useState<"serving" | "gram">(last?.mode ?? "serving");
  const [qty, setQty] = useState<number>(last?.qty ?? 1);
  const [saveAsBase, setSaveAsBase] = useState(true);
  const prevModeRef = useRef(mode);

  // 사용자가 mode 토글했을 때만 default로 reset (초기 `last` 값 보존)
  useEffect(() => {
    if (prevModeRef.current === mode) return;
    prevModeRef.current = mode;
    setQty(mode === "serving" ? 1 : food.serving_g);
  }, [mode, food.serving_g]);

  const mult = mode === "serving" ? qty : qty / food.serving_g;
  const carb = Math.round(food.carb * mult * 10) / 10;
  const protein = Math.round(food.protein * mult * 10) / 10;
  const fat = Math.round(food.fat * mult * 10) / 10;
  const kcal = Math.round(food.kcal * mult);
  const step = mode === "serving" ? 0.5 : 10;
  const disabled = qty <= 0;
  // preset은 정적이라 saveAsBase 의미 없음 — UI에서 숨기고 onAdd에 false 전달
  const canSaveAsBase = food.source === "custom" || food.source === "api";

  function bump(delta: number) {
    setQty((q) => Math.max(0, Math.round((q + delta) * 10) / 10));
  }

  return (
    <div role="dialog" aria-modal="true" data-state="open" className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-[375px] rounded-t-2xl bg-white p-5 pb-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-200" />
        <h3 className="text-base font-bold text-neutral-900">{food.name}</h3>
        {food.serving_label && (
          <p className="text-xs text-neutral-400 mt-0.5">
            {food.serving_label} · {food.kcal} kcal
            {food.is_estimated ? " · 추정" : ""}
          </p>
        )}

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
            aria-label="감소"
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
            aria-label="증가"
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

        {canSaveAsBase && (
          <label className="mt-4 flex items-center gap-2 text-xs text-neutral-600 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={saveAsBase}
              onChange={(e) => setSaveAsBase(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 accent-neutral-900"
            />
            이 양을 1인분으로 저장
          </label>
        )}

        <div className="mt-3 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-12 rounded-xl border border-neutral-200 text-sm font-semibold text-neutral-700 active:scale-95"
          >
            취소
          </button>
          <button
            disabled={disabled}
            onClick={() => onAdd(mode, qty, canSaveAsBase ? saveAsBase : false)}
            className="flex-[2] h-12 rounded-xl bg-neutral-900 text-white text-sm font-semibold disabled:opacity-40 active:scale-95"
          >
            추가하기
          </button>
        </div>
      </div>
    </div>
  );
}
