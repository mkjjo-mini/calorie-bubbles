# 내부 운영 대시보드 (Internal Ops Dashboard) — 설계

- 작성일: 2026-07-03
- 대상 레포: calorie-bubbles
- 상태: 설계 승인됨 (구현 계획 대기)

## 1. 목적 & 배경

calorie-bubbles 제품의 **비즈니스/운영 현황을 나 혼자(내부) 실시간으로 파악·분석**하기 위한 대시보드. 데이터는 기존 Supabase에서 실시간 조회한다.

핵심 제약:

- **비공개**: 나/내부만 접근. URL 노출만으로 외부인이 볼 수 없어야 한다.
- **실시간 조회**: 커밋된 정적 데이터가 아니라 Supabase에서 최신 집계를 읽는다.
- **전체 사용자 가로 집계**: 특정 사용자가 아닌 전체 모수 기준 집계가 필요하다.

### GitHub Pages를 쓰지 않는 이유 (결정 근거)

1. 접근 제어가 되는 "private Pages"는 **GitHub Enterprise Cloud 전용**이다. 개인/Pro 플랜에서는 레포를 private로 바꿔도 게시된 Pages 사이트 URL은 공개로 노출된다 → "비공개" 요구 불충족.
2. GitHub Pages는 **정적 파일만** 서빙한다(백엔드 없음). Supabase service 키를 안전하게 보관하거나 서버 측 집계를 수행할 수 없어, 키를 브라우저에 노출하는 취약한 방식이 강제된다.

→ 이미 calorie-bubbles가 Cloudflare(wrangler)로 배포 중이므로, **Cloudflare Worker + Cloudflare Access**로 접근 제어와 백엔드를 둘 다 무료 티어 내에서 얻는다.

## 2. 범위 (v1)

포함 지표:

1. **가입자 추이** — 신규/누적 (`auth.users`, 일/주/월)
2. **활성 사용자** — DAU/WAU/MAU (`food_logs` ∪ `ai_call_logs` 기록 기준)
3. **구독 전환 & 티어 분포** — free/basic/pro 분포, 무료→유료 전환율 (`user_entitlements`)
4. **매출 추이** — 결제 금액(₩) 일/월별, 이벤트 유형(신규/갱신/해지) (`subscription_events`)
5. **AI 호출 비용** — 비용(₩/$) 일별·누적, text vs photo, 모델별, 성공률 (`ai_call_logs`)

명시적 제외 (YAGNI):

- 자동 실시간 스트리밍(WebSocket/폴링). v1은 로드 시 조회 + 수동 새로고침.
- 개인(사용자 단위) 드릴다운.
- 사용자 행동/제품 사용성 상세, 피드백 분석 (별도 버전에서 고려).
- miniapp-strategy 등 타 레포 지표 통합.

## 3. 아키텍처

```
브라우저 (Cloudflare Access 게이트 통과)
    │  GET /            → 정적 HTML + Chart.js
    │  GET /api/*?from=&to=
    ▼
Cloudflare Worker (독립 배포, dashboard/wrangler.jsonc)
    │  - 정적 자산 서빙
    │  - Cf-Access-Jwt-Assertion 헤더 검증 (없으면 403)
    │  - Supabase service_role 키 (wrangler secret)로 RPC 호출
    ▼
Supabase — analytics_* RPC 함수 (SECURITY DEFINER, 집계만 반환)
```

- **배포 위치**: calorie-bubbles 레포 내 `dashboard/` 폴더. 소비자 앱과 **별개인 독립 Worker**로 배포(자체 `wrangler.jsonc`). 앱 번들/배포와 완전 분리.
- **접근 제어**: Cloudflare Access 정책으로 Worker 도메인 전체를 허용 이메일(bbuduck@gmail.com 등)에만 오픈. 별도 로그인 코드 불필요.
- **프론트**: 단일 페이지 정적 HTML + Chart.js. 빌드 단계 최소화(번들러 없이 CDN 또는 단순 번들 중 구현 계획에서 결정).

## 4. 데이터 계층 — Supabase RPC 함수

Worker에 raw SQL을 두지 않고, **신규 마이그레이션으로 `SECURITY DEFINER` 분석 함수**를 추가해 버전 관리한다. Worker는 PostgREST RPC(`POST /rest/v1/rpc/<fn>`)로 호출한다.

| 엔드포인트 | RPC 함수 | 소스 테이블 | 반환 |
|---|---|---|---|
| `/api/signups` | `analytics_signups_by_day(from_date, to_date)` | `auth.users` | 일별 신규 수 + 누적 |
| `/api/active` | `analytics_active_users(from_date, to_date)` | `food_logs` ∪ `ai_call_logs` | 일별 DAU, 롤링 WAU/MAU |
| `/api/subscriptions` | `analytics_tier_breakdown()` | `user_entitlements` | 티어별 인원, 무료/유료 비율, 전환율 |
| `/api/revenue` | `analytics_revenue_by_day(from_date, to_date)` | `subscription_events` | 일별 금액(₩) 합계, 이벤트유형별 건수 |
| `/api/ai-cost` | `analytics_ai_cost_by_day(from_date, to_date)` | `ai_call_logs` | 일별 비용(₩/$), mode·모델별, 성공률 |

원칙:

- 함수는 **집계 결과만** 반환하고 개인 식별 로우를 노출하지 않는다.
- 기간 인자 기본값 없이 Worker가 항상 `from`/`to`를 전달한다.
- `auth.users` 접근이 필요한 함수는 `SECURITY DEFINER`로 소유자 권한 실행하되, 반환 컬럼을 집계치로 한정한다.

## 5. 데이터 흐름 & UX

- 브라우저(Access 통과) → `GET /api/x?from=&to=` → Worker가 Supabase RPC 호출 → JSON → 프론트 렌더.
- **새로고침 모델**: 페이지 로드 시 최신 조회 + 수동 "새로고침" 버튼. 자동 스트리밍 없음.
- **기본 기간**: 최근 30일. 상단 기간 선택기(7/30/90일).
- **레이아웃**: 상단 KPI 요약 카드 5개(핵심 수치) + 하단 시계열 차트 5개.

## 6. 에러 처리 & 보안

- Supabase `service_role` 키는 **`wrangler secret`**으로만 주입. 코드/레포/프론트에 포함하지 않는다.
- Worker는 요청의 `Cf-Access-Jwt-Assertion` 헤더 존재를 확인(심층 방어). 없으면 403. (Access가 1차 게이트, 헤더 검증이 2차.)
- 프론트는 **카드/차트 단위 에러 상태**("데이터 불러오기 실패 · 재시도")를 표시한다. 한 엔드포인트 실패가 전체 화면을 깨뜨리지 않는다.
- API 에러는 구조화 JSON `{ error: string, code: string }` 형태로 반환한다.
- 기존 소비자 앱의 anon 키/배포와 격리 — 대시보드 Worker는 별도 시크릿·별도 배포.

## 7. 테스트 전략

- **RPC 함수**: 마이그레이션에 검증용 샘플 쿼리 포함, 로컬 Supabase로 스모크 검증(기간 경계·빈 결과·집계 정확성).
- **Worker 엔드포인트**: vitest로 Supabase fetch 목킹 → 응답 shape·기간 파라미터 전달·에러 매핑·403(Access 헤더 없음) 검증.
- **프론트**: 경량 스모크(정상 렌더 + 카드 단위 에러 상태). 내부 도구이므로 과도한 E2E는 지양.

## 8. 미해결/구현 단계 결정 사항

- 프론트 빌드 방식(순수 정적 + CDN Chart.js vs 경량 번들) — 구현 계획에서 확정.
- Worker 배포 도메인/서브도메인(`workers.dev` vs 커스텀 서브도메인) 및 Access 정책 세부 — 구현 계획에서 확정.
- `analytics_active_users`의 WAU/MAU 롤링 윈도 정의(예: 최근 7일/30일 활동) 상세 — 구현 시 확정.

## 9. 성공 기준

- 허용 이메일로만 접속 가능(타 계정·URL 직접 접근 차단 확인).
- 5개 지표가 Supabase 최신 데이터 기준으로 렌더되고, 기간 선택·새로고침이 동작.
- Supabase service 키가 브라우저 네트워크/번들 어디에도 노출되지 않음.
- 소비자 앱 배포에 영향 없음(독립 Worker).
