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
} from "./_common.js";

function encodeBasicAuth(secretKey) {
  return `Basic ${btoa(`${String(secretKey || "")}:`)}`;
}

function toSnippet(value, maxLength = 4000) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

async function fetchMemberPointBalance(env, memberId) {
  const rows = await d1Query(env, "select point_balance from members where id = ? limit 1", [memberId]);
  if (!rows.length) return 0;
  return Number(rows[0].point_balance || 0);
}

export async function onRequestPost(context) {
  try {
    const session = await ensureMemberSession(context);
    if (!session) return jsonError("로그인이 필요합니다.", 401);
    await ensurePointChargePaymentsTable(context.env);

    const secretKey = String(context.env.TOSS_SECRET_KEY || "").trim();
    if (!secretKey) {
      return jsonError("결제 승인 설정이 아직 완료되지 않았습니다. 관리자에게 문의해 주세요.", 503);
    }

    const body = await parseJson(context.request);
    const paymentKey = sanitizePlainText(body.paymentKey, 120);
    const orderId = sanitizePlainText(body.orderId, 80);
    const amount = normalizeChargeAmount(body.amount);
    const ip = getRequestClientIp(context.request);
    if (!paymentKey || !orderId || amount <= 0) {
      return jsonError("결제 승인 정보가 올바르지 않습니다.", 400);
    }
    if (amount < MIN_POINT_CHARGE_AMOUNT || amount > MAX_POINT_CHARGE_AMOUNT) {
      return jsonError("충전 금액 범위를 확인해 주세요.", 400);
    }

    const paymentRows = await d1Query(
      context.env,
      "select id, order_id, member_id, member_login_id, amount, status, payment_key, credited_at from point_charge_payments where order_id = ? and member_id = ? limit 1",
      [orderId, session.memberId]
    );
    if (!paymentRows.length) return jsonError("결제 준비 정보를 찾을 수 없습니다.", 404);
    const payment = paymentRows[0];
    const expectedAmount = normalizeChargeAmount(payment.amount);
    if (expectedAmount !== amount) {
      return jsonError("결제 승인 금액이 준비된 금액과 일치하지 않습니다.", 400);
    }

    const status = String(payment.status || "").toLowerCase();
    const alreadyConfirmed = status === "confirmed" && Boolean(payment.credited_at);
    if (alreadyConfirmed) {
      const pointBalance = await fetchMemberPointBalance(context.env, session.memberId);
      return jsonOk({ orderId, amount, pointBalance, status: "confirmed" });
    }
    if (!["ready", "confirmed"].includes(status)) {
      return jsonError("해당 결제는 승인 가능한 상태가 아닙니다.", 409);
    }

    let confirmedPayload = null;
    if (status !== "confirmed") {
      const tossResponse = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
        method: "POST",
        headers: {
          authorization: encodeBasicAuth(secretKey),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          paymentKey,
          orderId,
          amount,
        }),
      });
      const tossResult = await tossResponse.json().catch(() => ({}));
      if (!tossResponse.ok) {
        const failCode = sanitizePlainText(tossResult.code, 80);
        const failMessage = sanitizePlainText(tossResult.message, 180) || "토스 결제 승인에 실패했습니다.";
        const now = new Date().toISOString();
        const clientError = tossResponse.status >= 400 && tossResponse.status < 500;
        if (clientError) {
          await d1Execute(
            context.env,
            "update point_charge_payments set status = 'failed', failure_code = ?, failure_message = ?, payment_key = ?, toss_raw = ?, updated_at = ? where order_id = ? and member_id = ? and status = 'ready'",
            [failCode || null, failMessage, paymentKey, toSnippet(JSON.stringify(tossResult)), now, orderId, session.memberId]
          );
        }
        await writeSecurityAudit(context.env, {
          eventType: "member_point_charge_confirm_failed",
          actorType: "member",
          actorId: payment.member_login_id || session.memberId,
          ip,
          outcome: "failed",
          detail: `${orderId}:${failCode || `http_${tossResponse.status}`}`,
        });
        if (!clientError) {
          return jsonError("결제 승인 통신이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.", 503);
        }
        return jsonError(failMessage, 400);
      }

      const confirmedAmount = normalizeChargeAmount(tossResult.totalAmount);
      const confirmedStatus = String(tossResult.status || "").toUpperCase();
      if (confirmedAmount !== amount || confirmedStatus !== "DONE") {
        return jsonError("결제 승인 응답 검증에 실패했습니다.", 409);
      }
      confirmedPayload = tossResult;

      const now = new Date().toISOString();
      await d1Execute(
        context.env,
        "update point_charge_payments set status = 'confirmed', payment_key = ?, method = ?, confirmed_at = ?, toss_raw = ?, failure_code = null, failure_message = null, updated_at = ? where order_id = ? and member_id = ? and status = 'ready'",
        [
          paymentKey,
          sanitizePlainText(tossResult.method, 40) || null,
          now,
          toSnippet(JSON.stringify(tossResult)),
          now,
          orderId,
          session.memberId,
        ]
      );
    }

    const refreshedRows = await d1Query(
      context.env,
      "select status, credited_at, payment_key from point_charge_payments where order_id = ? and member_id = ? limit 1",
      [orderId, session.memberId]
    );
    if (!refreshedRows.length || String(refreshedRows[0].status || "").toLowerCase() !== "confirmed") {
      return jsonError("결제 승인 상태 반영에 실패했습니다.", 500);
    }

    const pointBalance = await fetchMemberPointBalance(context.env, session.memberId);
    const creditApplied = Boolean(refreshedRows[0].credited_at);
    if (confirmedPayload && creditApplied) {
      const now = new Date().toISOString();
      await d1Execute(context.env, "insert into admin_logs (message, created_at) values (?, ?)", [
        `포인트 충전 완료: ${payment.member_login_id || session.memberId} (+${amount})`,
        now,
      ]);
      await writeSecurityAudit(context.env, {
        eventType: "member_point_charge_confirmed",
        actorType: "member",
        actorId: payment.member_login_id || session.memberId,
        ip,
        outcome: "success",
        detail: `${orderId}:${amount}`,
      });
    }

    return jsonOk({
      orderId,
      amount,
      pointBalance,
      status: "confirmed",
    });
  } catch (error) {
    return jsonError("포인트 충전 결제 승인 중 오류가 발생했습니다.", 500);
  }
}
