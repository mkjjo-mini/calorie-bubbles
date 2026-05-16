import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { inferMealSlot } from "@/lib/foods";

/**
 * inferMealSlot reads Asia/Seoul hour via Intl.DateTimeFormat. To keep
 * tests deterministic regardless of the host machine's local timezone,
 * we build timestamps from a Date constructed in KST by computing the
 * absolute UTC instant that maps to a given Seoul wall-clock time.
 *
 * KST = UTC+9 with no DST, so a wall-clock hour H in Seoul on 2026-05-16
 * corresponds to UTC instant `Date.UTC(2026, 4, 16, H - 9, M)`.
 */
function kstTs(hour: number, minute: number = 0): number {
  return Date.UTC(2026, 4, 16, hour - 9, minute);
}

describe("inferMealSlot — boundary mapping (KST)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Pin the wall clock so any Date.now() inside (none used here) is stable.
    vi.setSystemTime(new Date(kstTs(12, 0)));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Code rule (src/lib/foods.ts):
  //   hour >= 5  && hour <= 10  → breakfast
  //   hour >= 11 && hour <= 13  → lunch
  //   hour >= 17 && hour <= 20  → dinner
  //   otherwise                 → snack
  const cases: Array<[string, number, number, ReturnType<typeof inferMealSlot>]> = [
    ["00:00 → snack", 0, 0, "snack"],
    ["04:59 → snack (before breakfast cut)", 4, 59, "snack"],
    ["05:00 → breakfast (boundary in)", 5, 0, "breakfast"],
    ["10:59 → breakfast (boundary in)", 10, 59, "breakfast"],
    ["11:00 → lunch (boundary in)", 11, 0, "lunch"],
    ["13:59 → lunch (boundary in)", 13, 59, "lunch"],
    ["14:00 → snack (between lunch & dinner)", 14, 0, "snack"],
    ["16:59 → snack (before dinner cut)", 16, 59, "snack"],
    ["17:00 → dinner (boundary in)", 17, 0, "dinner"],
    ["20:59 → dinner (boundary in)", 20, 59, "dinner"],
    ["21:00 → snack (after dinner cut)", 21, 0, "snack"],
    ["23:59 → snack", 23, 59, "snack"],
  ];

  it.each(cases)("%s", (_label, h, m, expected) => {
    expect(inferMealSlot(kstTs(h, m))).toBe(expected);
  });
});
