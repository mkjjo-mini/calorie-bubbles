## 목표
홈탭에서 오늘 외 다른 날짜의 기록도 보고, 추가/수정/삭제할 수 있게 한다.

## UI 구성

### 1. 헤더 — 날짜 셀렉터
- 가운데 라벨 좌우에 `◀` `▶` 화살표 버튼 (±1일, 미래는 비활성)
- **오늘일 때**: 라벨 = `오늘의 칼로리`
- **과거일 때**: 라벨 = `11/15 화` 형태(괄호 없음), 우측 "비우기" 자리 옆에 작은 **`오늘`** 버튼이 추가로 노출되어 한 번에 복귀
- 라벨을 탭하면 shadcn `Popover` + `Calendar`(single mode)로 임의 날짜 선택. 미래 날짜는 `disabled`

### 2. 데이터 흐름
- `const [selectedDate, setSelectedDate] = useState(todayKST())`
- 기존 `loadTodayLogs()` → `loadLogsForDate(date)`로 일반화, `useEffect([selectedDate])`에서 호출
- `isToday = selectedDate === todayKST()` 파생 값
- 다이얼로그 카피 등 "오늘" 고정 표현은 `isToday` 분기로 처리

### 3. 음식 추가 (FAB / QuickAddTray)
- 추가 시 `logged_date = selectedDate` 로 저장 (보고 있는 날짜에 추가)
- `QuickAddTray`에 `loggedDate` prop 추가, 내부 `foodLogs.create` 호출 시 주입
- FAB의 `/add` 이동 시 search param으로 `date` 전달:
  `navigate({ to: "/add", search: { date: selectedDate } })`
- `/add` 라우트: `validateSearch`에 `date` 추가하고, 저장 로직에서 그 값 사용

### 4. 삭제 / Undo / Reset
- 기존 로직 그대로. id 기반이라 날짜와 무관하게 동작

## 기술 세부

- 헤더는 `src/routes/index.tsx` 내부 인라인 (별도 컴포넌트 분리는 추후)
- 날짜 포맷 `M/D 요일` — 괄호 없이 공백 구분 (예: `11/15 화`)
- `Calendar` 사용 시 `pointer-events-auto` 포함
- `/add` search 스키마:
  ```ts
  z.object({ date: fallback(z.string(), todayKST()).default(todayKST()) })
  ```

## 변경 파일
- `src/routes/index.tsx` — 헤더 날짜 셀렉터, `selectedDate` state, 로드/네비/카피 분기
- `src/components/QuickAddTray.tsx` — `loggedDate` prop 추가
- `src/routes/add.tsx` — search param `date` 수용 및 저장 시 사용

## 범위 밖 (이번에 안 함)
- 기록탭에서 홈으로 날짜 점프 동선
- 날짜별 목표(user_goal) 동적 반영 — 현재 목표 그대로 사용
