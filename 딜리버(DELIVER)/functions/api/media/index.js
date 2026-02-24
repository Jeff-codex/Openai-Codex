import { d1Query, jsonError, jsonOk } from "../_lib/cloudflare_store.js";

export async function onRequestGet(context) {
  try {
    const rows = await d1Query(
      context.env,
      "select id, name, category, byline_type, unit_price, member_price_label, channel, description, is_active from media_channels where is_active = 1 order by unit_price asc, name asc"
    );
    const media = rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      bylineType: row.byline_type || "",
      unitPrice: Number(row.unit_price || 0),
      memberPrice: row.member_price_label || "",
      channel: row.channel || "",
      description: row.description || "",
      isActive: Number(row.is_active || 0) === 1,
    }));
    return jsonOk({ media });
  } catch (error) {
    return jsonError("매체 조회 중 오류가 발생했습니다.", 500);
  }
}
