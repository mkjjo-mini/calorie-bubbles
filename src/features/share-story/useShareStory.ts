/**
 * useShareStory — 홈 상단 share 버튼이 호출하는 훅.
 *
 * 흐름:
 *  1. data-share-bubble 영역 캡처 (dom-to-image-more 우선 → html2canvas fallback)
 *  2. storyComposer로 1080×1920 카드 합성
 *  3. 결과 PNG를 Web Share API 또는 download fallback으로 전달
 *
 * 캡처 라이브러리 선택 이유:
 *  - dom-to-image-more: CSS transforms (framer-motion)·SVG·border-radius 더 정확
 *  - html2canvas: 더 안정적이지만 transform·복잡한 border-radius·box-shadow inset에 약함
 *  - 둘 다 시도해보고 안 되면 텍스트 fallback
 *
 * SSR-safe: 모든 browser-only 모듈은 dynamic import.
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { composeStoryCard, type StoryComposerInput } from "./storyComposer";

export type ShareStoryData = Omit<StoryComposerInput, "bubbleCanvas">;

export interface UseShareStoryResult {
  share: (data: ShareStoryData) => Promise<void>;
  isSharing: boolean;
}

const BUBBLE_SELECTOR = "[data-share-bubble]";
const CAPTURE_SCALE = 2;
const SETTLE_MS = 300; // d3-force·framer-motion 잔여 애니메이션 안정화 대기

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}

async function captureViaDomToImage(el: HTMLElement): Promise<HTMLCanvasElement> {
  const mod = await import("dom-to-image-more");
  const domtoimage = mod.default ?? mod;
  const rect = el.getBoundingClientRect();
  const dataUrl: string = await domtoimage.toPng(el, {
    bgcolor: "#ffffff",
    width: rect.width * CAPTURE_SCALE,
    height: rect.height * CAPTURE_SCALE,
    style: {
      transform: `scale(${CAPTURE_SCALE})`,
      transformOrigin: "top left",
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    },
    quality: 1.0,
    cacheBust: true,
  });
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context 미지원");
  ctx.drawImage(img, 0, 0);
  return canvas;
}

async function captureViaHtml2Canvas(el: HTMLElement): Promise<HTMLCanvasElement> {
  const { default: html2canvas } = await import("html2canvas");
  return html2canvas(el, {
    backgroundColor: "#ffffff",
    scale: CAPTURE_SCALE,
    useCORS: true,
    allowTaint: false,
    logging: false,
    foreignObjectRendering: false,
    removeContainer: true,
  });
}

/**
 * 캡처 전 버블 버튼 inline style을 "깔끔한 반투명 솔리드 원"으로 단순화.
 *  - 그라데이션 → 반투명 솔리드 (3D 효과 제거 + 시각적 부드러움)
 *  - box-shadow/filter 모두 제거 (사각 bounding box 원천 차단)
 *  - outline·appearance·tap-highlight 등 브라우저 디폴트 리셋
 *  - 외곽 wrapper(motion.div)의 willChange도 임시 해제 (compositing 아티팩트 방지)
 *
 * 색상은 computed border-color에서 추출 (BubbleField: border: 1px solid ${color}).
 * 원본 inline style은 restore 함수로 복원.
 */
/**
 * 캡처 중에만 적용되는 임시 스타일.
 * 복원은 cssText 전체를 저장·복구 → 100% 원본 보장.
 *
 * 홈 화면 자체는 절대 영구 변경 X (try/finally로 100ms 내 복원).
 */
function simplifyBubbleStyles(target: HTMLElement): () => void {
  const buttons = target.querySelectorAll<HTMLElement>("button");
  const restorers: Array<() => void> = [];

  buttons.forEach((btn, i) => {
    // cssText 통째 저장 — 복원 100% 보장
    const originalCssText = btn.style.cssText;

    const macroColor = getComputedStyle(btn).borderColor || "rgb(180,180,180)";
    // 반투명 살짝만 (0.9) — 너무 흐릿하지 않고 부드러운 정도
    const rgbMatch = macroColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    const softColor = rgbMatch
      ? `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, 0.9)`
      : macroColor;

    // cssText에 통째 덮어쓰기 — 원본 inline + 새 값 모두 한 번에 깔끔히 교체
    // border 완전 제거 (사각으로 그려지는 dom-to-image 이슈 회피)
    // border-radius: 50% 명시 (Tailwind rounded-full 의존 X)
    // overflow: hidden (안쪽 콘텐츠 안전하게 클립)
    btn.style.cssText =
      `${originalCssText};` +
      `background: ${softColor} !important;` +
      `background-image: none !important;` +
      `background-clip: padding-box !important;` +
      `border: none !important;` +
      `border-radius: 50% !important;` +
      `overflow: hidden !important;` +
      `box-shadow: none !important;` +
      `filter: none !important;` +
      `outline: none !important;` +
      `appearance: none !important;` +
      `-webkit-appearance: none !important;` +
      `-webkit-tap-highlight-color: transparent !important;`;

    // 첫 버블만 computed style 디버그
    if (i === 0) {
      const cs = getComputedStyle(btn);
      console.log("[debug] 첫 버블 computed style:", {
        background: cs.background.slice(0, 60),
        boxShadow: cs.boxShadow,
        border: cs.border,
        outline: cs.outline,
        borderRadius: cs.borderRadius,
      });
    }

    restorers.push(() => {
      btn.style.cssText = originalCssText;
    });
  });

  // 외곽 wrapper(absolute div) — willChange 해제 + 혹시 모를 background·border·shadow 클리어
  const wrappers = target.querySelectorAll<HTMLElement>("div.absolute");
  wrappers.forEach((div) => {
    const origCss = div.style.cssText;
    div.style.cssText =
      `${origCss};` +
      `will-change: auto !important;` +
      `background: transparent !important;` +
      `background-image: none !important;` +
      `border: none !important;` +
      `box-shadow: none !important;` +
      `outline: none !important;` +
      `filter: none !important;`;
    restorers.push(() => {
      div.style.cssText = origCss;
    });
  });

  return () => restorers.forEach((r) => r());
}

async function captureBubbleArea(): Promise<HTMLCanvasElement | null> {
  const target = document.querySelector(BUBBLE_SELECTOR) as HTMLElement | null;
  if (!target) {
    console.warn("[share-story] data-share-bubble 요소 못 찾음");
    return null;
  }

  // 애니메이션 안정화 대기 + 버블 스타일 단순화
  await new Promise((r) => setTimeout(r, SETTLE_MS));
  const restoreStyles = simplifyBubbleStyles(target);
  // 스타일 적용 후 한 프레임 대기 (paint 보장)
  await new Promise((r) => requestAnimationFrame(() => r(null)));

  try {
    // Try 1: dom-to-image-more (CSS transform·SVG 더 정확)
    try {
      const canvas = await captureViaDomToImage(target);
      console.log("[share-story] 캡처 성공 (dom-to-image)", canvas.width, "x", canvas.height);
      return canvas;
    } catch (e) {
      console.warn("[share-story] dom-to-image 실패 — html2canvas로 재시도", e);
    }

    // Try 2: html2canvas fallback
    try {
      const canvas = await captureViaHtml2Canvas(target);
      console.log("[share-story] 캡처 성공 (html2canvas)", canvas.width, "x", canvas.height);
      return canvas;
    } catch (e) {
      console.error("[share-story] html2canvas도 실패", e);
      return null;
    }
  } finally {
    // 캡처 끝나면 inline 스타일 원복 (성공·실패 무관)
    restoreStyles();
  }
}

export function useShareStory(): UseShareStoryResult {
  const [isSharing, setIsSharing] = useState(false);

  const share = useCallback(async (data: ShareStoryData) => {
    if (typeof window === "undefined") return;
    if (isSharing) return;
    setIsSharing(true);

    try {
      // 1. bubble 영역 캡처
      const bubbleCanvas = await captureBubbleArea();
      if (!bubbleCanvas) {
        toast.warning("버블 영역 캡처에 실패해 텍스트로만 카드를 만들었어요");
      }

      // 2. 1080×1920 카드 합성 (async — icon 로드 포함)
      const card = await composeStoryCard({ ...data, bubbleCanvas });

      // 3. PNG Blob 변환
      const blob = await new Promise<Blob | null>((resolve) =>
        card.toBlob((b) => resolve(b), "image/png"),
      );
      if (!blob) throw new Error("이미지 생성 실패");

      const file = new File([blob], `tandanji-${data.date}.png`, { type: "image/png" });

      // 4. 공유 — Web Share API > 다운로드 fallback
      const canShareFile =
        typeof navigator !== "undefined" &&
        "canShare" in navigator &&
        navigator.canShare?.({ files: [file] });

      if (canShareFile) {
        await navigator.share({
          files: [file],
          title: "탄단지버블",
          text: `${data.date} 오늘의 칼로리 ${data.totalKcal}kcal · tandanjibubble.app`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success("이미지가 다운로드 폴더에 저장됐어요");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : "";
      if (msg.toLowerCase().includes("abort") || msg.includes("cancel")) {
        // 사용자 취소 — silent
      } else {
        console.error("[share-story] 실패:", msg, "\nStack:", stack, "\nRaw:", e);
        toast.error(`공유 준비 실패: ${msg.slice(0, 60)}`);
      }
    } finally {
      setIsSharing(false);
    }
  }, [isSharing]);

  return { share, isSharing };
}
