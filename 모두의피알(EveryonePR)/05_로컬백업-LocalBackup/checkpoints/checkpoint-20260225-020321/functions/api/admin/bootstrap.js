import { d1Query, ensureSecurityAuditTable, jsonError, jsonOk } from "../_lib/cloudflare_store.js";
import { ensureOrderAttachmentTable } from "../_lib/order_attachment_store.js";
import { requireAdminSession } from "./_auth.js";

export async function onRequestGet(context) {
  try {
    const adminSession = await requireAdminSession(context);
    if (!adminSession) return jsonError("관리자 로그인이 필요합니다.", 401);
    await ensureOrderAttachmentTable(context.env);
    await ensureSecurityAuditTable(context.env);

    const [members, orders, media, logs, securityLogs] = await Promise.all([
      d1Query(
        context.env,
        "select id, login_id, name, email, company, role, point_balance, created_at from members order by datetime(created_at) desc"
      ),
      d1Query(
        context.env,
        "select o.id, o.member_id, o.member_login_id, o.member_name, o.email, o.title, o.media_id, o.media_name, o.budget, o.status, o.request_note, o.created_at, o.updated_at, a.file_name as attachment_name, a.file_mime as attachment_mime, a.file_size as attachment_size from orders o left join order_attachments a on a.order_id = o.id order by datetime(o.created_at) desc"
      ),
      d1Query(
        context.env,
        "select id, name, category, byline_type, unit_price, member_price_label, channel, description, is_active, created_at from media_channels order by unit_price asc, name asc"
      ),
      d1Query(
        context.env,
        "select id, message, created_at from admin_logs order by id desc limit 120"
      ),
      d1Query(
        context.env,
        "select id, event_type, actor_type, actor_id, ip, outcome, detail, created_at from security_audit_logs order by id desc limit 200"
      ),
    ]);

    return jsonOk({
      admin: {
        id: adminSession.adminId,
        loginId: adminSession.loginId || "admin",
      },
      members: members.map((row) => ({
        id: row.id,
        loginId: row.login_id,
        name: row.name,
        email: row.email,
        company: row.company || "",
        role: row.role || "member",
        pointBalance: Number(row.point_balance || 0),
        createdAt: row.created_at,
      })),
      orders: orders.map((row) => ({
        id: row.id,
        memberId: row.member_id,
        memberLoginId: row.member_login_id,
        memberName: row.member_name,
        email: row.email,
        title: row.title,
        mediaId: row.media_id,
        mediaName: row.media_name,
        budget: Number(row.budget || 0),
        status: row.status || "received",
        requestNote: row.request_note || "",
        hasAttachment: Boolean(row.attachment_name),
        attachmentName: row.attachment_name || "",
        attachmentMime: row.attachment_mime || "",
        attachmentSize: Number(row.attachment_size || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      media: media.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        bylineType: row.byline_type || "",
        unitPrice: Number(row.unit_price || 0),
        memberPrice: row.member_price_label || "",
        channel: row.channel || "",
        description: row.description || "",
        isActive: Number(row.is_active || 0) === 1,
        createdAt: row.created_at,
      })),
      logs: logs.map((row) => ({
        id: row.id,
        message: row.message,
        createdAt: row.created_at,
      })),
      securityLogs: securityLogs.map((row) => ({
        id: row.id,
        eventType: row.event_type || "unknown",
        actorType: row.actor_type || "system",
        actorId: row.actor_id || "",
        ip: row.ip || "",
        outcome: row.outcome || "success",
        detail: row.detail || "",
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return jsonError("관리자 데이터 조회 중 오류가 발생했습니다.", 500);
  }
}
