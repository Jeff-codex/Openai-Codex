import {
  d1Query,
  getSessionToken,
  jsonError,
  jsonOk,
  readSession,
} from "../_lib/cloudflare_store.js";

export async function onRequestGet(context) {
  try {
    const token = getSessionToken(context.request, "member");
    const session = await readSession(context.env, token, "member", context.request);
    if (!session?.memberId) {
      return jsonError("로그인이 필요합니다.", 401);
    }

    const rows = await d1Query(
      context.env,
      "select id, login_id, name, email, company, point_balance, role from members where id = ? limit 1",
      [session.memberId]
    );
    if (!rows.length) {
      return jsonError("회원 정보를 찾을 수 없습니다.", 404);
    }
    const member = rows[0];
    return jsonOk({
      member: {
        id: member.id,
        loginId: member.login_id,
        name: member.name,
        email: member.email,
        company: member.company,
        pointBalance: Number(member.point_balance || 0),
        role: member.role || "member",
      },
    });
  } catch (error) {
    return jsonError("회원 조회 중 오류가 발생했습니다.", 500);
  }
}
