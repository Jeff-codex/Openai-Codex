import { jsonError, r2Get } from "../_lib/cloudflare_store.js";
import { ensureOrderAttachmentTable, getOrderAttachmentMeta } from "../_lib/order_attachment_store.js";
import { requireAdminSession } from "./_auth.js";

function buildContentDisposition(fileName, download) {
  const safeName = String(fileName || "attachment.bin").replace(/["\r\n]/g, "_");
  const encoded = encodeURIComponent(safeName);
  const mode = download ? "attachment" : "inline";
  return `${mode}; filename="${safeName}"; filename*=UTF-8''${encoded}`;
}

export async function onRequestGet(context) {
  try {
    const adminSession = await requireAdminSession(context);
    if (!adminSession) return jsonError("관리자 로그인이 필요합니다.", 401);

    const url = new URL(context.request.url);
    const orderId = String(url.searchParams.get("orderId") || "").trim();
    const asDownload = url.searchParams.get("download") === "1";
    if (!orderId || orderId.length > 80) return jsonError("orderId가 필요합니다.", 400);

    await ensureOrderAttachmentTable(context.env);
    const meta = await getOrderAttachmentMeta(context.env, orderId);
    if (!meta) return jsonError("첨부 파일이 없습니다.", 404);

    const object = await r2Get(context.env, meta.fileKey);
    if (!object) return jsonError("첨부 파일을 찾을 수 없습니다.", 404);

    const headers = new Headers();
    headers.set("cache-control", "no-store");
    headers.set("content-type", meta.fileMime || object.httpMetadata?.contentType || "application/octet-stream");
    headers.set("content-disposition", buildContentDisposition(meta.fileName, asDownload));
    if (Number.isFinite(Number(meta.fileSize)) && Number(meta.fileSize) > 0) {
      headers.set("content-length", String(Math.round(Number(meta.fileSize))));
    }

    return new Response(object.body, { status: 200, headers });
  } catch (error) {
    return jsonError("첨부 파일 조회 중 오류가 발생했습니다.", 500);
  }
}
