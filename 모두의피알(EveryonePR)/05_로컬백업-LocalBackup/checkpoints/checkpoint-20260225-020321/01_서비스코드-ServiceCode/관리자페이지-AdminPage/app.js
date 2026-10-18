const LEGACY_ADMIN_TOKEN_KEY = "deliver_admin_token_v1";

const ORDER_STATUS = [
  { value: "received", label: "접수" },
  { value: "reviewing", label: "검수중" },
  { value: "queued", label: "송출대기" },
  { value: "published", label: "송출완료" },
  { value: "rejected", label: "반려" },
];
const MEMBERS_PAGE_SIZE = 11;
const ORDERS_PAGE_SIZE = 10;
const LOGS_PAGE_SIZE = 20;

const state = {
  admin: null,
  members: [],
  orders: [],
  media: [],
  logs: [],
  securityLogs: [],
  memberFilter: "",
  memberRoleFilter: "",
  memberPage: 1,
  editingMemberId: "",
  editingMediaId: "",
  orderPage: 1,
  orderFilter: "",
  orderStatusFilter: "",
  auditOutcomeFilter: "",
  auditSearch: "",
  logPage: 1,
};

function clearLegacyAdminTokens() {
  try {
    localStorage.removeItem(LEGACY_ADMIN_TOKEN_KEY);
  } catch (error) {
  }
}

function formatDate(value) {
  try {
    return new Date(value).toLocaleString("ko-KR");
  } catch (error) {
    return value || "-";
  }
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateCompact(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const min = pad2(date.getMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function formatCurrency(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0원";
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
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

function renderExpandableText(text, expandAt = 24, ellipsisClass = "cell-ellipsis") {
  const source = String(text || "").trim();
  const safeText = escapeHtml(source || "-");
  if (!source || source.length <= expandAt) {
    return `<span class="${ellipsisClass}" title="${safeText}">${safeText}</span>`;
  }
  const shortText = escapeHtml(`${source.slice(0, expandAt).trimEnd()}…`);
  return `<details class="cell-details">
    <summary>
      <span class="${ellipsisClass}" title="${safeText}">${shortText}</span>
      <span class="cell-more-chip">상세</span>
    </summary>
    <div class="cell-details-body">${safeText}</div>
  </details>`;
}

function renderCompactInlineText(text, maxLength = 16, ellipsisClass = "mobile-ellipsis") {
  const source = String(text || "").trim();
  if (!source) return `<span class="${ellipsisClass}">-</span>`;
  const clipped = source.length > maxLength ? `${source.slice(0, maxLength).trimEnd()}…` : source;
  return `<span class="${ellipsisClass}" title="${escapeHtml(source)}">${escapeHtml(clipped)}</span>`;
}

function renderEllipsisCell(value, fallback = "-") {
  const text = String(value || "").trim() || String(fallback || "-");
  return renderExpandableText(text, 24, "cell-ellipsis");
}

function renderDateCell(value) {
  const full = formatDate(value);
  const compact = formatDateCompact(value);
  const titleText = full && full !== "-" ? full : compact;
  const bodyText = compact && compact !== "-" ? compact : full;
  return `<span class="cell-ellipsis" title="${escapeHtml(titleText || "-")}">${escapeHtml(bodyText || "-")}</span>`;
}

function getRoleLabel(role) {
  return String(role || "").toLowerCase() === "admin" ? "관리자" : "회원";
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
    throw new Error(data.message || `API ${response.status}`);
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

function parseFileNameFromDisposition(disposition) {
  const source = String(disposition || "");
  const utfMatch = source.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch && utfMatch[1]) {
    try {
      return decodeURIComponent(utfMatch[1].trim());
    } catch (error) {
    }
  }
  const plainMatch = source.match(/filename="?([^";]+)"?/i);
  if (plainMatch && plainMatch[1]) return plainMatch[1].trim();
  return "attachment.bin";
}

async function fetchAttachment(orderId, asDownload) {
  const headers = {};
  const response = await fetch(`/api/admin/attachment?orderId=${encodeURIComponent(orderId)}&download=${asDownload ? "1" : "0"}`, {
    method: "GET",
    headers,
    credentials: "same-origin",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `API ${response.status}`);
  }
  const blob = await response.blob();
  const filename = parseFileNameFromDisposition(response.headers.get("content-disposition"));
  return { blob, filename };
}

async function openOrderAttachment(orderId, asDownload) {
  const { blob, filename } = await fetchAttachment(orderId, asDownload);
  const objectUrl = URL.createObjectURL(blob);
  if (asDownload) {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
    return;
  }
  window.open(objectUrl, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
}

function setAuthMessage(type, text) {
  const message = document.getElementById("admin-login-message");
  if (!message) return;
  message.className = type ? `form-message ${type}` : "form-message";
  message.textContent = text || "";
}

function switchPanel(panelKey) {
  document.querySelectorAll(".side-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.panel === panelKey);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `panel-${panelKey}`);
  });
}

function setAuthenticatedView(isAuthenticated, loginId) {
  const authScreen = document.getElementById("admin-auth-screen");
  const app = document.getElementById("admin-app");
  const authState = document.getElementById("admin-auth-state");
  const logoutButton = document.getElementById("admin-logout-button");

  authScreen?.classList.toggle("hidden", isAuthenticated);
  app?.classList.toggle("hidden", !isAuthenticated);

  if (authState) {
    authState.classList.toggle("hidden", !isAuthenticated);
    authState.textContent = isAuthenticated ? `관리자: ${loginId}` : "";
  }
  logoutButton?.classList.toggle("hidden", !isAuthenticated);
}

function renderDashboard() {
  const pending = state.orders.filter((order) => !["published", "rejected"].includes(String(order.status || ""))).length;
  const activeMedia = state.media.filter((media) => media.isActive).length;

  document.getElementById("stat-members").textContent = String(state.members.length);
  document.getElementById("stat-orders").textContent = String(state.orders.length);
  document.getElementById("stat-pending").textContent = String(pending);
  document.getElementById("stat-media").textContent = String(activeMedia);
}

function getFilteredMembers() {
  const query = state.memberFilter.trim().toLowerCase();
  const roleFilter = String(state.memberRoleFilter || "").trim().toLowerCase();
  return state.members.filter((member) => {
    if (roleFilter && String(member.role || "").toLowerCase() !== roleFilter) return false;
    if (!query) return true;
    return (
      String(member.loginId || "").toLowerCase().includes(query) ||
      String(member.name || "").toLowerCase().includes(query) ||
      String(member.email || "").toLowerCase().includes(query)
    );
  });
}

function getTotalMemberPages(filteredMembers) {
  return Math.max(1, Math.ceil(filteredMembers.length / MEMBERS_PAGE_SIZE));
}

function renderMembersPagination(filteredMembers) {
  const pager = document.getElementById("members-pagination");
  if (!pager) return;
  const totalPages = getTotalMemberPages(filteredMembers);
  const page = Math.min(Math.max(1, state.memberPage), totalPages);
  state.memberPage = page;

  if (filteredMembers.length <= MEMBERS_PAGE_SIZE) {
    pager.innerHTML = "";
    return;
  }

  let buttons = "";
  for (let i = 1; i <= totalPages; i += 1) {
    buttons += `<button class="pager-btn ${i === page ? "active" : ""}" type="button" data-members-page="${i}">${i}</button>`;
  }
  pager.innerHTML = `
    <button class="pager-btn" type="button" data-members-page="${Math.max(1, page - 1)}">이전</button>
    ${buttons}
    <button class="pager-btn" type="button" data-members-page="${Math.min(totalPages, page + 1)}">다음</button>
  `;
}

function renderMembers() {
  const tbody = document.getElementById("members-body");
  const mobileList = document.getElementById("members-mobile-list");
  const filtered = getFilteredMembers();
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8">회원 데이터가 없습니다.</td></tr>`;
    if (mobileList instanceof HTMLElement) {
      mobileList.innerHTML = `<div class="mobile-empty">회원 데이터가 없습니다.</div>`;
    }
    renderMembersPagination(filtered);
    return;
  }

  const totalPages = getTotalMemberPages(filtered);
  const page = Math.min(Math.max(1, state.memberPage), totalPages);
  state.memberPage = page;
  const start = (page - 1) * MEMBERS_PAGE_SIZE;
  const list = filtered.slice(start, start + MEMBERS_PAGE_SIZE);

  tbody.innerHTML = list
    .map(
      (member) => `
      <tr>
        <td class="col-created" data-label="가입일">${renderDateCell(member.createdAt)}</td>
        <td class="col-member-name" data-label="이름">${renderEllipsisCell(member.name, "-")}</td>
        <td class="col-member-login" data-label="아이디">${renderEllipsisCell(member.loginId, "-")}</td>
        <td class="col-member-email" data-label="이메일">${renderEllipsisCell(member.email, "-")}</td>
        <td class="col-member-company" data-label="회사명">${renderEllipsisCell(member.company || "-", "-")}</td>
        <td class="col-member-point" data-label="보유 포인트">${formatCurrency(member.pointBalance || 0)}</td>
        <td class="col-member-role" data-label="권한">${member.role === "admin" ? "관리자" : "회원"}</td>
        <td class="col-member-action" data-label="관리">
          <button class="btn btn-light small" type="button" data-edit-member="${member.id}">회원정보 수정</button>
        </td>
      </tr>`
    )
    .join("");

  if (mobileList instanceof HTMLElement) {
    mobileList.innerHTML = list
      .map((member) => {
        const roleLabel = getRoleLabel(member.role);
        const roleClass = String(member.role || "").toLowerCase() === "admin" ? "admin" : "member";
        return `<article class="mobile-card">
          <header class="mobile-card-head">
            <div class="mobile-card-title-wrap">
              <h3 class="mobile-card-title">${escapeHtml(String(member.name || "-"))}</h3>
              <p class="mobile-card-sub">${renderCompactInlineText(member.email || "-", 22, "mobile-ellipsis")}</p>
            </div>
            <span class="mobile-role-badge ${roleClass}">${escapeHtml(roleLabel)}</span>
          </header>
          <div class="mobile-kv-grid">
            <div class="mobile-kv">
              <span class="mobile-kv-label">가입일</span>
              <span class="mobile-kv-value">${escapeHtml(formatDateCompact(member.createdAt))}</span>
            </div>
            <div class="mobile-kv">
              <span class="mobile-kv-label">아이디</span>
              <div class="mobile-kv-value">${renderExpandableText(member.loginId || "-", 16, "mobile-ellipsis")}</div>
            </div>
            <div class="mobile-kv">
              <span class="mobile-kv-label">회사명</span>
              <div class="mobile-kv-value">${renderExpandableText(member.company || "-", 16, "mobile-ellipsis")}</div>
            </div>
            <div class="mobile-kv">
              <span class="mobile-kv-label">보유 포인트</span>
              <span class="mobile-kv-value">${escapeHtml(formatCurrency(member.pointBalance || 0))}</span>
            </div>
          </div>
          <footer class="mobile-card-actions">
            <button class="btn btn-light small" type="button" data-edit-member="${member.id}">회원정보 수정</button>
          </footer>
        </article>`;
      })
      .join("");
  }
  renderMembersPagination(filtered);
}

function renderOrderMediaSelect() {
  const select = document.getElementById("order-media-select");
  const activeMedia = state.media.filter((media) => media.isActive);

  if (!activeMedia.length) {
    select.innerHTML = `<option value="">활성 매체 없음</option>`;
    return;
  }

  select.innerHTML = activeMedia
    .map((media) => `<option value="${media.id}">${media.name} (${media.category})</option>`)
    .join("");
}

function getFilteredOrders() {
  const query = String(state.orderFilter || "")
    .trim()
    .toLowerCase();
  const statusFilter = String(state.orderStatusFilter || "")
    .trim()
    .toLowerCase();
  return state.orders.filter((order) => {
    const status = String(order.status || "").toLowerCase();
    if (statusFilter && status !== statusFilter) return false;
    if (!query) return true;
    const source = [order.title, order.memberLoginId, order.email, order.mediaName, order.status]
      .map((item) => String(item || "").toLowerCase())
      .join(" ");
    return source.includes(query);
  });
}

function getTotalOrderPages(filteredOrders) {
  return Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PAGE_SIZE));
}

function renderOrdersPagination(filteredOrders) {
  const pager = document.getElementById("orders-pagination");
  if (!pager) return;
  const totalPages = getTotalOrderPages(filteredOrders);
  const page = Math.min(Math.max(1, state.orderPage), totalPages);
  state.orderPage = page;

  if (filteredOrders.length <= ORDERS_PAGE_SIZE) {
    pager.innerHTML = "";
    return;
  }

  let buttons = "";
  for (let i = 1; i <= totalPages; i += 1) {
    buttons += `<button class="pager-btn ${i === page ? "active" : ""}" type="button" data-orders-page="${i}">${i}</button>`;
  }
  pager.innerHTML = `
    <button class="pager-btn" type="button" data-orders-page="${Math.max(1, page - 1)}">이전</button>
    ${buttons}
    <button class="pager-btn" type="button" data-orders-page="${Math.min(totalPages, page + 1)}">다음</button>
  `;
}

function renderOrders() {
  const tbody = document.getElementById("orders-body");
  const mobileList = document.getElementById("orders-mobile-list");
  const filtered = getFilteredOrders();
  if (!filtered.length) {
    if (!state.orders.length) {
      tbody.innerHTML = `<tr><td colspan="8">등록된 주문이 없습니다.</td></tr>`;
      if (mobileList instanceof HTMLElement) {
        mobileList.innerHTML = `<div class="mobile-empty">등록된 주문이 없습니다.</div>`;
      }
    } else {
      tbody.innerHTML = `<tr><td colspan="8">필터 조건에 맞는 주문이 없습니다.</td></tr>`;
      if (mobileList instanceof HTMLElement) {
        mobileList.innerHTML = `<div class="mobile-empty">필터 조건에 맞는 주문이 없습니다.</div>`;
      }
    }
    renderOrdersPagination(filtered);
    return;
  }

  if (!state.orders.length) {
    tbody.innerHTML = `<tr><td colspan="8">등록된 주문이 없습니다.</td></tr>`;
    renderOrdersPagination(filtered);
    return;
  }
  const totalPages = getTotalOrderPages(filtered);
  const page = Math.min(Math.max(1, state.orderPage), totalPages);
  state.orderPage = page;
  const start = (page - 1) * ORDERS_PAGE_SIZE;
  const list = filtered.slice(start, start + ORDERS_PAGE_SIZE);

  tbody.innerHTML = list
    .map((order) => {
      const statusOptions = ORDER_STATUS.map(
        (status) =>
          `<option value="${status.value}" ${order.status === status.value ? "selected" : ""}>${status.label}</option>`
      ).join("");

      return `
      <tr>
        <td class="col-date" data-label="접수일">${renderDateCell(order.createdAt)}</td>
        <td class="col-title" data-label="주문명">${renderEllipsisCell(order.title, "-")}</td>
        <td class="col-login-id" data-label="회원아이디">${renderEllipsisCell(order.memberLoginId, "-")}</td>
        <td class="col-email" data-label="회원 이메일">${renderEllipsisCell(order.email, "비회원/미매핑")}</td>
        <td class="col-media" data-label="매체">${renderEllipsisCell(order.mediaName, "-")}</td>
        <td class="col-budget" data-label="예산">${formatCurrency(order.budget)}</td>
        <td class="col-attachment" data-label="첨부 파일">
          ${
            order.hasAttachment
              ? (() => {
                  const attachmentName = String(order.attachmentName || "첨부파일");
                  const attachmentLabel = `${attachmentName} (${formatBytes(order.attachmentSize)})`;
                  return `<div class="attach-actions">
                  <button class="btn btn-light small" type="button" data-view-attachment="${order.id}">열람</button>
                  <button class="btn btn-light small" type="button" data-download-attachment="${order.id}">저장</button>
                  <div class="attach-meta">${renderExpandableText(attachmentLabel, 26, "file-ellipsis")}</div>
                </div>`;
                })()
              : `<span class="attach-empty">없음</span>`
          }
        </td>
        <td class="col-status" data-label="상태">
          <select data-order-status data-order-id="${order.id}">
            ${statusOptions}
          </select>
        </td>
      </tr>`;
    })
    .join("");

  if (mobileList instanceof HTMLElement) {
    mobileList.innerHTML = list
      .map((order) => {
        const statusOptions = ORDER_STATUS.map(
          (status) =>
            `<option value="${status.value}" ${order.status === status.value ? "selected" : ""}>${status.label}</option>`
        ).join("");
        const attachmentBlock = order.hasAttachment
          ? (() => {
              const attachmentName = String(order.attachmentName || "첨부파일");
              const attachmentLabel = `${attachmentName} (${formatBytes(order.attachmentSize)})`;
              return `<div class="mobile-attachment">
                <div class="mobile-kv">
                  <span class="mobile-kv-label">첨부 파일</span>
                  <div class="mobile-kv-value">${renderExpandableText(attachmentLabel, 18, "mobile-ellipsis")}</div>
                </div>
                <div class="mobile-card-actions two">
                  <button class="btn btn-light small" type="button" data-view-attachment="${order.id}">열람</button>
                  <button class="btn btn-light small" type="button" data-download-attachment="${order.id}">저장</button>
                </div>
              </div>`;
            })()
          : `<div class="mobile-kv"><span class="mobile-kv-label">첨부 파일</span><span class="mobile-kv-value">없음</span></div>`;

        return `<article class="mobile-card">
          <header class="mobile-card-head">
            <div class="mobile-card-title-wrap">
              <h3 class="mobile-card-title">${renderCompactInlineText(order.title || "-", 18, "mobile-ellipsis")}</h3>
              <p class="mobile-card-sub">${escapeHtml(formatDateCompact(order.createdAt))}</p>
            </div>
          </header>
          <div class="mobile-kv-grid">
            <div class="mobile-kv">
              <span class="mobile-kv-label">회원아이디</span>
              <div class="mobile-kv-value">${renderExpandableText(order.memberLoginId || "-", 14, "mobile-ellipsis")}</div>
            </div>
            <div class="mobile-kv">
              <span class="mobile-kv-label">회원 이메일</span>
              <div class="mobile-kv-value">${renderExpandableText(order.email || "비회원/미매핑", 16, "mobile-ellipsis")}</div>
            </div>
            <div class="mobile-kv">
              <span class="mobile-kv-label">매체</span>
              <div class="mobile-kv-value">${renderExpandableText(order.mediaName || "-", 14, "mobile-ellipsis")}</div>
            </div>
            <div class="mobile-kv">
              <span class="mobile-kv-label">예산</span>
              <span class="mobile-kv-value">${escapeHtml(formatCurrency(order.budget))}</span>
            </div>
          </div>
          <div class="mobile-status-row">
            <span class="mobile-kv-label">상태</span>
            <select data-order-status data-order-id="${order.id}">
              ${statusOptions}
            </select>
          </div>
          ${attachmentBlock}
        </article>`;
      })
      .join("");
  }
  renderOrdersPagination(filtered);
}

function renderMedia() {
  const tbody = document.getElementById("media-body");
  if (!state.media.length) {
    tbody.innerHTML = `<tr><td colspan="5">매체 데이터가 없습니다.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.media
    .map(
      (media) => `
      <tr>
        <td>${media.name}</td>
        <td>${media.category}</td>
        <td>${media.memberPrice || "회원전용"}</td>
        <td>${media.isActive ? "활성" : "비활성"}</td>
        <td>
          <div class="media-action-buttons">
            <button class="btn btn-light small" type="button" data-toggle-media="${media.id}">
              ${media.isActive ? "비활성화" : "활성화"}
            </button>
            <button class="btn btn-light small" type="button" data-edit-media="${media.id}">정보 수정</button>
          </div>
        </td>
      </tr>`
    )
    .join("");
}

function renderLogs() {
  const list = document.getElementById("log-list");
  const pager = document.getElementById("logs-pagination");
  if (!state.logs.length) {
    list.innerHTML = `<li>운영 로그가 없습니다.</li>`;
    if (pager) pager.innerHTML = "";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(state.logs.length / LOGS_PAGE_SIZE));
  const page = Math.min(Math.max(1, state.logPage), totalPages);
  state.logPage = page;
  const start = (page - 1) * LOGS_PAGE_SIZE;
  const chunk = state.logs.slice(start, start + LOGS_PAGE_SIZE);

  list.innerHTML = chunk
    .map(
      (log) => `
      <li>
        <div>${log.message}</div>
        <div class="log-time">${formatDate(log.createdAt)}</div>
      </li>`
    )
    .join("");

  if (!pager) return;
  if (state.logs.length <= LOGS_PAGE_SIZE) {
    pager.innerHTML = "";
    return;
  }
  let buttons = "";
  for (let i = 1; i <= totalPages; i += 1) {
    buttons += `<button class="pager-btn ${i === page ? "active" : ""}" type="button" data-logs-page="${i}">${i}</button>`;
  }
  pager.innerHTML = `
    <button class="pager-btn" type="button" data-logs-page="${Math.max(1, page - 1)}">이전</button>
    ${buttons}
    <button class="pager-btn" type="button" data-logs-page="${Math.min(totalPages, page + 1)}">다음</button>
  `;
}

function formatAuditOutcome(outcome) {
  const value = String(outcome || "").trim().toLowerCase();
  if (value === "success") return "성공";
  if (value === "failed") return "실패";
  if (value === "blocked") return "차단";
  return value || "-";
}

function getFilteredSecurityLogs() {
  const outcomeFilter = String(state.auditOutcomeFilter || "").trim().toLowerCase();
  const query = String(state.auditSearch || "")
    .trim()
    .toLowerCase();
  return state.securityLogs.filter((log) => {
    const outcome = String(log.outcome || "").trim().toLowerCase();
    if (outcomeFilter && outcome !== outcomeFilter) return false;
    if (!query) return true;
    const source = [
      log.eventType,
      log.actorType,
      log.actorId,
      log.outcome,
      log.ip,
      log.detail,
    ]
      .map((item) => String(item || "").toLowerCase())
      .join(" ");
    return source.includes(query);
  });
}

function renderSecuritySummary() {
  const totalEl = document.getElementById("audit-total");
  const successEl = document.getElementById("audit-success");
  const failedEl = document.getElementById("audit-failed");
  const total = state.securityLogs.length;
  const success = state.securityLogs.filter((log) => String(log.outcome || "").toLowerCase() === "success").length;
  const failed = state.securityLogs.filter((log) => {
    const value = String(log.outcome || "").toLowerCase();
    return value === "failed" || value === "blocked";
  }).length;
  if (totalEl) totalEl.textContent = `총 ${total}건`;
  if (successEl) successEl.textContent = `성공 ${success}건`;
  if (failedEl) failedEl.textContent = `실패/차단 ${failed}건`;
}

function renderSecurityLogs() {
  const tbody = document.getElementById("security-log-body");
  if (!(tbody instanceof HTMLElement)) return;

  const filtered = getFilteredSecurityLogs();
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6">표시할 보안 감사 로그가 없습니다.</td></tr>`;
    renderSecuritySummary();
    return;
  }

  tbody.innerHTML = filtered
    .slice(0, 120)
    .map((log) => {
      const outcome = String(log.outcome || "").toLowerCase();
      const outcomeLabel = formatAuditOutcome(outcome);
      return `
        <tr>
          <td class="col-audit-time" data-label="발생시각">${renderDateCell(log.createdAt)}</td>
          <td class="col-audit-event" data-label="이벤트">${renderEllipsisCell(log.eventType || "-", "-")}</td>
          <td class="col-audit-actor" data-label="행위자">${renderEllipsisCell(`${log.actorType || "system"}:${log.actorId || "-"}`, "-")}</td>
          <td class="col-audit-result" data-label="결과"><span class="audit-badge ${outcome}">${escapeHtml(outcomeLabel)}</span></td>
          <td class="col-audit-ip" data-label="IP">${renderEllipsisCell(log.ip || "-", "-")}</td>
          <td class="col-audit-detail" data-label="상세">${renderEllipsisCell(log.detail || "-", "-")}</td>
        </tr>
      `;
    })
    .join("");
  renderSecuritySummary();
}

function renderAll() {
  renderDashboard();
  renderMembers();
  renderOrderMediaSelect();
  renderOrders();
  renderMedia();
  renderLogs();
  renderSecurityLogs();
}

async function refreshAdminData() {
  const data = await apiFetch("/api/admin/bootstrap");
  state.admin = data.admin || state.admin;
  state.members = data.members || [];
  state.orders = data.orders || [];
  state.media = data.media || [];
  state.logs = data.logs || [];
  state.securityLogs = data.securityLogs || [];
  state.memberPage = Math.min(state.memberPage, getTotalMemberPages(getFilteredMembers()));
  state.orderPage = Math.min(state.orderPage, getTotalOrderPages(getFilteredOrders()));
  state.logPage = Math.min(state.logPage, Math.max(1, Math.ceil(state.logs.length / LOGS_PAGE_SIZE)));
  renderAll();
}

async function clearAdminLogs() {
  await apiFetch("/api/admin/logs", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope: "admin_logs" }),
  });
  state.logPage = 1;
  await refreshAdminData();
}

function setMemberEditMessage(type, text) {
  const message = document.getElementById("member-edit-message");
  if (!message) return;
  message.className = type ? `form-message ${type}` : "form-message";
  message.textContent = text || "";
}

function openMemberEditModal(memberId) {
  const modal = document.getElementById("member-edit-modal");
  const form = document.getElementById("member-edit-form");
  if (!(modal instanceof HTMLElement) || !(form instanceof HTMLFormElement)) return;
  const member = state.members.find((item) => item.id === memberId);
  if (!member) return;

  state.editingMemberId = member.id;
  form.elements.namedItem("memberName").value = String(member.name || "-");
  form.elements.namedItem("memberLoginId").value = String(member.loginId || "-");
  form.elements.namedItem("memberEmail").value = String(member.email || "-");
  form.elements.namedItem("pointBalance").value = String(Math.max(0, Number(member.pointBalance || 0)));
  form.elements.namedItem("newPassword").value = "";
  setMemberEditMessage("", "");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeMemberEditModal() {
  const modal = document.getElementById("member-edit-modal");
  if (!(modal instanceof HTMLElement)) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  state.editingMemberId = "";
}

async function updateMemberInfo(form) {
  if (!state.editingMemberId) {
    setMemberEditMessage("error", "수정할 회원을 찾을 수 없습니다.");
    return;
  }
  const formData = new FormData(form);
  const pointBalance = Number(formData.get("pointBalance") || 0);
  const newPassword = String(formData.get("newPassword") || "");
  if (!Number.isFinite(pointBalance) || pointBalance < 0) {
    setMemberEditMessage("error", "포인트는 0 이상의 숫자여야 합니다.");
    return;
  }
  if (newPassword && newPassword.length < 8) {
    setMemberEditMessage("error", "비밀번호는 8자 이상이어야 합니다.");
    return;
  }

  await apiFetch("/api/admin/members", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      memberId: state.editingMemberId,
      pointBalance: Math.round(pointBalance),
      password: newPassword,
    }),
  });
  setMemberEditMessage("success", "회원정보가 수정되었습니다.");
  await refreshAdminData();
  window.setTimeout(() => {
    closeMemberEditModal();
  }, 400);
}

function setMediaEditMessage(type, text) {
  const message = document.getElementById("media-edit-message");
  if (!message) return;
  message.className = type ? `form-message ${type}` : "form-message";
  message.textContent = text || "";
}

function openMediaEditModal(mediaId) {
  const modal = document.getElementById("media-edit-modal");
  const form = document.getElementById("media-edit-form");
  if (!(modal instanceof HTMLElement) || !(form instanceof HTMLFormElement)) return;
  const media = state.media.find((item) => item.id === mediaId);
  if (!media) return;

  state.editingMediaId = media.id;
  form.elements.namedItem("name").value = String(media.name || "");
  form.elements.namedItem("category").value = String(media.category || "");
  form.elements.namedItem("memberPrice").value = String(media.memberPrice || "");
  const unitPrice = Number(media.unitPrice || 0);
  form.elements.namedItem("unitPrice").value =
    Number.isFinite(unitPrice) && unitPrice > 0 ? String(Math.round(unitPrice)) : "";
  setMediaEditMessage("", "");
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeMediaEditModal() {
  const modal = document.getElementById("media-edit-modal");
  if (!(modal instanceof HTMLElement)) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  state.editingMediaId = "";
}

async function updateMediaInfo(form) {
  if (!state.editingMediaId) {
    setMediaEditMessage("error", "수정할 매체를 찾을 수 없습니다.");
    return;
  }
  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const memberPrice = String(formData.get("memberPrice") || "회원전용").trim() || "회원전용";
  const unitPriceRaw = String(formData.get("unitPrice") || "").trim();

  if (!name || !category) {
    setMediaEditMessage("error", "매체명과 카테고리를 입력해 주세요.");
    return;
  }

  let unitPrice = null;
  if (unitPriceRaw) {
    const parsed = Number(unitPriceRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setMediaEditMessage("error", "기준 단가는 0 이상의 숫자로 입력해 주세요.");
      return;
    }
    unitPrice = Math.round(parsed);
  }

  const payload = {
    action: "update",
    mediaId: state.editingMediaId,
    name,
    category,
    memberPrice,
  };
  if (unitPrice !== null) payload.unitPrice = unitPrice;

  await apiFetch("/api/admin/media", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  setMediaEditMessage("success", "매체 정보가 수정되었습니다.");
  await refreshAdminData();
  window.setTimeout(() => {
    closeMediaEditModal();
  }, 400);
}

async function updateOrderStatus(orderId, status) {
  await apiFetch("/api/admin/orders", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId, status }),
  });
  await refreshAdminData();
}

async function toggleMedia(mediaId) {
  await apiFetch("/api/admin/media", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mediaId }),
  });
  await refreshAdminData();
}

async function createOrder(form) {
  const formData = new FormData(form);
  const email = String(formData.get("email") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const mediaId = String(formData.get("mediaId") || "").trim();
  const budget = Number(formData.get("budget") || 0);

  if (!title || !mediaId || !Number.isFinite(budget) || budget <= 0) {
    window.alert("주문명, 매체, 예산을 올바르게 입력해 주세요.");
    return;
  }

  await apiFetch("/api/admin/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, title, mediaId, budget }),
  });
  form.reset();
  await refreshAdminData();
}

async function createMedia(form) {
  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const memberPrice = String(formData.get("memberPrice") || "회원전용").trim();

  if (!name || !category) {
    window.alert("매체명과 카테고리를 입력해 주세요.");
    return;
  }

  await apiFetch("/api/admin/media", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, category, memberPrice }),
  });
  form.reset();
  await refreshAdminData();
}

function bindAdminAuth() {
  const loginForm = document.getElementById("admin-login-form");
  const logoutButton = document.getElementById("admin-logout-button");

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const loginId = String(formData.get("loginId") || "").trim();
    const password = String(formData.get("password") || "");

    try {
      const response = await apiFetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginId, password }),
      });
      state.admin = response.admin;
      setAuthenticatedView(true, state.admin?.loginId || "admin");
      setAuthMessage("", "");
      await refreshAdminData();
      switchPanel("dashboard");
    } catch (error) {
      setAuthMessage("error", error.message || "로그인 실패");
    }
  });

  logoutButton?.addEventListener("click", async () => {
    try {
      await apiFetch("/api/admin/logout", { method: "POST" });
    } catch (error) {
    }
    state.admin = null;
    setAuthenticatedView(false, "");
    setAuthMessage("", "");
    loginForm?.reset();
  });
}

function bindPanels() {
  document.querySelectorAll(".side-btn").forEach((button) => {
    button.addEventListener("click", () => switchPanel(button.dataset.panel));
  });
}

function bindActions() {
  document.getElementById("member-search")?.addEventListener("input", (event) => {
    state.memberFilter = String(event.target.value || "");
    state.memberPage = 1;
    renderMembers();
  });

  document.getElementById("member-role-filter")?.addEventListener("change", (event) => {
    state.memberRoleFilter = String(event.target.value || "");
    state.memberPage = 1;
    renderMembers();
  });

  document.getElementById("member-filter-reset")?.addEventListener("click", () => {
    state.memberFilter = "";
    state.memberRoleFilter = "";
    state.memberPage = 1;
    const search = document.getElementById("member-search");
    const role = document.getElementById("member-role-filter");
    if (search instanceof HTMLInputElement) search.value = "";
    if (role instanceof HTMLSelectElement) role.value = "";
    renderMembers();
  });

  document.getElementById("order-search")?.addEventListener("input", (event) => {
    state.orderFilter = String(event.target.value || "");
    state.orderPage = 1;
    renderOrders();
  });

  document.getElementById("order-status-filter")?.addEventListener("change", (event) => {
    state.orderStatusFilter = String(event.target.value || "");
    state.orderPage = 1;
    renderOrders();
  });

  document.getElementById("order-filter-reset")?.addEventListener("click", () => {
    state.orderFilter = "";
    state.orderStatusFilter = "";
    state.orderPage = 1;
    const search = document.getElementById("order-search");
    const status = document.getElementById("order-status-filter");
    if (search instanceof HTMLInputElement) search.value = "";
    if (status instanceof HTMLSelectElement) status.value = "";
    renderOrders();
  });

  document.getElementById("audit-outcome-filter")?.addEventListener("change", (event) => {
    state.auditOutcomeFilter = String(event.target.value || "");
    renderSecurityLogs();
  });

  document.getElementById("audit-search")?.addEventListener("input", (event) => {
    state.auditSearch = String(event.target.value || "");
    renderSecurityLogs();
  });

  document.getElementById("member-edit-close")?.addEventListener("click", () => {
    closeMemberEditModal();
  });

  document.getElementById("member-edit-cancel")?.addEventListener("click", () => {
    closeMemberEditModal();
  });

  document.getElementById("member-edit-modal")?.addEventListener("click", (event) => {
    if (event.target?.id === "member-edit-modal") {
      closeMemberEditModal();
    }
  });

  document.getElementById("member-edit-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    updateMemberInfo(event.currentTarget).catch((error) =>
      setMemberEditMessage("error", error.message || "회원정보 수정 실패")
    );
  });

  document.getElementById("media-edit-close")?.addEventListener("click", () => {
    closeMediaEditModal();
  });

  document.getElementById("media-edit-cancel")?.addEventListener("click", () => {
    closeMediaEditModal();
  });

  document.getElementById("media-edit-modal")?.addEventListener("click", (event) => {
    if (event.target?.id === "media-edit-modal") {
      closeMediaEditModal();
    }
  });

  document.getElementById("media-edit-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    updateMediaInfo(event.currentTarget).catch((error) =>
      setMediaEditMessage("error", error.message || "매체 정보 수정 실패")
    );
  });

  document.getElementById("order-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    createOrder(event.currentTarget).catch((error) => {
      window.alert(error.message || "주문 등록 실패");
    });
  });

  document.getElementById("media-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    createMedia(event.currentTarget).catch((error) => {
      window.alert(error.message || "매체 추가 실패");
    });
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.hasAttribute("data-order-status")) {
      const orderId = target.getAttribute("data-order-id");
      if (!orderId) return;
      updateOrderStatus(orderId, target.value).catch((error) => window.alert(error.message || "상태 변경 실패"));
    }
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const memberPageAttr = target.getAttribute("data-members-page");
    if (memberPageAttr) {
      const nextPage = Number(memberPageAttr);
      if (Number.isFinite(nextPage) && nextPage > 0) {
        state.memberPage = Math.round(nextPage);
        renderMembers();
      }
      return;
    }

    const editMemberId = target.getAttribute("data-edit-member");
    if (editMemberId) {
      openMemberEditModal(editMemberId);
      return;
    }

    const editMediaId = target.getAttribute("data-edit-media");
    if (editMediaId) {
      openMediaEditModal(editMediaId);
      return;
    }

    const pageAttr = target.getAttribute("data-orders-page");
    if (pageAttr) {
      const nextPage = Number(pageAttr);
      if (Number.isFinite(nextPage) && nextPage > 0) {
        state.orderPage = Math.round(nextPage);
        renderOrders();
      }
      return;
    }

    const logsPageAttr = target.getAttribute("data-logs-page");
    if (logsPageAttr) {
      const nextPage = Number(logsPageAttr);
      if (Number.isFinite(nextPage) && nextPage > 0) {
        state.logPage = Math.round(nextPage);
        renderLogs();
      }
      return;
    }

    const viewOrderId = target.getAttribute("data-view-attachment");
    if (viewOrderId) {
      openOrderAttachment(viewOrderId, false).catch((error) => window.alert(error.message || "첨부 열람 실패"));
      return;
    }

    const downloadOrderId = target.getAttribute("data-download-attachment");
    if (downloadOrderId) {
      openOrderAttachment(downloadOrderId, true).catch((error) => window.alert(error.message || "첨부 저장 실패"));
      return;
    }

    const mediaId = target.getAttribute("data-toggle-media");
    if (!mediaId) return;
    toggleMedia(mediaId).catch((error) => window.alert(error.message || "매체 상태 변경 실패"));
  });

  document.getElementById("admin-log-clear-button")?.addEventListener("click", () => {
    const proceed = window.confirm("운영 로그를 모두 정리하시겠습니까?");
    if (!proceed) return;
    clearAdminLogs().catch((error) => {
      window.alert(error.message || "운영로그 정리 실패");
    });
  });
}

async function init() {
  const mode = document.getElementById("data-mode");
  if (mode) mode.textContent = "데이터 모드: Cloudflare D1 + KV";

  clearLegacyAdminTokens();
  bindAdminAuth();
  bindPanels();
  bindActions();
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMemberEditModal();
      closeMediaEditModal();
    }
  });

  try {
    await refreshAdminData();
    setAuthenticatedView(true, state.admin?.loginId || "admin");
    switchPanel("dashboard");
  } catch (error) {
    setAuthenticatedView(false, "");
  }
}

init();
