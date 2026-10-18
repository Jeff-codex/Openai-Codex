import {
  d1Execute,
  d1Query,
  getRequestClientIp,
  jsonError,
  jsonOk,
  parseJson,
  sanitizePlainText,
  writeSecurityAudit,
} from "../../_lib/cloudflare_store.js";
import {
  ensureMemberSession,
  ensurePointChargePaymentsTable,
  MAX_POINT_CHARGE_AMOUNT,
  MIN_POINT_CHARGE_AMOUNT,
  normalizeChargeAmount,
  resolveReturnUrls,
} from "./_common.js";

function buildOrderId() {
  return `pch_${crypto.randomUUID().replace(/-/g, "")}`;
}

function buildOrderName(amount) {
  return `딜리버 포인트 충전 ${Number(amount || 0).toLocaleString("ko-KR")}원`;
}

export async function onRequestPost(context) {
  try {
    const session = await ensureMemberSession(context);
    if (!session) return jsonError("로그인이 필요합니다.", 401);
    await ensurePointChargePaymentsTable(context.env);

    const clientKey = String(context.env.TOSS_CLIENT_KEY || "").trim();
    if (!clientKey) {
      return jsonError("결제 설정이 아직 완료되지 않았습니다. 관리자에게 문의해 주세요.", 503);
    }

    const body = await parseJson(context.request);
    const amount = normalizeChargeAmount(body.amount);
    const note = sanitizePlainText(body.note, 120);
    const ip = getRequestClientIp(context.request);
    if (amount < MIN_POINT_CHARGE_AMOUNT) {
      return jsonError(`최소 충전 금액은 ${MIN_POINT_CHARGE_AMOUNT.toLocaleString("ko-KR")}원입니다.`, 400);
    }
    if (amount > MAX_POINT_CHARGE_AMOUNT) {
      return jsonError(`1회 최대 충전 금액은 ${MAX_POINT_CHARGE_AMOUNT.toLocaleString("ko-KR")}원입니다.`, 400);
    }

    const memberRows = await d1Query(
      context.env,
      "select id, login_id, name, email from members where id = ? limit 1",
      [session.memberId]
    );
    if (!memberRows.length) {
      return jsonError("회원 정보를 찾을 수 없습니다.", 404);
    }
    const member = memberRows[0];
    const orderId = buildOrderId();
    const paymentId = `pcp_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const returnUrls = resolveReturnUrls(context.request, context.env);

    await d1Execute(
      context.env,
      "insert into point_charge_payments (id, order_id, member_id, member_login_id, amount, note, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, 'ready', ?, ?)",
      [paymentId, orderId, member.id, member.login_id, amount, note || null, now, now]
    );
    await writeSecurityAudit(context.env, {
      eventType: "member_point_charge_prepared",
      actorType: "member",
      actorId: member.login_id,
      ip,
      outcome: "success",
      detail: `${orderId}:${amount}`,
    });

    return jsonOk({
      payment: {
        clientKey,
        orderId,
        amount,
        orderName: buildOrderName(amount),
        successUrl: returnUrls.successUrl,
        failUrl: returnUrls.failUrl,
        customerName: member.name || "",
        customerEmail: member.email || "",
      },
    });
  } catch (error) {
    return jsonError("포인트 충전 결제 준비 중 오류가 발생했습니다.", 500);
  }
}
