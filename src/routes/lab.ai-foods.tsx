/**
 * /lab/ai-foods — AI 음식 추가 PoC 실험실.
 *
 * ⚠️ 실험용 — DB 저장 X. Gemini 응답만 표시.
 *
 * 사진 모드:
 *   - Gemini가 여러 음식을 candidates 배열로 반환 (각각 bbox 포함)
 *   - 원본 이미지 위에 bbox 점선 오버레이
 *   - 각 candidate별 cropped 썸네일 (Canvas) + 체크박스 다중 선택
 *   - 선택한 항목 영양 정보 합산도 표시
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Camera,
  Check,
  ExternalLink,
  Loader2,
  Sparkles,
  Type,
} from "lucide-react";

export const Route = createFileRoute("/lab/ai-foods")({
  component: AiFoodLab,
});

type Mode = "photo" | "text";

interface Candidate {
  is_food: boolean;
  name: string;
  serving_unit: string;
  serving_amount: number;
  serving_g: number;
  kcal: number;
  carb_g: number;
  protein_g: number;
  fat_g: number;
  confidence: number;
  rationale: string;
  needs_fallback?: boolean;
  /** [y0, x0, y1, x1] 0~1 normalized, top-left origin */
  bbox?: [number, number, number, number];
}

interface Ref {
  title?: string;
  url?: string;
}

interface FallbackInfo {
  triggered: boolean;
  reason?: "ai_uncertain";
  hit?: {
    name: string;
    serving_g: number;
    kcal: number;
    carb_g: number;
    protein_g: number;
    fat_g: number;
  } | null;
  query?: string;
  totalCount?: number;
  error?: string;
}

interface GuardrailInfo {
  injectionSuspected: boolean;
  rejectedCount: number;
}

interface AnalyzeResponse {
  candidates: Candidate[];
  refs?: Ref[];
  fallback?: FallbackInfo;
  guardrails?: GuardrailInfo;
  raw?: { text: string };
}

const MODES: { id: Mode; label: string; icon: typeof Camera; hint: string }[] = [
  {
    id: "photo",
    label: "사진",
    icon: Camera,
    hint: "여러 음식이 함께 있어도 OK — 각각 영역 잡아서 따로 분석해요.",
  },
  {
    id: "text",
    label: "텍스트",
    icon: Type,
    hint: '자연어로 입력. 일반 음식·식당 메뉴 모두 OK.\n예: "엄마표 김치찌개", "금돼지식당 껍데기 2인분"',
  },
];

function AiFoodLab() {
  const [mode, setMode] = useState<Mode>("photo");
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ dataUrl: string; mimeType: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showRaw, setShowRaw] = useState(false);

  function reset() {
    setText("");
    setImage(null);
    setErr(null);
    setResult(null);
    setSelected(new Set());
    setShowRaw(false);
  }

  function onModeChange(m: Mode) {
    setMode(m);
    reset();
  }

  async function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErr("사진이 너무 큽니다 (5MB 한도)");
      return;
    }
    setErr(null);
    const dataUrl = await fileToDataUrl(file);
    setImage({ dataUrl, mimeType: file.type });
    setResult(null);
    setSelected(new Set());
  }

  async function analyze() {
    if (loading) return;
    setErr(null);
    setResult(null);
    setSelected(new Set());

    let body: unknown;
    if (mode === "photo") {
      if (!image) {
        setErr("사진을 먼저 업로드하세요");
        return;
      }
      const base64 = image.dataUrl.replace(/^data:[^;]+;base64,/, "");
      body = {
        mode,
        image: { mimeType: image.mimeType, data: base64 },
        ...(text.trim() ? { hint: text.trim() } : {}),
      };
    } else {
      if (!text.trim()) {
        setErr("설명을 입력하세요");
        return;
      }
      body = { mode, text: text.trim() };
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ai-food/analyze", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as AnalyzeResponse & {
        code?: string;
        message?: string;
      };
      if (!res.ok) {
        const msg = json.message ?? "분석 실패";
        setErr(json.code === "OVERLOADED" ? msg : `${json.code ?? res.status}: ${msg}`);
        return;
      }
      setResult(json);
      // 기본: 음식인 항목 모두 체크
      const initSel = new Set<number>();
      json.candidates.forEach((c, i) => {
        if (c.is_food) initSel.add(i);
      });
      setSelected(initSel);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelected(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  const candidates = result?.candidates ?? [];
  const multi = candidates.length > 1;

  // 선택 항목 합산
  const totals = useMemo(() => {
    let kcal = 0, carb = 0, protein = 0, fat = 0;
    selected.forEach((i) => {
      const c = candidates[i];
      if (!c) return;
      kcal += c.kcal;
      carb += c.carb_g;
      protein += c.protein_g;
      fat += c.fat_g;
    });
    return {
      kcal: Math.round(kcal),
      carb: Math.round(carb * 10) / 10,
      protein: Math.round(protein * 10) / 10,
      fat: Math.round(fat * 10) / 10,
    };
  }, [candidates, selected]);

  return (
    <div className="w-full bg-white flex justify-center pb-24">
      <main className="w-full max-w-[420px] flex flex-col">
        <header className="sticky top-0 z-10 border-b border-neutral-100 bg-white px-4 py-3 flex items-center gap-2">
          <Link
            to="/settings"
            className="p-1 -ml-1 text-neutral-500 active:text-neutral-900"
            aria-label="뒤로"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-base font-semibold text-neutral-900 flex items-center gap-1">
            <Sparkles className="h-4 w-4 text-amber-500" /> AI 실험실
          </h1>
        </header>

        <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-900">
          🧪 <b>실험 중 — 정식 기능 아님.</b> 분석 결과는 화면에만 표시되며 DB에 저장되지 않아요.
        </div>

        {/* 모드 토글 */}
        <div className="px-4 pt-4">
          <div className="grid grid-cols-2 gap-1 p-1 bg-neutral-100 rounded-xl">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => onModeChange(m.id)}
                  className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    active ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 active:text-neutral-700"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {m.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-neutral-500 leading-relaxed whitespace-pre-line">
            {MODES.find((m) => m.id === mode)?.hint}
          </p>
        </div>

        {/* 입력 영역 */}
        <div className="px-4 pt-5 space-y-3">
          {mode === "photo" && (
            <>
              <label className="block">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onPickImage}
                  className="hidden"
                />
                <div className="rounded-2xl border-2 border-dashed border-neutral-200 px-4 py-10 text-center bg-neutral-50 active:bg-neutral-100">
                  {image ? (
                    <img
                      src={image.dataUrl}
                      alt="업로드된 음식"
                      className="mx-auto max-h-64 rounded-lg object-contain"
                    />
                  ) : (
                    <>
                      <Camera className="mx-auto h-7 w-7 text-neutral-400" />
                      <p className="mt-2 text-xs text-neutral-500">탭해서 카메라로 찍거나 앨범에서 선택</p>
                    </>
                  )}
                </div>
              </label>
              {image && (
                <button
                  onClick={() => {
                    setImage(null);
                    setResult(null);
                  }}
                  className="text-[11px] text-neutral-500 active:text-neutral-900 underline"
                >
                  사진 다시 선택
                </button>
              )}
              <label className="block">
                <span className="text-[11px] text-neutral-500">힌트 (선택)</span>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                  placeholder="예: 점심으로 먹은 김치찌개"
                />
              </label>
            </>
          )}

          {mode === "text" && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-neutral-200 px-3 py-3 text-sm outline-none focus:border-neutral-900 resize-none"
              placeholder="예: 엄마가 만든 김치찌개 / 금돼지식당 껍데기 2인분"
            />
          )}

          <button
            onClick={analyze}
            disabled={loading}
            className="w-full h-12 rounded-xl bg-neutral-900 text-white text-sm font-semibold disabled:opacity-40 active:bg-neutral-800 inline-flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "분석 중..." : "AI로 분석"}
          </button>

          {!loading && mode === "text" && !result && (
            <div className="pt-2 flex flex-wrap gap-1.5">
              <span className="text-[10px] text-neutral-400 self-center">예시:</span>
              {[
                "계란 후라이 2개",
                "엄마표 김치찌개",
                "스타벅스 아이스 아메리카노",
                "금돼지식당 껍데기 2인분",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => setText(s)}
                  className="text-[10.5px] px-2 py-1 rounded-full bg-neutral-100 text-neutral-700 active:bg-neutral-200"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {err && (
          <div className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
            {err}
          </div>
        )}

        {/* 결과 */}
        {result && (
          <div className="px-4 mt-6 space-y-3">
            {candidates.some((c) => c.is_food) ? (
              <p className="text-xs text-neutral-600">
                <b>{candidates.filter((c) => c.is_food).length}개</b>의 음식을 찾았어요.
                {multi && " 원하는 것만 체크하세요."}
              </p>
            ) : null}

            {/* 사진 + bbox 오버레이 */}
            {mode === "photo" && image && multi && (
              <ImageWithBboxes
                dataUrl={image.dataUrl}
                candidates={candidates}
                selected={selected}
                onToggle={toggleSelected}
              />
            )}

            {/* 후보 목록 */}
            <div className="space-y-2">
              {candidates.map((c, i) => (
                <CandidateRow
                  key={i}
                  candidate={c}
                  index={i}
                  isSelected={selected.has(i)}
                  onToggle={() => toggleSelected(i)}
                  imageDataUrl={mode === "photo" ? image?.dataUrl ?? null : null}
                  showCheckbox={multi}
                />
              ))}
            </div>

            {/* 선택 합산 */}
            {selected.size > 0 && (
              <div className="rounded-2xl bg-neutral-900 text-white px-4 py-3">
                <p className="text-[11px] text-neutral-400">선택한 {selected.size}개 합계</p>
                <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-base font-bold">{totals.kcal}</p>
                    <p className="text-[10px] text-neutral-400">kcal</p>
                  </div>
                  <div>
                    <p className="text-base font-bold">{totals.carb}</p>
                    <p className="text-[10px] text-neutral-400">탄 g</p>
                  </div>
                  <div>
                    <p className="text-base font-bold">{totals.protein}</p>
                    <p className="text-[10px] text-neutral-400">단 g</p>
                  </div>
                  <div>
                    <p className="text-base font-bold">{totals.fat}</p>
                    <p className="text-[10px] text-neutral-400">지 g</p>
                  </div>
                </div>
              </div>
            )}

            {result.fallback?.triggered && <FallbackBanner info={result.fallback} />}

            {/* 가드레일 상태 (실험실 디버깅용) */}
            {result.guardrails &&
              (result.guardrails.injectionSuspected ||
                result.guardrails.rejectedCount > 0) && (
                <div className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2.5 text-[11px] text-purple-900 space-y-1">
                  <p className="font-semibold">🛡️ 가드레일 작동</p>
                  {result.guardrails.injectionSuspected && (
                    <p>· prompt injection 의심 구문 감지·제거됨</p>
                  )}
                  {result.guardrails.rejectedCount > 0 && (
                    <p>· 비정상 영양값 후보 {result.guardrails.rejectedCount}개 거부됨</p>
                  )}
                </div>
              )}

            {result.refs && result.refs.length > 0 && (
              <div className="rounded-xl border border-neutral-100 bg-white px-3 py-3">
                <p className="text-[11px] font-semibold text-neutral-500 mb-2">
                  📚 참조 출처 ({result.refs.length})
                </p>
                <div className="space-y-1.5">
                  {result.refs.map((r, i) => (
                    <a
                      key={i}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[11px] text-blue-600 active:text-blue-800 truncate"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">{r.title ?? r.url}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setShowRaw((v) => !v)}
              className="w-full text-[11px] text-neutral-500 underline active:text-neutral-900 py-2"
            >
              {showRaw ? "raw JSON 숨기기" : "raw JSON 보기 (디버깅)"}
            </button>
            {showRaw && (
              <pre className="rounded-lg bg-neutral-900 text-neutral-100 text-[10px] p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-80 overflow-y-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/* ------------- ImageWithBboxes (SVG 오버레이) ------------- */

const BBOX_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#FFD93D",
  "#6C5CE7",
  "#FF9F1C",
  "#A0E7E5",
  "#FFB7B2",
  "#B5EAD7",
];

function ImageWithBboxes({
  dataUrl,
  candidates,
  selected,
  onToggle,
}: {
  dataUrl: string;
  candidates: Candidate[];
  selected: Set<number>;
  onToggle: (i: number) => void;
}) {
  return (
    <div className="relative rounded-xl overflow-hidden bg-neutral-100">
      <img src={dataUrl} alt="분석한 사진" className="w-full h-auto block" />
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        {candidates.map((c, i) => {
          const b = c.bbox;
          if (!b) return null;
          const [y0, x0, y1, x1] = b;
          const color = BBOX_COLORS[i % BBOX_COLORS.length];
          const isSel = selected.has(i);
          return (
            <g key={i} onClick={() => onToggle(i)} style={{ cursor: "pointer" }}>
              <rect
                x={x0}
                y={y0}
                width={Math.max(0, x1 - x0)}
                height={Math.max(0, y1 - y0)}
                fill={isSel ? `${color}40` : "transparent"}
                stroke={color}
                strokeWidth={0.008}
                strokeDasharray={isSel ? "" : "0.012 0.012"}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>
      {/* 번호 라벨 (절대 위치) */}
      <div className="absolute inset-0 pointer-events-none">
        {candidates.map((c, i) => {
          const b = c.bbox;
          if (!b) return null;
          const [y0, x0] = b;
          const color = BBOX_COLORS[i % BBOX_COLORS.length];
          return (
            <div
              key={i}
              className="absolute text-[10px] font-bold text-white px-1.5 py-0.5 rounded shadow"
              style={{
                left: `${x0 * 100}%`,
                top: `${y0 * 100}%`,
                backgroundColor: color,
                transform: "translate(2px, 2px)",
              }}
            >
              {i + 1}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------- CandidateRow (체크박스 + 정보 + 썸네일) ------------- */

function CandidateRow({
  candidate,
  index,
  isSelected,
  onToggle,
  imageDataUrl,
  showCheckbox,
}: {
  candidate: Candidate;
  index: number;
  isSelected: boolean;
  onToggle: () => void;
  imageDataUrl: string | null;
  showCheckbox: boolean;
}) {
  const color = BBOX_COLORS[index % BBOX_COLORS.length];
  const lowConf = candidate.confidence < 0.5;
  const thumb = useCropThumb(imageDataUrl, candidate.bbox);

  if (!candidate.is_food) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-5 text-center">
        <p className="text-sm font-semibold text-neutral-900">
          음식을 찾지 못했어요
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          음식 사진이나 음식 이름을 입력해주세요.
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={onToggle}
      className={`w-full text-left rounded-2xl border bg-white p-3 transition active:scale-[0.99] ${
        isSelected ? "border-neutral-900 shadow-sm" : "border-neutral-200"
      }`}
    >
      <div className="flex gap-3 items-start">
        {/* 썸네일 */}
        <div className="relative w-16 h-16 shrink-0 rounded-xl bg-neutral-100 overflow-hidden">
          {thumb ? (
            <img src={thumb} alt={candidate.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-400 text-[10px]">
              {imageDataUrl ? "..." : "텍스트"}
            </div>
          )}
          {showCheckbox && candidate.bbox && (
            <span
              className="absolute -top-1 -left-1 text-[9px] font-bold text-white px-1 rounded"
              style={{ backgroundColor: color }}
            >
              {index + 1}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="text-sm font-bold text-neutral-900 truncate">{candidate.name}</h3>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                  lowConf ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {Math.round(candidate.confidence * 100)}%
              </span>
              {showCheckbox && (
                <span
                  className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                    isSelected ? "bg-neutral-900 border-neutral-900" : "border-neutral-300"
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3 text-white" />}
                </span>
              )}
            </div>
          </div>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            {candidate.serving_amount}
            {candidate.serving_unit} · {candidate.serving_g}g
          </p>

          <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
            <Stat label="kcal" value={Math.round(candidate.kcal)} highlight />
            <Stat label="탄" value={Math.round(candidate.carb_g * 10) / 10} />
            <Stat label="단" value={Math.round(candidate.protein_g * 10) / 10} />
            <Stat label="지" value={Math.round(candidate.fat_g * 10) / 10} />
          </div>

          {candidate.rationale && (
            <p className="mt-2 text-[10.5px] text-neutral-500 leading-relaxed line-clamp-2">
              💭 {candidate.rationale}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

/* ------------- useCropThumb: bbox 영역만 잘라낸 데이터 URL ------------- */

function useCropThumb(
  imageDataUrl: string | null,
  bbox: [number, number, number, number] | undefined,
): string | null {
  const [thumb, setThumb] = useState<string | null>(null);
  const reqIdRef = useRef(0);
  useEffect(() => {
    reqIdRef.current += 1;
    const reqId = reqIdRef.current;
    if (!imageDataUrl || !bbox) {
      setThumb(null);
      return;
    }
    void (async () => {
      try {
        const img = new Image();
        img.src = imageDataUrl;
        await img.decode().catch(() => new Promise((r) => (img.onload = () => r(null))));
        const [y0, x0, y1, x1] = bbox;
        const W = img.naturalWidth;
        const H = img.naturalHeight;
        const sx = Math.max(0, x0 * W);
        const sy = Math.max(0, y0 * H);
        const sw = Math.max(1, (x1 - x0) * W);
        const sh = Math.max(1, (y1 - y0) * H);
        const target = 128;
        const canvas = document.createElement("canvas");
        canvas.width = target;
        canvas.height = target;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        // 중앙 정사각형 crop (bbox가 직사각형일 수 있어 짧은 변 기준 center crop)
        const side = Math.min(sw, sh);
        const offX = sx + (sw - side) / 2;
        const offY = sy + (sh - side) / 2;
        ctx.drawImage(img, offX, offY, side, side, 0, 0, target, target);
        const url = canvas.toDataURL("image/jpeg", 0.8);
        if (reqIdRef.current === reqId) setThumb(url);
      } catch {
        if (reqIdRef.current === reqId) setThumb(null);
      }
    })();
  }, [imageDataUrl, bbox?.[0], bbox?.[1], bbox?.[2], bbox?.[3]]);
  return thumb;
}

function FallbackBanner({ info }: { info: FallbackInfo }) {
  const reasonLabel = "AI가 영양정보 추정에 자신 없어";

  if (info.error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-900">
        🔁 {reasonLabel} 식약처 DB 보강을 시도했지만 실패: {info.error}
      </div>
    );
  }
  if (!info.hit) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-900">
        🔁 {reasonLabel} 식약처 DB "{info.query}" 검색 — 일치 항목 없음 (총 {info.totalCount}건)
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] text-emerald-900">
      <p className="font-semibold">🔁 식약처 DB 보강 적용됨</p>
      <p className="mt-1 leading-relaxed">
        {reasonLabel}, 식약처에서 "<b>{info.hit.name}</b>" ({info.hit.serving_g}g 기준) 데이터로 매크로를 채웠어요.
      </p>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={`rounded-md px-1 py-1 ${
        highlight ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-900"
      }`}
    >
      <p className="text-xs font-bold leading-none">{value}</p>
      <p
        className={`text-[9px] mt-0.5 ${highlight ? "text-neutral-300" : "text-neutral-500"}`}
      >
        {label}
      </p>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
