/**
 * ShareWeekButton — 기록 탭 헤더에 들어가는 3일치 공유 버튼.
 *
 * 클릭 → useShareWeek().share() → 어제·중심·내일 3일 로그 fetch → 1080×1350 카드.
 * 진행 중엔 spinner + disabled.
 */

import { Loader2, Share2 } from "lucide-react";
import { useShareWeek, type ShareWeekData } from "./useShareWeek";

interface Props {
  data: ShareWeekData;
}

export function ShareWeekButton({ data }: Props) {
  const { share, isSharing } = useShareWeek();
  return (
    <button
      type="button"
      onClick={() => void share(data)}
      disabled={isSharing}
      aria-label="3일간 흐름 공유"
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
