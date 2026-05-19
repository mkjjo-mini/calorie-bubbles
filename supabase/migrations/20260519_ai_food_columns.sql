-- ============================================================================
--  AI 음식 추가 기능 — foods 테이블에 AI 메타데이터 컬럼 추가
--
--  관련 PRD: miniapp-strategy/products/tandanji-bubble/prd/v1-steps/step-12-ai-food-add.md
--
--  실행: Supabase Dashboard → SQL Editor → 본 파일 전체 → Run
-- ============================================================================

ALTER TABLE public.foods
  -- 생성 경로 — 통계·디버깅·재학습용
  ADD COLUMN IF NOT EXISTS created_via text NOT NULL DEFAULT 'manual'
    CHECK (created_via IN ('manual','search','ai_photo','ai_text')),
  -- Supabase Storage path (food-photos/<user_id>/<food_id>.jpg). 200x200 썸네일
  ADD COLUMN IF NOT EXISTS photo_url text,
  -- 자연어 원문 ("엄마표 김치찌개" 같은 사용자/AI 입력)
  ADD COLUMN IF NOT EXISTS source_text text,
  -- AI 참조 출처 [{title, url}, ...] (식당 검색 시 grounding chunks)
  ADD COLUMN IF NOT EXISTS source_refs jsonb,
  -- AI 신뢰도 0.0–1.0. 낮으면 UI에 ⚠️ 배지
  ADD COLUMN IF NOT EXISTS ai_confidence numeric
    CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1));

-- 통계용 인덱스 (created_via별 음식 수 빠르게 조회)
CREATE INDEX IF NOT EXISTS foods_created_via_idx
  ON public.foods (user_id, created_via)
  WHERE deleted_at IS NULL;
