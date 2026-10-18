import {
  d1Query,
  destroySession,
  getSessionToken,
  readSession,
} from "../_lib/cloudflare_store.js";

export async function requireAdminSession(context) {
  const token = getSessionToken(context.request, "admin");
  const session = await readSession(context.env, token, "admin", context.request);
  if (!session?.adminId) return null;
  const rows = await d1Query(
    context.env,
    "select id, login_id, role from members where id = ? limit 1",
    [session.adminId]
  );
  if (!rows.length || String(rows[0].role || "") !== "admin") {
    await destroySession(context.env, token);
    return null;
  }
  return {
    ...session,
    loginId: rows[0].login_id,
  };
}
