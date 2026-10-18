import {
  d1Execute,
  d1Query,
  getRequestClientIp,
  jsonError,
  jsonOk,
  parseJson,
  sanitizePlainText,
  writeSecurityAudit,
} from "../../../_lib/cloudflare_store.js";
import { encodeBasicAuth, ensureOrderPaymentSchema, toSnippet } from "../../../orders/_payment_common.js";
import { requireAdminSession } from "../../_auth.js";

function buildRefundId() {
  return `rfd_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function onRequestPost(context) {
  try {
    const adminSession = await requireAdminSession(context);
    if (!adminSession) return jsonError("관리자 로그인이 필요합니다.", 401);

    await ensureOrderPaymentSchema(context.env);
    const orderId = sanitizePlainText(context?.params?.orderId, 90);
    if (!orderId) return jsonError("주문 ID가 올바르지 않습니다.", 400);

    const body = await parseJson(context.request);
    const refundReason = sanitizePlainText(body.reason, 160) || "관리자 환불 요청";
    const ip = getRequestClientIp(context.request);

    const rows = await d1Query(
      context.env,
      "select o.id, o.order_number, o.payment_status, p.id as payment_id, p.payment_key, p.amount_total, p.status as payment_row_status from orders o left join order_payments p on p.order_id = o.id where o.id = ? limit 1",
      [orderId]
    );
    if (!rows.length || !rows[0].payment_id) {
      return jsonError("환불 가능한 결제 주문을 찾을 수 없습니다.", 404);
    }
    const target = rows[0];
    const paymentStatus = String(target.payment_status || target.payment_row_status || "").toLowerCase();
    if (paymentStatus !== "paid") {
      return jsonError("결제 완료 상태 주문만 환불할 수 있습니다.", 409);
    }

    const refundedRows = await d1Query(
      context.env,
      "select id from payment_refunds where order_id = ? and status = 'succeeded' limit 1",
      [orderId]
    );
    if (refundedRows.length) {
      return jsonError("이미 환불이 완료된 주문입니다.", 409);
    }

    const secretKey = String(context.env.TOSS_SECRET_KEY || "").trim();
    if (!secretKey) {
      return jsonError("결제 환불 설정이 아직 완료되지 않았습니다. 관리자에게 문의해 주세요.", 503);
    }

    const tossResponse = await fetch(
      `https://api.tosspayments.com/v1/payments/${encodeURIComponent(String(target.payment_key || ""))}/cancel`,
      {
        method: "POST",
        headers: {
          authorization: encodeBasicAuth(secretKey),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          cancelReason: refundReason,
        }),
      }
    );
    const tossResult = await tossResponse.json().catch(() => ({}));
    const now = new Date().toISOString();
    if (!tossResponse.ok) {
      const failCode = sanitizePlainText(tossResult.code, 80) || `http_${tossResponse.status}`;
      const failMessage = sanitizePlainText(tossResult.message, 200) || "환불 승인에 실패했습니다.";
      await d1Execute(
        context.env,
        "insert into payment_refunds (id, refund_id, order_id, payment_id, refund_amount, status, reason, requested_by, failure_code, failure_message, raw_payload, created_at, updated_at) values (?, ?, ?, ?, ?, 'failed', ?, ?, ?, ?, ?, ?, ?)",
        [
          `rfrow_${crypto.randomUUID()}`,
          buildRefundId(),
          orderId,
          target.payment_id,
          Math.max(0, Number(target.amount_total || 0)),
          refundReason,
          adminSession.loginId || adminSession.adminId,
          failCode,
          failMessage,
          toSnippet(JSON.stringify(tossResult)),
          now,
          now,
        ]
      );
      await writeSecurityAudit(context.env, {
        eventType: "admin_order_refund_failed",
        actorType: "admin",
        actorId: adminSession.loginId || adminSession.adminId,
        ip,
        outcome: "failed",
        detail: `${orderId}:${failCode}`,
      });
      if (tossResponse.status >= 500) {
        return jsonError("환불 승인 통신이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.", 503);
      }
      return jsonError(failMessage, 400);
    }

    const refundedAmount = Math.max(0, Number(target.amount_total || tossResult.cancelAmount || 0));
    const refundKey = sanitizePlainText(
      tossResult?.cancels?.[0]?.transactionKey || tossResult?.cancels?.[0]?.cancelTransactionKey || "",
      120
    );
    await d1Execute(
      context.env,
      "insert into payment_refunds (id, refund_id, order_id, payment_id, refund_amount, status, reason, requested_by, approved_at, toss_refund_key, raw_payload, created_at, updated_at) values (?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, ?, ?, ?, ?)",
      [
        `rfrow_${crypto.randomUUID()}`,
        buildRefundId(),
        orderId,
        target.payment_id,
        refundedAmount,
        refundReason,
        adminSession.loginId || adminSession.adminId,
        now,
        refundKey || null,
        toSnippet(JSON.stringify(tossResult)),
        now,
        now,
      ]
    );
    await d1Execute(context.env, "update order_payments set status = 'refunded_full', updated_at = ? where id = ?", [
      now,
      target.payment_id,
    ]);
    await d1Execute(context.env, "update orders set payment_status = 'refunded', updated_at = ? where id = ?", [
      now,
      orderId,
    ]);
    await d1Execute(context.env, "insert into admin_logs (message, created_at) values (?, ?)", [
      `주문 환불 완료: ${target.order_number || orderId} (${refundedAmount}원)`,
      now,
    ]);
    await writeSecurityAudit(context.env, {
      eventType: "admin_order_refunded",
      actorType: "admin",
      actorId: adminSession.loginId || adminSession.adminId,
      ip,
      outcome: "success",
      detail: `${orderId}:${refundedAmount}`,
    });

    return jsonOk({
      orderId,
      orderNumber: target.order_number || "",
      refundedAmount,
      status: "refunded",
    });
  } catch (error) {
    return jsonError("환불 처리 중 오류가 발생했습니다.", 500);
  }
}
