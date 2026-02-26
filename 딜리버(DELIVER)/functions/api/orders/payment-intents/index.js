import {
  d1Execute,
  d1Query,
  getRequestClientIp,
  jsonError,
  jsonOk,
  parseJson,
  r2Delete,
  r2Put,
  sanitizePlainText,
  writeSecurityAudit,
} from "../../_lib/cloudflare_store.js";
import { normalizeAttachmentName, validateAttachmentFile } from "../../_lib/order_attachment_store.js";
import {
  PAYMENT_INTENT_TTL_SEC,
  buildRefundPolicyHtml,
  calculateOrderAmounts,
  cleanupExpiredPaymentIntents,
  computeExpiryIso,
  ensureMemberSession,
  ensureOrderPaymentSchema,
  getPaymentIntegrationStatus,
  getMemberById,
  listPaymentMethods,
  normalizeAmount,
  toIntentSummary,
} from "../_payment_common.js";

function buildTossOrderId() {
  return `odr_${crypto.randomUUID().replace(/-/g, "")}`;
}

function buildIntentId() {
  return `opi_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function parseIntentInput(request) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return {
      mediaId: sanitizePlainText(form.get("mediaId"), 80),
      title: sanitizePlainText(form.get("title"), 120),
      requestNote: sanitizePlainText(form.get("requestNote"), 1000),
      draftFile: form.get("draftFile"),
    };
  }
  const body = await parseJson(request);
  return {
    mediaId: sanitizePlainText(body.mediaId, 80),
    title: sanitizePlainText(body.title, 120),
    requestNote: sanitizePlainText(body.requestNote, 1000),
    draftFile: null,
  };
}

export async function onRequestPost(context) {
  let uploadedKey = "";
  try {
    const session = await ensureMemberSession(context);
    if (!session) return jsonError("로그인이 필요합니다.", 401);

    await ensureOrderPaymentSchema(context.env);
    await cleanupExpiredPaymentIntents(context.env);

    const input = await parseIntentInput(context.request);
    const mediaId = String(input.mediaId || "").trim();
    const title = sanitizePlainText(input.title, 120);
    const requestNote = sanitizePlainText(input.requestNote, 1000);
    if (!mediaId || !title) {
      return jsonError("주문명, 매체를 확인해 주세요.", 400);
    }

    const member = await getMemberById(context.env, session.memberId);
    if (!member) return jsonError("회원 정보를 찾을 수 없습니다.", 404);

    const mediaRows = await d1Query(
      context.env,
      "select id, name, unit_price from media_channels where id = ? and is_active = 1 limit 1",
      [mediaId]
    );
    if (!mediaRows.length) {
      return jsonError("선택한 매체를 찾을 수 없습니다.", 404);
    }
    const media = mediaRows[0];
    const unitPrice = normalizeAmount(media.unit_price);
    if (unitPrice <= 0) {
      return jsonError("선택한 매체의 단가 정보가 없어 결제를 진행할 수 없습니다.", 400);
    }

    const attachmentInfo = validateAttachmentFile(input.draftFile);
    if (!attachmentInfo.ok) return jsonError(attachmentInfo.message, 400);
    if (!attachmentInfo.hasFile) return jsonError("원고 파일을 첨부해 주세요.", 400);

    const intentId = buildIntentId();
    const intentRowId = `intent_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const expiresAt = computeExpiryIso(now, PAYMENT_INTENT_TTL_SEC);
    const tossOrderId = buildTossOrderId();
    const { supplyAmount, vatAmount, totalAmount } = calculateOrderAmounts(unitPrice);

    const fileBytes = await input.draftFile.arrayBuffer();
    const safeFileName = normalizeAttachmentName(attachmentInfo.fileName || "draft");
    const fileKey = `payments/intents/${intentId}/${Date.now()}_${safeFileName}`;
    await r2Put(context.env, fileKey, fileBytes, {
      httpMetadata: { contentType: attachmentInfo.fileMime },
      customMetadata: {
        intentId,
        memberId: member.id,
        memberLoginId: member.login_id,
      },
    });
    uploadedKey = fileKey;

    await d1Execute(
      context.env,
      "insert into order_payment_intents (id, intent_id, member_id, member_login_id, media_id, media_name, unit_price, vat_amount, total_amount, draft_title, draft_note, draft_file_key, draft_file_name, draft_file_mime, draft_file_size, status, toss_order_id, expires_at, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?)",
      [
        intentRowId,
        intentId,
        member.id,
        member.login_id,
        media.id,
        media.name,
        supplyAmount,
        vatAmount,
        totalAmount,
        title,
        requestNote || null,
        fileKey,
        attachmentInfo.fileName,
        attachmentInfo.fileMime,
        attachmentInfo.fileSize,
        tossOrderId,
        expiresAt,
        now,
        now,
      ]
    );

    await writeSecurityAudit(context.env, {
      eventType: "member_order_payment_intent_created",
      actorType: "member",
      actorId: member.login_id,
      ip: getRequestClientIp(context.request),
      outcome: "success",
      detail: `${intentId}:${totalAmount}`,
    });

    const created = await d1Query(
      context.env,
      "select intent_id, status, media_name, draft_title, unit_price, vat_amount, total_amount, payment_method, failure_code, failure_message, expires_at, created_at, updated_at from order_payment_intents where intent_id = ? limit 1",
      [intentId]
    );
    const paymentIntegration = getPaymentIntegrationStatus(context.env);

    return jsonOk({
      intent: toIntentSummary(created[0]),
      paymentMethods: listPaymentMethods(),
      refundPolicyHtml: buildRefundPolicyHtml(),
      paymentIntegration,
    });
  } catch (error) {
    if (uploadedKey) {
      try {
        await r2Delete(context.env, uploadedKey);
      } catch (cleanupError) {
      }
    }
    return jsonError("결제 준비 중 오류가 발생했습니다.", 500);
  }
}
