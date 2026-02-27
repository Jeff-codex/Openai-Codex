import {
  d1Execute,
  d1Query,
  getSessionToken,
  jsonError,
  r2Delete,
  readSession,
  sanitizePlainText,
} from "../_lib/cloudflare_store.js";

export const PAYMENT_INTENT_TTL_SEC = 60 * 30;

const DEFAULT_MEMBER_PORTAL_PATH = "/01_서비스코드-ServiceCode/회원전용페이지-MemberPortal/index.html";

const TOSS_PAYMENT_METHODS = [
  { id: "CARD", label: "카드", sdkMethod: "카드" },
  { id: "TRANSFER", label: "계좌이체", sdkMethod: "계좌이체" },
  { id: "VIRTUAL_ACCOUNT", label: "가상계좌", sdkMethod: "가상계좌" },
  { id: "MOBILE_PHONE", label: "휴대폰", sdkMethod: "휴대폰" },
];

let paymentSchemaReady = false;

function normalizeIsoText(value) {
  const text = String(value || "").trim();
  if (!text) return new Date().toISOString();
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function buildDateKey(dateInput) {
  const date = new Date(dateInput);
  if (!Number.isFinite(date.getTime())) {
    const now = new Date();
    return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  }
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

function appendQuery(urlText, key, value) {
  const source = String(urlText || "").trim();
  if (!source) return "";
  try {
    const url = new URL(source);
    url.searchParams.set(key, String(value || ""));
    return url.toString();
  } catch (error) {
    return source;
  }
}

async function ensureOrdersExtraColumns(env) {
  const columns = await d1Query(env, "pragma table_info(orders)");
  const names = new Set(columns.map((row) => String(row.name || "").toLowerCase()));
  const alters = [
    ["order_number", "alter table orders add column order_number text"],
    ["ordered_at", "alter table orders add column ordered_at text"],
    ["payment_status", "alter table orders add column payment_status text not null default 'unpaid'"],
    ["payment_total_amount", "alter table orders add column payment_total_amount integer not null default 0"],
    ["payment_vat_amount", "alter table orders add column payment_vat_amount integer not null default 0"],
    ["payment_supply_amount", "alter table orders add column payment_supply_amount integer not null default 0"],
  ];
  for (const [key, sql] of alters) {
    if (names.has(key)) continue;
    await d1Execute(env, sql);
  }
  await d1Execute(env, "create unique index if not exists idx_orders_order_number on orders(order_number)");
  await d1Execute(env, "create index if not exists idx_orders_ordered_at on orders(ordered_at)");
  await d1Execute(env, "create index if not exists idx_orders_payment_status on orders(payment_status)");
}

export async function ensureOrderPaymentSchema(env) {
  if (paymentSchemaReady) return;

  await ensureOrdersExtraColumns(env);
  await d1Execute(
    env,
    "create table if not exists order_payment_intents (id text primary key, intent_id text not null unique, member_id text not null, member_login_id text not null, media_id text not null, media_name text not null, unit_price integer not null, vat_amount integer not null, total_amount integer not null, draft_title text not null, draft_note text, draft_file_key text, draft_file_name text, draft_file_mime text, draft_file_size integer not null default 0, status text not null default 'ready', payment_method text, toss_payment_key text unique, toss_order_id text not null unique, toss_method text, toss_raw text, failure_code text, failure_message text, order_id text, expires_at text not null, created_at text not null default (datetime('now')), updated_at text not null default (datetime('now')), foreign key(member_id) references members(id) on delete cascade, foreign key(order_id) references orders(id) on delete set null)"
  );
  await d1Execute(env, "create index if not exists idx_order_payment_intents_member_id on order_payment_intents(member_id)");
  await d1Execute(env, "create index if not exists idx_order_payment_intents_status on order_payment_intents(status)");
  await d1Execute(env, "create index if not exists idx_order_payment_intents_created_at on order_payment_intents(created_at)");
  await d1Execute(env, "create index if not exists idx_order_payment_intents_expires_at on order_payment_intents(expires_at)");

  await d1Execute(
    env,
    "create table if not exists order_payments (id text primary key, order_id text not null unique, member_id text not null, amount_supply integer not null, amount_vat integer not null, amount_total integer not null, payment_provider text not null default 'toss', payment_key text not null unique, order_id_pg text not null unique, method text, status text not null default 'paid', paid_at text not null, raw_payload text, created_at text not null default (datetime('now')), updated_at text not null default (datetime('now')), foreign key(order_id) references orders(id) on delete cascade, foreign key(member_id) references members(id) on delete cascade)"
  );
  await d1Execute(env, "create index if not exists idx_order_payments_member_id on order_payments(member_id)");
  await d1Execute(env, "create index if not exists idx_order_payments_status on order_payments(status)");
  await d1Execute(env, "create index if not exists idx_order_payments_paid_at on order_payments(paid_at)");

  await d1Execute(
    env,
    "create table if not exists payment_refunds (id text primary key, refund_id text not null unique, order_id text not null, payment_id text not null, refund_amount integer not null, status text not null default 'requested', reason text, requested_by text, approved_at text, toss_refund_key text, failure_code text, failure_message text, raw_payload text, created_at text not null default (datetime('now')), updated_at text not null default (datetime('now')), foreign key(order_id) references orders(id) on delete cascade, foreign key(payment_id) references order_payments(id) on delete cascade)"
  );
  await d1Execute(env, "create index if not exists idx_payment_refunds_order_id on payment_refunds(order_id)");
  await d1Execute(env, "create index if not exists idx_payment_refunds_payment_id on payment_refunds(payment_id)");
  await d1Execute(env, "create index if not exists idx_payment_refunds_status on payment_refunds(status)");
  await d1Execute(env, "create index if not exists idx_payment_refunds_created_at on payment_refunds(created_at)");

  await d1Execute(
    env,
    "create table if not exists order_number_sequences (date_key text primary key, last_value integer not null default 0, updated_at text not null default (datetime('now')))"
  );

  paymentSchemaReady = true;
}

export function normalizeAmount(value) {
  const raw = Number(value || 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.round(raw));
}

export function calculateOrderAmounts(unitPrice) {
  const supplyAmount = normalizeAmount(unitPrice);
  const vatAmount = Math.round(supplyAmount * 0.1);
  const totalAmount = supplyAmount + vatAmount;
  return { supplyAmount, vatAmount, totalAmount };
}

export function toSnippet(value, maxLength = 4000) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

export function listPaymentMethods() {
  return TOSS_PAYMENT_METHODS.map((item) => ({
    id: item.id,
    label: item.label,
    sdkMethod: item.sdkMethod,
  }));
}

export function normalizePaymentMethod(value) {
  const source = String(value || "").trim();
  if (!source) return TOSS_PAYMENT_METHODS[0];
  const upper = source.toUpperCase();
  const found =
    TOSS_PAYMENT_METHODS.find((item) => item.id === upper) ||
    TOSS_PAYMENT_METHODS.find((item) => item.sdkMethod === source) ||
    TOSS_PAYMENT_METHODS.find((item) => item.label === source);
  return found || TOSS_PAYMENT_METHODS[0];
}

export function getPaymentIntegrationStatus(env) {
  const clientKey = String(env?.TOSS_CLIENT_KEY || "").trim();
  const secretKey = String(env?.TOSS_SECRET_KEY || "").trim();
  const successUrl = String(env?.TOSS_SUCCESS_URL || "").trim();
  const failUrl = String(env?.TOSS_FAIL_URL || "").trim();
  const ready = Boolean(clientKey && secretKey && successUrl && failUrl);
  if (ready) {
    return { ready: true, message: "" };
  }
  return {
    ready: false,
    message: "토스페이먼츠 결제 연동 심사중입니다. 심사 완료 후 결제가 오픈됩니다.",
  };
}

export async function ensureMemberSession(context) {
  const token = getSessionToken(context.request, "member");
  const session = await readSession(context.env, token, "member", context.request);
  if (!session?.memberId) return null;
  return session;
}

export async function getMemberById(env, memberId) {
  const rows = await d1Query(env, "select id, login_id, name, email from members where id = ? limit 1", [memberId]);
  if (!rows.length) return null;
  return rows[0];
}

export function computeExpiryIso(nowIso = new Date().toISOString(), ttlSec = PAYMENT_INTENT_TTL_SEC) {
  const base = new Date(normalizeIsoText(nowIso));
  const next = new Date(base.getTime() + Math.max(60, Number(ttlSec || PAYMENT_INTENT_TTL_SEC)) * 1000);
  return next.toISOString();
}

export async function generateOrderNumber(env, nowIso = new Date().toISOString()) {
  const normalizedNow = normalizeIsoText(nowIso);
  const dateKey = buildDateKey(normalizedNow);
  await d1Execute(
    env,
    "insert or ignore into order_number_sequences (date_key, last_value, updated_at) values (?, 0, ?)",
    [dateKey, normalizedNow]
  );
  const rows = await d1Query(
    env,
    "update order_number_sequences set last_value = last_value + 1, updated_at = ? where date_key = ? returning last_value",
    [normalizedNow, dateKey]
  );
  const seq = Math.max(1, normalizeAmount(rows[0]?.last_value || 0));
  return `${dateKey.slice(2)}-${String(seq).padStart(6, "0")}`;
}

export async function cleanupExpiredPaymentIntents(env, limit = 30) {
  const rows = await d1Query(
    env,
    "select intent_id, draft_file_key from order_payment_intents where status in ('ready', 'redirected', 'failed') and datetime(expires_at) <= datetime('now') order by datetime(expires_at) asc limit ?",
    [Math.max(1, Math.min(200, Number(limit || 30)))]
  );
  if (!rows.length) return 0;
  let done = 0;
  for (const row of rows) {
    const now = new Date().toISOString();
    await d1Execute(
      env,
      "update order_payment_intents set status = 'expired', updated_at = ? where intent_id = ? and status in ('ready', 'redirected', 'failed')",
      [now, row.intent_id]
    );
    const key = String(row.draft_file_key || "").trim();
    if (key) {
      try {
        await r2Delete(env, key);
      } catch (error) {
      }
    }
    done += 1;
  }
  return done;
}

export function resolveReturnUrls(request, env, intentId) {
  const requestUrl = new URL(request.url);
  const configuredPortalUrl = String(env.MEMBER_PORTAL_URL || "").trim();
  let fallbackUrl = configuredPortalUrl;
  if (!fallbackUrl) {
    const referer = String(request.headers.get("referer") || "").trim();
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        if (refererUrl.origin === requestUrl.origin) {
          refererUrl.search = "";
          refererUrl.hash = "";
          fallbackUrl = refererUrl.toString();
        }
      } catch (error) {
      }
    }
  }
  if (!fallbackUrl) {
    fallbackUrl = `${requestUrl.origin}${DEFAULT_MEMBER_PORTAL_PATH}`;
  }
  const successBase = String(env.TOSS_SUCCESS_URL || fallbackUrl).trim() || fallbackUrl;
  const failBase = String(env.TOSS_FAIL_URL || fallbackUrl).trim() || fallbackUrl;
  return {
    successUrl: appendQuery(successBase, "intentId", intentId),
    failUrl: appendQuery(failBase, "intentId", intentId),
  };
}

export async function fetchIntentForMember(env, intentId, memberId) {
  const rows = await d1Query(
    env,
    "select id, intent_id, member_id, member_login_id, media_id, media_name, unit_price, vat_amount, total_amount, draft_title, draft_note, draft_file_key, draft_file_name, draft_file_mime, draft_file_size, status, payment_method, toss_payment_key, toss_order_id, toss_method, failure_code, failure_message, order_id, expires_at, created_at, updated_at from order_payment_intents where intent_id = ? and member_id = ? limit 1",
    [intentId, memberId]
  );
  if (!rows.length) return null;
  return rows[0];
}

export async function fetchOrderAndPayment(env, orderId, memberId = "") {
  const params = [orderId];
  let where = "where o.id = ?";
  if (memberId) {
    where += " and o.member_id = ?";
    params.push(memberId);
  }
  const rows = await d1Query(
    env,
    `select o.id, o.order_number, o.media_name, o.title, o.status, o.ordered_at, o.created_at, o.payment_status, o.payment_total_amount, o.payment_vat_amount, o.payment_supply_amount, p.method as payment_method, p.paid_at as payment_paid_at, p.status as payment_record_status from orders o left join order_payments p on p.order_id = o.id ${where} limit 1`,
    params
  );
  if (!rows.length) return null;
  return rows[0];
}

export function toIntentSummary(intent) {
  return {
    intentId: intent.intent_id,
    status: String(intent.status || "ready"),
    mediaName: intent.media_name,
    title: intent.draft_title,
    supplyAmount: Number(intent.unit_price || 0),
    vatAmount: Number(intent.vat_amount || 0),
    totalAmount: Number(intent.total_amount || 0),
    paymentMethod: String(intent.payment_method || ""),
    failureCode: String(intent.failure_code || ""),
    failureMessage: String(intent.failure_message || ""),
    expiresAt: intent.expires_at,
    createdAt: intent.created_at,
    updatedAt: intent.updated_at,
  };
}

export function buildOrderPaymentResponse(orderRow) {
  return {
    order: {
      id: orderRow.id,
      orderNumber: orderRow.order_number || "",
      title: orderRow.title || "",
      mediaName: orderRow.media_name || "",
      status: orderRow.status || "received",
      orderedAt: orderRow.ordered_at || orderRow.created_at,
    },
    payment: {
      status: String(orderRow.payment_status || orderRow.payment_record_status || "paid"),
      supplyAmount: Number(orderRow.payment_supply_amount || 0),
      vatAmount: Number(orderRow.payment_vat_amount || 0),
      totalAmount: Number(orderRow.payment_total_amount || 0),
      method: String(orderRow.payment_method || ""),
      paidAt: orderRow.payment_paid_at || "",
    },
  };
}

export function buildRefundPolicyHtml() {
  return [
    "<h4>환불 규정 안내</h4>",
    "<p>결제 완료 후 서비스 착수 전 취소 요청 시 전액 환불됩니다.</p>",
    "<p>서비스 착수 후(주문 접수 후 검수/수정요청 안내 또는 매체 배포요청 진행 시점)에는 진행 단계에 따라 환불이 제한될 수 있습니다.</p>",
    "<p>검수/수정 요청 단계: 결제금액의 70% 환불</p>",
    "<p>배포 요청 진행 이후: 환불 불가</p>",
    "<p>환불은 결제에 사용한 동일 결제수단으로만 처리됩니다.</p>",
    "<p>결제 금액은 부가세(VAT) 포함 최종 금액이며, 환불 시에도 결제된 최종 금액 기준으로 처리됩니다.</p>",
    "<p>환불 요청은 우측하단 채널톡으로 접수 가능하며, 승인 후 결제수단별로 영업일 기준 일정 기간이 소요될 수 있습니다.</p>",
  ].join("");
}

export function getIntentIdFromContext(context) {
  const value = sanitizePlainText(context?.params?.intentId, 90);
  return String(value || "").trim();
}

export function ensureIntentNotExpired(intent, env, nowIso = new Date().toISOString()) {
  const expiry = new Date(String(intent?.expires_at || ""));
  const now = new Date(normalizeIsoText(nowIso));
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() > now.getTime()) return true;
  return false;
}

export async function markIntentExpired(env, intentId, nowIso = new Date().toISOString()) {
  const now = normalizeIsoText(nowIso);
  await d1Execute(
    env,
    "update order_payment_intents set status = 'expired', updated_at = ? where intent_id = ? and status in ('ready', 'redirected', 'failed')",
    [now, intentId]
  );
}

export function encodeBasicAuth(secretKey) {
  return `Basic ${btoa(`${String(secretKey || "")}:`)}`;
}

export function createIntentGoneResponse() {
  return jsonError("결제 유효시간이 만료되었습니다. 주문을 다시 시도해 주세요.", 410);
}
