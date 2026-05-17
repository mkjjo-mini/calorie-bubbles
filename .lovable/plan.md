# kcal 버블 — 솔리드 유지 + 굴절/하이라이트 업그레이드

## 방향
홈/매크로 버블과 같은 솔리드 재질감은 유지하되, kcal 모드 한정으로 "진짜 구슬/유리알" 같은 광학 디테일을 더해 자연스럽게 한 단계 위로 보이게 합니다. 형태와 그라데이션 골격은 그대로라 앱 안에서 떠 보이지 않습니다.

## 1. 베이스 (현재 매크로 공식 그대로)
```
background: radial-gradient(circle at 30% 30%, ${color}ee, ${color}aa 60%, ${color}66)
boxShadow:  inset -6px -8px 14px ${color}55, 0 4px 10px ${color}44
border:     1px solid ${color}
```

## 2. kcal 모드에서만 추가되는 광학 레이어

### a. 스펙큘러 하이라이트 (좌상단 작은 흰 점)
버블 위에 절대 위치한 작은 흰색 블롭 — `width/height ≈ 22% size`, `top 12%, left 18%`, `background: radial-gradient(circle, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.4) 40%, transparent 70%)`, `filter: blur(0.5px)`. 카메라 플래시 반사 같은 점.

### b. 보조 림 하이라이트 (우상단 얇은 호)
`box-shadow: inset 2px 2px 0 rgba(255,255,255,0.35)`를 한 단계 더 얹어 곡면 윗선이 살아남.

### c. 바닥 굴절/캐스틱
버블 하단 안쪽에 `inset 0 -10px 14px ${color}88` 추가 — 색이 아래에서 진해지면서 빛이 모인 느낌. 매크로의 `inset -6px -8px`와 합쳐져 입체감 강화.

### d. 미세한 외곽 림라이트
`box-shadow`에 `0 0 0 1px rgba(255,255,255,0.25)` 추가 — 테두리 바깥쪽에 머리카락 굵기의 흰선이 생겨 "유리알 가장자리" 효과.

### e. (선택) 미세 굴절 왜곡
글자 컨테이너에 `backdrop-filter: blur(0.3px)` — 글자가 아주 살짝 떠 보임. 성능 영향 미미.

## 3. 색은 큐레이션 팔레트 유지
직전 추가한 `kcalBubbleColor()` + 10색 팔레트 그대로. 같은 음식 = 같은 색 원칙 유지.

## 4