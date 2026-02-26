import { d1Query, ensureSecurityAuditTable, jsonError, jsonOk } from "../_lib/cloudflare_store.js";
import { ensureOrderAttachmentTable } from "../_lib/order_attachment_store.js";
import { ensureOrderPaymentSchema } from "../orders/_payment_common.js";
import { requireAdminSession } from "./_auth.js";

export async function onRequestGet(context) {
  try {
    const adminSession = await requireAdminSession(context);
    if (!adminSession) return jsonError("관리자 로그인이 필요합니다.", 401);
    await ensureOrderAttachmentTable(context.env);
    await ensureOrderPaymentSchema(context.env);
    await ensureSecurityAuditTable(context.env);

    const [members, orders, media, logs, securityLogs] = await Promise.all([
      d1Query(
        context.env,
        "select id, login_id, name, email, company, role, created_at from members order by datetime(created_at) desc"
      ),
      d1Query(
        context.env,
        "select o.id, o.order_number, o.member_id, o.member_login_id, o.member_name, o.email, o.title, o.media_id, o.media_name, o.budget, o.status, o.request_note, o.created_at, o.updated_at, o.ordered_at, o.payment_status, o.payment_total_amount, o.payment_vat_amount, o.payment_supply_amount, a.file_name as attachment_name, a.file_mime as attachment_mime, a.file_size as attachment_size, p.method as payment_method, p.status as payment_record_status, p.paid_at as payment_paid_at, r.status as refund_status, r.refund_amount, r.approved_at as refunded_at from orders o left join order_attachments a on a.order_id = o.id left join order_payments p on p.order_id = o.id left join (select pr1.order_id, pr1.status, pr1.refund_amount, pr1.approved_at from payment_refunds pr1 inner join (select order_id, max(created_at) as max_created_at from payment_refunds group by order_id) pr2 on pr1.order_id = pr2.order_id and pr1.created_at = pr2.max_created_at) r on r.order_id = o.id order by datetime(coalesce(o.ordered_at, o.created_at)) desc"
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
        createdAt: row.created_at,
      })),
      orders: orders.map((row) => ({
        id: row.id,
        orderNumber: row.order_number || "",
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
        orderedAt: row.ordered_at || row.created_at,
        updatedAt: row.updated_at,
        payment: {
          status: String(row.payment_status || row.payment_record_status || "paid"),
          supplyAmount: Number(row.payment_supply_amount || 0),
          vatAmount: Number(row.payment_vat_amount || 0),
          totalAmount: Number(row.payment_total_amount || 0),
          method: row.payment_method || "",
          paidAt: row.payment_paid_at || "",
        },
        refund: {
          status: row.refund_status || "",
          amount: Number(row.refund_amount || 0),
          refundedAt: row.refunded_at || "",
        },
        canRefund:
          String(row.payment_status || row.payment_record_status || "").toLowerCase() === "paid" &&
          String(row.refund_status || "").toLowerCase() !== "succeeded",
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
