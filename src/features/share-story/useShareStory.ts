/**
 * useShareStory — 홈 상단 share 버튼이 호출하는 훅.
 *
 * C 접근(자체 캔버스 렌더) — DOM 캡처 없음.
 *  1. 데이터를 storyComposer로 그대로 전달
 *  2. composer가 Canvas API로 1080×1920 카드 직접 그림
 *  3. 결과 PNG를 Web Share API 또는 download fallback으로 전달
 *
 * 장점: 라이브러리 의존 0, 결정적 출력, 환경 무관 일관.
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { composeStoryCard, type StoryComposerInput } from "./storyComposer";

export type ShareStoryData = StoryComposerInput;

export interface UseShareStoryResult {
  share: (data: ShareStoryData) => Promise<void>;
  isSharing: boolean;
}

export function useShareStory(): UseShareStoryResult {
  const [isSharing, setIsSharing] = useState(false);

  const share = useCallback(async (data: ShareStoryData) => {
    if (typeof window === "undefined") return;
    if (isSharing) return;
    setIsSharing(true);

    try {
      // 1. 1080×1920 카드 합성 (composer가 d3-force 헤드리스 + canvas.arc로 자체 렌더)
      const card = await composeStoryCard(data);

      // 2. PNG Blob 변환
      const blob = await new Promise<Blob | null>((resolve) =>
        card.toBlob((b) => resolve(b), "image/png"),
      );
      if (!blob) throw new Error("이미지 생성 실패");

      const file = new File([blob], `tandanji-${data.date}.png`, { type: "image/png" });

      // 3. 공유 — Web Share API > 다운로드 fallback
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
