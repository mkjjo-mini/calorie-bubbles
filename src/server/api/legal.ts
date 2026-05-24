/**
 * 약관 메타 API — `/api/legal/documents`.
 *
 * 인증 불필요 (회원가입 전·로그아웃 상태에서도 약관 페이지 렌더 위해 조회 가능).
 * RLS 정책상 anon SELECT도 열려있지만, 안정성 위해 admin client으로 조회.
 *
 * PRD: products/tandanji-bubble/prd/v1-steps/step-18-consent-management.md §6.1
 */
import type { Env } from "../auth/env";
import { NO_STORE_JSON_HEADERS } from "../auth/middleware";
import { createAdminSupabase } from "../auth/supabase-server";

export async function handleLegalDocuments(req: Request, env: Env): Promise<Response> {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  let admin;
  try {
    admin = createAdminSupabase(env);
  } catch (e) {
    return new Response(JSON.stringify({ code: "ENV_MISSING", message: (e as Error).message }), {
      status: 500,
      headers: NO_STORE_JSON_HEADERS,
    });
  }

  const { data, error } = await admin
    .from("legal_documents")
    .select("id, doc_type, version, is_required, title, body_ref, effective_from")
    .is("retired_at", null)
    // doc_type별 1개씩만 활성 가정 — 안전망으로 effective_from DESC.
    .order("doc_type", { ascending: true })
    .order("effective_from", { ascending: false });

  if (error) {
    console.error("[api/legal/documents]", error.message);
    return new Response(JSON.stringify({ code: "INTERNAL", message: error.message }), {
      status: 500,
      headers: NO_STORE_JSON_HEADERS,
    });
  }

  return new Response(JSON.stringify({ documents: data ?? [] }), {
    status: 200,
    headers: NO_STORE_JSON_HEADERS,
  });
}
