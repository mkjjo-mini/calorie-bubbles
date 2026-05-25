/**
 * 헤드리스 d3-force 버블 배치 (공유 카드 전용).
 *
 * 홈 BubbleField의 로직을 그대로 가져와 캔버스 사이즈에 맞춰 실행.
 * 애니메이션 없이 즉시 수렴(N tick)시켜 최종 좌표 반환.
 */

import { forceCollide, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import { MACRO_COLORS, MACRO_KCAL, type BubbleEntry } from "@/lib/foods";

export interface LaidOutBubble {
  id: string;
  x: number;
  y: number;
  r: number;
  color: string;
  foodName: string;
  /** 텍스트 컬러 — 가독성 위해 carbs는 dark, 나머지 white */
  textColor: "dark" | "light";
}

interface Node extends SimulationNodeDatum {
  id: string;
  r: number;
  macro: BubbleEntry["macro"];
  foodName: string;
}

function radiusForKcal(kcal: number, bowlArea: number, goalKcal: number, maxR: number): number {
  const PACKING = 0.78;
  const targetArea = bowlArea * PACKING;
  const area = (kcal / goalKcal) * targetArea;
  const r = Math.sqrt(Math.max(area, 0) / Math.PI);
  return Math.max(12, Math.min(maxR, r));
}

export interface LayoutOptions {
  width: number;
  height: number;
  goalKcal: number;
  /**
   * Y-anchor 비율 (height 대비). 0~1.
   * 홈 기본: ~1.0 (바닥). 공유 카드: 0.7 (물 위에 떠 있는 느낌).
   */
  anchorYRatio?: number;
  /** forceY strength. 홈: 0.18, 공유: 0.1 (덜 끌어내림) */
  yStrength?: number;
}

/**
 * 버블 위치를 즉시 수렴시켜 반환.
 * 입력: BubbleEntry 배열 + 캔버스 영역 (width, height)
 * 출력: 각 버블의 최종 (x, y, r, color, textColor)
 */
export function layoutBubbles(
  bubbles: BubbleEntry[],
  options: LayoutOptions,
): LaidOutBubble[] {
  if (bubbles.length === 0) return [];

  const { width, height, goalKcal, anchorYRatio = 1, yStrength = 0.18 } = options;
  const cx = width / 2;
  const anchorY = height * anchorYRatio - 4;
  const bowlArea = width * height;
  const maxR = height * 0.45;

  // 노드 초기화
  const nodes: Node[] = bubbles.map((b) => {
    const kcal = b.grams * MACRO_KCAL[b.macro];
    const r = radiusForKcal(kcal, bowlArea, goalKcal, maxR);
    return {
      id: b.id,
      r,
      macro: b.macro,
      foodName: b.foodName,
      x: cx + (Math.random() - 0.5) * 20,
      y: Math.max(r + 4, 10 + Math.random() * 20),
      vx: 0,
      vy: 0,
    };
  });

  // 헤드리스 시뮬레이션
  const sim = forceSimulation<Node>(nodes)
    .alphaDecay(0.03)
    .velocityDecay(0.55)
    .force("x", forceX(cx).strength(0.05))
    .force("y", forceY(anchorY).strength(yStrength))
    .force(
      "collide",
      forceCollide<Node>((d) => d.r + 2)
        .strength(1)
        .iterations(4),
    )
    .stop(); // 자동 실행 막고 수동 tick

  // 매 tick마다 경계 클램프 (홈과 동일)
  const clampToBounds = () => {
    for (const n of nodes) {
      const r = n.r + 1;
      if (n.x! < r) n.x = r;
      if (n.x! > width - r) n.x = width - r;
      if (n.y! < r) n.y = r;
      if (n.y! > height - r) n.y = height - r;
    }
  };

  // 충분히 수렴 (300 tick = 홈 알파 0.1 시작 시 ~3초 시뮬레이션)
  for (let i = 0; i < 300; i++) {
    sim.tick();
    clampToBounds();
  }

  return nodes.map((n) => ({
    id: n.id,
    x: n.x ?? cx,
    y: n.y ?? anchorY,
    r: n.r,
    color: MACRO_COLORS[n.macro],
    foodName: n.foodName,
    textColor: n.macro === "carbs" ? "dark" : "light",
  }));
}
