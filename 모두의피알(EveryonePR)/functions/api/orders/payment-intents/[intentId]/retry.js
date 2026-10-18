import { d1Execute, jsonError, jsonOk, sanitizePlainText } from "../../../_lib/cloudflare_store.js";
import {
  buildRefundPolicyHtml,
  cleanupExpiredPaymentIntents,
  createIntentGoneResponse,
  ensureIntentNotExpired,
  ensureMemberSession,
  ensureOrderPaymentSchema,
  fetchIntentForMember,
  getPaymentIntegrationStatus,
  listPaymentMethods,
  toIntentSummary,
} from "../../_payment_common.js";

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
        refundPolicyHtml: buildRefundPolicyHtml(),
      });
    }
    if (!["ready", "redirected", "failed"].includes(status)) {
      return jsonError("현재 상태에서는 재시도를 진행할 수 없습니다.", 409);
    }

    const now = new Date().toISOString();
    await d1Execute(
      context.env,
      "update order_payment_intents set status = 'ready', payment_method = null, failure_code = null, failure_message = null, updated_at = ? where intent_id = ? and member_id = ?",
      [now, intent.intent_id, session.memberId]
    );

    const refreshed = await fetchIntentForMember(context.env, intentId, session.memberId);
    const paymentIntegration = getPaymentIntegrationStatus(context.env);
    return jsonOk({
      intent: toIntentSummary(refreshed || intent),
      paymentMethods: listPaymentMethods(),
      refundPolicyHtml: buildRefundPolicyHtml(),
      paymentIntegration,
    });
  } catch (error) {
    return jsonError("결제 재시도 준비 중 오류가 발생했습니다.", 500);
  }
}
