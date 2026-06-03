/**
 * 식약처 식품영양성분 벡터 검색 — Cloudflare Vectorize + Workers AI (bge-m3).
 *
 * 흐름:
 *   사용자 입력 → bge-m3 임베딩 → Vectorize 코사인 유사도 검색
 *     score ≥ HIGH_THRESHOLD → 직접 반환 (Gemini 호출 없음)
 *     score ≥ MID_THRESHOLD  → RAG 컨텍스트로 Gemini에 주입 (Search 없음)
 *     score <  MID_THRESHOLD → 기존 패턴 A (needsSearchGrounding)
 *
 * 인덱스 생성:
 *   npx wrangler vectorize create food-items --dimensions=1024 --metric=cosine
 *
 * 데이터 적재:
 *   npm run seed:vectors
 */
import type { Env } from "../auth/env";

const EMBED_MODEL = "@cf/baai/bge-m3";

/** score ≥ 이 값이면 Gemini 완전 스킵, 벡터 결과 직접 반환 */
export const VECTOR_HIGH_THRESHOLD = 0.87;
/** score ≥ 이 값이면 RAG 컨텍스트로 Gemini에 주입 (Search OFF) */
export const VECTOR_MID_THRESHOLD = 0.75;

export interface VectorFoodHit {
  id: string;
  name: string;
  brand: string;   // 업체명 (없으면 빈 문자열)
  kcal: number;
  carb_g: number;
  protein_g: number;
  fat_g: number;
  serving_g: number;
  score: number;
}

/** Workers AI가 없는 환경(로컬 vite dev)에서도 안전하게 null 반환 */
export async function searchFoodVector(
  env: Env,
  query: string,
): Promise<VectorFoodHit | null> {
  if (!env.AI || !env.FOOD_VECTORIZE) return null;

  // 1. 쿼리 임베딩
  let queryVector: number[];
  try {
    const embResult = (await env.AI.run(EMBED_MODEL, {
      text: [query.trim()],
    })) as { data: number[][] };
    queryVector = embResult.data?.[0];
    if (!queryVector?.length) return null;
  } catch {
    return null;
  }

  // 2. Vectorize 검색 (top-3, 최고점만 사용)
  let matches: Array<{ id: string; score: number; metadata?: Record<string, unknown> }>;
  try {
    const result = await env.FOOD_VECTORIZE.query(queryVector, {
      topK: 3,
      returnMetadata: "all",
    });
    matches = result.matches ?? [];
  } catch {
    return null;
  }

  if (!matches.length) return null;

  const top = matches[0];
  if (top.score < VECTOR_MID_THRESHOLD) return null;

  const m = top.metadata;
  if (!m) return null;

  return {
    id: top.id,
    name: String(m.name ?? ""),
    brand: String(m.brand ?? ""),
    kcal: Number(m.kcal ?? 0),
    carb_g: Number(m.carb_g ?? 0),
    protein_g: Number(m.protein_g ?? 0),
    fat_g: Number(m.fat_g ?? 0),
    serving_g: Number(m.serving_g ?? 100),
    score: top.score,
  };
}

/** VectorFoodHit → Gemini RAG 컨텍스트 문자열 */
export function vectorHitToContext(hit: VectorFoodHit): string {
  const label = hit.brand ? `${hit.name} (${hit.brand})` : hit.name;
  return (
    `[식약처 DB] ${label}: ` +
    `칼로리 ${hit.kcal}kcal, 탄수화물 ${hit.carb_g}g, ` +
    `단백질 ${hit.protein_g}g, 지방 ${hit.fat_g}g (1인분 ${hit.serving_g}g 기준)`
  );
}
