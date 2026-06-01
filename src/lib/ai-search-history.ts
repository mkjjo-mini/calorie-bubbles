const STORAGE_KEY = "ai_search_history_v1";
const MAX_ITEMS = 20;

export interface AiSearchHistoryItem {
  id: string;
  inputType: "photo" | "text";
  inputText: string | null; // 텍스트 입력값 (사진만이면 null)
  name: string;             // AI가 뽑은 음식명
  kcal: number;
  carb_g: number;
  protein_g: number;
  fat_g: number;
  serving_g: number;
  serving_amount: number;
  serving_unit: string;
  confidence: number;
  analyzedAt: string;       // ISO 8601
}

function load(): AiSearchHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AiSearchHistoryItem[]) : [];
  } catch {
    return [];
  }
}

function save(items: AiSearchHistoryItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage 용량 초과 등 — 조용히 무시
  }
}

export function pushAiSearchHistory(item: Omit<AiSearchHistoryItem, "id" | "analyzedAt">) {
  const items = load();
  const next: AiSearchHistoryItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    analyzedAt: new Date().toISOString(),
  };
  // 앞에 추가 + 최대 MAX_ITEMS 유지 (오래된 것 제거)
  const updated = [next, ...items].slice(0, MAX_ITEMS);
  save(updated);
}

export function getAiSearchHistory(): AiSearchHistoryItem[] {
  return load();
}
