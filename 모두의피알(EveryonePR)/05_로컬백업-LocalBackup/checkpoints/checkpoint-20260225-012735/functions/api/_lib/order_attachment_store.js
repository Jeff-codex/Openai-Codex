import { d1Execute, d1Query } from "./cloudflare_store.js";

const ALLOWED_EXTENSIONS = new Set([
  "txt",
  "doc",
  "docx",
  "hwp",
  "hwpx",
  "pdf",
  "rtf",
  "md",
  "odt",
]);

const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024;

export async function ensureOrderAttachmentTable(env) {
  await d1Execute(
    env,
    "create table if not exists order_attachments (order_id text primary key, file_key text not null, file_name text not null, file_mime text not null default 'application/octet-stream', file_size integer not null default 0, uploaded_by_member_id text, uploaded_at text not null default (datetime('now')), foreign key(order_id) references orders(id) on delete cascade)"
  );
  await d1Execute(env, "create index if not exists idx_order_attachments_uploaded_at on order_attachments(uploaded_at)");
}

function getFileExtension(fileName) {
  const name = String(fileName || "").trim().toLowerCase();
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "";
  return name.slice(idx + 1);
}

export function normalizeAttachmentName(fileName) {
  const raw = String(fileName || "").trim();
  if (!raw) return "attachment";
  return raw.replace(/[^\w.\-() \u3131-\u318E\uAC00-\uD7A3]/g, "_").slice(0, 180);
}

export function validateAttachmentFile(file) {
  if (!file || typeof file !== "object") {
    return { ok: true, hasFile: false };
  }

  const fileName = normalizeAttachmentName(file.name || "");
  const extension = getFileExtension(fileName);
  const size = Number(file.size || 0);
  if (!String(file.name || "").trim() && size <= 0) {
    return { ok: true, hasFile: false };
  }

  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      message: "지원되지 않는 파일 형식입니다. (txt, doc, docx, hwp, hwpx, pdf, rtf, md, odt)",
    };
  }
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, message: "첨부 파일을 확인해 주세요." };
  }
  if (size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, message: "첨부 파일은 30MB 이하만 업로드할 수 있습니다." };
  }

  const fileMime = String(file.type || "").trim() || "application/octet-stream";
  return {
    ok: true,
    hasFile: true,
    fileName,
    extension,
    fileMime,
    fileSize: Math.round(size),
  };
}

export function buildAttachmentObjectKey(orderId, fileName) {
  const safeName = normalizeAttachmentName(fileName);
  const stamp = Date.now();
  return `orders/${orderId}/${stamp}_${safeName}`;
}

export async function saveOrderAttachmentMeta(env, payload) {
  await d1Execute(
    env,
    "insert or replace into order_attachments (order_id, file_key, file_name, file_mime, file_size, uploaded_by_member_id, uploaded_at) values (?, ?, ?, ?, ?, ?, ?)",
    [
      payload.orderId,
      payload.fileKey,
      payload.fileName,
      payload.fileMime,
      Math.round(payload.fileSize || 0),
      payload.uploadedByMemberId || null,
      payload.uploadedAt || new Date().toISOString(),
    ]
  );
}

export async function getOrderAttachmentMeta(env, orderId) {
  const rows = await d1Query(
    env,
    "select order_id, file_key, file_name, file_mime, file_size, uploaded_by_member_id, uploaded_at from order_attachments where order_id = ? limit 1",
    [orderId]
  );
  if (!rows.length) return null;
  const row = rows[0];
  return {
    orderId: row.order_id,
    fileKey: row.file_key,
    fileName: row.file_name,
    fileMime: row.file_mime,
    fileSize: Number(row.file_size || 0),
    uploadedByMemberId: row.uploaded_by_member_id || null,
    uploadedAt: row.uploaded_at || null,
  };
}
