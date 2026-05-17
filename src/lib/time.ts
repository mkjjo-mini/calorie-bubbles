/**
 * KST 기준 오늘 날짜 (YYYY-MM-DD). user_goals.effective_from 등에 사용.
 * Intl.DateTimeFormat이 timezone 변환을 정확히 처리.
 */
export function todayKST(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  // en-CA = YYYY-MM-DD 포맷
  return parts;
}
