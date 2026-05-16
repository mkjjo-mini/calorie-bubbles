import { useEffect, useRef, useState } from "react";
import {
  searchFood,
  type FoodApiResult,
} from "@/lib/food-search";

const CACHE_PREFIX = "food_search_cache_";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEBOUNCE_MS = 500;

interface CacheEntry {
  ts: number;
  data: FoodApiResult[];
}

function readCache(key: string): FoodApiResult[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: FoodApiResult[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ ts: Date.now(), data } satisfies CacheEntry),
    );
  } catch {
    /* quota — ignore */
  }
}

export interface UseFoodSearchState {
  results: FoodApiResult[];
  loading: boolean;
  error: string | null;
}

/**
 * Debounced food search hook against 식약처 API.
 * - <2 chars → no API call, results=[]
 * - cache hit within 24h → instant return, no API call
 * - cache miss → debounce 500ms → server function call → cache write
 */
export function useFoodSearch(query: string): UseFoodSearchState {
  const [state, setState] = useState<UseFoodSearchState>({
    results: [],
    loading: false,
    error: null,
  });
  const reqIdRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setState({ results: [], loading: false, error: null });
      return;
    }

    const cacheKey = q.toLowerCase();
    const cached = readCache(cacheKey);
    if (cached) {
      setState({ results: cached, loading: false, error: null });
      return;
    }

    const myReqId = ++reqIdRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));

    const t = setTimeout(async () => {
      try {
        const data = await searchFood({ data: q });
        // stale guard
        if (myReqId !== reqIdRef.current) return;
        writeCache(cacheKey, data);
        setState({ results: data, loading: false, error: null });
      } catch (e) {
        if (myReqId !== reqIdRef.current) return;
        const msg = e instanceof Error ? e.message : "검색에 실패했어요";
        setState({ results: [], loading: false, error: msg });
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(t);
  }, [query]);

  return state;
}
