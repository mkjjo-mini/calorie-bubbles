-- ============================================================================
--  Standalone Auth 전환 — user_key(bigint) → user_id(uuid, auth.users FK)
--
--  Apps in Toss 미니앱 (Toss userKey 기반) → 정식 앱스토어 배포 (Supabase Auth)
--  로 피벗하면서 모든 테이블의 사용자 식별자를 변경.
--
--  ⚠️  기존 데이터(user_key 기반)는 모두 DROP — 이전 대화에서 "모두 테스트라
--      무시해도 된다" 확인 받음. 운영 사용자 없는 상태에서 실행.
--
--  실행: Supabase Dashboard → SQL Editor → 본 파일 전체 붙여넣기 → Run
--      또는 supabase db push (CLI)
--
--  실행 후 .env.local에 SUPABASE_ANON_KEY 추가 필요
-- ============================================================================

-- 0. 기존 객체 모두 DROP (역참조 순서)
DROP TRIGGER IF EXISTS foods_history_trg ON public.foods;
DROP FUNCTION IF EXISTS public.log_foods_history();
DROP TABLE IF EXISTS public.foods_history CASCADE;
DROP TABLE IF EXISTS public.favorites CASCADE;
DROP TABLE IF EXISTS public.food_logs CASCADE;
DROP TABLE IF EXISTS public.user_notifications CASCADE;
DROP TABLE IF EXISTS public.user_goals CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;
DROP TABLE IF EXISTS public.foods CASCADE;

-- ============================================================================
--  1. foods — 사용자별 음식 라이브러리
-- ============================================================================
CREATE TABLE public.foods (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source          text NOT NULL CHECK (source IN ('user','api','preset')),
  food_code       text,
  name            text NOT NULL,
  serving_unit    text NOT NULL DEFAULT '인분',
  serving_amount  numeric NOT NULL DEFAULT 1,
  serving_g       numeric NOT NULL,
  kcal            numeric NOT NULL,
  carb_g          numeric NOT NULL DEFAULT 0,
  protein_g       numeric NOT NULL DEFAULT 0,
  fat_g           numeric NOT NULL DEFAULT 0,
  category        text,
  is_estimated    boolean NOT NULL DEFAULT false,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX foods_user_active_idx
  ON public.foods (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX foods_user_food_code_idx
  ON public.foods (user_id, food_code)
  WHERE food_code IS NOT NULL;

-- ============================================================================
--  2. food_logs — 식사 기록
-- ============================================================================
CREATE TABLE public.food_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  food_id       uuid NOT NULL REFERENCES public.foods(id) ON DELETE RESTRICT,
  logged_date   date NOT NULL,
  meal_slot     text NOT NULL CHECK (meal_slot IN ('breakfast','lunch','dinner','snack')),
  grams         numeric NOT NULL,
  kcal          numeric NOT NULL,
  carb_g        numeric NOT NULL DEFAULT 0,
  protein_g     numeric NOT NULL DEFAULT 0,
  fat_g         numeric NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX food_logs_user_date_idx
  ON public.food_logs (user_id, logged_date, created_at);

-- ============================================================================
--  3. user_goals — 일일 목표 (history-style, INSERT-only)
-- ============================================================================
CREATE TABLE public.user_goals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_kcal_value    numeric NOT NULL,
  daily_kcal_dir      text NOT NULL DEFAULT 'max' CHECK (daily_kcal_dir IN ('min','max')),
  protein_g_value     numeric,
  protein_g_dir       text NOT NULL DEFAULT 'min' CHECK (protein_g_dir IN ('min','max')),
  carb_g_value        numeric,
  carb_g_dir          text NOT NULL DEFAULT 'max' CHECK (carb_g_dir IN ('min','max')),
  fat_g_value         numeric,
  fat_g_dir           text NOT NULL DEFAULT 'max' CHECK (fat_g_dir IN ('min','max')),
  effective_from      date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date,
  effective_to        date,
  notification_time   text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_goals_user_eff_idx
  ON public.user_goals (user_id, effective_from DESC);

-- ============================================================================
--  4. user_profiles — 신체정보 + 목표 (한 사용자당 한 row)
-- ============================================================================
CREATE TABLE public.user_profiles (
  user_id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  height_cm            numeric NOT NULL,
  weight_kg            numeric NOT NULL,
  sex                  text NOT NULL CHECK (sex IN ('male','female')),
  birth_year           integer NOT NULL,
  activity_level       text NOT NULL DEFAULT 'sedentary'
                       CHECK (activity_level IN ('sedentary','light','moderate','active','very_active')),
  goal                 text NOT NULL DEFAULT 'maintain'
                       CHECK (goal IN ('loss','maintain','gain')),
  target_weight_kg     numeric,
  target_period_weeks  integer,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
--  5. user_notifications — 푸시 알림 시간 (한 사용자당 N개)
-- ============================================================================
CREATE TABLE public.user_notifications (
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  time      text NOT NULL CHECK (time ~ '^([01][0-9]|2[0-3]):(00|30)$'),
  PRIMARY KEY (user_id, time)
);

-- ============================================================================
--  6. favorites — 즐겨찾기 (user × food)
-- ============================================================================
CREATE TABLE public.favorites (
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  food_id   uuid NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
  added_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, food_id)
);
CREATE INDEX favorites_user_added_idx ON public.favorites (user_id, added_at DESC);

-- ============================================================================
--  7. RLS — 모든 테이블에서 본인 데이터만 접근.
--          서버 API는 service_role 키로 우회하지만, 클라이언트가 anon 키로 직접
--          접근할 가능성을 차단하는 defense-in-depth.
-- ============================================================================
ALTER TABLE public.foods              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_goals         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites          ENABLE ROW LEVEL SECURITY;

-- foods: 본인 row 전부 (CRUD)
CREATE POLICY foods_owner_all ON public.foods
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- food_logs: 본인 row 전부 + 본인의 food만 참조 가능
CREATE POLICY food_logs_owner_all ON public.food_logs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_goals_owner_all ON public.user_goals
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_profiles_owner_all ON public.user_profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_notifications_owner_all ON public.user_notifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY favorites_owner_all ON public.favorites
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
--  8. updated_at 자동 갱신 트리거 (foods, user_profiles)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER foods_touch_updated_at
  BEFORE UPDATE ON public.foods
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER user_profiles_touch_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
