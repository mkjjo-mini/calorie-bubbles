import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

/* ---------- layout constants ---------- */
const DAY_COL_W = 88;
const TANK_H = 460; // mobile-friendly height
const SURFACE_Y = 300; // water surface line (bubbles float along this)
const FLOAT_BAND = 56; // ± vertical range above the surface for bubble centers
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

  // Pre-compute bubbles for each day + scale
  const { perDay, maxMetric } = useMemo(() => {
    const perDay = month.map(buildDayBubbles);
    let max = 0;
    perDay.forEach((arr) => {
      for (const b of arr) {
        const v = mode === "kcal" ? b.kcal : b[mode];
        if (v > max) max = v;
      }
    });
    return { perDay, maxMetric: max || 1 };
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
    const x = (today.getDate() - 1) * DAY_COL_W - el.clientWidth / 2 + DAY_COL_W / 2;
    el.scrollTo({ left: Math.max(0, x), behavior: "auto" });
    setScrollX(el.scrollLeft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, isCurrentMonth]);

  function scrollToDay(idx: number, behavior: ScrollBehavior = "smooth") {
    const el = scrollRef.current;
    if (!el) return;
    const x = idx * DAY_COL_W - el.clientWidth / 2 + DAY_COL_W / 2;
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

  const totalWidth = month.length * DAY_COL_W;
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

        {/* WATER TANK */}
        <div className="relative">
          {!hasAnyRecord && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center text-sm text-neutral-400">
              이 달은 기록이 없어요
            </div>
          )}

          <div
            ref={scrollRef}
            className="no-scrollbar overflow-x-auto overflow-y-hidden"
            style={{
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              background:
                "linear-gradient(180deg, #FFFDF5 0%, #FFFDF5 " +
                ((SURFACE_Y / TANK_H) * 100).toFixed(1) +
                "%, #E6F4FB " +
                ((SURFACE_Y / TANK_H) * 100).toFixed(1) +
                "%, #9FD2EA 100%)",
            }}
          >
            <style>{`.no-scrollbar::-webkit-scrollbar{display:none}`}</style>
            <div
              className="relative"
              style={{ width: totalWidth, height: TANK_H }}
            >
              {/* Day column verticals (subtle) */}
              <svg
                width={totalWidth}
                height={TANK_H}
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
                      y2={TANK_H}
                      stroke={isMonday ? "rgba(15,23,42,0.10)" : "rgba(15,23,42,0.04)"}
                      strokeWidth={1}
                    />
                  );
                })}
                {/* Water surface line */}
                <WaterSurface
                  width={totalWidth}
                  y={WATER_TOP}
                  reduced={reduced}
                />
              </svg>

              {/* Today column highlight */}
              {isCurrentMonth && (
                <div
                  className="pointer-events-none absolute rounded-md"
                  style={{
                    left: (today.getDate() - 1) * DAY_COL_W + 1,
                    width: DAY_COL_W - 2,
                    top: 0,
                    height: TANK_H,
                    border: "1.5px solid rgba(59,130,246,0.35)",
                    background: "rgba(59,130,246,0.05)",
                  }}
                />
              )}

              {/* Bubbles */}
              {perDay.map((bubbles, dayIdx) => (
                <DayBubbles
                  key={month[dayIdx].dateKey}
                  bubbles={bubbles}
                  dayIdx={dayIdx}
                  mode={mode}
                  maxMetric={maxMetric}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                  reduced={reduced}
                  date={month[dayIdx].date}
                />
              ))}
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
                      style={{ width: DAY_COL_W }}
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

/* ---------- water surface (animated wave) ---------- */
function WaterSurface({
  width,
  y,
  reduced,
}: {
  width: number;
  y: number;
  reduced: boolean;
}) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      setPhase((p) => (p + dt * 0.6) % (Math.PI * 2));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  const path = useMemo(() => {
    const amp = 4;
    const period = 140;
    const step = 12;
    let d = `M 0 ${y}`;
    for (let x = step; x <= width; x += step) {
      const yy = y + Math.sin((x / period) * Math.PI * 2 + phase) * amp;
      d += ` L ${x.toFixed(1)} ${yy.toFixed(2)}`;
    }
    return d;
  }, [width, y, phase]);

  return (
    <path
      d={path}
      fill="none"
      stroke="rgba(59,130,246,0.45)"
      strokeWidth={1.5}
      strokeLinecap="round"
    />
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

  return (
    <>
      {visible.map((b, i) => {
        const value = metricValue(b, mode);
        const ratio = maxMetric > 0 ? value / maxMetric : 0;
        const size = Math.max(
          BUBBLE_MIN,
          Math.min(
            BUBBLE_MAX,
            BUBBLE_MIN + Math.sqrt(ratio) * (BUBBLE_MAX - BUBBLE_MIN),
          ),
        );

        // Stable jitter per (date, food, mode)
        // Bubbles float above the water surface, bottom touching/dipping in.
        const seed = b.key + mode;
        const jitterX = (hash01(seed, 3) - 0.5) * (DAY_COL_W - size - 6);
        // Center y so bubble bottom sits near the surface, with stable vertical scatter
        const verticalScatter = hash01(seed, 5) * FLOAT_BAND;
        const yPos = SURFACE_Y - size / 2 + 6 - verticalScatter;
        const xPos = colCenter + jitterX;

        const color =
          mode === "kcal" ? foodColor(b.name) : MACRO_COLORS[mode];

        const swayDur = 3.4 + hash01(seed, 9) * 2.2;
        const swayAmp = 4 + hash01(seed, 11) * 5;
        const bobAmp = 3 + hash01(seed, 17) * 4;
        const delay = -hash01(seed, 19) * swayDur;

        const enterDelay = reduced
          ? 0
          : Math.min(900, dayIdx * 25 + i * 30);

        return (
          <Popover key={b.key}>
            <PopoverTrigger asChild>
              <motion.button
                className="absolute flex items-center justify-center rounded-full"
                initial={
                  reduced ? false : { opacity: 0, scale: 0.4, y: -8 }
                }
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{
                  delay: enterDelay / 1000,
                  duration: 0.35,
                  ease: "easeOut",
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
