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
