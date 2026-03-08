import { d1Query, jsonError, jsonOk } from "../_lib/cloudflare_store.js";
import { ensureMediaPricingSchema, mediaCategorySortRank } from "../_lib/media_pricing.js";

export async function onRequestGet(context) {
  try {
    await ensureMediaPricingSchema(context.env);
    const rows = await d1Query(
      context.env,
      "select id, name, category, category_detail, byline_type, supply_price, sale_price, unit_price, member_price_label, channel, description, is_active from media_channels where is_active = 1"
    );
    const media = rows
      .map((row) => {
        const salePrice = Number(row.sale_price || row.unit_price || 0);
        return {
          id: row.id,
          name: row.name,
          category: row.category,
          categoryDetail: row.category_detail || "",
          bylineType: row.byline_type || "",
          salePrice,
          unitPrice: salePrice,
          memberPrice: row.member_price_label || "",
          channel: row.channel || "",
          description: row.description || "",
          isActive: Number(row.is_active || 0) === 1,
        };
      })
      .sort((a, b) => {
        const categoryDiff = mediaCategorySortRank(a.category) - mediaCategorySortRank(b.category);
        if (categoryDiff !== 0) return categoryDiff;
        const priceDiff = Number(a.salePrice || 0) - Number(b.salePrice || 0);
        if (priceDiff !== 0) return priceDiff;
        return String(a.name || "").localeCompare(String(b.name || ""), "ko-KR");
      });
    return jsonOk({ media });
  } catch (error) {
    return jsonError("매체 조회 중 오류가 발생했습니다.", 500);
  }
}
