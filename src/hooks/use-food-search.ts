import { useCallback, useEffect, useRef, useState } from "react";
import {
  searchFood,
  type FoodApiResult,
} from "@/lib/food-search";

// 캐시 schema version — 매핑/응답 shape 변경 시 bump해서 stale 캐시 자동 무효화
const CACHE_PREFIX = "food_search_cache_v3_"; // v3: page-aware cache (key = q__pageNo)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEBOUNCE_MS = 500;
const NUM_OF_ROWS = 20;
const MAX_RESULTS = 100; // 한 검색어당 최대 노출 (API quota 보호)

interface CacheEntry {
  ts: number;
  items: FoodApiResult[];
  totalCount: number;
}

function cacheKey(q: string, pageNo: number): string {
  return `${CACHE_PREFIX}${q.toLowerCase()}__p${pageNo}`;
}

function readCache(q: string, pageNo: number): CacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(q, pageNo));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey(q, pageNo));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(q: string, pageNo: number, entry: CacheEntry): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(cacheKey(q, pageNo), JSON.stringify(entry));
  } catch {
    /* quota — ignore */
  }
}

export interface UseFoodSearchState {
  results: FoodApiResult[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
}

/**
 * Paginated food search hook against 식약처 API.
 * - <1 char → empty
 * - debounce 500ms on first page
 * - localStorage cache per (q, page) for 24h, empty items not cached
 * - loadMore() fetches next page and appends (capped at MAX_RESULTS=100)
 */
export function useFoodSearch(query: string): UseFoodSearchState {
  const [results, setResults] = useState<FoodApiResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);
  const currentQueryRef = useRef("");

  // Reset and fetch first page when query changes (debounced)
  useEffect(() => {
    const q = query.trim();
    currentQueryRef.current = q;
    if (q.length < 1) {
      setResults([]);
      setTotalCount(0);
      setPage(1);
      setLoading(false);
      setError(null);
      return;
    }

    const cached = readCache(q, 1);
    if (cached) {
      setResults(cached.items);
      setTotalCount(cached.totalCount);
      setPage(1);
      setLoading(false);
      setError(null);
      return;
    }

    const myReqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);

    const t = setTimeout(async () => {
      try {
        const page1 = await searchFood({ data: { q, pageNo: 1 } });
        if (myReqId !== reqIdRef.current) return;
        if (page1.items.length > 0) {
          writeCache(q, 1, {
            ts: Date.now(),
            items: page1.items,
            totalCount: page1.totalCount,
          });
        }
        setResults(page1.items);
        setTotalCount(page1.totalCount);
        setPage(1);
        setLoading(false);
      } catch (e) {
        if (myReqId !== reqIdRef.current) return;
        setError(e instanceof Error ? e.message : "검색에 실패했어요");
        setResults([]);
        setTotalCount(0);
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(t);
  }, [query]);

  const hasMore =
    !loading &&
    results.length < Math.min(totalCount, MAX_RESULTS) &&
    page * NUM_OF_ROWS < MAX_RESULTS;

  const loadMore = useCallback(() => {
    const q = currentQueryRef.current;
    if (!q || loading || loadingMore) return;
    if (!hasMore) return;

    const nextPage = page + 1;
    setLoadingMore(true);
    setError(null);

    const cached = readCache(q, nextPage);
    if (cached) {
      setResults((prev) => [...prev, ...cached.items]);
      setPage(nextPage);
      setLoadingMore(false);
      return;
    }

    (async () => {
      try {
        const next = await searchFood({ data: { q, pageNo: nextPage } });
        if (q !== currentQueryRef.current) return; // query changed mid-flight
        if (next.items.length > 0) {
          writeCache(q, nextPage, {
            ts: Date.now(),
            items: next.items,
            totalCount: next.totalCount,
          });
        }
        setResults((prev) => [...prev, ...next.items]);
        setTotalCount(next.totalCount);
        setPage(nextPage);
      } catch (e) {
        setError(e instanceof Error ? e.message : "추가 검색에 실패했어요");
      } finally {
        setLoadingMore(false);
      }
    })();
  }, [page, hasMore, loading, loadingMore]);

  return { results, loading, loadingMore, error, hasMore, loadMore };
}
