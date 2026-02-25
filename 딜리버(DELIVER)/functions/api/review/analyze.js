import {
  getSessionToken,
  jsonError,
  jsonOk,
  kvGet,
  kvPut,
  nowIso,
  r2Delete,
  r2Put,
  readSession,
  writeSecurityAudit,
  getRequestClientIp,
} from '../_lib/cloudflare_store.js';
import {
  buildReviewObjectKey,
  cleanupExpiredReviews,
  ensureReviewTables,
  extractTextFromReviewFile,
  getNextRunNumber,
  getReviewDocumentById,
  getReviewMaxFileBytes,
  getReviewRetentionDays,
  insertReviewRun,
  runRuleReview,
  sha256Hex,
  upsertReviewDocument,
  validateReviewFile,
} from '../_lib/review_engine.js';

const MAX_INPUT_CHARS = 8000;
const GUEST_DAILY_LIMIT = 1;

function normalizeMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'rescore') return 'rescore';
  return 'first';
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function fingerprintGuest(request) {
  const ip = getRequestClientIp(request);
  const ua = String(request.headers.get('user-agent') || '').slice(0, 200);
  const raw = `${ip}|${ua}|${todayKey()}`;
  return sha256Hex(raw);
}

async function ensureMemberSession(context) {
  const token = getSessionToken(context.request, 'member');
  if (!token) return null;
  const session = await readSession(context.env, token, 'member', context.request);
  if (!session?.memberId) return null;
  return session;
}

function trimInputText(text) {
  const source = String(text || '').trim();
  if (source.length <= MAX_INPUT_CHARS) return source;
  return source.slice(0, MAX_INPUT_CHARS);
}

function buildOwner(session, guestHash) {
  if (session?.memberId) {
    return {
      ownerType: 'member',
      ownerKey: `member:${session.memberId}`,
      actorType: 'member',
      actorId: session.loginId || session.memberId,
    };
  }
  return {
    ownerType: 'guest',
    ownerKey: `guest:${guestHash}`,
    actorType: 'guest',
    actorId: guestHash.slice(0, 16),
  };
}

async function checkGuestLimit(env, guestHash) {
  const key = `guest-review:${todayKey()}:${guestHash}`;
  const current = Math.max(0, Number(await kvGet(env, key) || 0));
  if (current >= GUEST_DAILY_LIMIT) {
    return { ok: false, count: current, key };
  }
  return { ok: true, count: current, key };
}

async function consumeGuestLimit(env, key, currentCount) {
  await kvPut(env, key, String(Math.max(0, Number(currentCount || 0)) + 1), 60 * 60 * 24 + 120);
}

function parseReviewInput(formData) {
  return {
    draftFile: formData.get('draftFile'),
    reviewMode: normalizeMode(formData.get('reviewMode')),
    reviewId: String(formData.get('reviewId') || '').trim(),
  };
}

function toResponsePayload({ reviewId, runNo, runResult, ownerType }) {
  return {
    reviewId,
    runNo,
    scores: runResult.scores,
    riskBreakdown: runResult.riskBreakdown,
    highlights: runResult.highlights,
    summary: runResult.summary,
    limits: {
      maxFileBytes: getReviewMaxFileBytes(),
      textCharsUsed: MAX_INPUT_CHARS,
      retentionDays: getReviewRetentionDays(),
    },
    nextAction: ownerType === 'member' ? 'can_rescore' : 'signup_required',
  };
}

export async function onRequestPost(context) {
  let uploadedKey = '';
  try {
    await ensureReviewTables(context.env);

    const contentType = String(context.request.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('multipart/form-data')) {
      return jsonError('파일 업로드 요청 형식이 올바르지 않습니다.', 400);
    }

    const formData = await context.request.formData();
    const input = parseReviewInput(formData);

    const validation = validateReviewFile(input.draftFile);
    if (!validation.ok) return jsonError(validation.message, 400);

    const session = await ensureMemberSession(context);
    const guestHash = session ? '' : await fingerprintGuest(context.request);

    let guestLimitState = null;
    if (!session && input.reviewMode === 'rescore') {
      return jsonError('재점수는 회원가입 후 이용할 수 있습니다.', 403);
    }
    if (!session) {
      guestLimitState = await checkGuestLimit(context.env, guestHash);
      if (!guestLimitState.ok) {
        return jsonError('비회원 체험은 1회만 가능합니다. 회원가입 후 재점수를 이용해 주세요.', 403);
      }
    }

    const owner = buildOwner(session, guestHash);
    const ip = getRequestClientIp(context.request);

    let reviewId = input.reviewId;
    let createdAt = nowIso();

    if (input.reviewMode === 'rescore') {
      if (!reviewId) return jsonError('재점수할 리뷰 ID가 필요합니다.', 400);
      const existing = await getReviewDocumentById(context.env, reviewId);
      if (!existing) return jsonError('검수 기록을 찾을 수 없습니다.', 404);
      if (existing.owner_key !== owner.ownerKey) {
        return jsonError('해당 검수 기록에 접근할 수 없습니다.', 403);
      }
      createdAt = existing.created_at || createdAt;
    } else if (!reviewId) {
      reviewId = `rvw_${crypto.randomUUID()}`;
    }

    const fileBytes = await input.draftFile.arrayBuffer();
    uploadedKey = buildReviewObjectKey(reviewId, validation.fileName);
    await r2Put(context.env, uploadedKey, fileBytes, {
      httpMetadata: { contentType: validation.fileMime },
      customMetadata: {
        reviewId,
        ownerType: owner.ownerType,
        ownerKey: owner.ownerKey,
      },
    });

    const extracted = await extractTextFromReviewFile(input.draftFile, validation.extension);
    const trimmedText = trimInputText(extracted);
    if (trimmedText.length < 30) {
      try {
        await r2Delete(context.env, uploadedKey);
      } catch (error) {
      }
      uploadedKey = '';
      return jsonError('문서 텍스트를 충분히 추출하지 못했습니다. 텍스트 기반 PDF/DOCX로 다시 시도해 주세요.', 422);
    }

    const sourceTextHash = await sha256Hex(trimmedText);
    const runResult = runRuleReview(trimmedText, {
      fileName: validation.fileName,
      extension: validation.extension,
    });
    if (runResult.isNonManuscript) {
      try {
        await r2Delete(context.env, uploadedKey);
      } catch (error) {
      }
      uploadedKey = '';
      return jsonError('원고형 본문이 아닌 파일은 검수할 수 없습니다. 보도자료/홍보 원고 본문 파일로 다시 업로드해 주세요.', 422);
    }
    const runNo = await getNextRunNumber(context.env, reviewId);

    await upsertReviewDocument(context.env, {
      id: reviewId,
      ownerType: owner.ownerType,
      ownerKey: owner.ownerKey,
      fileKey: uploadedKey,
      fileName: validation.fileName,
      fileMime: validation.fileMime,
      fileSize: validation.fileSize,
      sourceTextHash,
      createdAt,
      lastRunAt: nowIso(),
    });

    await insertReviewRun(context.env, {
      id: `rrn_${crypto.randomUUID()}`,
      reviewDocumentId: reviewId,
      runNo,
      reviewMode: input.reviewMode,
      scores: runResult.scores,
      riskBreakdown: runResult.riskBreakdown,
      highlights: runResult.highlights,
      summary: runResult.summary,
      createdAt: nowIso(),
    });

    // Opportunistic cleanup; does not block user response.
    cleanupExpiredReviews(context.env, 8).catch(() => {});
    if (!session && guestLimitState) {
      await consumeGuestLimit(context.env, guestLimitState.key, guestLimitState.count);
    }

    await writeSecurityAudit(context.env, {
      eventType: 'review_analyze',
      actorType: owner.actorType,
      actorId: owner.actorId,
      ip,
      outcome: 'success',
      detail: `review_id=${reviewId},run_no=${runNo},mode=${input.reviewMode}`,
    });

    return jsonOk(toResponsePayload({ reviewId, runNo, runResult, ownerType: owner.ownerType }));
  } catch (error) {
    if (uploadedKey) {
      try {
        await r2Delete(context.env, uploadedKey);
      } catch (cleanupError) {
      }
    }
    await writeSecurityAudit(context.env, {
      eventType: 'review_analyze',
      actorType: 'system',
      actorId: '',
      ip: getRequestClientIp(context.request),
      outcome: 'fail',
      detail: String(error?.message || 'unknown').slice(0, 220),
    });
    return jsonError('원고 검수 처리 중 오류가 발생했습니다.', 500);
  }
}
