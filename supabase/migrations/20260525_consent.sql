-- ============================================================================
--  Consent Management — 약관·동의 단일 진실 원천 (DB)
--
--  PRD: products/tandanji-bubble/prd/v1-steps/step-18-consent-management.md
--
--  목적:
--   1. PIPA(개인정보보호법) 컴플라이언스 — 동의 시점·버전·증빙(IP·UA) DB 기록.
--   2. 약관 갱신 시 코드 변경 0 — legal_documents v2 INSERT만으로 전체 사용자
--      재동의 흐름이 자동 발동 (AppShell + callback 가드가 자동 catch).
--   3. /auth/login 소셜 신규 가입자 미동의 버그 픽스 — callback 가드가 catch.
--
--  설계 원칙:
--   - user_consents = append-only 이력 (UPDATE/DELETE 금지) — PIPA 감사용
--   - user_current_consents = view (최신 상태만)
--   - grant_consents = race-safe 일괄 INSERT RPC
--
--  실행: Supabase Dashboard → SQL Editor → 본 파일 전체 → Run
--      또는 supabase db push (CLI)
-- ============================================================================

-- ============================================================================
--  1. legal_documents — 약관 마스터
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.legal_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type        text NOT NULL CHECK (doc_type IN ('age_14','terms','privacy','marketing')),
  version         text NOT NULL,
  is_required     boolean NOT NULL DEFAULT true,
  effective_from  timestamptz NOT NULL DEFAULT now(),
  -- NULL = 활성. NOT NULL = retire 시각 (이후 같은 doc_type의 새 활성 row가 미동의 catch).
  retired_at      timestamptz,
  -- 본문 참조:
  --   'inline:age_14'    → 클라가 inline 문구 매핑 (별도 HTML 없음)
  --   'terms/v1.html'    → Vite raw import (현재 패턴)
  --   'https://...'      → 외부 URL (향후)
  body_ref        text NOT NULL,
  title           text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(doc_type, version)
);

-- 활성 약관 빠른 조회 — UI 렌더·가드 검사 hot path.
CREATE INDEX IF NOT EXISTS legal_documents_active_idx
  ON public.legal_documents (doc_type, effective_from DESC)
  WHERE retired_at IS NULL;

-- 비로그인 사용자도 약관 조회 가능 (회원가입 전 /legal/terms 등).
-- ⚠️ 실제 API는 admin 클라가 쓰지만, RLS는 anon에게도 SELECT 열어둠 (defense-in-depth).
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY legal_documents_public_read ON public.legal_documents
  FOR SELECT
  USING (true);

-- ============================================================================
--  2. user_consents — 동의·철회 이력 (append-only)
--
--  UPDATE/DELETE 금지 (PIPA 감사 보장). 같은 user×doc 조합의 grant→withdraw→
--  grant도 3 row 모두 보존. 최신 상태는 user_current_consents view로 조회.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_consents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id   uuid NOT NULL REFERENCES public.legal_documents(id),
  action        text NOT NULL CHECK (action IN ('granted','withdrawn')),
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  -- 감사 증빙. migration·admin source는 NULL 허용.
  ip_address    inet,
  user_agent    text,
  source        text NOT NULL CHECK (source IN ('signup','reconfirm','migration','admin','settings'))
);

-- view DISTINCT ON 정렬 키 + 사용자별 이력 조회 인덱스.
CREATE INDEX IF NOT EXISTS user_consents_user_doc_idx
  ON public.user_consents (user_id, document_id, occurred_at DESC);

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

-- 본인 이력 SELECT만 허용 (감사·표시용). INSERT는 service_role(RPC)만.
-- UPDATE/DELETE 정책 없음 → 누구도 수정·삭제 불가 (append-only 강제).
CREATE POLICY user_consents_owner_read ON public.user_consents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
--  3. user_current_consents — 최신 상태 view (DISTINCT ON)
--
--  같은 user × document_id 조합에서 occurred_at DESC 첫 row만.
--  action='granted'면 현재 동의 중, 'withdrawn'면 철회 중.
-- ============================================================================
CREATE OR REPLACE VIEW public.user_current_consents AS
SELECT DISTINCT ON (user_id, document_id)
  user_id,
  document_id,
  action,
  occurred_at
FROM public.user_consents
ORDER BY user_id, document_id, occurred_at DESC;

-- ============================================================================
--  4. grant_consents — 동의 일괄 기록 RPC (race-safe)
--
--  서버 API /api/auth/consent (POST)가 호출. document_ids 배열을 받아
--  각각 'granted' row를 INSERT. occurred_at은 DB default(now())로 통일.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.grant_consents(
  p_user_id      uuid,
  p_document_ids uuid[],
  p_source       text,
  p_ip           inet,
  p_user_agent   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc_id uuid;
BEGIN
  FOREACH v_doc_id IN ARRAY p_document_ids LOOP
    INSERT INTO public.user_consents (
      user_id, document_id, action, source, ip_address, user_agent
    )
    VALUES (
      p_user_id, v_doc_id, 'granted', p_source, p_ip, p_user_agent
    );
  END LOOP;
END $$;

-- ============================================================================
--  5. v1 시드 — 출시 시점 활성 4종
--
--  마케팅은 is_required=false. body_ref='inline:marketing' → 클라가 inline 문구
--  ("이메일·푸시로 신제품·이벤트 정보를 받아볼 수 있어요" 류) 매핑.
-- ============================================================================
INSERT INTO public.legal_documents (doc_type, version, is_required, body_ref, title) VALUES
  ('age_14',    'v1.0.0', true,  'inline:age_14',    '만 14세 이상 확인'),
  ('terms',     'v1.0.0', true,  'terms/v1.html',    '이용약관'),
  ('privacy',   'v1.0.0', true,  'privacy/v1.html',  '개인정보처리방침'),
  ('marketing', 'v1.0.0', false, 'inline:marketing', '마케팅 정보 수신 (이메일·푸시)')
ON CONFLICT (doc_type, version) DO NOTHING;

-- ============================================================================
--  6. 기존 사용자 backfill — 출시 전 한정 (PRD §9)
--
--  현재 auth.users는 100% 본인(개발자) 계정 → 일괄 'granted' INSERT 안전.
--  IP·UA는 NULL (마이그레이션 시점엔 클라 정보 없음 — source='migration'으로 구분).
--
--  ⚠️ 외부 사용자 받기 시작한 이후엔 이 backfill을 절대 다시 돌리지 말 것.
--      이후 약관 갱신은 v2 INSERT + v1 retired_at 설정 → 강제 재동의 흐름으로.
-- ============================================================================
INSERT INTO public.user_consents (user_id, document_id, action, source)
SELECT u.id, d.id, 'granted', 'migration'
FROM auth.users u
CROSS JOIN public.legal_documents d
WHERE d.is_required = true
  AND d.retired_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_consents c
    WHERE c.user_id = u.id AND c.document_id = d.id
  );
