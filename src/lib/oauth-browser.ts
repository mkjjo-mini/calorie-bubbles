import { Browser } from "@capacitor/browser";
import { getBrowserSupabase } from "./supabase-browser";

const SCHEME = "app.tandanjibubble";

/**
 * Kakao/Google OAuth를 SFSafariViewController로 열기.
 * redirectTo를 커스텀 URL 스킴으로 설정 → 인증 완료 시 iOS가 앱을 열고
 * SFSafariViewController가 자동으로 닫힘.
 */
export async function openOAuthWithBrowser(
  provider: "google" | "kakao" | "apple",
  next: string,
): Promise<void> {
  const supabase = getBrowserSupabase();
  const redirectTo = `${SCHEME}://auth/callback?next=${encodeURIComponent(next)}`;
  const scopes =
    provider === "kakao" ? "account_email" :
    provider === "apple" ? "email name" :
    undefined;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, scopes, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (data?.url) {
    await Browser.open({ url: data.url });
  }
}

export type OAuthDeepLink =
  | { type: "oauth_callback"; code: string; next: string }
  | { type: "other" };

/**
 * appUrlOpen 이벤트로 받은 URL을 파싱.
 * app.tandanjibubble://auth/callback?code=XXX&next=/
 */
export function parseDeepLink(url: string): OAuthDeepLink {
  if (!url.startsWith(`${SCHEME}://auth/callback`)) return { type: "other" };
  // URL 파서가 커스텀 스킴을 거부할 수 있어 https로 치환
  const parsed = new URL(url.replace(`${SCHEME}://`, "https://placeholder/"));
  const code = parsed.searchParams.get("code") ?? "";
  const next = parsed.searchParams.get("next") ?? "/";
  if (!code) return { type: "other" };
  return { type: "oauth_callback", code, next };
}
