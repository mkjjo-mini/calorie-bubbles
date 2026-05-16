import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MealLogList } from "@/components/MealLogList";
import type { BubbleEntry } from "@/lib/foods";

// Stub sonner to avoid actual toast rendering during MealLogList mount.
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, {
    dismiss: () => {},
    success: () => {},
    error: () => {},
  }),
}));

function entry(over: Partial<BubbleEntry> = {}): BubbleEntry {
  return {
    id: "id-x",
    foodLogId: "log-x",
    macro: "carbs",
    grams: 10,
    foodName: "음식",
    addedAt: 1_700_000_000_000,
    meal_slot: "snack",
    ...over,
  };
}

describe("MealLogList — slot grouping & empty-slot hiding", () => {
  const noop = () => {};

  it("with no entries: still renders all 4 slot headers but each shows '비어 있음' (PRD asks for full hide; code keeps headers — see QA.md §6)", () => {
    render(
      <MealLogList
        entries={[]}
        onChangeSlot={noop}
        onDelete={noop}
        onReplaceQty={noop}
      />,
    );
    // Code path renders all 4 slot headers always
    expect(screen.getByText("아침")).toBeInTheDocument();
    expect(screen.getByText("점심")).toBeInTheDocument();
    expect(screen.getByText("저녁")).toBeInTheDocument();
    expect(screen.getByText("간식")).toBeInTheDocument();
    // All slots show empty placeholder
    expect(screen.getAllByText("비어 있음")).toHaveLength(4);
  });

  it("populated slots render food rows; empty slots show '비어 있음' placeholder", () => {
    const entries: BubbleEntry[] = [
      // breakfast — rice triple
      entry({
        id: "b-c",
        foodLogId: "lb",
        macro: "carbs",
        grams: 68,
        foodName: "밥",
        meal_slot: "breakfast",
      }),
      entry({
        id: "b-p",
        foodLogId: "lb",
        macro: "protein",
        grams: 5,
        foodName: "밥",
        meal_slot: "breakfast",
      }),
      // lunch — chicken
      entry({
        id: "l-p",
        foodLogId: "ll",
        macro: "protein",
        grams: 31,
        foodName: "닭가슴살",
        meal_slot: "lunch",
      }),
    ];
    render(
      <MealLogList
        entries={entries}
        onChangeSlot={noop}
        onDelete={noop}
        onReplaceQty={noop}
      />,
    );
    // All headers present (4 always rendered)
    expect(screen.getByText("아침")).toBeInTheDocument();
    expect(screen.getByText("점심")).toBeInTheDocument();
    expect(screen.getByText("저녁")).toBeInTheDocument();
    expect(screen.getByText("간식")).toBeInTheDocument();
    // Food names rendered for populated slots
    expect(screen.getByText("밥")).toBeInTheDocument();
    expect(screen.getByText("닭가슴살")).toBeInTheDocument();
    // 2 empty slots → 2 '비어 있음' placeholders (저녁, 간식)
    expect(screen.getAllByText("비어 있음")).toHaveLength(2);
  });

  it("collapses BubbleEntry triple into a single row per foodLogId with summed kcal", () => {
    // 토스트: 탄 30, 단 6, 지 7 → 4·30 + 4·6 + 9·7 = 120 + 24 + 63 = 207 kcal (rounded)
    const entries: BubbleEntry[] = [
      entry({
        id: "1",
        foodLogId: "log-toast",
        macro: "carbs",
        grams: 30,
        foodName: "토스트",
        meal_slot: "breakfast",
      }),
      entry({
        id: "2",
        foodLogId: "log-toast",
        macro: "protein",
        grams: 6,
        foodName: "토스트",
        meal_slot: "breakfast",
      }),
      entry({
        id: "3",
        foodLogId: "log-toast",
        macro: "fat",
        grams: 7,
        foodName: "토스트",
        meal_slot: "breakfast",
      }),
    ];
    render(
      <MealLogList
        entries={entries}
        onChangeSlot={noop}
        onDelete={noop}
        onReplaceQty={noop}
      />,
    );
    // Exactly one "토스트" row
    expect(screen.getAllByText("토스트")).toHaveLength(1);
    // Macro line shows rounded grams
    expect(
      screen.getByText(/탄 30g · 단 6g · 지 7g/),
    ).toBeInTheDocument();
    // Slot kcal total appears next to header — find "207 kcal"
    expect(screen.getByText("207 kcal")).toBeInTheDocument();
  });

  it("entries missing meal_slot default to snack group", () => {
    const entries: BubbleEntry[] = [
      entry({
        id: "no-slot",
        foodLogId: "log-noslot",
        macro: "carbs",
        grams: 20,
        foodName: "익명",
        meal_slot: undefined,
      }),
    ];
    render(
      <MealLogList
        entries={entries}
        onChangeSlot={noop}
        onDelete={noop}
        onReplaceQty={noop}
      />,
    );
    expect(screen.getByText("간식")).toBeInTheDocument();
    expect(screen.getByText("익명")).toBeInTheDocument();
  });

  it("shows a more-actions (⋯) button per row", () => {
    const entries: BubbleEntry[] = [
      entry({
        id: "1",
        foodLogId: "log-1",
        macro: "carbs",
        grams: 10,
        foodName: "A",
        meal_slot: "lunch",
      }),
      entry({
        id: "2",
        foodLogId: "log-2",
        macro: "protein",
        grams: 5,
        foodName: "B",
        meal_slot: "lunch",
      }),
    ];
    render(
      <MealLogList
        entries={entries}
        onChangeSlot={noop}
        onDelete={noop}
        onReplaceQty={noop}
      />,
    );
    const moreButtons = screen.getAllByRole("button", { name: "더보기" });
    expect(moreButtons).toHaveLength(2);
  });

  it("kcal per slot header reflects ONLY that slot's items", () => {
    const entries: BubbleEntry[] = [
      // breakfast: 100 kcal carbs only → 4*25 = 100
      entry({
        id: "b",
        foodLogId: "lb",
        macro: "carbs",
        grams: 25,
        foodName: "B",
        meal_slot: "breakfast",
      }),
      // lunch: 200 kcal fat only → 9 * 22.22 ≈ 200; use grams=22 → 198 kcal
      entry({
        id: "l",
        foodLogId: "ll",
        macro: "fat",
        grams: 22,
        foodName: "L",
        meal_slot: "lunch",
      }),
    ];
    render(
      <MealLogList
        entries={entries}
        onChangeSlot={noop}
        onDelete={noop}
        onReplaceQty={noop}
      />,
    );
    // Headers and per-slot kcal independence
    const breakfast = screen.getByText("아침").closest("div")!;
    expect(within(breakfast).getByText("100 kcal")).toBeInTheDocument();
    const lunch = screen.getByText("점심").closest("div")!;
    expect(within(lunch).getByText("198 kcal")).toBeInTheDocument();
  });
});
