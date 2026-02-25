import { getSessionToken, jsonError, jsonOk, readSession } from '../_lib/cloudflare_store.js';
import { ensureReviewTables, getReviewDocumentById, getReviewRuns } from '../_lib/review_engine.js';

async function ensureMemberSession(context) {
  const token = getSessionToken(context.request, 'member');
  if (!token) return null;
  const session = await readSession(context.env, token, 'member', context.request);
  if (!session?.memberId) return null;
  return session;
}

export async function onRequestGet(context) {
  try {
    const session = await ensureMemberSession(context);
    if (!session) return jsonError('로그인이 필요합니다.', 401);

    const reviewId = String(context.params?.reviewId || '').trim();
    if (!reviewId) return jsonError('리뷰 ID가 필요합니다.', 400);

    await ensureReviewTables(context.env);
    const doc = await getReviewDocumentById(context.env, reviewId);
    if (!doc) return jsonError('검수 기록을 찾을 수 없습니다.', 404);

    const ownerKey = `member:${session.memberId}`;
    if (doc.owner_key !== ownerKey) {
      return jsonError('해당 검수 기록에 접근할 수 없습니다.', 403);
    }

    const runs = await getReviewRuns(context.env, reviewId);
    return jsonOk({
      review: {
        id: doc.id,
        ownerType: doc.owner_type,
        fileName: doc.file_name,
        fileMime: doc.file_mime,
        fileSize: Number(doc.file_size || 0),
        createdAt: doc.created_at,
        lastRunAt: doc.last_run_at,
        expiresAt: doc.expires_at,
      },
      runs,
    });
  } catch (error) {
    return jsonError('검수 기록 조회 중 오류가 발생했습니다.', 500);
  }
}
