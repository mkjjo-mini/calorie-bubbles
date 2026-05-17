import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Wave } from "@/components/Wave";
import {
  displayName,
  MACRO_COLORS,
  MACRO_KCAL,
  MACRO_LABELS,
  type Macro,
} from "@/lib/foods";
import {
  loadFavorites,
  loadMonth,
  progressColor,
  saveFavorites,
  type DayData,
} from "@/lib/history";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

/* ---------- layout constants (mirrors home bowl) ---------- */
const MIN_COL_W = 64;
const MAX_COL_W = 168;
const PER_FOOD_W = 22; // extra width per food on a day
const TANK_H = 440;
const WAVE_H = 140; // higher water level
const BUBBLE_MIN = 24;
const BUBBLE_MAX = 76;

type MetricMode = "kcal" | Macro;

const METRICS: { id: MetricMode; label: string }[] = [
  { id: "kcal", label: "kcal" },
  { id: "carbs", label: "탄수" },
  { id: "protein", label: "단백질" },
  { id: "fat", label: "지방" },
];

/* ---------- helpers ---------- */
function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Deterministic small hash → [0,1)
function hash01(str: string, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

// Color from food name — playful HSL palette, stable for same name across timeline
function foodColor(name: string): string {
  const hue = Math.floor(hash01(name, 1) * 360);
  const sat = 65 + Math.floor(hash01(name, 7) * 15); // 65-80
  const lit = 60 + Math.floor(hash01(name, 13) * 8); // 60-68
  return `hsl(${hue} ${sat}% ${lit}%)`;
}

// Build per-day bubbles aggregated by food name
interface FoodBubbleData {
  key: string;
  name: string;
  ts: number;
  carbs: number;
  protein: number;
  fat: number;
  kcal: number;
}

function buildDayBubbles(day: DayData): FoodBubbleData[] {
  const map = new Map<string, FoodBubbleData>();
  for (const e of day.entries) {
    const name = displayName(e.foodName);
    let b = map.get(name);
    if (!b) {
      b = {
        key: `${day.dateKey}-${name}`,
        name,
        ts: e.addedAt,
        carbs: 0,
        protein: 0,
        fat: 0,
        kcal: 0,
      };
      map.set(name, b);
    }
    b[e.macro] += e.grams;
    b.ts = Math.min(b.ts, e.addedAt);
  }
  for (const b of map.values()) {
    b.kcal = Math.round(
      b.carbs * MACRO_KCAL.carbs +
        b.protein * MACRO_KCAL.protein +
        b.fat * MACRO_KCAL.fat,
    );
  }
  return Array.from(map.values()).sort((a, b) => a.ts - b.ts);
}

function metricValue(b: FoodBubbleData, mode: MetricMode): number {
  if (mode === "kcal") return b.kcal;
  return b[mode];
}

/* ---------- page ---------- */
function HistoryPage() {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [mode, setMode] = useState<MetricMode>("kcal");
  const [version, setVersion] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());

  useEffect(() => setFavorites(loadFavorites()), []);

  const month = useMemo(
    () => loadMonth(cursor.getFullYear(), cursor.getMonth()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cursor, version],
  );

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

  // Pre-compute bubbles for each day + scale + variable column widths
  const { perDay, maxMetric, colLayouts, totalWidth } = useMemo(() => {
    const perDay = month.map(buildDayBubbles);
    let max = 0;
    perDay.forEach((arr) => {
      for (const b of arr) {
        const v = mode === "kcal" ? b.kcal : b[mode];
        if (v > max) max = v;
      }
    });
    // Column width grows with number of foods that day, clamped.
    const colLayouts: { start: number; width: number }[] = [];
    let cursorX = 0;
    perDay.forEach((arr) => {
      const w = Math.min(
        MAX_COL_W,
        Math.max(MIN_COL_W, MIN_COL_W + arr.length * PER_FOOD_W),
      );
      colLayouts.push({ start: cursorX, width: w });
      cursorX += w;
    });
    return { perDay, maxMetric: max || 1, colLayouts, totalWidth: cursorX };
  }, [month, mode]);

  const scrollRef = useRef<HTMLDivElement>(null);
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
    const col = colLayouts[today.getDate() - 1];
    if (!col) return;
    const x = col.start + col.width / 2 - el.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, x), behavior: "auto" });
    setScrollX(el.scrollLeft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, isCurrentMonth, colLayouts]);

  function scrollToDay(idx: number, behavior: ScrollBehavior = "smooth") {
    const el = scrollRef.current;
    if (!el) return;
    const col = colLayouts[idx];
    if (!col) return;
    const x = col.start + col.width / 2 - el.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, x), behavior });
  }
  function goToToday() {
    if (!isCurrentMonth) setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    else scrollToDay(today.getDate() - 1);
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

  const reduced = prefersReducedMotion();

  // Minimap
  const minimapRef = useRef<HTMLDivElement>(null);
  const [mmW, setMmW] = useState(0);
  useEffect(() => {
    const el = minimapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMmW(el.clientWidth));
    ro.observe(el);
    setMmW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const mmViewportLeft = totalWidth > 0 ? (scrollX / totalWidth) * mmW : 0;
  const mmViewportW =
    totalWidth > 0 && viewportW > 0
      ? Math.min(mmW, (viewportW / totalWidth) * mmW)
      : 0;

  const hasAnyRecord = perDay.some((arr) => arr.length > 0);

  return (
    <div className="min-h-screen w-full bg-white">
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
              <div className="min-w-[92px] text-center text-[13px] font-semibold text-neutral-900 tabular-nums">
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

          {/* Minimap */}
          <div className="px-3 pb-2">
            <div ref={minimapRef} className="relative h-3 w-full" role="presentation">
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
              {mmViewportW > 0 && (
                <div
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-[3px] border border-neutral-900/30 bg-neutral-900/10"
                  style={{ left: mmViewportLeft, width: mmViewportW, height: 14 }}
                />
              )}
            </div>
          </div>
        </header>

        {/* WATER BOWL (mirrors home palette: cream gradient + yellow border + bottom wave) */}
        <div className="relative px-3 pt-3 pb-2">
          {!hasAnyRecord && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center text-sm text-neutral-400">
              이 달은 기록이 없어요
            </div>
          )}

          <div
            ref={scrollRef}
            className="no-scrollbar relative overflow-x-auto overflow-y-hidden shadow-inner"
            style={{
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              height: TANK_H,
              borderRadius: 20,
              background:
                "radial-gradient(120% 80% at 50% 10%, #f8fafc 0%, #eef2f6 60%, #e5eaf0 100%)",
              border: "1.5px solid rgba(255,193,7,0.65)",
              boxShadow:
                "0 0 22px rgba(255,193,7,0.25), inset 0 4px 12px rgba(0,0,0,0.04)",
            }}
          >
            <style>{`.no-scrollbar::-webkit-scrollbar{display:none}`}</style>
            <div className="relative" style={{ width: totalWidth, height: TANK_H }}>
              {/* Day column verticals (subtle) */}
              <svg
                width={totalWidth}
                height={TANK_H}
                className="absolute inset-0 pointer-events-none"
              >
                {month.map((d, i) => {
                  const x = colLayouts[i].start;
                  const isMonday = d.date.getDay() === 1;
                  return (
                    <line
                      key={`v-${i}`}
                      x1={x}
                      x2={x}
                      y1={0}
                      y2={TANK_H - WAVE_H}
                      stroke={
                        isMonday ? "rgba(15,23,42,0.08)" : "rgba(15,23,42,0.035)"
                      }
                      strokeWidth={1}
                    />
                  );
                })}
              </svg>

              {/* Today column highlight (yellow, matches brand) */}
              {isCurrentMonth && colLayouts[today.getDate() - 1] && (
                <div
                  className="pointer-events-none absolute rounded-md"
                  style={{
                    left: colLayouts[today.getDate() - 1].start + 1,
                    width: colLayouts[today.getDate() - 1].width - 2,
                    top: 4,
                    height: TANK_H - 8,
                    border: "1.5px solid rgba(255,193,7,0.7)",
                    background: "rgba(255,215,0,0.08)",
                  }}
                />
              )}

              {/* Bubbles */}
              {perDay.map((bubbles, dayIdx) => (
                <DayBubbles
                  key={month[dayIdx].dateKey}
                  bubbles={bubbles}
                  dayIdx={dayIdx}
                  colStart={colLayouts[dayIdx].start}
                  colWidth={colLayouts[dayIdx].width}
                  mode={mode}
                  maxMetric={maxMetric}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                  reduced={reduced}
                  date={month[dayIdx].date}
                />
              ))}

              {/* Wave at bottom — same component as home */}
              <Wave width={totalWidth} height={WAVE_H} />
            </div>
          </div>

          {/* DAY LABELS — synced with scroll */}
          <div className="overflow-hidden border-t border-neutral-200/70 bg-white/95">
            <div
              className="no-scrollbar overflow-x-auto"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                transform: `translateX(${-scrollX}px)`,
              }}
            >
              <div className="relative flex" style={{ width: totalWidth, height: 36 }}>
                {month.map((d) => {
                  const color = progressColor(d);
                  const wd = ["일", "월", "화", "수", "목", "금", "토"][d.date.getDay()];
                  const isWknd = d.date.getDay() === 0 || d.date.getDay() === 6;
                  return (
                    <div
                      key={d.dateKey}
                      className="flex flex-col items-center justify-center"
                      style={{ width: colLayouts[i].width }}
                    >
                      <div
                        className="font-mono text-[11px] tabular-nums"
                        style={{ color: isWknd ? "#A1A1AA" : "#525252" }}
                      >
                        {d.date.getMonth() + 1}/{d.date.getDate()}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1">
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


/* ---------- bubbles for one day ---------- */
function DayBubbles({
  bubbles,
  dayIdx,
  mode,
  maxMetric,
  favorites,
  onToggleFavorite,
  reduced,
  date,
}: {
  bubbles: FoodBubbleData[];
  dayIdx: number;
  mode: MetricMode;
  maxMetric: number;
  favorites: Set<string>;
  onToggleFavorite: (name: string) => void;
  reduced: boolean;
  date: Date;
}) {
  if (bubbles.length === 0) return null;

  // Filter by macro mode
  const visible =
    mode === "kcal"
      ? bubbles
      : bubbles.filter((b) => b[mode] > 0);

  if (visible.length === 0) return null;

  const colCenter = dayIdx * DAY_COL_W + DAY_COL_W / 2;
  // Water surface line — bubbles rest with their bottom at this y, then stack upward.
  const waterTop = TANK_H - WAVE_H + 4;

  // Pre-compute size + stable horizontal jitter for each visible bubble
  const items = visible.map((b) => {
    const value = metricValue(b, mode);
    const ratio = maxMetric > 0 ? value / maxMetric : 0;
    const size = Math.max(
      BUBBLE_MIN,
      Math.min(
        BUBBLE_MAX,
        BUBBLE_MIN + Math.sqrt(ratio) * (BUBBLE_MAX - BUBBLE_MIN),
      ),
    );
    const seed = b.key + mode;
    const r = size / 2;
    const maxJitter = Math.max(0, (DAY_COL_W - size - 4) / 2);
    const xPos = colCenter + (hash01(seed, 3) - 0.5) * 2 * maxJitter;
    return { b, size, r, xPos, seed };
  });

  // Gravity stacking: place largest first at the surface, smaller stack on top.
  items.sort((a, b) => b.r - a.r);
  const placed: { x: number; y: number; r: number }[] = [];
  const positioned = items.map(({ b, size, r, xPos, seed }) => {
    let yPos = waterTop - r; // resting on water surface
    for (const p of placed) {
      const dx = xPos - p.x;
      const sumR = r + p.r + 1;
      if (Math.abs(dx) < sumR) {
        const dy = Math.sqrt(sumR * sumR - dx * dx);
        const stackedY = p.y - dy;
        if (stackedY < yPos) yPos = stackedY;
      }
    }
    placed.push({ x: xPos, y: yPos, r });
    return { b, size, xPos, yPos, seed };
  });

  return (
    <>
      {positioned.map(({ b, size, xPos, yPos, seed }, i) => {
        const color =
          mode === "kcal" ? foodColor(b.name) : MACRO_COLORS[mode];

        // Gentle bob — they're floating on water, not flying
        const swayDur = 3.6 + hash01(seed, 9) * 2.0;
        const bobAmp = 1.5 + hash01(seed, 17) * 2;
        const swayAmp = 1 + hash01(seed, 11) * 2;
        const delay = -hash01(seed, 19) * swayDur;

        // Gravity drop on enter: from above tank down to resting y
        const dropFrom = -(yPos + size); // start above the tank
        const enterDelay = reduced
          ? 0
          : Math.min(1100, dayIdx * 20 + i * 50);

        return (
          <Popover key={b.key}>
            <PopoverTrigger asChild>
              <motion.button
                className="absolute flex items-center justify-center rounded-full"
                initial={
                  reduced ? false : { opacity: 0, scale: 0.6, y: dropFrom }
                }
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{
                  delay: enterDelay / 1000,
                  type: "spring",
                  stiffness: 140,
                  damping: 14,
                  mass: 0.8,
                }}
                style={{
                  left: xPos - size / 2,
                  top: yPos - size / 2,
                  width: size,
                  height: size,
                  background: `radial-gradient(circle at 32% 28%, ${color}ee, ${color}bb 58%, ${color}77)`,
                  boxShadow: `inset -5px -7px 12px ${color}55, 0 4px 10px rgba(15,23,42,0.18)`,
                  border: `1px solid ${color}`,
                  willChange: "transform",
                }}
                aria-label={`${date.getMonth() + 1}/${date.getDate()} ${b.name}`}
              >
                <motion.span
                  className="flex h-full w-full items-center justify-center rounded-full"
                  animate={
                    reduced
                      ? undefined
                      : {
                          y: [0, -bobAmp, 0, bobAmp * 0.7, 0],
                          x: [0, swayAmp * 0.5, 0, -swayAmp * 0.5, 0],
                          rotate: [0, swayAmp * 0.25, 0, -swayAmp * 0.25, 0],
                        }
                  }
                  transition={{
                    duration: swayDur,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay,
                  }}
                >
                  {size >= 28 && (
                    <span
                      className="px-1 text-center text-[10px] font-semibold leading-tight"
                      style={{
                        color:
                          mode === "carbs" || (mode === "kcal" && isLight(color))
                            ? "#3F2A00"
                            : "#FFFFFF",
                        maxWidth: size - 6,
                        wordBreak: "keep-all",
                      }}
                    >
                      {b.name}
                    </span>
                  )}
                </motion.span>
              </motion.button>
            </PopoverTrigger>
            <PopoverContent side="top" align="center" className="w-56 p-3">
              <PopoverBody
                bubble={b}
                date={date}
                mode={mode}
                favorite={favorites.has(b.name)}
                onToggle={() => onToggleFavorite(b.name)}
              />
            </PopoverContent>
          </Popover>
        );
      })}
    </>
  );
}

// Light HSL detection so we pick dark text on yellowish bubbles in kcal mode
function isLight(hsl: string): boolean {
  const m = hsl.match(/hsl\((\d+)\s+\d+%\s+(\d+)%\)/);
  if (!m) return false;
  const h = +m[1];
  const l = +m[2];
  // yellows/greens with high lightness are "light"
  return l >= 62 && h >= 40 && h <= 200;
}

/* ---------- popover content ---------- */
function PopoverBody({
  bubble,
  date,
  mode,
  favorite,
  onToggle,
}: {
  bubble: FoodBubbleData;
  date: Date;
  mode: MetricMode;
  favorite: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="text-[12px]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-neutral-900">
          {bubble.name}
        </span>
        <button
          onClick={onToggle}
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
        {date.getMonth() + 1}/{date.getDate()} · {bubble.kcal} kcal
      </div>
      <div className="mt-1 text-neutral-600">
        탄 {Math.round(bubble.carbs)}g · 단 {Math.round(bubble.protein)}g · 지{" "}
        {Math.round(bubble.fat)}g
      </div>
      {mode !== "kcal" && (
        <div className="mt-1 text-[11px] font-medium" style={{ color: MACRO_COLORS[mode] }}>
          {MACRO_LABELS[mode]} {Math.round(bubble[mode])}g
        </div>
      )}
    </div>
  );
}
