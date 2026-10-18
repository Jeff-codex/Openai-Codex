import { jsonError, jsonOk, sanitizePlainText } from "../../../_lib/cloudflare_store.js";
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

export async function onRequestGet(context) {
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

    return jsonOk({
      intent: toIntentSummary(intent),
      paymentMethods: listPaymentMethods(),
      refundPolicyHtml: buildRefundPolicyHtml(),
      paymentIntegration: getPaymentIntegrationStatus(context.env),
    });
  } catch (error) {
    return jsonError("결제 준비 정보를 불러오는 중 오류가 발생했습니다.", 500);
  }
}
