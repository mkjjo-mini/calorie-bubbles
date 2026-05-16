import { createServerFn } from "@tanstack/react-start";

/**
 * Normalized food search result (from external API).
 * The shape is intentionally close to CustomFood so /add can render
 * api results next to customFoods uniformly.
 */
export interface FoodApiResult {
  source: "api";
  code: string; // FOOD_CD
  name: string; // FOOD_NM_KR
  serving_g: number; // SERVING_WT (g)
  kcal: number; // AMT_NUM1
  carb_g: number; // AMT_NUM7
  protein_g: number; // AMT_NUM8
  fat_g: number; // AMT_NUM9
  category?: string; // GROUP_NAME (식품군)
}

const ENDPOINT =
  "https://apis.data.go.kr/1471000/FoodNtrIrdntInfoService/getFoodNtrItdntList";

function getApiKey(): string | undefined {
  // Try process.env first (Vite dev SSR + Cloudflare Worker with polyfill),
  // fall back to import.meta.env for completeness.
  if (typeof process !== "undefined" && process.env?.FOOD_API_KEY) {
    return process.env.FOOD_API_KEY;
  }
  // @ts-expect-error import.meta.env may exist
  if (typeof import.meta !== "undefined" && import.meta.env?.FOOD_API_KEY) {
    // @ts-expect-error
    return import.meta.env.FOOD_API_KEY as string;
  }
  return undefined;
}

/**
 * Search 식품안전나라 (식약처) food DB via server proxy.
 * The API key never reaches the client.
 *
 * Empty query (or <2 chars) returns [] without an API call.
 * On error, throws — caller decides how to surface to user.
 */
export const searchFood = createServerFn({ method: "GET" })
  .inputValidator((q: string) => {
    if (typeof q !== "string") return "";
    return q.trim();
  })
  .handler(async ({ data: q }): Promise<FoodApiResult[]> => {
    if (q.length < 2) return [];

    const key = getApiKey();
    if (!key) {
      throw new Error(
        "FOOD_API_KEY not configured (check .env.local for dev or wrangler secret for prod)",
      );
    }

    const url = new URL(ENDPOINT);
    url.searchParams.set("serviceKey", key);
    url.searchParams.set("FOOD_NM_KR", q);
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("numOfRows", "20");
    url.searchParams.set("type", "json");

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`식약처 API HTTP ${res.status}`);
    }
    const json: any = await res.json();

    // 식약처 응답 envelope: { response: { body: { items: [...] } } }
    const items: any[] = json?.response?.body?.items ?? [];

    return items
      .map<FoodApiResult>((it) => ({
        source: "api",
        code: String(it.FOOD_CD ?? ""),
        name: String(it.FOOD_NM_KR ?? "").trim(),
        serving_g: Number.parseFloat(it.SERVING_WT) || 100,
        kcal: Number.parseFloat(it.AMT_NUM1) || 0,
        carb_g: Number.parseFloat(it.AMT_NUM7) || 0,
        protein_g: Number.parseFloat(it.AMT_NUM8) || 0,
        fat_g: Number.parseFloat(it.AMT_NUM9) || 0,
        category: it.GROUP_NAME ? String(it.GROUP_NAME) : undefined,
      }))
      // Filter junk rows (0 kcal usually means missing data)
      .filter((f) => f.kcal > 0 && f.name.length > 0);
  });
