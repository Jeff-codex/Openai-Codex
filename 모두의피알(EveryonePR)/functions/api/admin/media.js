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
import { ensureMediaPricingSchema, normalizePrice, toPriceLabel } from "../_lib/media_pricing.js";
import { requireAdminSession } from "./_auth.js";

function hasInput(value) {
  return String(value ?? "").trim() !== "";
}

export async function onRequestPost(context) {
  try {
    const adminSession = await requireAdminSession(context);
    if (!adminSession) return jsonError("관리자 로그인이 필요합니다.", 401);
    await ensureMediaPricingSchema(context.env);

    const body = await parseJson(context.request);
    const name = sanitizePlainText(body.name, 120);
    const category = sanitizePlainText(body.category, 80);
    const categoryDetail = sanitizePlainText(body.categoryDetail || "", 200);
    const bylineType = sanitizePlainText(body.bylineType || "", 40);
    const channel = sanitizePlainText(body.channel || "", 200);
    const description = sanitizePlainText(body.description || "", 1000);
    const rawSalePrice = hasInput(body.salePrice) ? body.salePrice : hasInput(body.unitPrice) ? body.unitPrice : body.memberPrice;
    const salePrice = normalizePrice(rawSalePrice);
    const rawSupplyPrice = hasInput(body.supplyPrice) ? body.supplyPrice : "";
    const supplyPrice = hasInput(rawSupplyPrice) ? normalizePrice(rawSupplyPrice) : salePrice;
    const memberPrice = sanitizePlainText(body.memberPrice || toPriceLabel(salePrice), 80) || toPriceLabel(salePrice);
    const ip = getRequestClientIp(context.request);

    if (!name || !category) {
      return jsonError("매체명과 카테고리를 입력해 주세요.", 400);
    }
    if (salePrice <= 0) {
      return jsonError("판매가는 0원보다 커야 합니다.", 400);
    }
    if (salePrice < supplyPrice) {
      return jsonError("판매가는 공급가보다 낮을 수 없습니다.", 400);
    }

    const id = `media_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await d1Execute(
      context.env,
      "insert into media_channels (id, name, category, category_detail, byline_type, supply_price, sale_price, unit_price, member_price_label, channel, description, is_active, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
      [id, name, category, categoryDetail, bylineType, supplyPrice, salePrice, salePrice, memberPrice, channel, description, now, now]
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
        categoryDetail,
        bylineType,
        supplyPrice,
        salePrice,
        unitPrice: salePrice,
        memberPrice,
        channel,
        description,
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
    await ensureMediaPricingSchema(context.env);

    const body = await parseJson(context.request);
    const action = sanitizePlainText(body.action, 30).toLowerCase();
    const mediaId = sanitizePlainText(body.mediaId, 80);
    const ip = getRequestClientIp(context.request);
    if (!mediaId) return jsonError("매체 ID가 필요합니다.", 400);

    const rows = await d1Query(
      context.env,
      "select id, name, category, category_detail, byline_type, supply_price, sale_price, unit_price, member_price_label, channel, description, is_active from media_channels where id = ? limit 1",
      [mediaId]
    );
    if (!rows.length) return jsonError("매체를 찾을 수 없습니다.", 404);
    const media = rows[0];
    const now = new Date().toISOString();

    if (action === "update") {
      const name = sanitizePlainText(body.name || media.name, 120);
      const category = sanitizePlainText(body.category || media.category, 80);
      const categoryDetail = sanitizePlainText(body.categoryDetail ?? media.category_detail ?? "", 200);
      const bylineType = sanitizePlainText(body.bylineType ?? media.byline_type ?? "", 40);
      const channel = sanitizePlainText(body.channel ?? media.channel ?? "", 200);
      const description = sanitizePlainText(body.description ?? media.description ?? "", 1000);

      const currentSalePrice = normalizePrice(media.sale_price || media.unit_price || 0);
      const currentSupplyPrice = normalizePrice(media.supply_price || media.unit_price || currentSalePrice);

      const rawSalePrice = hasInput(body.salePrice)
        ? body.salePrice
        : hasInput(body.unitPrice)
          ? body.unitPrice
          : hasInput(body.memberPrice)
            ? body.memberPrice
            : currentSalePrice;
      const salePrice = normalizePrice(rawSalePrice || currentSalePrice);

      const rawSupplyPrice = hasInput(body.supplyPrice) ? body.supplyPrice : currentSupplyPrice;
      const supplyPrice = normalizePrice(rawSupplyPrice || currentSupplyPrice);

      const memberPrice = sanitizePlainText(body.memberPrice || media.member_price_label || toPriceLabel(salePrice), 80) || toPriceLabel(salePrice);

      if (!name || !category) {
        return jsonError("매체명과 카테고리를 입력해 주세요.", 400);
      }
      if (salePrice <= 0) {
        return jsonError("판매가는 0원보다 커야 합니다.", 400);
      }
      if (salePrice < supplyPrice) {
        return jsonError("판매가는 공급가보다 낮을 수 없습니다.", 400);
      }

      await d1Execute(
        context.env,
        "update media_channels set name = ?, category = ?, category_detail = ?, byline_type = ?, supply_price = ?, sale_price = ?, unit_price = ?, member_price_label = ?, channel = ?, description = ?, updated_at = ? where id = ?",
        [name, category, categoryDetail, bylineType, supplyPrice, salePrice, salePrice, memberPrice, channel, description, now, mediaId]
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
        detail: `media_id=${mediaId};name=${name};category=${category};sale_price=${salePrice};supply_price=${supplyPrice}`,
      });

      return jsonOk({
        media: {
          id: mediaId,
          name,
          category,
          categoryDetail,
          bylineType,
          supplyPrice,
          salePrice,
          unitPrice: salePrice,
          memberPrice,
          channel,
          description,
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
