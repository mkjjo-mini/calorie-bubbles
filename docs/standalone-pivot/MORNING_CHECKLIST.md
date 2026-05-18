# 🌅 아침에 확인할 것 — Standalone Auth 전환

> 작업 일시: 2026-05-18 야간
> 브랜치: `feature/standalone-auth`
> 이전 상태: `main` (1d14717, Apps in Toss 미니앱)

---

## 📦 한눈에 보는 변경 사항

| 영역 | Before | After |
|---|---|---|
| 인증 | Apps in Toss SDK `appLogin` + Toss userKey | **Supabase Auth** (이메일/Apple/Google) |
| 사용자 식별자 | `user_key` (bigint, Toss) | `user_id` (uuid, `auth.users.id`) |
| 세션 | KV에 자체 저장 + 쿠키 `session=<id>` | Supabase가 발급한 쿠키 (`sb-*`) 자동 관리 |
| 서버 미들웨어 | `withSession(userKey)` | `withUser({userId, admin})` |
| 로그인 화면 | 없음 (자동 silent login) | `/auth/login`, `/auth/signup`, `/auth/forgot`, `/auth/reset` |
| mTLS 인증서 | dev: PEM 2개, prod: wrangler binding | **불필요 — 삭제 가능** |
| KV namespace (SESSIONS) | 사용 중 | **불필요 — wrangler.jsonc에서 제거됨** |
| granite.config.ts | Apps in Toss 진입점 | **삭제됨** |

---

## ⏭️ 가장 먼저 할 일 (5분)

### 1️⃣ Supabase ANON 키 채우기

`.env.local`에 아래 두 줄이 비어 있어요. Supabase Dashboard에서 복사해 채워주세요:

```
SUPABASE_ANON_KEY=
VITE_SUPABASE_ANON_KEY=
```

**위치:** [Supabase Dashboard](https://supabase.com/dashboard) → 프로젝트(`kjpxczdmlwfiefzpyuop`)
→ Settings → API → **"Project API keys"** 섹션 → `anon` `public` 키 복사

> ⚠️ 두 줄 모두 **같은 anon 키** 사용. 한 줄은 서버측(Worker), 한 줄은 브라우저 번들(Vite)이 읽어요.
> service_role 키와 헷갈리지 말 것 — service_role은 절대 클라이언트에 넣지 마세요.

### 2️⃣ DB 마이그레이션 실행

`supabase/migrations/20260518_standalone_auth.sql` 파일을 Supabase Dashboard → SQL Editor에 통째로 붙여넣고 Run.

**무엇을 함:**
- 기존 `foods`/`food_logs`/`user_goals`/`user_profiles`/`user_notifications`/`favorites` 전부 DROP (테스트 데이터라 비움)
- `user_id uuid REFERENCES auth.users(id)`로 재생성
- RLS 정책 추가 (`auth.uid() = user_id`)
- updated_at 자동 갱신 트리거

**소요:** 약 5초.

### 3️⃣ 로그인 테스트

```bash
npm run dev
```

- 브라우저로 http://localhost:5173 접속 → `/auth/login`으로 자동 리다이렉트
- 이메일/비밀번호로 회원가입 (`/auth/signup`)
- (Supabase Auth가 기본적으로 이메일 인증 ON일 수 있음 — Dashboard → Authentication → Providers → Email → "Confirm email" OFF로 끄면 즉시 가입 가능, 또는 메일 링크 클릭)
- 홈 → 설정 → 프로필/목표 저장 → 데이터가 DB에 들어가는지 확인
- 설정 맨 아래 "로그아웃" 누르면 다시 `/auth/login`으로

---

## 🍎 Apple / Google OAuth 활성화 (선택, 30분~)

지금은 코드에 버튼만 있고 OAuth provider 등록이 안 됐기 때문에 누르면 에러 나요.
**이메일 로그인은 즉시 동작**하니 OAuth는 천천히 셋업해도 됩니다.

### Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com) → 새 프로젝트 → "API 및 서비스" → "OAuth 동의 화면" 설정
2. "사용자 인증 정보" → "OAuth 클라이언트 ID 만들기" → **웹 애플리케이션**
3. 승인된 리디렉션 URI에 추가:
   - `https://kjpxczdmlwfiefzpyuop.supabase.co/auth/v1/callback`
4. 발급된 `Client ID` / `Client Secret` 복사
5. Supabase Dashboard → Authentication → Providers → Google → 활성화 + ID/Secret 입력

### Apple Sign-In

1. [Apple Developer](https://developer.apple.com) → Identifiers
   - **App ID** 생성 (Sign in with Apple 활성화)
   - **Services ID** 생성 (Return URLs에 `https://kjpxczdmlwfiefzpyuop.supabase.co/auth/v1/callback`)
   - **Key** 생성 (Sign in with Apple 활성화) → `.p8` 파일 다운로드
2. Supabase Dashboard → Authentication → Providers → Apple → 활성화
   - Services ID, Key ID, Team ID, `.p8` 내용 입력
3. 클라이언트에서 `signInWithOAuth({ provider: 'apple' })` 호출 시 정상 동작

> 🍎 Apple 개발자 계정 ($99/년) 필요. 앱스토어 출시를 위해서도 필요하니 어차피 구매할 거예요.

---

## 🚀 정식 앱스토어 등록 — 다음 단계

지금은 **웹앱(TanStack Start + Cloudflare Workers)** 상태입니다. 앱스토어 등록을 위해서는:

### Option A. Capacitor 래핑 (Recommended, 빠름)
- 현재 웹앱을 그대로 iOS/Android 네이티브 셸로 감싸기
- 푸시 알림, 인앱 결제, 카메라 등 native API도 plugin으로 접근
- 1~2주면 첫 빌드 가능
- **다음에 도전할 가치 있음**

### Option B. React Native 재작성
- UX는 더 네이티브 느낌
- 작업량 큼 (전체 라우팅·컴포넌트 다시)
- 1~2개월

### Option C. PWA + 웹 우선 (앱스토어 미등록)
- 지금 그대로 두고 도메인만 사면 됨
- 앱스토어 노출은 못 받지만 가장 빠름

**오늘 작업은 어느 option을 선택하든 그대로 활용됩니다** (Supabase Auth, DB 스키마, UI 모두 공통).

---

## 📂 새로 추가된 / 변경된 파일

### 추가
```
supabase/migrations/20260518_standalone_auth.sql   # DB 마이그레이션
src/server/auth/supabase-server.ts                 # 서버측 Supabase SSR 클라
src/lib/supabase-browser.ts                        # 브라우저 Supabase 클라
src/routes/auth.login.tsx                          # 로그인
src/routes/auth.signup.tsx                         # 회원가입
src/routes/auth.forgot.tsx                         # 비밀번호 재설정 요청
src/routes/auth.reset.tsx                          # 새 비밀번호 입력
src/components/auth/SocialIcons.tsx                # Apple/Google 로고
docs/standalone-pivot/MORNING_CHECKLIST.md         # 본 문서
```

### 대규모 변경
```
src/hooks/useSession.ts          # Toss 세션 → Supabase 세션
src/routes/__root.tsx            # 라우트 가드 추가, 디버그 패널 제거
src/routes/settings.tsx          # 로그아웃 메뉴 추가
src/server/auth/env.ts           # Toss/KV 바인딩 제거
src/server/auth/middleware.ts    # withSession → withUser
src/server/auth/router.ts        # /api/auth/{me,logout,callback}
src/server/auth/dev-env.ts       # Toss env 제거
src/server/api/*.ts              # user_key → user_id (전부)
src/lib/repository/types.ts      # user_key → user_id
src/lib/repository/cloud.ts      # 401 → /auth/login redirect
wrangler.jsonc                   # KV 제거, SUPABASE_URL/ANON_KEY vars
.env.local.example               # mTLS 제거, Supabase ANON 추가
```

### 삭제
```
granite.config.ts                # Apps in Toss 진입점
src/lib/toss-sdk.ts              # appLogin SDK 래퍼
src/server/auth/toss-oauth.ts    # 토스 OAuth/mTLS 호출
src/server/auth/login.ts         # /api/auth/login (코드 교환)
src/server/auth/me.ts            # /api/auth/me (KV 조회)
src/server/auth/logout.ts        # /api/auth/logout
src/server/auth/session.ts       # KV 세션 read/write
src/server/db/supabase.ts        # admin 클라 (supabase-server로 통합)
package.json: @apps-in-toss/web-framework  # 의존성 제거
```

---

## 🧹 청소해도 되는 것 (선택)

### mTLS PEM 파일
```bash
# Toss API용 — 이제 안 씀
rm -rf /Users/mikyung/Documents/BusinessDocs/mtls-tandanji-bubble-dev/
```

### KV namespace (Cloudflare)
```bash
# wrangler.jsonc에서 빠졌지만 prod KV는 아직 살아있음. 비용은 거의 0이지만 정리하려면:
npx wrangler kv namespace delete --namespace-id 71e26d1917784bd985719380152d8d40
```

### 앱인토스 콘솔
지금 그냥 둬도 무방. 정리하려면:
- mTLS 인증서 폐기
- 앱 등록 자체는 그대로 두거나 "사용 중단" 상태로 유지

---

## 🔄 main으로 합칠 때

```bash
# 검증 끝나면
git checkout main
git merge --no-ff feature/standalone-auth
git push
```

또는 GitHub에서 PR로 검토 후 머지. (PR 만들고 싶으면 `gh pr create` 사용)

---

## 🐛 만약 문제가 생기면

### "VITE_SUPABASE_URL 누락" 에러
→ `.env.local`의 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 확인 + vite dev 재시작 (env 변경은 재시작 필요)

### 로그인 후 즉시 401 SESSION_EXPIRED
→ Supabase Dashboard → Auth → Settings → "Site URL"이 `http://localhost:5173`인지 확인

### 데이터가 안 들어감
→ Supabase Dashboard → SQL Editor에서 `SELECT * FROM auth.users` → 본인 row가 보이는지 확인
→ `SELECT * FROM public.foods WHERE user_id = '<자기 uuid>'`

### 롤백하고 싶을 때
```bash
git checkout main
# main 그대로 살아있음. feature 브랜치는 안 지우는 게 안전
```

---

## ✅ 완료 체크리스트 (아침에 직접 체크)

- [ ] `.env.local`의 `SUPABASE_ANON_KEY` + `VITE_SUPABASE_ANON_KEY` 채움
- [ ] `supabase/migrations/20260518_standalone_auth.sql` Dashboard에서 실행
- [ ] Supabase Auth → Email Provider 활성화 (보통 기본 ON)
- [ ] `npm run dev` 후 회원가입 → 로그인 → 데이터 저장 → 로그아웃 한 사이클 동작 확인
- [ ] (선택) Google/Apple OAuth provider 등록
- [ ] (선택) main 머지

수고하셨어요. 🌙
