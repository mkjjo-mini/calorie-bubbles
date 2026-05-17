import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { cloudRepository } from "@/lib/repository/cloud";
import { CloudAuthError } from "@/lib/repository/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings/profile")({
  component: ProfilePage,
});

type Sex = "male" | "female";
type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
type GoalKey = "loss" | "maintain" | "gain";

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: "sedentary", label: "거의 운동 X" },
  { value: "light", label: "가벼운 운동" },
  { value: "moderate", label: "보통 운동" },
  { value: "active", label: "활발한 운동" },
  { value: "very_active", label: "매우 활발" },
];

const GOAL_OPTIONS: { value: GoalKey; label: string }[] = [
  { value: "loss", label: "체중 감량" },
  { value: "maintain", label: "유지" },
  { value: "gain", label: "체중 증량" },
];

const profileSchema = z
  .object({
    height_cm: z.number().min(50, "키는 50cm 이상이어야 해요").max(250, "키는 250cm 이하이어야 해요"),
    weight_kg: z.number().min(20, "몸무게는 20kg 이상이어야 해요").max(300, "몸무게는 300kg 이하이어야 해요"),
    sex: z.enum(["male", "female"] as const),
    birth_year: z
      .number()
      .int()
      .min(1900, "출생연도는 1900년 이후여야 해요")
      .max(new Date().getFullYear() - 5, `출생연도는 ${new Date().getFullYear() - 5}년 이하여야 해요`),
    activity_level: z
      .enum(["sedentary", "light", "moderate", "active", "very_active"] as const)
      .default("light"),
    goal: z.enum(["loss", "maintain", "gain"] as const).default("maintain"),
    target_weight_kg: z.number().min(20).max(300).nullable().optional(),
    target_period_weeks: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (p) =>
      p.goal === "maintain" ||
      (p.target_weight_kg != null && p.target_period_weeks != null),
    { message: "감량/증량 선택 시 목표체중·기간(주) 필수" },
  );

function ReqStar() {
  return <span className="text-[#EF4444] ml-0.5">★</span>;
}

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
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
            value === opt.value
              ? "bg-neutral-900 text-white"
              : "bg-white text-neutral-600",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ProfilePage() {
  const navigate = useNavigate();

  const [height, setHeight] = React.useState("");
  const [weight, setWeight] = React.useState("");
  const [sex, setSex] = React.useState<Sex>("male");
  const [birthYear, setBirthYear] = React.useState("");
  const [activity, setActivity] = React.useState<ActivityLevel>("light");
  const [goal, setGoal] = React.useState<GoalKey>("maintain");
  const [targetWeight, setTargetWeight] = React.useState("");
  const [targetWeeks, setTargetWeeks] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    cloudRepository.userProfile
      .get()
      .then((row) => {
        if (!alive || !row) return;
        setHeight(String(row.height_cm));
        setWeight(String(row.weight_kg));
        setSex(row.sex);
        setBirthYear(String(row.birth_year));
        setActivity(row.activity_level);
        setGoal(row.goal);
        if (row.target_weight_kg != null)
          setTargetWeight(String(row.target_weight_kg));
        if (row.target_period_weeks != null)
          setTargetWeeks(String(row.target_period_weeks));
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof CloudAuthError) toast.error("로그인이 필요해요");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function handleSave() {
    const raw = {
      height_cm: Number(height),
      weight_kg: Number(weight),
      sex,
      birth_year: Number(birthYear),
      activity_level: activity,
      goal,
      target_weight_kg:
        goal !== "maintain" && targetWeight ? Number(targetWeight) : null,
      target_period_weeks:
        goal !== "maintain" && targetWeeks ? Number(targetWeeks) : null,
    };

    const result = profileSchema.safeParse(raw);
    if (!result.success) {
      toast.error(result.error.errors[0]?.message ?? "입력값을 확인해주세요");
      return;
    }

    setSaving(true);
    try {
      await cloudRepository.userProfile.put({
        height_cm: result.data.height_cm,
        weight_kg: result.data.weight_kg,
        sex: result.data.sex,
        birth_year: result.data.birth_year,
        activity_level: result.data.activity_level,
        goal: result.data.goal,
        target_weight_kg: result.data.target_weight_kg ?? null,
        target_period_weeks: result.data.target_period_weeks ?? null,
      });
      toast.success("프로필이 저장되었어요");
      navigate({ to: "/settings" });
    } catch (e) {
      if (e instanceof CloudAuthError) {
        toast.error("로그인이 필요해요");
      } else {
        toast.error("저장에 실패했어요");
      }
    } finally {
      setSaving(false);
    }
  }

  const age = birthYear ? new Date().getFullYear() - Number(birthYear) : null;

  return (
    <div className="min-h-screen w-full bg-white flex justify-center">
      <main className="w-full max-w-[390px] flex flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-neutral-100 bg-white/95 px-4 py-3 backdrop-blur">
          <button
            type="button"
            aria-label="뒤로"
            onClick={() => navigate({ to: "/settings" })}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 active:bg-neutral-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-semibold text-neutral-900">프로필 관리</h1>
        </header>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-neutral-400">
            불러오는 중…
          </div>
        ) : (
          <div className="flex-1 px-4 pt-4 pb-12 space-y-4">
            <div className="rounded-2xl border border-neutral-100 bg-white p-4 space-y-4">
              {/* 키 */}
              <div>
                <FieldLabel required>키 (cm)</FieldLabel>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="170"
                />
              </div>

              {/* 몸무게 */}
              <div>
                <FieldLabel required>몸무게 (kg)</FieldLabel>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="65"
                />
              </div>

              {/* 성별 */}
              <div>
                <FieldLabel required>성별</FieldLabel>
                <SegmentedControl
                  options={[
                    { value: "male" as Sex, label: "남성" },
                    { value: "female" as Sex, label: "여성" },
                  ]}
                  value={sex}
                  onChange={setSex}
                />
              </div>

              {/* 출생연도 */}
              <div>
                <FieldLabel required>출생연도</FieldLabel>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  placeholder="1990"
                />
                <p className="text-[11px] text-neutral-400 mt-1">
                  만 나이는 자동 계산됩니다
                  {age != null && age > 0 ? ` · 만 ${age}세` : ""}
                </p>
              </div>

              {/* 활동량 */}
              <div>
                <FieldLabel>활동량</FieldLabel>
                <select
                  value={activity}
                  onChange={(e) => setActivity(e.target.value as ActivityLevel)}
                  className="w-full h-10 px-3 rounded-xl border border-neutral-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-300"
                >
                  {ACTIVITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 다이어트 목표 */}
              <div>
                <FieldLabel>다이어트 목표</FieldLabel>
                <SegmentedControl
                  options={GOAL_OPTIONS}
                  value={goal}
                  onChange={(v) => {
                    setGoal(v);
                    if (v === "maintain") {
                      setTargetWeight("");
                      setTargetWeeks("");
                    }
                  }}
                />
              </div>

              {/* 목표체중·기간 — 감/증 시만 */}
              {goal !== "maintain" && (
                <>
                  <div>
                    <FieldLabel required>목표 체중 (kg)</FieldLabel>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={targetWeight}
                      onChange={(e) => setTargetWeight(e.target.value)}
                      placeholder="60"
                    />
                    {Number(targetWeight) > 0 && Number(targetWeight) < 30 && (
                      <p className="mt-1 text-xs text-red-500">
                        목표 체중은 30kg 이상이어야 해요
                      </p>
                    )}
                    {Number(targetWeight) > 250 && (
                      <p className="mt-1 text-xs text-red-500">
                        목표 체중은 250kg 이하로 입력해주세요
                      </p>
                    )}
                    {Number(targetWeight) >= 30 &&
                      Number(targetWeight) <= 250 &&
                      Number(weight) > 0 && (
                        <>
                          {goal === "loss" &&
                            Number(targetWeight) >= Number(weight) && (
                              <p className="mt-1 text-xs text-red-500">
                                감량 목표는 현재 체중보다 낮아야 해요
                              </p>
                            )}
                          {goal === "gain" &&
                            Number(targetWeight) <= Number(weight) && (
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
                      value={targetWeeks}
                      onChange={(e) => setTargetWeeks(e.target.value)}
                      placeholder="12"
                    />
                    {Number(targetWeeks) > 0 && Number(targetWeeks) <= 104 && (
                      <p className="mt-1 text-xs text-neutral-400">
                        약 {(Number(targetWeeks) / 4.345).toFixed(1)}개월
                      </p>
                    )}
                    {Number(targetWeeks) > 104 && (
                      <p className="mt-1 text-xs text-red-500">
                        기간은 104주(2년) 이하로 입력해주세요
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {(() => {
              const targetValid =
                goal === "maintain" ||
                (Number(targetWeight) >= 30 &&
                  Number(targetWeight) <= 250 &&
                  Number(targetWeeks) > 0 &&
                  Number(targetWeeks) <= 104 &&
                  (goal === "loss"
                    ? Number(targetWeight) < Number(weight)
                    : Number(targetWeight) > Number(weight)));
              return (
                <Button
                  onClick={handleSave}
                  disabled={saving || !targetValid}
                  className="h-12 w-full rounded-2xl bg-neutral-900 text-base font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  {saving ? "저장 중…" : "저장"}
                </Button>
              );
            })()}
          </div>
        )}
      </main>
    </div>
  );
}
