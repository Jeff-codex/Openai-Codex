const MEMBER_TOKEN_KEY = "deliver_member_token_v1";
const LANDING_PAGE_PATH = "../랜딩페이지-LandingPage/index.html";
const CHANNEL_TALK_PLUGIN_KEY = "effcd765-65b5-49ca-b003-b18931fc6f38";
const MIN_POINT_CHARGE_AMOUNT = 1000;
const MAX_POINT_CHARGE_AMOUNT = 5000000;
const DEFAULT_POINT_CHARGE_AMOUNT = 100000;

const ORDER_STATUS_LABELS = {
  received: "접수",
  reviewing: "검수중",
  queued: "송출대기",
  published: "송출완료",
  rejected: "반려",
};

const state = {
  member: null,
  media: [],
  orders: [],
  mediaFilter: "",
  selectedMediaId: "",
  activeMediaGroup: "",
  mediaCollapsed: {},
  syncTimer: null,
  pointChargePending: false,
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

  w.ChannelIO("boot", {
    pluginKey,
  });
}

function setOrderMessage(type, text) {
  const message = document.getElementById("order-message");
  if (!message) return;
  message.className = type ? `form-message ${type}` : "form-message";
  message.textContent = text || "";
}

function setPointChargeMessage(type, text) {
  const message = document.getElementById("point-charge-message");
  if (!message) return;
  message.className = type ? `form-message ${type}` : "form-message";
  message.textContent = text || "";
}

function openPointChargeModal(defaultAmount = 0) {
  const modal = document.getElementById("point-charge-modal");
  const amountInput = document.getElementById("point-charge-amount");
  if (!(modal instanceof HTMLElement)) return;
  if (amountInput instanceof HTMLInputElement) {
    const presetAmount = normalizeChargeAmount(defaultAmount);
    if (presetAmount > 0) {
      amountInput.value = String(Math.max(MIN_POINT_CHARGE_AMOUNT, presetAmount));
    }
  }
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  setPointChargeMessage("", "");
  if (amountInput instanceof HTMLInputElement) {
    amountInput.focus();
    amountInput.select();
  }
}

function closePointChargeModal() {
  if (state.pointChargePending) return;
  const modal = document.getElementById("point-charge-modal");
  if (!(modal instanceof HTMLElement)) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  setPointChargeMessage("", "");
}

function normalizeChargeAmount(value) {
  const raw = Number(value || 0);
  if (!Number.isFinite(raw)) return 0;
  const rounded = Math.round(raw);
  return Math.max(0, rounded);
}

async function loadTossPaymentsSdk() {
  if (window.TossPayments) return window.TossPayments;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-toss-sdk="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("토스 SDK 로드 실패")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.tosspayments.com/v1/payment";
    script.async = true;
    script.dataset.tossSdk = "1";
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

async function submitPointCharge(form) {
  if (state.pointChargePending) return;
  const amountInput = form.elements.namedItem("amount");
  const noteInput = form.elements.namedItem("note");
  const submitButton = form.querySelector('button[type="submit"]');
  const amount = normalizeChargeAmount(amountInput?.value);
  const note = String(noteInput?.value || "").trim();
  if (amount < MIN_POINT_CHARGE_AMOUNT) {
    setPointChargeMessage("error", `최소 충전 금액은 ${formatCurrency(MIN_POINT_CHARGE_AMOUNT)} 입니다.`);
    return;
  }
  if (amount > MAX_POINT_CHARGE_AMOUNT) {
    setPointChargeMessage("error", `1회 최대 충전 금액은 ${formatCurrency(MAX_POINT_CHARGE_AMOUNT)} 입니다.`);
    return;
  }

  state.pointChargePending = true;
  if (submitButton instanceof HTMLButtonElement) submitButton.disabled = true;
  setPointChargeMessage("", "결제창을 준비하고 있습니다...");
  try {
    const prepared = await apiFetch("/api/payments/toss/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount, note }),
    });
    const clientKey = String(prepared?.payment?.clientKey || "").trim();
    if (!clientKey || !prepared?.payment?.orderId) {
      throw new Error(prepared?.message || "토스 결제키가 아직 설정되지 않았습니다.");
    }
    const TossPayments = await loadTossPaymentsSdk();
    const tossPayments = TossPayments(clientKey);
    await tossPayments.requestPayment("카드", {
      amount: Number(prepared.payment.amount || amount),
      orderId: String(prepared.payment.orderId),
      orderName: String(prepared.payment.orderName || "딜리버 포인트 충전"),
      customerName: String(state.member?.name || ""),
      customerEmail: String(state.member?.email || ""),
      successUrl: String(prepared.payment.successUrl || window.location.href),
      failUrl: String(prepared.payment.failUrl || window.location.href),
    });
  } catch (error) {
    if (String(error?.code || "").toUpperCase() === "USER_CANCEL") {
      setPointChargeMessage("", "결제가 취소되었습니다.");
      return;
    }
    setPointChargeMessage("error", error.message || "결제 요청 중 오류가 발생했습니다.");
  } finally {
    if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
    state.pointChargePending = false;
  }
}

async function handlePointChargeRedirectResult() {
  const params = new URLSearchParams(window.location.search);
  const paymentKey = String(params.get("paymentKey") || "");
  const orderId = String(params.get("orderId") || "");
  const amountText = String(params.get("amount") || "");
  const failCode = String(params.get("code") || "");
  const failMessage = String(params.get("message") || "");

  if (failCode) {
    clearPaymentResultQuery();
    setOrderMessage("error", `결제가 취소되었거나 실패했습니다. (${failCode}) ${failMessage}`.trim());
    return;
  }
  if (!paymentKey || !orderId || !amountText) return;

  const amount = normalizeChargeAmount(amountText);
  if (amount <= 0) {
    clearPaymentResultQuery();
    setOrderMessage("error", "결제 응답 금액이 올바르지 않습니다.");
    return;
  }

  try {
    const confirmed = await apiFetch("/api/payments/toss/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });
    if (state.member) {
      state.member.pointBalance = Number(confirmed.pointBalance || state.member.pointBalance || 0);
    }
    renderStats();
    setOrderMessage("success", `포인트가 충전되었습니다. (+${formatCurrency(amount)})`);
    closePointChargeModal();
  } catch (error) {
    setOrderMessage("error", error.message || "결제 승인 처리 중 오류가 발생했습니다.");
  } finally {
    clearPaymentResultQuery();
  }
}

function getSelectedMedia() {
  return state.media.find((item) => item.id === state.selectedMediaId) || null;
}

function getSelectedMediaBudget() {
  const media = getSelectedMedia();
  const n = Number(media?.unitPrice || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

function syncBudgetInput() {
  const budgetInput = document.getElementById("order-budget");
  if (!budgetInput) return;
  const budget = getSelectedMediaBudget();
  budgetInput.value = budget > 0 ? String(budget) : "";
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
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "ko-KR"));
}

function scrollToMediaGroup(groupName) {
  const container = document.getElementById("media-group-list");
  if (!container) return;
  const groups = container.querySelectorAll(".media-group");
  let target = null;
  groups.forEach((group) => {
    if (group instanceof HTMLElement && group.dataset.groupName === groupName) {
      target = group;
    }
  });
  if (!container || !target) return;
  container.scrollTo({
    top: Math.max(0, target.offsetTop - 6),
    behavior: "smooth",
  });
}

function renderMemberState() {
  const element = document.getElementById("member-state");
  if (!element) return;
  element.textContent = state.member ? `${state.member.name} (${state.member.loginId})` : "로그인 필요";
}

function renderStats() {
  const pending = state.orders.filter((order) => !["published", "rejected"].includes(String(order.status || ""))).length;
  const published = state.orders.filter((order) => String(order.status || "") === "published").length;

  document.getElementById("stat-points").textContent = formatCurrency(state.member?.pointBalance || 0);
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
  if (!groupNames.includes(state.activeMediaGroup)) {
    state.activeMediaGroup = groupNames[0];
  }
  if (summary) {
    summary.textContent = `총 ${filtered.length}개 · 카테고리 ${groupNames.length}개`;
  }

  nav.innerHTML = groups
    .map(([group, items]) => {
      const active = group === state.activeMediaGroup;
      return `<button class="media-nav-btn ${active ? "active" : ""}" type="button" data-group-nav="${escapeHtml(group)}">${escapeHtml(group)} (${items.length})</button>`;
    })
    .join("");

  list.innerHTML = groups
    .map(([group, items]) => {
      const isActive = group === state.activeMediaGroup;
      const collapsed = state.mediaFilter ? false : isActive ? false : Boolean(state.mediaCollapsed[group]);
      const rows = items
        .map((item) => {
          const selected = item.id === state.selectedMediaId;
          return `<div class="media-item ${selected ? "selected" : ""}" data-select-media="${escapeHtml(item.id)}">
            <div class="media-item-main">
              <div class="media-item-name">${escapeHtml(item.name)}</div>
              <div class="media-item-meta">단가: ${escapeHtml(item.memberPrice || formatCurrency(item.unitPrice))} · 노출: ${escapeHtml(item.channel || "-")}</div>
            </div>
            <button class="btn btn-light small" type="button" data-select-media="${escapeHtml(item.id)}">선택</button>
          </div>`;
        })
        .join("");
      return `<section class="media-group ${collapsed ? "collapsed" : ""} ${isActive ? "active" : ""}" data-group-name="${escapeHtml(group)}">
        <button class="media-group-head" type="button" data-toggle-group="${escapeHtml(group)}">
          <strong>${escapeHtml(group)}</strong>
          <span>${items.length}개 ${collapsed ? "펼치기" : "접기"}</span>
        </button>
        <div class="media-items">${rows}</div>
      </section>`;
    })
    .join("");
}

function renderSelectedMediaCard() {
  const media = getSelectedMedia();
  const name = document.getElementById("selected-media-name");
  const price = document.getElementById("selected-media-price");
  const channel = document.getElementById("selected-media-channel");
  const description = document.getElementById("selected-media-description");

  if (!media) {
    name.textContent = "매체를 선택해 주세요";
    price.textContent = "단가: -";
    channel.textContent = "노출채널: -";
    description.textContent = "참고사항: -";
    syncBudgetInput();
    return;
  }
  name.textContent = `${media.name} (${media.category})`;
  price.textContent = `단가: ${media.memberPrice || formatCurrency(media.unitPrice)}`;
  channel.textContent = `노출채널: ${media.channel || "-"}`;
  description.textContent = `참고사항: ${media.description || "별도 안내 없음"}`;
  syncBudgetInput();
}

function renderOrders() {
  const tbody = document.getElementById("member-orders-body");
  if (!tbody) return;
  if (!state.orders.length) {
    tbody.innerHTML = `<tr><td colspan="6">등록된 주문이 없습니다.</td></tr>`;
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
      return `<tr>
        <td>${formatDate(order.createdAt)}</td>
        <td>${escapeHtml(order.title)}</td>
        <td>${escapeHtml(order.mediaName || "-")}</td>
        <td>${formatCurrency(order.budget)}</td>
        <td class="attachment-col">${attachmentText}</td>
        <td><span class="status-badge status-${escapeHtml(status)}">${escapeHtml(label)}</span></td>
      </tr>`;
    })
    .join("");
}

function renderAll() {
  renderMemberState();
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
    // Keep current screen/session even if media API is temporarily unstable.
  }

  try {
    const orders = await apiFetch("/api/orders");
    state.orders = Array.isArray(orders.orders) ? orders.orders : [];
  } catch (error) {
    // Keep current screen/session even if orders API is temporarily unstable.
  }

  if (!state.selectedMediaId) {
    state.selectedMediaId = state.media[0]?.id || "";
  } else if (!state.media.some((item) => item.id === state.selectedMediaId)) {
    state.selectedMediaId = state.media[0]?.id || "";
  }
  renderAll();
}

async function submitOrder(form) {
  const media = getSelectedMedia();
  if (!media) {
    setOrderMessage("error", "매체를 먼저 선택해 주세요.");
    return;
  }
  const formData = new FormData(form);
  const title = String(formData.get("title") || "").trim();
  const budget = getSelectedMediaBudget();
  const requestNote = String(formData.get("requestNote") || "").trim();
  const draftFile = formData.get("draftFile");
  if (!title) {
    setOrderMessage("error", "주문명을 입력해 주세요.");
    return;
  }
  if (!Number.isFinite(budget) || budget <= 0) {
    setOrderMessage("error", "선택한 매체 단가 정보가 없어 주문할 수 없습니다.");
    return;
  }

  try {
    const payload = new FormData();
    payload.set("mediaId", media.id);
    payload.set("title", title);
    payload.set("budget", String(budget));
    payload.set("requestNote", requestNote);
    if (draftFile && typeof draftFile === "object" && Number(draftFile.size || 0) > 0) {
      payload.set("draftFile", draftFile);
    }
    const response = await apiFetch("/api/orders", {
      method: "POST",
      body: payload,
    });
    state.member.pointBalance = Number(response.pointBalance || state.member.pointBalance || 0);
    form.reset();
    const fileName = document.getElementById("order-file-name");
    if (fileName) fileName.textContent = "선택된 파일 없음";
    setOrderMessage("success", "주문이 등록되었습니다.");
    await refreshData();
  } catch (error) {
    setOrderMessage("error", error.message || "주문 등록 중 오류가 발생했습니다.");
  }
}

function bindEvents() {
  const searchInput = document.getElementById("media-search");
  const mediaGroupList = document.getElementById("media-group-list");
  const mediaGroupNav = document.getElementById("media-group-nav");
  const expandAll = document.getElementById("media-expand-all");
  const collapseAll = document.getElementById("media-collapse-all");
  const orderForm = document.getElementById("member-order-form");
  const logoutButton = document.getElementById("member-logout-button");
  const fileInput = document.getElementById("order-file-input");
  const fileButton = document.getElementById("order-file-button");
  const fileName = document.getElementById("order-file-name");
  const chargeTopButton = document.getElementById("member-charge-button-top");
  const chargeInlineButton = document.getElementById("member-charge-button-inline");
  const pointChargeModal = document.getElementById("point-charge-modal");
  const pointChargeForm = document.getElementById("point-charge-form");
  const pointChargeAmount = document.getElementById("point-charge-amount");
  const pointChargeClose = document.getElementById("point-charge-close");
  const pointChargeCancel = document.getElementById("point-charge-cancel");

  searchInput?.addEventListener("input", () => {
    state.mediaFilter = String(searchInput.value || "");
    const filteredGroups = getMediaGroups(getFilteredMedia());
    if (filteredGroups.length) state.activeMediaGroup = filteredGroups[0][0];
    renderMediaGroups();
  });

  mediaGroupList?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const toggleButton = target.closest("[data-toggle-group]");
    if (toggleButton instanceof HTMLElement) {
      const toggleGroup = toggleButton.getAttribute("data-toggle-group");
      if (!toggleGroup) return;
      state.mediaCollapsed[toggleGroup] = !Boolean(state.mediaCollapsed[toggleGroup]);
      state.activeMediaGroup = toggleGroup;
      renderMediaGroups();
      return;
    }

    const mediaTarget = target.closest("[data-select-media]");
    if (!(mediaTarget instanceof HTMLElement)) return;
    const mediaId = mediaTarget.getAttribute("data-select-media");
    if (!mediaId) return;
    state.selectedMediaId = mediaId;
    const selectedMedia = state.media.find((item) => item.id === mediaId);
    if (selectedMedia?.category) {
      state.activeMediaGroup = selectedMedia.category;
      state.mediaCollapsed[selectedMedia.category] = false;
    }
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
    state.mediaCollapsed[groupName] = false;
    renderMediaGroups();
    scrollToMediaGroup(groupName);
  });

  expandAll?.addEventListener("click", () => {
    state.mediaCollapsed = {};
    renderMediaGroups();
  });

  collapseAll?.addEventListener("click", () => {
    const groups = getMediaGroups(getFilteredMedia());
    const next = {};
    groups.forEach(([group]) => {
      next[group] = true;
    });
    state.mediaCollapsed = next;
    if (state.activeMediaGroup) state.mediaCollapsed[state.activeMediaGroup] = false;
    renderMediaGroups();
  });

  orderForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitOrder(orderForm);
  });

  fileButton?.addEventListener("click", () => {
    fileInput?.click();
  });

  fileInput?.addEventListener("change", () => {
    const name = fileInput.files?.[0]?.name || "";
    if (!fileName) return;
    fileName.textContent = name ? name : "선택된 파일 없음";
  });

  chargeTopButton?.addEventListener("click", () => {
    openPointChargeModal(DEFAULT_POINT_CHARGE_AMOUNT);
  });

  chargeInlineButton?.addEventListener("click", () => {
    openPointChargeModal(DEFAULT_POINT_CHARGE_AMOUNT);
  });

  pointChargeClose?.addEventListener("click", () => {
    closePointChargeModal();
  });

  pointChargeCancel?.addEventListener("click", () => {
    closePointChargeModal();
  });

  pointChargeModal?.addEventListener("click", (event) => {
    if (event.target === pointChargeModal) {
      closePointChargeModal();
    }
  });

  if (pointChargeForm instanceof HTMLFormElement) {
    pointChargeForm.addEventListener("submit", (event) => {
      event.preventDefault();
      submitPointCharge(pointChargeForm);
    });
  }

  if (pointChargeAmount instanceof HTMLInputElement) {
    pointChargeAmount.addEventListener("blur", () => {
      const normalized = normalizeChargeAmount(pointChargeAmount.value);
      pointChargeAmount.value = normalized > 0 ? String(normalized) : "";
    });
  }

  document.querySelectorAll("[data-charge-quick]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!(button instanceof HTMLElement)) return;
      const value = normalizeChargeAmount(button.getAttribute("data-charge-quick"));
      if (!(pointChargeAmount instanceof HTMLInputElement) || value <= 0) return;
      pointChargeAmount.value = String(value);
      pointChargeAmount.focus();
      pointChargeAmount.select();
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!(pointChargeModal instanceof HTMLElement)) return;
    if (!pointChargeModal.classList.contains("open")) return;
    closePointChargeModal();
  });

  logoutButton?.addEventListener("click", async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch (error) {
    }
    redirectToLanding();
  });
}

async function init() {
  clearLegacyTokenStorage();
  initChannelTalk();
  bindEvents();
  try {
    await refreshData();
    await handlePointChargeRedirectResult();
  } catch (error) {
    if (Number(error?.status) === 401) {
      redirectToLanding();
      return;
    }
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
