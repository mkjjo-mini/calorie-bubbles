/**
 * /api/ai-food/analyze — 음식 AI 분석 (PoC).
 *
 *  POST body:
 *    { mode: "photo", image: { mimeType, data(base64) }, hint?: string }
 *    { mode: "text", text: string }
 *
 *  응답:
 *    {
 *      candidates: [
 *        {
 *          is_food, name, serving_unit, serving_amount, serving_g,
 *          kcal, carb_g, protein_g, fat_g,
 *          confidence, rationale, needs_fallback, fallback_query?,
 *          bbox?: [y0, x0, y1, x1]   // 사진 모드만, 0-1 normalized (top-left origin)
 *        },
 *        ...
 *      ],
 *      refs?: [{ title, url }],   // 검색 grounding (텍스트 모드)
 *      fallback?: {...}           // 단일 후보일 때만 식약처 보강 (multi에선 생략)
 *      raw: { text }              // 디버깅
 *    }
 *
 *  사진에 여러 음식이 보이면 candidates.length > 1. 사용자가 lab/sheet UI에서 선택.
 *  텍스트 모드는 거의 항상 length 1.
 */
import type { Env } from "../auth/env";
import { jsonError, NO_STORE_JSON_HEADERS, withUser } from "../auth/middleware";
import { callGemini, GeminiError } from "../ai/gemini";
import { fetchFoodFallback, type FoodFallbackHit } from "../ai/food-fallback";

interface AnalyzeBody {
  mode: "photo" | "text";
  text?: string;
  hint?: string;
  image?: {
    mimeType: string;
    data: string;
  };
}

const CANDIDATE_PROPS = {
  is_food: { type: "boolean" },
  name: { type: "string" },
  serving_unit: { type: "string" },
  serving_amount: { type: "number" },
  serving_g: { type: "number" },
  kcal: { type: "number" },
  carb_g: { type: "number" },
  protein_g: { type: "number" },
  fat_g: { type: "number" },
  confidence: { type: "number" },
  rationale: { type: "string" },
  needs_fallback: { type: "boolean" },
  fallback_query: { type: "string" },
  /** 사진 모드 한정 — [y0, x0, y1, x1] 0~1 normalized */
  bbox: {
    type: "array",
    items: { type: "number" },
    minItems: 4,
    maxItems: 4,
  },
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: CANDIDATE_PROPS,
        required: [
          "is_food",
          "name",
          "serving_unit",
          "serving_amount",
          "serving_g",
          "kcal",
          "carb_g",
          "protein_g",
          "fat_g",
          "confidence",
          "rationale",
          "needs_fallback",
        ],
      },
    },
  },
  required: ["candidates"],
} as const;

const SYSTEM_PROMPT = `당신은 한국 음식 영양 정보 전문가입니다.
사용자가 보낸 사진 또는 자연어 설명을 기반으로 한국 식약처 기준에 맞춰 영양 정보를 추정합니다.

⚠️ 중요: 응답은 항상 candidates 배열입니다.
- 사진에 여러 음식이 분명히 구분돼 보이면 각 음식을 별도 candidate로 분리합니다 (예: 김치찌개 + 밥 + 김 → 3개 candidates).
- 같은 음식의 일부(예: 밥의 여러 그릇)는 묶어서 하나로 처리합니다.
- 단일 음식 / 텍스트 모드는 candidates.length = 1.

각 candidate에 적용되는 규칙:
- 모든 응답은 한국어로 작성합니다.
- 음식 이름은 검색하기 좋게 일반적인 명칭으로 적습니다 (예: "엄마표 김치찌개" → "돼지고기 김치찌개").
- 1인분 기준 영양 정보를 추정하며, serving_g는 통상 한국 식약처 기준 1인분 무게입니다.
- 자연어에 "2인분", "곱빼기" 같은 단서가 있으면 serving_amount에 반영합니다.
- "고기 듬뿍", "기름 많이" 같은 단서는 macros에 반영합니다.
- 음식이 아닌 사진/텍스트(사람·풍경·무관)면 candidates에 단일 항목 + is_food=false.
- confidence는 0.0~1.0 (어둡거나 모호하면 낮춤).
- rationale은 한 문장으로 "왜 이렇게 추정했는지".
- 식당명이 포함되면 Google Search 결과 참고.

⚠️ bbox (사진 모드만):
- 각 candidate의 bbox는 [y0, x0, y1, x1] 형식, 모든 값 0.0~1.0 normalized.
- (0,0)이 사진 좌상단, (1,1)이 우하단.
- y0 < y1, x0 < x1.
- 사진 전체에 한 음식만 있으면 bbox를 거의 [0,0,1,1]로 설정해도 됨.
- 텍스트 모드는 bbox 생략.

⚠️ needs_fallback 판단:
- needs_fallback=true: 영양 정보를 추측만 하고 있어 식약처 DB 보강이 필요한 경우
- needs_fallback=false: 다음 중 하나라도 해당
  · 사진에서 영양성분 라벨을 읽었다 (예: "0kcal" 표기)
  · 잘 알려진 표준 메뉴 (흰밥 1공기, 삶은 계란)
  · 사용자가 영양 정보를 직접 명시

⚠️ false면 0 값도 "실제 0"으로 간주됩니다.

fallback_query: needs_fallback=true 일 때만, 식약처 DB 검색용 한국어 일반 명칭.`;

interface Candidate {
  is_food: boolean;
  name: string;
  serving_unit: string;
  serving_amount: number;
  serving_g: number;
  kcal: number;
  carb_g: number;
  protein_g: number;
  fat_g: number;
  confidence: number;
  rationale: string;
  needs_fallback: boolean;
  fallback_query?: string;
  bbox?: [number, number, number, number];
}

interface FallbackResult {
  triggered: boolean;
  reason?: string;
  hit?: FoodFallbackHit | null;
  scaled?: FoodFallbackHit | null;
  query?: string;
  totalCount?: number;
  error?: string;
}

export async function handleAiFood(req: Request, env: Env): Promise<Response> {
  return withUser(req, env, async () => {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let body: AnalyzeBody;
    try {
      body = (await req.json()) as AnalyzeBody;
    } catch {
      return jsonError(400, "INVALID_BODY", "body must be JSON");
    }
    if (!body || typeof body !== "object") {
      return jsonError(400, "INVALID_BODY", "body must be object");
    }

    let userText: string;
    let useSearch = false;
    let image: { mimeType: string; data: string } | undefined;

    if (body.mode === "photo") {
      if (!body.image?.data) {
        return jsonError(400, "INVALID_BODY", "image.data 필요 (base64)");
      }
      if (!body.image.mimeType?.startsWith("image/")) {
        return jsonError(400, "INVALID_BODY", "image.mimeType은 image/* 이어야 합니다");
      }
      if (body.image.data.length > 5 * 1024 * 1024 * 1.4) {
        return jsonError(413, "IMAGE_TOO_LARGE", "사진이 너무 큽니다 (5MB 한도)");
      }
      image = body.image;
      const hint = body.hint?.trim();
      userText = hint
        ? `다음 사진의 음식을 분석하세요. 사용자 힌트: "${hint}"`
        : "다음 사진의 음식을 분석하세요.";
    } else if (body.mode === "text") {
      if (!body.text?.trim()) {
        return jsonError(400, "INVALID_BODY", "text 필요");
      }
      userText = `다음 음식 설명을 영양 정보로 변환하세요. 식당명·브랜드·구체 제품이 포함됐다면 Google Search 결과를 참고하세요: "${body.text.trim()}"`;
      useSearch = true;
    } else {
      return jsonError(400, "INVALID_BODY", "mode must be photo/text");
    }

    try {
      const result = await callGemini(env, {
        systemInstruction: SYSTEM_PROMPT,
        userText: useSearch
          ? `${userText}\n\n반드시 다음 JSON 스키마만 출력하세요 (다른 텍스트 금지):\n${JSON.stringify(
              { candidates: [CANDIDATE_PROPS] },
            )}`
          : userText,
        image,
        useSearch,
        jsonMode: !useSearch,
        responseSchema: useSearch
          ? undefined
          : (RESPONSE_SCHEMA as unknown as Record<string, unknown>),
        temperature: 0.4,
      });

      // grounding 모드면 raw text에서 JSON 추출
      let parsed: unknown = result.parsed;
      if (useSearch) {
        const text = result.rawText.trim();
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) {
          return jsonError(500, "PARSE_ERROR", `검색 모드 응답에서 JSON 추출 실패: ${text.slice(0, 200)}`);
        }
        try {
          parsed = JSON.parse(match[0]);
        } catch (e) {
          return jsonError(500, "PARSE_ERROR", `JSON 파싱 실패: ${(e as Error).message}`);
        }
      }

      const p = parsed as { candidates?: Candidate[] };
      let candidates: Candidate[] = Array.isArray(p?.candidates) ? p.candidates : [];

      // 빈 응답 fallback — 일부 모델은 candidates 안 감싸고 단일 객체로 응답할 수 있어 보정
      if (candidates.length === 0 && parsed && typeof parsed === "object" && "name" in (parsed as object)) {
        candidates = [parsed as Candidate];
      }

      if (candidates.length === 0) {
        return jsonError(500, "PARSE_ERROR", "candidates 비어있음");
      }

      // 식약처 fallback — 단일 candidate일 때만 적용 (multi는 사용자가 직접 결정)
      let fallback: FallbackResult = { triggered: false };
      if (candidates.length === 1) {
        const c = candidates[0];
        if (c.is_food && c.needs_fallback && env.FOOD_API_KEY) {
          const query = (c.fallback_query?.trim()) || c.name || "";
          const targetG = c.serving_g > 0 ? c.serving_g : undefined;
          try {
            const fb = await fetchFoodFallback(env, query, targetG);
            if (fb.hit) {
              fallback = {
                triggered: true,
                reason: "ai_uncertain",
                hit: fb.hit,
                scaled: fb.scaled ?? fb.hit,
                query: fb.query,
                totalCount: fb.totalCount,
              };
              const src = fb.scaled ?? fb.hit;
              c.kcal = src.kcal;
              c.carb_g = src.carb_g;
              c.protein_g = src.protein_g;
              c.fat_g = src.fat_g;
              c.rationale = `${c.rationale} · 식약처 DB "${fb.hit.name}" 기준 보강.`.trim();
            } else {
              fallback = {
                triggered: true,
                reason: "ai_uncertain",
                hit: null,
                query: fb.query,
                totalCount: fb.totalCount,
              };
            }
          } catch (e) {
            fallback = {
              triggered: true,
              reason: "ai_uncertain",
              error: e instanceof Error ? e.message : String(e),
            };
          }
        }
      }

      return new Response(
        JSON.stringify({
          candidates,
          refs: result.groundingChunks ?? [],
          fallback,
          raw: { text: result.rawText },
        }),
        { status: 200, headers: NO_STORE_JSON_HEADERS },
      );
    } catch (e) {
      if (e instanceof GeminiError) {
        console.error("[ai-food]", e.code, e.message);
        return jsonError(e.status, e.code, e.message);
      }
      console.error("[ai-food] unexpected", e);
      return jsonError(500, "INTERNAL", (e as Error).message);
    }
  });
}
