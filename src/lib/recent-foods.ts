/**
 * 최근 사용한 음식 — food_id 배열.
 *
 * 저장소: localStorage (UX 즉시성) + DB (food_logs, 디바이스 간 sync).
 * 진입 시 syncFromServer() 호출 → DB에서 가져와 localStorage 덮어씀.
 *
 * 동작 컴포넌트: 홈 QuickAddTray (표시), 음식추가 페이지(/add), AiAddSheet (등록 시 push).
 * 같은 탭 내 변경은 storage 이벤트가 안 발동하므로 custom event로 알린다.
 */
const RECENT_KEY = "recentFoods";
const RECENT_CHANGED_EVENT = "tandanji:recent-foods-changed";
const MAX_RECENTS = 10;

/**
 * DB(food_logs)에서 distinct food_id 최근 N개 가져와 localStorage 동기화.
 * 멀티 디바이스 사용 시 마지막 디바이스의 기록을 반영하기 위해 진입 시 호출.
 */
export async function syncFromServer(): Promise<string[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch(`/api/food-logs?recent=${MAX_RECENTS}`, {
      credentials: "include",
    });
    if (!res.ok) return readRecents();
    const ids = (await res.json()) as unknown;
    if (!Array.isArray(ids)) return readRecents();
    const filtered = ids.filter((x): x is string => typeof x === "string");
    localStorage.setItem(RECENT_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent(RECENT_CHANGED_EVENT));
    return filtered;
  } catch {
    return readRecents();
  }
}

export function readRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function pushRecent(foodId: string): string[] {
  if (typeof window === "undefined") return [];
  const next = [foodId, ...readRecents().filter((x) => x !== foodId)].slice(0, MAX_RECENTS);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(RECENT_CHANGED_EVENT));
  return next;
}

/**
 * 변경 구독. 컴포넌트가 useEffect에서 호출 → 같은 탭 내 다른 컴포넌트의 push에 반응.
 */
export function subscribeRecentChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(RECENT_CHANGED_EVENT, cb);
  // 크로스 탭(다른 윈도우)에서의 storage 이벤트도 처리
  const onStorage = (e: StorageEvent) => {
    if (e.key === RECENT_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(RECENT_CHANGED_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}
