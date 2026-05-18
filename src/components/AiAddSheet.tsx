/**
 * AiAddSheet — 홈 FAB([+]) 탭 시 열리는 AI 음식 추가 시트.
 *
 *  단계 1: 입력  (자연어 + 📷 사진 선택)  →  "분석"
 *  단계 2: 미리보기 (음식명·g·kcal·매크로 편집 가능)  →  "등록"
 *
 *  등록 시:
 *    - 사진 있으면 클라이언트 200x200 리사이즈 → Supabase Storage 업로드 (본인 폴더)
 *    - POST /api/foods   (created_via, source_text, source_refs, photo_url, ai_confidence)
 *    - POST /api/food-logs (당일/선택된 날짜로)
 *    - 시트 닫고 토스트
 *
 *  "수동으로 입력" 링크 → /add 화면으로 폴백 (시트 닫음).
 */
import { useState, type ChangeEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Camera, ExternalLink, Loader2, Sparkles, X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { resizeToThumbnail } from "@/lib/image-resize";
import { useSession } from "@/hooks/useSession";
import { inferMealSlot, type MealSlot } from "@/lib/foods";

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
  hit?: { name: string } | null;
  error?: string;
}

interface AnalyzeResponse {
  analysis: Analysis;
  refs?: Ref[];
  fallback?: FallbackInfo;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 등록 완료 후 콜백 (parent에서 query 무효화) */
  onRegistered?: () => void;
  /** 등록될 날짜 YYYY-MM-DD (KST) */
  loggedDate: string;
  /** 식사 슬롯 — 미지정 시 현재 시각 기준 자동 */
  mealSlot?: MealSlot;
}

export function AiAddSheet({
  open,
  onOpenChange,
  onRegistered,
  loggedDate,
  mealSlot,
}: Props) {
  const navigate = useNavigate();
  const { session } = useSession();
  const [step, setStep] = useState<"input" | "preview">("input");
  const [text, setText] = useState("");
  const [image, setImage] = useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
  const [loading, setLoading] = useState<"analyze" | "register" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  /** 사용자가 편집한 값 (preview 단계) */
  const [edit, setEdit] = useState<Analysis | null>(null);

  function reset() {
    setStep("input");
    setText("");
    setImage(null);
    setErr(null);
    setResult(null);
    setEdit(null);
    setLoading(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 다시 선택 가능하게
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErr("사진이 너무 큽니다 (10MB 한도)");
      return;
    }
    setErr(null);
    const previewUrl = URL.createObjectURL(file);
    setImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return { file, previewUrl };
    });
  }

  async function analyze() {
    if (loading) return;
    setErr(null);
    setResult(null);

    let body: Record<string, unknown>;
    if (image) {
      // 분석은 큰 사진(원본)으로 — 정확도 ↑. 썸네일은 등록 시 별도.
      const base64 = await fileToBase64(image.file);
      body = {
        mode: "photo",
        image: { mimeType: image.file.type, data: base64 },
        ...(text.trim() ? { hint: text.trim() } : {}),
      };
    } else if (text.trim()) {
      body = { mode: "text", text: text.trim() };
    } else {
      setErr("음식을 입력하거나 사진을 선택해주세요");
      return;
    }

    setLoading("analyze");
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
        // 친절한 메시지가 있으면 그대로, 없으면 code 첨부
        const msg = json.message ?? "분석 실패";
        setErr(json.code === "OVERLOADED" ? msg : `${json.code ?? res.status}: ${msg}`);
        return;
      }
      if (!json.analysis?.is_food) {
        setErr("음식을 찾지 못했어요. 다른 사진/설명을 시도해보세요.");
        return;
      }
      setResult(json);
      setEdit({ ...json.analysis });
      setStep("preview");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(null);
    }
  }

  async function register() {
    if (!edit || loading) return;
    if (!session?.userId) {
      setErr("로그인이 필요합니다");
      return;
    }
    setLoading("register");
    setErr(null);
    try {
      // 1) 사진 있으면 200x200 썸네일로 리사이즈 후 Storage 업로드
      let photoPath: string | null = null;
      if (image) {
        const { blob } = await resizeToThumbnail(image.file, 200);
        const photoId = randomId();
        const path = `${session.userId}/${photoId}.jpg`;
        const supabase = getBrowserSupabase();
        const { error: upErr } = await supabase.storage
          .from("food-photos")
          .upload(path, blob, {
            contentType: "image/jpeg",
            upsert: false,
          });
        if (upErr) throw new Error(`사진 업로드 실패: ${upErr.message}`);
        photoPath = path;
      }

      // 2) foods INSERT
      const createdVia = image ? "ai_photo" : "ai_text";
      const foodPayload = {
        source: "user" as const,
        name: edit.name,
        serving_unit: edit.serving_unit || "인분",
        serving_amount: edit.serving_amount || 1,
        serving_g: edit.serving_g,
        kcal: edit.kcal,
        carb_g: edit.carb_g,
        protein_g: edit.protein_g,
        fat_g: edit.fat_g,
        is_estimated: true,
        created_via: createdVia,
        photo_url: photoPath,
        source_text: image ? text.trim() || null : text.trim(),
        source_refs:
          result?.refs && result.refs.length > 0 ? result.refs : null,
        ai_confidence: edit.confidence,
      };
      const fRes = await fetch("/api/foods", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(foodPayload),
      });
      if (!fRes.ok) {
        const t = await fRes.text();
        throw new Error(`음식 등록 실패: ${t.slice(0, 200)}`);
      }
      const food = (await fRes.json()) as { id: string };

      // 3) food_logs INSERT (1인분 기준 = edit.serving_g)
      const slot = mealSlot ?? inferMealSlot(Date.now());
      const logPayload = {
        food_id: food.id,
        logged_date: loggedDate,
        meal_slot: slot,
        grams: edit.serving_g,
        kcal: edit.kcal,
        carb_g: edit.carb_g,
        protein_g: edit.protein_g,
        fat_g: edit.fat_g,
      };
      const lRes = await fetch("/api/food-logs", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(logPayload),
      });
      if (!lRes.ok) {
        const t = await lRes.text();
        throw new Error(`기록 추가 실패: ${t.slice(0, 200)}`);
      }

      toast.success(`"${edit.name}" 기록됐어요`);
      onRegistered?.();
      handleOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "등록 실패");
    } finally {
      setLoading(null);
    }
  }

  function goManual() {
    handleOpenChange(false);
    navigate({ to: "/add", search: { date: loggedDate } });
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="text-left pb-2">
          <DrawerTitle className="flex items-center gap-1.5 text-base">
            <Sparkles className="h-4 w-4 text-amber-500" />
            {step === "input" ? "AI로 음식 추가" : "이렇게 기록할까요?"}
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-[max(env(safe-area-inset-bottom),16px)] overflow-y-auto">
          {step === "input" && (
            <InputStep
              text={text}
              setText={setText}
              image={image}
              onPickImage={onPickImage}
              onClearImage={() => {
                if (image) URL.revokeObjectURL(image.previewUrl);
                setImage(null);
              }}
              onAnalyze={analyze}
              loading={loading === "analyze"}
              err={err}
              onManual={goManual}
            />
          )}

          {step === "preview" && edit && (
            <PreviewStep
              edit={edit}
              setEdit={setEdit}
              fallback={result?.fallback}
              refs={result?.refs ?? []}
              imagePreviewUrl={image?.previewUrl ?? null}
              onBack={() => setStep("input")}
              onRegister={register}
              loading={loading === "register"}
              err={err}
            />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/* ---------------- 단계 1: 입력 ---------------- */
function InputStep({
  text,
  setText,
  image,
  onPickImage,
  onClearImage,
  onAnalyze,
  loading,
  err,
  onManual,
}: {
  text: string;
  setText: (s: string) => void;
  image: { previewUrl: string } | null;
  onPickImage: (e: ChangeEvent<HTMLInputElement>) => void;
  onClearImage: () => void;
  onAnalyze: () => void;
  loading: boolean;
  err: string | null;
  onManual: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-neutral-500 leading-relaxed">
        음식 사진을 찍거나, 자연어로 적어주세요. (식당 메뉴도 OK)
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full rounded-xl border border-neutral-200 px-3 py-3 text-sm outline-none focus:border-neutral-900 resize-none"
        placeholder='예: "엄마표 김치찌개" / "금돼지식당 껍데기 2인분"'
      />

      {image ? (
        <div className="relative">
          <img
            src={image.previewUrl}
            alt="선택한 사진"
            className="w-full max-h-56 object-contain rounded-xl bg-neutral-100"
          />
          <button
            onClick={onClearImage}
            aria-label="사진 제거"
            className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center active:bg-black/80"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label className="flex items-center justify-center gap-2 h-12 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 text-neutral-600 text-sm active:bg-neutral-100">
          <Camera className="h-4 w-4" />
          사진 추가 (선택)
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onPickImage}
          />
        </label>
      )}

      {err && (
        <p className="text-xs text-red-600 px-1">{err}</p>
      )}

      <button
        onClick={onAnalyze}
        disabled={loading || (!text.trim() && !image)}
        className="h-12 rounded-xl bg-neutral-900 text-white text-sm font-semibold disabled:opacity-40 active:bg-neutral-800 inline-flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? "AI 분석 중..." : "AI로 분석"}
      </button>

      <button
        onClick={onManual}
        className="text-[12px] text-neutral-500 active:text-neutral-900 underline text-center py-1"
      >
        수동으로 입력
      </button>
    </div>
  );
}

/* ---------------- 단계 2: 미리보기 + 편집 ---------------- */
function PreviewStep({
  edit,
  setEdit,
  fallback,
  refs,
  imagePreviewUrl,
  onBack,
  onRegister,
  loading,
  err,
}: {
  edit: Analysis;
  setEdit: (a: Analysis) => void;
  fallback?: FallbackInfo;
  refs: Ref[];
  imagePreviewUrl: string | null;
  onBack: () => void;
  onRegister: () => void;
  loading: boolean;
  err: string | null;
}) {
  function num(field: keyof Analysis, v: string) {
    const n = Number(v);
    if (Number.isFinite(n)) setEdit({ ...edit, [field]: n });
  }

  const lowConf = edit.confidence < 0.5;
  const canRegister = edit.name.trim().length > 0 && edit.serving_g > 0;

  return (
    <div className="space-y-4">
      {imagePreviewUrl && (
        <img
          src={imagePreviewUrl}
          alt="분석한 사진"
          className="w-full max-h-40 object-contain rounded-xl bg-neutral-100"
        />
      )}

      {/* 음식 이름 */}
      <SheetField label="음식 이름" required>
        <input
          value={edit.name}
          onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          placeholder="음식 이름"
          className="w-full h-11 px-3 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300"
        />
      </SheetField>

      {/* 1회 제공량 */}
      <SheetField label="1회 제공량" required>
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            value={edit.serving_amount}
            onChange={(e) => num("serving_amount", e.target.value)}
            min={0}
            className="flex-1 h-11 px-3 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300"
          />
          <input
            value={edit.serving_unit}
            onChange={(e) => setEdit({ ...edit, serving_unit: e.target.value })}
            placeholder="단위"
            className="w-24 h-11 px-3 rounded-xl border border-neutral-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-300"
          />
        </div>
        <div className="mt-2">
          <label className="text-xs text-neutral-500 block mb-1">
            그램 (g)
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={edit.serving_g}
            onChange={(e) => num("serving_g", e.target.value)}
            min={0}
            className="w-full h-11 px-3 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300"
          />
        </div>
      </SheetField>

      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-neutral-200" />
        <span className="text-xs text-neutral-400">영양 정보</span>
        <div className="flex-1 h-px bg-neutral-200" />
      </div>

      {/* 열량 */}
      <SheetField label="열량 (kcal)">
        <input
          type="number"
          inputMode="decimal"
          value={edit.kcal}
          onChange={(e) => num("kcal", e.target.value)}
          min={0}
          className="w-full h-11 px-3 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300"
        />
      </SheetField>

      {/* 탄·단·지 */}
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            { key: "carb_g", label: "탄수화물 (g)" },
            { key: "protein_g", label: "단백질 (g)" },
            { key: "fat_g", label: "지방 (g)" },
          ] as const
        ).map((row) => (
          <div key={row.key}>
            <label className="text-xs text-neutral-600 font-medium mb-1.5 flex items-center gap-1">
              {row.label}
              <span className="text-[10px] text-neutral-400 px-1 py-0.5 rounded bg-neutral-100">
                AI
              </span>
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={edit[row.key] as number}
              onChange={(e) => num(row.key, e.target.value)}
              min={0}
              step={0.1}
              className="w-full h-11 px-3 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300"
            />
          </div>
        ))}
      </div>

      {/* AI rationale + fallback */}
      <div className="rounded-xl bg-neutral-50 px-3 py-2.5 text-[11px] text-neutral-600 leading-relaxed">
        💭 {edit.rationale}
        {fallback?.triggered && fallback.hit && (
          <span className="block mt-1 text-emerald-700">
            🔁 식약처 DB "{fallback.hit.name}" 기준 보강.
          </span>
        )}
      </div>

      {/* 참조 출처 (식당) */}
      {refs.length > 0 && (
        <div className="rounded-xl border border-neutral-100 px-3 py-2.5">
          <p className="text-[10px] font-semibold text-neutral-500 mb-1.5">
            📚 참조 ({refs.length})
          </p>
          <div className="space-y-1">
            {refs.slice(0, 3).map((r, i) => (
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

      {lowConf && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-900">
          ⚠️ AI 신뢰도가 낮아요 ({Math.round(edit.confidence * 100)}%). 수치를 꼭 확인하세요.
        </div>
      )}

      {err && <p className="text-xs text-red-600 px-1">{err}</p>}

      <div className="grid grid-cols-[1fr_2fr] gap-2 pt-2">
        <button
          onClick={onBack}
          disabled={loading}
          className="h-12 rounded-xl border border-neutral-200 text-sm font-semibold active:bg-neutral-50 disabled:opacity-40"
        >
          돌아가기
        </button>
        <button
          onClick={onRegister}
          disabled={loading || !canRegister}
          className="h-12 rounded-xl bg-neutral-900 text-white text-sm font-semibold disabled:opacity-40 active:bg-neutral-800 inline-flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "등록 중..." : "등록"}
        </button>
      </div>
    </div>
  );
}

function SheetField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs text-neutral-600 font-medium block mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

/* ---------------- helpers ---------------- */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * crypto.randomUUID polyfill — Toss 인앱 WebView (구 WebKit)에서 randomUUID 미지원.
 * getRandomValues는 광범위하게 지원돼 RFC4122 v4 UUID 직접 생성.
 */
function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}
