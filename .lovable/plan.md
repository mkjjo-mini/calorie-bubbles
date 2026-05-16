## 문제

홈 식사로그에서 "✏️ 수량 편집"을 누르면 직접 등록한 음식은 시트가 빈 화면으로 뜹니다(아무것도 안 보임).

## 원인

`src/components/MealLogList.tsx`의 `EditQuantitySheet`는 `findPresetByName(item.foodName)`로 **preset 목록(food-presets.json)에서만** 기준 영양값을 찾습니다. 직접 등록한 음식은 preset에 없으니 `preset === undefined`가 되고, 컴포넌트가 `if (!preset) return null`로 조기 종료합니다. 그래서 시트가 안 뜨고 편집이 불가능해 보입니다.

`BubbleEntry`에는 `foodName`만 저장되어 있고 source/id가 없으므로, **이름(case-insensitive)** 으로 customFoods도 함께 조회해야 합니다.

## 변경 계획

`src/components/MealLogList.tsx`만 수정합니다.

1. **기준 데이터 통합 조회**
   - `localStorage.customFoods`를 읽어 preset과 같은 형태(`{ name, kcal, carb, protein, fat, serving_g }`)로 정규화하는 헬퍼를 추가.
   - `findPresetByName`을 확장해 preset → custom 순으로 이름 매칭(대소문자 무시)을 시도하는 `findBaselineByName(name)`로 교체.

2. **EditQuantitySheet 수정**
   - `findBaselineByName(item.foodName)`로 baseline을 받아 preset/custom 구분 없이 동일하게 동작.
   - serving 모드 기본값/표시(`{baseline.serving_g}g 기준`, `1인분`)는 그대로 유지.
   - 헤더 표시 이름은 `item.foodName` 사용(custom은 그대로, preset은 displayName과 동일하므로 무방).

3. **Fallback (baseline이 정말 없는 경우)**
   - 직접 등록한 음식을 삭제한 뒤 같은 이름으로 추가했던 옛 로그 같은 엣지 케이스: baseline을 못 찾으면 `item.carbs/protein/fat`을 "현재값 = 1인분"으로 간주해 그램 모드로만 편집 가능하도록 처리(시트가 뜨지 않는 현재 동작보다 나음). 토스트나 별도 UI 변경 없음.

## 손대지 않는 것

- `/add` 페이지의 QuantitySheet, 직접 등록 폼, 즐겨찾기/별표 동작
- BubbleField, 홈 화면 레이아웃, FAB
- localStorage 스키마, customFoods.ts 헬퍼

## 확인 방법

- 직접 등록한 음식을 추가 → 홈 식사로그에서 "✏️ 수량 편집" 탭 → 시트가 뜨고 인분/그램 전환·수치 변경·"수정하기"로 칼로리/매크로가 비례 갱신.
- 기존 preset 음식 편집도 회귀 없이 동일하게 동작.
