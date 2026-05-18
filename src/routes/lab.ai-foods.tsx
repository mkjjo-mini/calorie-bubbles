/**
 * /lab/ai-foods — AI 음식 추가 PoC 실험실.
 *
 * ⚠️ 실험용 — DB 저장 X. Gemini 응답만 화면에 표시.
 * 정식 통합은 step-12 통과 후.
 */
import { useState, type ChangeEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Camera,
  ExternalLink,
  Loader2,
  Sparkles,
  Type,
} from "lucide-react";

export const Route = createFileRoute("/lab/ai-foods")({
  component: AiFoodLab,
});

type Mode = "photo" | "text";

interface Analysis {
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
}

interface Ref {
  title?: string;
  url?: string;
}

interface FallbackInfo {
  triggered: boolean;
  reason?: "ai_uncertain";
  hit?: { name: string; serving_g: number; kcal: number; carb_g: number; protein_g: number; fat_g: number } | null;
  query?: string;
  totalCount?: number;
  error?: string;
}

interface AnalyzeResponse {
  analysis: Analysis;
  refs?: Ref[];
  fallback?: FallbackInfo;
  raw?: { text: string };
}

const MODES: { id: Mode; label: string; icon: typeof Camera; hint: string }[] = [
  { id: "photo", label: "사진", icon: Camera, hint: "음식 사진을 업로드하면 AI가 영양 정보를 추정해요." },
  { id: "text", label: "텍스트", icon: Type, hint: '자연어로 입력. 일반 음식·식당 메뉴 모두 OK.\n예: "엄마표 김치찌개", "금돼지식당 껍데기 2인분"' },
];

function AiFoodLab() {
  const [mode, setMode] = useState<Mode>("photo");
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ dataUrl: string; mimeType: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  function reset() {
    setText("");
    setImage(null);
    setErr(null);
    setResult(null);
    setShowRaw(false);
  }

  function onModeChange(m: Mode) {
    setMode(m);
    reset();
  }

  async function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErr("사진이 너무 큽니다 (5MB 한도)");
      return;
    }
    setErr(null);
    const dataUrl = await fileToDataUrl(file);
    setImage({ dataUrl, mimeType: file.type });
    setResult(null);
  }

  async function analyze() {
    if (loading) return;
    setErr(null);
    setResult(null);

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
        setErr(`${json.code ?? res.status}: ${json.message ?? "분석 실패"}`);
        return;
      }
      setResult(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full bg-white flex justify-center pb-24">
      <main className="w-full max-w-[420px] flex flex-col">
        {/* 헤더 */}
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

        {/* 실험 중 배너 */}
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
                    active
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-500 active:text-neutral-700"
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
                  id="ai-food-image"
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
                      <p className="mt-2 text-xs text-neutral-500">
                        탭해서 카메라로 찍거나 앨범에서 선택
                      </p>
                    </>
                  )}
                </div>
              </label>
              {image && (
                <button
                  onClick={() => setImage(null)}
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

          {/* PoC 빠른 입력 — 텍스트 모드만 */}
          {!loading && mode === "text" && !result && (
            <div className="pt-2 flex flex-wrap gap-1.5">
              <span className="text-[10px] text-neutral-400 self-center">예시:</span>
              {[
                "계란 후라이 2개",
                "엄마표 김치찌개",
                "스타벅스 아이스 아메리카노",
                "금돼지식당 껍데기 2인분",
                "교촌치킨 허니콤보 1마리",
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

        {/* 에러 */}
        {err && (
          <div className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
            {err}
          </div>
        )}

        {/* 결과 */}
        {result && (
          <div className="px-4 mt-6 space-y-3">
            <ResultCard analysis={result.analysis} />

            {result.fallback?.triggered && (
              <FallbackBanner info={result.fallback} />
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

function ResultCard({ analysis }: { analysis: Analysis }) {
  if (!analysis.is_food) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-6 text-center">
        <p className="text-sm font-semibold text-neutral-900">음식을 찾지 못했어요</p>
        <p className="mt-1 text-xs text-neutral-500">
          다른 사진/설명을 시도해보세요.
        </p>
      </div>
    );
  }
  const lowConf = analysis.confidence < 0.5;
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-bold text-neutral-900">{analysis.name}</h2>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
            lowConf
              ? "bg-amber-100 text-amber-800"
              : "bg-emerald-100 text-emerald-800"
          }`}
          title="AI 신뢰도"
        >
          {Math.round(analysis.confidence * 100)}%
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-neutral-500">
        {analysis.serving_amount}
        {analysis.serving_unit} · {analysis.serving_g}g
      </p>

      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <Stat label="kcal" value={Math.round(analysis.kcal)} highlight />
        <Stat label="탄 g" value={Math.round(analysis.carb_g * 10) / 10} />
        <Stat label="단 g" value={Math.round(analysis.protein_g * 10) / 10} />
        <Stat label="지 g" value={Math.round(analysis.fat_g * 10) / 10} />
      </div>

      {analysis.rationale && (
        <p className="mt-4 pt-3 border-t border-neutral-100 text-[11px] text-neutral-500 leading-relaxed">
          💭 {analysis.rationale}
        </p>
      )}

      {lowConf && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[10.5px] text-amber-900">
          ⚠️ AI가 자신 없어요. 수치를 꼭 확인해주세요.
        </div>
      )}
    </div>
  );
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
      className={`rounded-lg px-2 py-2 ${
        highlight ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-900"
      }`}
    >
      <p className="text-base font-bold leading-none">{value}</p>
      <p
        className={`text-[10px] mt-1 ${
          highlight ? "text-neutral-300" : "text-neutral-500"
        }`}
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
