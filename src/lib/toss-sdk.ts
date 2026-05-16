import { appLogin as sdkAppLogin } from "@apps-in-toss/web-framework";

export interface AppLoginResult {
  /** 10분 유효, 일회성. 서버로 즉시 전송 후 폐기. */
  authorizationCode: string;
  referrer: "DEFAULT" | "SANDBOX";
}

/**
 * Trigger Toss `appLogin` in the WebView mini-app.
 * Throws if the user cancels or the SDK isn't running inside the Toss sandbox.
 *
 * 브라우저 dev 환경 (앱인토스 외부)에서는 SDK가 reject — useSession 훅이
 * 그 케이스를 `status: "unauthenticated"`로 surface해서 앱은 계속 동작.
 */
export async function startLogin(): Promise<AppLoginResult> {
  const result = (await sdkAppLogin()) as AppLoginResult;
  if (!result?.authorizationCode) {
    throw new Error("appLogin returned no authorizationCode");
  }
  return result;
}
