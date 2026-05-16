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

// 식약처 식품영양성분DB 신규 endpoint (FoodNtrCpntDbInfo02).
// 2026년 기준 활용신청 시 발급되는 endpoint. 구버전 FoodNtrIrdntInfoService는
// deprecated되어 "Unexpected errors" 응답.
const ENDPOINT =
  "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02";

function getApiKey(): string | undefined {
  // Try process.env first (Vite dev SSR + Cloudflare Worker with polyfill),
  // fall back to import.meta.env for completeness.
  if (typeof process !== "undefined" && process.env?.FOOD_API_KEY) {
    return process.env.FOOD_API_KEY;
  }
  if (typeof import.meta !== "undefined" && import.meta.env?.FOOD_API_KEY) {
    return import.meta.env.FOOD_API_KEY as string;
  }
  return undefined;
}

export interface FoodApiPage {
  items: FoodApiResult[];
  pageNo: number;
  numOfRows: number;
  totalCount: number;
}

/**
 * Search 식품안전나라 (식약처) food DB via server proxy.
 * The API key never reaches the client.
 *
 * Empty query (<1 char) returns empty page without an API call.
 * On error, throws — caller decides how to surface to user.
 */
export const searchFood = createServerFn({ method: "GET" })
  .inputValidator((input: { q: string; pageNo?: number }) => {
    const q = typeof input?.q === "string" ? input.q.trim() : "";
    const pageNo = Math.max(1, Math.floor(input?.pageNo ?? 1));
    return { q, pageNo };
  })
  .handler(async ({ data }): Promise<FoodApiPage> => {
    const { q, pageNo } = data;
    if (q.length < 1) {
      return { items: [], pageNo, numOfRows: 20, totalCount: 0 };
    }

    const key = getApiKey();
    if (!key) {
      throw new Error(
        "FOOD_API_KEY not configured (check .env.local for dev or wrangler secret for prod)",
      );
    }

    const NUM_OF_ROWS = 20;
    const url = new URL(ENDPOINT);
    url.searchParams.set("serviceKey", key);
    url.searchParams.set("FOOD_NM_KR", q);
    url.searchParams.set("pageNo", String(pageNo));
    url.searchParams.set("numOfRows", String(NUM_OF_ROWS));
    url.searchParams.set("type", "json");

    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Mask serviceKey value in URL before logging (it's URL-encoded, can't
      // simple replace the raw key)
      const safeUrl = url
        .toString()
        .replace(/serviceKey=[^&]+/i, "serviceKey=***");
      console.error(
        "[food-search] HTTP",
        res.status,
        "url=",
        safeUrl,
        "body=",
        body.slice(0, 500),
      );
      throw new Error(`식약처 API HTTP ${res.status}`);
    }
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      console.error("[food-search] non-JSON response", text.slice(0, 500));
      return { items: [], pageNo, numOfRows: NUM_OF_ROWS, totalCount: 0 };
    }
    // 신규 service envelope: { header, body: { items, totalCount, pageNo, numOfRows } }
    const items: any[] = json?.body?.items ?? [];
    const totalCount = Number.parseInt(json?.body?.totalCount, 10) || 0;
    // Hard cap to protect daily API quota — clients should not fetch beyond 100 results per query
    const MAX_TOTAL = 100;
    const cappedTotal = Math.min(totalCount, MAX_TOTAL);

    // 신규 service field mapping (FoodNtrCpntDbInfo02):
    //   AMT_NUM1 = 에너지(kcal), AMT_NUM3 = 단백질(g), AMT_NUM4 = 지방(g),
    //   AMT_NUM6 = 탄수화물(g). 모두 SERVING_SIZE(보통 100g) 기준 값.
    //   Z10500 = 실제 1봉/1인분 무게 (예: 칼로리바란스 "76.00g"). 우선 사용.
    const mapped = items
      .map<FoodApiResult>((it) => {
        const kcal100 = Number.parseFloat(it.AMT_NUM1) || 0;
        const carb100 = Number.parseFloat(it.AMT_NUM6) || 0;
        const protein100 = Number.parseFloat(it.AMT_NUM3) || 0;
        const fat100 = Number.parseFloat(it.AMT_NUM4) || 0;

        // 1인분 무게 결정 우선순위: Z10500(실제 1봉) → SERVING_SIZE 숫자(보통 100) → 100
        const z = Number.parseFloat(it.Z10500);
        const ss = Number.parseFloat(it.SERVING_SIZE);
        const serving_g = z > 0 ? z : ss > 0 ? ss : 100;
        const ratio = serving_g / 100;

        return {
          source: "api",
          code: String(it.FOOD_CD ?? ""),
          name: String(it.FOOD_NM_KR ?? "").trim(),
          serving_g,
          kcal: Math.round(kcal100 * ratio),
          carb_g: Math.round(carb100 * ratio * 10) / 10,
          protein_g: Math.round(protein100 * ratio * 10) / 10,
          fat_g: Math.round(fat100 * ratio * 10) / 10,
          category: it.FOOD_CAT1_NM ? String(it.FOOD_CAT1_NM) : undefined,
        };
      })
      // Filter junk rows (0 kcal usually means missing data)
      .filter((f) => f.kcal > 0 && f.name.length > 0);

    return {
      items: mapped,
      pageNo,
      numOfRows: NUM_OF_ROWS,
      totalCount: cappedTotal,
    };
  });
