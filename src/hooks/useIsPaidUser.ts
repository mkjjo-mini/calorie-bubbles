/**
 * 유료 사용자 여부. /api/subscription-status 호출 결과를 sessionStorage 5분 캐시.
 * v1엔 서버가 FORCE_PAID env로 mock 응답 — BM 확정 후 실제 구독 조회로 교체.
 */
import { useEffect, useState } from "react";

const CACHE_KEY = "subscription_status";
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  value: boolean;
  exp: number;
}

function readCache(): CacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

function writeCache(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ value, exp: Date.now() + CACHE_TTL_MS } satisfies CacheEntry),
    );
  } catch {
    /* quota — ignore */
  }
}

export function useIsPaidUser(): { isPaid: boolean } {
  const [isPaid, setIsPaid] = useState<boolean>(() => {
    const cached = readCache();
    return cached && Date.now() < cached.exp ? cached.value : false;
  });

  useEffect(() => {
    const cached = readCache();
    if (cached && Date.now() < cached.exp) return; // 캐시 유효 → 네트워크 호출 skip

    let cancelled = false;
    fetch("/api/subscription-status", { credentials: "include" })
      .then((r) => {
        if (r.status === 401) return { isPaid: false };
        if (!r.ok) throw new Error(`subscription-status ${r.status}`);
        return r.json() as Promise<{ isPaid: boolean }>;
      })
      .then((data) => {
        if (cancelled) return;
        writeCache(data.isPaid);
        setIsPaid(data.isPaid);
      })
      .catch(() => {
        if (!cancelled) setIsPaid(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { isPaid };
}
