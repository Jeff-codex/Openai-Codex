import {
  d1Execute,
  d1Query,
  getRequestClientIp,
  jsonError,
  jsonOk,
  normalizeEmail,
  parseJson,
  sanitizePlainText,
  writeSecurityAudit,
} from "../_lib/cloudflare_store.js";
import { requireAdminSession } from "./_auth.js";

const STATUS_VALUES = new Set(["received", "reviewing", "queued", "published", "rejected"]);

export async function onRequestPatch(context) {
  try {
    const adminSession = await requireAdminSession(context);
    if (!adminSession) return jsonError("관리자 로그인이 필요합니다.", 401);

    const body = await parseJson(context.request);
    const orderId = sanitizePlainText(body.orderId, 80);
    const nextStatus = String(body.status || "").trim();
    const note = sanitizePlainText(body.note, 500);
    const ip = getRequestClientIp(context.request);
    if (!orderId || !STATUS_VALUES.has(nextStatus)) {
      return jsonError("주문 ID 또는 상태값이 유효하지 않습니다.", 400);
    }

    const rows = await d1Query(context.env, "select id, title, status from orders where id = ? limit 1", [orderId]);
    if (!rows.length) return jsonError("주문을 찾을 수 없습니다.", 404);
    const order = rows[0];
    const prevStatus = String(order.status || "received");
    const now = new Date().toISOString();

    await d1Execute(context.env, "update orders set status = ?, updated_at = ? where id = ?", [
      nextStatus,
      now,
      orderId,
    ]);
    await d1Execute(
      context.env,
      "insert into order_status_logs (order_id, from_status, to_status, changed_by, note, changed_at) values (?, ?, ?, ?, ?, ?)",
      [orderId, prevStatus, nextStatus, adminSession.adminId, note, now]
    );
    await d1Execute(context.env, "insert into admin_logs (message, created_at) values (?, ?)", [
      `주문 상태 변경: ${order.title} (${prevStatus} -> ${nextStatus})`,
      now,
    ]);
    await writeSecurityAudit(context.env, {
      eventType: "admin_order_status_changed",
      actorType: "admin",
      actorId: adminSession.loginId || adminSession.adminId,
      ip,
      outcome: "success",
      detail: `${orderId}:${prevStatus}->${nextStatus}`,
    });

    return jsonOk({ orderId, previousStatus: prevStatus, status: nextStatus });
  } catch (error) {
    return jsonError("주문 상태 변경 중 오류가 발생했습니다.", 500);
  }
}

export async function onRequestPost(context) {
  try {
    const adminSession = await requireAdminSession(context);
    if (!adminSession) return jsonError("관리자 로그인이 필요합니다.", 401);

    const body = await parseJson(context.request);
    const email = normalizeEmail(body.email);
    const title = sanitizePlainText(body.title, 120);
    const mediaId = sanitizePlainText(body.mediaId, 80);
    const budget = Number(body.budget || 0);
    const ip = getRequestClientIp(context.request);

    if (!title || !mediaId || !Number.isFinite(budget) || budget <= 0 || budget > 1000000000) {
      return jsonError("주문명, 매체, 예산을 올바르게 입력해 주세요.", 400);
    }

    const mediaRows = await d1Query(context.env, "select id, name from media_channels where id = ? limit 1", [mediaId]);
    if (!mediaRows.length) return jsonError("매체를 찾을 수 없습니다.", 404);
    const media = mediaRows[0];

    let memberId = null;
    let memberLoginId = null;
    let memberName = null;
    if (email) {
      const memberRows = await d1Query(
        context.env,
        "select id, login_id, name from members where email = ? limit 1",
        [email]
      );
      if (memberRows.length) {
        memberId = memberRows[0].id;
        memberLoginId = memberRows[0].login_id;
        memberName = memberRows[0].name;
      }
    }

    const orderId = `ord_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await d1Execute(
      context.env,
      "insert into orders (id, member_id, member_login_id, member_name, email, title, media_id, media_name, budget, status, request_note, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', '', ?, ?)",
      [
        orderId,
        memberId,
        memberLoginId,
        memberName,
        email,
        title,
        media.id,
        media.name,
        Math.round(budget),
        now,
        now,
      ]
    );
    await d1Execute(context.env, "insert into admin_logs (message, created_at) values (?, ?)", [
      `관리자 주문 등록: ${title} (${email || "미지정"})`,
      now,
    ]);
    await writeSecurityAudit(context.env, {
      eventType: "admin_order_created",
      actorType: "admin",
      actorId: adminSession.loginId || adminSession.adminId,
      ip,
      outcome: "success",
      detail: `order_id=${orderId}`,
    });

    return jsonOk({
      order: {
        id: orderId,
        title,
        email,
        mediaId: media.id,
        mediaName: media.name,
        budget: Math.round(budget),
        status: "received",
        createdAt: now,
      },
    });
  } catch (error) {
    return jsonError("관리자 주문 등록 중 오류가 발생했습니다.", 500);
  }
}
