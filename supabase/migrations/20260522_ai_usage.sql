-- ============================================================================
--  AI 가드레일 — 사용량 추적 테이블
--
--  rate limit (사용자별 일일 호출 수) + 비용 한도 (전체 일일 호출 수) 용도.
--  사용자당 하루 1 row, count를 INCR.
--
--  실행: Supabase Dashboard → SQL Editor → 본 파일 전체 → Run
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  used_on   date NOT NULL,
  count     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, used_on)
);

-- 일별 전체 호출 수 집계 (비용 한도 체크) 빠르게
CREATE INDEX IF NOT EXISTS ai_usage_date_idx ON public.ai_usage (used_on);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- 서버(service_role)만 접근 — 클라이언트 직접 접근 차단.
-- (정책 없음 = authenticated 롤은 RLS에 막혀 접근 불가, service_role은 우회)

-- 원자적 증가 + 현재값 반환 RPC.
-- 동시 요청에도 정확한 카운트 보장 (UPSERT + RETURNING).
CREATE OR REPLACE FUNCTION public.increment_ai_usage(p_user_id uuid, p_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO public.ai_usage (user_id, used_on, count)
  VALUES (p_user_id, p_date, 1)
  ON CONFLICT (user_id, used_on)
  DO UPDATE SET count = public.ai_usage.count + 1
  RETURNING count INTO new_count;
  RETURN new_count;
END $$;

-- 일별 전체 호출 수 합계 (비용 한도 체크용)
CREATE OR REPLACE FUNCTION public.total_ai_usage(p_date date)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(count), 0)::integer FROM public.ai_usage WHERE used_on = p_date;
$$;
