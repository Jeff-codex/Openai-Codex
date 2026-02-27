import { d1Execute, getRequestClientIp, jsonError, jsonOk, parseJson, sanitizePlainText, writeSecurityAudit } from "../../../_lib/cloudflare_store.js";
import {
  cleanupExpiredPaymentIntents,
  createIntentGoneResponse,
  ensureIntentNotExpired,
  ensureMemberSession,
  ensureOrderPaymentSchema,
  fetchIntentForMember,
  getPaymentIntegrationStatus,
  listPaymentMethods,
  normalizePaymentMethod,
  resolveReturnUrls,
  toIntentSummary,
} from "../../_payment_common.js";

function buildOrderName(intent) {
  return `딜리버 주문 결제 ${String(intent.media_name || "").trim() || "주문"}`;
}

function buildCustomerKey(intent, fallbackActorId = "") {
  const source = String(intent?.member_login_id || fallbackActorId || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 48);
  if (source) return `dlv_${source}`;
  return `dlv_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export async function onRequestPost(context) {
  try {
    const session = await ensureMemberSession(context);
    if (!session) return jsonError("로그인이 필요합니다.", 401);

    await ensureOrderPaymentSchema(context.env);
    await cleanupExpiredPaymentIntents(context.env);

    const intentId = sanitizePlainText(context?.params?.intentId, 90);
    if (!intentId) return jsonError("결제 식별자가 올바르지 않습니다.", 400);

    const intent = await fetchIntentForMember(context.env, intentId, session.memberId);
    if (!intent) return jsonError("결제 준비 정보를 찾을 수 없습니다.", 404);

    if (!ensureIntentNotExpired(intent, context.env)) {
      return createIntentGoneResponse();
    }
    const status = String(intent.status || "").toLowerCase();
    if (status === "confirmed" && intent.order_id) {
      return jsonOk({
        intent: toIntentSummary(intent),
        alreadyConfirmed: true,
      });
    }
    if (!["ready", "redirected", "failed"].includes(status)) {
      return jsonError("현재 상태에서는 결제를 진행할 수 없습니다.", 409);
    }

    const paymentIntegration = getPaymentIntegrationStatus(context.env);
    if (!paymentIntegration.ready) {
      return jsonError(paymentIntegration.message, 409);
    }
    const clientKey = String(context.env.TOSS_CLIENT_KEY || "").trim();

    const body = await parseJson(context.request);
    const methodInput = sanitizePlainText(body.method, 40);
    const method = normalizePaymentMethod(methodInput);
    const now = new Date().toISOString();
    await d1Execute(
      context.env,
      "update order_payment_intents set status = 'redirected', payment_method = ?, updated_at = ?, failure_code = null, failure_message = null where intent_id = ? and member_id = ?",
      [method.sdkMethod, now, intent.intent_id, session.memberId]
    );

    await writeSecurityAudit(context.env, {
      eventType: "member_order_payment_confirm_start",
      actorType: "member",
      actorId: intent.member_login_id || session.memberId,
      ip: getRequestClientIp(context.request),
      outcome: "success",
      detail: `${intent.intent_id}:${method.id}`,
    });

    const urls = resolveReturnUrls(context.request, context.env, intent.intent_id);
    return jsonOk({
      intent: {
        ...toIntentSummary(intent),
        status: "redirected",
      },
      paymentMethods: listPaymentMethods(),
      payment: {
        clientKey,
        method: method.sdkMethod,
        customerKey: buildCustomerKey(intent, session.memberId),
        orderId: intent.toss_order_id,
        amount: Number(intent.total_amount || 0),
        orderName: buildOrderName(intent),
        successUrl: urls.successUrl,
        failUrl: urls.failUrl,
      },
    });
  } catch (error) {
    return jsonError("결제창 준비 중 오류가 발생했습니다.", 500);
  }
}
