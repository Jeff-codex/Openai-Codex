import {
  d1Execute,
  d1Query,
  getRequestClientIp,
  hashPassword,
  jsonError,
  jsonOk,
  parseJson,
  sanitizePlainText,
  writeSecurityAudit,
} from "../_lib/cloudflare_store.js";
import { requireAdminSession } from "./_auth.js";

export async function onRequestPatch(context) {
  try {
    const adminSession = await requireAdminSession(context);
    if (!adminSession) return jsonError("관리자 로그인이 필요합니다.", 401);

    const body = await parseJson(context.request);
    const memberId = sanitizePlainText(body.memberId, 80);
    const nextPassword = String(body.password || "");
    const passwordChanged = nextPassword.length > 0;
    const ip = getRequestClientIp(context.request);

    if (!memberId) return jsonError("회원 ID가 필요합니다.", 400);
    if (passwordChanged && nextPassword.length < 8) {
      return jsonError("비밀번호는 8자 이상이어야 합니다.", 400);
    }
    if (!passwordChanged) {
      return jsonError("새 비밀번호를 입력해 주세요.", 400);
    }

    const rows = await d1Query(
      context.env,
      "select id, login_id, role from members where id = ? limit 1",
      [memberId]
    );
    if (!rows.length) return jsonError("회원을 찾을 수 없습니다.", 404);
    const member = rows[0];
    const now = new Date().toISOString();
    const passwordHash = await hashPassword(nextPassword, context.env);
    await d1Execute(
      context.env,
      "update members set password = ?, updated_at = ? where id = ?",
      [passwordHash, now, memberId]
    );

    await d1Execute(context.env, "insert into admin_logs (message, created_at) values (?, ?)", [
      `회원 정보 수정: ${member.login_id} (${member.role || "member"}) / 비밀번호 변경`,
      now,
    ]);
    await writeSecurityAudit(context.env, {
      eventType: "admin_member_updated",
      actorType: "admin",
      actorId: adminSession.loginId || adminSession.adminId,
      ip,
      outcome: "success",
      detail: `member=${member.login_id};passwordChanged=${passwordChanged ? "1" : "0"}`,
    });

    return jsonOk({
      member: {
        id: memberId,
        loginId: member.login_id,
        passwordChanged: true,
      },
    });
  } catch (error) {
    return jsonError("회원 정보 수정 중 오류가 발생했습니다.", 500);
  }
}
