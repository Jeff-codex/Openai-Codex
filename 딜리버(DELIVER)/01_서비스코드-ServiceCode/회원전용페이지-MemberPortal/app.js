const MEMBER_TOKEN_KEY = "deliver_member_token_v1";
const MEMBER_ORDER_DRAFT_KEY = "deliver_member_order_draft_v2";
const LANDING_PAGE_PATH = "/";
const CHANNEL_TALK_PLUGIN_KEY = "effcd765-65b5-49ca-b003-b18931fc6f38";
const AUTH_LOADING_CLASS = "auth-loading";

const ORDER_STATUS_LABELS = {
  received: "접수",
  reviewing: "검수중",
  queued: "송출대기",
  published: "송출완료",
  rejected: "반려",
};

const MEDIA_CATEGORY_ORDER = {
  일반: 1,
  의료: 2,
  비즈니스: 3,
  뷰티: 4,
  금융: 5,
};

const ALL_MEDIA_GROUP = "__all__";

const MEDIA_CATEGORY_META = {
  [ALL_MEDIA_GROUP]: { label: "전체", iconKey: "grid", tone: "all" },
  일반: { label: "일반", iconKey: "article", tone: "general" },
  의료: { label: "의료", iconKey: "medical", tone: "medical" },
  비즈니스: { label: "비즈니스", iconKey: "briefcase", tone: "business" },
  뷰티: { label: "뷰티", iconKey: "sparkle", tone: "beauty" },
  금융: { label: "금융", iconKey: "coin", tone: "finance" },
  법률: { label: "법률", iconKey: "scale", tone: "law" },
  부동산: { label: "부동산", iconKey: "home", tone: "realestate" },
  특수: { label: "특수", iconKey: "edit", tone: "special" },
  배너: { label: "배너", iconKey: "monitor", tone: "special" },
  창업: { label: "창업", iconKey: "rocket", tone: "business" },
  인터뷰: { label: "인터뷰", iconKey: "mic", tone: "special" },
  맛집: { label: "맛집", iconKey: "bowl", tone: "beauty" },
  건기식: { label: "건기식", iconKey: "capsule", tone: "medical" },
};

const state = {
  member: null,
  media: [],
  orders: [],
  mediaFilter: "",
  selectedMediaId: "",
  activeMediaGroup: "",
  syncTimer: null,
  paymentIntent: null,
  paymentMethods: [],
  paymentIntegration: { ready: false, message: "" },
  paymentPending: false,
  paymentWidgetIntentId: "",
  paymentWidget: null,
  paymentWidgetData: null,
  paymentWidgetPromise: null,
  paymentWidgetToken: 0,
};

function clearLegacyTokenStorage() {
  try {
    localStorage.removeItem(MEMBER_TOKEN_KEY);
  } catch (error) {
  }
  try {
    sessionStorage.removeItem(MEMBER_TOKEN_KEY);
  } catch (error) {
  }
}

function redirectToLanding() {
  window.location.replace(LANDING_PAGE_PATH);
}

function setAuthReady(isReady) {
  document.body.classList.toggle(AUTH_LOADING_CLASS, !isReady);
  const authGate = document.getElementById("auth-gate");
  if (authGate instanceof HTMLElement) {
    authGate.hidden = isReady;
  }
}

function syncTopbarOffset() {
  const topbar = document.querySelector(".topbar");
  const height = topbar instanceof HTMLElement ? Math.ceil(topbar.getBoundingClientRect().height) : 68;
  document.documentElement.style.setProperty("--topbar-offset", `${Math.max(62, height)}px`);
}

function formatCurrency(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0원";
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString("ko-KR");
  } catch (error) {
    return "-";
  }
}

function formatBytes(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "-";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

function normalizeAmount(value) {
  const raw = Number(value || 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.round(raw));
}

function calculateAmounts(unitPrice) {
  const supplyAmount = normalizeAmount(unitPrice);
  const vatAmount = Math.round(supplyAmount * 0.1);
  const totalAmount = supplyAmount + vatAmount;
  return { supplyAmount, vatAmount, totalAmount };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function apiFetch(path, init = {}) {
  const headers = { ...(init.headers || {}) };
  const method = String(init.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = getCookieValue("deliver_csrf");
    if (csrf) headers["x-csrf-token"] = csrf;
  }
  const response = await fetch(path, { ...init, headers, credentials: "same-origin" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || `API ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function getCookieValue(name) {
  const source = String(document.cookie || "");
  const target = `${String(name || "")}=`;
  const part = source
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(target));
  if (!part) return "";
  return decodeURIComponent(part.slice(target.length));
}

function initChannelTalk() {
  const pluginKey = String(window.DLIVER_CHANNEL_TALK_PLUGIN_KEY || CHANNEL_TALK_PLUGIN_KEY || "").trim();
  if (!pluginKey) return;

  const w = window;
  if (w.ChannelIO) {
    w.ChannelIO("boot", { pluginKey });
    return;
  }
  const ch = function () {
    ch.c(arguments);
  };
  ch.q = [];
  ch.c = function (args) {
    ch.q.push(args);
  };
  w.ChannelIO = ch;

  function loadScript() {
    if (w.ChannelIOInitialized) return;
    w.ChannelIOInitialized = true;
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://cdn.channel.io/plugin/ch-plugin-web.js";
    const x = document.getElementsByTagName("script")[0];
    x?.parentNode?.insertBefore(s, x);
  }

  if (document.readyState === "complete") {
    loadScript();
  } else {
    w.addEventListener("DOMContentLoaded", loadScript);
    w.addEventListener("load", loadScript);
  }

  w.ChannelIO("boot", { pluginKey });
}

function setOrderMessage(type, text) {
  const message = document.getElementById("order-message");
  if (!message) return;
  message.className = type ? `form-message ${type}` : "form-message";
  message.textContent = text || "";
}

function setPaymentMessage(type, text) {
  const message = document.getElementById("order-payment-message");
  if (!message) return;
  message.className = type ? `form-message ${type}` : "form-message";
  message.textContent = text || "";
}

function getPaymentSubmitButton() {
  const paymentForm = document.getElementById("order-payment-form");
  const submitButton = paymentForm?.querySelector('button[type="submit"]');
  return submitButton instanceof HTMLButtonElement ? submitButton : null;
}

function setPaymentSubmitButtonState({ enabled = false, label = "", title = "" } = {}) {
  const submitButton = getPaymentSubmitButton();
  if (!submitButton) return;
  submitButton.disabled = !enabled;
  if (label) submitButton.textContent = label;
  submitButton.title = title;
}

function openPaymentModal() {
  const modal = document.getElementById("order-payment-modal");
  if (!(modal instanceof HTMLElement)) return;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function getPaymentWidgetShell() {
  const shell = document.getElementById("payment-widget-shell");
  return shell instanceof HTMLElement ? shell : null;
}

function setPaymentWidgetVisible(visible) {
  const shell = getPaymentWidgetShell();
  if (!shell) return;
  shell.hidden = !visible;
}

function clearPaymentWidgetContainers() {
  const methods = document.getElementById("payment-widget-methods");
  const agreement = document.getElementById("payment-widget-agreement");
  if (methods instanceof HTMLElement) methods.innerHTML = "";
  if (agreement instanceof HTMLElement) agreement.innerHTML = "";
}

function resetPaymentWidgetState({ clearContainers = true } = {}) {
  state.paymentWidgetIntentId = "";
  state.paymentWidget = null;
  state.paymentWidgetData = null;
  state.paymentWidgetPromise = null;
  state.paymentWidgetToken += 1;
  if (clearContainers) clearPaymentWidgetContainers();
  setPaymentWidgetVisible(false);
}

function closePaymentModal() {
  if (state.paymentPending) return;
  const modal = document.getElementById("order-payment-modal");
  if (!(modal instanceof HTMLElement)) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  resetPaymentWidgetState();
  setPaymentMessage("", "");
}

function persistOrderDraft() {
  const form = document.getElementById("member-order-form");
  if (!(form instanceof HTMLFormElement)) return;
  const formData = new FormData(form);
  const payload = {
    title: String(formData.get("title") || "").trim(),
    requestNote: String(formData.get("requestNote") || "").trim(),
    selectedMediaId: state.selectedMediaId || "",
    paymentIntentId: state.paymentIntent?.intentId || "",
  };
  try {
    sessionStorage.setItem(MEMBER_ORDER_DRAFT_KEY, JSON.stringify(payload));
  } catch (error) {
  }
}

function readOrderDraft() {
  try {
    const payload = JSON.parse(sessionStorage.getItem(MEMBER_ORDER_DRAFT_KEY) || "{}");
    return payload && typeof payload === "object" ? payload : null;
  } catch (error) {
    return null;
  }
}

function restoreOrderDraft() {
  const form = document.getElementById("member-order-form");
  if (!(form instanceof HTMLFormElement)) return;
  const payload = readOrderDraft();
  if (!payload || typeof payload !== "object") return;
  if (payload.title && form.elements.namedItem("title") instanceof HTMLInputElement) {
    form.elements.namedItem("title").value = String(payload.title);
  }
  if (payload.requestNote && form.elements.namedItem("requestNote") instanceof HTMLTextAreaElement) {
    form.elements.namedItem("requestNote").value = String(payload.requestNote);
  }
  if (payload.selectedMediaId && state.media.some((item) => item.id === payload.selectedMediaId)) {
    state.selectedMediaId = payload.selectedMediaId;
  }
}

function clearOrderDraft() {
  try {
    sessionStorage.removeItem(MEMBER_ORDER_DRAFT_KEY);
  } catch (error) {
  }
}

async function restorePendingPaymentIntent() {
  const payload = readOrderDraft();
  const intentId = String(payload?.paymentIntentId || "").trim();
  if (!intentId) return;
  if (state.paymentIntent?.intentId === intentId) return;
  try {
    const restored = await apiFetch(`/api/orders/payment-intents/${encodeURIComponent(intentId)}`);
    applyIntentToPaymentModal(restored.intent, restored.paymentMethods, restored.refundPolicyHtml, restored.paymentIntegration);
  } catch (error) {
    state.paymentIntent = null;
  }
}

async function loadTossPaymentsSdk() {
  if (window.TossPayments) return window.TossPayments;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-toss-sdk="v2-standard"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("토스 SDK 로드 실패")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.tosspayments.com/v2/standard";
    script.async = true;
    script.dataset.tossSdk = "v2-standard";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("토스 SDK 로드 실패"));
    document.head.appendChild(script);
  });
  if (!window.TossPayments) {
    throw new Error("토스 SDK 초기화에 실패했습니다.");
  }
  return window.TossPayments;
}

function clearPaymentResultQuery() {
  const url = new URL(window.location.href);
  if (!url.search) return;
  url.search = "";
  window.history.replaceState({}, "", url.toString());
}

function getSelectedMedia() {
  return state.media.find((item) => item.id === state.selectedMediaId) || null;
}

function getSelectedMediaPrice() {
  const media = getSelectedMedia();
  return normalizeAmount(media?.salePrice || media?.unitPrice || 0);
}

function syncEstimateFields() {
  const supplyEl = document.getElementById("order-estimate-supply");
  const vatEl = document.getElementById("order-estimate-vat");
  const totalEl = document.getElementById("order-estimate-total");
  const amounts = calculateAmounts(getSelectedMediaPrice());
  if (supplyEl) supplyEl.textContent = formatCurrency(amounts.supplyAmount);
  if (vatEl) vatEl.textContent = formatCurrency(amounts.vatAmount);
  if (totalEl) totalEl.textContent = formatCurrency(amounts.totalAmount);
}

function buildTossCustomerKey(rawValue = "") {
  const cleaned = String(rawValue || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 48);
  if (cleaned) return `dlv_${cleaned}`;
  return `dlv_${String(state.member?.id || crypto.randomUUID()).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48)}`;
}

async function preparePaymentWidgetForIntent(intentId, { force = false } = {}) {
  const targetIntentId = String(intentId || "").trim();
  if (!targetIntentId) throw new Error("결제 식별자가 올바르지 않습니다.");
  if (!state.paymentIntegration?.ready) {
    throw new Error(state.paymentIntegration?.message || "결제 연동 심사중입니다.");
  }

  if (!force && state.paymentWidget && state.paymentWidgetData && state.paymentWidgetIntentId === targetIntentId) {
    return state.paymentWidgetData;
  }
  if (!force && state.paymentWidgetPromise && state.paymentWidgetIntentId === targetIntentId) {
    return state.paymentWidgetPromise;
  }

  const methods = document.getElementById("payment-widget-methods");
  const agreement = document.getElementById("payment-widget-agreement");
  if (!(methods instanceof HTMLElement) || !(agreement instanceof HTMLElement)) {
    throw new Error("결제 위젯 영역을 찾을 수 없습니다.");
  }

  const token = state.paymentWidgetToken + 1;
  state.paymentWidgetToken = token;
  state.paymentWidgetIntentId = targetIntentId;
  state.paymentWidget = null;
  state.paymentWidgetData = null;
  clearPaymentWidgetContainers();
  setPaymentWidgetVisible(true);

  const task = (async () => {
    const prepared = await apiFetch(`/api/orders/payment-intents/${encodeURIComponent(targetIntentId)}/confirm-start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: "CARD" }),
    });
    if (prepared.alreadyConfirmed) {
      return { alreadyConfirmed: true };
    }

    const payment = prepared.payment || {};
    const clientKey = String(payment.clientKey || "").trim();
    const orderId = String(payment.orderId || "").trim();
    const amount = normalizeAmount(payment.amount);
    if (!clientKey || !orderId || amount <= 0) {
      throw new Error("결제 설정이 아직 완료되지 않았습니다.");
    }

    const TossPayments = await loadTossPaymentsSdk();
    const tossPayments = TossPayments(clientKey);
    const customerKey = buildTossCustomerKey(payment.customerKey || state.member?.loginId || state.member?.id || "");
    const widgets = tossPayments.widgets({ customerKey });

    await widgets.setAmount({ currency: "KRW", value: amount });
    await widgets.renderPaymentMethods({ selector: "#payment-widget-methods", variantKey: "DEFAULT" });
    await widgets.renderAgreement({ selector: "#payment-widget-agreement", variantKey: "AGREEMENT" });

    if (token !== state.paymentWidgetToken) {
      return null;
    }

    state.paymentWidget = widgets;
    state.paymentWidgetData = {
      amount,
      orderId,
      orderName: String(payment.orderName || "모두의피알 주문 결제"),
      successUrl: String(payment.successUrl || window.location.href),
      failUrl: String(payment.failUrl || window.location.href),
    };
    return state.paymentWidgetData;
  })();

  state.paymentWidgetPromise = task;
  try {
    return await task;
  } finally {
    if (token === state.paymentWidgetToken) {
      state.paymentWidgetPromise = null;
    }
  }
}

function applyIntentToPaymentModal(intent, methods, refundPolicyHtml, paymentIntegration = null) {
  state.paymentIntent = intent || null;
  state.paymentMethods = Array.isArray(methods) ? methods : [];
  resetPaymentWidgetState();
  state.paymentIntegration = {
    ready: Boolean(paymentIntegration?.ready),
    message: String(paymentIntegration?.message || ""),
  };
  const titleEl = document.getElementById("payment-summary-title");
  const mediaEl = document.getElementById("payment-summary-media");
  const supplyEl = document.getElementById("payment-summary-supply");
  const vatEl = document.getElementById("payment-summary-vat");
  const totalEl = document.getElementById("payment-summary-total");
  const expiryEl = document.getElementById("payment-summary-expiry");
  const refundEl = document.getElementById("order-refund-policy-content");

  if (titleEl) titleEl.textContent = String(intent?.title || "-");
  if (mediaEl) mediaEl.textContent = String(intent?.mediaName || "-");
  if (supplyEl) supplyEl.textContent = formatCurrency(intent?.supplyAmount || 0);
  if (vatEl) vatEl.textContent = formatCurrency(intent?.vatAmount || 0);
  if (totalEl) totalEl.textContent = formatCurrency(intent?.totalAmount || 0);
  if (expiryEl) expiryEl.textContent = formatDate(intent?.expiresAt);
  if (refundEl) {
    if (refundPolicyHtml) {
      refundEl.innerHTML = refundPolicyHtml;
    } else {
      refundEl.innerHTML = `<p>환불 규정 정보를 불러오지 못했습니다. 관리자에게 문의해 주세요.</p>`;
    }
  }

  if (!state.paymentIntegration.ready) {
    setPaymentSubmitButtonState({
      enabled: false,
      label: "결제연동 심사중",
      title: "토스페이먼츠 심사 완료 후 결제가 오픈됩니다.",
    });
    setPaymentWidgetVisible(false);
    setPaymentMessage("error", state.paymentIntegration.message || "토스페이먼츠 결제 연동 심사중입니다.");
  } else {
    setPaymentSubmitButtonState({
      enabled: false,
      label: "결제위젯 준비중",
      title: "결제수단 위젯 준비 완료 후 결제를 진행할 수 있습니다.",
    });
    setPaymentMessage("", "결제 수단 위젯을 준비하고 있습니다...");
    const intentId = String(intent?.intentId || "").trim();
    if (intentId) {
      preparePaymentWidgetForIntent(intentId)
        .then((result) => {
          if (result?.alreadyConfirmed) {
            setPaymentSubmitButtonState({
              enabled: false,
              label: "결제완료",
              title: "이미 결제가 완료된 주문입니다.",
            });
            setPaymentMessage("", "이미 결제가 완료된 주문입니다.");
            return;
          }
          if (state.paymentWidgetIntentId === intentId && state.paymentWidget) {
            setPaymentSubmitButtonState({
              enabled: true,
              label: "결제하기",
              title: "",
            });
            setPaymentMessage("", "결제수단 확인 후 결제하기 버튼을 눌러 주세요.");
          }
        })
        .catch((error) => {
          if (state.paymentWidgetIntentId === intentId) {
            setPaymentSubmitButtonState({
              enabled: false,
              label: "결제위젯 오류",
              title: "결제 위젯 초기화에 실패했습니다. 잠시 후 다시 시도해 주세요.",
            });
            setPaymentWidgetVisible(false);
            setPaymentMessage("error", error.message || "결제 위젯 로딩에 실패했습니다.");
          }
        });
    }
  }
}

async function submitOrder(form) {
  const media = getSelectedMedia();
  if (!media) {
    setOrderMessage("error", "매체를 먼저 선택해 주세요.");
    return;
  }
  const formData = new FormData(form);
  const title = String(formData.get("title") || "").trim();
  const requestNote = String(formData.get("requestNote") || "").trim();
  const draftFile = formData.get("draftFile");
  if (!title) {
    setOrderMessage("error", "주문명을 입력해 주세요.");
    return;
  }
  if (!(draftFile && typeof draftFile === "object" && Number(draftFile.size || 0) > 0)) {
    setOrderMessage("error", "원고 파일을 첨부해 주세요.");
    return;
  }

  try {
    setOrderMessage("", "결제 정보를 준비하고 있습니다...");
    const payload = new FormData();
    payload.set("mediaId", media.id);
    payload.set("title", title);
    payload.set("requestNote", requestNote);
    payload.set("draftFile", draftFile);

    const prepared = await apiFetch("/api/orders/payment-intents", {
      method: "POST",
      body: payload,
    });
    applyIntentToPaymentModal(prepared.intent, prepared.paymentMethods, prepared.refundPolicyHtml, prepared.paymentIntegration);
    persistOrderDraft();
    openPaymentModal();
    if (prepared?.paymentIntegration?.ready) {
      setOrderMessage("", "최종 결제 정보를 확인해 주세요.");
    } else {
      setOrderMessage("", "결제 연동 심사중입니다. 주문 결제창 오픈 전까지 준비된 정보만 확인 가능합니다.");
    }
  } catch (error) {
    setOrderMessage("error", error.message || "결제 준비 중 오류가 발생했습니다.");
  }
}

async function submitPaymentConfirm(form) {
  if (state.paymentPending) return;
  if (!state.paymentIntegration?.ready) {
    setPaymentMessage("error", state.paymentIntegration?.message || "결제 연동 심사중입니다. 관리자에게 문의해 주세요.");
    return;
  }
  const intentId = String(state.paymentIntent?.intentId || "");
  if (!intentId) {
    setPaymentMessage("error", "결제 준비 정보가 없습니다. 주문등록부터 다시 진행해 주세요.");
    return;
  }

  const paymentData = state.paymentWidgetData;
  if (!state.paymentWidget || !paymentData || state.paymentWidgetIntentId !== intentId) {
    setPaymentSubmitButtonState({
      enabled: false,
      label: "결제위젯 준비중",
      title: "결제수단 위젯이 준비되면 결제하기 버튼이 활성화됩니다.",
    });
    setPaymentMessage("error", "결제수단 위젯 준비가 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.");
    return;
  }

  state.paymentPending = true;
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton instanceof HTMLButtonElement) submitButton.disabled = true;
  setPaymentMessage("", "결제창을 준비하고 있습니다...");
  try {
    persistOrderDraft();
    await state.paymentWidget.requestPayment({
      orderId: String(paymentData.orderId),
      orderName: String(paymentData.orderName || "모두의피알 주문 결제"),
      customerName: String(state.member?.name || ""),
      customerEmail: String(state.member?.email || ""),
      successUrl: String(paymentData.successUrl || window.location.href),
      failUrl: String(paymentData.failUrl || window.location.href),
    });
  } catch (error) {
    if (String(error?.code || "").toUpperCase() === "USER_CANCEL") {
      setPaymentMessage("", "결제가 취소되었습니다. 다시 시도할 수 있습니다.");
      return;
    }
    setPaymentMessage("error", error.message || "결제 요청 중 오류가 발생했습니다.");
  } finally {
    if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
    state.paymentPending = false;
  }
}

async function handleOrderPaymentRedirectResult() {
  const params = new URLSearchParams(window.location.search);
  const intentId = String(params.get("intentId") || "");
  const paymentKey = String(params.get("paymentKey") || "");
  const orderId = String(params.get("orderId") || "");
  const amountText = String(params.get("amount") || "");
  const failCode = String(params.get("code") || "");
  const failMessage = String(params.get("message") || "");

  if (failCode) {
    clearPaymentResultQuery();
    setOrderMessage("error", `결제가 취소되었거나 실패했습니다. (${failCode}) ${failMessage}`.trim());
    if (intentId) {
      try {
        const retried = await apiFetch(`/api/orders/payment-intents/${encodeURIComponent(intentId)}/retry`, {
          method: "POST",
        });
        applyIntentToPaymentModal(retried.intent, retried.paymentMethods, retried.refundPolicyHtml, retried.paymentIntegration);
        openPaymentModal();
      } catch (error) {
      }
    }
    return;
  }
  if (!intentId || !paymentKey || !orderId || !amountText) return;

  const amount = normalizeAmount(amountText);
  if (amount <= 0) {
    clearPaymentResultQuery();
    setOrderMessage("error", "결제 응답 금액이 올바르지 않습니다.");
    return;
  }

  try {
    const confirmed = await apiFetch(`/api/orders/payment-intents/${encodeURIComponent(intentId)}/finalize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });
    clearOrderDraft();
    setOrderMessage("success", `주문 결제가 완료되었습니다. (${formatCurrency(confirmed?.payment?.totalAmount || amount)})`);
    const form = document.getElementById("member-order-form");
    if (form instanceof HTMLFormElement) form.reset();
    const fileName = document.getElementById("order-file-name");
    if (fileName) fileName.textContent = "선택된 파일 없음";
    closePaymentModal();
    await refreshData();
  } catch (error) {
    setOrderMessage("error", error.message || "결제 승인 처리 중 오류가 발생했습니다.");
    try {
      const retried = await apiFetch(`/api/orders/payment-intents/${encodeURIComponent(intentId)}/retry`, {
        method: "POST",
      });
      applyIntentToPaymentModal(retried.intent, retried.paymentMethods, retried.refundPolicyHtml, retried.paymentIntegration);
      openPaymentModal();
    } catch (retryError) {
    }
  } finally {
    clearPaymentResultQuery();
  }
}

function getFilteredMedia() {
  const query = state.mediaFilter.trim().toLowerCase();
  return state.media.filter((item) => {
    if (!query) return true;
    const text = `${item.name} ${item.category} ${item.channel}`.toLowerCase();
    return text.includes(query);
  });
}

function getMediaGroups(mediaItems) {
  const map = new Map();
  mediaItems.forEach((item) => {
    const key = String(item.category || "기타").trim() || "기타";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return Array.from(map.entries()).sort((a, b) => {
    const aRank = MEDIA_CATEGORY_ORDER[a[0]] || 99;
    const bRank = MEDIA_CATEGORY_ORDER[b[0]] || 99;
    if (aRank !== bRank) return aRank - bRank;
    return a[0].localeCompare(b[0], "ko-KR");
  });
}

function getMediaCategoryMeta(group) {
  return MEDIA_CATEGORY_META[group] || { label: String(group || "기타"), iconKey: "sparkle", tone: "special" };
}

function renderCategoryIcon(iconKey) {
  const icons = {
    grid:
      '<svg viewBox="0 0 24 24" role="img" focusable="false" aria-hidden="true"><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.5"></rect><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.5"></rect><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.5"></rect><rect x="14" y="14" width="6.5" height="6.5" rx="1.5"></rect></svg>',
    article:
      '<svg viewBox="0 0 24 24" role="img" focusable="false" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"></rect><path d="M7.5 9h9"></path><path d="M7.5 12h4"></path><path d="M13 12h3.5"></path><path d="M7.5 15h9"></path></svg>',
    medical:
      '<svg viewBox="0 0 24 24" role="img" focusable="false" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path><circle cx="12" cy="12" r="8"></circle></svg>',
    briefcase:
      '<svg viewBox="0 0 24 24" role="img" focusable="false" aria-hidden="true"><path d="M7 20V8.5L12 5l5 3.5V20"></path><path d="M4 20h16"></path><path d="M10 11h1"></path><path d="M13 11h1"></path><path d="M10 14.5h1"></path><path d="M13 14.5h1"></path></svg>',
    sparkle:
      '<svg viewBox="0 0 24 24" role="img" focusable="false" aria-hidden="true"><path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z"></path><path d="M18.5 4.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"></path></svg>',
    coin:
      '<svg viewBox="0 0 24 24" role="img" focusable="false" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M9 9.5c.5-1 1.5-1.5 3-1.5 1.9 0 3 .9 3 2.2 0 1.2-.8 1.8-2.4 2.2-1.7.5-2.4 1-2.4 2.1 0 1.2 1 2 2.8 2 1.4 0 2.4-.5 3-1.5"></path></svg>',
    scale:
      '<svg viewBox="0 0 24 24" role="img" focusable="false" aria-hidden="true"><path d="M12 5v14"></path><path d="M7 8h10"></path><path d="M6 8l-2.5 4.5h5z"></path><path d="M18 8l-2.5 4.5h5z"></path><path d="M9 19h6"></path></svg>',
    home:
      '<svg viewBox="0 0 24 24" role="img" focusable="false" aria-hidden="true"><path d="M4 11.5L12 5l8 6.5"></path><path d="M6.5 10.5V19h11v-8.5"></path><path d="M10 19v-4.5h4V19"></path></svg>',
    edit:
      '<svg viewBox="0 0 24 24" role="img" focusable="false" aria-hidden="true"><path d="M4 19.5l4.1-1 8.3-8.3-3.1-3.1L5 15.4z"></path><path d="M12.8 5.7l3.1 3.1"></path><path d="M14 6l2-2a1.6 1.6 0 0 1 2.3 0l1.7 1.7a1.6 1.6 0 0 1 0 2.3l-2 2"></path></svg>',
    monitor:
      '<svg viewBox="0 0 24 24" role="img" focusable="false" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="2"></rect><path d="M9 19h6"></path><path d="M12 16v3"></path><path d="M8 9h8"></path></svg>',
    rocket:
      '<svg viewBox="0 0 24 24" role="img" focusable="false" aria-hidden="true"><path d="M14 4c3 0 5 2.2 5 5.2 0 3.8-2.6 6.6-6.2 9.2L9.6 15.2C12.2 11.6 15 9 18.8 9"></path><path d="M9.6 15.2l-3.4.8.8-3.4"></path><circle cx="15.5" cy="8.5" r="1.2"></circle></svg>',
    mic:
      '<svg viewBox="0 0 24 24" role="img" focusable="false" aria-hidden="true"><rect x="9" y="4" width="6" height="10" rx="3"></rect><path d="M7 11a5 5 0 0 0 10 0"></path><path d="M12 16v4"></path><path d="M9 20h6"></path></svg>',
    bowl:
      '<svg viewBox="0 0 24 24" role="img" focusable="false" aria-hidden="true"><path d="M5 12h14a7 7 0 0 1-14 0z"></path><path d="M8 17h8"></path><path d="M9 6c0 1.4-1 1.7-1 3"></path><path d="M13 5c0 1.4-1 1.7-1 3"></path><path d="M17 6c0 1.4-1 1.7-1 3"></path></svg>',
    capsule:
      '<svg viewBox="0 0 24 24" role="img" focusable="false" aria-hidden="true"><path d="M8.5 6.5a4 4 0 0 1 5.7 0l3.3 3.3a4 4 0 1 1-5.7 5.7l-3.3-3.3a4 4 0 0 1 0-5.7z"></path><path d="M9.7 7.7l6.6 6.6"></path></svg>',
  };
  return icons[iconKey] || icons.sparkle;
}

function renderMemberState() {
  const element = document.getElementById("member-state");
  const logoutButton = document.getElementById("member-logout-button");
  if (!element) return;
  element.textContent = state.member ? `${state.member.name}님 주문 준비 완료` : "로그인 확인 필요";
  if (logoutButton instanceof HTMLElement) {
    logoutButton.classList.toggle("is-hidden", !state.member);
  }
}

function getPendingOrdersCount() {
  return state.orders.filter((order) => !["published", "rejected"].includes(String(order.status || ""))).length;
}

function getPublishedOrdersCount() {
  return state.orders.filter((order) => String(order.status || "") === "published").length;
}

function getCurrentOrderDraft() {
  const titleInput = document.getElementById("order-title");
  const noteInput = document.getElementById("order-note");
  const fileInput = document.getElementById("order-file-input");
  const title = titleInput instanceof HTMLInputElement ? String(titleInput.value || "").trim() : "";
  const note = noteInput instanceof HTMLTextAreaElement ? String(noteInput.value || "").trim() : "";
  const hasFile = fileInput instanceof HTMLInputElement ? Number(fileInput.files?.length || 0) > 0 : false;
  return { title, note, hasFile };
}

function setTaskState(element, stateName) {
  if (!(element instanceof HTMLElement)) return;
  element.classList.remove("is-active", "is-complete");
  if (stateName === "active") element.classList.add("is-active");
  if (stateName === "complete") element.classList.add("is-complete");
}

function renderHeroSummary() {
  const primaryAction = document.getElementById("member-primary-action");
  const nextActionTitle = document.getElementById("member-next-action-title");
  const nextActionCopy = document.getElementById("member-next-action-copy");
  const selectedSummary = document.getElementById("member-selected-summary");
  const paymentSummary = document.getElementById("member-payment-summary");
  const ordersMeta = document.getElementById("flow-orders-meta");
  const selectedMedia = getSelectedMedia();
  const pendingOrders = getPendingOrdersCount();
  const publishedOrders = getPublishedOrdersCount();
  const draft = getCurrentOrderDraft();
  const paymentIntent = state.paymentIntent;

  let nextTitle = "먼저 매체를 선택해 주세요";
  let nextCopy = "검색하거나 카테고리를 눌러 이번 주문에 맞는 매체를 찾으면 됩니다.";
  let primaryActionLabel = "매체 찾기";
  let primaryActionHref = "#member-media-explorer";
  let showPrimaryAction = false;

  if (paymentIntent?.intentId) {
    nextTitle = "결제 전 확인만 남았습니다";
    nextCopy = "최종 금액과 확인 항목을 보고 결제를 진행해 주세요.";
    primaryActionLabel = "결제 확인하기";
    primaryActionHref = "#member-order-panel";
    showPrimaryAction = true;
  } else if (selectedMedia && draft.title && draft.hasFile) {
    nextTitle = "주문 등록을 진행해 주세요";
    nextCopy = "입력한 정보로 주문을 등록하면 결제 전 확인으로 바로 이어집니다.";
    primaryActionLabel = "주문 등록하기";
    primaryActionHref = "#member-order-panel";
    showPrimaryAction = true;
  } else if (selectedMedia) {
    nextTitle = "주문 정보를 입력해 주세요";
    nextCopy = `${selectedMedia.name}을(를) 선택했습니다. 주문명과 원고 파일을 입력하면 됩니다.`;
    primaryActionLabel = "주문 정보 입력하기";
    primaryActionHref = "#member-order-panel";
    showPrimaryAction = true;
  } else if (pendingOrders > 0 || publishedOrders > 0) {
    nextTitle = "새 주문을 다시 시작해 보세요";
    nextCopy = "기존 주문은 오른쪽 주문 현황에서 확인할 수 있습니다.";
    primaryActionLabel = "새 주문 시작하기";
    primaryActionHref = "#member-media-explorer";
  }

  if (primaryAction instanceof HTMLAnchorElement) {
    primaryAction.textContent = primaryActionLabel;
    primaryAction.href = primaryActionHref;
    primaryAction.classList.toggle("is-hidden", !showPrimaryAction);
  }
  if (nextActionTitle) nextActionTitle.textContent = nextTitle;
  if (nextActionCopy) nextActionCopy.textContent = nextCopy;

  if (selectedSummary) {
    selectedSummary.textContent = selectedMedia
      ? `${selectedMedia.name} · ${formatCurrency(selectedMedia.salePrice || selectedMedia.unitPrice || 0)}`
      : "아직 선택 없음";
  }

  if (paymentSummary) {
    paymentSummary.textContent = paymentIntent?.intentId
      ? "결제 전 확인"
      : selectedMedia && (draft.title || draft.note || draft.hasFile)
        ? "주문 정보 입력 중"
        : selectedMedia
          ? "주문 정보 입력"
          : "매체 선택";
  }

  if (ordersMeta) {
    ordersMeta.textContent = pendingOrders > 0
      ? `진행 ${pendingOrders}건`
      : publishedOrders > 0
        ? `완료 ${publishedOrders}건`
        : "바로 확인";
  }

  setTaskState(document.getElementById("flow-step-media"), selectedMedia ? "complete" : "active");
  setTaskState(document.getElementById("flow-step-order"), paymentIntent?.intentId ? "complete" : selectedMedia ? "active" : "");
  setTaskState(document.getElementById("flow-step-payment"), paymentIntent?.intentId ? "active" : "");
  setTaskState(
    document.getElementById("flow-step-orders"),
    publishedOrders > 0 ? "complete" : pendingOrders > 0 ? "active" : ""
  );
}

function renderStats() {
  const pending = getPendingOrdersCount();
  const published = getPublishedOrdersCount();
  const totalPayments = state.orders.reduce((sum, order) => sum + normalizeAmount(order?.payment?.totalAmount || 0), 0);

  document.getElementById("stat-payments-total").textContent = formatCurrency(totalPayments);
  document.getElementById("stat-orders-total").textContent = String(state.orders.length);
  document.getElementById("stat-orders-pending").textContent = String(pending);
  document.getElementById("stat-orders-published").textContent = String(published);
}

function renderMediaGroups() {
  const nav = document.getElementById("media-group-nav");
  const list = document.getElementById("media-group-list");
  const summary = document.getElementById("media-summary");
  if (!nav || !list) return;

  const filtered = getFilteredMedia();
  const groups = getMediaGroups(filtered);
  if (!groups.length) {
    nav.innerHTML = "";
    if (summary) summary.textContent = "매체 0개";
    list.innerHTML = `<div class="media-empty">조건에 맞는 매체가 없습니다.</div>`;
    return;
  }

  const groupNames = groups.map(([group]) => group);
  const groupEntries = [[ALL_MEDIA_GROUP, filtered], ...groups];
  if (![ALL_MEDIA_GROUP, ...groupNames].includes(state.activeMediaGroup)) {
    state.activeMediaGroup = ALL_MEDIA_GROUP;
  }
  const activeGroupEntry = groupEntries.find(([group]) => group === state.activeMediaGroup) || groupEntries[0];
  const activeGroup = activeGroupEntry[0];
  const activeItems = activeGroupEntry[1];
  if (summary) {
    const activeGroupLabel = activeGroup === ALL_MEDIA_GROUP ? "전체" : activeGroup;
    const summarySegments = [`총 ${filtered.length}개`, `카테고리 ${groupNames.length}개`, `선택 ${activeGroupLabel} ${activeItems.length}개`];
    summary.innerHTML = summarySegments
      .map((segment, index) => {
        const divider = index < summarySegments.length - 1 ? '<span class="media-summary-divider">·</span>' : "";
        return `<span class="media-summary-segment">${escapeHtml(segment)}</span>${divider}`;
      })
      .join("");
  }

  nav.innerHTML = groupEntries
    .map(([group, items]) => {
      const active = group === state.activeMediaGroup;
      const meta = getMediaCategoryMeta(group);
      return `<button class="media-category-card ${active ? "active" : ""}" type="button" data-group-nav="${escapeHtml(group)}" aria-pressed="${active ? "true" : "false"}">
        <span class="media-category-icon tone-${escapeHtml(meta.tone)}" aria-hidden="true">${renderCategoryIcon(meta.iconKey)}</span>
        <span class="media-category-name">${escapeHtml(meta.label)}</span>
        <span class="media-category-count">${items.length}개</span>
      </button>`;
    })
    .join("");

  const renderRows = (items, groupLabel) => items
    .map((item) => {
      const selected = item.id === state.selectedMediaId;
      const categoryLabel = String(item?.category || "").trim() || groupLabel || "미분류";
      return `<div class="media-item ${selected ? "selected" : ""}" data-select-media="${escapeHtml(item.id)}">
        <div class="media-item-main">
          <div class="media-item-name-row">
            <div class="media-item-name">
              ${escapeHtml(item.name)}
              <span class="media-item-name-category-inline">(${escapeHtml(categoryLabel)})</span>
            </div>
          </div>
          <div class="media-item-meta">판매가: ${escapeHtml(formatCurrency(item.salePrice || item.unitPrice || 0))} · 노출: ${escapeHtml(item.channel || "-")}</div>
        </div>
        <button class="btn btn-light small" type="button" data-select-media="${escapeHtml(item.id)}">선택</button>
      </div>`;
    })
    .join("");

  if (activeGroup === ALL_MEDIA_GROUP) {
    list.innerHTML = groups
      .map(([group, items]) => `<section class="media-group active" data-group-name="${escapeHtml(group)}">
        <div class="media-group-head">
          <strong>${escapeHtml(group)}</strong>
          <span>${items.length}개</span>
        </div>
        <div class="media-items">${renderRows(items, group)}</div>
      </section>`)
      .join("");
    return;
  }

  list.innerHTML = `<section class="media-group active" data-group-name="${escapeHtml(activeGroup)}">
    <div class="media-group-head">
      <strong>${escapeHtml(activeGroup)}</strong>
      <span>${activeItems.length}개</span>
    </div>
    <div class="media-items">${renderRows(activeItems, activeGroup)}</div>
  </section>`;
}

function renderSelectedMediaCard() {
  const media = getSelectedMedia();
  const name = document.getElementById("selected-media-name");
  const price = document.getElementById("selected-media-price");
  const vat = document.getElementById("selected-media-vat");
  const total = document.getElementById("selected-media-total");
  const channel = document.getElementById("selected-media-channel");
  const description = document.getElementById("selected-media-description");

  if (!media) {
    name.textContent = "매체를 선택해 주세요";
    price.textContent = "판매가: -";
    vat.textContent = "부가세(10%): -";
    total.textContent = "결제예정금액: -";
    channel.textContent = "노출채널: -";
    description.textContent = "참고사항: -";
    syncEstimateFields();
    return;
  }
  const amounts = calculateAmounts(media.salePrice || media.unitPrice);
  name.textContent = `${media.name}`;
  price.textContent = `판매가: ${formatCurrency(amounts.supplyAmount)}`;
  vat.textContent = `부가세(10%): ${formatCurrency(amounts.vatAmount)}`;
  total.textContent = `결제예정금액: ${formatCurrency(amounts.totalAmount)}`;
  channel.textContent = `노출채널: ${media.channel || "-"}`;
  description.textContent = `참고사항: ${media.description || "별도 안내 없음"}`;
  syncEstimateFields();
}

function renderOrders() {
  const tbody = document.getElementById("member-orders-body");
  if (!tbody) return;
  if (!state.orders.length) {
    tbody.innerHTML = `<tr><td colspan="7">아직 등록된 주문이 없습니다. 위에서 매체를 선택한 뒤 첫 주문을 시작해 주세요.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.orders
    .map((order) => {
      const status = String(order.status || "received");
      const label = ORDER_STATUS_LABELS[status] || status;
      const attachmentName = String(order.attachmentName || "첨부파일");
      const attachmentLabel = `${attachmentName} (${formatBytes(order.attachmentSize)})`;
      const attachmentText = order.hasAttachment
        ? `<span class="file-ellipsis" title="${escapeHtml(attachmentLabel)}">${escapeHtml(attachmentLabel)}</span>`
        : "없음";
      const paymentText = `총 ${formatCurrency(order?.payment?.totalAmount || 0)} (판매가 ${formatCurrency(order?.payment?.supplyAmount || 0)} + VAT ${formatCurrency(order?.payment?.vatAmount || 0)})`;
      return `<tr>
        <td>${formatDate(order.orderedAt || order.createdAt)}</td>
        <td>${escapeHtml(order.orderNumber || "-")}</td>
        <td>${escapeHtml(order.title)}</td>
        <td>${escapeHtml(order.mediaName || "-")}</td>
        <td>${escapeHtml(paymentText)}</td>
        <td class="attachment-col">${attachmentText}</td>
        <td><span class="status-badge status-${escapeHtml(status)}">${escapeHtml(label)}</span></td>
      </tr>`;
    })
    .join("");
}

function renderAll() {
  renderMemberState();
  renderHeroSummary();
  renderStats();
  renderMediaGroups();
  renderSelectedMediaCard();
  renderOrders();
}

async function refreshData() {
  const me = await apiFetch("/api/auth/me");
  state.member = me.member;

  try {
    const media = await apiFetch("/api/media");
    state.media = Array.isArray(media.media) ? media.media.filter((item) => item.isActive !== false) : [];
  } catch (error) {
  }

  try {
    const orders = await apiFetch("/api/orders");
    state.orders = Array.isArray(orders.orders) ? orders.orders : [];
  } catch (error) {
  }

  if (!state.selectedMediaId) {
    state.selectedMediaId = state.media[0]?.id || "";
  } else if (!state.media.some((item) => item.id === state.selectedMediaId)) {
    state.selectedMediaId = state.media[0]?.id || "";
  }
  restoreOrderDraft();
  await restorePendingPaymentIntent();
  renderAll();
}

function bindEvents() {
  const searchInput = document.getElementById("media-search");
  const mediaGroupList = document.getElementById("media-group-list");
  const mediaGroupNav = document.getElementById("media-group-nav");
  const orderForm = document.getElementById("member-order-form");
  const logoutButton = document.getElementById("member-logout-button");
  const fileInput = document.getElementById("order-file-input");
  const fileButton = document.getElementById("order-file-button");
  const fileName = document.getElementById("order-file-name");
  const paymentModal = document.getElementById("order-payment-modal");
  const paymentForm = document.getElementById("order-payment-form");
  const paymentClose = document.getElementById("order-payment-close");
  const paymentCancel = document.getElementById("order-payment-cancel");
  const primaryAction = document.getElementById("member-primary-action");
  const paymentStep = document.getElementById("flow-step-payment");
  const mediaStep = document.getElementById("flow-step-media");

  function focusMediaSearch() {
    if (!(searchInput instanceof HTMLInputElement)) return;
    searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
      searchInput.focus({ preventScroll: true });
    }, 120);
  }

  function handlePaymentEntry(event) {
    if (!state.paymentIntent?.intentId) return;
    event.preventDefault();
    const orderPanel = document.getElementById("member-order-panel");
    if (orderPanel instanceof HTMLElement) {
      orderPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.setTimeout(() => {
      openPaymentModal();
    }, 120);
  }

  searchInput?.addEventListener("input", () => {
    state.mediaFilter = String(searchInput.value || "");
    const filteredGroups = getMediaGroups(getFilteredMedia());
    if (filteredGroups.length) state.activeMediaGroup = filteredGroups[0][0];
    renderMediaGroups();
  });

  mediaGroupList?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const mediaTarget = target.closest("[data-select-media]");
    if (!(mediaTarget instanceof HTMLElement)) return;
    const mediaId = mediaTarget.getAttribute("data-select-media");
    if (!mediaId) return;
    state.selectedMediaId = mediaId;
    const selectedMedia = state.media.find((item) => item.id === mediaId);
    if (selectedMedia?.category) {
      state.activeMediaGroup = selectedMedia.category;
    }
    persistOrderDraft();
    renderHeroSummary();
    renderMediaGroups();
    renderSelectedMediaCard();
  });

  mediaGroupNav?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const navButton = target.closest("[data-group-nav]");
    if (!(navButton instanceof HTMLElement)) return;
    const groupName = navButton.getAttribute("data-group-nav");
    if (!groupName) return;
    state.activeMediaGroup = groupName;
    renderMediaGroups();
  });

  orderForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitOrder(orderForm);
  });

  orderForm?.addEventListener("input", () => {
    persistOrderDraft();
    renderHeroSummary();
  });

  fileButton?.addEventListener("click", () => {
    fileInput?.click();
  });

  fileInput?.addEventListener("change", () => {
    const name = fileInput.files?.[0]?.name || "";
    if (!fileName) return;
    fileName.textContent = name ? name : "선택된 파일 없음";
    persistOrderDraft();
    renderHeroSummary();
  });

  primaryAction?.addEventListener("click", (event) => {
    if (state.paymentIntent?.intentId) {
      handlePaymentEntry(event);
      return;
    }
    if (!state.selectedMediaId) {
      event.preventDefault();
      focusMediaSearch();
    }
  });

  paymentStep?.addEventListener("click", (event) => {
    handlePaymentEntry(event);
  });

  mediaStep?.addEventListener("click", (event) => {
    event.preventDefault();
    focusMediaSearch();
  });

  paymentClose?.addEventListener("click", () => {
    closePaymentModal();
  });

  paymentCancel?.addEventListener("click", () => {
    closePaymentModal();
  });

  paymentModal?.addEventListener("click", (event) => {
    if (event.target === paymentModal) {
      closePaymentModal();
    }
  });

  if (paymentForm instanceof HTMLFormElement) {
    paymentForm.addEventListener("submit", (event) => {
      event.preventDefault();
      submitPaymentConfirm(paymentForm);
    });
  }

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!(paymentModal instanceof HTMLElement)) return;
    if (!paymentModal.classList.contains("open")) return;
    closePaymentModal();
  });

  logoutButton?.addEventListener("click", async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch (error) {
    }
    clearOrderDraft();
    redirectToLanding();
  });

}

async function init() {
  clearLegacyTokenStorage();
  setAuthReady(false);
  syncTopbarOffset();
  initChannelTalk();
  bindEvents();
  window.addEventListener("resize", () => {
    syncTopbarOffset();
  });
  const topbar = document.querySelector(".topbar");
  if (typeof ResizeObserver === "function" && topbar instanceof HTMLElement) {
    const topbarObserver = new ResizeObserver(() => syncTopbarOffset());
    topbarObserver.observe(topbar);
  }
  try {
    await refreshData();
    await handleOrderPaymentRedirectResult();
    setAuthReady(true);
    syncTopbarOffset();
  } catch (error) {
    if (Number(error?.status) === 401) {
      redirectToLanding();
      return;
    }
    setAuthReady(true);
    syncTopbarOffset();
    setOrderMessage("error", "데이터 로딩이 지연되고 있습니다. 잠시 후 자동으로 다시 동기화됩니다.");
    renderAll();
    return;
  }

  state.syncTimer = window.setInterval(async () => {
    try {
      await refreshData();
    } catch (error) {
      if (Number(error?.status) === 401) {
        redirectToLanding();
      }
    }
  }, 4000);
}

window.addEventListener("beforeunload", () => {
  if (state.syncTimer) window.clearInterval(state.syncTimer);
});

init();
