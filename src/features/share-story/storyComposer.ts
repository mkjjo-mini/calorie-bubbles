/**
 * 인스타그램 스토리 (1080×1920) 카드 자체 렌더 (Canvas 2D API 직접).
 *
 * DOM 캡처 안 함 — d3-force 헤드리스 + canvas.arc()로 완전 자체 그림.
 * 장점: 라이브러리 의존 0, 결정적 출력, 모든 환경 일관.
 *
 * 레이아웃:
 *  - 좌측 상단: 아이콘 + 브랜드 + 날짜
 *  - 중앙: "이날의 내 뱃속" + 그릇 + 버블
 *  - 하단: 칼로리 + 매크로 + 워터마크
 *
 * IG Story 안전 영역 (250 ~ 1670px) 안에 핵심 콘텐츠.
 */

import type { BubbleEntry } from "@/lib/foods";
import { MACRO_COLORS } from "@/lib/foods";
import { layoutBubbles } from "./bubbleLayout";

// 인스타그램 피드 4:5 비율 (1080×1350) — 정적 이미지 공유에 최적
//  · 피드 / 카톡 / 카스토 모두 호환
//  · 한국 SNS 표준 비율
//  · IG UI overlay 없어 safe area 불필요
const W = 1080;
const H = 1350;

// Pretendard — 본문·숫자·매크로 (모던 깔끔)
const FONT = 'Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", system-ui, sans-serif';
// 온글잎 박다현체 — 카피 ("이날의 내 뱃속") 전용 손글씨 폰트
const COPY_FONT = '"Ownglyph PDH", "Gowun Dodum", Pretendard, system-ui, sans-serif';
const ICON_URL = "/icon-256.png";
const SHARE_COPY = "이날의 내 뱃속";

// 그릇 영역 — 홈 비율 0.88:1 (W:H, 세로로 약간 김)
const BOWL_W = 720;
const BOWL_H = 800;
const BOWL_X = (W - BOWL_W) / 2; // 180
const BOWL_Y = 280;

export interface StoryComposerInput {
  date: string;
  totalKcal: number;
  goalKcal: number;
  carbG: number;
  proteinG: number;
  fatG: number;
  /** 홈에서 표시 중인 버블 데이터 (id·macro·grams·foodName) */
  bubbles: BubbleEntry[];
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function formatDateKo(ymd: string): string {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return `${m}월 ${d}일 (${WEEKDAY_KO[dt.getDay()]})`;
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
 * 그릇 모양 path — CSS `border-radius: 44% 44% 38% 38% / 18% 18% 50% 50%` 정확 재현.
 *
 * border-radius 문법: <h-radii> / <v-radii> — 각 모서리가 타원형 곡선.
 * 위 (TL/TR): H=44%, V=18% — 가로로 넓고 납작 (살짝 둥근 입구)
 * 아래 (BR/BL): H=38%, V=50% — 깊고 둥근 (그릇 바닥)
 *
 * Canvas ellipse(cx, cy, rX, rY, rotation, startAngle, endAngle)로
 * 각 모서리를 4분의 1 타원으로 그림.
 */
function bowlPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const tlH = w * 0.44, tlV = h * 0.18;
  const trH = w * 0.44, trV = h * 0.18;
  const brH = w * 0.38, brV = h * 0.5;
  const blH = w * 0.38, blV = h * 0.5;

  ctx.beginPath();
  // top edge
  ctx.moveTo(x + tlH, y);
  ctx.lineTo(x + w - trH, y);
  // top-right corner (3π/2 ~ 2π = -π/2 ~ 0)
  ctx.ellipse(x + w - trH, y + trV, trH, trV, 0, -Math.PI / 2, 0);
  // right edge
  ctx.lineTo(x + w, y + h - brV);
  // bottom-right corner (0 ~ π/2)
  ctx.ellipse(x + w - brH, y + h - brV, brH, brV, 0, 0, Math.PI / 2);
  // bottom edge
  ctx.lineTo(x + blH, y + h);
  // bottom-left corner (π/2 ~ π)
  ctx.ellipse(x + blH, y + h - blV, blH, blV, 0, Math.PI / 2, Math.PI);
  // left edge
  ctx.lineTo(x, y + tlV);
  // top-left corner (π ~ 3π/2)
  ctx.ellipse(x + tlH, y + tlV, tlH, tlV, 0, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

/**
 * 그릇 바닥의 물결 (홈 Wave 컴포넌트 정적 버전).
 *  - 파란 + 노란 두 겹 물결 (각 곡선 + 채움)
 *  - 그릇 아래쪽 ~48px 영역에 그림
 *  - 정적 (애니메이션 X — 공유 카드는 정지 이미지)
 */
function drawWaves(
  ctx: CanvasRenderingContext2D,
  bowlX: number,
  bowlY: number,
  bowlW: number,
  bowlH: number,
): void {
  const waveH = bowlW * 0.13; // 그릇 폭의 약 13% (홈 비율 비슷)
  const waveTop = bowlY + bowlH - waveH;
  const segW = bowlW / 4; // 한 파동의 가로 폭

  // 첫 번째 — 파란색 (홈 Wave 첫 번째 path 정적 버전)
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

  // 두 번째 — 노란색 (홈 Wave 두 번째 path 정적 버전, 위상 어긋남)
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

/**
 * 텍스트를 maxWidth 안에 자동 줄바꿈해서 그림. 최대 2줄 (글자 잘리면 ...).
 */
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
  // 남은 chars가 maxLines 초과면 마지막 줄에 ... 추가
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

export async function composeStoryCard(input: StoryComposerInput): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context 미지원");

  // 폰트 로드 보장 — canvas는 @font-face가 DOM에 사용되지 않으면 인식 안 함.
  // document.fonts.load()로 명시적 트리거 후 ready 대기.
  if (typeof document !== "undefined" && document.fonts) {
    try {
      await Promise.all([
        document.fonts.load(`400 76px "Ownglyph PDH"`),
        document.fonts.load(`700 34px Pretendard`),
        document.fonts.load(`900 96px Pretendard`),
      ]);
      await document.fonts.ready;
    } catch {
      /* fallback to system font */
    }
  }

  // 아이콘 로드 — 실패해도 카드 계속
  let iconImg: HTMLImageElement | null = null;
  try {
    iconImg = await loadImage(ICON_URL);
  } catch (e) {
    console.warn("[story] 아이콘 로드 실패", e);
  }

  // ─── 배경 ─────────────────────────────────
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  // ─── 상단 좌측: 아이콘 + 브랜드 + 날짜 ────
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
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText(formatDateKo(input.date), textX, iconY + 72);

  // ─── 중앙 카피 ("이날의 내 뱃속" — 귀여운 폰트) ────────
  ctx.fillStyle = "#171717";
  ctx.font = `400 76px ${COPY_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(SHARE_COPY, W / 2, 230);

  // ─── 그릇 + 버블 ─────────────────────────
  // 그릇 배경 (radial-gradient 흉내 — 위에서 밝고 아래로 약간 어두운 회색)
  bowlPath(ctx, BOWL_X, BOWL_Y, BOWL_W, BOWL_H);
  const bowlGradient = ctx.createRadialGradient(
    BOWL_X + BOWL_W / 2,
    BOWL_Y + BOWL_H * 0.1,
    0,
    BOWL_X + BOWL_W / 2,
    BOWL_Y + BOWL_H * 0.1,
    BOWL_W * 0.7,
  );
  bowlGradient.addColorStop(0, "#f8fafc");
  bowlGradient.addColorStop(0.6, "#eef2f6");
  bowlGradient.addColorStop(1, "#e5eaf0");
  ctx.fillStyle = bowlGradient;
  ctx.fill();

  // 그릇 안에서 버블 배치 — d3-force 헤드리스
  // 공유 카드는 "물에 떠 있는" 느낌: anchorY 70%, 약한 gravity
  if (input.bubbles.length > 0) {
    const laid = layoutBubbles(input.bubbles, {
      width: BOWL_W,
      height: BOWL_H,
      goalKcal: input.goalKcal,
      anchorYRatio: 0.7,
      yStrength: 0.1,
    });

    // 그릇 영역에 클립 (버블·물결이 경계 밖으로 못 나가게)
    ctx.save();
    bowlPath(ctx, BOWL_X, BOWL_Y, BOWL_W, BOWL_H);
    ctx.clip();

    // 물결 (버블 그리기 전에 — 버블이 위에 덮임)
    drawWaves(ctx, BOWL_X, BOWL_Y, BOWL_W, BOWL_H);

    // 각 버블 그리기 — 반투명 솔리드 원
    for (const b of laid) {
      const cx = BOWL_X + b.x;
      const cy = BOWL_Y + b.y;

      // 반투명 채움 (0.88)
      const rgb = b.color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
      const fillColor = rgb
        ? `rgba(${parseInt(rgb[1], 16)}, ${parseInt(rgb[2], 16)}, ${parseInt(rgb[3], 16)}, 0.88)`
        : b.color;

      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.arc(cx, cy, b.r, 0, Math.PI * 2);
      ctx.fill();

      // 텍스트 (큰 버블만)
      if (b.r >= 30) {
        const fontSize = Math.min(28, b.r * 0.32);
        ctx.fillStyle = b.textColor === "dark" ? "#333" : "#fff";
        ctx.font = `600 ${fontSize}px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // 버블 지름의 80% 안에 들어가게 wrap
        fillTextWrapped(ctx, b.foodName, cx, cy, b.r * 1.6, fontSize * 1.15, 2);
      }
    }

    ctx.restore();
  } else {
    // 빈 그릇 — 물결만 그림
    ctx.save();
    bowlPath(ctx, BOWL_X, BOWL_Y, BOWL_W, BOWL_H);
    ctx.clip();
    drawWaves(ctx, BOWL_X, BOWL_Y, BOWL_W, BOWL_H);
    ctx.restore();
    ctx.fillStyle = "#a3a3a3";
    ctx.font = `500 36px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("아직 빈 그릇", BOWL_X + BOWL_W / 2, BOWL_Y + BOWL_H / 2);
  }

  // ─── 하단: 칼로리 + 매크로 ─────────────────
  const bottomY = 1160;

  ctx.fillStyle = "#171717";
  ctx.font = `900 96px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`${input.totalKcal}`, W / 2, bottomY);

  ctx.fillStyle = "#737373";
  ctx.font = `500 32px ${FONT}`;
  ctx.fillText(`/ ${input.goalKcal} kcal`, W / 2, bottomY + 46);

  // 매크로
  const macroY = bottomY + 110;
  const macros = [
    { color: MACRO_COLORS.carbs, label: "탄", value: input.carbG },
    { color: MACRO_COLORS.protein, label: "단", value: input.proteinG },
    { color: MACRO_COLORS.fat, label: "지", value: input.fatG },
  ];
  ctx.font = `600 36px ${FONT}`;
  const macroStrs = macros.map((m) => `${m.label} ${Math.round(m.value)}g`);
  const dotW = 18;
  const dotTextGap = 14;
  const macroGap = 48;
  const widths = macroStrs.map((s) => ctx.measureText(s).width);
  const totalW =
    widths.reduce((s, w) => s + w + dotW + dotTextGap, 0) + macroGap * (macros.length - 1);
  let cursorX = (W - totalW) / 2;
  macros.forEach((m, i) => {
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(cursorX + dotW / 2, macroY - 14, dotW / 2, 0, Math.PI * 2);
    ctx.fill();
    cursorX += dotW + dotTextGap;
    ctx.fillStyle = "#404040";
    ctx.textAlign = "left";
    ctx.fillText(macroStrs[i], cursorX, macroY);
    cursorX += widths[i] + macroGap;
  });

  // ─── 워터마크 (매크로와 충분한 여백 확보) ──
  ctx.fillStyle = "#A3A3A3";
  ctx.font = `500 26px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("tandanjibubble.app", W / 2, H - 25);

  return canvas;
}
