import type { Env } from "./env";
import { resolveSession } from "./session";

export async function handleMe(req: Request, env: Env): Promise<Response> {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const session = await resolveSession(req, env);
  if (!session) {
    return new Response(
      JSON.stringify({ code: "SESSION_EXPIRED", message: "no valid session" }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(JSON.stringify({ userKey: session.userKey }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
