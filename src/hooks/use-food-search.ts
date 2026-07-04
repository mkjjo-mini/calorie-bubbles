import { useCallback, useEffect, useRef, useState } from "react";
import {
  searchFood,
  type FoodApiResult,
} from "@/lib/food-search";

// 캐시 schema version — 매핑/응답 shape 변경 시 bump해서 stale 캐시 자동 무효화
const CACHE_PREFIX = "food_search_cache_v4_"; // v4: category-aware cache (key = q__cat__pageNo)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEBOUNCE_MS = 500;
const NUM_OF_ROWS = 20;
const MAX_RESULTS = 100; // 한 검색어당 최대 노출 (API quota 보호)

interface CacheEntry {
  ts: number;
  items: FoodApiResult[];
  totalCount: number;
}

function cacheKey(q: string, category: string, pageNo: number): string {
  return `${CACHE_PREFIX}${q.toLowerCase()}__${category}__p${pageNo}`;
}

function readCache(q: string, category: string, pageNo: number): CacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(q, category, pageNo));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey(q, category, pageNo));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(q: string, category: string, pageNo: number, entry: CacheEntry): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(cacheKey(q, category, pageNo), JSON.stringify(entry));
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
export function useFoodSearch(query: string, category?: string): UseFoodSearchState {
  const [results, setResults] = useState<FoodApiResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);
  const currentQueryRef = useRef("");
  // 캐시 키/재검색용 정규화된 category ("" = 전체). loadMore가 최신 값을 쓰도록 ref로도 보관.
  const cat = category ?? "";
  const currentCatRef = useRef("");
  // 직전 검색어 — category만 바뀌었는지 판별해 디바운스 스킵에 사용
  const lastQRef = useRef("");

  // Reset and fetch first page when query or category changes (debounced)
  useEffect(() => {
    const q = query.trim();
    currentQueryRef.current = q;
    currentCatRef.current = cat;
    // 검색어는 그대로고 category만 바뀐 경우 → 버튼 탭 반응성 위해 디바운스 없이 즉시 조회
    const categoryOnlyChange = lastQRef.current === q;
    lastQRef.current = q;
    if (q.length < 1) {
      setResults([]);
      setTotalCount(0);
      setPage(1);
      setLoading(false);
      setError(null);
      return;
    }

    const cached = readCache(q, cat, 1);
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
    // 검색 시작 시 이전(다른 필터) 결과 즉시 제거 → 로딩 표시만 보이게, 낡은 목록 잔상 방지
    setResults([]);
    setTotalCount(0);
    setPage(1);

    // 카테고리 탭은 타이핑이 아니므로 디바운스 없이 즉시 조회
    const debounceMs = categoryOnlyChange ? 0 : DEBOUNCE_MS;
    const t = setTimeout(async () => {
      try {
        const page1 = await searchFood({ data: { q, pageNo: 1, category: cat || undefined } });
        if (myReqId !== reqIdRef.current) return;
        if (page1.items.length > 0) {
          writeCache(q, cat, 1, {
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
    }, debounceMs);

    return () => clearTimeout(t);
  }, [query, cat]);

  const hasMore =
    !loading &&
    results.length < Math.min(totalCount, MAX_RESULTS) &&
    page * NUM_OF_ROWS < MAX_RESULTS;

  const loadMore = useCallback(() => {
    const q = currentQueryRef.current;
    const c = currentCatRef.current;
    if (!q || loading || loadingMore) return;
    if (!hasMore) return;

    const nextPage = page + 1;
    setLoadingMore(true);
    setError(null);

    const cached = readCache(q, c, nextPage);
    if (cached) {
      setResults((prev) => [...prev, ...cached.items]);
      setPage(nextPage);
      setLoadingMore(false);
      return;
    }

    (async () => {
      try {
        const next = await searchFood({ data: { q, pageNo: nextPage, category: c || undefined } });
        // query 또는 category가 도중에 바뀌면 폐기
        if (q !== currentQueryRef.current || c !== currentCatRef.current) return;
        if (next.items.length > 0) {
          writeCache(q, c, nextPage, {
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
