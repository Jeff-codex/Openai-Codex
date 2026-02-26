import { d1Query, jsonError, jsonOk } from "../_lib/cloudflare_store.js";
import { ensureOrderAttachmentTable } from "../_lib/order_attachment_store.js";
import { ensureMemberSession, ensureOrderPaymentSchema } from "./_payment_common.js";

const STATUS_VALUES = new Set(["received", "reviewing", "queued", "published", "rejected"]);

export async function onRequestGet(context) {
  try {
    const session = await ensureMemberSession(context);
    if (!session) return jsonError("로그인이 필요합니다.", 401);

    await ensureOrderAttachmentTable(context.env);
    await ensureOrderPaymentSchema(context.env);

    const rows = await d1Query(
      context.env,
      "select o.id, o.order_number, o.member_id, o.member_login_id, o.member_name, o.email, o.title, o.media_id, o.media_name, o.budget, o.status, o.request_note, o.created_at, o.updated_at, o.ordered_at, o.payment_status, o.payment_total_amount, o.payment_vat_amount, o.payment_supply_amount, a.file_name as attachment_name, a.file_mime as attachment_mime, a.file_size as attachment_size, p.method as payment_method, p.status as payment_record_status, p.paid_at as payment_paid_at from orders o left join order_attachments a on a.order_id = o.id left join order_payments p on p.order_id = o.id where o.member_id = ? order by datetime(coalesce(o.ordered_at, o.created_at)) desc",
      [session.memberId]
    );
    return jsonOk({
      orders: rows.map((row) => ({
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
        status: STATUS_VALUES.has(String(row.status)) ? row.status : "received",
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
      })),
    });
  } catch (error) {
    return jsonError("주문 조회 중 오류가 발생했습니다.", 500);
  }
}

export async function onRequestPost() {
  return jsonError("주문 등록은 결제 절차를 통해서만 가능합니다.", 409);
}
