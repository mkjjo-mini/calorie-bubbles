/**
 * 식약처 식품영양성분 DB → Cloudflare Vectorize 적재 스크립트.
 *
 * 실행 전 필요한 환경 변수 (.env.local 또는 shell):
 *   FOOD_API_KEY        — 공공데이터포털 API 키 (기존)
 *   CF_API_TOKEN        — Cloudflare API 토큰 (Workers AI + Vectorize write 권한)
 *                         발급: https://dash.cloudflare.com/profile/api-tokens
 *                         필요 권한: AI (write), Vectorize (edit)
 *   CF_ACCOUNT_ID       — Cloudflare 계정 ID (기본값 자동 설정)
 *
 * 실행:
 *   npx tsx scripts/seed-food-vectors.ts
 *
 * 인덱스 사전 생성 (최초 1회):
 *   npx wrangler vectorize create food-items --dimensions=1024 --metric=cosine
 */

import "dotenv/config"; // .env.local 자동 로드 (dotenv 설치 필요)

const CF_ACCOUNT_ID = "0719cbc0852d8fee33d881aa1fe07fc1";
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? "";
const FOOD_API_KEY = process.env.FOOD_API_KEY ?? "";
const VECTORIZE_INDEX = "food-items";
const EMBED_MODEL = "@cf/baai/bge-m3";
const FOOD_API_ENDPOINT =
  "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02";

// 배치 크기 (Workers AI 임베딩 한 번에 100개, Vectorize upsert 한 번에 500개)
const EMBED_BATCH = 100;
const UPSERT_BATCH = 500;

interface FoodRow {
  id: string;      // FOOD_CD
  name: string;    // FOOD_NM_KR
  kcal: number;    // AMT_NUM1 (100g 기준)
  carb_g: number;  // AMT_NUM6
  protein_g: number; // AMT_NUM3
  fat_g: number;   // AMT_NUM4
  serving_g: number; // Z10500 or SERVING_SIZE or 100
}

// ─── 식약처 API 전체 수집 ──────────────────────────────────────────────────

async function fetchAllFoods(): Promise<FoodRow[]> {
  const foods: FoodRow[] = [];
  let page = 1;
  const numOfRows = 100;

  console.log("식약처 API에서 음식 데이터 수집 중...");

  while (true) {
    const url = new URL(FOOD_API_ENDPOINT);
    url.searchParams.set("serviceKey", FOOD_API_KEY);
    url.searchParams.set("pageNo", String(page));
    url.searchParams.set("numOfRows", String(numOfRows));
    url.searchParams.set("type", "json");

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`식약처 API HTTP ${res.status}`);
    const json = (await res.json()) as Record<string, unknown>;

    const body = (json.body ?? {}) as {
      items?: Array<Record<string, unknown>>;
      totalCount?: string | number;
    };
    const items = body.items ?? [];
    const totalCount = Number(body.totalCount ?? 0);

    for (const it of items) {
      const kcal100 = Number.parseFloat(String(it.AMT_NUM1 ?? "")) || 0;
      if (kcal100 <= 0) continue;

      const z = Number.parseFloat(String(it.Z10500 ?? ""));
      const ss = Number.parseFloat(String(it.SERVING_SIZE ?? ""));
      const serving_g = z > 0 ? z : ss > 0 ? ss : 100;
      const ratio = serving_g / 100;

      foods.push({
        id: String(it.FOOD_CD ?? `food_${foods.length}`),
        name: String(it.FOOD_NM_KR ?? "").trim(),
        kcal: Math.round(kcal100 * ratio),
        carb_g: Math.round((Number.parseFloat(String(it.AMT_NUM6 ?? "")) || 0) * ratio * 10) / 10,
        protein_g: Math.round((Number.parseFloat(String(it.AMT_NUM3 ?? "")) || 0) * ratio * 10) / 10,
        fat_g: Math.round((Number.parseFloat(String(it.AMT_NUM4 ?? "")) || 0) * ratio * 10) / 10,
        serving_g,
      });
    }

    console.log(`  페이지 ${page} 수집 완료 (누적: ${foods.length}/${totalCount})`);

    if (foods.length >= totalCount || items.length < numOfRows) break;
    page++;

    // API 부하 방지
    await new Promise((r) => setTimeout(r, 200));
  }

  return foods;
}

// ─── Workers AI 임베딩 생성 ───────────────────────────────────────────────

async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${encodeURIComponent(EMBED_MODEL)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: texts }),
    },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Workers AI embed HTTP ${res.status}: ${err.slice(0, 200)}`);
  }

  const json = (await res.json()) as { result?: { data?: number[][] } };
  const data = json.result?.data;
  if (!data) throw new Error("Workers AI embed: result.data 없음");
  return data;
}

// ─── Vectorize upsert ────────────────────────────────────────────────────

async function upsertVectors(
  vectors: Array<{ id: string; values: number[]; metadata: Record<string, unknown> }>,
): Promise<void> {
  // Vectorize는 NDJSON 형식으로 upsert
  const ndjson = vectors.map((v) => JSON.stringify(v)).join("\n");

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/vectorize/v2/indexes/${VECTORIZE_INDEX}/upsert`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/x-ndjson",
      },
      body: ndjson,
    },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Vectorize upsert HTTP ${res.status}: ${err.slice(0, 200)}`);
  }
}

// ─── 메인 ─────────────────────────────────────────────────────────────────

async function main() {
  if (!CF_API_TOKEN) {
    console.error("❌ CF_API_TOKEN 미설정. .env.local에 추가하거나 환경 변수로 전달하세요.");
    process.exit(1);
  }
  if (!FOOD_API_KEY) {
    console.error("❌ FOOD_API_KEY 미설정.");
    process.exit(1);
  }

  // 1. 식약처 데이터 수집
  const foods = await fetchAllFoods();
  console.log(`\n총 ${foods.length}개 음식 항목 수집 완료\n`);

  // 2. 임베딩 생성 + Vectorize 적재 (배치)
  let embedded = 0;
  const pendingUpsert: Array<{ id: string; values: number[]; metadata: Record<string, unknown> }> = [];

  for (let i = 0; i < foods.length; i += EMBED_BATCH) {
    const batch = foods.slice(i, i + EMBED_BATCH);
    const texts = batch.map((f) => f.name);

    const vectors = await embedTexts(texts);

    for (let j = 0; j < batch.length; j++) {
      const food = batch[j];
      pendingUpsert.push({
        id: food.id,
        values: vectors[j],
        metadata: {
          name: food.name,
          kcal: food.kcal,
          carb_g: food.carb_g,
          protein_g: food.protein_g,
          fat_g: food.fat_g,
          serving_g: food.serving_g,
        },
      });
    }

    embedded += batch.length;
    console.log(`임베딩: ${embedded}/${foods.length}`);

    // Upsert 배치 도달 시 플러시
    if (pendingUpsert.length >= UPSERT_BATCH) {
      await upsertVectors(pendingUpsert.splice(0, UPSERT_BATCH));
      console.log(`  → Vectorize upsert ${UPSERT_BATCH}개 완료`);
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  // 잔여 upsert
  if (pendingUpsert.length > 0) {
    await upsertVectors(pendingUpsert);
    console.log(`  → Vectorize upsert ${pendingUpsert.length}개 완료`);
  }

  console.log("\n✅ 식약처 벡터 DB 적재 완료!");
  console.log(`   총 ${embedded}개 벡터 → Vectorize index: ${VECTORIZE_INDEX}`);
}

main().catch((e) => {
  console.error("❌ 오류:", e);
  process.exit(1);
});
