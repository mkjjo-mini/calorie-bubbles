/**
 * useShareWeek — 기록 탭 상단 share 버튼이 호출.
 *
 *  1. centerDate ±1 (어제·중심·내일) 3일치 로그 fetch
 *  2. weekComposer로 1080×1350 카드 합성
 *  3. PNG → Web Share API / 다운로드 fallback
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { cloudRepository } from "@/lib/repository/cloud";
import type { FoodLogRow } from "@/lib/repository/types";
import { composeWeekCard } from "./weekComposer";
import type { WeekMode } from "./weekLayout";

export interface ShareWeekData {
  /** 중심 일자 ISO (YYYY-MM-DD) */
  centerDate: string;
  mode: WeekMode;
  goalKcal: number;
}

export interface UseShareWeekResult {
  share: (data: ShareWeekData) => Promise<void>;
  isSharing: boolean;
}

function addDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function todayIso(): string {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function useShareWeek(): UseShareWeekResult {
  const [isSharing, setIsSharing] = useState(false);

  const share = useCallback(async (data: ShareWeekData) => {
    if (typeof window === "undefined") return;
    if (isSharing) return;
    setIsSharing(true);

    try {
      // 중심이 오늘이면 D-2 ~ 오늘 (미래 +1일은 데이터 없을 확률 높아 제외)
      // 외에는 D-1, 중심, D+1 표준
      const isToday = data.centerDate === todayIso();
      const dayOffsets = isToday ? [-2, -1, 0] : [-1, 0, 1];
      const dayIsos = dayOffsets.map((off) => addDays(data.centerDate, off));
      const fromDate = dayIsos[0];
      const toDate = dayIsos[dayIsos.length - 1];

      // 3일치 로그 fetch (단일 range 호출)
      const all = await cloudRepository.foodLogs.listByRange(fromDate, toDate);

      // 일자별 그룹
      const byDate = new Map<string, FoodLogRow[]>();
      for (const log of all) {
        const k = log.logged_date;
        if (!byDate.has(k)) byDate.set(k, []);
        byDate.get(k)!.push(log);
      }
      const days = dayIsos.map((iso) => ({
        dateIso: iso,
        logs: byDate.get(iso) ?? [],
      }));

      // 카드 합성
      const card = await composeWeekCard({
        days,
        mode: data.mode,
        goalKcal: data.goalKcal,
      });

      // PNG 변환
      const blob = await new Promise<Blob | null>((resolve) =>
        card.toBlob((b) => resolve(b), "image/png"),
      );
      if (!blob) throw new Error("이미지 생성 실패");

      const file = new File([blob], `tandanji-week-${data.centerDate}.png`, {
        type: "image/png",
      });

      const canShareFile =
        typeof navigator !== "undefined" &&
        "canShare" in navigator &&
        navigator.canShare?.({ files: [file] });

      if (canShareFile) {
        await navigator.share({
          files: [file],
          title: "탄단지버블",
          text: `3일간 흐름 · tandanjibubble.app`,
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
      if (msg.toLowerCase().includes("abort") || msg.includes("cancel")) {
        /* silent */
      } else {
        console.error("[share-week] 실패:", msg, e);
        toast.error(`공유 준비 실패: ${msg.slice(0, 60)}`);
      }
    } finally {
      setIsSharing(false);
    }
  }, [isSharing]);

  return { share, isSharing };
}
