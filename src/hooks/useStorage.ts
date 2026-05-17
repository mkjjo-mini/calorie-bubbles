/**
 * useStorage() — 유료/무료에 따라 Cloud vs LocalStorage Repository 선택.
 *
 * v1 동작:
 *   - isPaid = false (default): localRepository (현재 stub)
 *   - isPaid = true: cloudRepository (Supabase 백엔드)
 *
 * 기존 컴포넌트는 localStorage 직접 호출 그대로 유지. 신규 컴포넌트
 * (Step 08 캘린더 등)부터 useStorage()로 통합 인터페이스 사용.
 * 마이그레이션은 별도 PR에서 점진 진행.
 *
 * 향후 (twin-write 패턴):
 *   유료 사용자: localStorage(1차) + cloud (best-effort) — 어제 PRD 설계
 *   현재는 단순 분기. twin-write는 마이그레이션 PR에서 함께 적용.
 */
import { useMemo } from "react";
import { cloudRepository } from "@/lib/repository/cloud";
import { localRepository } from "@/lib/repository/localStorage";
import type { Repository } from "@/lib/repository/types";
import { useIsPaidUser } from "./useIsPaidUser";

export function useStorage(): Repository {
  const { isPaid } = useIsPaidUser();
  return useMemo(() => (isPaid ? cloudRepository : localRepository), [isPaid]);
}
