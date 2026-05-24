/**
 * 동의 관리 API — `/api/auth/consent-status` · `/api/auth/consent`.
 *
 *  - GET  /api/auth/consent-status : 현재 사용자의 동의 상태 (AppShell 가드 핵심)
 *  - POST /api/auth/consent        : 동의 일괄 기록 (signup·reconfirm·settings)
 *  - POST /api/auth/consent/withdraw : 마케팅 등 선택 약관만 철회 (P0 범위 — 필수는 탈퇴로)
 *
 * 모두 인증 필요(withUser). admin client으로 RLS 우회 + 코드가 user_id WHERE 강제.
 *
 * PRD: products/tandanji-bubble/prd/v1-steps/step-18-consent-management.md §6, §8.3
 */
import type { Env } from "../auth/env";
import { jsonError, NO_STORE_JSON_HEADERS, withUser } from "../auth/middleware";

interface LegalDocRow {
  id: string;
  doc_type: string;
  version: string;
  is_required: boolean;
  title: string;
  body_ref: string;
}

interface CurrentConsentRow {
  document_id: string;
  action: "granted" | "withdrawn";
}

/**
 * 활성 약관 + 현재 사용자 consent 매칭 → compliant·missing·granted_optional 계산.
 * 공통 로직 — handleConsentStatus 와 callback 가드 양쪽에서 재사용.
 */
export interface ComplianceResult {
  compliant: boolean;
  missing: LegalDocRow[];
  grantedOptional: string[];
  /**
   * 선택 약관 중 사용자가 이미 한 번이라도 결정한 doc_type(granted든 withdrawn든).
   * 재동의·신규 가입 흐름에서 마케팅 등을 다시 물을지 판단할 때 사용.
   * "결정 미정"인 doc_type만 UI에 노출 → 거절한 사용자에게 반복해 묻지 않음.
   */
  decidedOptional: string[];
}

export async function evaluateCompliance(
  admin: ReturnType<typeof import("../auth/supabase-server").createAdminSupabase>,
  userId: string,
): Promise<ComplianceResult | { error: string }> {
  const { data: docs, error: docErr } = await admin
    .from("legal_documents")
    .select("id, doc_type, version, is_required, title, body_ref")
    .is("retired_at", null);
  if (docErr) return { error: docErr.message };
  if (!docs) return { error: "no documents" };

  const { data: consents, error: consentErr } = await admin
    .from("user_current_consents")
    .select("document_id, action")
    .eq("user_id", userId);
  if (consentErr) return { error: consentErr.message };

  const grantedSet = new Set(
    (consents ?? [])
      .filter((c: CurrentConsentRow) => c.action === "granted")
      .map((c: CurrentConsentRow) => c.document_id),
  );
  // 결정 이력 — granted든 withdrawn든 view에 row가 있으면 "결정됨".
  const decidedSet = new Set(
    (consents ?? []).map((c: CurrentConsentRow) => c.document_id),
  );

  const required = docs.filter((d: LegalDocRow) => d.is_required);
  const missing = required.filter((d: LegalDocRow) => !grantedSet.has(d.id));
  const grantedOptional = docs
    .filter((d: LegalDocRow) => !d.is_required && grantedSet.has(d.id))
    .map((d: LegalDocRow) => d.doc_type);
  const decidedOptional = docs
    .filter((d: LegalDocRow) => !d.is_required && decidedSet.has(d.id))
    .map((d: LegalDocRow) => d.doc_type);

  return {
    compliant: missing.length === 0,
    missing,
    grantedOptional,
    decidedOptional,
  };
}

export async function handleConsentStatus(req: Request, env: Env): Promise<Response> {
  return withUser(req, env, async ({ userId, admin }) => {
    if (req.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const result = await evaluateCompliance(admin, userId);
    if ("error" in result) {
      return jsonError(500, "INTERNAL", result.error);
    }
    return new Response(
      JSON.stringify({
        compliant: result.compliant,
        missing: result.missing,
        granted_optional: result.grantedOptional,
        decided_optional: result.decidedOptional,
      }),
      { status: 200, headers: NO_STORE_JSON_HEADERS },
    );
  });
}

const VALID_SOURCES = new Set(["signup", "reconfirm", "settings"]);

export async function handleConsentGrant(req: Request, env: Env): Promise<Response> {
  return withUser(req, env, async ({ userId, admin }) => {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let body: { document_ids?: unknown; source?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return jsonError(400, "INVALID_BODY", "JSON 파싱 실패");
    }

    const docIds = Array.isArray(body.document_ids)
      ? body.document_ids.filter((v): v is string => typeof v === "string")
      : [];
    if (docIds.length === 0) {
      return jsonError(400, "INVALID_BODY", "document_ids 필요");
    }
    const source = typeof body.source === "string" ? body.source : "signup";
    if (!VALID_SOURCES.has(source)) {
      return jsonError(400, "INVALID_BODY", "invalid source");
    }

    // 검증 — 요청된 doc_ids가 (a) 실제 존재 (b) 활성(retired_at IS NULL)
    // 활성이 아닌 약관 동의는 거부 → 클라가 stale doc id로 요청한 경우 탐지.
    const { data: validDocs, error: docErr } = await admin
      .from("legal_documents")
      .select("id")
      .in("id", docIds)
      .is("retired_at", null);
    if (docErr) return jsonError(500, "INTERNAL", docErr.message);
    if (!validDocs || validDocs.length !== docIds.length) {
      return jsonError(400, "INVALID_DOCUMENTS", "존재하지 않거나 retired된 약관 포함");
    }

    const ip = req.headers.get("cf-connecting-ip") ?? null;
    const ua = req.headers.get("user-agent") ?? null;

    const { error: rpcErr } = await admin.rpc("grant_consents", {
      p_user_id: userId,
      p_document_ids: docIds,
      p_source: source,
      p_ip: ip,
      p_user_agent: ua,
    });
    if (rpcErr) {
      console.error("[api/auth/consent] grant_consents", rpcErr.message);
      return jsonError(500, "INTERNAL", rpcErr.message);
    }

    return new Response(null, { status: 204 });
  });
}

/**
 * 동의 철회 — v1 P0에선 마케팅 등 **선택 약관만 허용**.
 * 필수 약관(is_required=true) 철회 시도 → 400 + 탈퇴 안내.
 *
 * 동작: 'withdrawn' action row INSERT (append-only). 다음 user_current_consents
 * 조회 시 최신 row가 'withdrawn'이므로 granted_optional에서 자동 제외됨.
 */
export async function handleConsentWithdraw(req: Request, env: Env): Promise<Response> {
  return withUser(req, env, async ({ userId, admin }) => {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let body: { document_id?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return jsonError(400, "INVALID_BODY", "JSON 파싱 실패");
    }
    const docId = typeof body.document_id === "string" ? body.document_id : null;
    if (!docId) return jsonError(400, "INVALID_BODY", "document_id 필요");

    const { data: doc, error: docErr } = await admin
      .from("legal_documents")
      .select("id, is_required")
      .eq("id", docId)
      .is("retired_at", null)
      .maybeSingle();
    if (docErr) return jsonError(500, "INTERNAL", docErr.message);
    if (!doc) return jsonError(404, "NOT_FOUND", "약관을 찾을 수 없어요");
    if (doc.is_required) {
      return jsonError(
        400,
        "REQUIRED_DOCUMENT",
        "필수 약관은 단독 철회할 수 없어요. 탈퇴를 통해 처리해주세요.",
      );
    }

    const ip = req.headers.get("cf-connecting-ip") ?? null;
    const ua = req.headers.get("user-agent") ?? null;

    const { error: insertErr } = await admin.from("user_consents").insert({
      user_id: userId,
      document_id: docId,
      action: "withdrawn",
      source: "settings",
      ip_address: ip,
      user_agent: ua,
    });
    if (insertErr) {
      console.error("[api/auth/consent/withdraw]", insertErr.message);
      return jsonError(500, "INTERNAL", insertErr.message);
    }

    return new Response(null, { status: 204 });
  });
}
