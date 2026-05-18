/**
 * 식약처 식품영양성분 API 직접 호출 (AI fallback 용).
 *
 * Worker 컨텍스트에서 호출 가능하도록 createServerFn 의존 없이 fetch만 사용.
 * (src/lib/food-search.ts는 클라이언트→서버 RPC용)
 */
import type { Env } from "../auth/env";

const ENDPOINT =
  "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02";

export interface FoodFallbackHit {
  code: string;
  name: string;
  /** 1인분 무게(g) — 식약처 Z10500 or SERVING_SIZE */
  serving_g: number;
  /** 1인분 기준 영양 */
  kcal: number;
  carb_g: number;
  protein_g: number;
  fat_g: number;
}

/**
 * 식약처에서 query로 검색해 가장 잘 맞는 항목의 영양 정보를 1인분 기준으로 반환.
 * `targetServingG`가 주어지면 그 무게로 스케일.
 *
 * @returns hit + 사용된 query + total count.  결과 없으면 hit=null.
 */
export async function fetchFoodFallback(
  env: Env,
  query: string,
  targetServingG?: number,
): Promise<{
  hit: FoodFallbackHit | null;
  scaled?: FoodFallbackHit;
  query: string;
  totalCount: number;
}> {
  if (!env.FOOD_API_KEY) {
    throw new Error("FOOD_API_KEY 미설정 (.env.local 확인)");
  }
  const q = query.trim();
  if (!q) {
    return { hit: null, query: q, totalCount: 0 };
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("serviceKey", env.FOOD_API_KEY);
  url.searchParams.set("FOOD_NM_KR", q);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "10");
  url.searchParams.set("type", "json");

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`식약처 API HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    return { hit: null, query: q, totalCount: 0 };
  }

  const body = (json.body ?? {}) as {
    items?: Array<Record<string, unknown>>;
    totalCount?: string | number;
  };
  const items = body.items ?? [];
  const totalCount =
    typeof body.totalCount === "number"
      ? body.totalCount
      : Number.parseInt(String(body.totalCount ?? "0"), 10) || 0;

  // 매크로 0이 아닌 첫 항목 채택
  const hit = pickBestHit(items);

  if (!hit) {
    return { hit: null, query: q, totalCount };
  }

  let scaled: FoodFallbackHit | undefined;
  if (typeof targetServingG === "number" && targetServingG > 0 && hit.serving_g > 0) {
    const ratio = targetServingG / hit.serving_g;
    scaled = {
      ...hit,
      serving_g: targetServingG,
      kcal: Math.round(hit.kcal * ratio),
      carb_g: Math.round(hit.carb_g * ratio * 10) / 10,
      protein_g: Math.round(hit.protein_g * ratio * 10) / 10,
      fat_g: Math.round(hit.fat_g * ratio * 10) / 10,
    };
  }

  return { hit, scaled, query: q, totalCount };
}

function pickBestHit(
  items: Array<Record<string, unknown>>,
): FoodFallbackHit | null {
  for (const it of items) {
    const kcal100 = Number.parseFloat(String(it.AMT_NUM1 ?? "")) || 0;
    if (kcal100 <= 0) continue; // junk row
    const carb100 = Number.parseFloat(String(it.AMT_NUM6 ?? "")) || 0;
    const protein100 = Number.parseFloat(String(it.AMT_NUM3 ?? "")) || 0;
    const fat100 = Number.parseFloat(String(it.AMT_NUM4 ?? "")) || 0;

    const z = Number.parseFloat(String(it.Z10500 ?? ""));
    const ss = Number.parseFloat(String(it.SERVING_SIZE ?? ""));
    const serving_g = z > 0 ? z : ss > 0 ? ss : 100;
    const ratio = serving_g / 100;

    return {
      code: String(it.FOOD_CD ?? ""),
      name: String(it.FOOD_NM_KR ?? "").trim(),
      serving_g,
      kcal: Math.round(kcal100 * ratio),
      carb_g: Math.round(carb100 * ratio * 10) / 10,
      protein_g: Math.round(protein100 * ratio * 10) / 10,
      fat_g: Math.round(fat100 * ratio * 10) / 10,
    };
  }
  return null;
}
