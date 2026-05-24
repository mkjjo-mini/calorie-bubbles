/**
 * 인스타그램 스토리 (1080×1920) 카드 합성.
 *
 * 입력: 홈 bowl 영역 스크린샷(canvas) + 데이터
 * 출력: 1080×1920 캔버스 (PNG 변환 준비됨)
 *
 * 디자인 의도:
 *  - 깔끔한 흰 배경 + 큰 칼로리 숫자 = 한 눈에 정보 전달
 *  - 캡처된 bubble 영역이 시각적 주인공 (탄단지 고유 비주얼)
 *  - tandanjibubble.app watermark = 바이럴 → 다운로드 유도
 */

import { MACRO_COLORS } from "@/lib/foods";

const W = 1080;
const H = 1920;

// 폰트 스택 — iOS WebView는 Apple SD Gothic Neo 사용
const FONT = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", system-ui, sans-serif';

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

export function composeStoryCard(input: StoryComposerInput): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context 미지원");

  // 배경
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  // ─── 상단 영역 (브랜드 + 날짜) ───────────────
  ctx.fillStyle = "#A3A3A3"; // neutral-400
  ctx.font = `500 34px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("탄단지버블", W / 2, 140);

  ctx.fillStyle = "#171717"; // neutral-900
  ctx.font = `700 72px ${FONT}`;
  ctx.fillText(formatDateKo(input.date), W / 2, 230);

  // ─── 중앙 영역 (bubble 캡처 또는 fallback) ────
  const bubbleAreaTop = 290;
  const bubbleAreaH = 1060;
  const bubbleAreaW = W - 120; // 양쪽 60px 여백

  if (input.bubbleCanvas) {
    const src = input.bubbleCanvas;
    // 비율 유지하며 영역 내 fit
    const scale = Math.min(bubbleAreaW / src.width, bubbleAreaH / src.height);
    const w = src.width * scale;
    const h = src.height * scale;
    const x = (W - w) / 2;
    const y = bubbleAreaTop + (bubbleAreaH - h) / 2;
    ctx.drawImage(src, x, y, w, h);
  } else {
    // bubble 캡처 없으면 큰 칼로리 숫자로 대체
    ctx.fillStyle = "#171717";
    ctx.font = `900 280px ${FONT}`;
    ctx.fillText(`${input.totalKcal}`, W / 2, bubbleAreaTop + bubbleAreaH / 2);
  }

  // ─── 하단 영역 (칼로리 + 매크로 + 워터마크) ────
  const bottomY = 1430;

  // 칼로리 — 큰 숫자 + 작은 목표
  ctx.fillStyle = "#171717";
  ctx.font = `900 140px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(`${input.totalKcal}`, W / 2, bottomY);

  ctx.fillStyle = "#737373"; // neutral-500
  ctx.font = `500 38px ${FONT}`;
  ctx.fillText(`/ ${input.goalKcal} kcal`, W / 2, bottomY + 60);

  // 매크로 — 3개 점 + g 표시
  const macroY = bottomY + 170;
  const macros = [
    { color: MACRO_COLORS.carbs, label: "탄", value: input.carbG },
    { color: MACRO_COLORS.protein, label: "단", value: input.proteinG },
    { color: MACRO_COLORS.fat, label: "지", value: input.fatG },
  ];

  // 매크로 표시 — 중앙 정렬을 위해 폭 측정
  ctx.font = `600 44px ${FONT}`;
  const macroStrs = macros.map((m) => `${m.label} ${Math.round(m.value)}g`);
  const dotW = 24; // 점 크기
  const dotTextGap = 20; // 점-텍스트 간격
  const macroGap = 70; // 매크로 사이 간격
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
    ctx.fillStyle = "#404040"; // neutral-700
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(macroStrs[i], cursorX, macroY);
    cursorX += widths[i] + macroGap;
  });

  // 워터마크
  ctx.fillStyle = "#A3A3A3";
  ctx.font = `500 32px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("tandanjibubble.app", W / 2, H - 80);

  return canvas;
}
