-- ============================================================================
--  food-photos Storage 버킷 + RLS
--
--  경로 규칙: <user_id>/<food_id>.jpg
--  본인 폴더만 read/write 가능. Public read OFF.
--  클라이언트는 anon key + 사용자 세션으로 직접 upload (Worker 거치지 않음 — 비용↓).
--
--  실행: Supabase Dashboard → SQL Editor → 본 파일 전체 → Run
-- ============================================================================

-- 1. 버킷 생성 (이미 있으면 conflict 무시)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'food-photos',
  'food-photos',
  false,
  500000,  -- 500KB (200x200 JPEG는 보통 30KB 내외, 여유 둠)
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS 정책 — 본인 폴더(<user_id>/...) 만 접근
-- storage.foldername(name)는 path를 '/'로 split한 배열 반환
-- 첫 요소가 auth.uid()와 일치하면 본인 폴더

DROP POLICY IF EXISTS "food-photos: 본인 폴더 읽기" ON storage.objects;
CREATE POLICY "food-photos: 본인 폴더 읽기"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'food-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "food-photos: 본인 폴더 업로드" ON storage.objects;
CREATE POLICY "food-photos: 본인 폴더 업로드"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'food-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "food-photos: 본인 폴더 수정" ON storage.objects;
CREATE POLICY "food-photos: 본인 폴더 수정"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'food-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "food-photos: 본인 폴더 삭제" ON storage.objects;
CREATE POLICY "food-photos: 본인 폴더 삭제"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'food-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
