/**
 * Gemini API fetch wrapper — 멀티모달 음식 분석용.
 *
 * 사용 모델: gemini-2.5-flash (빠르고 저렴, multimodal + Google Search grounding)
 *
 * 참고:
 *   - https://ai.google.dev/gemini-api/docs
 *   - https://ai.google.dev/gemini-api/docs/grounding/search-suggestions (Search grounding)
 *   - https://ai.google.dev/gemini-api/docs/structured-output (JSON mode)
 *
 * **서버 전용** — GEMINI_API_KEY는 브라우저 노출 금지.
 */
import type { Env } from "../auth/env";

const MODEL = "gemini-2.5-flash";
// Cloudflare AI Gateway 경유 — Workers outbound IP의 region 제한 우회 + 캐시·로깅·재시도.
// 직접 호출(`generativelanguage.googleapis.com`) 시 "User location is not supported" 발생.
const CF_ACCOUNT_ID = "0719cbc0852d8fee33d881aa1fe07fc1";
const CF_GATEWAY_NAME = "tandanji-bubble-ai";
const ENDPOINT = `https://gateway.ai.cloudflare.com/v1/${CF_ACCOUNT_ID}/${CF_GATEWAY_NAME}/google-ai-studio/v1beta/models/${MODEL}:generateContent`;

export interface GeminiInlineImage {
  /** "image/jpeg" | "image/png" 등 */
  mimeType: string;
  /** base64 인코딩, prefix 제외 */
  data: string;
}

export interface GeminiCallOptions {
  /** 시스템 지시문 */
  systemInstruction?: string;
  /** 사용자 텍스트 (필수) */
  userText: string;
  /** 이미지 첨부 (선택) */
  image?: GeminiInlineImage;
  /** Google Search grounding 활성화 */
  useSearch?: boolean;
  /** JSON 응답 강제 (responseSchema는 함께 보내지 않으면 free-form JSON) */
  jsonMode?: boolean;
  /** 응답 schema 강제 (jsonMode=true와 함께 사용 권장) */
  responseSchema?: Record<string, unknown>;
  /** 0.0(deterministic) ~ 2.0(creative). 기본 0.4 — 영양 추정엔 보수적 */
  temperature?: number;
}

export interface GeminiCallResult {
  /** 파싱된 텍스트 본문 (jsonMode면 JSON.parse 결과) */
  parsed: unknown;
  /** 원본 텍스트 그대로 (디버깅용) */
  rawText: string;
  /** Search grounding 사용 시 검색 결과 메타 */
  groundingChunks?: Array<{ title?: string; url?: string; snippet?: string }>;
  /** Gemini 전체 응답 (디버깅·로깅용) */
  raw: unknown;
  /** 입력 토큰 수 */
  inputTokens: number;
  /** 출력 토큰 수 */
  outputTokens: number;
  /** 호출 비용 (USD). gemini-2.5-flash 단가 기준 */
  costUsd: number;
}

export class GeminiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export async function callGemini(
  env: Env,
  opts: GeminiCallOptions,
): Promise<GeminiCallResult> {
  if (!env.GEMINI_API_KEY) {
    throw new GeminiError(
      500,
      "GEMINI_NOT_CONFIGURED",
      "GEMINI_API_KEY 미설정 (.env.local 확인)",
    );
  }

  const parts: Array<Record<string, unknown>> = [{ text: opts.userText }];
  if (opts.image) {
    parts.unshift({
      inline_data: {
        mime_type: opts.image.mimeType,
        data: opts.image.data,
      },
    });
  }

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      ...(opts.jsonMode ? { responseMimeType: "application/json" } : {}),
      ...(opts.responseSchema ? { responseSchema: opts.responseSchema } : {}),
    },
  };

  if (opts.systemInstruction) {
    body.systemInstruction = {
      role: "system",
      parts: [{ text: opts.systemInstruction }],
    };
  }

  if (opts.useSearch) {
    // Gemini 2.x grounding은 tools에 googleSearch 객체 하나만 넣으면 활성화
    body.tools = [{ googleSearch: {} }];
  }

  // 503/429 시 지수 백오프로 최대 2회 retry — Flash 모델 일시 과부하 자주 있음
  const url = `${ENDPOINT}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  // AI Gateway 인증 토큰 (Authenticated Gateway 활성화 시 필수)
  if (env.CF_AIG_TOKEN) {
    headers["cf-aig-authorization"] = `Bearer ${env.CF_AIG_TOKEN}`;
  }
  const init: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  };

  let res: Response | null = null;
  let lastErrText = "";
  const RETRY_DELAYS_MS = [1000, 3000, 7000]; // 지수 백오프: 1s → 3s → 7s (총 ~11s)
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    res = await fetch(url, init);
    if (res.ok) break;
    if (res.status !== 503 && res.status !== 429) break; // 그 외 에러는 즉시 throw
    lastErrText = await res.text().catch(() => "");
    if (attempt === RETRY_DELAYS_MS.length) break; // retry 다 썼음
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }

  if (!res || !res.ok) {
    const errText = lastErrText || (res ? await res.text().catch(() => "") : "");
    const status = res?.status ?? 0;
    // 503/429 → 사용자 친화 메시지
    if (status === 503 || status === 429) {
      throw new GeminiError(
        503,
        "OVERLOADED",
        "AI 서버가 잠시 혼잡해요. 10초 후 다시 시도해주세요.",
      );
    }
    throw new GeminiError(
      status,
      `HTTP_${status}`,
      `Gemini API ${status}: ${errText.slice(0, 300)}`,
    );
  }

  const raw = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: {
        groundingChunks?: Array<{
          web?: { uri?: string; title?: string };
        }>;
      };
    }>;
    promptFeedback?: { blockReason?: string };
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };

  if (raw.promptFeedback?.blockReason) {
    throw new GeminiError(
      400,
      "BLOCKED",
      `Gemini가 차단함: ${raw.promptFeedback.blockReason}`,
    );
  }

  const candidate = raw.candidates?.[0];
  const rawText = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  let parsed: unknown = rawText;
  if (opts.jsonMode) {
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      throw new GeminiError(
        500,
        "PARSE_ERROR",
        `JSON 파싱 실패: ${(e as Error).message}. raw=${rawText.slice(0, 200)}`,
      );
    }
  }

  const groundingChunks = candidate?.groundingMetadata?.groundingChunks
    ?.map((c) => ({
      title: c.web?.title,
      url: c.web?.uri,
    }))
    .filter((c) => c.url) as
    | Array<{ title?: string; url?: string; snippet?: string }>
    | undefined;

  // 토큰·비용 계산 (gemini-2.5-flash 단가, ≤200k tokens)
  // 입력: $0.30/M tokens, 출력: $2.50/M tokens
  // AI Gateway 실측 역산으로 검증: 740in * 0.30/M + 169out * 2.50/M = $0.00064450 ✅
  const inputTokens = raw.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = raw.usageMetadata?.candidatesTokenCount ?? 0;
  const costUsd = (inputTokens * 0.30 + outputTokens * 2.50) / 1_000_000;

  return { parsed, rawText, groundingChunks, raw, inputTokens, outputTokens, costUsd };
}
