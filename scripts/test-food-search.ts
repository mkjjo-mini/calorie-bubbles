/**
 * 식약처 벡터 검색 테스트 스크립트.
 *
 * 실행:
 *   npx tsx scripts/test-food-search.ts "닭가슴살"
 *   npx tsx scripts/test-food-search.ts "신라면"
 *   npx tsx scripts/test-food-search.ts "스타벅스 라떼"
 */

import * as fs from "node:fs";
import * as path from "node:path";

// .env.local 로드
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnvLocal();

const CF_ACCOUNT_ID = "0719cbc0852d8fee33d881aa1fe07fc1";
const FOOD_SEED_API_TOKEN = process.env.FOOD_SEED_API_TOKEN ?? "";
const EMBED_MODEL = "@cf/baai/bge-m3";
const VECTORIZE_INDEX = "food-items";
const TOP_K = 5;

async function embed(text: string): Promise<number[]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${EMBED_MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FOOD_SEED_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: [text] }),
    },
  );
  if (!res.ok) throw new Error(`embed HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { result?: { data?: number[][] } };
  return json.result?.data?.[0] ?? [];
}

async function query(vector: number[]) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/vectorize/v2/indexes/${VECTORIZE_INDEX}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FOOD_SEED_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vector,
        topK: TOP_K,
        returnMetadata: "all",
      }),
    },
  );
  if (!res.ok) throw new Error(`query HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as {
    result?: {
      matches?: Array<{
        id: string;
        score: number;
        metadata?: Record<string, unknown>;
      }>;
    };
  };
}

async function main() {
  const queryText = process.argv[2];
  if (!queryText) {
    console.error('사용법: npx tsx scripts/test-food-search.ts "검색어"');
    process.exit(1);
  }
  if (!FOOD_SEED_API_TOKEN) {
    console.error("FOOD_SEED_API_TOKEN 미설정");
    process.exit(1);
  }

  console.log(`\n🔍 검색어: "${queryText}"\n`);

  const vector = await embed(queryText);
  const result = await query(vector);
  const matches = result.result?.matches ?? [];

  if (!matches.length) {
    console.log("결과 없음");
    return;
  }

  console.log(`상위 ${matches.length}건:\n`);
  for (const m of matches) {
    const meta = m.metadata ?? {};
    const score = (m.score * 100).toFixed(1);
    const brand = meta.brand ? ` (${meta.brand})` : "";
    const threshold = m.score >= 0.78 ? "✅ LLM 스킵" : m.score >= 0.65 ? "🟡 RAG 주입" : "🔴 LLM 검색";
    console.log(`  ${threshold} [${score}%] ${meta.name}${brand}`);
    console.log(`         kcal:${meta.kcal} 탄:${meta.carb_g}g 단:${meta.protein_g}g 지:${meta.fat_g}g (${meta.serving_g}g 기준)\n`);
  }
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
