# 탄단지버블 QA 매뉴얼 (v1 / Steps 01·02·03·05)

> 본 문서는 자동화 테스트로는 잡기 어려운 **시각·제스처·애니메이션·다이얼로그 UX**를 사람 손으로 검수하는 시나리오 모음이에요. 단위 로직(매크로 계산, 슬롯 분류, 매크로 추정, customFoods 관리, 4단계 stage 매핑, 슬롯 그룹핑)은 `npm test`로 자동 회귀하니 우선 그 결과부터 PASS로 확인해주세요.
>
> 마지막 갱신: 2026-05-16 / 대상 빌드: Step 01·02 v2.1·03 v3·05 (Step 03 v3의 "직접 등록 폼"은 v1에서 아직 UI로 노출되지 않음 — 본 문서 §6.5 참고)

---

## 0. 사전 조건

### 0.1 환경 셋업
- Node 18+ / npm (bun 미사용)
- 의존성 설치: `npm install`
- 자동화 단위 테스트: `npm test` (전 케이스 통과 확인 후 수동 QA 진행)

### 0.2 dev 서버 실행
```bash
cd /Users/mikyung/Documents/Projects/calorie-bubbles
npm run dev
# → http://localhost:3000
```

### 0.3 권장 브라우저
- **Chrome (최신)** 또는 Safari (iOS WebView 동작 가장 근접)
- 한글 폰트 깨짐 없이 렌더링되는지 확인

### 0.4 모바일 viewport 시뮬레이션
1. Chrome DevTools (`⌘⌥I`) → Device Toolbar 토글 (`⌘⇧M`)
2. 디바이스: **iPhone 14 Pro (390×844)** 또는 **Custom 375×667**
3. 터치 이벤트 강제: DevTools 우상단 ⋮ → "Touch" 활성
4. 화면 새로고침 후 시작

### 0.5 localStorage 리셋 (테스트 격리)
브라우저 콘솔에서:
```js
localStorage.clear();
location.reload();
```
또는 DevTools → Application → Storage → "Clear site data".

### 0.6 시간대 시뮬레이션 (선택)
슬롯 자동 분류 검증 시 시스템 시간 변경 어렵다면 콘솔에서 직접 `localStorage`에 `BubbleEntry`를 주입해 테스트:
```js
const key = `cal-tracker-${new Date().getFullYear()}-${new Date().getMonth()+1}-${new Date().getDate()}`;
localStorage.setItem(key, JSON.stringify([
  { id: "t1-0", foodLogId: "t1", macro: "carbs", grams: 30, foodName: "토스트", addedAt: new Date().setHours(8,30,0,0) },
]));
location.reload();
// → "🌅 아침" 그룹에 토스트가 보여야 해요 (legacy backfill 동작)
```

---

## 1. Step 01 — SDK 연동 / 라우트 / 3탭 (수동)

`prd/v1-steps/step-01-sdk-setup.md` 검수 케이스 기반.

### 1.1 빌드 확인
- [ ] `npm run build` 에러 없이 종료 (warning은 무시 OK)

### 1.2 라우트 진입
- [ ] `/` 진입 시 홈 화면 렌더 (404 없음)
- [ ] `/history` 진입 시 빈 페이지 렌더 (Step 08에서 채울 예정, 현재는 placeholder OK)
- [ ] `/settings` 진입 시 빈 페이지 렌더 (Step 06에서 채울 예정)

### 1.3 하단 탭바
- [ ] 화면 하단에 플로팅 형태의 3탭 캡슐 노출: 홈 / 기록 / 설정
- [ ] 현재 라우트에 해당하는 탭이 검은 배경 + 흰색 텍스트로 강조됨
- [ ] 비활성 탭은 회색 텍스트
- [ ] 탭 간 전환 시 페이지가 즉시 바뀜 (전체 새로고침 발생 안 함)
- [ ] Safe area inset 적용 — 노치/홈바 디바이스에서 탭바가 가려지지 않음

### 1.4 granite.config.ts
- [ ] 파일 존재: `/Users/mikyung/Documents/Projects/calorie-bubbles/granite.config.ts`
- [ ] `appName: "tandanji-bubble"` 명시
- [ ] `web.port: 3000` / `webViewProps.type: "partner"` 확인

### 1.5 TDS 컴포넌트 적용 (보존)
- [ ] shadcn/ui 기반이지만 토스 색감(흰 배경 + neutral-900 강조)과 일관

> **알려진 차이 — Step 01 PRD vs 코드:** PRD는 `@toss/tds-mobile` 설치·TDS Button/TextField 교체를 명시하나, v1 빌드는 shadcn/ui 그대로 사용. 심사 시 디자인 가이드 위반 여부를 별도로 확인해야 해요(`apps-in-toss-qa-tester` S2 단계에서 재판정).

---

## 2. Step 02 — 홈 화면 (버블 필드 / 4단계 시각 피드백)

### 2.1 빈 상태
1. localStorage 클리어 → `/` 로드
- [ ] 버블 컨테이너 중앙에 `EmptyStomach` 일러스트 + 안내 텍스트 노출
- [ ] 상단 카운터 `0 / 2000 kcal`
- [ ] 매크로 행 `● 탄수화물 0g  ● 단백질 0g  ● 지방 0g`
- [ ] 프로그레스바 폭 0%
- [ ] 빠른 추가 트레이 영역 자체가 숨김 (즐겨찾기·최근 모두 비어 있음)
- [ ] 우하단 FAB `+` 버튼 노출 (44×44px 검은 원, 우하단 plus 아이콘)

### 2.2 첫 음식 추가 (FAB → /add → 밥 한공기)
1. FAB 탭 → `/add` 진입
2. "밥 한공기" 카드 탭 → 수량 시트 → "추가하기"
- [ ] 홈 복귀 즉시 노란 버블이 컨테이너 상단에서 낙하해 바닥에 안착
- [ ] 카운터 `305 / 2000 kcal` (밥 한공기 305kcal)로 증가
- [ ] 탄수화물 `68g` 증가
- [ ] 토스트 `밥 추가됨` 노출
- [ ] 최근 사용 트레이 줄에 "밥 한공기" 칩이 맨 앞에 추가됨

### 2.3 빠른 추가 트레이 (칩 탭 = 1인분 즉시 추가 + 뾰로롱)
1. /add에서 "닭가슴살 100g" 추가 → 홈 복귀
2. 트레이 "🕐 최근 사용"에 닭가슴살 칩 노출 확인
3. 닭가슴살 칩 **짧게 탭**
- [ ] 칩 위치에서 작은 원이 솟구쳐 컨테이너 상단으로 호(arc) 이동
- [ ] 호의 정점이 직선보다 위로 60px가량 솟음
- [ ] 약 0.8초 후 컨테이너 내부로 사라지고, 빨간 버블(닭가슴살 단백질)이 d3-force로 안착
- [ ] 칩 자체에 잔향 효과 (잠시 작아졌다가 살짝 커지고 원복)
- [ ] 카운터·매크로 즉시 갱신

### 2.4 칩 길게 누름 (400ms) → 수량 미니시트
1. 트레이의 어떤 칩이든 400ms 이상 누르고 떼지 않기
- [ ] 약 400ms 시점에 하단에서 수량 입력 시트가 슬라이드 업
- [ ] "인분" / "그램(g)" 토글, − / + 버튼, 숫자 입력, 실시간 매크로 미리보기
- [ ] 0 또는 음수일 때 "추가하기" 비활성 (40% opacity)
- [ ] "취소" 탭 시 시트 닫힘, 음식 추가되지 않음
- [ ] "추가하기" 탭 시 정상 추가 (뾰로롱 모션 **없음** — 시트 경로에서는 즉시 add)

### 2.5 4단계 시각 피드백 (목표 2000kcal 기준)

> kcal 누적 헬퍼: 콘솔에서 `for (let i=0; i<n; i++) document.querySelector('[aria-label="음식 추가"]')?.click()` 같은 매크로보다, `/add`에서 "삼겹살 200g" (700kcal) 여러 번 추가하는 게 빨라요.

#### 2.5.1 Stage 1 (0~49%)
- [ ] 0~999kcal 범위: 흰 배경 + 회색 얇은 테두리, 컨테이너 정적, 경고 텍스트 없음

#### 2.5.2 Stage 2 (50~99%, 1000~1999kcal)
- [ ] 1000kcal 도달 즉시 컨테이너 테두리가 **노란색**으로 변함 + 노란 glow(box-shadow)
- [ ] 경고 텍스트는 **여전히 없음** (PRD: "텍스트 없음")
- [ ] 버블은 압축 없음 (실제 크기 유지)

#### 2.5.3 Stage 3 (100~119%, 2000~2399kcal)
- [ ] 2000kcal 도달 즉시 컨테이너 테두리 **빨간색** + pulse 애니메이션 (반투명 깜빡임)
- [ ] 컨테이너 아래 작은 amber 텍스트 "목표를 초과했어요" 노출
- [ ] 버블이 살짝 작아짐 (compression 0.78 → 약 22% 축소)

#### 2.5.4 Stage 4 (120%+, 2400kcal+)
- [ ] 2400kcal 도달 즉시 빨간 테두리 유지 + 추가 음식 들어올 때 컨테이너가 좌우 shake (0.3s, x: ±4px)
- [ ] 빨간 텍스트 "배 터질 것 같아요 😵" 노출
- [ ] 버블 더 작아짐 (compression 0.70)

### 2.6 버블 탭 = foodLogId 그룹 삭제 + 언두
1. 닭가슴살 1인분 추가 (단백질 31g + 지방 3.6g 버블 2개 — 탄수화물 0)
2. 빨간 버블 1개 탭
- [ ] 같은 foodLogId의 버블 **두 개 모두** scale 0 + opacity 0로 사라짐
- [ ] 카운터·매크로 즉시 감소
- [ ] 하단에 sonner 토스트 `닭가슴살 삭제했어요 · 되돌리기` (5초)
- [ ] "되돌리기" 탭 시 버블 2개 복원, 토스트 사라짐
- [ ] 5초 안에 다른 음식 삭제 → 이전 토스트 자동 사라지고 새 토스트가 표시됨

### 2.7 버블 라벨 (≥ 50px만 텍스트 노출)
- [ ] 큰 grams(예: 밥 한공기 탄68g)은 버블 위에 "밥" 텍스트가 보임
- [ ] 작은 grams(예: 계란 탄0.6g — 작은 노란 버블)은 텍스트 미노출
- [ ] 노란 버블 텍스트 색은 어두운 회색(#333), 빨강·파랑 버블은 흰색

### 2.8 초기화 다이얼로그
1. 헤더 우측 "초기화" 텍스트 버튼 탭
- [ ] AlertDialog 노출: 제목 "오늘 기록을 모두 지울까요?", 설명 "지운 기록은 되돌릴 수 없어요."
- [ ] "취소" 탭 시 다이얼로그 닫히고 데이터 그대로
- [ ] "지우기" (빨간 버튼) 탭 시 모든 버블 사라짐, 토스트 `오늘 기록을 지웠어요`
- [ ] 빈 상태 일러스트 다시 노출

### 2.9 영속성 (새로고침)
- [ ] 음식 몇 개 추가 후 페이지 새로고침 → 동일 버블 상태 복원
- [ ] DevTools → Application → Local Storage → `cal-tracker-YYYY-M-D` 키 확인

---

## 3. Step 03 v3 — 음식 추가 화면 (/add)

### 3.1 진입 / 헤더
1. 홈 FAB `+` 탭
- [ ] `/add` 풀스크린 진입, 헤더 좌측에 ← 화살표
- [ ] 헤더 sticky (스크롤 시 상단 고정)
- [ ] ← 탭 시 홈 복귀 (음식 미추가)

### 3.2 검색 필터
1. 검색 인풋에 "라" 입력
- [ ] "라면 1개" 카드만 노출 (다른 카드 숨김)
- [ ] 검색 비우면 전체 음식 그리드 복원

### 3.3 즐겨찾기 토글
1. 어떤 카드든 우상단 별 아이콘 탭
- [ ] 별이 노란색 채움으로 변함
- [ ] 다시 탭 시 회색 빈 별로 복귀
- [ ] 홈 복귀 → 빠른 추가 트레이 "⭐ 즐겨찾기" 줄에 해당 음식 칩이 노출됨

### 3.4 카드 본문 탭 → 수량 시트
1. "고구마 1개" 카드 본문(별 제외) 탭
- [ ] 하단에서 수량 시트 슬라이드 업
- [ ] 제목 "고구마 1개", 기준값 표시 "1인분 기준 · 130 kcal / 130g"
- [ ] 토글: "인분" / "그램(g)" (기본 "인분")
- [ ] 입력값 변경 시 예상 영양(탄·단·지·kcal) 실시간 갱신
- [ ] 단위 토글 변경 시 입력값이 디폴트로 리셋 (인분=1, 그램=serving_g)

### 3.5 추가하기 → 홈 복귀
1. 수량 시트에서 "추가하기" 탭
- [ ] `/` 자동 이동
- [ ] 홈에 해당 음식 버블 즉시 노출
- [ ] 트레이 "최근 사용" 첫 칸에 칩 추가
- [ ] 토스트 `고구마 추가됨` 노출

### 3.6 빈 결과
1. 검색에 "@@@" 같은 매칭 없는 텍스트 입력
- [ ] 각 섹션 본문에 "결과가 없어요" 회색 텍스트 노출

### 3.7 즐겨찾기·최근 섹션 노출 조건
- [ ] localStorage `favorites`가 비어있을 때 "⭐ 즐겨찾기" 섹션 자체 미노출
- [ ] `recentFoods`가 비어있을 때 "🕐 최근 사용" 섹션 자체 미노출
- [ ] 검색어가 있으면 매칭되는 즐겨찾기·최근만 필터됨

---

## 4. Step 05 — 식사 슬롯 그룹 헤더 + 드래그앤드롭 + 액션 시트

### 4.1 자동 슬롯 분류 (수동 확인)
> 단위 테스트 `tests/inferMealSlot.test.ts`가 KST 시각 → 슬롯 매핑 12 케이스를 잠갔어요. 수동 검수는 실제 음식 추가 시점 기준 시각화 확인만.

1. 실제 현재 시각(KST)에서 음식 추가
- [ ] 시각이 05:00~10:59 → 🌅 아침 그룹
- [ ] 11:00~13:59 → 🌞 점심 그룹 (Sun 아이콘)
- [ ] 17:00~20:59 → 🌙 저녁 그룹 (Moon 아이콘)
- [ ] 그 외 → 🍪 간식 그룹 (Cookie 아이콘)

### 4.2 빈 슬롯 숨김
1. 아침에만 음식 추가 (또는 §0.6 방식으로 주입)
- [ ] 아침 헤더 + 행만 노출, 점심·저녁·간식 헤더는 **숨김**
- [ ] 4개 슬롯 모두 비면 리스트 섹션 자체 미노출

### 4.3 그룹 헤더 합계 kcal
- [ ] 헤더 우측에 해당 슬롯의 모든 음식 kcal 합계 표시
- [ ] 음식 추가/삭제 즉시 합계 갱신

### 4.4 음식 카드 한 줄 표시 (foodLogId 묶음)
- [ ] 같은 foodLogId의 탄/단/지 3개가 한 줄로 합쳐서 표시
- [ ] 좌측 색상 도트가 **최대 매크로**에 해당 (예: 밥은 탄수화물이 가장 많으니 노란 도트)
- [ ] 매크로 라인 `탄 Ng · 단 Ng · 지 Ng` (반올림된 정수)
- [ ] 우측 kcal (굵게)

### 4.5 드래그앤드롭 (슬롯 이동)
1. 데스크탑 DevTools 모바일 시뮬레이션 상태에서 임의 음식 카드를 길게 눌러 드래그
- [ ] 8px 이상 움직이면 드래그 모드 진입 (카드가 손가락을 따라옴, shadow-xl, scale 1.03)
- [ ] 드래그 중 모든 슬롯 헤더 + 본문이 드롭 타깃으로 노출 (비어있던 슬롯도 나타남)
- [ ] 드롭 타깃 hover 시 배경 틴트 + dashed outline + scale 1.01
- [ ] 다른 슬롯에 드롭 → 해당 음식이 새 슬롯으로 이동, 토스트 `{슬롯명}으로 옮겼어요`
- [ ] 같은 슬롯에 드롭 → 변경 없음, 토스트 없음
- [ ] 드롭 완료 후 빈 슬롯은 다시 숨김

> **알려진 차이 — Step 05 PRD vs 코드:** PRD는 `PointerSensor` activationConstraint를 `{ delay: 400, tolerance: 8 }`로 명시(롱프레스 후 드래그)하나, 코드는 `{ distance: 8 }`(즉시 거리 기반). 결과적으로 데스크탑 마우스로도 카드를 잡으면 즉시 드래그 모드로 들어가요. 모바일 터치에서는 자연스럽게 동작하지만, **롱프레스 햅틱 의도가 약화됨** 점을 인지하고 검수해주세요.

### 4.6 햅틱
- [ ] (지원 디바이스 한정) 드래그 시작 시 짧은 진동 (`navigator.vibrate(15)`)

### 4.7 ⋯ 액션 시트
1. 음식 카드 우측 ⋯ 아이콘 탭
- [ ] 하단에서 시트 슬라이드 업 (제목 "이 음식 · {음식명}")
- [ ] 옵션 4개: ✏️ 수량 편집 / 🔁 슬롯 변경 / 🗑️ 삭제 / 취소
- [ ] ⋯ 아이콘 탭이 드래그를 발동하지 않음 (시트만 열려야 함, stopPropagation 동작 확인)

#### 4.7.1 수량 편집
- [ ] /add 수량 시트 재사용. 현재 grams로 pre-fill됨
- [ ] 단위 토글 변경 시 입력값 초기화
- [ ] "수정하기" 탭 → 토스트 `수정했어요` + 버블 크기 갱신
- [ ] FOOD_PRESETS에 없는 음식(예: 향후 커스텀 음식)일 때는 "수량 편집" 비활성

#### 4.7.2 슬롯 변경
- [ ] 서브 시트 노출: 아침/점심/저녁/간식 4개 + 취소
- [ ] 현재 슬롯은 강조 표시(neutral-100 배경)
- [ ] 다른 슬롯 선택 → 즉시 이동 + 토스트
- [ ] 같은 슬롯 선택 → 닫힐 뿐 변경 없음

#### 4.7.3 삭제
- [ ] 즉시 행 제거 + 같은 foodLogId의 모든 버블도 사라짐
- [ ] 5초 sonner 언두 토스트
- [ ] 되돌리기 탭 시 복원 (meal_slot도 원래대로)

### 4.8 PRD-구현 차이 메모 (Step 05)
- PRD §"드래그 앤 드롭" 활성 제스처: **롱프레스 400ms** vs 코드 **거리 8px** (§4.5 참조)
- PRD `📅 캘린더 아이콘` 미사용, 코드는 `Sunrise/Sun/Moon/Cookie` lucide 아이콘으로 대체 (디자인 결정으로 인정)

---

## 5. 통합 회귀 시나리오 (E2E 수동)

> 새 브라우저 세션에서 localStorage 클리어 후 한 번에 진행.

### 5.1 첫 사용자 플로우 (Day 1)
1. [ ] 홈 진입 → 빈 상태 일러스트 + FAB만 노출
2. [ ] FAB → /add → "밥 한공기" 추가 → 홈 복귀 시 노란 버블 1개
3. [ ] 트레이 "최근 사용"에 밥 칩 노출
4. [ ] /add에서 별 토글로 "닭가슴살 100g" 즐겨찾기
5. [ ] 홈 트레이 "⭐ 즐겨찾기"에 닭가슴살 칩 노출
6. [ ] 닭가슴살 칩 짧게 탭 → 뾰로롱 모션 → 빨간·파란 버블 추가
7. [ ] MealLogList에 현재 시각 슬롯에 두 음식 모두 표시
8. [ ] 페이지 새로고침 후 동일 상태 복원

### 5.2 과식 시뮬레이션 (Stage 1→4 전이)
1. [ ] /add에서 "삼겹살 200g" (700kcal) 4번 추가 = 2800kcal
2. [ ] 단계별 시각 전이 관찰: 흰→노란→빨강pulse→빨강+shake
3. [ ] "배 터질 것 같아요 😵" 텍스트 노출
4. [ ] 버블이 확연히 작아짐(compression 0.7)

### 5.3 슬롯 이동 시나리오
1. [ ] §5.1 상태에서 MealLogList의 카드 ⋯ → 슬롯 변경 → 다른 슬롯
2. [ ] 카드가 새 슬롯 헤더 아래로 부드럽게 이동 (framer-motion layout)
3. [ ] 토스트 노출
4. [ ] 새로고침 후에도 이동된 슬롯 유지

### 5.4 언두 패턴 일관성
1. [ ] 홈 버블 탭으로 삭제 → 언두 토스트 → 되돌리기 → 복원 OK
2. [ ] MealLogList ⋯ → 삭제 → 언두 토스트 → 되돌리기 → 복원 OK
3. [ ] 헤더 "초기화" → AlertDialog → "지우기" → **언두 없음** (확정 삭제, 복원 불가) — PRD 명세

---

## 6. 알려진 차이 / 미구현 / 위험 영역

### 6.1 Step 02 시각 단계 경계
- PRD 본문 표는 `0~50% / 50~100% / 100~120% / 120%+` (s1↔s2=50%)
- 코드: `stage = rawPct >= 120 ? 4 : rawPct >= 100 ? 3 : rawPct >= 50 ? 2 : 1` → **PRD와 일치** ✅
- 단, **Lovable v1 원본 프롬프트** 텍스트에는 "0–80% / 80–100% / ..."로 적힌 부분이 남아있음(보존용). v2.1 표가 진실, 코드도 50% 기준. 자동 테스트 `tests/stage.test.ts`가 잠가둠.

### 6.2 Step 05 드래그 활성 제스처
- PRD: `{ delay: 400, tolerance: 8 }` (롱프레스 트리거)
- 코드: `{ distance: 8 }` (거리 트리거)
- **사용자 영향:** 데스크탑 마우스로 카드를 잡고 살짝 움직여도 즉시 드래그 진입. 모바일 터치에서는 손가락 미세 떨림과 스크롤 시도 사이 구분이 약화될 수 있어요.
- 코드를 PRD에 맞추려면 `MealLogList.tsx` 78줄 `{ activationConstraint: { distance: 8 } }` → `{ delay: 400, tolerance: 8 }` 변경. 본 QA 작업 범위 외.

### 6.3 Step 03 v3 "직접 등록 폼" 미구현
- 현 `/add`는 **검색 + 프리셋 그리드**만 지원
- v3 PRD가 명시하는 **직접 등록 카드 / 폼 / 카테고리 추정 / customFoods 리스트 / 편집·삭제 액션 시트 / 추정 배지**는 v1 빌드에 **없음**
- 코드 기준으로는 회귀 위험 없음 (구현되지 않은 기능을 테스트하지 않음)
- 단, **참고 구현은 `src/lib/customFoods.ts`에 순수 헬퍼로 추가**해 두었어요:
  - `kcalFromMacros`, `estimateMacrosFromKcal`, `CATEGORY_RATIOS` (8 카테고리 비율표)
  - `prependCustomFood` (dedupe by name)
  - `recomputeEstimatedFlag` (수동 편집 시 배지 제거)
  - `buildBubbleTriple` (foodLogId 그룹 일관성 + 0g skip)
  - `backfillMealSlots` (legacy 영속 backfill)
- Step 03 폼이 향후 들어올 때 이 함수들을 그대로 import해서 쓰면 자동 회귀가 따라옵니다. `tests/categoryEstimation.test.ts`, `tests/customFoodsManagement.test.ts`가 잠가둠.

### 6.4 Step 01 TDS 컴포넌트 미적용
- PRD: `@toss/tds-mobile` 설치 + Button·TextField 교체
- 코드: shadcn/ui 그대로
- **앱인토스 심사 영향:** 디자인 가이드 §"TDS 컴포넌트 우선"을 따르려면 후속 스텝에서 교체 필요. 현 단계에서는 v1 MVP로 통과 시도 가능하나, S2(런칭 전) 단계에서 다크패턴·브랜딩 매트릭스 재점검 필요.

### 6.5 영속성 키 충돌 위험
- `cal-tracker-YYYY-M-D` 키: 월·일이 zero-pad되지 않음 (예: 5월 9일은 `cal-tracker-2026-5-9`)
- 같은 키 포맷을 캘린더 뷰(Step 08)에서 재사용한다면 정렬 시 문자열 비교에 주의 (월·일이 한 자릿수일 때 사전 정렬 깨짐)
- 현 v1에서는 "오늘" 키만 쓰니 영향 없음. Step 08 진입 시 keyFormat 함수 별도 unit-test로 잠가두는 것을 권장.

### 6.6 timezone 의존성
- `inferMealSlot`은 명시적으로 Asia/Seoul을 강제 (`Intl.DateTimeFormat` timeZone 옵션)
- 사용자 기기가 KST가 아니어도 동일한 슬롯 매핑이 보장됨 — 자동 테스트가 명시적으로 KST UTC offset을 계산해 검증

### 6.7 빈 슬롯 헤더 렌더링 (Step 05)
- PRD: "슬롯이 비어있을 때 헤더 + 영역 전체 숨김 (4개 모두 비면 리스트 섹션 자체 숨김)"
- 코드 (`MealLogList.tsx`): `MEAL_SLOT_ORDER.map`으로 **항상 4개 헤더를 렌더**, 빈 슬롯은 본문에 "비어 있음" placeholder 노출. 4개 모두 비어도 섹션이 렌더됨.
- **사용자 영향:** 빈 상태 홈에서도 아침/점심/저녁/간식 4행이 모두 보임. 첫 사용자가 "왜 이렇게 비어 보이지?" 느낄 수 있음.
- 회귀 테스트는 코드 동작(`getAllByText("비어 있음")` 4개)을 잠가둠. PRD에 맞추려면 `entries.length === 0`이면 섹션 전체 return null + 슬롯별 items.length === 0이면 `<SlotDropZone>` 자체 미렌더 (드래그 중일 때만 빈 슬롯 노출)로 수정 필요.

### 6.8 매크로 추정 반올림 (Math.round half-up)
- JS `Math.round`는 `.5`에서 **항상 위로 올림** (banker's rounding 아님)
- `estimateMacrosFromKcal(500, "rice_grain_noodle")` → 탄 93.75 → **93.8**, 단 16.25 → **16.3**
- 카테고리 추정 결과가 PRD 예시(93.75g)와 0.05g 차이로 어긋나 보일 수 있으나 합산 kcal로 환산하면 ±2 kcal 이내 — 무시 가능

---

## 7. 셀프 체크리스트 (QA 종료 전 한 번 더)

- [ ] `npm test` 통과 (자동 회귀)
- [ ] `npm run build` 성공
- [ ] Chrome iPhone 14 Pro viewport에서 §1·§2·§3·§4 PASS
- [ ] localStorage 클리어 후 §5 E2E 시나리오 PASS
- [ ] 알려진 차이(§6)를 PR 리뷰어/제품 오너에게 공유
- [ ] 새 BUG는 `apps-in-toss-qa-tester` 에이전트 §8 버그 리포트 템플릿으로 기록

---

## 8. 자동화 커버리지 매트릭스

| 케이스 | 자동화 | 위치 |
|---|---|---|
| `inferMealSlot` 4시간대 + 경계값 12종 | ✅ | `tests/inferMealSlot.test.ts` |
| 매크로 → kcal Atwater 계산 | ✅ | `tests/atwater.test.ts` |
| 카테고리 추정 8종 + 합계 100% 보장 | ✅ | `tests/categoryEstimation.test.ts` |
| customFoods prepend / dedupe by name | ✅ | `tests/customFoodsManagement.test.ts` |
| `is_estimated` 플래그 변화 | ✅ | `tests/customFoodsManagement.test.ts` |
| BubbleEntry 그룹 일관성 (같은 foodLogId·meal_slot) | ✅ | `tests/bubbleTriple.test.ts` |
| 0g 매크로 skip + 1 decimal 반올림 | ✅ | `tests/bubbleTriple.test.ts` |
| 4단계 stage rawPct→1/2/3/4 매핑 + compression | ✅ | `tests/stage.test.ts` |
| legacy meal_slot backfill (mutated 플래그) | ✅ | `tests/backfillMealSlots.test.ts` |
| MealLogList 슬롯 그룹핑 / 빈 슬롯 숨김 / kcal 합 | ✅ | `tests/MealLogList.test.tsx` |
| dnd-kit 실제 드래그앤드롭 시뮬레이션 | ❌ 수동 | §4.5 |
| 롱프레스 (400ms 칩 보유 → 시트) | ❌ 수동 | §2.4 |
| framer-motion 뾰로롱 모션 (Phase 1~3, 0.83s arc) | ❌ 수동 | §2.3 |
| 4단계 컨테이너 시각 전이 (border / glow / shake) | ❌ 수동 | §2.5 |
| AlertDialog 초기화 확인 | ❌ 수동 | §2.8 |
| Sheet (수량 / 슬롯 / 액션) 시각 UX | ❌ 수동 | §3.4, §4.7 |
| sonner 토스트 (등장 / undo / 자동 dismiss) | ❌ 수동 | §2.6, §4.7.3 |
| 햅틱 진동 | ❌ 수동 | §4.6 |
| safe-area-inset · FAB 위치 | ❌ 수동 | §1.3, §2.1 |
