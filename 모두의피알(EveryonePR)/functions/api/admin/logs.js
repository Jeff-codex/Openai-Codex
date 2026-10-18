import {
  d1Execute,
  d1Query,
  getRequestClientIp,
  jsonError,
  jsonOk,
  parseJson,
  writeSecurityAudit,
} from "../_lib/cloudflare_store.js";
import { requireAdminSession } from "./_auth.js";

export async function onRequestDelete(context) {
  try {
    const adminSession = await requireAdminSession(context);
    if (!adminSession) return jsonError("관리자 로그인이 필요합니다.", 401);

    const body = await parseJson(context.request).catch(() => ({}));
    const scope = String(body?.scope || "admin_logs").trim().toLowerCase();
    if (scope !== "admin_logs") return jsonError("지원하지 않는 로그 정리 요청입니다.", 400);

    const rows = await d1Query(context.env, "select count(*) as total from admin_logs");
    const beforeCount = Number(rows?.[0]?.total || 0);
    await d1Execute(context.env, "delete from admin_logs");

    await writeSecurityAudit(context.env, {
      eventType: "admin_logs_cleared",
      actorType: "admin",
      actorId: adminSession.loginId || adminSession.adminId,
      ip: getRequestClientIp(context.request),
      outcome: "success",
      detail: `deleted=${beforeCount}`,
    });

    return jsonOk({ deleted: beforeCount });
  } catch (error) {
    return jsonError("운영 로그 정리 중 오류가 발생했습니다.", 500);
  }
}
