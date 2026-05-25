/**
 * 3일치 흐름 공유 카드 — Canvas 자체 렌더.
 *
 * 1080×1350 (4:5) — 인스타 피드 / 카톡 / 카스토 호환.
 *
 * 구성:
 *  - 상단: icon + 탄단지버블 + 날짜 범위
 *  - 카피: "3일간 내가 먹은 [것들/탄수화물/단백질/지방]" (박다현체)
 *  - 본체: 단일 그릇 안에 3컬럼 (구분선 없음, 사용자 요청)
 *      · 각 컬럼 상단에 날짜·요일
 *      · 컬럼별 d3-force 버블
 *      · 그릇 바닥 wave
 *  - 하단: 요약 + 워터마크
 */

import type { FoodLogRow } from "@/lib/repository/types";
import { layoutWeek, type WeekMode } from "./weekLayout";

const W = 1080;
const H = 1350;
const FONT = 'Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", system-ui, sans-serif';
const COPY_FONT = '"Ownglyph PDH", "Gowun Dodum", Pretendard, system-ui, sans-serif';
const ICON_URL = "/icon-256.png";

// 그릇 영역
const BOWL_W = 720;
const BOWL_H = 750;
const BOWL_X = (W - BOWL_W) / 2; // 180
const BOWL_Y = 350; // 컬럼 라벨 아래

// 컬럼별 영역 (3개 균등 분할)
const COL_W = BOWL_W / 3; // 240

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

export interface WeekComposerInput {
  /** 어제·중심·내일 순서로 3개 */
  days: { dateIso: string; logs: FoodLogRow[] }[];
  mode: WeekMode;
  goalKcal: number;
}

function copyTextFor(mode: WeekMode): string {
  switch (mode) {
    case "kcal":
      return "3일간 내가 먹은 것들";
    case "carbs":
      return "3일간 내가 먹은 탄수화물";
    case "protein":
      return "3일간 내가 먹은 단백질";
    case "fat":
      return "3일간 내가 먹은 지방";
  }
}

function unitFor(mode: WeekMode): string {
  return mode === "kcal" ? "kcal" : "g";
}

function formatDateLabel(ymd: string): { md: string; weekday: string } {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return { md: `${m}/${d}`, weekday: WEEKDAY_KO[dt.getDay()] };
}

function formatRangeKo(fromIso: string, toIso: string): string {
  const f = formatDateLabel(fromIso);
  const t = formatDateLabel(toIso);
  return `${f.md} (${f.weekday}) ~ ${t.md} (${t.weekday})`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image load failed: ${src}`));
    img.src = src;
  });
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * 기록 탭 실제 탱크 배경 — 둥근 사각형 (borderRadius 20px).
 * history.tsx와 동일한 모양·gradient.
 */
function tankPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  roundedRectPath(ctx, x, y, w, h, 20);
}

function drawWaves(
  ctx: CanvasRenderingContext2D,
  bowlX: number,
  bowlY: number,
  bowlW: number,
  bowlH: number,
): void {
  const waveH = bowlW * 0.1;
  const waveTop = bowlY + bowlH - waveH;
  const segW = bowlW / 4;

  ctx.fillStyle = "rgba(116, 185, 255, 0.22)";
  ctx.beginPath();
  ctx.moveTo(bowlX, waveTop + waveH * 0.5);
  for (let i = 0; i < 4; i++) {
    const x0 = bowlX + segW * i;
    const cpX = x0 + segW * 0.5;
    const cpY = waveTop + waveH * (i % 2 === 0 ? 0.1 : 0.85);
    const x1 = x0 + segW;
    ctx.quadraticCurveTo(cpX, cpY, x1, waveTop + waveH * 0.5);
  }
  ctx.lineTo(bowlX + bowlW, bowlY + bowlH);
  ctx.lineTo(bowlX, bowlY + bowlH);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(255, 215, 0, 0.18)";
  ctx.beginPath();
  ctx.moveTo(bowlX, waveTop + waveH * 0.65);
  for (let i = 0; i < 4; i++) {
    const x0 = bowlX + segW * i;
    const cpX = x0 + segW * 0.5;
    const cpY = waveTop + waveH * (i % 2 === 0 ? 0.3 : 1.0);
    const x1 = x0 + segW;
    ctx.quadraticCurveTo(cpX, cpY, x1, waveTop + waveH * 0.65);
  }
  ctx.lineTo(bowlX + bowlW, bowlY + bowlH);
  ctx.lineTo(bowlX, bowlY + bowlH);
  ctx.closePath();
  ctx.fill();
}

function fillTextWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number = 2,
): void {
  const chars = Array.from(text);
  const lines: string[] = [];
  let current = "";
  for (const ch of chars) {
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
      if (lines.length >= maxLines - 1) break;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  const consumed = lines.reduce((s, l) => s + l.length, 0);
  if (consumed < chars.length && lines.length > 0) {
    const lastIdx = lines.length - 1;
    let last = lines[lastIdx];
    while (ctx.measureText(last + "…").width > maxWidth && last.length > 1) {
      last = last.slice(0, -1);
    }
    lines[lastIdx] = last + "…";
  }
  const totalH = lines.length * lineHeight;
  const startY = y - totalH / 2 + lineHeight / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, x, startY + i * lineHeight);
  });
}

export async function composeWeekCard(input: WeekComposerInput): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context 미지원");

  // 폰트 로드 보장
  if (typeof document !== "undefined" && document.fonts) {
    try {
      await Promise.all([
        document.fonts.load(`400 76px "Ownglyph PDH"`),
        document.fonts.load(`700 34px Pretendard`),
        document.fonts.load(`600 28px Pretendard`),
      ]);
      await document.fonts.ready;
    } catch {
      /* fallback */
    }
  }

  // 아이콘
  let iconImg: HTMLImageElement | null = null;
  try {
    iconImg = await loadImage(ICON_URL);
  } catch (e) {
    console.warn("[week] 아이콘 로드 실패", e);
  }

  // 배경
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  // ─── 상단: 아이콘 + 브랜드 + 날짜 범위 ────
  const iconSize = 80;
  const iconX = 50;
  const iconY = 60;
  const textX = iconX + iconSize + 20;

  if (iconImg) {
    ctx.save();
    roundedRectPath(ctx, iconX, iconY, iconSize, iconSize, iconSize * 0.22);
    ctx.clip();
    ctx.drawImage(iconImg, iconX, iconY, iconSize, iconSize);
    ctx.restore();
  }

  ctx.fillStyle = "#171717";
  ctx.font = `700 34px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("탄단지버블", textX, iconY + 36);

  ctx.fillStyle = "#737373";
  ctx.font = `500 26px ${FONT}`;
  const firstDate = input.days[0]?.dateIso ?? "";
  const lastDate = input.days[input.days.length - 1]?.dateIso ?? "";
  if (firstDate && lastDate) {
    ctx.fillText(formatRangeKo(firstDate, lastDate), textX, iconY + 72);
  }

  // ─── 카피 ────────────────────────────────
  ctx.fillStyle = "#171717";
  ctx.font = `400 68px ${COPY_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(copyTextFor(input.mode), W / 2, 250);

  // ─── 컬럼 라벨 (그릇 위) ───────────────────
  const labelY = BOWL_Y - 12;
  ctx.fillStyle = "#404040";
  ctx.font = `600 28px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  input.days.forEach((day, i) => {
    const { md, weekday } = formatDateLabel(day.dateIso);
    const colCenterX = BOWL_X + COL_W * i + COL_W / 2;
    // 날짜 + 요일 두 줄
    ctx.fillStyle = i === 1 ? "#171717" : "#737373"; // 중심 일자만 진하게
    ctx.font = `700 28px ${FONT}`;
    ctx.fillText(md, colCenterX, labelY - 30);
    ctx.fillStyle = i === 1 ? "#404040" : "#a3a3a3";
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText(weekday, colCenterX, labelY);
  });

  // ─── 탱크 (둥근 사각형) + 버블 + 물결 ──────
  // 탱크 배경 — history.tsx와 동일 gradient
  tankPath(ctx, BOWL_X, BOWL_Y, BOWL_W, BOWL_H);
  const tankGradient = ctx.createRadialGradient(
    BOWL_X + BOWL_W / 2,
    BOWL_Y + BOWL_H * 0.1,
    0,
    BOWL_X + BOWL_W / 2,
    BOWL_Y + BOWL_H * 0.1,
    BOWL_W * 1.0,
  );
  tankGradient.addColorStop(0, "#f8fafc");
  tankGradient.addColorStop(0.6, "#eef2f6");
  tankGradient.addColorStop(1, "#e5eaf0");
  ctx.fillStyle = tankGradient;
  ctx.fill();

  // 탱크 inset shadow 흉내 — 상단 안쪽 그림자
  ctx.save();
  tankPath(ctx, BOWL_X, BOWL_Y, BOWL_W, BOWL_H);
  ctx.clip();
  const insetGrad = ctx.createLinearGradient(0, BOWL_Y, 0, BOWL_Y + 30);
  insetGrad.addColorStop(0, "rgba(0,0,0,0.06)");
  insetGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = insetGrad;
  ctx.fillRect(BOWL_X, BOWL_Y, BOWL_W, 30);
  ctx.restore();

  // 탱크 안 클립
  ctx.save();
  tankPath(ctx, BOWL_X, BOWL_Y, BOWL_W, BOWL_H);
  ctx.clip();

  // 일자별 세로 구분선 (월요일 파란선 X — 사용자 요청, 모두 옅은 회색만)
  ctx.strokeStyle = "rgba(15, 23, 42, 0.06)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    const x = BOWL_X + COL_W * i;
    ctx.beginPath();
    ctx.moveTo(x, BOWL_Y);
    ctx.lineTo(x, BOWL_Y + BOWL_H);
    ctx.stroke();
  }

  // 물결
  drawWaves(ctx, BOWL_X, BOWL_Y, BOWL_W, BOWL_H);

  // 컬럼별 버블 레이아웃
  const layout = layoutWeek({
    days: input.days,
    mode: input.mode,
    columnWidth: COL_W,
    columnHeight: BOWL_H,
  });

  // 각 컬럼의 버블을 그릇 좌표계로 옮겨 그림
  layout.columns.forEach((col, i) => {
    const colOffsetX = BOWL_X + COL_W * i;
    for (const b of col.bubbles) {
      const cx = colOffsetX + b.x;
      const cy = BOWL_Y + b.y;

      // 반투명 솔리드
      const rgbMatch = b.color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
      const fillColor = rgbMatch
        ? `rgba(${parseInt(rgbMatch[1], 16)}, ${parseInt(rgbMatch[2], 16)}, ${parseInt(rgbMatch[3], 16)}, 0.88)`
        : b.color;
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.arc(cx, cy, b.r, 0, Math.PI * 2);
      ctx.fill();

      // 텍스트 (큰 버블만)
      if (b.r >= 28) {
        const fontSize = Math.min(22, b.r * 0.3);
        ctx.fillStyle = b.textColor === "dark" ? "#333" : "#fff";
        ctx.font = `600 ${fontSize}px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        fillTextWrapped(ctx, b.name, cx, cy, b.r * 1.6, fontSize * 1.15, 2);
      }
    }
  });

  ctx.restore(); // 그릇 클립 해제

  // ─── 하단 요약 ──────────────────────────────
  const summaryY = BOWL_Y + BOWL_H + 80;
  ctx.fillStyle = "#171717";
  ctx.font = `700 56px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`평균 ${layout.avgMetric}${unitFor(input.mode)}`, W / 2, summaryY);

  // 가장 많은 날 (있으면) — 중앙 정렬
  if (layout.topDay && layout.topDay.value > 0) {
    const t = formatDateLabel(layout.topDay.dateIso);
    ctx.fillStyle = "#737373";
    ctx.font = `500 28px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(
      `가장 많은 날 ${t.md} (${t.weekday}) ${Math.round(layout.topDay.value)}${unitFor(input.mode)}`,
      W / 2,
      summaryY + 46,
    );
  }

  // ─── 워터마크 ──────────────────────────────
  ctx.fillStyle = "#A3A3A3";
  ctx.font = `500 26px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("tandanjibubble.app", W / 2, H - 25);

  return canvas;
}
