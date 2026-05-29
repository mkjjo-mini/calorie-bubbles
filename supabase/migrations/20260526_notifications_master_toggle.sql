-- 알림 마스터 토글 컬럼 추가 (user_entitlements)
ALTER TABLE public.user_entitlements
  ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT true;

-- 사용자당 24개 초과 방지 트리거
CREATE OR REPLACE FUNCTION public.enforce_user_notifications_cap()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.user_notifications
    WHERE user_id = NEW.user_id
  ) >= 24 THEN
    RAISE EXCEPTION 'notifications_cap_exceeded'
      USING ERRCODE = 'P0001',
            DETAIL  = 'Maximum 24 notification times per user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_notifications_cap ON public.user_notifications;
CREATE TRIGGER user_notifications_cap
  BEFORE INSERT ON public.user_notifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_notifications_cap();
