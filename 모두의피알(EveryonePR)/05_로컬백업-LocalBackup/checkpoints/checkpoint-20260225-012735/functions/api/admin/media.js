import {
  d1Execute,
  d1Query,
  getRequestClientIp,
  jsonError,
  jsonOk,
  parseJson,
  sanitizePlainText,
  writeSecurityAudit,
} from "../_lib/cloudflare_store.js";
import { requireAdminSession } from "./_auth.js";

function parsePrice(value) {
  const n = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export async function onRequestPost(context) {
  try {
    const adminSession = await requireAdminSession(context);
    if (!adminSession) return jsonError("관리자 로그인이 필요합니다.", 401);

    const body = await parseJson(context.request);
    const name = sanitizePlainText(body.name, 120);
    const category = sanitizePlainText(body.category, 80);
    const memberPrice = sanitizePlainText(body.memberPrice || "회원전용", 80) || "회원전용";
    const unitPrice = parsePrice(body.unitPrice || memberPrice);
    const ip = getRequestClientIp(context.request);

    if (!name || !category) {
      return jsonError("매체명과 카테고리를 입력해 주세요.", 400);
    }

    const id = `media_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await d1Execute(
      context.env,
      "insert into media_channels (id, name, category, byline_type, unit_price, member_price_label, channel, description, is_active, created_at, updated_at) values (?, ?, ?, '', ?, ?, '', '', 1, ?, ?)",
      [id, name, category, unitPrice, memberPrice, now, now]
    );
    await d1Execute(context.env, "insert into admin_logs (message, created_at) values (?, ?)", [
      `매체 추가: ${name} (${category})`,
      now,
    ]);
    await writeSecurityAudit(context.env, {
      eventType: "admin_media_created",
      actorType: "admin",
      actorId: adminSession.loginId || adminSession.adminId,
      ip,
      outcome: "success",
      detail: `media_id=${id}`,
    });

    return jsonOk({
      media: {
        id,
        name,
        category,
        unitPrice,
        memberPrice,
        isActive: true,
      },
    });
  } catch (error) {
    return jsonError("매체 추가 중 오류가 발생했습니다.", 500);
  }
}

export async function onRequestPatch(context) {
  try {
    const adminSession = await requireAdminSession(context);
    if (!adminSession) return jsonError("관리자 로그인이 필요합니다.", 401);

    const body = await parseJson(context.request);
    const action = sanitizePlainText(body.action, 30).toLowerCase();
    const mediaId = sanitizePlainText(body.mediaId, 80);
    const ip = getRequestClientIp(context.request);
    if (!mediaId) return jsonError("매체 ID가 필요합니다.", 400);

    const rows = await d1Query(
      context.env,
      "select id, name, category, unit_price, member_price_label, is_active from media_channels where id = ? limit 1",
      [mediaId]
    );
    if (!rows.length) return jsonError("매체를 찾을 수 없습니다.", 404);
    const media = rows[0];
    const now = new Date().toISOString();

    if (action === "update") {
      const name = sanitizePlainText(body.name, 120);
      const category = sanitizePlainText(body.category, 80);
      const memberPrice = sanitizePlainText(body.memberPrice || media.member_price_label || "회원전용", 80) || "회원전용";
      const rawUnitPrice = String(body.unitPrice ?? "").trim();
      const hasUnitPriceInput = rawUnitPrice !== "";
      const nextUnitPriceFromBody = hasUnitPriceInput ? parsePrice(rawUnitPrice) : null;
      const nextUnitPriceFromLabel = parsePrice(memberPrice);
      const currentUnitPrice = Math.max(0, Math.round(Number(media.unit_price || 0) || 0));
      const unitPrice =
        nextUnitPriceFromBody !== null
          ? nextUnitPriceFromBody
          : nextUnitPriceFromLabel > 0
            ? nextUnitPriceFromLabel
            : currentUnitPrice;

      if (!name || !category) {
        return jsonError("매체명과 카테고리를 입력해 주세요.", 400);
      }

      await d1Execute(
        context.env,
        "update media_channels set name = ?, category = ?, unit_price = ?, member_price_label = ?, updated_at = ? where id = ?",
        [name, category, unitPrice, memberPrice, now, mediaId]
      );
      await d1Execute(context.env, "insert into admin_logs (message, created_at) values (?, ?)", [
        `매체 정보 수정: ${media.name} -> ${name} (${category})`,
        now,
      ]);
      await writeSecurityAudit(context.env, {
        eventType: "admin_media_updated",
        actorType: "admin",
        actorId: adminSession.loginId || adminSession.adminId,
        ip,
        outcome: "success",
        detail: `media_id=${mediaId};name=${name};category=${category};unit_price=${unitPrice}`,
      });

      return jsonOk({
        media: {
          id: mediaId,
          name,
          category,
          unitPrice,
          memberPrice,
        },
      });
    }

    if (action && action !== "toggle") {
      return jsonError("지원하지 않는 매체 요청입니다.", 400);
    }

    const nextActive = Number(media.is_active || 0) === 1 ? 0 : 1;
    await d1Execute(context.env, "update media_channels set is_active = ?, updated_at = ? where id = ?", [
      nextActive,
      now,
      mediaId,
    ]);
    await d1Execute(context.env, "insert into admin_logs (message, created_at) values (?, ?)", [
      `매체 상태 변경: ${media.name} (${nextActive === 1 ? "활성" : "비활성"})`,
      now,
    ]);
    await writeSecurityAudit(context.env, {
      eventType: "admin_media_toggled",
      actorType: "admin",
      actorId: adminSession.loginId || adminSession.adminId,
      ip,
      outcome: "success",
      detail: `media_id=${mediaId};active=${nextActive === 1 ? "1" : "0"}`,
    });

    return jsonOk({ mediaId, isActive: nextActive === 1 });
  } catch (error) {
    return jsonError("매체 처리 중 오류가 발생했습니다.", 500);
  }
}
