import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MACRO_COLORS, MACRO_LABELS, MEAL_SLOT_META } from "@/lib/foods";
import {
  loadFavorites,
  loadMonth,
  metricValue,
  progressColor,
  saveFavorites,
  type DayData,
  type FoodAgg,
  type MetricMode,
} from "@/lib/history";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

const DAY_COL_W = 64;
const FLOW_H = 150;
const BUBBLE_MIN = 16;
const BUBBLE_MAX = 64;
const MAX_BUBBLES_PER_SLOT = 5;

const METRICS: { id: MetricMode; label: string }[] = [
  { id: "kcal", label: "kcal" },
  { id: "carbs", label: "탄수" },
  { id: "protein", label: "단백질" },
  { id: "fat", label: "지방" },
];

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function HistoryPage() {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [mode, setMode] = useState<MetricMode>("kcal");
  const [version, setVersion] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  // re-read when month changes / on mount
  const month = useMemo(
    () => loadMonth(cursor.getFullYear(), cursor.getMonth()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cursor, version],
  );

  // Refresh when tab regains focus (entries may have changed on home page)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") setVersion((v) => v + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const isCurrentMonth =
    cursor.getFullYear() === today.getFullYear() &&
    cursor.getMonth() === today.getMonth();

  // Determine bubble scaling based on monthly max
  const maxMetric = useMemo(() => {
    let m = 0;
    for (const d of month) {
      for (const f of d.foods) {
        const v = metricValue(f, mode);
        if (v > m) m = v;
      }
    }
    return m || 1;
  }, [month, mode]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);
  const [scrollX, setScrollX] = useState(0);
  const [viewportW, setViewportW] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollX(el.scrollLeft);
    const onResize = () => setViewportW(el.clientWidth);
    onResize();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Scroll to today on mount when current month
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isCurrentMonth) return;
    const x = (today.getDate() - 1) * DAY_COL_W - el.clientWidth / 2 + DAY_COL_W / 2;
    el.scrollTo({ left: Math.max(0, x), behavior: "auto" });
    setScrollX(el.scrollLeft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, isCurrentMonth]);

  function scrollToDay(dayIdx: number, behavior: ScrollBehavior = "smooth") {
    const el = scrollRef.current;
    if (!el) return;
    const x = dayIdx * DAY_COL_W - el.clientWidth / 2 + DAY_COL_W / 2;
    el.scrollTo({ left: Math.max(0, x), behavior });
  }

  function goToToday() {
    if (!isCurrentMonth) {
      setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    } else {
      scrollToDay(today.getDate() - 1);
    }
  }

  function navMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  }

  function toggleFavorite(name: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      saveFavorites(next);
      return next;
    });
  }

  const totalWidth = month.length * DAY_COL_W;
  const hasAnyRecord = month.some((d) => d.foods.length > 0);
  const reduced = prefersReducedMotion();

  // Minimap geometry
  const [mmW, setMmW] = useState(0);
  useEffect(() => {
    const el = minimapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMmW(el.clientWidth));
    ro.observe(el);
    setMmW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const mmSquareW = mmW > 0 ? mmW / month.length : 0;
  const mmViewportLeft = totalWidth > 0 ? (scrollX / totalWidth) * mmW : 0;
  const mmViewportW =
    totalWidth > 0 && viewportW > 0
      ? Math.min(mmW, (viewportW / totalWidth) * mmW)
      : 0;

  return (
    <div className="min-h-screen w-full" style={{ background: "#FFFDF5" }}>
      <main className="mx-auto flex w-full max-w-[420px] flex-col">
        {/* HEADER */}
        <header className="sticky top-0 z-30 border-b border-neutral-200/70 bg-white/95 backdrop-blur">
          <div className="flex items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-1">
              <button
                onClick={() => navMonth(-1)}
                aria-label="이전 달"
                className="rounded-full p-1.5 text-neutral-700 hover:bg-neutral-100"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="min-w-[88px] text-center text-[13px] font-semibold text-neutral-900 tabular-nums">
                {cursor.getFullYear()}년 {cursor.getMonth() + 1}월
              </div>
              <button
                onClick={() => navMonth(1)}
                aria-label="다음 달"
                className="rounded-full p-1.5 text-neutral-700 hover:bg-neutral-100"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {isCurrentMonth && (
              <button
                onClick={goToToday}
                className="rounded-full bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm active:scale-95"
              >
                오늘로 이동
              </button>
            )}
          </div>

          {/* Segmented metric control */}
          <div className="px-3 pb-2">
            <div className="flex w-full items-center gap-1 rounded-full bg-neutral-100 p-1">
              {METRICS.map((m) => {
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className="flex-1 rounded-full py-1.5 text-[12px] font-semibold transition-colors"
                    style={{
                      background: active ? "#FFD700" : "transparent",
                      color: active ? "#171717" : "#737373",
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* MINIMAP */}
          <div className="px-3 pb-2">
            <div
              ref={minimapRef}
              className="relative h-3 w-full"
              role="presentation"
            >
              <div className="absolute inset-0 flex items-center gap-[1px]">
                {month.map((d, i) => {
                  const color = progressColor(d);
                  const isToday =
                    isCurrentMonth && d.date.getDate() === today.getDate();
                  return (
                    <button
                      key={d.dateKey}
                      onClick={() => scrollToDay(i)}
                      aria-label={`${d.date.getMonth() + 1}/${d.date.getDate()}로 이동`}
                      className="h-2.5 flex-1 rounded-[2px] transition-opacity hover:opacity-80"
                      style={{
                        background: color ?? "transparent",
                        outline: color ? "none" : "1px solid #E5E7EB",
                        outlineOffset: -1,
                        boxShadow: isToday
                          ? "inset 0 0 0 1px rgba(59,130,246,0.9)"
                          : undefined,
                      }}
                    />
                  );
                })}
              </div>
              {/* Viewport overlay */}
              {mmViewportW > 0 && (
                <div
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-[3px] border border-neutral-900/30 bg-neutral-900/10"
                  style={{
                    left: mmViewportLeft,
                    width: mmViewportW,
                    height: 14,
                  }}
                />
              )}
            </div>
          </div>
        </header>

        {/* MAIN FLOW (horizontal scroll) */}
        <div className="relative">
          {!hasAnyRecord && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center text-sm text-neutral-400">
              이 달은 기록이 없어요
            </div>
          )}
          <div
            ref={scrollRef}
            className="overflow-x-auto overflow-y-visible"
            style={{
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            <style>{`.no-scrollbar::-webkit-scrollbar{display:none}`}</style>
            <div
              className="no-scrollbar relative"
              style={{ width: totalWidth, height: FLOW_H }}
            >
              {/* Day boundary verticals */}
              <svg
                width={totalWidth}
                height={FLOW_H}
                className="absolute inset-0 pointer-events-none"
              >
                {month.map((d, i) => {
                  const x = i * DAY_COL_W;
                  const isMonday = d.date.getDay() === 1;
                  return (
                    <line
                      key={`v-${i}`}
                      x1={x}
                      x2={x}
                      y1={0}
                      y2={FLOW_H}
                      stroke={isMonday ? "#CBD5E1" : "#F1F5F9"}
                      strokeWidth={isMonday ? 1.5 : 1}
                    />
                  );
                })}
                {/* Flow line — sin curve */}
                <FlowPath width={totalWidth} height={FLOW_H} reduced={reduced} />
              </svg>

              {/* Today column highlight */}
              {isCurrentMonth && (
                <div
                  className="pointer-events-none absolute top-0 rounded-md"
                  style={{
                    left: (today.getDate() - 1) * DAY_COL_W + 1,
                    width: DAY_COL_W - 2,
                    height: FLOW_H,
                    border: "1.5px solid rgba(59,130,246,0.45)",
                    background: "rgba(59,130,246,0.04)",
                  }}
                />
              )}

              {/* Bubbles per day */}
              {month.map((day, dayIdx) =>
                renderDayBubbles(day, dayIdx, mode, maxMetric, favorites, toggleFavorite, reduced),
              )}
            </div>
          </div>

          {/* DAY LABELS */}
          <div
            className="overflow-hidden border-t border-neutral-200/70 bg-white/95"
            style={{ marginTop: 0 }}
          >
            <div
              className="no-scrollbar overflow-x-auto"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                transform: `translateX(${-scrollX}px)`,
              }}
            >
              <div
                className="relative flex"
                style={{ width: totalWidth, height: 36 }}
              >
                {month.map((d) => {
                  const color = progressColor(d);
                  const wd = ["일", "월", "화", "수", "목", "금", "토"][
                    d.date.getDay()
                  ];
                  const isWknd = d.date.getDay() === 0 || d.date.getDay() === 6;
                  return (
                    <div
                      key={d.dateKey}
                      className="flex flex-col items-center justify-center"
                      style={{ width: DAY_COL_W }}
                    >
                      <div
                        className="font-mono text-[11px] tabular-nums"
                        style={{ color: isWknd ? "#A1A1AA" : "#525252" }}
                      >
                        {d.date.getMonth() + 1}/{d.date.getDate()}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span
                          className="text-[9px] leading-none"
                          style={{ color: isWknd ? "#A1A1AA" : "#737373" }}
                        >
                          {wd}
                        </span>
                        {color && (
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ background: color }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function FlowPath({
  width,
  height,
  reduced,
}: {
  width: number;
  height: number;
  reduced: boolean;
}) {
  const path = useMemo(() => {
    const cy = height / 2;
    const amp = 18;
    const period = 220;
    const step = 8;
    let d = `M 0 ${cy}`;
    for (let x = step; x <= width; x += step) {
      const y = cy + Math.sin((x / period) * Math.PI * 2) * amp;
      d += ` L ${x.toFixed(1)} ${y.toFixed(2)}`;
    }
    return d;
  }, [width, height]);

  const ref = useRef<SVGPathElement>(null);
  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const len = el.getTotalLength();
    el.style.strokeDasharray = `${len}`;
    el.style.strokeDashoffset = `${len}`;
    el.getBoundingClientRect();
    el.style.transition = "stroke-dashoffset 1s ease-out";
    el.style.strokeDashoffset = "0";
  }, [path, reduced]);

  return (
    <path
      ref={ref}
      d={path}
      fill="none"
      stroke="#E5E7EB"
      strokeWidth={2}
      strokeLinecap="round"
    />
  );
}

function renderDayBubbles(
  day: DayData,
  dayIdx: number,
  mode: MetricMode,
  maxMetric: number,
  favorites: Set<string>,
  toggleFavorite: (name: string) => void,
  reduced: boolean,
) {
  if (day.foods.length === 0) return null;

  // Group by meal_slot
  const slots = new Map<string, FoodAgg[]>();
  for (const f of day.foods) {
    const arr = slots.get(f.meal_slot) ?? [];
    arr.push(f);
    slots.set(f.meal_slot, arr);
  }

  const nodes: React.ReactNode[] = [];
  const colX = dayIdx * DAY_COL_W;
  const cy = FLOW_H / 2;
  const amp = 18;
  const period = 220;

  // Position bubbles distributed across the day column
  // Collect a flat list with overflow handling per slot
  const visible: FoodAgg[] = [];
  const overflow: { x: number; foods: FoodAgg[] }[] = [];
  let slotIdx = 0;
  const slotCount = slots.size;

  for (const [, foods] of slots) {
    const sorted = [...foods].sort(
      (a, b) => metricValue(b, mode) - metricValue(a, mode),
    );
    const show = sorted.slice(0, MAX_BUBBLES_PER_SLOT);
    const rest = sorted.slice(MAX_BUBBLES_PER_SLOT);
    // anchor x within the day column for this slot
    const slotAnchor =
      colX + ((slotIdx + 0.5) / Math.max(slotCount, 1)) * DAY_COL_W;
    show.forEach((f, i) => {
      // place each food slightly offset from the slot anchor
      const offset = (i - (show.length - 1) / 2) * 6;
      (f as FoodAgg & { _x: number; _slotIdx: number; _idxInSlot: number })._x =
        slotAnchor + offset;
      visible.push(f);
    });
    if (rest.length > 0) {
      overflow.push({ x: slotAnchor, foods: rest });
    }
    slotIdx++;
  }

  const totalBubbles = visible.length;

  visible.forEach((f, i) => {
    const value = metricValue(f, mode);
    const ratio = maxMetric > 0 ? value / maxMetric : 0;
    const size = Math.max(
      BUBBLE_MIN,
      Math.min(BUBBLE_MAX, BUBBLE_MIN + Math.sqrt(ratio) * (BUBBLE_MAX - BUBBLE_MIN)),
    );
    const color = MACRO_COLORS[f.dominantMacro];
    const x = (f as FoodAgg & { _x: number })._x;
    const above = i % 2 === 0;
    const flowY = cy + Math.sin((x / period) * Math.PI * 2) * amp;
    const y = flowY + (above ? -1 : 1) * (size / 2 + 4);
    const animDelay = reduced ? 0 : Math.min(800, (dayIdx * 3 + i * 2) * 20);

    nodes.push(
      <FoodBubble
        key={f.foodLogId}
        food={f}
        x={x}
        y={y}
        size={size}
        color={color}
        favorite={favorites.has(f.foodName)}
        onToggleFavorite={() => toggleFavorite(f.foodName)}
        animDelay={animDelay}
        reduced={reduced}
      />,
    );
  });

  overflow.forEach((o, i) => {
    const flowY = cy + Math.sin((o.x / period) * Math.PI * 2) * amp;
    nodes.push(
      <OverflowBubble
        key={`ov-${dayIdx}-${i}`}
        x={o.x}
        y={flowY + 28}
        foods={o.foods}
        mode={mode}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
      />,
    );
  });

  // Suppress unused warning
  void totalBubbles;

  return <div key={`day-${dayIdx}`}>{nodes}</div>;
}

function FoodBubble({
  food,
  x,
  y,
  size,
  color,
  favorite,
  onToggleFavorite,
  animDelay,
  reduced,
}: {
  food: FoodAgg;
  x: number;
  y: number;
  size: number;
  color: string;
  favorite: boolean;
  onToggleFavorite: () => void;
  animDelay: number;
  reduced: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="absolute flex items-center justify-center rounded-full active:scale-95"
          style={{
            left: x - size / 2,
            top: y - size / 2,
            width: size,
            height: size,
            background: color,
            boxShadow: "0 2px 4px rgba(0,0,0,0.10)",
            transition: "width 200ms ease, height 200ms ease, left 200ms ease, top 200ms ease",
            animation: reduced
              ? undefined
              : `bubblePop 240ms ease-out ${animDelay}ms both`,
          }}
          aria-label={food.foodName}
        >
          {size >= 28 && (
            <span
              className="px-1 text-[10px] font-semibold leading-tight text-center break-words"
              style={{
                color: food.dominantMacro === "carbs" ? "#3F2A00" : "#FFFFFF",
                maxWidth: size - 4,
              }}
            >
              {food.foodName}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-56 p-3">
        <FoodPopoverBody
          food={food}
          favorite={favorite}
          onToggleFavorite={onToggleFavorite}
        />
      </PopoverContent>
      <style>{`@keyframes bubblePop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.06);opacity:1}100%{transform:scale(1);opacity:1}}`}</style>
    </Popover>
  );
}

function FoodPopoverBody({
  food,
  favorite,
  onToggleFavorite,
}: {
  food: FoodAgg;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const slotLabel = MEAL_SLOT_META[food.meal_slot].label;
  return (
    <div className="text-[12px]">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-neutral-900 text-[13px]">
          {food.foodName}
        </span>
        <button
          onClick={onToggleFavorite}
          aria-label={favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          className="rounded-full p-1 hover:bg-neutral-100"
        >
          <Star
            className="h-4 w-4"
            fill={favorite ? "#FFD700" : "transparent"}
            stroke={favorite ? "#D4A300" : "#9CA3AF"}
            strokeWidth={2}
          />
        </button>
      </div>
      <div className="mt-1 text-neutral-500">
        {slotLabel} · {food.kcal} kcal
      </div>
      <div className="mt-1 text-neutral-600">
        탄 {Math.round(food.carbs)}g · 단 {Math.round(food.protein)}g · 지{" "}
        {Math.round(food.fat)}g
      </div>
    </div>
  );
}

function OverflowBubble({
  x,
  y,
  foods,
  mode,
  favorites,
  onToggleFavorite,
}: {
  x: number;
  y: number;
  foods: FoodAgg[];
  mode: MetricMode;
  favorites: Set<string>;
  onToggleFavorite: (name: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="absolute flex items-center justify-center rounded-full bg-neutral-700 text-white"
          style={{
            left: x - 6,
            top: y - 6,
            width: 14,
            height: 14,
            fontSize: 8,
            fontWeight: 700,
            boxShadow: "0 2px 4px rgba(0,0,0,0.10)",
          }}
          aria-label={`그 외 ${foods.length}개`}
        >
          +{foods.length}
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-60 p-2">
        <div className="px-1 pb-1 text-[11px] font-semibold text-neutral-500">
          {MEAL_SLOT_META[foods[0].meal_slot].label} · 그 외 {foods.length}개
        </div>
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {foods.map((f) => (
            <li
              key={f.foodLogId}
              className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-neutral-50"
            >
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium text-neutral-900">
                  {f.foodName}
                </div>
                <div className="text-[10px] text-neutral-500">
                  {metricLabel(mode)} {Math.round(metricValue(f, mode))}
                  {mode === "kcal" ? " kcal" : "g"}
                </div>
              </div>
              <button
                onClick={() => onToggleFavorite(f.foodName)}
                aria-label="즐겨찾기"
                className="ml-2 rounded-full p-1 hover:bg-neutral-100"
              >
                <Star
                  className="h-3.5 w-3.5"
                  fill={favorites.has(f.foodName) ? "#FFD700" : "transparent"}
                  stroke={favorites.has(f.foodName) ? "#D4A300" : "#9CA3AF"}
                  strokeWidth={2}
                />
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function metricLabel(mode: MetricMode): string {
  if (mode === "kcal") return "";
  return MACRO_LABELS[mode];
}
