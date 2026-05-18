/**
 * /api/ai-food/analyze — 음식 AI 분석 (PoC, DB 저장 X).
 *
 *  POST body:
 *    { mode: "photo", image: { mimeType, data(base64) }, hint?: string }
 *    { mode: "text", text: string }
 *    { mode: "restaurant", text: string }
 *
 *  응답:
 *    {
 *      analysis: {
 *        name, serving_unit, serving_amount, serving_g,
 *        kcal, carb_g, protein_g, fat_g,
 *        confidence, rationale, is_food
 *      },
 *      refs?: [{ title, url }],   // restaurant 모드만
 *      raw: { text, full }        // 디버깅용
 *    }
 */
import type { Env } from "../auth/env";
import { jsonError, NO_STORE_JSON_HEADERS, withUser } from "../auth/middleware";
import { callGemini, GeminiError } from "../ai/gemini";
import { fetchFoodFallback, type FoodFallbackHit } from "../ai/food-fallback";

interface AnalyzeBody {
  mode: "photo" | "text" | "restaurant";
  text?: string;
  hint?: string;
  image?: {
    mimeType: string;
    data: string;
  };
}

const NUTRITION_SCHEMA = {
  type: "object",
  properties: {
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
    /** 영양 추정에 자신 없으면 true. 그러면 서버가 식약처 API로 보강 */
    needs_fallback: { type: "boolean" },
    /** 식약처 검색용 query 추천 (예: "돼지고기 된장찌개"). 비우면 name 사용 */
    fallback_query: { type: "string" },
  },
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
} as const;

const SYSTEM_PROMPT = `당신은 한국 음식 영양 정보 전문가입니다.
사용자가 보낸 사진 또는 자연어 설명을 기반으로 한국 식약처 기준에 맞춰 영양 정보를 추정합니다.

규칙:
- 모든 응답은 한국어로 작성합니다.
- 음식 이름은 검색하기 좋게 일반적인 명칭으로 적습니다 (예: "엄마표 김치찌개" → "돼지고기 김치찌개").
- 1인분 기준 영양 정보를 추정하며, serving_g는 통상 한국 식약처 기준 1인분 무게입니다.
- 자연어에 "2인분", "곱빼기" 같은 단서가 있으면 serving_amount에 반영합니다.
- 자연어에 "고기 듬뿍", "기름 많이" 같은 단서가 있으면 macros에 반영합니다.
- 음식이 아닌 사진/텍스트(사람·풍경·무관한 텍스트)면 is_food=false, 다른 필드는 0 또는 빈 문자열.
- confidence는 0.0~1.0 (어둡거나 모호하면 낮춤).
- rationale은 한 문장으로 "왜 이렇게 추정했는지" 적습니다.
- 식당명이 포함된 경우 Google Search 결과를 참고합니다.

⚠️ 영양 정보 (kcal·carb·protein·fat) 추정에 자신 없으면:
- needs_fallback=true 로 설정
- fallback_query 에는 식약처 식품 DB에서 검색할 한국어 일반 명칭을 적습니다 (예: "된장찌개", "치킨 후라이드")
- 이 경우 macros 추정값은 비워두지 말고 본인이 아는 만큼 적되, 서버가 식약처 DB로 보강합니다

확실한 경우(라벨이 명확하거나 표준 메뉴):
- needs_fallback=false
- 본인 추정 그대로 사용됨`;

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
      // base64 크기 대략 검증 (5MB 한도) — 4/3 ratio 고려
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
      userText = `다음 음식 설명을 영양 정보로 변환하세요: "${body.text.trim()}"`;
    } else if (body.mode === "restaurant") {
      if (!body.text?.trim()) {
        return jsonError(400, "INVALID_BODY", "text 필요");
      }
      userText = `식당 메뉴 영양 정보를 추정하세요. Google Search 결과를 참고해 메뉴 정보를 찾고, 못 찾으면 일반적인 1인분 기준으로 추정하세요: "${body.text.trim()}"`;
      useSearch = true;
    } else {
      return jsonError(400, "INVALID_BODY", "mode must be photo/text/restaurant");
    }

    try {
      // ⚠️ Gemini는 grounding(검색) 사용 시 responseSchema/jsonMode를 함께 못 씀
      // (Search grounding이 free-form text 생성을 강제). 검색 모드일 땐 jsonMode 끄고
      // "JSON으로만 답해라" 지시로 유도 + 파싱 시 정규식으로 JSON 추출.
      const result = await callGemini(env, {
        systemInstruction: SYSTEM_PROMPT,
        userText: useSearch
          ? `${userText}\n\n반드시 다음 형식의 JSON만 출력하세요 (다른 텍스트 금지):\n${JSON.stringify(NUTRITION_SCHEMA.properties)}`
          : userText,
        image,
        useSearch,
        jsonMode: !useSearch,
        responseSchema: useSearch ? undefined : (NUTRITION_SCHEMA as unknown as Record<string, unknown>),
        temperature: 0.4,
      });

      // grounding 모드면 raw text에서 JSON 추출 시도
      let analysis: unknown = result.parsed;
      if (useSearch) {
        const text = result.rawText.trim();
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) {
          return jsonError(500, "PARSE_ERROR", `검색 모드 응답에서 JSON 추출 실패: ${text.slice(0, 200)}`);
        }
        try {
          analysis = JSON.parse(match[0]);
        } catch (e) {
          return jsonError(500, "PARSE_ERROR", `JSON 파싱 실패: ${(e as Error).message}`);
        }
      }

      // 식약처 API fallback — Gemini가 자신 없거나 macros 0인 경우
      let fallback: {
        triggered: boolean;
        reason?: string;
        hit?: FoodFallbackHit | null;
        scaled?: FoodFallbackHit | null;
        query?: string;
        totalCount?: number;
        error?: string;
      } = { triggered: false };

      const a = analysis as Record<string, unknown>;
      const isFood = a?.is_food === true;
      const needsFallback = a?.needs_fallback === true;
      const macrosAllZero =
        Number(a?.kcal ?? 0) === 0 &&
        Number(a?.carb_g ?? 0) === 0 &&
        Number(a?.protein_g ?? 0) === 0 &&
        Number(a?.fat_g ?? 0) === 0;

      if (isFood && (needsFallback || macrosAllZero) && env.FOOD_API_KEY) {
        const query =
          (typeof a?.fallback_query === "string" && a.fallback_query.trim()) ||
          (typeof a?.name === "string" && a.name) ||
          "";
        const targetG = Number(a?.serving_g) > 0 ? Number(a.serving_g) : undefined;
        try {
          const fb = await fetchFoodFallback(env, query, targetG);
          if (fb.hit) {
            fallback = {
              triggered: true,
              reason: needsFallback ? "ai_uncertain" : "macros_all_zero",
              hit: fb.hit,
              scaled: fb.scaled ?? fb.hit,
              query: fb.query,
              totalCount: fb.totalCount,
            };
            // analysis의 macros를 fallback 값으로 덮어쓰기 (사용자가 보는 값)
            const src = fb.scaled ?? fb.hit;
            (analysis as Record<string, unknown>).kcal = src.kcal;
            (analysis as Record<string, unknown>).carb_g = src.carb_g;
            (analysis as Record<string, unknown>).protein_g = src.protein_g;
            (analysis as Record<string, unknown>).fat_g = src.fat_g;
            const existingRationale = String(a?.rationale ?? "");
            (analysis as Record<string, unknown>).rationale =
              `${existingRationale} · 식약처 DB "${fb.hit.name}" 기준 보강.`.trim();
          } else {
            fallback = {
              triggered: true,
              reason: needsFallback ? "ai_uncertain" : "macros_all_zero",
              hit: null,
              query: fb.query,
              totalCount: fb.totalCount,
            };
          }
        } catch (e) {
          fallback = {
            triggered: true,
            reason: needsFallback ? "ai_uncertain" : "macros_all_zero",
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }

      return new Response(
        JSON.stringify({
          analysis,
          refs: result.groundingChunks ?? [],
          fallback,
          raw: {
            text: result.rawText,
          },
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
