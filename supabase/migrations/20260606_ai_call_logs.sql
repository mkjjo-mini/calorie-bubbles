-- ============================================================================
--  AI 호출 로그 — 유저별 호출 이력, 성공/실패, 비용, source 추적
--
--  실행: Supabase Dashboard → SQL Editor → 본 파일 전체 → Run
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_call_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  called_at    timestamptz NOT NULL DEFAULT now(),
  mode         text        NOT NULL CHECK (mode IN ('text', 'photo')),
  -- LLM 호출 경로
  source       text        NOT NULL CHECK (source IN (
                 'vector_db',  -- Vectorize 히트 → LLM 완전 스킵
                 'llm_rag',    -- Vectorize 부분 히트 → RAG 컨텍스트 주입
                 'llm',        -- LLM 직접 호출 (Search OFF)
                 'llm_search', -- LLM + Google Search grounding
                 'gateway_cache' -- AI Gateway 캐시 히트
               )),
  success      boolean     NOT NULL DEFAULT true,
  cost_usd     numeric(12, 8) NOT NULL DEFAULT 0, -- 호출당 비용 ($)
  cost_krw     numeric(10, 2) NOT NULL DEFAULT 0, -- 호출당 비용 (₩, 환율 1400 고정)
  input_tokens  integer,   -- 입력 토큰 수 (디버깅용)
  output_tokens integer,   -- 출력 토큰 수
  latency_ms   integer,    -- 호출 소요 시간 (ms)
  model        text,       -- 사용 모델 (예: gemini-2.5-flash)
  query        text        -- 텍스트 검색어 (photo 모드는 NULL)
);

-- 분석용 인덱스
CREATE INDEX IF NOT EXISTS ai_call_logs_user_idx    ON public.ai_call_logs (user_id, called_at DESC);
CREATE INDEX IF NOT EXISTS ai_call_logs_date_idx    ON public.ai_call_logs (called_at DESC);
CREATE INDEX IF NOT EXISTS ai_call_logs_source_idx  ON public.ai_call_logs (source);

ALTER TABLE public.ai_call_logs ENABLE ROW LEVEL SECURITY;

-- 서버(service_role)만 쓰기. 사용자는 본인 로그 읽기만 허용.
CREATE POLICY ai_call_logs_owner_read ON public.ai_call_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
--  90일 이상 오래된 로그 자동 삭제 (Supabase 500MB 무료 한도 보호)
--  pg_cron 활성화 필요: Dashboard → Database → Extensions → pg_cron
-- ============================================================================
-- SELECT cron.schedule(
--   'cleanup-ai-call-logs',
--   '0 3 * * *',  -- 매일 새벽 3시
--   $$DELETE FROM public.ai_call_logs WHERE called_at < now() - interval '90 days'$$
-- );


ALTER TABLE public.ai_call_logs
    ADD COLUMN IF NOT EXISTS latency_ms integer,
    ADD COLUMN IF NOT EXISTS model text;