const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const MEMBER_SESSION_COOKIE = "deliver_member_session";
const ADMIN_SESSION_COOKIE = "deliver_admin_session";
const CSRF_COOKIE_NAME = "deliver_csrf";
const PASSWORD_HASH_PREFIX = "pbkdf2_sha256";
const encoder = new TextEncoder();
let securityAuditTableReady = false;

function requireD1(env) {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    throw new Error("Missing D1 binding: DB");
  }
  return env.DB;
}

function requireKv(env) {
  if (!env.SESSION_KV || typeof env.SESSION_KV.get !== "function") {
    throw new Error("Missing KV binding: SESSION_KV");
  }
  return env.SESSION_KV;
}

function requireR2(env) {
  if (!env.FILES_BUCKET || typeof env.FILES_BUCKET.put !== "function") {
    throw new Error("Missing R2 binding: FILES_BUCKET");
  }
  return env.FILES_BUCKET;
}

function bytesToBase64Url(bytes) {
  const raw = String.fromCharCode(...bytes);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function timingSafeEqual(a, b) {
  const aa = a instanceof Uint8Array ? a : new Uint8Array([]);
  const bb = b instanceof Uint8Array ? b : new Uint8Array([]);
  const max = Math.max(aa.length, bb.length);
  let mismatch = aa.length ^ bb.length;
  for (let i = 0; i < max; i += 1) {
    const av = i < aa.length ? aa[i] : 0;
    const bv = i < bb.length ? bb[i] : 0;
    mismatch |= av ^ bv;
  }
  return mismatch === 0;
}

function randomToken(prefix, size = 24) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return `${prefix}_${bytesToBase64Url(bytes)}`;
}

function getSessionCookieName(type) {
  return type === "admin" ? ADMIN_SESSION_COOKIE : MEMBER_SESSION_COOKIE;
}

function clampTtlSeconds(value, fallback) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.max(300, Math.min(86400 * 60, Math.round(raw)));
}

function clampPasswordIterations(value, fallback = 100000) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  // Cloudflare Workers PBKDF2 currently supports up to 100000 iterations.
  return Math.max(60000, Math.min(100000, Math.round(raw)));
}

function parseCookies(request) {
  const source = String(request.headers.get("cookie") || "");
  const out = {};
  source.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) return;
    out[key] = value;
  });
  return out;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`];
  parts.push(`Path=${options.path || "/"}`);
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.round(Number(options.maxAge) || 0))}`);
  }
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure !== false) parts.push("Secure");
  return parts.join("; ");
}

function normalizeText(value, maxLength = 200) {
  const text = String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function getClientIp(request) {
  const direct = String(request.headers.get("cf-connecting-ip") || "").trim();
  if (direct) return direct;
  const forwarded = String(request.headers.get("x-forwarded-for") || "").trim();
  if (!forwarded) return "unknown";
  return String(forwarded.split(",")[0] || "unknown").trim() || "unknown";
}

async function sha256Base64Url(value) {
  const bits = await crypto.subtle.digest("SHA-256", encoder.encode(String(value || "")));
  return bytesToBase64Url(new Uint8Array(bits));
}

function mergeHeaders(extraHeaders = undefined) {
  const headers = new Headers(JSON_HEADERS);
  if (!extraHeaders) return headers;
  const source = extraHeaders instanceof Headers ? extraHeaders : new Headers(extraHeaders);
  source.forEach((value, key) => headers.append(key, value));
  return headers;
}

export async function d1Query(env, sql, params = []) {
  const db = requireD1(env);
  const statement = db.prepare(sql).bind(...params);
  const result = await statement.all();
  if (!result.success) {
    throw new Error(`D1 query failed`);
  }
  return result.results || [];
}

export async function d1Execute(env, sql, params = []) {
  const db = requireD1(env);
  const statement = db.prepare(sql).bind(...params);
  const result = await statement.run();
  if (!result.success) {
    throw new Error(`D1 execute failed`);
  }
}

export async function kvPut(env, key, value, ttlSeconds) {
  const kv = requireKv(env);
  if (ttlSeconds && ttlSeconds > 0) {
    await kv.put(key, value, { expirationTtl: Math.round(ttlSeconds) });
    return;
  }
  await kv.put(key, value);
}

export async function kvGet(env, key) {
  const kv = requireKv(env);
  return kv.get(key);
}

export async function kvDelete(env, key) {
  const kv = requireKv(env);
  await kv.delete(key);
}

export function hasR2Binding(env) {
  return Boolean(env?.FILES_BUCKET && typeof env.FILES_BUCKET.put === "function");
}

export async function r2Put(env, key, value, options = undefined) {
  const bucket = requireR2(env);
  return bucket.put(key, value, options);
}

export async function r2Get(env, key, options = undefined) {
  const bucket = requireR2(env);
  return bucket.get(key, options);
}

export async function r2Delete(env, key) {
  const bucket = requireR2(env);
  return bucket.delete(key);
}

export function getRequestClientIp(request) {
  return getClientIp(request);
}

export function getCookieValue(request, name) {
  const cookies = parseCookies(request);
  return String(cookies[String(name || "")] || "").trim();
}

export function getCsrfTokenFromCookie(request) {
  return getCookieValue(request, CSRF_COOKIE_NAME);
}

export function getBearerToken(request) {
  const auth = String(request.headers.get("authorization") || "");
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return String(request.headers.get("x-session-token") || "").trim();
}

export function getSessionToken(request, expectedType = "") {
  const direct = getBearerToken(request);
  if (direct) return direct;
  const cookieName =
    expectedType === "admin"
      ? ADMIN_SESSION_COOKIE
      : expectedType === "member"
        ? MEMBER_SESSION_COOKIE
        : "";
  if (cookieName) {
    return getCookieValue(request, cookieName);
  }
  return getCookieValue(request, MEMBER_SESSION_COOKIE) || getCookieValue(request, ADMIN_SESSION_COOKIE);
}

export function appendSessionCookie(headers, type, token, ttlSeconds) {
  const cookieName = getSessionCookieName(type);
  const cookie = serializeCookie(cookieName, String(token || ""), {
    maxAge: clampTtlSeconds(ttlSeconds, 86400 * 14),
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  });
  headers.append("set-cookie", cookie);
}

export function appendClearSessionCookie(headers, type) {
  const cookieName = getSessionCookieName(type);
  const cookie = serializeCookie(cookieName, "", {
    maxAge: 0,
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  });
  headers.append("set-cookie", cookie);
}

export async function hashPassword(password, env) {
  const secret = `${String(password || "")}${String(env.PASSWORD_PEPPER || "")}`;
  const iterations = clampPasswordIterations(env.PASSWORD_HASH_ITERATIONS, 100000);
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    baseKey,
    256
  );
  const hash = new Uint8Array(bits);
  return `${PASSWORD_HASH_PREFIX}$${iterations}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

export async function verifyPassword(password, storedHash, env) {
  const input = String(password || "");
  const stored = String(storedHash || "");
  if (!stored) return { ok: false, needsRehash: false };
  if (!stored.startsWith(`${PASSWORD_HASH_PREFIX}$`)) {
    const ok = timingSafeEqual(encoder.encode(input), encoder.encode(stored));
    return { ok, needsRehash: ok };
  }

  const [, iterationText, saltB64, hashB64] = stored.split("$");
  const iterations = clampPasswordIterations(iterationText, 100000);
  if (!iterations || !saltB64 || !hashB64) return { ok: false, needsRehash: false };
  const salt = base64UrlToBytes(saltB64);
  const expectedHash = base64UrlToBytes(hashB64);
  const secret = `${input}${String(env.PASSWORD_PEPPER || "")}`;
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    baseKey,
    expectedHash.length * 8
  );
  const actualHash = new Uint8Array(bits);
  const ok = timingSafeEqual(actualHash, expectedHash);
  const targetIterations = clampPasswordIterations(env.PASSWORD_HASH_ITERATIONS, 100000);
  return { ok, needsRehash: ok && iterations < targetIterations };
}

export async function createSession(env, type, payload, request = null) {
  const ttl =
    type === "admin"
      ? clampTtlSeconds(env.ADMIN_SESSION_TTL_SEC, 86400 * 14)
      : clampTtlSeconds(env.MEMBER_SESSION_TTL_SEC, 86400 * 14);
  const token = randomToken(type === "admin" ? "adm" : "mem");
  const userAgent = request ? String(request.headers.get("user-agent") || "").slice(0, 240) : "";
  const fingerprint = userAgent ? await sha256Base64Url(userAgent) : "";
  const sessionValue = JSON.stringify({
    type,
    ...payload,
    uaSig: fingerprint,
    issuedAt: new Date().toISOString(),
  });
  await kvPut(env, `session:${token}`, sessionValue, ttl);
  return token;
}

export async function readSession(env, token, expectedType, request = null) {
  if (!token) return null;
  const raw = await kvGet(env, `session:${token}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (expectedType && parsed.type !== expectedType) return null;
    const strictUaBinding = String(env.SESSION_BIND_UA || "1") !== "0";
    if (request && strictUaBinding && parsed.uaSig) {
      const userAgent = String(request.headers.get("user-agent") || "").slice(0, 240);
      const currentSig = await sha256Base64Url(userAgent);
      if (currentSig !== parsed.uaSig) return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

export async function destroySession(env, token) {
  if (!token) return;
  await kvDelete(env, `session:${token}`);
}

export async function ensureSecurityAuditTable(env) {
  if (securityAuditTableReady) return;
  await d1Execute(
    env,
    "create table if not exists security_audit_logs (id integer primary key autoincrement, event_type text not null, actor_type text not null default 'system', actor_id text, ip text, outcome text not null, detail text, created_at text not null default (datetime('now')))"
  );
  await d1Execute(env, "create index if not exists idx_security_audit_created_at on security_audit_logs(created_at)");
  securityAuditTableReady = true;
}

export async function writeSecurityAudit(env, payload = {}) {
  try {
    await ensureSecurityAuditTable(env);
    await d1Execute(
      env,
      "insert into security_audit_logs (event_type, actor_type, actor_id, ip, outcome, detail, created_at) values (?, ?, ?, ?, ?, ?, ?)",
      [
        normalizeText(payload.eventType || "unknown", 60),
        normalizeText(payload.actorType || "system", 40),
        normalizeText(payload.actorId || "", 120) || null,
        normalizeText(payload.ip || "", 80) || null,
        normalizeText(payload.outcome || "success", 30),
        normalizeText(payload.detail || "", 300) || null,
        payload.createdAt || new Date().toISOString(),
      ]
    );
  } catch (error) {
  }
}

export async function parseJson(request) {
  try {
    return await request.json();
  } catch (error) {
    return {};
  }
}

export function jsonOk(data, status = 200, extraHeaders = undefined) {
  const headers = mergeHeaders(extraHeaders);
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status,
    headers,
  });
}

export function jsonError(message, status = 400, extraHeaders = undefined) {
  const headers = mergeHeaders(extraHeaders);
  return new Response(
    JSON.stringify({
      ok: false,
      message: normalizeText(message || "요청 처리에 실패했습니다.", 180),
    }),
    {
      status,
      headers,
    }
  );
}

export function normalizeEmail(value) {
  return normalizeText(value, 160).toLowerCase();
}

export function normalizeLoginId(value) {
  return normalizeText(value, 32).toLowerCase();
}

export function sanitizePlainText(value, maxLength = 300) {
  return normalizeText(value, maxLength);
}

export function nowIso() {
  return new Date().toISOString();
}
