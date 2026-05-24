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
      // 1. bubble 영역 캡처 (있으면)
      let bubbleCanvas: HTMLCanvasElement | null = null;
      const target = document.querySelector(BUBBLE_SELECTOR) as HTMLElement | null;
      if (target) {
        const { default: html2canvas } = await import("html2canvas");
        bubbleCanvas = await html2canvas(target, {
          backgroundColor: null,
          // 2배 scale → 1080px 카드에 넣어도 선명함
          scale: 2,
          useCORS: true,
          logging: false,
        });
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
      if (msg.toLowerCase().includes("abort") || msg.includes("cancel")) {
        // 사용자 취소 — silent
      } else {
        console.error("[share-story] 실패", e);
        toast.error("공유 준비에 실패했어요");
      }
    } finally {
      setIsSharing(false);
    }
  }, [isSharing]);

  return { share, isSharing };
}
