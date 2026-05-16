# 설계: 배통 채움 + 바닥 가라앉음

## 문제 진단

지금 구조의 근본 한계:
- 배통(bowl) 크기는 고정.
- 버블 반지름은 `radiusFor(grams)` — 음식 g수만 보고 계산. **kcal 목표(2000)나 배통 넓이와 무관**.
- 그래서 목표 100%에 도달해도 "버블 총 면적"이 배통 면적과 일치한다는 보장이 없음. 적게 차거나 너무 넘침.
- 그동안 시도한 `visualScale`(부풀리기), `pressureLine`(중력 위로), `anchorY` 위로 띄우기 등은 전부 **눈속임**이라 부작용(기존 원 커짐, 중간에 떠 있음)이 생김.

중력만으로는 절대 못 푼다 — 버블 총 면적 < 배통 면적이면 어떤 중력을 줘도 윗쪽에 빈 공간이 남는다.

## 핵심 설계 (2가지 필수 규칙 동시 만족)

### 1. 버블 반지름을 "kcal 기여도 × 배통 면적"으로 환산

```
bowlArea     = fieldWidth * fieldHeight * 0.78   // 둥근 배통 + 원형 패킹 손실 보정
targetArea   = bowlArea                          // 목표 100% 도달 = 배통 가득
bubbleArea_i = (kcal_i / DAILY_GOAL_KCAL) * targetArea
radius_i     = sqrt(bubbleArea_i / π)
```

효과:
- 누적 kcal == 목표 → 버블 면적 합 ≈ 배통 면적 → **자연스럽게 꽉 참**
- 누적 kcal < 목표 → 면적이 모자라므로 윗쪽이 빔 (바닥에 가라앉음)
- 누적 kcal > 목표 → 면적이 넘침 → `compression`(충돌 반지름 축소)으로 밀어 끼워넣음 → **여백 0**

버블 크기는 음식 추가 시 **딱 한 번** 결정되고, 다른 버블이 들어와도 절대 안 바뀜. ("기존 원 커지는" 문제 해결.)

최소/최대 가드만 둠: `clamp(14, r, fieldHeight*0.45)` — 너무 작거나 한 개가 배통보다 큰 경우 방지.

### 2. 중력은 항상 바닥으로 (단순화)

```
anchorY      = height - 4      // 항상 바닥
yStrength    = 0.18            // 강하게, 항상 동일
xStrength    = 0.05            // 가운데 정렬
collide r    = baseR * compression   // visualScale 제거
velocityDecay= 0.35            // 한 값 고정
```

- `visualScale`, `pressureLine`, `packedHeight`, `createPackingForce` 전부 제거.
- 중력은 채움 정도와 무관하게 일정 → 항상 바닥에 가라앉은 느낌.
- 위로 쌓이는 건 충돌(collide)이 자연스럽게 처리.

### 3. 초과 상태(>100%)의 "여백 0" 보정

위 1번으로 100% 시점에서 거의 채워지지만, 원 패킹 효율 편차로 약간의 빈 공간이 남을 수 있음. 그래서:

```
compression = stage === 4 ? 0.70    // 120%+ : 강하게 밀어 끼움
            : stage === 3 ? 0.85    // 100-120%
            : 1
```

`compression < 1`이면 충돌 반지름만 줄어 버블끼리 약간 겹치며 위쪽 여백을 메움. **버블 표시 크기는 그대로** — 사용자가 말한 "꽉 차서 낑겨넣은" 느낌만 생김.

## 변경 파일

### `src/lib/foods.ts` (또는 `BubbleEntry` 만드는 곳)
- 버블 생성 시 `grams`/`macro`로 kcal을 계산해 entry에 `kcal` 저장 (이미 있으면 그대로 사용).

### `src/components/BubbleField.tsx`
- props에서 `visualScale`, `fillness` **제거**, `bowlArea`(또는 `fieldWidth/Height` 그대로 두고 내부 계산)만 받음.
- `radiusFor(grams)` → `radiusForKcal(kcal, bowlArea, goalKcal)`로 교체.
- `anchorY`, `yStrength` 고정값. `pressureLine` / `createPackingForce` / `packedHeight` 모두 삭제.
- collide 반지름 = `(d.r + 2) * compression`.
- 표시 반지름 `r = n.r` (visualScale 곱 제거).

### `src/routes/index.tsx`
- `visualScale`, `fillness` 계산 및 prop 전달 제거.
- `compression`만 stage 기반으로 전달 (1 / 0.85 / 0.70).
- `BubbleField`에 `goalKcal={DAILY_GOAL_KCAL}` 전달 (반지름 계산용).

## 시각적 결과

| 진행도 | 버블 면적 합 | 모습 |
|---|---|---|
| 25% | 배통의 ~25% | 바닥에 한 줄 정도, 위는 빈 공간 (가라앉음) |
| 75% | 배통의 ~75% | 4분의 3 정도 차오름, 윗쪽만 살짝 빔 |
| 100% | 배통의 ~100% | 빈틈없이 가득 (가라앉은 채로 위까지) |
| 120% | 배통의 ~120% | compression 0.70로 압착, 여백 0, 빵빵 |

기존 버블 크기는 절대 변하지 않음 — 새 음식이 들어와도 그 음식 자체의 kcal 비례 크기로 추가될 뿐. 추가 시 일시적으로 면적 합 > 배통 면적이 되면 compression이 자동으로 정리.

## 안 하는 것

- 배통 크기 변경 (사용자: "배통 사이즈는 항상 같다")
- 기존 버블 크기 변경 (사용자: "기존 원 크기 커지면 안 됨")
- 버블을 중간에 띄우는 anchor/pressure 트릭 (사용자: "바닥에 가라앉아야 함")
