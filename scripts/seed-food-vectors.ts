/**
 * 식약처 식품영양성분 DB (Excel) → Cloudflare Vectorize 적재 스크립트.
 *
 * 데이터 소스:
 *   - 음식DB      (~19,495건): 20251229_음식DB 19495건.xlsx
 *   - 가공식품    (~277,074건): 20260429_가공식품_277074건.xlsx
 *   ※ 건강기능식품 제외 (컬럼 구조 다름, mg 단위)
 *
 * 실행 전 필요 환경 변수 (.env.local):
 *   CF_API_TOKEN  — Cloudflare API 토큰 (Workers AI write + Vectorize edit 권한)
 *                   https://dash.cloudflare.com/profile/api-tokens
 *
 * 실행:
 *   npx tsx scripts/seed-food-vectors.ts
 *
 * 인덱스 사전 생성 (최초 1회):
 *   npx wrangler vectorize create food-items --dimensions=1024 --metric=cosine
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

// dotenv 없어도 .env.local 수동 파싱
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
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? "";
const VECTORIZE_INDEX = "food-items";
const EMBED_MODEL = "@cf/baai/bge-m3";

// --limit N 또는 SEED_LIMIT=N 으로 테스트 실행 가능
// 예: npx tsx scripts/seed-food-vectors.ts --limit 500
const limitArg = process.argv.indexOf("--limit");
const SEED_LIMIT = limitArg !== -1
  ? Number(process.argv[limitArg + 1])
  : Number(process.env.SEED_LIMIT ?? 0); // 0 = 전체

// Excel 컬럼 인덱스 (음식DB·가공식품 공통 구조)
const COL = {
  id:       0,   // 식품코드
  name:     1,   // 식품명
  source:   2,   // 데이터구분코드 (D=음식, P=가공식품)
  unit:    16,   // 영양성분함량기준량 (100g)
  kcal:    17,   // 에너지(kcal) — 100g 기준
  protein: 19,   // 단백질(g) — 100g 기준
  fat:     20,   // 지방(g) — 100g 기준
  carb:    22,   // 탄수화물(g) — 100g 기준
  serving: 153,  // 1인(회)분량 참고량
  brand:   155,  // 업체명 (가공식품에 "농심", "오뚜기" 등 실 업체명 포함)
} as const;

// 배치 크기
const EMBED_BATCH = 100;   // Workers AI 임베딩 한 번에
const UPSERT_BATCH = 500;  // Vectorize upsert 한 번에

interface FoodRow {
  id: string;
  name: string;
  brand: string;       // 업체명 ("해당없음" 또는 실제 업체명)
  embedText: string;   // 임베딩용: "식품명 업체명" 또는 "식품명"
  source: "food" | "processed";
  kcal: number;
  carb_g: number;
  protein_g: number;
  fat_g: number;
  serving_g: number;
}

// ─── Excel 파싱 (xlsx를 직접 파싱하기보다 python으로 처리 후 JSON 읽기) ────

async function parseExcelToJson(xlsxPath: string, label: string, limit = 0): Promise<FoodRow[]> {
  const tmpJson = `/tmp/food_${label}_${Date.now()}.json`;

  // Python으로 Excel → JSON 변환 (limit > 0이면 상위 N건만)
  const pythonScript = `
import openpyxl, json, sys

wb = openpyxl.load_workbook('${xlsxPath}', read_only=True, data_only=True)
ws = wb.active
rows = []
first = True
limit = ${limit}
for row in ws.iter_rows(values_only=True):
    if first:
        first = False
        continue  # 헤더 스킵
    if limit > 0 and len(rows) >= limit:
        break
    if row[1] is None:
        continue  # 식품명 없는 행 스킵
    kcal = float(row[17] or 0)
    if kcal <= 0:
        continue  # 칼로리 없는 행 스킵
    serving_raw = row[153]
    try:
        serving_g = float(str(serving_raw).replace('g','').replace('ml','').strip()) if serving_raw else 100
        if serving_g <= 0: serving_g = 100
    except:
        serving_g = 100
    name  = str(row[1] or '').strip()
    brand = str(row[155] or '').strip()
    brand = '' if brand in ('해당없음', 'None', '') else brand
    embed_text = f'{name} {brand}'.strip() if brand else name
    rows.append({
        'id':         str(row[0] or ''),
        'name':       name,
        'brand':      brand,
        'embedText':  embed_text,
        'source':     'food' if str(row[2] or '') == 'D' else 'processed',
        'kcal':       round(kcal * serving_g / 100),
        'carb_g':     round(float(row[22] or 0) * serving_g / 100, 1),
        'protein_g':  round(float(row[19] or 0) * serving_g / 100, 1),
        'fat_g':      round(float(row[20] or 0) * serving_g / 100, 1),
        'serving_g':  serving_g,
    })
wb.close()
json.dump(rows, open('${tmpJson}', 'w', encoding='utf-8'), ensure_ascii=False)
print(len(rows))
`;

  const scriptPath = `/tmp/parse_excel_${Date.now()}.py`;
  fs.writeFileSync(scriptPath, pythonScript);

  const { execSync } = await import("node:child_process");
  const count = execSync(`python3 ${scriptPath}`, { encoding: "utf8" }).trim();
  fs.unlinkSync(scriptPath);

  const rows = JSON.parse(fs.readFileSync(tmpJson, "utf8")) as FoodRow[];
  fs.unlinkSync(tmpJson);

  console.log(`  ${label}: ${count}건 파싱 완료`);
  return rows;
}

// ─── Workers AI 임베딩 생성 ───────────────────────────────────────────────

async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${EMBED_MODEL}`,
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
    throw new Error(`Workers AI embed HTTP ${res.status}: ${err.slice(0, 300)}`);
  }

  const json = (await res.json()) as { result?: { data?: number[][] } };
  const data = json.result?.data;
  if (!data?.length) throw new Error("Workers AI: result.data 없음");
  return data;
}

// ─── Vectorize upsert ────────────────────────────────────────────────────

async function upsertVectors(
  vectors: Array<{ id: string; values: number[]; metadata: Record<string, unknown> }>,
): Promise<void> {
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
    const errText = await res.text().catch(() => "");
    throw new Error(`Vectorize upsert HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }
}

// ─── 진행률 표시 ──────────────────────────────────────────────────────────

function progress(done: number, total: number, label: string) {
  const pct = Math.round((done / total) * 100);
  const bar = "█".repeat(Math.floor(pct / 5)) + "░".repeat(20 - Math.floor(pct / 5));
  process.stdout.write(`\r${label} [${bar}] ${pct}% (${done}/${total})`);
  if (done === total) process.stdout.write("\n");
}

// ─── 메인 ─────────────────────────────────────────────────────────────────

async function main() {
  if (!CF_API_TOKEN) {
    console.error("❌ CF_API_TOKEN 미설정. .env.local에 CF_API_TOKEN=xxx 추가");
    process.exit(1);
  }

  // 1. Excel 파일 경로 확인
  const DATA_DIR = path.resolve(process.cwd(), "data/food-db");
  const FILES = [
    { path: path.join(DATA_DIR, "20251229_음식DB 19495건.xlsx"),     label: "음식DB" },
    { path: path.join(DATA_DIR, "20260429_가공식품_277074건.xlsx"),   label: "가공식품" },
  ];

  for (const f of FILES) {
    if (!fs.existsSync(f.path)) {
      console.error(`❌ 파일 없음: ${f.path}`);
      process.exit(1);
    }
  }

  // 2. Excel 파싱
  console.log("\n📂 Excel 파싱 중...");
  const allFoods: FoodRow[] = [];
  let remaining = SEED_LIMIT; // 0 = 전체
  for (const f of FILES) {
    if (SEED_LIMIT > 0 && allFoods.length >= SEED_LIMIT) break;
    const perFileLimit = SEED_LIMIT > 0 ? Math.max(0, remaining) : 0;
    const rows = await parseExcelToJson(f.path, f.label, perFileLimit);
    allFoods.push(...rows);
    remaining = Math.max(0, SEED_LIMIT - allFoods.length);
  }
  console.log(`\n총 ${allFoods.length.toLocaleString()}건 로드 완료`);

  const foods = SEED_LIMIT > 0 ? allFoods.slice(0, SEED_LIMIT) : allFoods;
  if (SEED_LIMIT > 0) {
    console.log(`⚠️  테스트 모드: 상위 ${SEED_LIMIT.toLocaleString()}건만 처리\n`);
  } else {
    console.log();
  }

  // 3. 임베딩 생성 + Vectorize 적재
  const pending: Array<{ id: string; values: number[]; metadata: Record<string, unknown> }> = [];
  let done = 0;

  for (let i = 0; i < foods.length; i += EMBED_BATCH) {
    const batch = foods.slice(i, i + EMBED_BATCH);
    const vectors = await embedTexts(batch.map((f) => f.embedText));

    for (let j = 0; j < batch.length; j++) {
      const f = batch[j];
      pending.push({
        id: f.id || `food_${i + j}`,
        values: vectors[j],
        metadata: {
          name:      f.name,
          brand:     f.brand,   // 업체명 (없으면 빈 문자열)
          source:    f.source,
          kcal:      f.kcal,
          carb_g:    f.carb_g,
          protein_g: f.protein_g,
          fat_g:     f.fat_g,
          serving_g: f.serving_g,
        },
      });
    }

    done += batch.length;
    progress(done, foods.length, "임베딩·업로드");

    if (pending.length >= UPSERT_BATCH) {
      await upsertVectors(pending.splice(0, UPSERT_BATCH));
    }

    await new Promise((r) => setTimeout(r, 80));
  }

  // 잔여 upsert
  if (pending.length > 0) {
    await upsertVectors(pending);
  }

  console.log(`\n✅ Vectorize 적재 완료!`);
  console.log(`   인덱스: ${VECTORIZE_INDEX} | 총 ${done.toLocaleString()}개 벡터`);
  console.log(`   예상 소요: ~${Math.round(done / EMBED_BATCH * 0.08 / 60)}분\n`);
}

main().catch((e) => {
  console.error("\n❌ 오류:", e.message ?? e);
  process.exit(1);
});
