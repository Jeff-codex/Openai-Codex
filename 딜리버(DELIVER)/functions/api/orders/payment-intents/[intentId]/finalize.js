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
import { ensureOrderAttachmentTable, saveOrderAttachmentMeta } from "../../../_lib/order_attachment_store.js";
import {
  buildOrderPaymentResponse,
  calculateOrderAmounts,
  cleanupExpiredPaymentIntents,
  createIntentGoneResponse,
  encodeBasicAuth,
  ensureIntentNotExpired,
  ensureMemberSession,
  ensureOrderPaymentSchema,
  fetchIntentForMember,
  fetchOrderAndPayment,
  generateOrderNumber,
  getMemberById,
  normalizeAmount,
  toSnippet,
} from "../../_payment_common.js";

function buildOrderId() {
  return `ord_${crypto.randomUUID()}`;
}

function parseTossMethod(raw) {
  return sanitizePlainText(raw, 50);
}

export async function onRequestPost(context) {
  try {
    const session = await ensureMemberSession(context);
    if (!session) return jsonError("로그인이 필요합니다.", 401);

    await ensureOrderPaymentSchema(context.env);
    await cleanupExpiredPaymentIntents(context.env);

    const intentId = sanitizePlainText(context?.params?.intentId, 90);
    if (!intentId) return jsonError("결제 식별자가 올바르지 않습니다.", 400);

    const secretKey = String(context.env.TOSS_SECRET_KEY || "").trim();
    if (!secretKey) {
      return jsonError("결제 승인 설정이 아직 완료되지 않았습니다. 관리자에게 문의해 주세요.", 503);
    }

    const body = await parseJson(context.request);
    const paymentKey = sanitizePlainText(body.paymentKey, 140);
    const orderIdFromToss = sanitizePlainText(body.orderId, 100);
    const amount = normalizeAmount(body.amount);
    if (!paymentKey || !orderIdFromToss || amount <= 0) {
      return jsonError("결제 승인 정보가 올바르지 않습니다.", 400);
    }

    const intent = await fetchIntentForMember(context.env, intentId, session.memberId);
    if (!intent) return jsonError("결제 준비 정보를 찾을 수 없습니다.", 404);
    const status = String(intent.status || "").toLowerCase();
    if (status === "confirmed" && intent.order_id) {
      const existingOrder = await fetchOrderAndPayment(context.env, intent.order_id, session.memberId);
      if (!existingOrder) {
        return jsonError("결제 승인 상태를 조회하지 못했습니다.", 500);
      }
      return jsonOk(buildOrderPaymentResponse(existingOrder));
    }
    if (!ensureIntentNotExpired(intent, context.env)) {
      return createIntentGoneResponse();
    }
    if (!["ready", "redirected", "failed"].includes(status)) {
      return jsonError("현재 상태에서는 결제 승인을 진행할 수 없습니다.", 409);
    }
    const expectedAmount = normalizeAmount(intent.total_amount);
    if (expectedAmount !== amount) {
      return jsonError("결제 승인 금액이 준비된 금액과 일치하지 않습니다.", 400);
    }
    if (String(intent.toss_order_id || "") !== orderIdFromToss) {
      return jsonError("결제 주문번호 검증에 실패했습니다.", 400);
    }

    const existingPaymentRows = await d1Query(
      context.env,
      "select order_id from order_payments where payment_key = ? limit 1",
      [paymentKey]
    );
    if (existingPaymentRows.length) {
      const existingOrder = await fetchOrderAndPayment(context.env, existingPaymentRows[0].order_id, session.memberId);
      if (!existingOrder) return jsonError("결제 승인 정보를 찾지 못했습니다.", 500);
      await d1Execute(
        context.env,
        "update order_payment_intents set status = 'confirmed', order_id = ?, toss_payment_key = ?, updated_at = ? where intent_id = ? and member_id = ?",
        [existingPaymentRows[0].order_id, paymentKey, new Date().toISOString(), intent.intent_id, session.memberId]
      );
      return jsonOk(buildOrderPaymentResponse(existingOrder));
    }

    const tossResponse = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        authorization: encodeBasicAuth(secretKey),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        paymentKey,
        orderId: orderIdFromToss,
        amount,
      }),
    });
    const tossResult = await tossResponse.json().catch(() => ({}));
    if (!tossResponse.ok) {
      const failCode = sanitizePlainText(tossResult.code, 80);
      const failMessage = sanitizePlainText(tossResult.message, 180) || "토스 결제 승인에 실패했습니다.";
      const now = new Date().toISOString();
      if (tossResponse.status >= 400 && tossResponse.status < 500) {
        await d1Execute(
          context.env,
          "update order_payment_intents set status = 'failed', failure_code = ?, failure_message = ?, toss_payment_key = ?, toss_raw = ?, updated_at = ? where intent_id = ? and member_id = ?",
          [failCode || null, failMessage, paymentKey, toSnippet(JSON.stringify(tossResult)), now, intent.intent_id, session.memberId]
        );
      }
      await writeSecurityAudit(context.env, {
        eventType: "member_order_payment_confirm_failed",
        actorType: "member",
        actorId: intent.member_login_id || session.memberId,
        ip: getRequestClientIp(context.request),
        outcome: "failed",
        detail: `${intent.intent_id}:${failCode || `http_${tossResponse.status}`}`,
      });
      if (tossResponse.status >= 500) {
        return jsonError("결제 승인 통신이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.", 503);
      }
      return jsonError(failMessage, 400);
    }

    const confirmedAmount = normalizeAmount(tossResult.totalAmount);
    const confirmedStatus = String(tossResult.status || "").toUpperCase();
    if (confirmedAmount !== expectedAmount || confirmedStatus !== "DONE") {
      return jsonError("결제 승인 응답 검증에 실패했습니다.", 409);
    }

    const member = await getMemberById(context.env, session.memberId);
    if (!member) return jsonError("회원 정보를 찾을 수 없습니다.", 404);

    const now = new Date().toISOString();
    const orderId = buildOrderId();
    const orderNumber = await generateOrderNumber(context.env, now);
    const { supplyAmount, vatAmount, totalAmount } = calculateOrderAmounts(intent.unit_price);

    await d1Execute(
      context.env,
      "insert into orders (id, member_id, member_login_id, member_name, email, title, media_id, media_name, budget, status, request_note, created_at, updated_at, order_number, ordered_at, payment_status, payment_total_amount, payment_vat_amount, payment_supply_amount) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?, ?, ?, ?, 'paid', ?, ?, ?)",
      [
        orderId,
        member.id,
        member.login_id,
        member.name,
        member.email,
        intent.draft_title,
        intent.media_id,
        intent.media_name,
        supplyAmount,
        intent.draft_note || "",
        now,
        now,
        orderNumber,
        now,
        totalAmount,
        vatAmount,
        supplyAmount,
      ]
    );
    await d1Execute(
      context.env,
      "insert into order_status_logs (order_id, from_status, to_status, changed_by, note, changed_at) values (?, ?, ?, ?, ?, ?)",
      [orderId, null, "received", member.id, "결제 완료 후 주문 생성", now]
    );

    await ensureOrderAttachmentTable(context.env);
    if (String(intent.draft_file_key || "").trim()) {
      await saveOrderAttachmentMeta(context.env, {
        orderId,
        fileKey: intent.draft_file_key,
        fileName: intent.draft_file_name || "첨부파일",
        fileMime: intent.draft_file_mime || "application/octet-stream",
        fileSize: normalizeAmount(intent.draft_file_size),
        uploadedByMemberId: member.id,
        uploadedAt: now,
      });
    }

    await d1Execute(
      context.env,
      "insert into order_payments (id, order_id, member_id, amount_supply, amount_vat, amount_total, payment_provider, payment_key, order_id_pg, method, status, paid_at, raw_payload, created_at, updated_at) values (?, ?, ?, ?, ?, ?, 'toss', ?, ?, ?, 'paid', ?, ?, ?, ?)",
      [
        `pay_${crypto.randomUUID()}`,
        orderId,
        member.id,
        supplyAmount,
        vatAmount,
        totalAmount,
        paymentKey,
        orderIdFromToss,
        parseTossMethod(tossResult.method || intent.payment_method || "카드"),
        now,
        toSnippet(JSON.stringify(tossResult)),
        now,
        now,
      ]
    );

    await d1Execute(
      context.env,
      "update order_payment_intents set status = 'confirmed', order_id = ?, toss_payment_key = ?, toss_method = ?, toss_raw = ?, failure_code = null, failure_message = null, updated_at = ? where intent_id = ? and member_id = ?",
      [
        orderId,
        paymentKey,
        parseTossMethod(tossResult.method || intent.payment_method || "카드"),
        toSnippet(JSON.stringify(tossResult)),
        now,
        intent.intent_id,
        session.memberId,
      ]
    );

    await d1Execute(context.env, "insert into admin_logs (message, created_at) values (?, ?)", [
      `주문 결제 완료: ${orderNumber} (${member.login_id})`,
      now,
    ]);

    await writeSecurityAudit(context.env, {
      eventType: "member_order_payment_confirmed",
      actorType: "member",
      actorId: member.login_id,
      ip: getRequestClientIp(context.request),
      outcome: "success",
      detail: `${intent.intent_id}:${orderNumber}`,
    });

    const finalized = await fetchOrderAndPayment(context.env, orderId, session.memberId);
    if (!finalized) return jsonError("주문 결제 결과 조회에 실패했습니다.", 500);
    return jsonOk(buildOrderPaymentResponse(finalized));
  } catch (error) {
    return jsonError("결제 승인 처리 중 오류가 발생했습니다.", 500);
  }
}
