const API_PREFIX = "/api/";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ORIGIN_GUARD_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_COOKIE_NAME = "deliver_csrf";
const CSRF_EXEMPT_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/signup",
  "/api/admin/login",
  "/api/health",
  "/api/review/analyze",
]);

const RATE_LIMIT_RULES = [
  { prefix: "/api/admin/login", key: "admin-login", limit: 8, windowSec: 60 },
  { prefix: "/api/auth/login", key: "member-login", limit: 10, windowSec: 60 },
  { prefix: "/api/auth/signup", key: "member-signup", limit: 6, windowSec: 300 },
  { prefix: "/api/review/analyze", key: "review-analyze", limit: 6, windowSec: 60 },
  { prefix: "/api/", key: "api-general", limit: 240, windowSec: 60 },
];

const DEFAULT_ALLOWED_ORIGINS = [
  "https://dliver.co.kr",
  "https://admin.dliver.co.kr",
  "https://staging.dliver.co.kr",
  "https://dev.dliver.co.kr",
];

function randomToken(size = 18) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parseCookies(request) {
  const raw = String(request.headers.get("cookie") || "");
  const map = {};
  raw.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) return;
    map[key] = value;
  });
  return map;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`];
  parts.push(`Path=${options.path || "/"}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.round(Number(options.maxAge) || 0))}`);
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function getClientIp(request) {
  const direct = String(request.headers.get("cf-connecting-ip") || "").trim();
  if (direct) return direct;
  const forwarded = String(request.headers.get("x-forwarded-for") || "").trim();
  if (!forwarded) return "unknown";
  return String(forwarded.split(",")[0] || "unknown").trim() || "unknown";
}

function getPathname(request) {
  const url = new URL(request.url);
  return url.pathname;
}

function parseAllowedOrigins(env, request) {
  const set = new Set(DEFAULT_ALLOWED_ORIGINS);
  const fromEnv = String(env.CORS_ALLOW_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  fromEnv.forEach((origin) => set.add(origin));

  // Allow current preview origin for *.pages.dev deployments.
  try {
    const current = new URL(request.url);
    if (current.hostname.endsWith(".pages.dev")) {
      set.add(current.origin);
    }
  } catch (error) {
  }

  return set;
}

function applySecurityHeaders(headers, requestId) {
  headers.set("x-request-id", requestId);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "geolocation=(), microphone=(), camera=(), payment=(self)");
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("cross-origin-resource-policy", "same-site");
  headers.set("strict-transport-security", "max-age=31536000; includeSubDomains; preload");
}

function applyCorsHeaders(headers, origin, allowedOrigins) {
  if (!origin) return;
  if (!allowedOrigins.has(origin)) return;
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.append("vary", "Origin");
}

async function enforceRateLimit(env, key, limit, windowSec, ip) {
  if (!env?.SESSION_KV || typeof env.SESSION_KV.get !== "function") {
    return { ok: true, current: 0 };
  }
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const rateKey = `rate:${key}:${ip}:${bucket}`;
  const raw = await env.SESSION_KV.get(rateKey);
  const current = Math.max(0, Number(raw || 0)) + 1;
  await env.SESSION_KV.put(rateKey, String(current), { expirationTtl: windowSec + 5 });
  return { ok: current <= limit, current };
}

function getRateRule(pathname) {
  for (const rule of RATE_LIMIT_RULES) {
    if (pathname.startsWith(rule.prefix)) return rule;
  }
  return null;
}

function hasExplicitAuthHeader(request) {
  const auth = String(request.headers.get("authorization") || "").trim().toLowerCase();
  if (auth.startsWith("bearer ")) return true;
  return Boolean(String(request.headers.get("x-session-token") || "").trim());
}

function jsonErrorResponse(status, message, requestId) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  applySecurityHeaders(headers, requestId);
  return new Response(
    JSON.stringify({
      ok: false,
      message,
      requestId,
    }),
    { status, headers }
  );
}

export async function onRequest(context) {
  const request = context.request;
  const method = String(request.method || "GET").toUpperCase();
  const requestUrl = new URL(request.url);
  const pathname = requestUrl.pathname;
  const hostname = String(requestUrl.hostname || "").toLowerCase();
  const isApiRequest = pathname.startsWith(API_PREFIX);
  const requestId = crypto.randomUUID();
  const origin = String(request.headers.get("origin") || "").trim();
  const allowedOrigins = parseAllowedOrigins(context.env, request);
  const cookies = parseCookies(request);

  if (hostname === "www.dliver.co.kr") {
    requestUrl.hostname = "dliver.co.kr";
    return Response.redirect(requestUrl.toString(), 301);
  }

  if (isApiRequest && method === "OPTIONS") {
    if (origin && !allowedOrigins.has(origin)) {
      const denied = jsonErrorResponse(403, "허용되지 않은 Origin입니다.", requestId);
      return denied;
    }
    const headers = new Headers({ "cache-control": "no-store" });
    headers.set("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    headers.set(
      "access-control-allow-headers",
      "content-type, authorization, x-session-token, x-csrf-token, x-request-id"
    );
    headers.set("access-control-max-age", "600");
    applySecurityHeaders(headers, requestId);
    applyCorsHeaders(headers, origin, allowedOrigins);
    return new Response(null, { status: 204, headers });
  }

  if (isApiRequest && origin && ORIGIN_GUARD_METHODS.has(method) && !allowedOrigins.has(origin)) {
    const denied = jsonErrorResponse(403, "허용되지 않은 Origin입니다.", requestId);
    applyCorsHeaders(denied.headers, origin, allowedOrigins);
    return denied;
  }

  if (isApiRequest) {
    const ip = getClientIp(request);
    const rule = getRateRule(pathname);
    if (rule) {
      const rate = await enforceRateLimit(context.env, `${rule.key}:${pathname}`, rule.limit, rule.windowSec, ip);
      if (!rate.ok) {
        const blocked = jsonErrorResponse(429, "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", requestId);
        blocked.headers.set("retry-after", String(rule.windowSec));
        applyCorsHeaders(blocked.headers, origin, allowedOrigins);
        return blocked;
      }
    }

    const isStateChanging = !SAFE_METHODS.has(method);
    if (isStateChanging && !CSRF_EXEMPT_PATHS.has(pathname) && !hasExplicitAuthHeader(request)) {
      const csrfCookie = String(cookies[CSRF_COOKIE_NAME] || "").trim();
      const csrfHeader = String(request.headers.get("x-csrf-token") || "").trim();
      if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        const blocked = jsonErrorResponse(403, "CSRF 검증에 실패했습니다.", requestId);
        applyCorsHeaders(blocked.headers, origin, allowedOrigins);
        return blocked;
      }
    }
  }

  let response = await context.next();
  if (isApiRequest && response.status >= 500) {
    response = jsonErrorResponse(500, "서버 처리 중 오류가 발생했습니다.", requestId);
  }

  const nextHeaders = new Headers(response.headers);
  applySecurityHeaders(nextHeaders, requestId);
  if (isApiRequest) {
    nextHeaders.set("cache-control", "no-store");
  }
  applyCorsHeaders(nextHeaders, origin, allowedOrigins);

  if (isApiRequest && !cookies[CSRF_COOKIE_NAME]) {
    const csrfToken = randomToken(16);
    nextHeaders.append(
      "set-cookie",
      serializeCookie(CSRF_COOKIE_NAME, csrfToken, {
        maxAge: 60 * 60 * 2,
        sameSite: "Lax",
        secure: true,
      })
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: nextHeaders,
  });
}
