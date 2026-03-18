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

// Keep an ASCII alias for the root landing because local Pages preview fails
// to serve the original Korean asset path reliably.
const ROOT_LANDING_REWRITE_PATH = "/landing-root.html";
const REVIEW_REWRITE_PATH = "/index.html";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://everyonepr.com",
  "https://www.everyonepr.com",
  "https://모두의피알.com",
  "https://www.모두의피알.com",
  "https://xn--hu1b83js0j45b952a.com",
  "https://www.xn--hu1b83js0j45b952a.com",
  "https://dliver.co.kr",
  "https://admin.dliver.co.kr",
  "https://staging.dliver.co.kr",
  "https://dev.dliver.co.kr",
];

const PUBLIC_CANONICAL_HOST = "everyonepr.com";
const PUBLIC_CANONICAL_WWW_HOST = "www.everyonepr.com";
const LEGACY_PUBLIC_HOSTS = new Set([
  "dliver.co.kr",
  "www.dliver.co.kr",
  "모두의피알.com",
  "www.모두의피알.com",
  "xn--hu1b83js0j45b952a.com",
  "www.xn--hu1b83js0j45b952a.com",
]);
const NEW_PUBLIC_HOSTS = new Set([PUBLIC_CANONICAL_HOST, PUBLIC_CANONICAL_WWW_HOST]);
const LEGACY_MEMBER_ENTRY_URL = "https://dliver.co.kr/member/";
const LEGACY_REVIEW_URL = "https://dliver.co.kr/review";
const LEGACY_ADMIN_ENTRY_URL = "https://dliver.co.kr/admin/";

const BLOCKED_STATIC_PATH_PATTERN = /(^|\/)\.(env|git|npmrc)(?:$|[._-])/i;

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

function isBlockedStaticPath(pathname) {
  const value = String(pathname || "");
  return BLOCKED_STATIC_PATH_PATTERN.test(value);
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
  const setIfMissing = (key, value) => {
    if (!headers.has(key)) headers.set(key, value);
  };
  headers.set("x-request-id", requestId);
  setIfMissing("x-content-type-options", "nosniff");
  setIfMissing("x-frame-options", "DENY");
  setIfMissing("referrer-policy", "strict-origin-when-cross-origin");
  setIfMissing("permissions-policy", "geolocation=(), microphone=(), camera=(), payment=(self)");
  setIfMissing("cross-origin-opener-policy", "same-origin");
  setIfMissing("cross-origin-resource-policy", "same-site");
  setIfMissing("strict-transport-security", "max-age=31536000; includeSubDomains; preload");
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

function shouldServeRootLanding(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (!host) return false;
  if (host === "127.0.0.1" || host === "localhost") return true;
  if (host.endsWith(".pages.dev")) return true;
  if (host === PUBLIC_CANONICAL_HOST) return true;
  return false;
}

function isLegacyPublicHost(hostname) {
  return LEGACY_PUBLIC_HOSTS.has(String(hostname || "").toLowerCase());
}

function isNewPublicHost(hostname) {
  return NEW_PUBLIC_HOSTS.has(String(hostname || "").toLowerCase());
}

function isLegacySensitivePath(pathname) {
  const value = String(pathname || "");
  return (
    value === "/index.html" ||
    value === "/review" ||
    value === "/review/" ||
    value.startsWith("/member") ||
    value.startsWith("/admin") ||
    value.startsWith("/01_%EC%84%9C%EB%B9%84%EC%8A%A4%EC%BD%94%EB%93%9C-ServiceCode/%ED%9A%8C%EC%9B%90%EC%A0%84%EC%9A%A9%ED%8E%98%EC%9D%B4%EC%A7%80-MemberPortal/") ||
    value.startsWith("/01_%EC%84%9C%EB%B9%84%EC%8A%A4%EC%BD%94%EB%93%9C-ServiceCode/%EA%B4%80%EB%A6%AC%EC%9E%90%ED%8E%98%EC%9D%B4%EC%A7%80-AdminPage/")
  );
}

function getLegacyDestinationForPath(pathname) {
  const value = String(pathname || "");
  if (value === "/review" || value === "/review/" || value === "/index.html") {
    return LEGACY_REVIEW_URL;
  }
  if (
    value === "/member" ||
    value === "/member/" ||
    value.startsWith("/member/") ||
    value.startsWith("/01_%EC%84%9C%EB%B9%84%EC%8A%A4%EC%BD%94%EB%93%9C-ServiceCode/%ED%9A%8C%EC%9B%90%EC%A0%84%EC%9A%A9%ED%8E%98%EC%9D%B4%EC%A7%80-MemberPortal/")
  ) {
    return LEGACY_MEMBER_ENTRY_URL;
  }
  if (
    value === "/admin" ||
    value === "/admin/" ||
    value.startsWith("/admin/") ||
    value.startsWith("/01_%EC%84%9C%EB%B9%84%EC%8A%A4%EC%BD%94%EB%93%9C-ServiceCode/%EA%B4%80%EB%A6%AC%EC%9E%90%ED%8E%98%EC%9D%B4%EC%A7%80-AdminPage/")
  ) {
    return LEGACY_ADMIN_ENTRY_URL;
  }
  return null;
}

function isPublicAuthEntryRequest(requestUrl) {
  return (
    String(requestUrl.searchParams.get("login") || "") === "1" ||
    String(requestUrl.searchParams.get("signup") || "") === "1"
  );
}

function redirectHost(requestUrl, hostname, status = 301) {
  requestUrl.hostname = hostname;
  return Response.redirect(requestUrl.toString(), status);
}

function redirectToUrl(targetUrl, status = 302) {
  return Response.redirect(String(targetUrl || ""), status);
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

  if (isBlockedStaticPath(pathname)) {
    const headers = new Headers({
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    });
    applySecurityHeaders(headers, requestId);
    return new Response("Not Found", { status: 404, headers });
  }

  let nextInput = undefined;
  if (!isApiRequest && SAFE_METHODS.has(method)) {
    if ((isNewPublicHost(hostname) || isLegacyPublicHost(hostname)) && isPublicAuthEntryRequest(requestUrl)) {
      return redirectToUrl(LEGACY_MEMBER_ENTRY_URL, 302);
    }
    if (
      hostname === "www.everyonepr.com" ||
      hostname === "www.모두의피알.com" ||
      hostname === "www.xn--hu1b83js0j45b952a.com" ||
      hostname === "www.dliver.co.kr"
    ) {
      const legacyDestination = getLegacyDestinationForPath(pathname);
      if (legacyDestination) {
        return redirectToUrl(legacyDestination, 302);
      }
      return redirectHost(requestUrl, PUBLIC_CANONICAL_HOST, 301);
    } else if (isNewPublicHost(hostname) && isLegacySensitivePath(pathname)) {
      const legacyDestination = getLegacyDestinationForPath(pathname);
      if (legacyDestination) {
        return redirectToUrl(legacyDestination, 302);
      }
    } else if (isLegacyPublicHost(hostname) && !isLegacySensitivePath(pathname)) {
      return redirectHost(requestUrl, PUBLIC_CANONICAL_HOST, 301);
    } else if (pathname === "/self-order" || pathname === "/self-order/" || pathname === "/landing" || pathname.startsWith("/landing/")) {
      requestUrl.pathname = "/";
      return Response.redirect(requestUrl.toString(), 301);
    }
    if (pathname === "/index.html") {
      requestUrl.pathname = "/review";
      return Response.redirect(requestUrl.toString(), 301);
    }
    if (pathname === "/review/") {
      requestUrl.pathname = "/review";
      return Response.redirect(requestUrl.toString(), 301);
    }
    if (pathname === "/review" && isLegacyPublicHost(hostname)) {
      nextInput = REVIEW_REWRITE_PATH;
    } else if (pathname === "/" && shouldServeRootLanding(hostname)) {
      nextInput = ROOT_LANDING_REWRITE_PATH;
    } else if (pathname === "/" && isLegacyPublicHost(hostname)) {
      return redirectHost(requestUrl, PUBLIC_CANONICAL_HOST, 301);
    }
  }

  if (isApiRequest && method === "OPTIONS") {
    if (origin && !allowedOrigins.has(origin)) {
      const denied = jsonErrorResponse(403, "?덉슜?섏? ?딆? Origin?낅땲??", requestId);
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
    const denied = jsonErrorResponse(403, "?덉슜?섏? ?딆? Origin?낅땲??", requestId);
    applyCorsHeaders(denied.headers, origin, allowedOrigins);
    return denied;
  }

  if (isApiRequest) {
    const ip = getClientIp(request);
    const rule = getRateRule(pathname);
    if (rule) {
      const rate = await enforceRateLimit(context.env, `${rule.key}:${pathname}`, rule.limit, rule.windowSec, ip);
      if (!rate.ok) {
        const blocked = jsonErrorResponse(429, "?붿껌???덈Т 留롮뒿?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄??二쇱꽭??", requestId);
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
        const blocked = jsonErrorResponse(403, "CSRF 寃利앹뿉 ?ㅽ뙣?덉뒿?덈떎.", requestId);
        applyCorsHeaders(blocked.headers, origin, allowedOrigins);
        return blocked;
      }
    }
  }

  let response = await context.next(nextInput);
  if (isApiRequest && response.status >= 500) {
    response = jsonErrorResponse(500, "?쒕쾭 泥섎━ 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.", requestId);
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
