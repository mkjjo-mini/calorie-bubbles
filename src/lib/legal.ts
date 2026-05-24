/**
 * 약관·동의 클라이언트 — react-query 훅 + 타입.
 *
 *  - useLegalDocuments  : 활성 약관 목록 (회원가입·재동의 UI 렌더용)
 *  - useConsentStatus   : 현재 사용자의 동의 상태 (AppShell 가드 핵심)
 *
 * PRD: products/tandanji-bubble/prd/v1-steps/step-18-consent-management.md §8.1
 */
import { useQuery } from "@tanstack/react-query";

export type DocType = "age_14" | "terms" | "privacy" | "marketing";

export interface LegalDocument {
  id: string;
  doc_type: DocType;
  version: string;
  is_required: boolean;
  title: string;
  body_ref: string;
  effective_from?: string;
}

export interface ConsentStatus {
  /** 모든 필수 약관 grant 상태면 true. AppShell 가드의 통과 신호. */
  compliant: boolean;
  /** 미동의 필수 약관 (compliant=false면 사용자에게 동의 요청). */
  missing: LegalDocument[];
  /** 현재 grant 상태인 선택 약관의 doc_type 배열 (예: ['marketing']). */
  granted_optional: DocType[];
  /**
   * 한 번이라도 결정한 선택 약관 doc_type (granted든 withdrawn든).
   * 가입·재동의 흐름에서 마케팅을 다시 물을지 판단 — withdrawn 사용자에겐 반복하지 않음.
   */
  decided_optional: DocType[];
}

export const CONSENT_STATUS_KEY = ["consent-status"] as const;
export const LEGAL_DOCS_KEY = ["legal-documents"] as const;

/**
 * 활성 약관 목록.
 *
 * 비로그인 페이지(/legal/terms 등)에서도 호출 가능 — API는 admin client으로 조회.
 * staleTime 1시간 — 약관 갱신 빈도가 매우 낮으므로 자주 fetch할 이유 없음.
 * 재동의 강제 발동은 user별 consent-status가 책임 (이 캐시는 안전).
 */
export function useLegalDocuments() {
  return useQuery({
    queryKey: LEGAL_DOCS_KEY,
    queryFn: async (): Promise<LegalDocument[]> => {
      const res = await fetch("/api/legal/documents");
      if (!res.ok) throw new Error(`legal/documents ${res.status}`);
      const json = (await res.json()) as { documents: LegalDocument[] };
      return json.documents;
    },
    staleTime: 60 * 60 * 1000,
  });
}

/**
 * 현재 사용자의 동의 상태.
 *
 *  - 401 (미인증) → compliant=true 반환 (인증 가드가 별도로 /auth/login으로 보냄).
 *    consent 가드가 미인증 사용자를 /auth/consent로 보내지 않게 차단.
 *  - 그 외 ok 아니면 throw → 호출처에서 fallback (보수적으로 가드 무력화).
 *
 * staleTime 5분: 가입 직후·재동의 직후 동의 row가 빠르게 반영돼야 하므로
 * 너무 길게 잡지 않음. consent grant mutation 후 호출처가 invalidateQueries로 즉시 갱신.
 */
export function useConsentStatus() {
  return useQuery({
    queryKey: CONSENT_STATUS_KEY,
    queryFn: async (): Promise<ConsentStatus> => {
      const res = await fetch("/api/auth/consent-status", { credentials: "include" });
      if (res.status === 401) {
        return {
          compliant: true,
          missing: [],
          granted_optional: [],
          decided_optional: [],
        };
      }
      if (!res.ok) throw new Error(`consent-status ${res.status}`);
      return (await res.json()) as ConsentStatus;
    },
    staleTime: 5 * 60 * 1000,
    // 401 이외 에러 시에도 가드를 무한 리트라이하지 않게.
    retry: 1,
  });
}

/**
 * body_ref 해석 — inline 문구 매핑.
 *
 * marketing v1은 별도 HTML 없이 inline 안내문으로 동의 받음 (PIPA 권장 요건 충족).
 * terms·privacy는 body_ref='terms/v1.html' / 'privacy/v1.html' → /legal/terms·privacy 라우트.
 */
export const INLINE_BODIES: Record<string, { short: string; detail: string }> = {
  "inline:age_14": {
    short: "만 14세 이상입니다",
    detail:
      "PIPA(개인정보보호법) §22의2에 따라 만 14세 미만은 가입할 수 없어요. 거짓 체크에 대한 책임은 본인에게 있어요.",
  },
  "inline:marketing": {
    short: "마케팅 정보 수신 (이메일·푸시)",
    // PIPA(개인정보보호법)·정보통신망법 §50 표준 6항목 모두 포함:
    //   목적·항목·기간·채널·거부권리·철회방법.
    // 별도 약관 HTML 파일 없이 본 inline 문구로 동의 근거 충족.
    detail:
      "신제품 출시·이벤트·유용한 영양 정보를 이메일과 푸시 알림으로 보내드려요.\n\n" +
      "• 수집·이용 항목: 가입 이메일, 앱 푸시 토큰\n" +
      "• 보유·이용 기간: 회원 탈퇴 또는 동의 철회 시까지\n" +
      "• 수신 채널: 가입 이메일 · 앱 푸시\n" +
      "• 동의하지 않아도 서비스 이용에는 제한이 없으며, 설정 화면에서 언제든 철회할 수 있어요.",
  },
};
