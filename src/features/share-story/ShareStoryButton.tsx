/**
 * ShareStoryButton — 홈 헤더 우측에 들어가는 공유 버튼.
 *
 * 클릭 → useShareStory().share() → 1080×1920 카드 생성 → OS 공유 시트.
 * 무한 클릭 방지: 진행 중일 때는 spinner + disabled.
 */

import { Loader2, Share2 } from "lucide-react";
import { useShareStory, type ShareStoryData } from "./useShareStory";

interface Props {
  /** 카드에 넣을 데이터 (홈 화면 표시값 그대로) */
  data: ShareStoryData;
}

export function ShareStoryButton({ data }: Props) {
  const { share, isSharing } = useShareStory();

  return (
    <button
      type="button"
      onClick={() => void share(data)}
      disabled={isSharing}
      aria-label="현재 화면 공유"
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50"
    >
      {isSharing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Share2 className="h-4 w-4" />
      )}
    </button>
  );
}
