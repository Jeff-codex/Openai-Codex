import { d1Query, hasR2Binding, jsonError, jsonOk } from "./_lib/cloudflare_store.js";

export async function onRequestGet(context) {
  try {
    const rows = await d1Query(context.env, "select count(*) as media_count from media_channels");
    return jsonOk({
      mode: "cloudflare",
      mediaCount: Number(rows[0]?.media_count || 0),
      r2Ready: hasR2Binding(context.env),
      now: new Date().toISOString(),
    });
  } catch (error) {
    return jsonError("헬스체크 오류가 발생했습니다.", 500);
  }
}
