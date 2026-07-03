# 홈 버블 두 모드 (칼로리 ↔ 탄단지) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 버블 그릇에 "음식=버블 1개(칼로리 모드, 기본)" ↔ "탄·단·지 분리(기존)" 두 뷰를 토글로 제공한다.

**Architecture:** 순수 매핑 로직(`logsToBubbles`)을 라우트 파일에서 테스트 가능한 lib 모듈로 추출하고 모드 분기를 추가한다. 기록 탭의 팔레트를 공용 모듈로 빼서 홈·기록이 같은 색을 공유한다. `BubbleField`는 엔트리가 실어 보낸 색·크기를 우선 사용한다. 모드 선택은 localStorage에 저장한다.

**Tech Stack:** React, TanStack Start/Router, TypeScript, Vitest(jsdom), d3-force, framer-motion.

**Spec:** `docs/superpowers/specs/2026-07-03-bubble-modes-design.md`

---

## File Structure

- **Create** `src/lib/kcalPalette.ts` — `KCAL_PALETTE`, `hash01`, `kcalPaletteEntry`, `kcalBubbleColor`, `kcalBubbleText` (history.tsx에서 추출).
- **Create** `src/lib/bubbleMapping.ts` — `logsToBubbles(logs, mode)` 순수 함수 (index.tsx에서 추출 + 칼로리 모드 분기).
- **Create** `src/lib/bubbleMode.ts` — localStorage 저장/로드.
- **Modify** `src/lib/foods.ts` — `BubbleEntry`에 `color?`/`textColor?`/`sizeKcal?` 추가, `BubbleMode` 타입 추가.
- **Modify** `src/components/BubbleField.tsx` — 엔트리 색·크기 우선 사용.
- **Modify** `src/routes/index.tsx` — 로컬 `logsToBubbles` 제거·import, 모드 state·토글 UI.
- **Modify** `src/routes/history.tsx` — 팔레트/hash01을 새 모듈에서 import.
- **Create** tests: `tests/kcalPalette.test.ts`, `tests/bubbleMapping.test.ts`, `tests/bubbleMode.test.ts`.

**Naming (전체 태스크 공통 확정):** 저장소 키 `"tandanji_bubble_mode"`, 값 `"kcal" | "macro"`. `BubbleEntry` 신규 필드 `color`/`textColor`/`sizeKcal`. 노드 신규 필드 `kcal`/`color`/`textColor`.

---

### Task 1: 팔레트를 공용 모듈로 추출

**Files:**
- Create: `src/lib/kcalPalette.ts`
- Test: `tests/kcalPalette.test.ts`
- Modify: `src/routes/history.tsx` (로컬 정의 제거·import)

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/kcalPalette.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  KCAL_PALETTE,
  hash01,
  kcalPaletteEntry,
  kcalBubbleColor,
  kcalBubbleText,
} from "@/lib/kcalPalette";

describe("kcalPalette", () => {
  it("팔레트는 10색이고 각 항목에 color/text가 있다", () => {
    expect(KCAL_PALETTE).toHaveLength(10);
    for (const e of KCAL_PALETTE) {
      expect(typeof e.color).toBe("string");
      expect(typeof e.text).toBe("string");
    }
  });

  it("같은 이름은 항상 같은 색(결정적)", () => {
    expect(kcalBubbleColor("사과")).toBe(kcalBubbleColor("사과"));
    expect(kcalBubbleText("사과")).toBe(kcalBubbleText("사과"));
  });

  it("반환 색은 팔레트 안의 값이다", () => {
    const entry = kcalPaletteEntry("닭가슴살");
    expect(KCAL_PALETTE).toContainEqual(entry);
  });

  it("hash01은 [0,1) 범위의 결정적 값", () => {
    const a = hash01("밥", 1);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(hash01("밥", 1)).toBe(a);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd calorie-bubbles && npx vitest run tests/kcalPalette.test.ts`
Expected: FAIL — `Cannot find module '@/lib/kcalPalette'`

- [ ] **Step 3: 모듈 구현**

Create `src/lib/kcalPalette.ts`:

```ts
// 칼로리 모드 버블 팔레트 — 매크로 RGB와 구분되는 주얼톤 10색.
// 홈(칼로리 모드)·기록 탭이 공유한다. 같은 음식 이름은 항상 같은 색.
export const KCAL_PALETTE: { color: string; text: string }[] = [
  { color: "#5EC4B6", text: "#fff" }, // mint
  { color: "#9B8CE0", text: "#fff" }, // lavender
  { color: "#F2A57C", text: "#3F2A00" }, // peach
  { color: "#4FB3C9", text: "#fff" }, // teal
  { color: "#E8B86E", text: "#3F2A00" }, // apricot
  { color: "#C29BD8", text: "#fff" }, // light purple
  { color: "#A8B86C", text: "#3F2A00" }, // olive
  { color: "#E58CA8", text: "#fff" }, // rose
  { color: "#7B95B5", text: "#fff" }, // slate blue
  { color: "#8FB08A", text: "#1f2937" }, // sage
];

// 결정적 소형 해시 → [0,1)
export function hash01(str: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

// 같은 이름은 매달·어디서나 같은 색을 고른다.
export function kcalPaletteEntry(name: string): { color: string; text: string } {
  const idx = Math.floor(hash01(name, 1) * KCAL_PALETTE.length);
  return KCAL_PALETTE[idx] ?? KCAL_PALETTE[0];
}

export function kcalBubbleColor(name: string): string {
  return kcalPaletteEntry(name).color;
}

export function kcalBubbleText(name: string): string {
  return kcalPaletteEntry(name).text;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd calorie-bubbles && npx vitest run tests/kcalPalette.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: history.tsx가 새 모듈을 쓰도록 변경**

`src/routes/history.tsx`에서 로컬 정의 4종을 삭제한다:
- `hash01` 함수 (현재 68–76행)
- `KCAL_PALETTE` 상수 (현재 84–97행)
- `kcalPaletteEntry` / `kcalBubbleColor` / `kcalBubbleText` (현재 99–108행 부근)

그리고 파일 상단 import 블록에 추가:

```ts
import {
  KCAL_PALETTE,
  hash01,
  kcalPaletteEntry,
  kcalBubbleColor,
  kcalBubbleText,
} from "@/lib/kcalPalette";
```

주의: history.tsx는 `hash01`을 팔레트 외에 다른 곳(선호 슬롯 계산, 현재 300행 부근 `hash01(name, 1)`)에서도 쓴다 — import한 `hash01`로 그대로 동작한다. `dateKeyToIso` 등 나머지 로컬 함수는 유지한다. 삭제 후 아직 참조되면 import가 커버하므로 이름을 바꾸지 말 것.

- [ ] **Step 6: 타입체크·전체 테스트로 회귀 확인**

Run: `cd calorie-bubbles && npx tsc --noEmit && npx vitest run`
Expected: tsc 에러 0, 모든 테스트 PASS (기존 + 신규 kcalPalette)

- [ ] **Step 7: 커밋**

```bash
cd calorie-bubbles
git add src/lib/kcalPalette.ts tests/kcalPalette.test.ts src/routes/history.tsx
git commit -m "refactor: 칼로리 팔레트를 공용 kcalPalette 모듈로 추출"
```

---

### Task 2: BubbleEntry 타입 확장 + BubbleMode 타입

**Files:**
- Modify: `src/lib/foods.ts:76-85`

- [ ] **Step 1: 타입 확장**

`src/lib/foods.ts`의 `BubbleEntry` 인터페이스를 아래로 교체한다(기존 필드 유지 + 3개 추가):

```ts
export interface BubbleEntry {
  id: string;
  foodLogId: string;
  macro: Macro;
  grams: number;
  foodName: string;
  addedAt: number;
  meal_slot?: MealSlot;
  food_id?: string;
  /** 지정 시 버블 배경색으로 사용(칼로리 모드). 없으면 매크로 색. */
  color?: string;
  /** 지정 시 라벨 텍스트 색으로 사용(칼로리 모드). */
  textColor?: string;
  /** 지정 시 반지름 계산에 이 총칼로리 값을 사용(칼로리 모드). */
  sizeKcal?: number;
}
```

그리고 `Macro` 타입 정의 아래(현재 1행 부근)에 모드 타입을 추가한다:

```ts
export type BubbleMode = "kcal" | "macro";
```

- [ ] **Step 2: 타입체크**

Run: `cd calorie-bubbles && npx tsc --noEmit`
Expected: 에러 0 (선택 필드 추가라 기존 코드 영향 없음)

- [ ] **Step 3: 커밋**

```bash
cd calorie-bubbles
git add src/lib/foods.ts
git commit -m "feat: BubbleEntry에 color/textColor/sizeKcal, BubbleMode 타입 추가"
```

---

### Task 3: 순수 매핑 함수 `logsToBubbles(logs, mode)` 추출·분기

**Files:**
- Create: `src/lib/bubbleMapping.ts`
- Test: `tests/bubbleMapping.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/bubbleMapping.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { logsToBubbles } from "@/lib/bubbleMapping";
import { kcalBubbleColor } from "@/lib/kcalPalette";
import type { FoodLogRow } from "@/lib/repository/types";

// 최소 FoodLogRow 픽스처 (테스트에 필요한 필드만)
function log(partial: Partial<FoodLogRow>): FoodLogRow {
  return {
    id: "log1",
    food_id: "f1",
    carb_g: 0,
    protein_g: 0,
    fat_g: 0,
    meal_slot: "lunch",
    created_at: "2026-07-03T00:00:00.000Z",
    food: { name: "테스트" },
    ...(partial as FoodLogRow),
  } as FoodLogRow;
}

describe("logsToBubbles — macro 모드(기존 동작)", () => {
  it("탄단지 있는 음식 → 매크로별 엔트리, 같은 foodLogId", () => {
    const entries = logsToBubbles(
      [log({ id: "L", carb_g: 68, protein_g: 5, fat_g: 0.5, food: { name: "밥" } })],
      "macro",
    );
    expect(entries).toHaveLength(3);
    expect(new Set(entries.map((e) => e.foodLogId))).toEqual(new Set(["L"]));
    expect(entries.every((e) => e.color === undefined)).toBe(true);
  });

  it("0칼로리 음식 → placeholder 1개(grams 0, 색 없음)", () => {
    const entries = logsToBubbles([log({ id: "W", food: { name: "물" } })], "macro");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.grams).toBe(0);
    expect(entries[0]?.foodLogId).toBe("W");
    expect(entries[0]?.color).toBeUndefined();
  });
});

describe("logsToBubbles — kcal 모드", () => {
  it("음식 1개 → 엔트리 1개, sizeKcal=총칼로리, 색은 팔레트", () => {
    const entries = logsToBubbles(
      [log({ id: "R", carb_g: 68, protein_g: 5, fat_g: 0.5, food: { name: "밥" } })],
      "kcal",
    );
    expect(entries).toHaveLength(1);
    // 68*4 + 5*4 + 0.5*9 = 296.5
    expect(entries[0]?.sizeKcal).toBeCloseTo(296.5, 5);
    expect(entries[0]?.color).toBe(kcalBubbleColor("밥"));
    expect(entries[0]?.textColor).toBeDefined();
    expect(entries[0]?.foodLogId).toBe("R");
  });

  it("같은 음식 이름 두 로그 → 같은 색", () => {
    const entries = logsToBubbles(
      [
        log({ id: "A", carb_g: 10, food: { name: "사과" } }),
        log({ id: "B", carb_g: 20, food: { name: "사과" } }),
      ],
      "kcal",
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]?.color).toBe(entries[1]?.color);
  });

  it("0칼로리 음식 → placeholder 1개(grams 0, 색·sizeKcal 없음)", () => {
    const entries = logsToBubbles([log({ id: "W", food: { name: "물" } })], "kcal");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.grams).toBe(0);
    expect(entries[0]?.sizeKcal).toBeUndefined();
    expect(entries[0]?.color).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd calorie-bubbles && npx vitest run tests/bubbleMapping.test.ts`
Expected: FAIL — `Cannot find module '@/lib/bubbleMapping'`

- [ ] **Step 3: 매핑 모듈 구현**

Create `src/lib/bubbleMapping.ts`:

```ts
import type { FoodLogRow } from "@/lib/repository/types";
import {
  displayName,
  MACRO_KCAL,
  type BubbleEntry,
  type BubbleMode,
  type Macro,
} from "@/lib/foods";
import { kcalBubbleColor, kcalBubbleText } from "@/lib/kcalPalette";

/**
 * FoodLogRow[] → BubbleEntry[].
 *
 *  - "macro": 음식 하나를 탄·단·지 최대 3버블로 분리(기존 동작). 매크로가 모두 0이면
 *    grams 0 placeholder 1개(그릇 미표시 + 슬롯 목록 표시용).
 *  - "kcal": 음식 하나를 버블 1개로. 크기는 총칼로리(sizeKcal), 색은 이름 기반 팔레트.
 *    총칼로리 0이면 macro 모드와 동일한 placeholder.
 *
 *  placeholder는 두 모드 동일: id `${log.id}-0`, macro "carbs", grams 0, 색·sizeKcal 없음.
 *  BubbleField가 (sizeKcal ?? grams) <= 0 을 걸러내므로 그릇에는 안 뜨고,
 *  MealLogList는 이 엔트리로 슬롯 항목을 만든다.
 */
export function logsToBubbles(logs: FoodLogRow[], mode: BubbleMode): BubbleEntry[] {
  const entries: BubbleEntry[] = [];
  for (const log of logs) {
    const foodName = displayName(log.food?.name ?? "");
    const addedAt = new Date(log.created_at).getTime();
    const slot = log.meal_slot;

    if (mode === "kcal") {
      const totalKcal =
        log.carb_g * MACRO_KCAL.carbs +
        log.protein_g * MACRO_KCAL.protein +
        log.fat_g * MACRO_KCAL.fat;
      if (totalKcal > 0) {
        entries.push({
          id: `${log.id}-0`,
          foodLogId: log.id,
          macro: "carbs", // 타입상 필요 — 색·크기는 아래 필드가 우선
          grams: Math.round((log.carb_g + log.protein_g + log.fat_g) * 10) / 10,
          foodName,
          addedAt,
          meal_slot: slot,
          food_id: log.food_id,
          color: kcalBubbleColor(foodName),
          textColor: kcalBubbleText(foodName),
          sizeKcal: totalKcal,
        });
      } else {
        entries.push(placeholder(log, foodName, addedAt, slot));
      }
      continue;
    }

    // mode === "macro"
    const macros: [Macro, number][] = [
      ["carbs", log.carb_g],
      ["protein", log.protein_g],
      ["fat", log.fat_g],
    ];
    let pushed = false;
    macros.forEach(([macro, grams], i) => {
      if (grams > 0) {
        entries.push({
          id: `${log.id}-${i}`,
          foodLogId: log.id,
          macro,
          grams: Math.round(grams * 10) / 10,
          foodName,
          addedAt,
          meal_slot: slot,
          food_id: log.food_id,
        });
        pushed = true;
      }
    });
    if (!pushed) entries.push(placeholder(log, foodName, addedAt, slot));
  }
  return entries;
}

function placeholder(
  log: FoodLogRow,
  foodName: string,
  addedAt: number,
  slot: FoodLogRow["meal_slot"],
): BubbleEntry {
  return {
    id: `${log.id}-0`,
    foodLogId: log.id,
    macro: "carbs",
    grams: 0,
    foodName,
    addedAt,
    meal_slot: slot,
    food_id: log.food_id,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd calorie-bubbles && npx vitest run tests/bubbleMapping.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
cd calorie-bubbles
git add src/lib/bubbleMapping.ts tests/bubbleMapping.test.ts
git commit -m "feat: logsToBubbles 순수 매핑 함수 추출 + 칼로리 모드 분기"
```

---

### Task 4: 모드 저장/로드 모듈

**Files:**
- Create: `src/lib/bubbleMode.ts`
- Test: `tests/bubbleMode.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/bubbleMode.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getStoredBubbleMode, setStoredBubbleMode } from "@/lib/bubbleMode";

describe("bubbleMode 저장/로드", () => {
  beforeEach(() => localStorage.clear());

  it("저장값 없으면 기본 kcal", () => {
    expect(getStoredBubbleMode()).toBe("kcal");
  });

  it("저장 후 로드하면 그 값", () => {
    setStoredBubbleMode("macro");
    expect(getStoredBubbleMode()).toBe("macro");
  });

  it("잘못된 값은 kcal로 폴백", () => {
    localStorage.setItem("tandanji_bubble_mode", "weird");
    expect(getStoredBubbleMode()).toBe("kcal");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd calorie-bubbles && npx vitest run tests/bubbleMode.test.ts`
Expected: FAIL — `Cannot find module '@/lib/bubbleMode'`

- [ ] **Step 3: 모듈 구현**

Create `src/lib/bubbleMode.ts`:

```ts
import type { BubbleMode } from "./foods";

const KEY = "tandanji_bubble_mode";

export function getStoredBubbleMode(): BubbleMode {
  if (typeof localStorage === "undefined") return "kcal";
  return localStorage.getItem(KEY) === "macro" ? "macro" : "kcal";
}

export function setStoredBubbleMode(mode: BubbleMode): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, mode);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd calorie-bubbles && npx vitest run tests/bubbleMode.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
cd calorie-bubbles
git add src/lib/bubbleMode.ts tests/bubbleMode.test.ts
git commit -m "feat: 버블 모드 localStorage 저장/로드"
```

---

### Task 5: BubbleField가 엔트리 색·크기를 우선 사용

**Files:**
- Modify: `src/components/BubbleField.tsx`

BubbleField는 d3-force + framer-motion이라 단위 테스트가 부적합하다 — tsc + 전체 테스트 회귀 + 수동 확인으로 검증한다.

- [ ] **Step 1: Node 타입 확장**

`src/components/BubbleField.tsx`의 `Node` 인터페이스(현재 24–30행)를 교체:

```ts
interface Node extends SimulationNodeDatum {
  id: string;
  r: number; // base radius (visual + base collision)
  macro: BubbleEntry["macro"];
  grams: number;
  kcal: number; // 반지름 산정에 쓴 칼로리 값 (변경 감지용)
  color?: string;
  textColor?: string;
  foodName: string;
}
```

- [ ] **Step 2: 0칼로리 필터를 kcal 기준으로**

동기화 effect에서 `visible` 계산(현재 grams 기준)을 교체:

```ts
    // 그릇엔 (sizeKcal ?? grams) > 0 만 렌더. kcal 모드는 sizeKcal, macro 모드는 grams 폴백.
    // 0칼로리 placeholder는 걸러져 슬롯 목록에만 남는다.
    const visible = bubbles.filter((b) => (b.sizeKcal ?? b.grams) > 0);
```

- [ ] **Step 3: 노드 생성/갱신에서 색·크기 반영**

`for (const b of visible) { ... }` 루프(현재 127–151행)를 아래로 교체:

```ts
    for (const b of visible) {
      const kcal = b.sizeKcal ?? b.grams * MACRO_KCAL[b.macro];
      const existing = map.get(b.id);
      if (!existing) {
        const r = radiusForKcal(kcal, bowlArea, goalKcal, maxR);
        map.set(b.id, {
          id: b.id,
          r,
          macro: b.macro,
          grams: b.grams,
          kcal,
          color: b.color,
          textColor: b.textColor,
          foodName: b.foodName,
          x: cx + (Math.random() - 0.5) * 20,
          y: Math.max(r + 4, 10 + Math.random() * 20),
          vx: 0,
          vy: 0,
        });
        changed = true;
      } else if (existing.kcal !== kcal) {
        existing.kcal = kcal;
        existing.grams = b.grams;
        existing.r = radiusForKcal(kcal, bowlArea, goalKcal, maxR);
        if (existing.foodName !== b.foodName) existing.foodName = b.foodName;
        if (existing.color !== b.color) existing.color = b.color;
        if (existing.textColor !== b.textColor) existing.textColor = b.textColor;
        changed = true;
      }
    }
```

- [ ] **Step 4: 렌더에서 색·텍스트색 폴백 적용**

렌더 블록에서 색 계산(현재 171행)을 교체:

```ts
          const color = n.color ?? MACRO_COLORS[n.macro];
```

그리고 라벨 텍스트 색(현재 217행 부근)을 교체:

```ts
                      color: n.textColor ?? (n.macro === "carbs" ? "#333" : "#fff"),
```

- [ ] **Step 5: 타입체크·전체 테스트로 회귀 확인**

Run: `cd calorie-bubbles && npx tsc --noEmit && npx vitest run`
Expected: tsc 에러 0, 모든 테스트 PASS

- [ ] **Step 6: 커밋**

```bash
cd calorie-bubbles
git add src/components/BubbleField.tsx
git commit -m "feat: BubbleField가 엔트리 color/textColor/sizeKcal 우선 사용"
```

---

### Task 6: index.tsx 배선 — 로컬 함수 제거, 모드 state, 토글 UI

**Files:**
- Modify: `src/routes/index.tsx`

- [ ] **Step 1: 로컬 `logsToBubbles` 제거 + import 교체**

`src/routes/index.tsx`에서 로컬 `logsToBubbles` 함수 정의(현재 77–125행 부근, JSDoc 포함) 전체를 삭제한다. 파일 상단 import에 추가:

```ts
import { logsToBubbles } from "@/lib/bubbleMapping";
import { getStoredBubbleMode, setStoredBubbleMode } from "@/lib/bubbleMode";
import type { BubbleMode } from "@/lib/foods";
```

- [ ] **Step 2: 모드 state 추가 (하이드레이션 안전)**

`function Index()` 본문 상단, 다른 useState 근처에 추가:

```ts
  // SSR 하이드레이션 불일치 방지: 서버·첫 클라 렌더는 기본 "kcal",
  // mount 후 localStorage에서 실제 저장값 로드.
  const [bubbleMode, setBubbleMode] = useState<BubbleMode>("kcal");
  useEffect(() => {
    setBubbleMode(getStoredBubbleMode());
  }, []);

  function changeBubbleMode(m: BubbleMode) {
    setBubbleMode(m);
    setStoredBubbleMode(m);
  }
```

- [ ] **Step 3: entries useMemo에 모드 반영**

기존 `const entries = useMemo(() => logsToBubbles(logs), [logs]);` 를 교체:

```ts
  const entries = useMemo(() => logsToBubbles(logs, bubbleMode), [logs, bubbleMode]);
```

- [ ] **Step 4: 토글 UI 추가 (그릇 바로 아래 중앙)**

그릇 `<section>` 안, stage 경고 문구 `<AnimatePresence mode="wait"> ... </AnimatePresence>` 블록 **바로 다음 줄**(그 `</section>` 직전)에 세그먼트 토글을 삽입:

```tsx
          <div className="mt-3 flex justify-center">
            <div className="inline-flex rounded-full bg-neutral-100 p-0.5">
              {(["kcal", "macro"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => changeBubbleMode(m)}
                  className={`px-3 py-1 text-[11px] font-semibold rounded-full transition-colors ${
                    bubbleMode === m
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-500 active:text-neutral-800"
                  }`}
                >
                  {m === "kcal" ? "칼로리" : "탄단지"}
                </button>
              ))}
            </div>
          </div>
```

- [ ] **Step 5: 미사용 import 정리 + 타입체크**

로컬 `logsToBubbles` 제거로 `displayName`·`Macro` 등이 index.tsx에서 더 이상 안 쓰이면 해당 import를 삭제한다(`MACRO_COLORS`/`MACRO_KCAL`/`MACRO_LABELS`·`BubbleEntry` 등 다른 곳에서 쓰는 것은 유지). 아래로 확인:

Run: `cd calorie-bubbles && npx tsc --noEmit`
Expected: 에러 0. (미사용 지역 심볼로 에러가 나면 해당 import만 제거 후 재실행)

- [ ] **Step 6: 전체 테스트 회귀**

Run: `cd calorie-bubbles && npx vitest run`
Expected: 모든 테스트 PASS

- [ ] **Step 7: 수동 확인**

Run: `cd calorie-bubbles && npm run dev` (또는 프로젝트의 로컬 실행 스킬)
확인 항목:
- 홈 기본 = 칼로리 모드(음식당 버블 1개, 팔레트 색), 크기=총칼로리.
- 토글 "탄단지" → 탄·단·지 분리 버블(매크로 색). "칼로리" → 복귀.
- 새로고침 후 마지막 모드 유지.
- 0칼로리 음식(예: 물) → 그릇엔 안 뜨고 슬롯 목록엔 표시.
- 상단 진척바·요약 수치·과식 stage는 모드 전환과 무관하게 동일.

- [ ] **Step 8: 커밋**

```bash
cd calorie-bubbles
git add src/routes/index.tsx
git commit -m "feat: 홈 버블 칼로리↔탄단지 토글 + 모드 상태 배선"
```

---

## Self-Review (작성자 점검 완료)

**Spec coverage:**
- 두 모드 동작 → Task 3(매핑) + Task 5(렌더). ✅
- 토글 위치(그릇 아래 중앙) → Task 6 Step 4. ✅
- 기본 kcal + 마지막 선택 기억 → Task 4 + Task 6 Step 2. ✅
- 팔레트 재사용·색 일관성 → Task 1. ✅
- 0칼로리 규칙 유지 → Task 3(placeholder) + Task 5(필터). ✅
- 리팩터링(공용 모듈) → Task 1(팔레트), Task 3(매핑). ✅
- stage/진척바/요약 모드 무관 → 코드 미변경(총칼로리·매크로 합계 기준), Task 6 Step 7에서 수동 확인. ✅

**Placeholder scan:** 모든 코드 스텝에 실제 코드·명령·기대결과 포함. TBD/TODO 없음. ✅

**Type consistency:** `BubbleEntry.color/textColor/sizeKcal`(Task 2) ↔ 매핑 생성(Task 3) ↔ Node·렌더(Task 5) 일치. `BubbleMode="kcal"|"macro"`(Task 2) ↔ 저장(Task 4) ↔ state(Task 6) 일치. 저장 키 `"tandanji_bubble_mode"` Task 4 코드·테스트 동일. placeholder id `${log.id}-0` 일관. ✅
