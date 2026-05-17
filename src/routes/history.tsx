import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion, useTime, useTransform } from "framer-motion";
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
  addFavorite,
  loadFavorites,
  loadMonth,
  progressColor,
  removeFavorite,
  type DayData,
} from "@/lib/history";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

/* ---------- layout constants (mirrors home bowl) ---------- */
const MIN_COL_W = 88;
const MAX_COL_W = 176;
const PER_FOOD_W = 18; // extra width per merged food bubble on a day
const TANK_H_DEFAULT = 440;
const WAVE_H = 140; // higher water level
const BUBBLE_MIN = 20;
const BUBBLE_MAX = 96;

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

// Curated palette for kcal-mode bubbles — distinct from macro RGB identity.
// Solid mid-tone jewel colors. Each entry pairs a fill color with a readable text color.
const KCAL_PALETTE: { color: string; text: string }[] = [
  { color: "#5EC4B6", text: "#fff" }, // mint
  { color: "#9B8CE0", text: "#fff" }, // lavender
  { color: "#F2A57C", text: "#3F2A00" }, // peach — light
  { color: "#4FB3C9", text: "#fff" }, // teal
  { color: "#E8B86E", text: "#3F2A00" }, // apricot — light
  { color: "#C29BD8", text: "#fff" }, // light purple
  { color: "#A8B86C", text: "#3F2A00" }, // olive — light
  { color: "#E58CA8", text: "#fff" }, // rose
  { color: "#7B95B5", text: "#fff" }, // slate blue
  { color: "#8FB08A", text: "#1f2937" }, // sage — light
];

// Deterministic: same food name always picks same color across months.
function kcalPaletteEntry(name: string) {
  const idx = Math.floor(hash01(name, 1) * KCAL_PALETTE.length);
  return KCAL_PALETTE[idx] ?? KCAL_PALETTE[0];
}
function kcalBubbleColor(name: string): string {
  return kcalPaletteEntry(name).color;
}
function kcalBubbleText(name: string): string {
  return kcalPaletteEntry(name).text;
}

function normalizeFoodKey(name: string): string {
  return displayName(name).trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

// Build per-day bubbles aggregated by food name
interface FoodBubbleData {
  key: string;
  /** 같은 이름 그룹의 대표 food_id (첫번째 FoodAgg) — 즐겨찾기 토글에 사용 */
  food_id: string;
  name: string;
  ts: number;
  carbs: number;
  protein: number;
  fat: number;
  kcal: number;
  count: number; // 같은 이름 음식 합산 횟수
}

function buildDayBubbles(day: DayData): FoodBubbleData[] {
  const map = new Map<string, FoodBubbleData>();
  for (const f of day.foods) {
    const name = displayName(f.foodName);
    const key = normalizeFoodKey(f.foodName);
    let b = map.get(key);
    if (!b) {
      b = {
        key: `${day.dateKey}-${name}`,
        food_id: f.food_id,
        name,
        ts: f.ts,
        carbs: 0,
        protein: 0,
        fat: 0,
        kcal: 0,
        count: 0,
      };
      map.set(key, b);
    }
    b.carbs += f.carbs;
    b.protein += f.protein;
    b.fat += f.fat;
    b.kcal += f.kcal;
    b.ts = Math.min(b.ts, f.ts);
    b.count += 1;
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

  useEffect(() => {
    let alive = true;
    loadFavorites().then((s) => {
      if (alive) setFavorites(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const [month, setMonth] = useState<DayData[]>([]);
  useEffect(() => {
    let alive = true;
    loadMonth(cursor.getFullYear(), cursor.getMonth())
      .then((m) => {
        if (alive) setMonth(m);
      })
      .catch(() => {
        if (alive) setMonth([]);
      });
    return () => {
      alive = false;
    };
  }, [cursor, version]);

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
    const _perDay = month.map(buildDayBubbles);
    let max = 0;
    _perDay.forEach((arr) => {
      for (const b of arr) {
        // 탄/단/지는 같은 g 단위라 통합 max 사용 — 토글 시 음식간 상대 크기 일관
        const v = mode === "kcal"
          ? b.kcal
          : Math.max(b.carbs, b.protein, b.fat);
        if (v > max) max = v;
      }
    });
    // Column width grows with number of foods that day, clamped.
    const _colLayouts: { start: number; width: number }[] = [];
    let cursorX = 0;
    _perDay.forEach((arr) => {
      const w = Math.min(
        MAX_COL_W,
        Math.max(MIN_COL_W, MIN_COL_W + arr.length * PER_FOOD_W),
      );
      _colLayouts.push({ start: cursorX, width: w });
      cursorX += w;
    });
    return { perDay: _perDay, maxMetric: max || 1, colLayouts: _colLayouts, totalWidth: cursorX };
  }, [month, mode]);

  // Month-level kcal color assignment: distinct palette slots until exhausted.
  // Same food name keeps the same color across all days of the month.
  const monthKcalColors = useMemo(() => {
    const map = new Map<string, { color: string; text: string }>();
    const N = KCAL_PALETTE.length;
    const used = new Set<number>();
    const seenNames: string[] = [];
    perDay.forEach((arr) => {
      for (const b of arr) {
        if (!map.has(b.name)) {
          seenNames.push(b.name);
          map.set(b.name, KCAL_PALETTE[0]); // placeholder, overwritten below
        }
      }
    });
    // Stable order by first appearance, then greedy preferred-index probing.
    for (const name of seenNames) {
      const preferred = Math.floor(hash01(name, 1) * N) % N;
      let idx = preferred;
      if (used.size < N) {
        for (let step = 0; step < N; step++) {
          const candidate = (preferred + step) % N;
          if (!used.has(candidate)) {
            idx = candidate;
            break;
          }
        }
        used.add(idx);
      }
      map.set(name, KCAL_PALETTE[idx]);
    }
    return map;
  }, [perDay]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollX, setScrollX] = useState(0);
  const [viewportW, setViewportW] = useState(0);
  const [TANK_H, setTankH] = useState(TANK_H_DEFAULT);

  useEffect(() => {
    function recalc() {
      const el = scrollRef.current;
      if (!el || typeof window === "undefined") return;
      const top = el.getBoundingClientRect().top;
      // 하단 고정 탭바 높이(약 72px) + safe-area + 여유 공간 제외
      const safeBottom = Number.parseInt(
        getComputedStyle(document.documentElement).getPropertyValue("--sab") || "0",
        10,
      ) || 0;
      const BOTTOM_NAV = 72 + Math.max(safeBottom, 16) + 12;
      const next = Math.max(320, Math.floor(window.innerHeight - top - BOTTOM_NAV));
      setTankH(next);
    }
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, []);

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

  // Scroll to today when month data loads (cursor 변경 또는 첫 mount).
  // mode 토글에는 무반응 — 사용자가 보던 시점 유지.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isCurrentMonth || month.length === 0) return;
    const col = colLayouts[today.getDate() - 1];
    if (!col) return;
    const x = col.start + col.width / 2 - el.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, x), behavior: "auto" });
    setScrollX(el.scrollLeft);
    // month deps만 — mode 변경 시엔 month 객체 동일이라 발동 X
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

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
  async function toggleFavorite(food_id: string) {
    const has = favorites.has(food_id);
    // optimistic update
    setFavorites((prev) => {
      const next = new Set(prev);
      if (has) next.delete(food_id);
      else next.add(food_id);
      return next;
    });
    try {
      if (has) await removeFavorite(food_id);
      else await addFavorite(food_id);
    } catch {
      // rollback on failure
      setFavorites((prev) => {
        const next = new Set(prev);
        if (has) next.add(food_id);
        else next.delete(food_id);
        return next;
      });
    }
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
            <button
              onClick={goToToday}
              className="rounded-full bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm active:scale-95"
            >
              오늘
            </button>
          </div>

          {/* Segmented metric control */}
          <div className="px-3 pb-3">
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
          <div className="px-3 pb-3">
            <div ref={minimapRef} className="relative h-7 w-full" role="presentation">
              {(() => {
                const n = month.length;
                const gap = mmW > 0 && n > 1
                  ? Math.max(1, Math.min(4, Math.floor((mmW - n * 10) / (n - 1))))
                  : 4;
                const maxDotByWidth = mmW > 0
                  ? Math.floor((mmW - gap * Math.max(0, n - 1)) / n)
                  : 10;
                const dot = Math.max(4, Math.min(10, maxDotByWidth));
                return (
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ gap: `${gap}px` }}
                  >
                    {month.map((d, i) => {
                      const color = progressColor(d, mode);
                      const isToday =
                        isCurrentMonth && d.date.getDate() === today.getDate();
                      return (
                        <button
                          key={d.dateKey}
                          onClick={() => scrollToDay(i)}
                          aria-label={`${d.date.getMonth() + 1}/${d.date.getDate()}로 이동`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            padding: 0,
                            border: 0,
                            background: "transparent",
                            width: dot,
                            height: 28,
                            cursor: "pointer",
                          }}
                        >
                          <span
                            style={{
                              display: "block",
                              width: dot,
                              height: dot,
                              borderRadius: "9999px",
                              backgroundColor: color ?? "#CBD5E1",
                              boxShadow: isToday ? "0 0 0 2px #FFD700" : undefined,
                            }}
                          />
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
              {mmViewportW > 0 && (
                <div
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full border border-neutral-900/30 bg-neutral-900/5"
                  style={{ left: mmViewportLeft, width: mmViewportW, height: 14 }}
                />
              )}
            </div>
          </div>
        </header>

        {/* WATER BOWL (mirrors home palette: cream gradient + yellow border + bottom wave) */}
        <div className="relative px-3 pt-4 pb-2">
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
              boxShadow: "inset 0 4px 12px rgba(0,0,0,0.04)",
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
                      y2={TANK_H}
                      stroke={
                        isMonday ? "rgba(59,130,246,0.55)" : "rgba(15,23,42,0.035)"
                      }
                      strokeWidth={1}
                    />
                  );
                })}
              </svg>

              {/* Date watermarks at top of each column */}
              {month.map((d, i) => {
                const col = colLayouts[i];
                const isWknd = d.date.getDay() === 0 || d.date.getDay() === 6;
                const isToday =
                  isCurrentMonth && d.date.getDate() === today.getDate();
                const wd = ["일", "월", "화", "수", "목", "금", "토"][
                  d.date.getDay()
                ];
                return (
                  <div
                    key={`wm-${d.dateKey}`}
                    className="pointer-events-none absolute flex items-baseline justify-center gap-1"
                    style={{
                      left: col.start,
                      width: col.width,
                      top: 6,
                    }}
                  >
                    <span
                      className="font-mono text-[10px] tabular-nums leading-none"
                      style={{
                        color: isToday
                          ? "rgba(180,130,0,0.9)"
                          : isWknd
                            ? "rgba(15,23,42,0.28)"
                            : "rgba(15,23,42,0.34)",
                        fontWeight: isToday ? 700 : 500,
                      }}
                    >
                      {d.date.getMonth() + 1}/{d.date.getDate()}
                    </span>
                    <span
                      className="text-[9px] leading-none"
                      style={{
                        color: isToday
                          ? "rgba(180,130,0,0.8)"
                          : isWknd
                            ? "rgba(15,23,42,0.22)"
                            : "rgba(15,23,42,0.28)",
                        fontWeight: isToday ? 600 : 400,
                      }}
                    >
                      {wd}
                    </span>
                  </div>
                );
              })}

              {/* Bubbles */}
              {perDay.map((bubbles, dayIdx) => (
                <DayBubbles
                  key={month[dayIdx].dateKey}
                  bubbles={bubbles}
                  dayIdx={dayIdx}
                  colStart={colLayouts[dayIdx].start}
                  colWidth={colLayouts[dayIdx].width}
                  waveWidth={totalWidth}
                  mode={mode}
                  maxMetric={maxMetric}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                  reduced={reduced}
                  date={month[dayIdx].date}
                  tankH={TANK_H}
                  kcalColors={monthKcalColors}
                />
              ))}

              {/* Wave at bottom — same component as home */}
              <Wave width={totalWidth} height={WAVE_H} />
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}


/* ---------- bubbles for one day ---------- */
const WAVE_PERIOD_MS = 10000; // matches Wave.tsx first wave duration
const WAVE_BASELINE_RATIO = 0.5; // Wave.tsx first path baseline
const WAVE_SURFACE_AMPLITUDE_RATIO = 0.2; // quadratic crest/trough is half the control-point delta

function waveSurfaceOffset(phase: number) {
  return -Math.sin(phase) * WAVE_H * WAVE_SURFACE_AMPLITUDE_RATIO;
}

function DayBubbles({
  bubbles,
  dayIdx,
  colStart,
  colWidth,
  waveWidth,
  mode,
  maxMetric,
  favorites,
  onToggleFavorite,
  reduced,
  date,
  tankH,
  kcalColors,
}: {
  bubbles: FoodBubbleData[];
  dayIdx: number;
  colStart: number;
  colWidth: number;
  waveWidth: number;
  mode: MetricMode;
  maxMetric: number;
  favorites: Set<string>;
  onToggleFavorite: (name: string) => void;
  reduced: boolean;
  date: Date;
  tankH: number;
  kcalColors: Map<string, { color: string; text: string }>;
}) {
  if (bubbles.length === 0) return null;

  // Filter by macro mode
  const visible =
    mode === "kcal"
      ? bubbles
      : bubbles.filter((b) => b[mode] > 0);

  if (visible.length === 0) return null;

  const dayInset = 4;
  const leftBound = colStart + dayInset;
  const rightBound = colStart + colWidth - dayInset;
  const waveBaselineY = tankH - WAVE_H * WAVE_BASELINE_RATIO;
  const surfaceYAtX = (x: number) => {
    if (waveWidth <= 0) return waveBaselineY;
    const phase = 2 * Math.PI * (x / waveWidth);
    return waveBaselineY + waveSurfaceOffset(phase);
  };

  // Pre-compute size + stable horizontal jitter for each visible bubble
  const items = visible.map((b) => {
    const value = metricValue(b, mode);
    const ratio = maxMetric > 0 ? value / maxMetric : 0;
    const size = Math.max(
      BUBBLE_MIN,
      Math.min(
        BUBBLE_MAX,
        // linear scaling — 합산 효과가 시각적으로 직관 (sqrt는 차이 약화)
        BUBBLE_MIN + ratio * (BUBBLE_MAX - BUBBLE_MIN),
      ),
    );
    const seed = b.key + mode;
    const r = size / 2;
    const usableWidth = Math.max(0, rightBound - leftBound - size);
    const preferredX = leftBound + r + hash01(seed, 3) * usableWidth;
    return { b, size, r, preferredX, seed };
  });

  // Let bubbles "roll" to the lowest available spot on the wave instead of
  // pinning x and only stacking upward.
  const OVERLAP = 0.92;
  items.sort((a, b) => b.r - a.r);
  const placed: { x: number; y: number; r: number }[] = [];
  const positioned = items.map(({ b, size, r, preferredX, seed }) => {
    const minX = leftBound + r;
    const maxX = rightBound - r;
    const step = Math.max(6, Math.min(16, Math.round(size * 0.2)));

    const restingYAtX = (candidateX: number) => {
      let candidateY = surfaceYAtX(candidateX) - r;
      for (const p of placed) {
        const dx = candidateX - p.x;
        const minDist = (r + p.r) * OVERLAP;
        if (Math.abs(dx) < minDist) {
          const dy = Math.sqrt(minDist * minDist - dx * dx);
          candidateY = Math.min(candidateY, p.y - dy);
        }
      }
      return Math.max(r + 8, candidateY);
    };

    const candidates: number[] = [preferredX, minX, maxX];
    for (let x = minX; x <= maxX; x += step) candidates.push(x);

    let bestX = preferredX;
    let bestY = restingYAtX(preferredX);
    for (const candidateX of candidates) {
      const clampedX = Math.max(minX, Math.min(maxX, candidateX));
      const candidateY = restingYAtX(clampedX);
      const isLower = candidateY > bestY + 0.5;
      const isSimilarHeight = Math.abs(candidateY - bestY) <= 0.5;
      const isCloserToPreferred =
        Math.abs(clampedX - preferredX) < Math.abs(bestX - preferredX);

      if (isLower || (isSimilarHeight && isCloserToPreferred)) {
        bestX = clampedX;
        bestY = candidateY;
      }
    }

    placed.push({ x: bestX, y: bestY, r });
    return { b, size, xPos: bestX, yPos: bestY, seed };
  });

  return (
    <>
      {positioned.map(({ b, size, xPos, yPos, seed }) => {
        const paletteEntry = mode === "kcal" ? kcalColors.get(b.name) : undefined;
        const color =
          mode === "kcal"
            ? (paletteEntry?.color ?? kcalBubbleColor(b.name))
            : MACRO_COLORS[mode];
        const textColor =
          mode === "kcal"
            ? (paletteEntry?.text ?? kcalBubbleText(b.name))
            : mode === "carbs"
              ? "#3F2A00"
              : "#FFFFFF";
        return (
          <Bubble
            key={b.key}
            bubble={b}
            size={size}
            xPos={xPos}
            yPos={yPos}
            seed={seed}
            color={color}
            textColor={textColor}
            waveWidth={waveWidth}
            mode={mode}
            reduced={reduced}
            date={date}
            favorite={favorites.has(b.food_id)}
            onToggleFavorite={onToggleFavorite}
          />
        );
      })}
    </>
  );
}

function Bubble({
  bubble: b,
  size,
  xPos,
  yPos,
  seed,
  color,
  textColor,
  waveWidth,
  mode,
  reduced,
  date,
  favorite,
  onToggleFavorite,
}: {
  bubble: FoodBubbleData;
  size: number;
  xPos: number;
  yPos: number;
  seed: string;
  color: string;
  textColor: string;
  waveWidth: number;
  mode: MetricMode;
  reduced: boolean;
  date: Date;
  favorite: boolean;
  onToggleFavorite: (name: string) => void;
}) {
  const initialPhase = waveWidth > 0 ? 2 * Math.PI * (xPos / waveWidth) : 0;
  const initialSurfaceOffset = waveSurfaceOffset(initialPhase);

  // Y offset that follows the higher wave's surface at this bubble's x.
  const time = useTime();
  const waveY = useTransform(time, (t) => {
    if (reduced || waveWidth <= 0) return 0;
    const phase =
      2 * Math.PI * (xPos / waveWidth + (t % WAVE_PERIOD_MS) / WAVE_PERIOD_MS);
    return waveSurfaceOffset(phase) - initialSurfaceOffset;
  });

  // Gentle bob layered on top of the wave-follow translate.
  const swayDur = 3.6 + hash01(seed, 9) * 2.0;
  const bobAmp = 1.5 + hash01(seed, 17) * 2;
  const swayAmp = 1 + hash01(seed, 11) * 2;
  const delay = -hash01(seed, 19) * swayDur;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <motion.button
          className="absolute flex items-center justify-center rounded-full"
          initial={reduced ? false : { opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduced ? 0 : 0.22, ease: "easeOut" }}
          style={{
            left: xPos - size / 2,
            top: yPos - size / 2,
            width: size,
            height: size,
            y: waveY,
            background: `radial-gradient(circle at 30% 30%, ${color}ee, ${color}aa 60%, ${color}66)`,
            boxShadow:
              mode === "kcal"
                ? `inset -6px -8px 14px ${color}55, inset 0 -10px 14px ${color}88, inset 2px 2px 0 rgba(255,255,255,0.35), 0 0 0 1px rgba(255,255,255,0.28), 0 4px 10px ${color}44`
                : `inset -6px -8px 14px ${color}55, 0 4px 10px ${color}44`,
            border: `1px solid ${color}`,
            willChange: "transform",
          }}
          aria-label={`${date.getMonth() + 1}/${date.getDate()} ${b.name}`}
        >
          {mode === "kcal" && (
            <span
              aria-hidden
              className="pointer-events-none absolute rounded-full"
              style={{
                top: `${size * 0.1}px`,
                left: `${size * 0.16}px`,
                width: `${size * 0.26}px`,
                height: `${size * 0.22}px`,
                background:
                  "radial-gradient(ellipse at center, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.45) 38%, rgba(255,255,255,0) 75%)",
                filter: "blur(0.4px)",
              }}
            />
          )}
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
            <span
              className="px-1 text-center font-semibold leading-tight"
              style={{
                fontSize: size >= 28 ? 10 : 8,
                color:
                  mode === "kcal"
                    ? textColor
                    : mode === "carbs"
                      ? "#3F2A00"
                      : "#FFFFFF",
                maxWidth: size - 4,
                wordBreak: "keep-all",
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 2,
              }}
            >
              {b.name}
            </span>
          </motion.span>
        </motion.button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-56 p-3">
        <PopoverBody
          bubble={b}
          date={date}
          mode={mode}
          favorite={favorite}
          onToggle={() => onToggleFavorite(b.food_id)}
        />
      </PopoverContent>
    </Popover>
  );
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
        <div className="flex items-baseline gap-1.5">
          <span className="text-[13px] font-semibold text-neutral-900">
            {bubble.name}
          </span>
          {bubble.count > 1 && (
            <span
              className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-700"
              aria-label={`${bubble.count}회 섭취`}
            >
              ×{bubble.count}
            </span>
          )}
        </div>
        <button
          onClick={onToggle}
          aria-label={favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          className="rounded-full p-1 hover:bg-neutral-100"
        >
          <Star
            className="h-4 w-4"
            fill={favorite ? "#FFD700" : "none"}
            stroke={favorite ? "#FFD700" : "#9ca3af"}
          />
        </button>
      </div>
      <div className="mt-1 text-neutral-500">
        {date.getMonth() + 1}/{date.getDate()} · {bubble.kcal} kcal
        {bubble.count > 1 && (
          <span className="text-neutral-400"> · {bubble.count}회 합산</span>
        )}
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
