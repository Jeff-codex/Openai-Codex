import {
  d1Execute,
  getSessionToken,
  readSession,
} from "../../_lib/cloudflare_store.js";

export const MIN_POINT_CHARGE_AMOUNT = 1000;
export const MAX_POINT_CHARGE_AMOUNT = 5000000;

let pointChargePaymentsTableReady = false;

export function normalizeChargeAmount(value) {
  const raw = Number(value || 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.round(raw));
}

export async function ensureMemberSession(context) {
  const token = getSessionToken(context.request, "member");
  const session = await readSession(context.env, token, "member", context.request);
  if (!session?.memberId) return null;
  return session;
}

export function resolveReturnUrls(request, env) {
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
    fallbackUrl = `${requestUrl.origin}/01_서비스코드-ServiceCode/회원전용페이지-MemberPortal/index.html`;
  }
  return {
    successUrl: String(env.TOSS_SUCCESS_URL || fallbackUrl).trim() || fallbackUrl,
    failUrl: String(env.TOSS_FAIL_URL || fallbackUrl).trim() || fallbackUrl,
  };
}

export async function ensurePointChargePaymentsTable(env) {
  if (pointChargePaymentsTableReady) return;

  await d1Execute(
    env,
    "create table if not exists point_charge_payments (id text primary key, order_id text not null unique, member_id text not null, member_login_id text not null, amount integer not null, note text, status text not null default 'ready', payment_key text unique, method text, confirmed_at text, credited_at text, failure_code text, failure_message text, toss_raw text, created_at text not null default (datetime('now')), updated_at text not null default (datetime('now')), foreign key(member_id) references members(id) on delete cascade)"
  );
  await d1Execute(env, "create index if not exists idx_point_charge_payments_member_id on point_charge_payments(member_id)");
  await d1Execute(env, "create index if not exists idx_point_charge_payments_status on point_charge_payments(status)");
  await d1Execute(env, "create index if not exists idx_point_charge_payments_created_at on point_charge_payments(created_at)");
  await d1Execute(env, "create index if not exists idx_point_charge_payments_payment_key on point_charge_payments(payment_key)");
  await d1Execute(
    env,
    "create trigger if not exists trg_point_charge_confirmed_credit after update of status on point_charge_payments for each row when new.status = 'confirmed' and old.status != 'confirmed' and new.credited_at is null begin update members set point_balance = point_balance + new.amount, updated_at = coalesce(new.confirmed_at, new.updated_at, datetime('now')) where id = new.member_id; update point_charge_payments set credited_at = coalesce(new.confirmed_at, new.updated_at, datetime('now')) where order_id = new.order_id; end"
  );
  pointChargePaymentsTableReady = true;
}
