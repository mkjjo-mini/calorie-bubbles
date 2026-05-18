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
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

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

  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new GeminiError(
      res.status,
      `HTTP_${res.status}`,
      `Gemini API ${res.status}: ${errText.slice(0, 300)}`,
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

  return { parsed, rawText, groundingChunks, raw };
}
