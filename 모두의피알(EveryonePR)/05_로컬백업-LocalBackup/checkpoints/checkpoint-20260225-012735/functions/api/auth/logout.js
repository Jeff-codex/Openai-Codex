import {
  appendClearSessionCookie,
  destroySession,
  getSessionToken,
  jsonOk,
  writeSecurityAudit,
  getRequestClientIp,
} from "../_lib/cloudflare_store.js";

export async function onRequestPost(context) {
  const token = getSessionToken(context.request, "member");
  const ip = getRequestClientIp(context.request);
  if (token) {
    await destroySession(context.env, token);
    await writeSecurityAudit(context.env, {
      eventType: "member_logout",
      actorType: "member",
      actorId: "",
      ip,
      outcome: "success",
      detail: "session_destroyed",
    });
  }
  const headers = new Headers();
  appendClearSessionCookie(headers, "member");
  appendClearSessionCookie(headers, "admin");
  return jsonOk({ loggedOut: true }, 200, headers);
}
