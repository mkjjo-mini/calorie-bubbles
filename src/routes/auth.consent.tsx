/**
 * /auth/consent — 약관 동의 페이지.
 *
 *  - 신규 가입 (소셜 callback에서 redirect됨)
 *  - 기존 사용자 재동의 (약관 갱신 후 AppShell이 catch → redirect)
 *
 * 두 시나리오를 같은 페이지가 처리. consent-status.missing에 따라 필수 doc만 노출.
 * 마케팅(선택)은 아직 grant 안 됐을 때만 표시 → 한 번 거부한 사용자에게 매번
 * 다시 물어보지 않음 (재동의 흐름에서도 마케팅은 새로 v2 issue되지 않는 한 자동 통과).
 *
 * PRD: products/tandanji-bubble/prd/v1-steps/step-18-consent-management.md §7, §8.6
 */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import { z } from "zod";
import {
  CONSENT_STATUS_KEY,
  INLINE_BODIES,
  type LegalDocument,
  useConsentStatus,
  useLegalDocuments,
} from "@/lib/legal";
import { useSession } from "@/hooks/useSession";

const searchSchema = z.object({
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth/consent")({
  validateSearch: searchSchema,
  component: ConsentPage,
});

const DOC_ORDER: Record<string, number> = {
  age_14: 0,
  terms: 1,
  privacy: 2,
  marketing: 3,
};

function sortDocs(docs: LegalDocument[]): LegalDocument[] {
  return [...docs].sort((a, b) => (DOC_ORDER[a.doc_type] ?? 99) - (DOC_ORDER[b.doc_type] ?? 99));
}

function ConsentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = useSearch({ from: "/auth/consent" });
  const { status: sessionStatus } = useSession();
  const { data: allDocs, isLoading: docsLoading } = useLegalDocuments();
  const { data: consent, isLoading: consentLoading } = useConsentStatus();

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [marketingExpanded, setMarketingExpanded] = useState(false);
  const [age14Expanded, setAge14Expanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // signup 페이지가 sessionStorage에 저장한 마케팅 의사 — OAuth/이메일 confirm 후
  // 이 페이지에 도착했을 때 한 번 더 묻지 않도록 자동 pre-check.
  const [marketingIntent] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem("signup_marketing_intent") === "1";
    } catch {
      return false;
    }
  });

  // 미인증 사용자가 직접 진입 → /auth/login으로.
  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      navigate({ to: "/auth/login", replace: true });
    }
  }, [sessionStatus, navigate]);

  // 이미 compliant인데 들어왔다면 → 그냥 next로.
  // (재동의 흐름에서 사용자가 동의 완료 후 자동 redirect되는 자연스러운 흐름.)
  useEffect(() => {
    if (consent?.compliant) {
      navigate({ to: search.next ?? "/", replace: true });
    }
  }, [consent?.compliant, navigate, search.next]);

  // 표시할 필수 doc — consent-status.missing이 단일 진실 원천.
  const requiredToShow = useMemo(() => {
    if (!consent) return [];
    return sortDocs(consent.missing);
  }, [consent]);

  // 마케팅 (선택) — 사용자가 한 번도 결정하지 않은 경우에만 노출.
  // granted든 withdrawn든 이전에 결정 이력이 있으면 다시 묻지 않음 (UX 일관성).
  const marketingDoc = useMemo(() => {
    if (!allDocs || !consent) return null;
    const m = allDocs.find((d) => d.doc_type === "marketing" && !d.is_required);
    if (!m) return null;
    if (consent.decided_optional.includes("marketing")) return null;
    return m;
  }, [allDocs, consent]);

  // signup 페이지에서 체크한 마케팅 의사 복원 — marketingDoc id가 확정되는 시점에 한 번.
  useEffect(() => {
    if (marketingDoc && marketingIntent && checked[marketingDoc.id] === undefined) {
      setChecked((s) => ({ ...s, [marketingDoc.id]: true }));
    }
  }, [marketingDoc, marketingIntent, checked]);

  const allRequiredChecked = requiredToShow.every((d) => checked[d.id]);

  const isReconsent =
    (consent?.missing.length ?? 0) > 0 &&
    consent !== undefined &&
    // missing이 있고 다른 doc은 이미 동의된 상태 — granted_optional이나 history가 있으면 재동의.
    // 간단 휴리스틱: missing이 전체 필수 doc보다 적으면 재동의로 간주.
    (allDocs ? consent.missing.length < allDocs.filter((d) => d.is_required).length : false);

  function toggleAll(v: boolean) {
    const next: Record<string, boolean> = {};
    requiredToShow.forEach((d) => {
      next[d.id] = v;
    });
    if (marketingDoc) next[marketingDoc.id] = v;
    setChecked(next);
  }

  async function onSubmit() {
    if (submitting) return;
    if (!allRequiredChecked) {
      setErr("필수 동의 항목을 모두 체크해주세요.");
      return;
    }
    setErr(null);
    setSubmitting(true);
    try {
      const docIds = [
        ...requiredToShow.map((d) => d.id),
        ...(marketingDoc && checked[marketingDoc.id] ? [marketingDoc.id] : []),
      ];
      const res = await fetch("/api/auth/consent", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          document_ids: docIds,
          source: isReconsent ? "reconfirm" : "signup",
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setErr(`동의 저장 실패 (${res.status}). ${text}`);
        return;
      }
      // 1회용 마케팅 의사 — 동의 기록 후 즉시 정리.
      try {
        sessionStorage.removeItem("signup_marketing_intent");
      } catch {
        // 무시.
      }
      // consent-status 캐시 무효화 → AppShell이 즉시 compliant=true 재인식.
      await queryClient.invalidateQueries({ queryKey: CONSENT_STATUS_KEY });
      navigate({ to: search.next ?? "/", replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "동의 저장 실패");
    } finally {
      setSubmitting(false);
    }
  }

  if (sessionStatus === "loading" || docsLoading || consentLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  // missing이 비었으면 useEffect가 next로 보낼 예정 — 짧게 로더.
  if (requiredToShow.length === 0 && !marketingDoc) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-white flex justify-center px-5 pt-16 pb-10">
      <main className="w-full max-w-[375px] flex flex-col">
        <h1 className="text-2xl font-bold text-neutral-900 leading-tight">
          {isReconsent ? "약관이 업데이트됐어요" : "안전한 서비스 이용을 위해\n약관에 동의해주세요"}
        </h1>
        <p className="mt-2 text-sm text-neutral-500 whitespace-pre-line">
          {isReconsent
            ? "변경된 내용을 확인하고 동의해주세요."
            : "필수 항목에 모두 동의하시면 서비스를 이용할 수 있어요."}
        </p>

        <div className="mt-8 rounded-xl border border-neutral-100 bg-neutral-50/60 p-4">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allRequiredChecked && (marketingDoc ? !!checked[marketingDoc.id] : true)}
              onChange={(e) => toggleAll(e.target.checked)}
              className="h-4 w-4 rounded accent-neutral-900"
            />
            <span className="text-sm font-semibold text-neutral-900">전체 동의</span>
          </label>

          <div className="my-3 h-px bg-neutral-200/70" />

          <div className="space-y-3">
            {requiredToShow.map((doc) => (
              <RequiredItem
                key={doc.id}
                doc={doc}
                checked={!!checked[doc.id]}
                onChange={(v) => setChecked((s) => ({ ...s, [doc.id]: v }))}
                age14Expanded={age14Expanded}
                setAge14Expanded={setAge14Expanded}
              />
            ))}

            {marketingDoc && (
              <OptionalMarketingItem
                doc={marketingDoc}
                checked={!!checked[marketingDoc.id]}
                onChange={(v) => setChecked((s) => ({ ...s, [marketingDoc.id]: v }))}
                expanded={marketingExpanded}
                setExpanded={setMarketingExpanded}
              />
            )}
          </div>
        </div>

        {err && <p className="mt-3 text-xs text-red-600">{err}</p>}

        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={submitting || !allRequiredChecked}
          className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-neutral-900 text-sm font-semibold text-white disabled:opacity-40 active:bg-neutral-800"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          동의 후 계속
        </button>

        <p className="mt-3 text-[11px] text-neutral-400 text-center">
          동의하지 않으면 서비스를 이용할 수 없어요.
        </p>
      </main>
    </div>
  );
}

function RequiredItem({
  doc,
  checked,
  onChange,
  age14Expanded,
  setAge14Expanded,
}: {
  doc: LegalDocument;
  checked: boolean;
  onChange: (v: boolean) => void;
  age14Expanded: boolean;
  setAge14Expanded: (v: boolean) => void;
}) {
  const inline = INLINE_BODIES[doc.body_ref];
  const isInline = doc.body_ref.startsWith("inline:");
  const externalHref =
    doc.doc_type === "terms"
      ? "/legal/terms"
      : doc.doc_type === "privacy"
        ? "/legal/privacy"
        : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded accent-neutral-900"
          />
          <span className="text-xs text-neutral-700">
            <span className="font-semibold text-neutral-900">[필수]</span> {doc.title}
          </span>
        </label>
        {externalHref && (
          <Link
            to={externalHref}
            target="_blank"
            rel="noopener"
            className="text-[11px] text-neutral-500 underline underline-offset-2"
          >
            보기
          </Link>
        )}
        {isInline && doc.doc_type === "age_14" && (
          <button
            type="button"
            onClick={() => setAge14Expanded(!age14Expanded)}
            className="text-[11px] text-neutral-500 inline-flex items-center gap-0.5"
            aria-label="자세히"
          >
            자세히
            <ChevronDown
              className={`h-3 w-3 transition-transform ${age14Expanded ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>
      {isInline && doc.doc_type === "age_14" && age14Expanded && inline && (
        <p className="mt-2 ml-7 text-[11px] leading-relaxed text-neutral-500 whitespace-pre-line">
          {inline.detail}
        </p>
      )}
    </div>
  );
}

function OptionalMarketingItem({
  doc,
  checked,
  onChange,
  expanded,
  setExpanded,
}: {
  doc: LegalDocument;
  checked: boolean;
  onChange: (v: boolean) => void;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
}) {
  const inline = INLINE_BODIES[doc.body_ref];
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded accent-neutral-900"
          />
          <span className="text-xs text-neutral-700">
            <span className="font-medium text-neutral-500">[선택]</span> {doc.title}
          </span>
        </label>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-neutral-500 inline-flex items-center gap-0.5"
          aria-label="자세히"
        >
          자세히
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>
      {expanded && inline && (
        <p className="mt-2 ml-7 text-[11px] leading-relaxed text-neutral-500 whitespace-pre-line">
          {inline.detail}
        </p>
      )}
    </div>
  );
}
