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
  normalizeEmail,
  normalizeLoginId,
  parseJson,
  sanitizePlainText,
  writeSecurityAudit,
} from "../_lib/cloudflare_store.js";

const LOGIN_ID_PATTERN = /^[a-z0-9_]{3,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost(context) {
  try {
    const body = await parseJson(context.request);
    const loginId = normalizeLoginId(body.loginId);
    const name = sanitizePlainText(body.name, 80);
    const email = normalizeEmail(body.email);
    const company = sanitizePlainText(body.company, 120);
    const password = String(body.password || "");
    const ip = getRequestClientIp(context.request);

    if (!loginId || !name || !email || !password) {
      return jsonError("필수 항목을 모두 입력해 주세요.", 400);
    }
    if (!LOGIN_ID_PATTERN.test(loginId)) {
      return jsonError("아이디는 영문 소문자/숫자/밑줄 조합 3~20자여야 합니다.", 400);
    }
    if (!EMAIL_PATTERN.test(email)) {
      return jsonError("이메일 형식을 확인해 주세요.", 400);
    }
    if (password.length < 8) {
      return jsonError("비밀번호는 8자 이상이어야 합니다.", 400);
    }
    if (password.length > 128) {
      return jsonError("비밀번호는 128자 이하여야 합니다.", 400);
    }

    const duplicateByLogin = await d1Query(context.env, "select id from members where login_id = ? limit 1", [loginId]);
    if (duplicateByLogin.length) {
      return jsonError("이미 사용 중인 아이디입니다.", 409);
    }
    const duplicateByEmail = await d1Query(context.env, "select id from members where email = ? limit 1", [email]);
    if (duplicateByEmail.length) {
      return jsonError("이미 가입된 이메일입니다.", 409);
    }

    const id = `mem_${crypto.randomUUID()}`;
    const passwordHash = await hashPassword(password, context.env);
    await d1Execute(
      context.env,
      "insert into members (id, login_id, name, email, company, password, role) values (?, ?, ?, ?, ?, ?, 'member')",
      [id, loginId, name, email, company, passwordHash]
    );

    const token = await createSession(context.env, "member", {
      memberId: id,
      loginId,
      email,
      role: "member",
    }, context.request);

    const headers = new Headers();
    appendSessionCookie(headers, "member", token, context.env.MEMBER_SESSION_TTL_SEC);
    appendClearSessionCookie(headers, "admin");
    await writeSecurityAudit(context.env, {
      eventType: "member_signup_success",
      actorType: "member",
      actorId: loginId,
      ip,
      outcome: "success",
      detail: "signup_and_session_created",
    });

    return jsonOk({
      token,
      member: {
        id,
        loginId,
        name,
        email,
        company,
        role: "member",
      },
    }, 200, headers);
  } catch (error) {
    return jsonError("회원가입 처리 중 오류가 발생했습니다.", 500);
  }
}
