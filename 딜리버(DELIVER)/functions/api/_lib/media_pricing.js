import { d1Execute, d1Query } from "./cloudflare_store.js";

const CATEGORY_SORT_ORDER = {
  일반: 1,
  의료: 2,
  비즈니스: 3,
  뷰티: 4,
  금융: 5,
};

let mediaPricingSchemaReady = false;

export function normalizePrice(value) {
  const n = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export function toPriceLabel(price) {
  const n = normalizePrice(price);
  return n > 0 ? `${n.toLocaleString("ko-KR")}원` : "회원전용";
}

export function computeMargin(supplyPrice, salePrice) {
  const supply = normalizePrice(supplyPrice);
  const sale = normalizePrice(salePrice);
  const marginAmount = Math.max(0, sale - supply);
  const marginRate = supply > 0 ? marginAmount / supply : 0;
  return { marginAmount, marginRate };
}

export function mediaCategorySortRank(category) {
  const key = String(category || "").trim();
  return CATEGORY_SORT_ORDER[key] || 99;
}

export async function ensureMediaPricingSchema(env) {
  if (mediaPricingSchemaReady) return;
  const columns = await d1Query(env, "pragma table_info(media_channels)");
  if (!columns.length) return;
  const names = new Set(columns.map((row) => String(row.name || "").toLowerCase()));

  if (!names.has("category_detail")) {
    await d1Execute(env, "alter table media_channels add column category_detail text not null default ''");
  }
  if (!names.has("supply_price")) {
    await d1Execute(env, "alter table media_channels add column supply_price integer not null default 0");
  }
  if (!names.has("sale_price")) {
    await d1Execute(env, "alter table media_channels add column sale_price integer not null default 0");
  }

  await d1Execute(
    env,
    "update media_channels set supply_price = case when coalesce(supply_price, 0) <= 0 then coalesce(unit_price, 0) else supply_price end where coalesce(supply_price, 0) <= 0"
  );
  await d1Execute(
    env,
    "update media_channels set sale_price = case when coalesce(sale_price, 0) <= 0 then coalesce(unit_price, 0) else sale_price end where coalesce(sale_price, 0) <= 0"
  );
  await d1Execute(env, "update media_channels set category_detail = '' where category_detail is null");
  await d1Execute(env, "create index if not exists idx_media_channels_category on media_channels(category)");
  await d1Execute(env, "create index if not exists idx_media_channels_sale_price on media_channels(sale_price)");

  mediaPricingSchemaReady = true;
}
