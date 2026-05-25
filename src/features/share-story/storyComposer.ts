/**
 * 인스타그램 스토리 (1080×1920) 카드 합성.
 *
 * 입력: 홈 bowl 영역 스크린샷(canvas) + 데이터
 * 출력: 1080×1920 캔버스 (PNG 변환 준비됨)
 *
 * 디자인 요소:
 *  - 좌측 상단: 앱 아이콘 + 브랜드명 + 날짜
 *  - 중앙 카피: "이날의 내 뱃속" (그릇 비유 → SNS 친화)
 *  - 중앙 시각: 캡처된 bubble (탄단지 고유 비주얼)
 *  - 하단: 칼로리·매크로·워터마크
 *
 * IG Story 안전 영역 (250px ~ 1670px) 안에 핵심 콘텐츠 배치.
 */

import { MACRO_COLORS } from "@/lib/foods";

const W = 1080;
const H = 1920;

// IG Story 안전 영역
const SAFE_TOP = 120;
const SAFE_BOTTOM = H - 250; // 1670

// 폰트 스택 — iOS WebView는 Apple SD Gothic Neo 사용
const FONT = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", system-ui, sans-serif';

const ICON_URL = "/icon-256.png";
const SHARE_COPY = "이날의 내 뱃속";

export interface StoryComposerInput {
  /** "2026-05-24" — 표시용으로 자체 포맷팅 */
  date: string;
  totalKcal: number;
  goalKcal: number;
  carbG: number;
  proteinG: number;
  fatG: number;
  /** 홈 bowl 영역 캡처 캔버스 (없으면 텍스트만으로 구성) */
  bubbleCanvas: HTMLCanvasElement | null;
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

/**
 * 둥근 사각형 path (border-radius 효과).
 * iOS 아이콘 마스크에 사용.
 */
function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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

export async function composeStoryCard(input: StoryComposerInput): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context 미지원");

  // 아이콘 로드 — 실패해도 카드 계속 그림
  let iconImg: HTMLImageElement | null = null;
  try {
    iconImg = await loadImage(ICON_URL);
  } catch (e) {
    console.warn("[story] 아이콘 로드 실패 — 텍스트만으로 진행", e);
  }

  // ─── 배경 ─────────────────────────────────────
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  // ─── 상단 좌측: 아이콘 + 브랜드 + 날짜 ────────
  const iconSize = 96;
  const iconX = 60;
  const iconY = SAFE_TOP;
  const textX = iconX + iconSize + 24;

  if (iconImg) {
    // iOS 앱 아이콘 스타일 마스크 (border-radius 22% ≈ 21px on 96)
    ctx.save();
    roundedRectPath(ctx, iconX, iconY, iconSize, iconSize, iconSize * 0.22);
    ctx.clip();
    ctx.drawImage(iconImg, iconX, iconY, iconSize, iconSize);
    ctx.restore();
  }

  // 브랜드명 (icon 옆 상단)
  ctx.fillStyle = "#171717";
  ctx.font = `700 38px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("탄단지버블", textX, iconY + 42);

  // 날짜 (icon 옆 하단)
  ctx.fillStyle = "#737373";
  ctx.font = `500 32px ${FONT}`;
  ctx.fillText(formatDateKo(input.date), textX, iconY + 82);

  // ─── 중앙: 카피 "이날의 내 뱃속" ───────────────
  ctx.fillStyle = "#171717";
  ctx.font = `800 88px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(SHARE_COPY, W / 2, 380);

  // ─── 중앙 시각: bubble 캡처 ───────────────────
  const bubbleAreaTop = 440;
  const bubbleAreaH = 880;
  const bubbleAreaW = W - 80; // 양쪽 40px 여백

  if (input.bubbleCanvas) {
    const src = input.bubbleCanvas;
    const scale = Math.min(bubbleAreaW / src.width, bubbleAreaH / src.height);
    const w = src.width * scale;
    const h = src.height * scale;
    const x = (W - w) / 2;
    const y = bubbleAreaTop + (bubbleAreaH - h) / 2;
    ctx.drawImage(src, x, y, w, h);
  } else {
    // fallback — 큰 kcal 숫자
    ctx.fillStyle = "#171717";
    ctx.font = `900 240px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(`${input.totalKcal}`, W / 2, bubbleAreaTop + bubbleAreaH / 2 + 80);
  }

  // ─── 하단: 칼로리 + 매크로 ────────────────────
  const bottomY = 1430;

  // 칼로리 — 큰 숫자
  ctx.fillStyle = "#171717";
  ctx.font = `900 120px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(`${input.totalKcal}`, W / 2, bottomY);

  // 목표
  ctx.fillStyle = "#737373";
  ctx.font = `500 36px ${FONT}`;
  ctx.fillText(`/ ${input.goalKcal} kcal`, W / 2, bottomY + 56);

  // 매크로 — 3개 점 + g
  const macroY = bottomY + 150;
  const macros = [
    { color: MACRO_COLORS.carbs, label: "탄", value: input.carbG },
    { color: MACRO_COLORS.protein, label: "단", value: input.proteinG },
    { color: MACRO_COLORS.fat, label: "지", value: input.fatG },
  ];

  ctx.font = `600 42px ${FONT}`;
  const macroStrs = macros.map((m) => `${m.label} ${Math.round(m.value)}g`);
  const dotW = 22;
  const dotTextGap = 16;
  const macroGap = 64;
  const widths = macroStrs.map((s) => ctx.measureText(s).width);
  const totalW =
    widths.reduce((s, w) => s + w + dotW + dotTextGap, 0) + macroGap * (macros.length - 1);
  let cursorX = (W - totalW) / 2;

  macros.forEach((m, i) => {
    // 점
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(cursorX + dotW / 2, macroY - 14, dotW / 2, 0, Math.PI * 2);
    ctx.fill();
    cursorX += dotW + dotTextGap;
    // 텍스트
    ctx.fillStyle = "#404040";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(macroStrs[i], cursorX, macroY);
    cursorX += widths[i] + macroGap;
  });

  // ─── 워터마크 (안전 영역 안) ───────────────────
  ctx.fillStyle = "#A3A3A3";
  ctx.font = `500 30px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("tandanjibubble.app", W / 2, SAFE_BOTTOM - 40);

  return canvas;
}
