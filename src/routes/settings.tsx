import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CalendarIcon, Pencil, Star } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { MacroSlider, type MacroDir } from "@/components/MacroSlider";
import { useStorage } from "@/hooks/useStorage";
import { todayKST } from "@/lib/time";
import type { ResolvedGoal } from "@/lib/goal";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

type Screen = "mode" | "direct" | "wizard";

interface Profile {
  height: number;
  weight: number;
  sex: "male" | "female";
  birthYear: number;
  activity: ActivityKey;
  goal: GoalKey;
  targetWeight?: number;
  weeks?: number;
}

type ActivityKey = "sedentary" | "light" | "moderate" | "active" | "very_active";
type GoalKey = "lose" | "maintain" | "gain";

const ACTIVITY_OPTIONS: { key: ActivityKey; label: string; desc: string; factor: number }[] = [
  { key: "sedentary", label: "거의 안 함", desc: "주로 앉아서 생활", factor: 1.2 },
  { key: "light", label: "가벼운 운동", desc: "주 1~3회 가벼운 활동", factor: 1.375 },
  { key: "moderate", label: "보통 운동", desc: "주 3~5회 중강도 운동", factor: 1.55 },
  { key: "active", label: "활발한 운동", desc: "주 6~7회 운동", factor: 1.725 },
  { key: "very_active", label: "매우 활발", desc: "매일 강도 높은 운동", factor: 1.9 },
];

const GOAL_OPTIONS: { key: GoalKey; label: string; desc: string }[] = [
  { key: "lose", label: "체중 감량", desc: "현재보다 가볍게" },
  { key: "maintain", label: "현재 체중 유지", desc: "지금 컨디션 유지" },
  { key: "gain", label: "체중 증량", desc: "근육량 늘리기" },
];

const PROFILE_KEY = "kc.userProfile.v1";

function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function saveProfile(p: Profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

// Mifflin–St Jeor BMR → TDEE → adjust for goal
function computeRecommendation(p: Profile): {
  kcal: number;
  carb: number;
  protein: number;
  fat: number;
} {
  const age = new Date().getFullYear() - p.birthYear;
  const bmr =
    p.sex === "male"
      ? 10 * p.weight + 6.25 * p.height - 5 * age + 5
      : 10 * p.weight + 6.25 * p.height - 5 * age - 161;
  const factor = ACTIVITY_OPTIONS.find((a) => a.key === p.activity)?.factor ?? 1.375;
  let tdee = bmr * factor;
  if (p.goal === "lose" && p.targetWeight && p.weeks) {
    const kgDiff = p.weight - p.targetWeight;
    const dailyDeficit = (kgDiff * 7700) / (p.weeks * 7);
    tdee -= dailyDeficit;
  } else if (p.goal === "gain" && p.targetWeight && p.weeks) {
    const kgDiff = p.targetWeight - p.weight;
    const dailySurplus = (kgDiff * 7700) / (p.weeks * 7);
    tdee += dailySurplus;
  }
  const kcal = Math.max(1200, Math.round(tdee / 10) * 10);
  const protein = Math.round(p.weight * (p.goal === "gain" ? 1.6 : 1.4));
  const fat = Math.round((kcal * 0.25) / 9);
  const carb = Math.max(50, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, carb, protein, fat };
}

function SettingsPage() {
  const storage = useStorage();
  const navigate = useNavigate();
  const [screen, setScreen] = React.useState<Screen>("mode");
  const [currentGoal, setCurrentGoal] = React.useState<ResolvedGoal | null>(null);
  const [hasProfile, setHasProfile] = React.useState(false);

  React.useEffect(() => {
    storage.userGoal.get().then(setCurrentGoal).catch(() => null);
    setHasProfile(loadProfile() !== null);
  }, [storage]);

  return (
    <div className="min-h-screen w-full bg-[#FFFDF5] flex justify-center">
      <main className="w-full max-w-[390px] flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-neutral-100 bg-[#FFFDF5]/95 px-4 py-3 backdrop-blur">
          <button
            type="button"
            aria-label="뒤로"
            onClick={() => {
              if (screen === "mode") navigate({ to: "/" });
              else setScreen("mode");
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 active:bg-neutral-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-semibold text-neutral-900">목표 설정</h1>
        </header>

        <div className="flex-1 px-4 pb-12 pt-4">
          {screen === "mode" && (
            <ModeChoice
              goal={currentGoal}
              hasProfile={hasProfile}
              onRecommend={() => setScreen("wizard")}
              onDirect={() => setScreen("direct")}
            />
          )}
          {screen === "direct" && (
            <DirectInput
              initial={currentGoal}
              onSaved={(g) => {
                setCurrentGoal(g);
                setScreen("mode");
              }}
            />
          )}
          {screen === "wizard" && (
            <Wizard
              onSaved={(g) => {
                setCurrentGoal(g);
                setHasProfile(true);
                setScreen("mode");
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// ---------------- Mode Choice ----------------
function ModeChoice({
  goal,
  hasProfile,
  onRecommend,
  onDirect,
}: {
  goal: ResolvedGoal | null;
  hasProfile: boolean;
  onRecommend: () => void;
  onDirect: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-neutral-100 bg-white p-4">
        <p className="text-[11px] font-medium text-neutral-400">현재 목표</p>
        {goal ? (
          <>
            <p className="mt-1 text-base font-semibold text-neutral-900">
              칼로리 {goal.daily_kcal.value} kcal{" "}
              {goal.daily_kcal.dir === "max" ? "이하" : "이상"}
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              탄 {goal.carb_g.value}g · 단 {goal.protein_g.value}g · 지 {goal.fat_g.value}g
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-neutral-400">불러오는 중…</p>
        )}
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={onRecommend}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FFD700] py-4 text-base font-semibold text-neutral-900 shadow-sm active:bg-[#f0ca00]"
        >
          <Star className="h-5 w-5 fill-current" /> 추천받기
        </button>
        <button
          type="button"
          onClick={onDirect}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-neutral-900 bg-white py-4 text-base font-semibold text-neutral-900 active:bg-neutral-50"
        >
          <Pencil className="h-5 w-5" /> 직접 입력
        </button>
        {!hasProfile && (
          <p className="pt-1 text-center text-xs text-neutral-400">
            처음이라면 추천받기를 권장해요
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------- Required label ----------------
function ReqLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1 text-sm font-medium text-neutral-700">
      {children}
      <span className="text-[#EF4444]">★</span>
    </label>
  );
}

// ---------------- Direct Input ----------------
function DirectInput({
  initial,
  onSaved,
}: {
  initial: ResolvedGoal | null;
  onSaved: (g: ResolvedGoal) => void;
}) {
  const storage = useStorage();
  const [kcal, setKcal] = React.useState(initial?.daily_kcal.value ?? 2000);
  const [kcalDir, setKcalDir] = React.useState<MacroDir>(initial?.daily_kcal.dir ?? "max");
  const [carb, setCarb] = React.useState(initial?.carb_g.value ?? 250);
  const [carbDir, setCarbDir] = React.useState<MacroDir>(initial?.carb_g.dir ?? "max");
  const [protein, setProtein] = React.useState(initial?.protein_g.value ?? 40);
  const [proteinDir, setProteinDir] = React.useState<MacroDir>(initial?.protein_g.dir ?? "min");
  const [fat, setFat] = React.useState(initial?.fat_g.value ?? 60);
  const [fatDir, setFatDir] = React.useState<MacroDir>(initial?.fat_g.dir ?? "max");
  const [applyToday, setApplyToday] = React.useState(true);
  const [date, setDate] = React.useState<Date>(new Date());
  const [notifyOn, setNotifyOn] = React.useState(!!initial?.notification_time);
  const [time, setTime] = React.useState(initial?.notification_time ?? "20:00");
  const [saving, setSaving] = React.useState(false);

  const onSave = async () => {
    setSaving(true);
    try {
      const effective_from = applyToday
        ? todayKST()
        : format(date, "yyyy-MM-dd");
      await storage.userGoal.put({
        daily_kcal_value: kcal,
        daily_kcal_dir: kcalDir,
        carb_g_value: carb,
        carb_g_dir: carbDir,
        protein_g_value: protein,
        protein_g_dir: proteinDir,
        fat_g_value: fat,
        fat_g_dir: fatDir,
        effective_from,
        notification_time: notifyOn ? time : null,
      });
      const fresh = await storage.userGoal.get();
      toast.success("목표가 저장되었어요");
      onSaved(fresh);
    } catch (e) {
      toast.error("저장에 실패했어요");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <MacroSlider
        label="칼로리"
        unit="kcal"
        value={kcal}
        onChange={setKcal}
        dir={kcalDir}
        onDirChange={setKcalDir}
        min={1000}
        max={4000}
        step={10}
      />
      <MacroSlider
        label="탄수화물"
        unit="g"
        value={carb}
        onChange={setCarb}
        dir={carbDir}
        onDirChange={setCarbDir}
        min={20}
        max={500}
      />
      <MacroSlider
        label="단백질"
        unit="g"
        value={protein}
        onChange={setProtein}
        dir={proteinDir}
        onDirChange={setProteinDir}
        min={20}
        max={300}
      />
      <MacroSlider
        label="지방"
        unit="g"
        value={fat}
        onChange={setFat}
        dir={fatDir}
        onDirChange={setFatDir}
        min={10}
        max={200}
      />

      <div className="rounded-2xl border border-neutral-100 bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-neutral-900">적용 시점</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">오늘 적용</span>
            <Switch checked={applyToday} onCheckedChange={setApplyToday} />
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
                {format(date, "yyyy-MM-dd")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        )}
      </div>

      <NotifyCard
        on={notifyOn}
        onOnChange={setNotifyOn}
        time={time}
        onTimeChange={setTime}
      />

      <Button
        onClick={onSave}
        disabled={saving}
        className="h-12 w-full rounded-2xl bg-neutral-900 text-base font-semibold text-white hover:bg-neutral-800"
      >
        {saving ? "저장 중…" : "저장"}
      </Button>
    </div>
  );
}

// ---------------- Notify card (shared) ----------------
function NotifyCard({
  on,
  onOnChange,
  time,
  onTimeChange,
}: {
  on: boolean;
  onOnChange: (v: boolean) => void;
  time: string;
  onTimeChange: (t: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-neutral-100 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-neutral-900">알림 받기</span>
        <Switch checked={on} onCheckedChange={onOnChange} />
      </div>
      {on && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-neutral-500">알림 시간</span>
          <Input
            type="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            className="w-32"
          />
        </div>
      )}
    </div>
  );
}

// ---------------- Wizard ----------------
function Wizard({ onSaved }: { onSaved: (g: ResolvedGoal) => void }) {
  const storage = useStorage();
  const existing = loadProfile();
  const [step, setStep] = React.useState(1);
  const [height, setHeight] = React.useState<string>(existing?.height?.toString() ?? "");
  const [weight, setWeight] = React.useState<string>(existing?.weight?.toString() ?? "");
  const [sex, setSex] = React.useState<"male" | "female" | "">(existing?.sex ?? "");
  const [birthYear, setBirthYear] = React.useState<string>(
    existing?.birthYear?.toString() ?? "",
  );
  const [activity, setActivity] = React.useState<ActivityKey>(existing?.activity ?? "light");
  const [goal, setGoal] = React.useState<GoalKey>(existing?.goal ?? "maintain");
  const [targetWeight, setTargetWeight] = React.useState<string>(
    existing?.targetWeight?.toString() ?? "",
  );
  const [weeks, setWeeks] = React.useState<string>(existing?.weeks?.toString() ?? "");
  const [notifyOn, setNotifyOn] = React.useState(false);
  const [time, setTime] = React.useState("20:00");

  const skipTarget = goal === "maintain";
  const totalSteps = 6;

  // Recommendation state for step 6
  const [rec, setRec] = React.useState<{ kcal: number; carb: number; protein: number; fat: number } | null>(null);
  const [saving, setSaving] = React.useState(false);

  const profile: Profile | null = React.useMemo(() => {
    const h = Number(height), w = Number(weight), y = Number(birthYear);
    if (!h || !w || !y || !sex) return null;
    return {
      height: h,
      weight: w,
      sex,
      birthYear: y,
      activity,
      goal,
      targetWeight: goal !== "maintain" ? Number(targetWeight) || undefined : undefined,
      weeks: goal !== "maintain" ? Number(weeks) || undefined : undefined,
    };
  }, [height, weight, sex, birthYear, activity, goal, targetWeight, weeks]);

  const computeAndAdvance = React.useCallback(() => {
    if (!profile) return;
    const r = computeRecommendation(profile);
    setRec(r);
  }, [profile]);

  // step validity
  const step1Valid = !!profile;
  const step4Valid = skipTarget || (Number(targetWeight) > 0 && Number(weeks) > 0);

  const goNext = () => {
    if (step === 1 && !step1Valid) return;
    if (step === 4 && !step4Valid) return;
    let next = step + 1;
    if (next === 4 && skipTarget) next = 5;
    if (next === 6) {
      computeAndAdvance();
    }
    setStep(Math.min(totalSteps, next));
  };
  const goBack = () => {
    let prev = step - 1;
    if (prev === 4 && skipTarget) prev = 3;
    setStep(Math.max(1, prev));
  };

  const onRecomputeFromStart = () => {
    setRec(null);
    setStep(1);
  };

  const onSave = async () => {
    if (!profile || !rec) return;
    setSaving(true);
    try {
      saveProfile(profile);
      await storage.userGoal.put({
        daily_kcal_value: rec.kcal,
        daily_kcal_dir: "max",
        carb_g_value: rec.carb,
        carb_g_dir: "max",
        protein_g_value: rec.protein,
        protein_g_dir: "min",
        fat_g_value: rec.fat,
        fat_g_dir: "max",
        effective_from: todayKST(),
        notification_time: notifyOn ? time : null,
      });
      const fresh = await storage.userGoal.get();
      toast.success("목표가 저장되었어요");
      onSaved(fresh);
    } catch (e) {
      toast.error("저장에 실패했어요");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const age = birthYear ? new Date().getFullYear() - Number(birthYear) : null;

  return (
    <div className="space-y-4">
      {/* progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-neutral-500">
          <span>{step}/{totalSteps}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
          <div
            className="h-full bg-neutral-900 transition-all"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4">
          <div className="space-y-1.5">
            <ReqLabel>키 (cm)</ReqLabel>
            <Input
              type="number"
              inputMode="numeric"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="170"
            />
          </div>
          <div className="space-y-1.5">
            <ReqLabel>몸무게 (kg)</ReqLabel>
            <Input
              type="number"
              inputMode="numeric"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="65"
            />
          </div>
          <div className="space-y-1.5">
            <ReqLabel>성별</ReqLabel>
            <div className="flex overflow-hidden rounded-xl border border-neutral-200">
              {(["male", "female"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSex(s)}
                  className={cn(
                    "flex-1 py-2.5 text-sm font-medium transition-colors",
                    sex === s
                      ? "bg-neutral-900 text-white"
                      : "bg-white text-neutral-600",
                  )}
                >
                  {s === "male" ? "남성" : "여성"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <ReqLabel>출생연도</ReqLabel>
            <Input
              type="number"
              inputMode="numeric"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              placeholder="1990"
            />
            <p className="text-[11px] text-neutral-400">
              (만 나이는 자동 계산됩니다{age ? ` · 만 ${age}세` : ""})
            </p>
          </div>
        </div>
      )}

      {step === 2 && (
        <RadioCards
          options={ACTIVITY_OPTIONS.map((o) => ({ key: o.key, label: o.label, desc: o.desc }))}
          value={activity}
          onChange={(k) => setActivity(k as ActivityKey)}
        />
      )}

      {step === 3 && (
        <RadioCards
          options={GOAL_OPTIONS.map((o) => ({ key: o.key, label: o.label, desc: o.desc }))}
          value={goal}
          onChange={(k) => setGoal(k as GoalKey)}
        />
      )}

      {step === 4 && !skipTarget && (
        <div className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4">
          <div className="space-y-1.5">
            <ReqLabel>목표 체중 (kg)</ReqLabel>
            <Input
              type="number"
              inputMode="numeric"
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
              placeholder="60"
            />
          </div>
          <div className="space-y-1.5">
            <ReqLabel>목표까지 기간 (주)</ReqLabel>
            <Input
              type="number"
              inputMode="numeric"
              value={weeks}
              onChange={(e) => setWeeks(e.target.value)}
              placeholder="12"
            />
          </div>
        </div>
      )}

      {step === 5 && (
        <NotifyCard
          on={notifyOn}
          onOnChange={setNotifyOn}
          time={time}
          onTimeChange={setTime}
        />
      )}

      {step === 6 && rec && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">
            추천 목표예요. 슬라이더로 조정할 수 있어요.
          </p>
          <MacroSlider
            label="칼로리"
            unit="kcal"
            value={rec.kcal}
            onChange={(v) => setRec({ ...rec, kcal: v })}
            dir="max"
            min={1000}
            max={4000}
            step={10}
          />
          <MacroSlider
            label="탄수화물"
            unit="g"
            value={rec.carb}
            onChange={(v) => setRec({ ...rec, carb: v })}
            dir="max"
            min={20}
            max={500}
          />
          <MacroSlider
            label="단백질"
            unit="g"
            value={rec.protein}
            onChange={(v) => setRec({ ...rec, protein: v })}
            dir="min"
            min={20}
            max={300}
          />
          <MacroSlider
            label="지방"
            unit="g"
            value={rec.fat}
            onChange={(v) => setRec({ ...rec, fat: v })}
            dir="max"
            min={10}
            max={200}
          />
          <Button
            variant="outline"
            onClick={onRecomputeFromStart}
            className="h-12 w-full rounded-2xl border-neutral-900 text-base font-semibold text-neutral-900"
          >
            추천 다시 받기
          </Button>
          <Button
            onClick={onSave}
            disabled={saving}
            className="h-12 w-full rounded-2xl bg-neutral-900 text-base font-semibold text-white hover:bg-neutral-800"
          >
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      )}

      {step < 6 && (
        <div className="flex gap-2 pt-2">
          {step > 1 && (
            <Button
              variant="outline"
              onClick={goBack}
              className="h-12 flex-1 rounded-2xl"
            >
              이전
            </Button>
          )}
          <Button
            onClick={goNext}
            disabled={(step === 1 && !step1Valid) || (step === 4 && !step4Valid)}
            className="h-12 flex-[2] rounded-2xl bg-neutral-900 text-base font-semibold text-white hover:bg-neutral-800"
          >
            다음
          </Button>
        </div>
      )}
    </div>
  );
}

function RadioCards({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string; desc: string }[];
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={cn(
              "flex w-full items-center justify-between rounded-2xl border bg-white p-4 text-left transition-colors",
              active
                ? "border-neutral-900 ring-1 ring-neutral-900"
                : "border-neutral-100",
            )}
          >
            <div>
              <p className="text-sm font-semibold text-neutral-900">{o.label}</p>
              <p className="mt-0.5 text-xs text-neutral-500">{o.desc}</p>
            </div>
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full border",
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
