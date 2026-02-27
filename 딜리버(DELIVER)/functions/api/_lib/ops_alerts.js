const TELEGRAM_API_BASE = "https://api.telegram.org";
const DEFAULT_ADMIN_PORTAL_URL = "https://admin.dliver.co.kr/";
const DEFAULT_TIMEOUT_MS = 2500;

const KRW_FORMATTER = new Intl.NumberFormat("ko-KR");

function sanitizeText(value, maxLength = 160) {
  const text = String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function normalizeTimeoutMs(value) {
  const raw = Number(value || 0);
  if (!Number.isFinite(raw)) return DEFAULT_TIMEOUT_MS;
  return Math.max(500, Math.min(10000, Math.round(raw)));
}

function isEnabledText(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  return text === "1" || text === "true" || text === "yes" || text === "on";
}

function formatAmount(amount) {
  const raw = Number(amount || 0);
  const normalized = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
  return `${KRW_FORMATTER.format(normalized)}원`;
}

function resolveAdminPortalUrl(env, payload = {}) {
  const payloadUrl = sanitizeText(payload.adminUrl, 220);
  if (payloadUrl) return payloadUrl;
  const envUrl = sanitizeText(env?.ADMIN_PORTAL_URL, 220);
  if (envUrl) return envUrl;
  return DEFAULT_ADMIN_PORTAL_URL;
}

function buildOrderPaidMessage(env, payload = {}) {
  const orderNumber = sanitizeText(payload.orderNumber, 80) || "-";
  const memberLoginId = sanitizeText(payload.memberLoginId, 80) || "-";
  const mediaName = sanitizeText(payload.mediaName, 80) || "-";
  const totalAmount = formatAmount(payload.totalAmount);
  const paidAt = sanitizeText(payload.paidAt, 80) || new Date().toISOString();
  const adminUrl = resolveAdminPortalUrl(env, payload);
  return [
    "주문 결제 완료 알림",
    "",
    `주문번호: ${orderNumber}`,
    `회원아이디: ${memberLoginId}`,
    `매체명: ${mediaName}`,
    `결제금액: ${totalAmount}`,
    `결제시각: ${paidAt}`,
    "",
    `관리자 확인: ${adminUrl}`,
  ].join("\n");
}

function buildResult(ok, fields = {}) {
  return {
    ok,
    skipped: Boolean(fields.skipped),
    status: Number(fields.status || 0),
    reason: sanitizeText(fields.reason, 180),
  };
}

export function isTelegramOrderAlertEnabled(env) {
  return isEnabledText(env?.OPS_ALERT_TELEGRAM_ENABLED);
}

export async function sendOrderPaidTelegramAlert(env, payload = {}) {
  if (!isTelegramOrderAlertEnabled(env)) {
    return buildResult(false, { skipped: true, reason: "disabled" });
  }

  const botToken = sanitizeText(env?.OPS_ALERT_TELEGRAM_BOT_TOKEN, 200);
  const chatId = sanitizeText(env?.OPS_ALERT_TELEGRAM_CHAT_ID, 80);
  if (!botToken || !chatId) {
    return buildResult(false, { reason: "missing_config" });
  }

  const timeoutMs = normalizeTimeoutMs(env?.OPS_ALERT_TIMEOUT_MS);
  const message = buildOrderPaidMessage(env, payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = sanitizeText(json?.description || `http_${response.status}`, 180) || `http_${response.status}`;
      return buildResult(false, { status: response.status, reason });
    }
    if (json && json.ok === false) {
      return buildResult(false, {
        status: response.status,
        reason: sanitizeText(json.description || "telegram_rejected", 180),
      });
    }
    return buildResult(true, { status: response.status || 200, reason: "sent" });
  } catch (error) {
    const reason = error?.name === "AbortError" ? "timeout" : sanitizeText(error?.message || "fetch_failed", 180);
    return buildResult(false, { reason });
  } finally {
    clearTimeout(timer);
  }
}
