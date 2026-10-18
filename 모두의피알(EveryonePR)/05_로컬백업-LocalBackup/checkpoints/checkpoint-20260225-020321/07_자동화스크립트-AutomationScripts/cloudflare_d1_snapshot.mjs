#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const envPath = path.join(projectRoot, "01_서비스코드-ServiceCode", ".env.cloudflare");
const backupRoot = path.join(projectRoot, "08_데이터베이스-Database", "04_백업-Backups");

const TABLES = [
  "members",
  "media_channels",
  "orders",
  "order_status_logs",
  "admin_logs",
  "security_audit_logs",
];

function parseEnv(filePath) {
  const map = {};
  if (!fs.existsSync(filePath)) return map;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    map[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return map;
}

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("Wrangler JSON output is empty.");
  }
  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const candidate = lines.slice(i).join("\n");
    try {
      return JSON.parse(candidate);
    } catch (error) {
      // Keep scanning upward until valid JSON block is found.
    }
  }
  throw new Error("Failed to parse Wrangler JSON output.");
}

function runD1Query({ databaseName, token, sql }) {
  const result = spawnSync(
    "npx",
    ["--yes", "wrangler", "d1", "execute", databaseName, "--remote", "--command", sql, "--json"],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: token,
      },
    }
  );

  if (result.status !== 0) {
    throw new Error(
      `Wrangler query failed: ${sql}\n${String(result.stderr || result.stdout || "").trim()}`
    );
  }

  const payload = extractJson(result.stdout);
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error(`Unexpected Wrangler payload: ${JSON.stringify(payload)}`);
  }
  const first = payload[0];
  return Array.isArray(first.results) ? first.results : [];
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function run() {
  const env = parseEnv(envPath);
  const token =
    process.env.CLOUDFLARE_API_TOKEN ||
    process.env.CF_API_TOKEN ||
    env.CLOUDFLARE_API_TOKEN ||
    env.CF_API_TOKEN ||
    "";
  const databaseName =
    process.env.CF_D1_DATABASE_NAME ||
    env.CF_D1_DATABASE_NAME ||
    process.env.CF_D1_DATABASE_ID ||
    env.CF_D1_DATABASE_ID ||
    "dliver-prod-db";

  if (!token) {
    throw new Error(
      "Missing CLOUDFLARE_API_TOKEN. Set it in shell or 01_서비스코드-ServiceCode/.env.cloudflare."
    );
  }

  fs.mkdirSync(backupRoot, { recursive: true });
  const stamp = nowStamp();
  const outDir = path.join(backupRoot, `snapshot-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = {
    provider: "cloudflare-d1",
    database: databaseName,
    createdAt: new Date().toISOString(),
    snapshotDir: outDir,
    tables: {},
    summary: { ok: 0, error: 0, totalRows: 0 },
  };

  const schemaRows = runD1Query({
    databaseName,
    token,
    sql: "select type, name, tbl_name, sql from sqlite_master where name not like 'sqlite_%' order by type, name",
  });
  writeJson(path.join(outDir, "_schema.json"), schemaRows);

  for (const tableName of TABLES) {
    try {
      const rows = runD1Query({
        databaseName,
        token,
        sql: `select * from ${tableName}`,
      });
      writeJson(path.join(outDir, `${tableName}.json`), rows);
      manifest.tables[tableName] = { status: "ok", rows: rows.length, file: `${tableName}.json` };
      manifest.summary.ok += 1;
      manifest.summary.totalRows += rows.length;
    } catch (error) {
      writeJson(path.join(outDir, `${tableName}.json`), []);
      manifest.tables[tableName] = {
        status: "error",
        rows: 0,
        file: `${tableName}.json`,
        detail: String(error.message || error),
      };
      manifest.summary.error += 1;
    }
  }

  writeJson(path.join(outDir, "manifest.json"), manifest);

  console.log("[OK] Cloudflare D1 snapshot created");
  console.log(`[OK] Snapshot dir: ${outDir}`);
  console.log(
    `[OK] Summary: ok=${manifest.summary.ok}, error=${manifest.summary.error}, rows=${manifest.summary.totalRows}`
  );
  if (manifest.summary.error > 0) {
    console.log("[WARN] 일부 테이블 백업 실패. snapshot manifest.json detail 확인 필요");
  }
}

run().catch((error) => {
  console.error("[ERROR] Cloudflare D1 snapshot failed");
  console.error(error.message || error);
  process.exit(1);
});
