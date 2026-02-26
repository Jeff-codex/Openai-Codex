import {
  appendClearSessionCookie,
  appendSessionCookie,
  createSession,
  d1Execute,
  d1Query,
  getRequestClientIp,
  hashPassword,
  jsonError,
  jsonOk,
  kvDelete,
  kvGet,
  kvPut,
  normalizeLoginId,
  parseJson,
  verifyPassword,
  writeSecurityAudit,
} from "../_lib/cloudflare_store.js";

const LOGIN_FAIL_TTL_SEC = 60 * 15;
const LOGIN_FAIL_LIMIT = 8;
const LOGIN_ID_PATTERN = /^[a-z0-9_]{3,20}$/;

function getFailKey(loginId, ip) {
  const safeLogin = String(loginId || "unknown");
  const safeIp = String(ip || "unknown");
  return `authfail:member:${safeLogin}:${safeIp}`;
}

export async function onRequestPost(context) {
  try {
    const body = await parseJson(context.request);
    const loginId = normalizeLoginId(body.loginId);
    const password = String(body.password || "");
    const ip = getRequestClientIp(context.request);
    const failKey = getFailKey(loginId, ip);

    if (!loginId || !password) {
      return jsonError("아이디와 비밀번호를 입력해 주세요.", 400);
    }
    if (!LOGIN_ID_PATTERN.test(loginId)) {
      return jsonError("아이디 또는 비밀번호가 올바르지 않습니다.", 401);
    }

    const failCount = Number((await kvGet(context.env, failKey)) || 0);
    if (failCount >= LOGIN_FAIL_LIMIT) {
      await writeSecurityAudit(context.env, {
        eventType: "member_login_blocked",
        actorType: "member",
        actorId: loginId,
        ip,
        outcome: "blocked",
        detail: "too_many_attempts",
      });
      return jsonError("로그인 시도 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
    }

    const rows = await d1Query(
      context.env,
      "select id, login_id, name, email, company, role, password from members where login_id = ? limit 1",
      [loginId]
    );
    if (!rows.length) {
      await kvPut(context.env, failKey, String(failCount + 1), LOGIN_FAIL_TTL_SEC);
      await writeSecurityAudit(context.env, {
        eventType: "member_login_failed",
        actorType: "member",
        actorId: loginId,
        ip,
        outcome: "failed",
        detail: "account_not_found",
      });
      return jsonError("아이디 또는 비밀번호가 올바르지 않습니다.", 401);
    }
    const member = rows[0];
    const verified = await verifyPassword(password, member.password, context.env);
    if (!verified.ok) {
      await kvPut(context.env, failKey, String(failCount + 1), LOGIN_FAIL_TTL_SEC);
      await writeSecurityAudit(context.env, {
        eventType: "member_login_failed",
        actorType: "member",
        actorId: loginId,
        ip,
        outcome: "failed",
        detail: "wrong_password",
      });
      return jsonError("아이디 또는 비밀번호가 올바르지 않습니다.", 401);
    }

    await kvDelete(context.env, failKey);
    if (verified.needsRehash) {
      const nextHash = await hashPassword(password, context.env);
      await d1Execute(context.env, "update members set password = ?, updated_at = ? where id = ?", [
        nextHash,
        new Date().toISOString(),
        member.id,
      ]);
    }

    const token = await createSession(context.env, "member", {
      memberId: member.id,
      loginId: member.login_id,
      email: member.email,
      role: member.role || "member",
    }, context.request);

    const headers = new Headers();
    appendSessionCookie(headers, "member", token, context.env.MEMBER_SESSION_TTL_SEC);
    appendClearSessionCookie(headers, "admin");
    await writeSecurityAudit(context.env, {
      eventType: "member_login_success",
      actorType: "member",
      actorId: member.login_id,
      ip,
      outcome: "success",
      detail: "authenticated",
    });

    return jsonOk({
      token,
      member: {
        id: member.id,
        loginId: member.login_id,
        name: member.name,
        email: member.email,
        company: member.company,
        role: member.role || "member",
      },
    }, 200, headers);
  } catch (error) {
    return jsonError("로그인 처리 중 오류가 발생했습니다.", 500);
  }
}
