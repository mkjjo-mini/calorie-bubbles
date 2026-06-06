/**
 * AI 호출 로그 → Supabase ai_call_logs 테이블 저장.
 * 저장 실패 시 로그만 남기고 조용히 무시 (로깅 실패가 서비스 중단으로 이어지면 안 됨).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const KRW_PER_USD = 1400;

export interface AiCallLogEntry {
  userId: string;
  mode: "text" | "photo";
  source: "vector_db" | "llm_rag" | "llm" | "llm_search" | "gateway_cache";
  success: boolean;
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  query?: string;
  model?: string;
}

export async function logAiCall(
  admin: SupabaseClient,
  entry: AiCallLogEntry,
): Promise<void> {
  try {
    await admin.from("ai_call_logs").insert({
      user_id:       entry.userId,
      mode:          entry.mode,
      source:        entry.source,
      success:       entry.success,
      cost_usd:      entry.costUsd,
      cost_krw:      parseFloat((entry.costUsd * KRW_PER_USD).toFixed(2)),
      input_tokens:  entry.inputTokens ?? null,
      output_tokens: entry.outputTokens ?? null,
      latency_ms:    entry.latencyMs ?? null,
      model:         entry.model ?? null,
      query:         entry.query ?? null,
    });
  } catch (e) {
    console.error("[ai-call-logger] 저장 실패 (무시)", e instanceof Error ? e.message : e);
  }
}
