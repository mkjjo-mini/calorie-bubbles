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
