import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cloudRepository } from "@/lib/repository/cloud";
import { CloudAuthError } from "@/lib/repository/types";
import { MacroSlider } from "@/components/MacroSlider";
import type { MacroDir } from "@/components/MacroSlider";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { todayKST } from "@/lib/time";
import { recommendGoal } from "@/lib/goal-recommendation";
import type { UserProfileInsert, UserProfileRow } from "@/lib/repository/types";
import { useEntitlements } from "@/hooks/useEntitlements";
import { PaywallModal } from "@/components/PaywallModal";

export const Route = createFileRoute("/settings/goal")({
  component: GoalPage,
});

/* ───────── 슬라이더 범위 (PRD § 슬라이더 권장 범위) ───────── */
const KCAL_RANGE = { min: 800, max: 5000, step: 50 };
const PROTEIN_RANGE = { min: 20, max: 400, step: 5 };
const CARB_RANGE = { min: 20, max: 600, step: 5 };
const FAT_RANGE = { min: 10, max: 250, step: 5 };

type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
type GoalKey = "loss" | "maintain" | "gain";
type Sex = "male" | "female";

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; desc: string }[] = [
  { value: "sedentary", label: "거의 운동 X", desc: "주로 앉아서 생활" },
  { value: "light", label: "가벼운 운동", desc: "주 1~3회 가벼운 활동" },
  { value: "moderate", label: "보통 운동", desc: "주 3~5회 중강도 운동" },
  { value: "active", label: "활발한 운동", desc: "주 6~7회 운동" },
  { value: "very_active", label: "매우 활발", desc: "매일 강도 높은 운동" },
];

const GOAL_OPTIONS: { value: GoalKey; label: string; desc: string }[] = [
  { value: "loss", label: "체중 감량", desc: "현재보다 가볍게" },
  { value: "maintain", label: "현재 체중 유지", desc: "지금 컨디션 유지" },
  { value: "gain", label: "체중 증량", desc: "근육량 늘리기" },
];

/* ───────── 매크로 토글 카드 상태 ───────── */
interface MacroState {
  active: boolean;
  value: number;
  dir: MacroDir;
}

/* ───────── 추천 마법사 단계 ───────── */
type WizardStep = 1 | 2 | 3 | 4 | 5;

interface WizardData {
  height: string;
  weight: string;
  sex: Sex;
  birthYear: string;
  activity: ActivityLevel;
  goal: GoalKey;
  targetWeight: string;
  targetWeeks: string;
}

/* ───────── 헬퍼 ───────── */
function ReqStar() {
  return <span className="text-[#EF4444] ml-0.5">★</span>;
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-neutral-600 mb-1.5">
      {children}
      {required && <ReqStar />}
    </label>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-xl border border-neutral-200">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium transition-colors",
            value === opt.value ? "bg-neutral-900 text-white" : "bg-white text-neutral-600",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function RadioCards({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; desc: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "flex w-full items-center justify-between rounded-2xl border bg-white p-4 text-left transition-colors",
              active ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-100",
            )}
          >
            <div>
              <p className="text-sm font-semibold text-neutral-900">{o.label}</p>
              <p className="mt-0.5 text-xs text-neutral-500">{o.desc}</p>
            </div>
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border shrink-0 ml-2",
                active ? "border-neutral-900" : "border-neutral-300",
              )}
            >
              {active && <span className="h-2.5 w-2.5 rounded-full bg-neutral-900" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ───────── 매크로 토글 카드 ───────── */
function MacroCard({
  label,
  state,
  range,
  onToggle,
  onValueChange,
  onDirChange,
}: {
  label: string;
  state: MacroState;
  range: { min: number; max: number; step: number };
  onToggle: () => void;
  onValueChange: (v: number) => void;
  onDirChange: (d: MacroDir) => void;
}) {
  if (!state.active) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 flex items-center justify-between">
        <span className="text-sm text-neutral-400">{label} (비활성)</span>
        <button
          type="button"
          onClick={onToggle}
          className="text-xs font-semibold text-neutral-700 border border-neutral-300 rounded-full px-3 py-1 active:bg-neutral-100"
        >
          + 활성화
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-100 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-neutral-900">{label}</span>
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1 text-xs font-medium text-neutral-500 border border-neutral-200 rounded-full px-3 py-1 active:bg-neutral-100"
        >
          <X className="h-3 w-3" />
          해제
        </button>
      </div>
      <MacroSlider
        label=""
        unit="g"
        value={state.value}
        onChange={onValueChange}
        dir={state.dir}
        onDirChange={onDirChange}
        min={range.min}
        max={range.max}
        step={range.step}
      />
    </div>
  );
}

/* ───────── 추천 마법사 (inline overlay) ───────── */
function RecommendWizard({
  existingProfile,
  onApply,
  onClose,
}: {
  existingProfile: UserProfileRow | null;
  onApply: (data: {
    kcal: number;
    kcalDir: MacroDir;
    protein: MacroState;
    carb: MacroState;
    fat: MacroState;
    profile: UserProfileInsert;
  }) => void;
  onClose: () => void;
}) {
  const [step, setStep] = React.useState<WizardStep>(1);

  const [data, setData] = React.useState<WizardData>(() => ({
    height: existingProfile ? String(existingProfile.height_cm) : "",
    weight: existingProfile ? String(existingProfile.weight_kg) : "",
    sex: existingProfile?.sex ?? "male",
    birthYear: existingProfile ? String(existingProfile.birth_year) : "",
    activity: existingProfile?.activity_level ?? "light",
    goal: existingProfile?.goal ?? "maintain",
    targetWeight:
      existingProfile?.target_weight_kg != null ? String(existingProfile.target_weight_kg) : "",
    targetWeeks:
      existingProfile?.target_period_weeks != null
        ? String(existingProfile.target_period_weeks)
        : "",
  }));

  const skipTarget = data.goal === "maintain";
  const TOTAL_STEPS: WizardStep = skipTarget ? 4 : 5;

  const step1Valid =
    Number(data.height) >= 50 &&
    Number(data.weight) >= 20 &&
    Number(data.birthYear) >= 1900 &&
    Number(data.birthYear) <= new Date().getFullYear() - 5 &&
    (data.sex === "male" || data.sex === "female");

  const step4Valid =
    skipTarget ||
    (Number(data.targetWeight) >= 30 &&
      Number(data.targetWeight) <= 250 &&
      Number(data.targetWeeks) > 0 &&
      Number(data.targetWeeks) <= 104 &&
      (data.goal === "loss"
        ? Number(data.targetWeight) < Number(data.weight)
        : Number(data.targetWeight) > Number(data.weight)));

  function getDisplayStep(): number {
    if (skipTarget && step >= 4) return step - 1;
    return step;
  }

  function nextStep() {
    if (step === 1 && !step1Valid) {
      toast.error("키·몸무게·성별·출생연도를 모두 입력해주세요");
      return;
    }
    if (step === 4 && !skipTarget && !step4Valid) {
      const tw = Number(data.targetWeight);
      const cw = Number(data.weight);
      if (tw > 0 && cw > 0) {
        if (data.goal === "loss" && tw >= cw) {
          toast.error("감량 목표 체중은 현재보다 낮아야 해요");
          return;
        }
        if (data.goal === "gain" && tw <= cw) {
          toast.error("증량 목표 체중은 현재보다 높아야 해요");
          return;
        }
      }
      toast.error("목표 체중과 기간을 입력해주세요");
      return;
    }

    if (step === 3 && skipTarget) {
      setStep(5);
      return;
    }
    if (step < 5) setStep((s) => (s + 1) as WizardStep);
  }

  function prevStep() {
    if (step === 1) {
      onClose();
      return;
    }
    if (step === 5 && skipTarget) {
      setStep(3);
      return;
    }
    setStep((s) => (s - 1) as WizardStep);
  }

  function buildProfile(): UserProfileInsert {
    return {
      height_cm: Number(data.height),
      weight_kg: Number(data.weight),
      sex: data.sex,
      birth_year: Number(data.birthYear),
      activity_level: data.activity,
      goal: data.goal,
      target_weight_kg:
        data.goal !== "maintain" && data.targetWeight ? Number(data.targetWeight) : null,
      target_period_weeks:
        data.goal !== "maintain" && data.targetWeeks ? Number(data.targetWeeks) : null,
    };
  }

  const [rec, setRec] = React.useState<ReturnType<typeof recommendGoal> | null>(null);
  // Step 5 진입 시 base 재계산. 사용자가 slider 조정한 값은 step 5 안에서 유지.
  React.useEffect(() => {
    if (step !== 5 || !step1Valid) return;
    try {
      setRec(recommendGoal(buildProfile()));
    } catch {
      setRec(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const age = data.birthYear ? new Date().getFullYear() - Number(data.birthYear) : null;

  const displayStep = getDisplayStep();

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-state="open"
      className="fixed inset-0 z-50 flex items-end justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-[390px] rounded-t-3xl bg-white max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-neutral-200" />
        </div>

        {/* 헤더 */}
        <div className="px-5 pt-2 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-neutral-900">추천 마법사</h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 active:bg-neutral-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* 진행 바 */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-neutral-500 tabular-nums">
              {displayStep}/{TOTAL_STEPS}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
              <div
                className="h-full bg-neutral-900 transition-all"
                style={{ width: `${(displayStep / TOTAL_STEPS) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4">
          {/* Step 1: 신체 */}
          {step === 1 && (
            <div className="rounded-2xl border border-neutral-100 bg-white p-4 space-y-4">
              <p className="text-sm font-semibold text-neutral-700">신체 정보</p>

              <div>
                <FieldLabel required>키 (cm)</FieldLabel>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={data.height}
                  onChange={(e) => setData((d) => ({ ...d, height: e.target.value }))}
                  placeholder="170"
                />
              </div>
              <div>
                <FieldLabel required>몸무게 (kg)</FieldLabel>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={data.weight}
                  onChange={(e) => setData((d) => ({ ...d, weight: e.target.value }))}
                  placeholder="65"
                />
              </div>
              <div>
                <FieldLabel required>성별</FieldLabel>
                <SegmentedControl
                  options={[
                    { value: "male" as Sex, label: "남성" },
                    { value: "female" as Sex, label: "여성" },
                  ]}
                  value={data.sex}
                  onChange={(v) => setData((d) => ({ ...d, sex: v }))}
                />
              </div>
              <div>
                <FieldLabel required>출생연도</FieldLabel>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={data.birthYear}
                  onChange={(e) => setData((d) => ({ ...d, birthYear: e.target.value }))}
                  placeholder="1990"
                />
                <p className="text-[11px] text-neutral-400 mt-1">
                  만 나이는 자동 계산됩니다
                  {age != null && age > 0 ? ` · 만 ${age}세` : ""}
                </p>
              </div>
            </div>
          )}

          {/* Step 2: 활동량 */}
          {step === 2 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-neutral-700 mb-3">활동량</p>
              <RadioCards
                options={ACTIVITY_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                  desc: o.desc,
                }))}
                value={data.activity}
                onChange={(v) => setData((d) => ({ ...d, activity: v as ActivityLevel }))}
              />
            </div>
          )}

          {/* Step 3: 목표 */}
          {step === 3 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-neutral-700 mb-3">다이어트 목표</p>
              <RadioCards
                options={GOAL_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                  desc: o.desc,
                }))}
                value={data.goal}
                onChange={(v) => setData((d) => ({ ...d, goal: v as GoalKey }))}
              />
            </div>
          )}

          {/* Step 4: 목표체중·기간 (감/증 시만) */}
          {step === 4 && !skipTarget && (
            <div className="rounded-2xl border border-neutral-100 bg-white p-4 space-y-4">
              <p className="text-sm font-semibold text-neutral-700">목표 세부 설정</p>
              <div>
                <FieldLabel required>목표 체중 (kg)</FieldLabel>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={data.targetWeight}
                  onChange={(e) => setData((d) => ({ ...d, targetWeight: e.target.value }))}
                  placeholder="60"
                />
                {Number(data.targetWeight) > 0 && Number(data.targetWeight) < 30 && (
                  <p className="mt-1 text-xs text-red-500">목표 체중은 30kg 이상이어야 해요</p>
                )}
                {Number(data.targetWeight) > 250 && (
                  <p className="mt-1 text-xs text-red-500">목표 체중은 250kg 이하로 입력해주세요</p>
                )}
                {Number(data.targetWeight) >= 30 &&
                  Number(data.targetWeight) <= 250 &&
                  Number(data.weight) > 0 && (
                    <>
                      {data.goal === "loss" && Number(data.targetWeight) >= Number(data.weight) && (
                        <p className="mt-1 text-xs text-red-500">
                          감량 목표는 현재 체중보다 낮아야 해요
                        </p>
                      )}
                      {data.goal === "gain" && Number(data.targetWeight) <= Number(data.weight) && (
                        <p className="mt-1 text-xs text-red-500">
                          증량 목표는 현재 체중보다 높아야 해요
                        </p>
                      )}
                    </>
                  )}
              </div>
              <div>
                <FieldLabel required>목표까지 기간 (주)</FieldLabel>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={data.targetWeeks}
                  onChange={(e) => setData((d) => ({ ...d, targetWeeks: e.target.value }))}
                  placeholder="12"
                />
                {Number(data.targetWeeks) > 0 && Number(data.targetWeeks) <= 104 && (
                  <p className="mt-1 text-xs text-neutral-400">
                    약 {(Number(data.targetWeeks) / 4.345).toFixed(1)}개월
                  </p>
                )}
                {Number(data.targetWeeks) > 104 && (
                  <p className="mt-1 text-xs text-red-500">기간은 104주(2년) 이하로 입력해주세요</p>
                )}
              </div>
            </div>
          )}

          {/* Step 5: 결과 확인 */}
          {step === 5 && rec && (
            <div className="space-y-3">
              <p className="text-sm text-neutral-600">
                아래 추천 목표를 확인하세요. 적용 후 직접 조정할 수 있어요.
              </p>
              <div className="rounded-2xl border border-neutral-100 bg-white p-4">
                <p className="text-xs text-neutral-500 mb-2">칼로리 (필수)</p>
                <MacroSlider
                  label="칼로리"
                  unit="kcal"
                  value={rec.daily_kcal.value}
                  onChange={(v) =>
                    setRec((r) => (r ? { ...r, daily_kcal: { ...r.daily_kcal, value: v } } : r))
                  }
                  dir={rec.daily_kcal.dir}
                  onDirChange={(d) =>
                    setRec((r) => (r ? { ...r, daily_kcal: { ...r.daily_kcal, dir: d } } : r))
                  }
                  min={KCAL_RANGE.min}
                  max={KCAL_RANGE.max}
                  step={KCAL_RANGE.step}
                />
              </div>
              <div className="rounded-2xl border border-neutral-100 bg-white p-4">
                <p className="text-xs text-neutral-500 mb-2">단백질 (권장 활성)</p>
                <MacroSlider
                  label="단백질"
                  unit="g"
                  value={rec.protein_g.value}
                  onChange={(v) =>
                    setRec((r) => (r ? { ...r, protein_g: { ...r.protein_g, value: v } } : r))
                  }
                  dir={rec.protein_g.dir}
                  onDirChange={(d) =>
                    setRec((r) => (r ? { ...r, protein_g: { ...r.protein_g, dir: d } } : r))
                  }
                  min={PROTEIN_RANGE.min}
                  max={PROTEIN_RANGE.max}
                  step={PROTEIN_RANGE.step}
                />
              </div>
              <div className="rounded-2xl border border-neutral-100 bg-white p-4">
                <p className="text-xs text-neutral-400 mb-1">
                  탄수화물 · 지방은 비활성 (적용 후 필요시 켤 수 있어요)
                </p>
                <p className="text-xs text-neutral-500">
                  탄수 {rec.carb_g.value}g / 지방 {rec.fat_g.value}g
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="px-5 pb-6 pt-2 space-y-2 border-t border-neutral-100 bg-white">
          {step === 5 && rec ? (
            <>
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="h-12 w-full rounded-2xl border-neutral-300 text-sm font-semibold text-neutral-700"
              >
                추천 다시 받기
              </Button>
              <Button
                onClick={async () => {
                  if (!rec) return;
                  const profile = buildProfile();
                  try {
                    await cloudRepository.userProfile.put(profile);
                  } catch {
                    // 프로필 저장 실패해도 적용은 계속
                  }
                  onApply({
                    kcal: rec.daily_kcal.value,
                    kcalDir: rec.daily_kcal.dir,
                    protein: { active: true, value: rec.protein_g.value, dir: rec.protein_g.dir },
                    carb: { active: false, value: rec.carb_g.value, dir: rec.carb_g.dir },
                    fat: { active: false, value: rec.fat_g.value, dir: rec.fat_g.dir },
                    profile,
                  });
                }}
                className="h-12 w-full rounded-2xl bg-neutral-900 text-base font-semibold text-white hover:bg-neutral-800"
              >
                적용
              </Button>
            </>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={prevStep}
                className="h-12 flex-1 rounded-2xl border-neutral-300 text-sm font-semibold text-neutral-700"
              >
                {step === 1 ? "닫기" : "이전"}
              </Button>
              <Button
                onClick={nextStep}
                disabled={(step === 1 && !step1Valid) || (step === 4 && !skipTarget && !step4Valid)}
                className="h-12 flex-[2] rounded-2xl bg-neutral-900 text-base font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"
              >
                다음
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────── 메인 목표 관리 페이지 ───────── */
function GoalPage() {
  const navigate = useNavigate();
  const { entitlements } = useEntitlements();
  const [goalPaywallOpen, setGoalPaywallOpen] = React.useState(false);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [existingProfile, setExistingProfile] = React.useState<UserProfileRow | null>(null);
  const [showWizard, setShowWizard] = React.useState(false);

  // Step 17 P1 — 추천 마법사는 Pro만. 미허용 시 paywall, 직접 입력은 그대로 가능.
  function handleRecommendClick() {
    if (!entitlements.goalWizard) {
      setGoalPaywallOpen(true);
      return;
    }
    setShowWizard(true);
  }

  /* 칼로리 (항상 활성) */
  const [kcal, setKcal] = React.useState(2000);
  const [kcalDir, setKcalDir] = React.useState<MacroDir>("max");

  /* 매크로 토글 카드 */
  const [protein, setProtein] = React.useState<MacroState>({
    active: false,
    value: 80,
    dir: "min",
  });
  const [carb, setCarb] = React.useState<MacroState>({
    active: false,
    value: 250,
    dir: "max",
  });
  const [fat, setFat] = React.useState<MacroState>({
    active: false,
    value: 60,
    dir: "max",
  });

  /* 적용 시점 */
  const [applyToday, setApplyToday] = React.useState(true);
  const [effectiveDate, setEffectiveDate] = React.useState<Date>(new Date());

  React.useEffect(() => {
    let alive = true;
    Promise.all([cloudRepository.userGoal.get(todayKST()), cloudRepository.userProfile.get()])
      .then(([goal, profile]) => {
        if (!alive) return;
        setExistingProfile(profile);
        if (goal) {
          setKcal(goal.daily_kcal.value);
          setKcalDir(goal.daily_kcal.dir);
          if (goal.protein_g) {
            setProtein({ active: true, value: goal.protein_g.value, dir: goal.protein_g.dir });
          }
          if (goal.carb_g) {
            setCarb({ active: true, value: goal.carb_g.value, dir: goal.carb_g.dir });
          }
          if (goal.fat_g) {
            setFat({ active: true, value: goal.fat_g.value, dir: goal.fat_g.dir });
          }
        }
      })
      .catch((e) => {
        if (!alive) return;
        /* 401 → cloud.ts가 /auth/login으로 자동 redirect */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const effective_from = applyToday ? todayKST() : format(effectiveDate, "yyyy-MM-dd");

      await cloudRepository.userGoal.put({
        daily_kcal_value: kcal,
        daily_kcal_dir: kcalDir,
        protein_g_value: protein.active ? protein.value : null,
        protein_g_dir: protein.dir,
        carb_g_value: carb.active ? carb.value : null,
        carb_g_dir: carb.dir,
        fat_g_value: fat.active ? fat.value : null,
        fat_g_dir: fat.dir,
        effective_from,
      });
      toast.success("목표가 저장되었어요");
      navigate({ to: "/settings" });
    } catch (e) {
      if (e instanceof CloudAuthError) {
        /* 401 → cloud.ts가 /auth/login으로 자동 redirect */
      } else {
        toast.error("저장에 실패했어요");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-white flex justify-center">
      <main className="w-full max-w-[390px] flex flex-col">
        {/* 헤더 */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-100 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="뒤로"
              onClick={() => navigate({ to: "/settings" })}
              className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 active:bg-neutral-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-base font-semibold text-neutral-900">목표 관리</h1>
          </div>
          <button
            type="button"
            onClick={handleRecommendClick}
            className="rounded-full border border-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-900 active:bg-neutral-100"
          >
            추천 받기
          </button>
        </header>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-neutral-400">
            불러오는 중…
          </div>
        ) : (
          <div className="flex-1 px-4 pt-4 pb-12 space-y-3">
            {/* 칼로리 (항상 활성, 필수) */}
            <MacroSlider
              label="칼로리 (필수)"
              unit="kcal"
              value={kcal}
              onChange={setKcal}
              dir={kcalDir}
              onDirChange={setKcalDir}
              min={KCAL_RANGE.min}
              max={KCAL_RANGE.max}
              step={KCAL_RANGE.step}
            />

            {/* 단백질 */}
            <MacroCard
              label="단백질"
              state={protein}
              range={PROTEIN_RANGE}
              onToggle={() => setProtein((s) => ({ ...s, active: !s.active }))}
              onValueChange={(v) => setProtein((s) => ({ ...s, value: v }))}
              onDirChange={(d) => setProtein((s) => ({ ...s, dir: d }))}
            />

            {/* 탄수화물 */}
            <MacroCard
              label="탄수화물"
              state={carb}
              range={CARB_RANGE}
              onToggle={() => setCarb((s) => ({ ...s, active: !s.active }))}
              onValueChange={(v) => setCarb((s) => ({ ...s, value: v }))}
              onDirChange={(d) => setCarb((s) => ({ ...s, dir: d }))}
            />

            {/* 지방 */}
            <MacroCard
              label="지방"
              state={fat}
              range={FAT_RANGE}
              onToggle={() => setFat((s) => ({ ...s, active: !s.active }))}
              onValueChange={(v) => setFat((s) => ({ ...s, value: v }))}
              onDirChange={(d) => setFat((s) => ({ ...s, dir: d }))}
            />

            {/* 적용 시점 */}
            <div className="rounded-2xl border border-neutral-100 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-neutral-900">적용 시점</span>
                <div className="flex overflow-hidden rounded-full border border-neutral-200 text-[11px] font-medium">
                  <button
                    type="button"
                    onClick={() => setApplyToday(true)}
                    className={cn(
                      "px-3 py-1.5 transition-colors",
                      applyToday ? "bg-neutral-900 text-white" : "bg-white text-neutral-500",
                    )}
                  >
                    오늘
                  </button>
                  <button
                    type="button"
                    onClick={() => setApplyToday(false)}
                    className={cn(
                      "px-3 py-1.5 transition-colors",
                      !applyToday ? "bg-neutral-900 text-white" : "bg-white text-neutral-500",
                    )}
                  >
                    다른 날짜
                  </button>
                </div>
              </div>
              {!applyToday && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="mt-3 w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(effectiveDate, "yyyy-MM-dd")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={effectiveDate}
                      onSelect={(d) => d && setEffectiveDate(d)}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* 저장 버튼 */}
            <Button
              onClick={handleSave}
              disabled={saving}
              className="h-12 w-full rounded-2xl bg-neutral-900 text-base font-semibold text-white hover:bg-neutral-800"
            >
              {saving ? "저장 중…" : "저장"}
            </Button>
          </div>
        )}
      </main>

      {/* 추천 마법사 overlay */}
      {showWizard && (
        <RecommendWizard
          existingProfile={existingProfile}
          onApply={(applied) => {
            setKcal(applied.kcal);
            setKcalDir(applied.kcalDir);
            setProtein(applied.protein);
            setCarb(applied.carb);
            setFat(applied.fat);
            setExistingProfile((prev) =>
              prev
                ? {
                    ...prev,
                    ...applied.profile,
                    updated_at: new Date().toISOString(),
                  }
                : null,
            );
            setShowWizard(false);
            toast.success("추천값이 적용되었어요. 저장 버튼을 눌러 확정하세요.");
          }}
          onClose={() => setShowWizard(false)}
        />
      )}

      <PaywallModal
        feature="goal_wizard"
        open={goalPaywallOpen}
        onOpenChange={setGoalPaywallOpen}
      />
    </div>
  );
}
