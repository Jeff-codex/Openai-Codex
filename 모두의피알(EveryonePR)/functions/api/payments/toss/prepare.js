import { jsonError } from "../../_lib/cloudflare_store.js";

export async function onRequestPost() {
  return jsonError("포인트 충전 결제는 종료되었습니다. 주문 결제를 이용해 주세요.", 410);
}
