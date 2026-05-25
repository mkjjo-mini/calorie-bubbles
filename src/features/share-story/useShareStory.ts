/**
 * useShareStory — 홈 상단 share 버튼이 호출하는 훅.
 *
 * 흐름:
 *  1. data-share-bubble 영역 html2canvas로 캡처
 *  2. storyComposer로 1080×1920 카드 합성
 *  3. 결과 PNG를 Web Share API 또는 download fallback으로 전달
 *
 * 의존성:
 *  - html2canvas (DOM → canvas)
 *  - 시스템 Web Share API (iOS WebView 12.2+ 지원)
 *  - SSR-safe: 모든 browser-only 모듈은 dynamic import
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

export function useShareStory(): UseShareStoryResult {
  const [isSharing, setIsSharing] = useState(false);

  const share = useCallback(async (data: ShareStoryData) => {
    if (typeof window === "undefined") return;
    if (isSharing) return; // 중복 클릭 방지
    setIsSharing(true);

    try {
      // 1. bubble 영역 캡처 — 실패해도 카드 생성 진행 (storyComposer가 fallback 처리)
      let bubbleCanvas: HTMLCanvasElement | null = null;
      const target = document.querySelector(BUBBLE_SELECTOR) as HTMLElement | null;
      if (target) {
        try {
          const { default: html2canvas } = await import("html2canvas");
          bubbleCanvas = await html2canvas(target, {
            backgroundColor: "#ffffff", // null → 일부 브라우저에서 검정 처리되는 이슈 회피
            scale: 2,
            useCORS: true,
            allowTaint: false,
            logging: false,
            // SVG·foreignObject 호환성 향상
            foreignObjectRendering: false,
            // 화면 밖 요소는 무시 — bowl 자체는 화면 안에 있으므로 영향 X
            removeContainer: true,
          });
        } catch (e) {
          // bubble 캡처 실패해도 카드는 만들 수 있음 (텍스트 위주 fallback)
          console.warn("[share-story] bubble 캡처 실패 — 텍스트 fallback으로 진행", e);
          bubbleCanvas = null;
        }
      }

      // 2. 1080×1920 카드 합성
      const card = composeStoryCard({ ...data, bubbleCanvas });

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
        // 다운로드 fallback (웹 브라우저 등)
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
      // 사용자가 share sheet에서 cancel한 경우는 throw됨 → 무시
      const msg = e instanceof Error ? e.message : String(e);
      const stack = e instanceof Error ? e.stack : "";
      if (msg.toLowerCase().includes("abort") || msg.includes("cancel")) {
        // 사용자 취소 — silent
      } else {
        console.error("[share-story] 실패:", msg, "\nStack:", stack, "\nRaw:", e);
        // 사용자에게 짧지만 단계 명시 — Web Inspector에서 stage 확인 가능
        toast.error(`공유 준비 실패: ${msg.slice(0, 60)}`);
      }
    } finally {
      setIsSharing(false);
    }
  }, [isSharing]);

  return { share, isSharing };
}
