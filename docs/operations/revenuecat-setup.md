# RevenueCat 구독결제 셋업 체크리스트 (Step 13)

> 탄단지버블 IAP 구독(RevenueCat) 셋업·연동 진행 추적.
> PRD: `miniapp-strategy/products/tandanji-bubble/prd/v1-steps/step-13-iap-subscription.md`
> 최종 갱신: 2026-06-07

## ⭐ 꼭 잊지 말 것 (수익 직결)

- [ ] **Apple Small Business Program 신청** — App Store Connect → 계약/세금/금융(Agreements, Tax, and Banking)
  - 효과: App Store 수수료 30%→**15%**, 수령액 70%→**85%** (가입 첫날부터)
- [ ] **신청 승인 후 RevenueCat에 가입일 입력**
  - RevenueCat → Apps → 탄단지버블(App Store) → **Apple Small Business Program → Start date**
  - 안 하면 RevenueCat이 수수료를 70%로 잘못 계산

## App Store Connect

- [x] 구독 그룹 "탄단지버블 구독" 생성 (ID 22139557)
- [x] 4개 상품 등록 + 등급(레벨1: pro_annual·pro_monthly / 레벨2: basic_annual·basic_monthly)
- [x] 현지화(표시이름·설명) + 가격
- [ ] 심사 스크린샷 — **앱 빌드 제출 시** 첨부 (첫 구독은 앱과 함께 심사)
- [ ] **Small Business Program 신청** (위 ⭐)
- [ ] Billing Grace Period 활성화 (결제 실패 시 6/16일 무중단 복구)

## RevenueCat 대시보드

- [x] **이메일 주소 인증**
- [x] 프로젝트 생성 (Tandanji Bubble, Health, Capacitor)
- [x] App Store 앱 연결 (app.tandanjibubble + In-App Purchase Key `X42493QT33`)
- [x] Products — 4개 상품 등록 (pro/basic × 월/연) ※ "Could not check"는 앱 심사 전이라 정상
- [x] Entitlements — `pro`, `basic` 2개 + 상품 attach
- [x] Offerings — `default` offering, 4개 package
- [x] API keys — public `appl_BuOHKxb...` (앱 SDK)
- [x] Integrations → Webhooks — URL `https://tandanjibubble.app/api/revenuecat/webhook` + Authorization 헤더

## 코드 (calorie-bubbles)

- [x] DB 마이그레이션 작성 `supabase/migrations/20260607_revenuecat.sql`
- [x] **DB 마이그레이션 실행** (Supabase SQL Editor) ✅ 2026-06-07
- [x] `src/lib/iap-products.ts` (상품 ID·tier 매핑)
- [x] `src/server/api/revenuecat-events.ts` + `revenuecat-webhook.ts`
- [x] `src/lib/purchases.ts` (Capacitor 결제 래퍼)
- [x] env 배선 + dev `.env.local` 실제 값 (public key, webhook secret)
- [x] **PaywallModal 실제 결제 버튼 연결** (월/연, 웹은 안내 폴백)
- [x] **앱 루트 `initPurchases`** (`__root.tsx`, 로그인 후 RevenueCat configure)
- [ ] `cap sync ios` — 네이티브 IAP 플러그인 등록 (+ pod install)
- [ ] **prod 환경변수 설정** — `wrangler secret put RC_WEBHOOK_AUTH_HEADER` + 배포 시 `VITE_RC_PUBLIC_API_KEY_IOS` 빌드 주입
- [ ] 배포 (`npm run deploy`)
- [ ] `bun install` — lockfile 정리 (SDK가 npm으로 설치돼 package-lock만 갱신됨)

## Sandbox 테스트 (검수 기준, PRD §8.1)

- [ ] Sandbox 결제 → tier=pro 즉시 반영
- [ ] Sandbox 환불 → tier=free 강등 + refund_count++
- [ ] 자동 갱신 → expires_at 갱신
- [ ] BILLING_ISSUE(grace) 동안 Pro 유지
- [ ] 환불 누적 차단 메시지
- [ ] 웹 환경 → "앱에서 결제" 안내

## 비고

- webhook 동작 전제: DB 마이그레이션(완료) + prod `RC_WEBHOOK_AUTH_HEADER`(미완) + 배포(미완).
  prod env 없으면 webhook 500(CONFIG_MISSING) — 정상.
- 결제 후 tier 반영 경로: Apple → RevenueCat → webhook → user_subscriptions UPSERT → 트리거 → user_entitlements.tier.
  PaywallModal은 결제 성공 후 2초 뒤 재invalidate로 webhook 처리 시간 확보.
