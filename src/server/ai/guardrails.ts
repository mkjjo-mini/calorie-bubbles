/**
 * AI 가드레일 — /api/ai-food/* 호출 전후에 적용하는 안전장치.
 *
 *  1. Rate limit       — 사용자별 일일 호출 한도
 *  2. Cost cap         — 전체 일일 호출 한도 (Gemini 비용 폭발 방지)
 *  3. Prompt injection — user 입력 sanitize
 *  4. Output 검증      — Gemini 응답 macros 비정상값 거부
 *  (음식 외 입력 차단은 is_food 필드로 ai-food.ts에서 직접 처리)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/* ---------------- 한도 상수 ---------------- */

/** 사용자 1명당 하루 AI 호출 한도. 정상 사용자는 식사 3~5회 + 재시도 고려해 넉넉히. */
export const PER_USER_DAILY_LIMIT = 50;

/** 전체 사용자 합산 하루 호출 한도. Gemini 무료 티어(1500 RPD) 안쪽 + 비용 안전판. */
export const GLOBAL_DAILY_LIMIT = 1200;

/* ---------------- 1+2. Rate limit & cost cap ---------------- */

export interface UsageCheckResult {
  ok: boolean;
  /** 차단 사유 (ok=false일 때) */
  reason?: "USER_LIMIT" | "GLOBAL_LIMIT";
  /** 사용자에게 보여줄 메시지 */
  message?: string;
  /** 호출 후 사용자의 오늘 누적 횟수 (ok=true일 때) */
  userCount?: number;
}

/**
 * 호출 직전 사용량 체크 + 카운트 증가.
 * - 전체 한도 먼저 확인 (비용 보호 우선)
 * - 통과하면 사용자 카운터 INCR → 한도 초과면 차단
 *
 * ⚠️ 카운터를 미리 올리므로, Gemini 호출이 실패해도 1회 소모됨.
 *    abuse 방어 측면에선 의도된 동작 (실패 유발 공격 차단).
 */
export async function checkAndConsumeUsage(
  admin: SupabaseClient,
  userId: string,
): Promise<UsageCheckResult> {
  const today = todayKSTDate();

  // (a) 전체 일일 한도
  const { data: total, error: totalErr } = await admin.rpc("total_ai_usage", {
    p_date: today,
  });
  if (totalErr) {
    // 집계 실패 시 — 안전하게 통과시키되 로그 (가용성 > 엄격함)
    console.error("[guardrails] total_ai_usage failed", totalErr.message);
  } else if (typeof total === "number" && total >= GLOBAL_DAILY_LIMIT) {
    return {
      ok: false,
      reason: "GLOBAL_LIMIT",
      message: "오늘 AI 분석 요청이 많아 잠시 제한됐어요. 내일 다시 이용해주세요.",
    };
  }

  // (b) 사용자 일일 한도 — INCR 후 반환값으로 판정
  const { data: userCount, error: userErr } = await admin.rpc(
    "increment_ai_usage",
    { p_user_id: userId, p_date: today },
  );
  if (userErr) {
    console.error("[guardrails] increment_ai_usage failed", userErr.message);
    // 카운터 실패 — 통과 (가용성 우선). 단 로그로 추적.
    return { ok: true };
  }
  if (typeof userCount === "number" && userCount > PER_USER_DAILY_LIMIT) {
    return {
      ok: false,
      reason: "USER_LIMIT",
      message: `오늘 AI 분석 한도(${PER_USER_DAILY_LIMIT}회)에 도달했어요. 내일 다시 이용할 수 있어요.`,
    };
  }

  return { ok: true, userCount: typeof userCount === "number" ? userCount : undefined };
}

/** KST 기준 오늘 날짜 (YYYY-MM-DD) */
function todayKSTDate(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/* ---------------- 3. Prompt injection sanitize ---------------- */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+)?(?:previous|above|prior)\s+instructions?/gi,
  /무시\s*(?:하고|해|하라|할것)/g,
  /이전\s*(?:지시|명령|프롬프트|규칙)/g,
  /system\s*prompt/gi,
  /you\s+are\s+now/gi,
  /(?:새로운?|다른)\s*(?:역할|규칙|지시)/g,
  /reveal\s+(?:your\s+)?(?:prompt|instructions?|system)/gi,
  /<\/?(?:system|assistant|user|instruction)>/gi,
];

export interface SanitizeResult {
  /** 정제된 텍스트 (delimiter로 감쌀 준비된 상태) */
  text: string;
  /** injection 의심 패턴이 감지됐는지 */
  suspicious: boolean;
}

/**
 * user 자연어 입력 sanitize.
 * - 과도한 길이 절단 (음식 설명에 300자면 충분)
 * - injection 의심 구문 제거 + 플래그
 * - 제어문자 제거
 *
 * 호출 측은 결과 text를 반드시 delimiter(예: <<<...>>>)로 감싸 Gemini에 전달.
 */
export function sanitizeUserText(raw: string): SanitizeResult {
  let text = raw.slice(0, 300);
  // 제어문자 제거 (C0 control, zero-width, 방향 제어 등 prompt 조작 수단)
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\x00-\x1F\x7F\u200B-\u200F\u202A-\u202E\uFEFF]/g, " ");

  let suspicious = false;
  for (const re of INJECTION_PATTERNS) {
    if (re.test(text)) {
      suspicious = true;
      text = text.replace(re, " ");
    }
  }
  text = text.replace(/\s+/g, " ").trim();
  return { text, suspicious };
}

/* ---------------- 4. Output 검증 ---------------- */

export interface NutritionLike {
  is_food?: boolean;
  name?: string;
  serving_g?: number;
  kcal?: number;
  carb_g?: number;
  protein_g?: number;
  fat_g?: number;
}

export interface ValidationResult {
  ok: boolean;
  /** 비정상 항목 설명 (디버깅·로깅용) */
  problems: string[];
}

// 상식 범위 — 1인분 기준. 초과 시 AI 환각 의심.
const LIMITS = {
  serving_g: { min: 0, max: 5000 },   // 5kg 초과 1인분 = 비정상
  kcal: { min: 0, max: 5000 },        // 5000kcal 초과 1인분 = 비정상
  carb_g: { min: 0, max: 1000 },
  protein_g: { min: 0, max: 1000 },
  fat_g: { min: 0, max: 1000 },
};

/**
 * Gemini가 반환한 음식 candidate의 영양값이 상식 범위인지 검증.
 * is_food=false면 검증 skip (0값이 정상).
 */
export function validateNutrition(c: NutritionLike): ValidationResult {
  const problems: string[] = [];
  if (c.is_food === false) return { ok: true, problems };

  if (!c.name || typeof c.name !== "string" || c.name.trim().length === 0) {
    problems.push("name 누락");
  }
  for (const [key, { min, max }] of Object.entries(LIMITS)) {
    const v = c[key as keyof NutritionLike];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      problems.push(`${key} 숫자 아님`);
      continue;
    }
    if (v < min || v > max) {
      problems.push(`${key}=${v} 범위(${min}~${max}) 벗어남`);
    }
  }
  return { ok: problems.length === 0, problems };
}
