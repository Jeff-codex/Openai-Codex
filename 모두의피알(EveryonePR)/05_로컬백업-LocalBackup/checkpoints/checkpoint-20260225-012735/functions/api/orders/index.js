import {
  d1Execute,
  d1Query,
  getSessionToken,
  jsonError,
  jsonOk,
  parseJson,
  r2Delete,
  r2Put,
  readSession,
  sanitizePlainText,
  writeSecurityAudit,
  getRequestClientIp,
} from "../_lib/cloudflare_store.js";
import {
  buildAttachmentObjectKey,
  ensureOrderAttachmentTable,
  saveOrderAttachmentMeta,
  validateAttachmentFile,
} from "../_lib/order_attachment_store.js";

const STATUS_VALUES = new Set(["received", "reviewing", "queued", "published", "rejected"]);

async function ensureMemberSession(context) {
  const token = getSessionToken(context.request, "member");
  const session = await readSession(context.env, token, "member", context.request);
  if (!session?.memberId) {
    return null;
  }
  return session;
}

export async function onRequestGet(context) {
  try {
    const session = await ensureMemberSession(context);
    if (!session) return jsonError("로그인이 필요합니다.", 401);
    await ensureOrderAttachmentTable(context.env);

    const rows = await d1Query(
      context.env,
      "select o.id, o.member_id, o.member_login_id, o.member_name, o.email, o.title, o.media_id, o.media_name, o.budget, o.status, o.request_note, o.created_at, o.updated_at, a.file_name as attachment_name, a.file_mime as attachment_mime, a.file_size as attachment_size from orders o left join order_attachments a on a.order_id = o.id where o.member_id = ? order by datetime(o.created_at) desc",
      [session.memberId]
    );
    return jsonOk({
      orders: rows.map((row) => ({
        id: row.id,
        memberId: row.member_id,
        memberLoginId: row.member_login_id,
        memberName: row.member_name,
        email: row.email,
        title: row.title,
        mediaId: row.media_id,
        mediaName: row.media_name,
        budget: Number(row.budget || 0),
        status: STATUS_VALUES.has(String(row.status)) ? row.status : "received",
        requestNote: row.request_note || "",
        hasAttachment: Boolean(row.attachment_name),
        attachmentName: row.attachment_name || "",
        attachmentMime: row.attachment_mime || "",
        attachmentSize: Number(row.attachment_size || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    return jsonError("주문 조회 중 오류가 발생했습니다.", 500);
  }
}

async function parseOrderInput(request) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return {
      mediaId: String(form.get("mediaId") || "").trim(),
      title: String(form.get("title") || "").trim(),
      requestNote: String(form.get("requestNote") || "").trim(),
      budget: Number(form.get("budget") || 0),
      draftFile: form.get("draftFile"),
    };
  }
  const body = await parseJson(request);
  return {
    mediaId: String(body.mediaId || "").trim(),
    title: sanitizePlainText(body.title, 120),
    requestNote: sanitizePlainText(body.requestNote, 1000),
    budget: Number(body.budget || 0),
    draftFile: null,
  };
}

export async function onRequestPost(context) {
  let uploadedKey = "";
  try {
    const session = await ensureMemberSession(context);
    if (!session) return jsonError("로그인이 필요합니다.", 401);
    await ensureOrderAttachmentTable(context.env);

    const input = await parseOrderInput(context.request);
    const mediaId = input.mediaId;
    const title = sanitizePlainText(input.title, 120);
    const requestNote = sanitizePlainText(input.requestNote, 1000);
    const ip = getRequestClientIp(context.request);

    if (!mediaId || !title) {
      return jsonError("주문명, 매체를 확인해 주세요.", 400);
    }

    const memberRows = await d1Query(
      context.env,
      "select id, login_id, name, email, point_balance from members where id = ? limit 1",
      [session.memberId]
    );
    if (!memberRows.length) return jsonError("회원 정보를 찾을 수 없습니다.", 404);
    const member = memberRows[0];

    const mediaRows = await d1Query(
      context.env,
      "select id, name, unit_price from media_channels where id = ? and is_active = 1 limit 1",
      [mediaId]
    );
    if (!mediaRows.length) return jsonError("선택한 매체를 찾을 수 없습니다.", 404);
    const media = mediaRows[0];
    const budget = Number(media.unit_price || 0);
    if (!Number.isFinite(budget) || budget <= 0) {
      return jsonError("선택한 매체의 단가 정보가 없어 주문할 수 없습니다.", 400);
    }

    const currentPoint = Number(member.point_balance || 0);
    if (budget > currentPoint) {
      return jsonError("현재 포인트를 초과했습니다.", 400);
    }

    const attachmentInfo = validateAttachmentFile(input.draftFile);
    if (!attachmentInfo.ok) {
      return jsonError(attachmentInfo.message, 400);
    }

    const orderId = `ord_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    if (attachmentInfo.hasFile) {
      const fileKey = buildAttachmentObjectKey(orderId, attachmentInfo.fileName);
      const fileBytes = await input.draftFile.arrayBuffer();
      try {
        await r2Put(context.env, fileKey, fileBytes, {
          httpMetadata: { contentType: attachmentInfo.fileMime },
          customMetadata: {
            orderId,
            memberId: member.id,
            memberLoginId: member.login_id,
          },
        });
      } catch (error) {
        return jsonError("첨부 파일 저장 중 오류가 발생했습니다.", 503);
      }
      uploadedKey = fileKey;
    }

    await d1Execute(
      context.env,
      "insert into orders (id, member_id, member_login_id, member_name, email, title, media_id, media_name, budget, status, request_note, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?, ?)",
      [
        orderId,
        member.id,
        member.login_id,
        member.name,
        member.email,
        title,
        media.id,
        media.name,
        Math.round(budget),
        requestNote,
        now,
        now,
      ]
    );
    if (attachmentInfo.hasFile) {
      await saveOrderAttachmentMeta(context.env, {
        orderId,
        fileKey: uploadedKey,
        fileName: attachmentInfo.fileName,
        fileMime: attachmentInfo.fileMime,
        fileSize: attachmentInfo.fileSize,
        uploadedByMemberId: member.id,
        uploadedAt: now,
      });
    }

    const nextPoint = Math.max(0, currentPoint - Math.round(budget));
    await d1Execute(context.env, "update members set point_balance = ?, updated_at = ? where id = ?", [
      nextPoint,
      now,
      member.id,
    ]);
    await d1Execute(context.env, "insert into admin_logs (message, created_at) values (?, ?)", [
      `주문 등록: ${title} (${member.email})`,
      now,
    ]);
    await writeSecurityAudit(context.env, {
      eventType: "member_order_created",
      actorType: "member",
      actorId: member.login_id,
      ip,
      outcome: "success",
      detail: `order_id=${orderId}`,
    });

    return jsonOk({
      order: {
        id: orderId,
        title,
        mediaId: media.id,
        mediaName: media.name,
        budget: Math.round(budget),
        status: "received",
        requestNote,
        hasAttachment: attachmentInfo.hasFile,
        attachmentName: attachmentInfo.hasFile ? attachmentInfo.fileName : "",
        attachmentMime: attachmentInfo.hasFile ? attachmentInfo.fileMime : "",
        attachmentSize: attachmentInfo.hasFile ? attachmentInfo.fileSize : 0,
        createdAt: now,
      },
      pointBalance: nextPoint,
    });
  } catch (error) {
    if (uploadedKey) {
      try {
        await r2Delete(context.env, uploadedKey);
      } catch (cleanupError) {}
    }
    return jsonError("주문 등록 중 오류가 발생했습니다.", 500);
  }
}
