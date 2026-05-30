/**
 * 3일치 데이터 → 컬럼별 d3-force 헤드리스 배치.
 *
 * 입력: 중심 날짜 ±1 (어제·중심·내일) — 각 일자의 음식 로그 배열
 * 출력: 3개 컬럼별 버블 위치 + 색상 + 텍스트
 */

import { forceCollide, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import { MACRO_COLORS, MACRO_KCAL, displayName } from "@/lib/foods";
import type { FoodLogRow } from "@/lib/repository/types";

export type WeekMode = "kcal" | "carbs" | "protein" | "fat";

/** 일자별 집계된 음식 (이름 같은 항목은 합산) */
export interface FoodBubble {
  key: string;
  name: string;
  carbs: number;
  protein: number;
  fat: number;
  kcal: number;
}

/** d3-force 결과 */
export interface LaidOutBubble {
  key: string;
  name: string;
  x: number;
  y: number;
  r: number;
  color: string;
  textColor: "dark" | "light";
}

export interface LaidOutColumn {
  dateIso: string;
  bubbles: LaidOutBubble[];
}

const KCAL_PALETTE: { color: string; text: "dark" | "light" }[] = [
  { color: "#5EC4B6", text: "light" },
  { color: "#9B8CE0", text: "light" },
  { color: "#F2A57C", text: "dark" },
  { color: "#4FB3C9", text: "light" },
  { color: "#E8B86E", text: "dark" },
  { color: "#C29BD8", text: "light" },
  { color: "#A8B86C", text: "dark" },
  { color: "#E58CA8", text: "light" },
  { color: "#7B95B5", text: "light" },
  { color: "#8FB08A", text: "dark" },
];

function hash01(s: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return (h % 1000) / 1000;
}

function normalizeKey(name: string): string {
  return displayName(name).trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

/** food log → FoodBubble 집계 (같은 음식 합산) */
export function aggregateFoodLogs(logs: FoodLogRow[]): FoodBubble[] {
  const map = new Map<string, FoodBubble>();
  for (const l of logs) {
    const name = displayName(l.food?.name ?? "");
    const key = normalizeKey(name);
    let b = map.get(key);
    if (!b) {
      b = { key, name, carbs: 0, protein: 0, fat: 0, kcal: 0 };
      map.set(key, b);
    }
    b.carbs += l.carb_g;
    b.protein += l.protein_g;
    b.fat += l.fat_g;
    // kcal: 매크로 g × kcal/g
    b.kcal += l.carb_g * MACRO_KCAL.carbs + l.protein_g * MACRO_KCAL.protein + l.fat_g * MACRO_KCAL.fat;
  }
  return Array.from(map.values());
}

function metricValue(b: FoodBubble, mode: WeekMode): number {
  if (mode === "kcal") return b.kcal;
  return b[mode];
}

/**
 * kcal 모드: 같은 음식은 같은 색, 다른 음식은 서로 다른 색 (palette 슬롯 충돌 방지).
 * history.tsx의 monthKcalColors 알고리즘과 동일 — hash 초기값 → 이미 쓴 슬롯이면 next available 탐색.
 */
function buildKcalColorMap(
  bubbles: FoodBubble[],
): Map<string, { color: string; text: "dark" | "light" }> {
  const map = new Map<string, { color: string; text: "dark" | "light" }>();
  const used = new Set<number>();
  // 등장 순서대로 색 배정 (일관성)
  for (const b of bubbles) {
    if (map.has(b.name)) continue;
    let idx = Math.floor(hash01(b.name, 1) * KCAL_PALETTE.length);
    if (used.has(idx)) {
      // 충돌 → 다음 빈 슬롯 찾기
      for (let i = 1; i < KCAL_PALETTE.length; i++) {
        const candidate = (idx + i) % KCAL_PALETTE.length;
        if (!used.has(candidate)) {
          idx = candidate;
          break;
        }
      }
    }
    used.add(idx);
    map.set(b.name, KCAL_PALETTE[idx]);
  }
  return map;
}

/** mode별 색상 + 텍스트 컬러 — kcal은 미리 만든 map 사용 */
function bubbleColors(
  b: FoodBubble,
  mode: WeekMode,
  kcalMap: Map<string, { color: string; text: "dark" | "light" }> | null,
): { color: string; textColor: "dark" | "light" } {
  if (mode === "kcal") {
    const e = kcalMap?.get(b.name) ?? KCAL_PALETTE[0];
    return { color: e.color, textColor: e.text };
  }
  const color = MACRO_COLORS[mode];
  // 노란 탄수: dark text / 빨강·파랑: light text
  return { color, textColor: mode === "carbs" ? "dark" : "light" };
}

interface Node extends SimulationNodeDatum {
  key: string;
  name: string;
  r: number;
}

interface LayoutColumnOptions {
  bubbles: FoodBubble[];
  mode: WeekMode;
  width: number;
  height: number;
  /** 전체 max metric value (3일치 통합 정규화에 사용) — 컬럼 간 상대 크기 일관 */
  maxMetric: number;
  /** kcal 모드 색상 매핑 (3일치 전체에서 사전 계산) */
  kcalColorMap: Map<string, { color: string; text: "dark" | "light" }> | null;
}

// 기록 탭 실제 매칭: 선형 보간 (BUBBLE_MIN ~ BUBBLE_MAX)
// history.tsx의 BUBBLE_MIN=20, MAX=96과 동일 공식. 공유 카드는 컬럼이 더 넓어 비례 확대.
const BUBBLE_MIN = 28;
const BUBBLE_MAX = 120;

/** 한 컬럼 안에서 d3-force로 버블 위치 계산 */
function layoutColumn(opts: LayoutColumnOptions): LaidOutBubble[] {
  const { bubbles, mode, width, height, maxMetric, kcalColorMap } = opts;
  if (bubbles.length === 0) return [];

  // 반지름: history.tsx와 동일한 선형 보간
  //   r = BUBBLE_MIN + (value / maxMetric) * (BUBBLE_MAX - BUBBLE_MIN)
  const nodes: Node[] = bubbles.map((b) => {
    const v = metricValue(b, mode);
    const ratio = maxMetric > 0 ? v / maxMetric : 0;
    const r = Math.max(
      BUBBLE_MIN,
      Math.min(BUBBLE_MAX, BUBBLE_MIN + ratio * (BUBBLE_MAX - BUBBLE_MIN)),
    );
    return {
      key: b.key,
      name: b.name,
      r,
      x: width / 2 + (Math.random() - 0.5) * 10,
      y: Math.max(r + 4, 10 + Math.random() * 20),
      vx: 0,
      vy: 0,
    };
  });

  const cx = width / 2;
  // 기록 탭 실제 매칭: 바닥 중력 (탱크가 세로로 길어 버블 자연스럽게 분포)
  const anchorY = height - 4;

  const sim = forceSimulation<Node>(nodes)
    .alphaDecay(0.03)
    .velocityDecay(0.55)
    .force("x", forceX(cx).strength(0.05))
    .force("y", forceY(anchorY).strength(0.18))
    .force("collide", forceCollide<Node>((d) => d.r + 2).strength(1).iterations(4))
    .stop();

  const clamp = () => {
    for (const n of nodes) {
      const r = n.r + 1;
      if (n.x! < r) n.x = r;
      if (n.x! > width - r) n.x = width - r;
      if (n.y! < r) n.y = r;
      if (n.y! > height - r) n.y = height - r;
    }
  };
  for (let i = 0; i < 300; i++) {
    sim.tick();
    clamp();
  }

  return nodes.map((n) => {
    const b = bubbles.find((x) => x.key === n.key)!;
    const { color, textColor } = bubbleColors(b, mode, kcalColorMap);
    return {
      key: n.key,
      name: n.name,
      x: n.x!,
      y: n.y!,
      r: n.r,
      color,
      textColor,
    };
  });
}

export interface LayoutWeekOptions {
  /** 어제·오늘·내일 순서대로 3개 */
  days: { dateIso: string; logs: FoodLogRow[] }[];
  mode: WeekMode;
  columnWidth: number;
  columnHeight: number;
}

export interface LayoutWeekResult {
  columns: LaidOutColumn[];
  /** 3일치 합산 metric (요약 표시용) */
  totalMetric: number;
  /** 일평균 */
  avgMetric: number;
  /** 가장 많은 날 (요일 + 값) */
  topDay: { dateIso: string; value: number } | null;
}

export function layoutWeek(options: LayoutWeekOptions): LayoutWeekResult {
  const { days, mode, columnWidth, columnHeight } = options;

  // 각 일자 집계
  const aggregated = days.map((d) => ({
    dateIso: d.dateIso,
    bubbles: aggregateFoodLogs(d.logs),
  }));

  // 3일치 통합 max metric — 컬럼 간 크기 일관성 위해
  let maxMetric = 0;
  for (const day of aggregated) {
    for (const b of day.bubbles) {
      const v = metricValue(b, mode);
      if (v > maxMetric) maxMetric = v;
    }
  }
  if (maxMetric === 0) maxMetric = 1;

  // kcal 모드: 3일치 전체 음식에 대해 색상 미리 배정 (충돌 회피)
  const allBubbles = aggregated.flatMap((d) => d.bubbles);
  const kcalColorMap = mode === "kcal" ? buildKcalColorMap(allBubbles) : null;

  // 각 컬럼 레이아웃
  const columns: LaidOutColumn[] = aggregated.map((day) => ({
    dateIso: day.dateIso,
    bubbles: layoutColumn({
      bubbles: day.bubbles,
      mode,
      width: columnWidth,
      height: columnHeight,
      maxMetric,
      kcalColorMap,
    }),
  }));

  // 요약 계산 — 0인 날짜는 평균에서 제외 (실제 기록한 날만 평균에 반영)
  let totalMetric = 0;
  let activeDayCount = 0; // metric > 0 인 일자 수
  let topDay: LayoutWeekResult["topDay"] = null;
  aggregated.forEach((day) => {
    const sum = day.bubbles.reduce((s, b) => s + metricValue(b, mode), 0);
    totalMetric += sum;
    if (sum > 0) activeDayCount += 1;
    if (!topDay || sum > topDay.value) {
      topDay = { dateIso: day.dateIso, value: sum };
    }
  });

  return {
    columns,
    totalMetric: Math.round(totalMetric),
    // 기록 있는 날만 분모로 — 0인 날짜 제외
    avgMetric: Math.round(totalMetric / Math.max(1, activeDayCount)),
    topDay,
  };
}
