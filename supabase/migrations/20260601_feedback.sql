create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  user_email  text,
  type        text not null check (type in ('bug', 'feature')),
  severity    int  check (severity between 1 and 4), -- bug 시만 사용
  content     text not null,
  created_at  timestamptz not null default now()
);

alter table feedback enable row level security;

-- 서비스 롤(서버)만 insert/select. 사용자는 자신의 행만 조회 가능.
create policy "service role full access" on feedback
  for all using (true) with check (true);
