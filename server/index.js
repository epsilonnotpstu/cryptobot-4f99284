import bcrypt from "bcryptjs";
import cors from "cors";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import nodemailer from "nodemailer";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { OAuth2Client } from "google-auth-library";
import { list as listBlobFiles, put as putBlobFile } from "@vercel/blob";
import { createLumModule } from "./lum-module.js";
import { createBinaryModule } from "./binary-module.js";
import { createTransactionModule } from "./transaction-module.js";
import { createAssetsModule } from "./assets-module.js";
import { createSupportModule } from "./support-module.js";
import { createLaunchpadModule } from "./launchpad-module.js";

dotenv.config();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
const PUBLIC_AUTH_BASE_URL = String(process.env.VITE_PUBLIC_AUTH_BASE_URL || "")
  .trim()
  .replace(/\/+$/, "");
const GOOGLE_CLIENT_IDS = [GOOGLE_CLIENT_ID]
  .concat(
    (process.env.GOOGLE_CLIENT_IDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  )
  .filter(Boolean);
const googleClient = GOOGLE_CLIENT_IDS.length > 0 ? new OAuth2Client() : null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const isVercelRuntime = process.env.VERCEL === "1";
const blobReadWriteToken = process.env.BLOB_READ_WRITE_TOKEN || "";
const blobSyncExplicitlyDisabled = String(process.env.BLOB_SYNC_DISABLED || "")
  .trim()
  .toLowerCase() === "true";
const shouldUseBlobDbSync = Boolean(blobReadWriteToken) && !blobSyncExplicitlyDisabled;
const blobSyncDisableOnFailure = String(process.env.BLOB_SYNC_DISABLE_ON_FAILURE || "true")
  .trim()
  .toLowerCase() !== "false";
const enforceBlobPersistence = process.env.BLOB_PERSISTENCE_REQUIRED === "true";
const blobDbPathname = "state/auth.sqlite";
const blobSyncMinIntervalMs = Math.max(500, Number(process.env.BLOB_SYNC_MIN_INTERVAL_MS || 1500));
const bundledDataDir = path.join(rootDir, "server", "data");
const staticDistDir = path.join(rootDir, "dist");
const requestedDataDir = process.env.AUTH_DATA_DIR
  ? path.resolve(process.env.AUTH_DATA_DIR)
  : isVercelRuntime
    ? path.join("/tmp", "cryptobot2-auth-data")
    : bundledDataDir;
const fallbackDataDir = path.resolve(process.env.AUTH_DATA_DIR_FALLBACK || "/tmp/cryptobot2-auth-data");

function canUseDataDirectory(directoryPath) {
  if (!directoryPath) {
    return false;
  }

  try {
    fs.mkdirSync(directoryPath, { recursive: true });
    fs.accessSync(directoryPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveWritableDataDirectory() {
  if (canUseDataDirectory(requestedDataDir)) {
    return requestedDataDir;
  }

  if (canUseDataDirectory(fallbackDataDir)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[auth-api] AUTH_DATA_DIR is not writable (${requestedDataDir}). Using fallback: ${fallbackDataDir}`,
    );
    return fallbackDataDir;
  }

  throw new Error(
    `No writable data directory available. Tried AUTH_DATA_DIR=${requestedDataDir} and fallback=${fallbackDataDir}.`,
  );
}

const dataDir = resolveWritableDataDirectory();

const dbPath = path.join(dataDir, "auth.sqlite");
let restoredFromBlob = false;
let lastBlobDepositSyncAt = 0;
let blobDepositSyncInFlight = null;
let blobSyncDisabledReason = "";

function shouldDisableBlobSyncForError(reason = "") {
  if (!blobSyncDisableOnFailure) {
    return false;
  }

  const normalized = String(reason || "").toLowerCase();
  if (!normalized) {
    return false;
  }

  return [
    "suspended",
    "quota",
    "limit exceeded",
    "advanced operation",
    "rate limit",
    "rate-limit",
    "forbidden",
    "unauthorized",
    "invalid token",
    "permission",
    "denied",
    "http 401",
    "http 403",
    "http 429",
  ].some((keyword) => normalized.includes(keyword));
}

function disableBlobSyncIfNeeded(reason = "", source = "") {
  if (blobSyncDisabledReason || !shouldDisableBlobSyncForError(reason)) {
    return false;
  }

  blobSyncDisabledReason = String(reason || "Blob sync disabled due to repeated sync failures.");
  // eslint-disable-next-line no-console
  console.warn(
    `[auth-api] blob sync disabled${source ? ` (${source})` : ""}:`,
    blobSyncDisabledReason,
  );
  return true;
}

function bootstrapVercelDataSnapshotIfNeeded() {
  if (!isVercelRuntime || process.env.AUTH_DATA_DIR) {
    return;
  }

  if (fs.existsSync(dbPath)) {
    return;
  }

  const sourcePath = path.join(bundledDataDir, "auth.sqlite");
  const targetPath = path.join(dataDir, "auth.sqlite");
  if (!fs.existsSync(sourcePath)) {
    return;
  }
  try {
    fs.copyFileSync(sourcePath, targetPath);
  } catch {
    // Ignore snapshot copy issues; schema bootstrap below can still initialize a new DB.
  }
}

function isSqliteFileHealthy(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return false;
  }

  let tempDb = null;
  try {
    tempDb = new Database(filePath, { readonly: true, fileMustExist: true });
    const resultRow = tempDb.prepare("PRAGMA quick_check(1)").get();
    const resultValue = resultRow ? Object.values(resultRow)[0] : "";
    return String(resultValue || "").toLowerCase() === "ok";
  } catch {
    return false;
  } finally {
    try {
      tempDb?.close();
    } catch {
      // no-op
    }
  }
}

async function restoreDbFromBlobIfAvailable() {
  if (!shouldUseBlobDbSync) {
    return;
  }

  try {
    const { blobs } = await listBlobFiles({
      token: blobReadWriteToken,
      prefix: blobDbPathname,
      limit: 5,
    });
    const latestBlob = (blobs || []).find((item) => item.pathname === blobDbPathname) || null;
    if (!latestBlob?.url) {
      return;
    }

    const preferredBlobUrl = latestBlob.downloadUrl || latestBlob.url;
    const separator = preferredBlobUrl.includes("?") ? "&" : "?";
    const cacheBypassUrl = `${preferredBlobUrl}${separator}v=${Date.now()}`;

    const response = await fetch(cacheBypassUrl, { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const tempRestorePath = path.join(dataDir, `auth-restore-${Date.now()}.sqlite`);
    fs.writeFileSync(tempRestorePath, Buffer.from(arrayBuffer));

    if (!isSqliteFileHealthy(tempRestorePath)) {
      try {
        fs.unlinkSync(tempRestorePath);
      } catch {
        // no-op
      }
      return;
    }

    fs.copyFileSync(tempRestorePath, dbPath);
    try {
      fs.unlinkSync(tempRestorePath);
    } catch {
      // no-op
    }
    restoredFromBlob = true;
  } catch (error) {
    disableBlobSyncIfNeeded(error?.message || error, "restore");
    // Ignore blob restore errors and continue with local snapshot fallback.
  }
}

async function persistDbToBlob() {
  if (!shouldUseBlobDbSync || !fs.existsSync(dbPath)) {
    return;
  }

  await syncDepositStateFromBlobSafe({ force: true, context: "pre-upload" });

  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    // If checkpoint fails, continue with best-effort snapshot upload.
  }

  if (!isSqliteFileHealthy(dbPath)) {
    const integrityError = new Error("Local SQLite state failed integrity check.");
    integrityError.statusCode = 500;
    throw integrityError;
  }

  const dbBuffer = fs.readFileSync(dbPath);
  await putBlobFile(blobDbPathname, dbBuffer, {
    token: blobReadWriteToken,
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/octet-stream",
  });
}

async function persistDbToBlobSafe(context = "") {
  if (!shouldUseBlobDbSync || blobSyncDisabledReason) {
    return;
  }

  try {
    await persistDbToBlob();
  } catch (error) {
    const reason = String(error?.message || error || "");
    disableBlobSyncIfNeeded(reason, `persist${context ? `:${context}` : ""}`);

    // eslint-disable-next-line no-console
    console.error(
      `[auth-api] blob persistence failed${context ? ` (${context})` : ""}:`,
      reason,
    );

    if (enforceBlobPersistence) {
      throw error;
    }
  }
}

function toSqlitePathLiteral(filePath = "") {
  return String(filePath || "").replace(/'/g, "''");
}

function mergeDepositStateFromSnapshot(snapshotPath) {
  if (!snapshotPath || !fs.existsSync(snapshotPath)) {
    return;
  }

  const escapedPath = toSqlitePathLiteral(snapshotPath);
  db.exec(`
    ATTACH DATABASE '${escapedPath}' AS blob_sync;

    INSERT OR IGNORE INTO main.users (
      user_id,
      name,
      first_name,
      last_name,
      mobile,
      avatar_url,
      account_role,
      account_status,
      kyc_status,
      auth_tag,
      kyc_updated_at,
      email,
      password_hash,
      created_at
    )
    SELECT
      user_id,
      name,
      first_name,
      last_name,
      mobile,
      avatar_url,
      account_role,
      account_status,
      kyc_status,
      auth_tag,
      kyc_updated_at,
      email,
      password_hash,
      created_at
    FROM blob_sync.users;

    INSERT OR IGNORE INTO main.deposit_assets
    SELECT * FROM blob_sync.deposit_assets;

    INSERT OR IGNORE INTO main.deposit_requests
    SELECT * FROM blob_sync.deposit_requests;

    UPDATE main.deposit_assets
    SET symbol = b.symbol,
        name = b.name,
        chain_name = b.chain_name,
        recharge_address = b.recharge_address,
        qr_code_data = b.qr_code_data,
        min_amount_usd = b.min_amount_usd,
        max_amount_usd = b.max_amount_usd,
        sort_order = b.sort_order,
        is_enabled = b.is_enabled,
        created_at = b.created_at,
        updated_at = b.updated_at
    FROM blob_sync.deposit_assets b
    WHERE main.deposit_assets.id = b.id
      AND COALESCE(b.updated_at, '') > COALESCE(main.deposit_assets.updated_at, '');

    UPDATE main.deposit_requests
    SET status = b.status,
        note = b.note,
        reviewed_at = b.reviewed_at,
        reviewed_by = b.reviewed_by
    FROM blob_sync.deposit_requests b
    WHERE main.deposit_requests.id = b.id
      AND (
        COALESCE(b.reviewed_at, '') > COALESCE(main.deposit_requests.reviewed_at, '')
        OR (
          COALESCE(main.deposit_requests.reviewed_at, '') = ''
          AND COALESCE(b.status, '') <> COALESCE(main.deposit_requests.status, '')
        )
      );

    DETACH DATABASE blob_sync;
  `);
}

async function syncDepositStateFromBlobSafe({ force = false, context = "" } = {}) {
  if (!shouldUseBlobDbSync || blobSyncDisabledReason) {
    return;
  }

  const now = Date.now();
  if (!force && now - lastBlobDepositSyncAt < blobSyncMinIntervalMs) {
    return;
  }

  if (blobDepositSyncInFlight) {
    await blobDepositSyncInFlight;
    return;
  }

  blobDepositSyncInFlight = (async () => {
    let tempRestorePath = "";
    try {
      const { blobs } = await listBlobFiles({
        token: blobReadWriteToken,
        prefix: blobDbPathname,
        limit: 5,
      });

      const latestBlob = (blobs || []).find((item) => item.pathname === blobDbPathname) || null;
      if (!latestBlob?.url) {
        lastBlobDepositSyncAt = Date.now();
        return;
      }

      const preferredBlobUrl = latestBlob.downloadUrl || latestBlob.url;
      const separator = preferredBlobUrl.includes("?") ? "&" : "?";
      const cacheBypassUrl = `${preferredBlobUrl}${separator}sync=${Date.now()}`;

      const response = await fetch(cacheBypassUrl, { cache: "no-store" });
      if (!response.ok) {
        disableBlobSyncIfNeeded(
          `HTTP ${response.status} while syncing blob snapshot`,
          `sync${context ? `:${context}` : ""}`,
        );
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      tempRestorePath = path.join(dataDir, `auth-sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sqlite`);
      fs.writeFileSync(tempRestorePath, Buffer.from(arrayBuffer));

      if (!isSqliteFileHealthy(tempRestorePath)) {
        return;
      }

      mergeDepositStateFromSnapshot(tempRestorePath);
      lastBlobDepositSyncAt = Date.now();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        `[auth-api] deposit blob sync failed${context ? ` (${context})` : ""}:`,
        error?.message || error,
      );
      disableBlobSyncIfNeeded(error?.message || error, `sync${context ? `:${context}` : ""}`);
    } finally {
      if (tempRestorePath) {
        try {
          fs.unlinkSync(tempRestorePath);
        } catch {
          // no-op
        }
      }
    }
  })();

  try {
    await blobDepositSyncInFlight;
  } finally {
    blobDepositSyncInFlight = null;
  }
}

bootstrapVercelDataSnapshotIfNeeded();
await restoreDbFromBlobIfAvailable();

const db = new Database(dbPath);
db.pragma(shouldUseBlobDbSync ? "journal_mode = DELETE" : "journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    mobile TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    account_role TEXT NOT NULL DEFAULT 'trader',
    account_status TEXT NOT NULL DEFAULT 'active',
    kyc_status TEXT NOT NULL DEFAULT 'pending',
    auth_tag TEXT NOT NULL DEFAULT 'kyc-pending',
    kyc_updated_at TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    purpose TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    session_token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    reset_token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS kyc_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    full_name TEXT NOT NULL,
    certification TEXT NOT NULL,
    ssn TEXT NOT NULL,
    front_file_name TEXT NOT NULL,
    front_file_data TEXT NOT NULL,
    back_file_name TEXT NOT NULL,
    back_file_data TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT NOT NULL DEFAULT '',
    submitted_at TEXT NOT NULL,
    reviewed_at TEXT,
    reviewed_by TEXT
  );

  CREATE TABLE IF NOT EXISTS platform_notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    priority INTEGER NOT NULL DEFAULT 50,
    starts_at TEXT,
    expires_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_dismissible INTEGER NOT NULL DEFAULT 1,
    target_mode TEXT NOT NULL DEFAULT 'all',
    target_kyc_status TEXT,
    created_by TEXT NOT NULL DEFAULT 'system',
    updated_by TEXT NOT NULL DEFAULT 'system',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS platform_notice_target_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notice_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(notice_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS platform_notice_dismissals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notice_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    dismissed_at TEXT NOT NULL,
    UNIQUE(notice_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS home_page_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_json TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS deposit_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    chain_name TEXT NOT NULL,
    recharge_address TEXT NOT NULL,
    qr_code_data TEXT NOT NULL,
    min_amount_usd REAL NOT NULL DEFAULT 10,
    max_amount_usd REAL NOT NULL DEFAULT 1000000,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_wallet_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    asset_symbol TEXT NOT NULL,
    asset_name TEXT NOT NULL,
    total_usd REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, asset_symbol)
  );

  CREATE TABLE IF NOT EXISTS user_wallet_balance_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    asset_symbol TEXT NOT NULL,
    available_usd REAL NOT NULL DEFAULT 0,
    locked_usd REAL NOT NULL DEFAULT 0,
    reward_earned_usd REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, asset_symbol)
  );

  CREATE TABLE IF NOT EXISTS deposit_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    asset_id INTEGER NOT NULL,
    asset_symbol TEXT NOT NULL,
    asset_name TEXT NOT NULL,
    chain_name TEXT NOT NULL,
    recharge_address_snapshot TEXT NOT NULL,
    amount_usd REAL NOT NULL,
    screenshot_file_name TEXT NOT NULL,
    screenshot_file_data TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT NOT NULL DEFAULT '',
    submitted_at TEXT NOT NULL,
    reviewed_at TEXT,
    reviewed_by TEXT
  );

  CREATE TABLE IF NOT EXISTS admin_user_update_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_user_id TEXT NOT NULL,
    admin_email TEXT NOT NULL DEFAULT '',
    target_user_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    field_name TEXT NOT NULL DEFAULT '',
    previous_value TEXT NOT NULL DEFAULT '',
    next_value TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
`);

function ensureUserProfileColumns() {
  const existingColumns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);

  if (!existingColumns.includes("first_name")) {
    db.exec("ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT ''");
  }
  if (!existingColumns.includes("last_name")) {
    db.exec("ALTER TABLE users ADD COLUMN last_name TEXT NOT NULL DEFAULT ''");
  }
  if (!existingColumns.includes("mobile")) {
    db.exec("ALTER TABLE users ADD COLUMN mobile TEXT NOT NULL DEFAULT ''");
  }
  if (!existingColumns.includes("avatar_url")) {
    db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''");
  }
  if (!existingColumns.includes("account_role")) {
    db.exec("ALTER TABLE users ADD COLUMN account_role TEXT NOT NULL DEFAULT 'trader'");
  }
  if (!existingColumns.includes("account_status")) {
    db.exec("ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'");
  }
  if (!existingColumns.includes("kyc_status")) {
    db.exec("ALTER TABLE users ADD COLUMN kyc_status TEXT NOT NULL DEFAULT 'pending'");
  }
  if (!existingColumns.includes("auth_tag")) {
    db.exec("ALTER TABLE users ADD COLUMN auth_tag TEXT NOT NULL DEFAULT 'kyc-pending'");
  }
  if (!existingColumns.includes("kyc_updated_at")) {
    db.exec("ALTER TABLE users ADD COLUMN kyc_updated_at TEXT NOT NULL DEFAULT ''");
  }
  if (!existingColumns.includes("binary_trade_outcome_mode")) {
    db.exec("ALTER TABLE users ADD COLUMN binary_trade_outcome_mode TEXT NOT NULL DEFAULT 'auto'");
  }
}

ensureUserProfileColumns();

function ensureTableColumn(tableName, columnName, columnDefinition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => String(column.name || ""));
  if (!columns.includes(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
  }
}

function ensureNoticeTablesAndColumns() {
  ensureTableColumn("platform_notices", "title", "title TEXT NOT NULL DEFAULT ''");
  ensureTableColumn("platform_notices", "severity", "severity TEXT NOT NULL DEFAULT 'info'");
  ensureTableColumn("platform_notices", "priority", "priority INTEGER NOT NULL DEFAULT 50");
  ensureTableColumn("platform_notices", "starts_at", "starts_at TEXT");
  ensureTableColumn("platform_notices", "expires_at", "expires_at TEXT");
  ensureTableColumn("platform_notices", "is_dismissible", "is_dismissible INTEGER NOT NULL DEFAULT 1");
  ensureTableColumn("platform_notices", "target_mode", "target_mode TEXT NOT NULL DEFAULT 'all'");
  ensureTableColumn("platform_notices", "target_kyc_status", "target_kyc_status TEXT");
  ensureTableColumn("platform_notices", "created_by", "created_by TEXT NOT NULL DEFAULT 'system'");
  ensureTableColumn("platform_notices", "updated_by", "updated_by TEXT NOT NULL DEFAULT 'system'");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_platform_notices_active_schedule
    ON platform_notices(is_active, starts_at, expires_at, priority, updated_at);
    CREATE INDEX IF NOT EXISTS idx_platform_notices_updated_desc
    ON platform_notices(updated_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_platform_notice_target_users_notice
    ON platform_notice_target_users(notice_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_platform_notice_target_users_user
    ON platform_notice_target_users(user_id, notice_id);
    CREATE INDEX IF NOT EXISTS idx_platform_notice_dismissals_user
    ON platform_notice_dismissals(user_id, notice_id);
    CREATE INDEX IF NOT EXISTS idx_platform_notice_dismissals_notice
    ON platform_notice_dismissals(notice_id, user_id);
  `);
}

ensureNoticeTablesAndColumns();

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_admin_user_update_logs_target_created
  ON admin_user_update_logs(target_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_admin_user_update_logs_admin_created
  ON admin_user_update_logs(admin_user_id, created_at DESC);
`);

function ensureUserRoleViews() {
  db.exec(`
    DROP VIEW IF EXISTS admin_accounts;
    DROP VIEW IF EXISTS platform_users;

    CREATE VIEW admin_accounts AS
    SELECT *
    FROM users
    WHERE account_role IN ('admin', 'super_admin');

    CREATE VIEW platform_users AS
    SELECT *
    FROM users
    WHERE account_role NOT IN ('admin', 'super_admin');
  `);
}

ensureUserRoleViews();

const createUserStatement = db.prepare(`
  INSERT INTO users (
    user_id,
    name,
    first_name,
    last_name,
    mobile,
    avatar_url,
    account_role,
    account_status,
    kyc_status,
    auth_tag,
    kyc_updated_at,
    email,
    password_hash,
    created_at
  )
  VALUES (
    @userId,
    @name,
    @firstName,
    @lastName,
    @mobile,
    @avatarUrl,
    @accountRole,
    @accountStatus,
    @kycStatus,
    @authTag,
    @kycUpdatedAt,
    @email,
    @passwordHash,
    @createdAt
  )
`);
const insertOtpStatement = db.prepare(`
  INSERT INTO otp_codes (email, purpose, otp_hash, expires_at, created_at)
  VALUES (@email, @purpose, @otpHash, @expiresAt, @createdAt)
`);
const latestOtpStatement = db.prepare(`
  SELECT * FROM otp_codes
  WHERE email = ? AND purpose = ? AND consumed_at IS NULL
  ORDER BY id DESC
  LIMIT 1
`);
const consumeOtpStatement = db.prepare(`
  UPDATE otp_codes
  SET consumed_at = ?
  WHERE id = ?
`);
const clearOtpStatement = db.prepare(`
  DELETE FROM otp_codes
  WHERE email = ? AND purpose = ?
`);
const findUserByEmailStatement = db.prepare(`
  SELECT * FROM users
  WHERE email = ?
`);
const findUserByUserIdStatement = db.prepare(`
  SELECT * FROM users
  WHERE user_id = ?
`);
const insertSessionStatement = db.prepare(`
  INSERT INTO sessions (user_id, session_token_hash, expires_at, created_at)
  VALUES (@userId, @sessionTokenHash, @expiresAt, @createdAt)
`);
const findSessionStatement = db.prepare(`
  SELECT sessions.id AS session_row_id, sessions.user_id AS session_user_id, sessions.expires_at AS session_expires_at,
         users.user_id, users.name, users.first_name, users.last_name, users.mobile, users.avatar_url,
         users.account_role, users.account_status, users.kyc_status, users.auth_tag, users.kyc_updated_at, users.email
  FROM sessions
  JOIN users ON users.user_id = sessions.user_id
  WHERE sessions.session_token_hash = ?
`);
const deleteSessionStatement = db.prepare(`
  DELETE FROM sessions
  WHERE session_token_hash = ?
`);
const deleteUserSessionsStatement = db.prepare(`
  DELETE FROM sessions
  WHERE user_id = ?
`);
const deleteUserWalletBalancesStatement = db.prepare(`
  DELETE FROM user_wallet_balances
  WHERE user_id = ?
`);
const deleteUserWalletDetailRowsStatement = db.prepare(`
  DELETE FROM user_wallet_balance_details
  WHERE user_id = ?
`);
const deleteUserKycSubmissionsStatement = db.prepare(`
  DELETE FROM kyc_submissions
  WHERE user_id = ?
`);
const deleteUserDepositRequestsStatement = db.prepare(`
  DELETE FROM deposit_requests
  WHERE user_id = ?
`);
const deleteOtpByEmailStatement = db.prepare(`
  DELETE FROM otp_codes
  WHERE email = ?
`);
const deleteUserByUserIdStatement = db.prepare(`
  DELETE FROM users
  WHERE user_id = ?
`);
const deleteUserAdminUserUpdateLogsStatement = db.prepare(`
  DELETE FROM admin_user_update_logs
  WHERE target_user_id = ?
`);
const insertPasswordResetTokenStatement = db.prepare(`
  INSERT INTO password_reset_tokens (email, reset_token_hash, expires_at, created_at)
  VALUES (@email, @resetTokenHash, @expiresAt, @createdAt)
`);
const latestPasswordResetTokenStatement = db.prepare(`
  SELECT * FROM password_reset_tokens
  WHERE reset_token_hash = ? AND consumed_at IS NULL
  ORDER BY id DESC
  LIMIT 1
`);
const consumePasswordResetTokenStatement = db.prepare(`
  UPDATE password_reset_tokens
  SET consumed_at = ?
  WHERE id = ?
`);
const clearPasswordResetTokenStatement = db.prepare(`
  DELETE FROM password_reset_tokens
  WHERE email = ?
`);
const updateUserPasswordStatement = db.prepare(`
  UPDATE users
  SET password_hash = ?
  WHERE email = ?
`);
const updateUserPasswordByUserIdStatement = db.prepare(`
  UPDATE users
  SET password_hash = ?
  WHERE user_id = ?
`);
const updateUserProfileStatement = db.prepare(`
  UPDATE users
  SET name = @name,
      first_name = @firstName,
      last_name = @lastName,
      mobile = @mobile,
      avatar_url = @avatarUrl
  WHERE user_id = @userId
`);
const updateUserProfileByAdminStatement = db.prepare(`
  UPDATE users
  SET name = @name,
      first_name = @firstName,
      last_name = @lastName,
      mobile = @mobile,
      avatar_url = @avatarUrl,
      account_role = @accountRole,
      account_status = @accountStatus,
      email = @email,
      kyc_status = @kycStatus,
      auth_tag = @authTag,
      kyc_updated_at = @kycUpdatedAt,
      binary_trade_outcome_mode = @binaryTradeOutcomeMode
  WHERE user_id = @userId
`);
const updateUserKycStatusStatement = db.prepare(`
  UPDATE users
  SET kyc_status = @kycStatus,
      auth_tag = @authTag,
      kyc_updated_at = @kycUpdatedAt
  WHERE user_id = @userId
`);
const insertKycSubmissionStatement = db.prepare(`
  INSERT INTO kyc_submissions (
    user_id,
    full_name,
    certification,
    ssn,
    front_file_name,
    front_file_data,
    back_file_name,
    back_file_data,
    status,
    note,
    submitted_at,
    reviewed_at,
    reviewed_by
  )
  VALUES (
    @userId,
    @fullName,
    @certification,
    @ssn,
    @frontFileName,
    @frontFileData,
    @backFileName,
    @backFileData,
    @status,
    @note,
    @submittedAt,
    @reviewedAt,
    @reviewedBy
  )
`);
const findKycSubmissionByIdStatement = db.prepare(`
  SELECT * FROM kyc_submissions
  WHERE id = ?
`);
const findLatestKycSubmissionByUserStatement = db.prepare(`
  SELECT * FROM kyc_submissions
  WHERE user_id = ?
  ORDER BY id DESC
  LIMIT 1
`);
const updateKycSubmissionReviewStatement = db.prepare(`
  UPDATE kyc_submissions
  SET status = @status,
      note = @note,
      reviewed_at = @reviewedAt,
      reviewed_by = @reviewedBy
  WHERE id = @id
`);
const countUsersStatement = db.prepare("SELECT COUNT(*) AS total FROM users");
const countPlatformUsersStatement = db.prepare("SELECT COUNT(*) AS total FROM platform_users");
const countAdminUsersStatement = db.prepare("SELECT COUNT(*) AS total FROM admin_accounts");
const countPlatformUsersByKycStatusStatement = db.prepare("SELECT COUNT(*) AS total FROM platform_users WHERE kyc_status = ?");
const countActivePlatformUsersStatement = db.prepare(`
  SELECT COUNT(DISTINCT s.user_id) AS total
  FROM sessions s
  JOIN platform_users u ON u.user_id = s.user_id
  WHERE s.expires_at > ?
`);
const countPlatformKycSubmissionsByStatusStatement = db.prepare(`
  SELECT COUNT(*) AS total
  FROM kyc_submissions k
  JOIN platform_users u ON u.user_id = k.user_id
  WHERE k.status = ?
`);
const countPlatformKycSubmissionsTotalStatement = db.prepare(`
  SELECT COUNT(*) AS total
  FROM kyc_submissions k
  JOIN platform_users u ON u.user_id = k.user_id
`);
const findKycSubmissionWithUserByIdStatement = db.prepare(`
  SELECT k.id, k.user_id, k.full_name, k.certification, k.ssn, k.front_file_name, k.back_file_name,
         k.status, k.note, k.submitted_at, k.reviewed_at, k.reviewed_by,
         u.name AS account_name, u.email AS account_email, u.kyc_status AS account_kyc_status,
    u.auth_tag AS account_auth_tag, u.avatar_url AS account_avatar_url
  FROM kyc_submissions k
  JOIN platform_users u ON u.user_id = k.user_id
  WHERE k.id = ?
  LIMIT 1
`);
const findKycSubmissionWithUserMediaByIdStatement = db.prepare(`
  SELECT k.id, k.user_id, k.full_name, k.certification, k.ssn, k.front_file_name, k.front_file_data,
         k.back_file_name, k.back_file_data,
         k.status, k.note, k.submitted_at, k.reviewed_at, k.reviewed_by,
         u.name AS account_name, u.email AS account_email, u.kyc_status AS account_kyc_status,
         u.auth_tag AS account_auth_tag, u.avatar_url AS account_avatar_url
  FROM kyc_submissions k
  JOIN platform_users u ON u.user_id = k.user_id
  WHERE k.id = ?
  LIMIT 1
`);
const listLatestKycSubmissionsStatement = db.prepare(`
  SELECT k.id, k.user_id, k.full_name, k.certification, k.ssn, k.front_file_name,
         k.back_file_name,
         k.status, k.note, k.submitted_at, k.reviewed_at, k.reviewed_by,
         u.name AS account_name, u.email AS account_email, u.kyc_status AS account_kyc_status,
         u.auth_tag AS account_auth_tag, u.avatar_url AS account_avatar_url
  FROM kyc_submissions k
  JOIN platform_users u ON u.user_id = k.user_id
  WHERE k.id IN (
    SELECT MAX(id)
    FROM kyc_submissions
    GROUP BY user_id
  )
  ORDER BY
    CASE k.status
      WHEN 'pending' THEN 0
      WHEN 'rejected' THEN 1
      ELSE 2
    END,
    k.submitted_at DESC
`);
const getLatestActiveNoticeStatement = db.prepare(`
  SELECT *
  FROM platform_notices
  WHERE is_active = 1
    AND (COALESCE(starts_at, '') = '' OR starts_at <= @nowIso)
    AND (COALESCE(expires_at, '') = '' OR expires_at > @nowIso)
  ORDER BY priority DESC, starts_at DESC, updated_at DESC, id DESC
  LIMIT 1
`);
const listAllNoticesStatement = db.prepare(`
  SELECT *
  FROM platform_notices
  ORDER BY created_at DESC, id DESC
`);
const listActiveNoticesForDeliveryStatement = db.prepare(`
  SELECT *
  FROM platform_notices
  WHERE is_active = 1
    AND (COALESCE(starts_at, '') = '' OR starts_at <= @nowIso)
    AND (COALESCE(expires_at, '') = '' OR expires_at > @nowIso)
  ORDER BY priority DESC, starts_at DESC, updated_at DESC, id DESC
`);
const findNoticeByIdStatement = db.prepare(`
  SELECT *
  FROM platform_notices
  WHERE id = ?
  LIMIT 1
`);
const insertNoticeStatement = db.prepare(`
  INSERT INTO platform_notices (
    title,
    message,
    severity,
    priority,
    starts_at,
    expires_at,
    is_active,
    is_dismissible,
    target_mode,
    target_kyc_status,
    created_by,
    updated_by,
    created_at,
    updated_at
  )
  VALUES (
    @title,
    @message,
    @severity,
    @priority,
    @startsAt,
    @expiresAt,
    @isActive,
    @isDismissible,
    @targetMode,
    @targetKycStatus,
    @createdBy,
    @updatedBy,
    @createdAt,
    @updatedAt
  )
`);
const updateNoticeStatement = db.prepare(`
  UPDATE platform_notices
  SET title = @title,
      message = @message,
      severity = @severity,
      priority = @priority,
      starts_at = @startsAt,
      expires_at = @expiresAt,
      is_active = @isActive,
      is_dismissible = @isDismissible,
      target_mode = @targetMode,
      target_kyc_status = @targetKycStatus,
      updated_by = @updatedBy,
      updated_at = @updatedAt
  WHERE id = @noticeId
`);
const updateNoticeStatusStatement = db.prepare(`
  UPDATE platform_notices
  SET is_active = @isActive,
      updated_by = @updatedBy,
      updated_at = @updatedAt
  WHERE id = @noticeId
`);
const clearActiveNoticesStatement = db.prepare(`
  UPDATE platform_notices
  SET is_active = 0,
      updated_by = @updatedBy,
      updated_at = @updatedAt
  WHERE is_active = 1
`);
const deleteNoticeTargetUsersByNoticeIdStatement = db.prepare(`
  DELETE FROM platform_notice_target_users
  WHERE notice_id = ?
`);
const insertNoticeTargetUserStatement = db.prepare(`
  INSERT OR IGNORE INTO platform_notice_target_users (
    notice_id,
    user_id,
    created_at
  )
  VALUES (
    @noticeId,
    @userId,
    @createdAt
  )
`);
const listNoticeTargetUsersByNoticeIdStatement = db.prepare(`
  SELECT notice_id, user_id
  FROM platform_notice_target_users
  WHERE notice_id = ?
  ORDER BY id ASC
`);
const insertNoticeDismissalStatement = db.prepare(`
  INSERT INTO platform_notice_dismissals (
    notice_id,
    user_id,
    dismissed_at
  )
  VALUES (
    @noticeId,
    @userId,
    @dismissedAt
  )
  ON CONFLICT(notice_id, user_id)
  DO UPDATE SET dismissed_at = excluded.dismissed_at
`);
const listNoticeDismissalsByUserStatement = db.prepare(`
  SELECT notice_id
  FROM platform_notice_dismissals
  WHERE user_id = ?
`);
const getLatestActiveHomePageConfigStatement = db.prepare(`
  SELECT * FROM home_page_configs
  WHERE is_active = 1
  ORDER BY updated_at DESC, id DESC
  LIMIT 1
`);
const clearActiveHomePageConfigsStatement = db.prepare(`
  UPDATE home_page_configs
  SET is_active = 0,
      updated_at = @updatedAt
  WHERE is_active = 1
`);
const insertHomePageConfigStatement = db.prepare(`
  INSERT INTO home_page_configs (config_json, is_active, created_at, updated_at, updated_by)
  VALUES (@configJson, @isActive, @createdAt, @updatedAt, @updatedBy)
`);
const listDepositAssetsStatement = db.prepare(`
  SELECT * FROM deposit_assets
  ORDER BY sort_order ASC, symbol ASC
`);
const listEnabledDepositAssetsStatement = db.prepare(`
  SELECT * FROM deposit_assets
  WHERE is_enabled = 1
  ORDER BY sort_order ASC, symbol ASC
`);
const findDepositAssetByIdStatement = db.prepare(`
  SELECT * FROM deposit_assets
  WHERE id = ?
  LIMIT 1
`);
const findDepositAssetBySymbolStatement = db.prepare(`
  SELECT * FROM deposit_assets
  WHERE symbol = ?
  LIMIT 1
`);
const insertDepositAssetStatement = db.prepare(`
  INSERT INTO deposit_assets (
    symbol,
    name,
    chain_name,
    recharge_address,
    qr_code_data,
    min_amount_usd,
    max_amount_usd,
    sort_order,
    is_enabled,
    created_at,
    updated_at
  )
  VALUES (
    @symbol,
    @name,
    @chainName,
    @rechargeAddress,
    @qrCodeData,
    @minAmountUsd,
    @maxAmountUsd,
    @sortOrder,
    @isEnabled,
    @createdAt,
    @updatedAt
  )
`);
const updateDepositAssetStatement = db.prepare(`
  UPDATE deposit_assets
  SET symbol = @symbol,
      name = @name,
      chain_name = @chainName,
      recharge_address = @rechargeAddress,
      qr_code_data = @qrCodeData,
      min_amount_usd = @minAmountUsd,
      max_amount_usd = @maxAmountUsd,
      sort_order = @sortOrder,
      is_enabled = @isEnabled,
      updated_at = @updatedAt
  WHERE id = @id
`);
const deleteDepositAssetByIdStatement = db.prepare(`
  DELETE FROM deposit_assets
  WHERE id = ?
`);
const countDepositRequestsByAssetIdStatement = db.prepare(`
  SELECT COUNT(*) AS total
  FROM deposit_requests
  WHERE asset_id = ?
`);
const insertDepositRequestStatement = db.prepare(`
  INSERT INTO deposit_requests (
    id,
    user_id,
    asset_id,
    asset_symbol,
    asset_name,
    chain_name,
    recharge_address_snapshot,
    amount_usd,
    screenshot_file_name,
    screenshot_file_data,
    status,
    note,
    submitted_at,
    reviewed_at,
    reviewed_by
  )
  VALUES (
    @requestId,
    @userId,
    @assetId,
    @assetSymbol,
    @assetName,
    @chainName,
    @rechargeAddressSnapshot,
    @amountUsd,
    @screenshotFileName,
    @screenshotFileData,
    @status,
    @note,
    @submittedAt,
    @reviewedAt,
    @reviewedBy
  )
`);
const findDepositRequestByIdStatement = db.prepare(`
  SELECT * FROM deposit_requests
  WHERE id = ?
  LIMIT 1
`);
const updateDepositRequestReviewStatement = db.prepare(`
  UPDATE deposit_requests
  SET status = @status,
      note = @note,
      reviewed_at = @reviewedAt,
      reviewed_by = @reviewedBy
  WHERE id = @id
`);
const listDepositRequestsByUserStatement = db.prepare(`
  SELECT * FROM deposit_requests
  WHERE user_id = ?
  ORDER BY submitted_at DESC, id DESC
  LIMIT 100
`);
const listAdminDepositRequestsStatement = db.prepare(`
  SELECT d.id, d.user_id, d.asset_id, d.asset_symbol, d.asset_name, d.chain_name,
    d.recharge_address_snapshot, d.amount_usd, d.screenshot_file_name,
         d.status, d.note, d.submitted_at, d.reviewed_at, d.reviewed_by,
    u.name AS account_name, u.email AS account_email, u.avatar_url AS account_avatar_url
  FROM deposit_requests d
  JOIN users u ON u.user_id = d.user_id
  ORDER BY
    CASE d.status
      WHEN 'pending' THEN 0
      WHEN 'approved' THEN 1
      ELSE 2
    END,
    d.submitted_at DESC,
    d.id DESC
  LIMIT 400
`);
const findAdminDepositRequestWithMediaByIdStatement = db.prepare(`
  SELECT d.id, d.user_id, d.asset_id, d.asset_symbol, d.asset_name, d.chain_name,
         d.recharge_address_snapshot, d.amount_usd, d.screenshot_file_name, d.screenshot_file_data,
         d.status, d.note, d.submitted_at, d.reviewed_at, d.reviewed_by,
         u.name AS account_name, u.email AS account_email, u.avatar_url AS account_avatar_url
  FROM deposit_requests d
  JOIN users u ON u.user_id = d.user_id
  WHERE d.id = ?
  LIMIT 1
`);
const findAdminDepositRequestByIdStatement = db.prepare(`
  SELECT d.id, d.user_id, d.asset_id, d.asset_symbol, d.asset_name, d.chain_name,
         d.recharge_address_snapshot, d.amount_usd, d.screenshot_file_name,
         d.status, d.note, d.submitted_at, d.reviewed_at, d.reviewed_by,
         u.name AS account_name, u.email AS account_email, u.avatar_url AS account_avatar_url
  FROM deposit_requests d
  JOIN users u ON u.user_id = d.user_id
  WHERE d.id = ?
  LIMIT 1
`);
const listPlatformUsersStatement = db.prepare(`
  SELECT u.user_id, u.name, u.first_name, u.last_name, u.mobile, u.avatar_url,
         u.account_role, u.account_status, u.kyc_status, u.auth_tag, u.kyc_updated_at,
         u.binary_trade_outcome_mode, u.email, u.created_at, COALESCE(SUM(w.total_usd), 0) AS total_balance_usd,
         COALESCE(ks.total_submissions, 0) AS kyc_submission_count,
         COALESCE(ks.latest_status, '') AS latest_kyc_submission_status,
         CASE WHEN EXISTS (
           SELECT 1 FROM sessions s
           WHERE s.user_id = u.user_id AND s.expires_at > @nowIso
         ) THEN 1 ELSE 0 END AS is_session_active
  FROM platform_users u
  LEFT JOIN user_wallet_balances w ON w.user_id = u.user_id
  LEFT JOIN (
    SELECT k.user_id,
           COUNT(*) AS total_submissions,
           (
             SELECT k2.status
             FROM kyc_submissions k2
             WHERE k2.user_id = k.user_id
             ORDER BY k2.id DESC
             LIMIT 1
           ) AS latest_status
    FROM kyc_submissions k
    GROUP BY k.user_id
  ) ks ON ks.user_id = u.user_id
  GROUP BY u.id
  ORDER BY u.created_at DESC, u.id DESC
  LIMIT 1000
`);
const listAllUsersForAdminStatement = db.prepare(`
  SELECT u.user_id, u.name, u.first_name, u.last_name, u.mobile, u.avatar_url,
         u.account_role, u.account_status, u.kyc_status, u.auth_tag, u.kyc_updated_at,
         u.binary_trade_outcome_mode, u.email, u.created_at, COALESCE(SUM(w.total_usd), 0) AS total_balance_usd,
         COALESCE(ks.total_submissions, 0) AS kyc_submission_count,
         COALESCE(ks.latest_status, '') AS latest_kyc_submission_status,
         CASE WHEN EXISTS (
           SELECT 1 FROM sessions s
           WHERE s.user_id = u.user_id AND s.expires_at > @nowIso
         ) THEN 1 ELSE 0 END AS is_session_active
  FROM users u
  LEFT JOIN user_wallet_balances w ON w.user_id = u.user_id
  LEFT JOIN (
    SELECT k.user_id,
           COUNT(*) AS total_submissions,
           (
             SELECT k2.status
             FROM kyc_submissions k2
             WHERE k2.user_id = k.user_id
             ORDER BY k2.id DESC
             LIMIT 1
           ) AS latest_status
    FROM kyc_submissions k
    GROUP BY k.user_id
  ) ks ON ks.user_id = u.user_id
  GROUP BY u.id
  ORDER BY u.created_at DESC, u.id DESC
  LIMIT 1000
`);
const listAdminNotificationEmailsStatement = db.prepare(`
  SELECT LOWER(TRIM(email)) AS email
  FROM users
  WHERE TRIM(COALESCE(email, '')) <> ''
    AND LOWER(TRIM(COALESCE(account_role, ''))) IN ('admin', 'super_admin')
    AND LOWER(TRIM(COALESCE(account_status, ''))) = 'active'
  ORDER BY id DESC
  LIMIT 200
`);
const findAdminUserByUserIdStatement = db.prepare(`
  SELECT u.user_id, u.name, u.first_name, u.last_name, u.mobile, u.avatar_url,
         u.account_role, u.account_status, u.kyc_status, u.auth_tag, u.kyc_updated_at,
         u.binary_trade_outcome_mode, u.email, u.created_at, COALESCE(SUM(w.total_usd), 0) AS total_balance_usd,
         COALESCE(ks.total_submissions, 0) AS kyc_submission_count,
         COALESCE(ks.latest_status, '') AS latest_kyc_submission_status,
         CASE WHEN EXISTS (
           SELECT 1 FROM sessions s
           WHERE s.user_id = u.user_id AND s.expires_at > @nowIso
         ) THEN 1 ELSE 0 END AS is_session_active
  FROM users u
  LEFT JOIN user_wallet_balances w ON w.user_id = u.user_id
  LEFT JOIN (
    SELECT k.user_id,
           COUNT(*) AS total_submissions,
           (
             SELECT k2.status
             FROM kyc_submissions k2
             WHERE k2.user_id = k.user_id
             ORDER BY k2.id DESC
             LIMIT 1
           ) AS latest_status
    FROM kyc_submissions k
    GROUP BY k.user_id
  ) ks ON ks.user_id = u.user_id
  WHERE u.user_id = @userId
  GROUP BY u.id
  LIMIT 1
`);
const listUserKycHistoryForAdminStatement = db.prepare(`
  SELECT id, user_id, full_name, certification, ssn,
         front_file_name, front_file_data,
         back_file_name, back_file_data,
         status, note, submitted_at, reviewed_at, reviewed_by
  FROM kyc_submissions
  WHERE user_id = ?
  ORDER BY submitted_at DESC, id DESC
  LIMIT 30
`);
const listUserDepositHistoryForAdminStatement = db.prepare(`
  SELECT id, user_id, asset_id, asset_symbol, asset_name, chain_name,
         recharge_address_snapshot, amount_usd, screenshot_file_name, screenshot_file_data,
         status, note, submitted_at, reviewed_at, reviewed_by
  FROM deposit_requests
  WHERE user_id = ?
  ORDER BY submitted_at DESC, id DESC
  LIMIT 50
`);
const insertAdminUserUpdateLogStatement = db.prepare(`
  INSERT INTO admin_user_update_logs (
    admin_user_id,
    admin_email,
    target_user_id,
    action_type,
    field_name,
    previous_value,
    next_value,
    note,
    created_at
  )
  VALUES (
    @adminUserId,
    @adminEmail,
    @targetUserId,
    @actionType,
    @fieldName,
    @previousValue,
    @nextValue,
    @note,
    @createdAt
  )
`);
const listAdminUserUpdateLogsByTargetStatement = db.prepare(`
  SELECT *
  FROM admin_user_update_logs
  WHERE target_user_id = ?
  ORDER BY created_at DESC, id DESC
  LIMIT 120
`);
const countDepositRequestsByStatusStatement = db.prepare(`
  SELECT COUNT(*) AS total
  FROM deposit_requests
  WHERE status = ?
`);
const countDepositRequestsTotalStatement = db.prepare(`
  SELECT COUNT(*) AS total
  FROM deposit_requests
`);
const upsertWalletBalanceStatement = db.prepare(`
  INSERT INTO user_wallet_balances (
    user_id,
    asset_symbol,
    asset_name,
    total_usd,
    updated_at
  )
  VALUES (
    @userId,
    @assetSymbol,
    @assetName,
    @totalUsd,
    @updatedAt
  )
  ON CONFLICT(user_id, asset_symbol)
  DO UPDATE SET
    asset_name = excluded.asset_name,
    total_usd = user_wallet_balances.total_usd + excluded.total_usd,
    updated_at = excluded.updated_at
`);
const findWalletBalanceByUserAssetStatement = db.prepare(`
  SELECT user_id, asset_symbol, asset_name, total_usd, updated_at
  FROM user_wallet_balances
  WHERE user_id = ? AND asset_symbol = ?
  LIMIT 1
`);
const setWalletBalanceStatement = db.prepare(`
  INSERT INTO user_wallet_balances (
    user_id,
    asset_symbol,
    asset_name,
    total_usd,
    updated_at
  )
  VALUES (
    @userId,
    @assetSymbol,
    @assetName,
    @totalUsd,
    @updatedAt
  )
  ON CONFLICT(user_id, asset_symbol)
  DO UPDATE SET
    asset_name = excluded.asset_name,
    total_usd = excluded.total_usd,
    updated_at = excluded.updated_at
`);
const listUserWalletBalancesStatement = db.prepare(`
  SELECT asset_symbol, asset_name, total_usd, updated_at
  FROM user_wallet_balances
  WHERE user_id = ?
  ORDER BY total_usd DESC, asset_symbol ASC
`);
const listUserWalletDetailRowsStatement = db.prepare(`
  SELECT asset_symbol, available_usd, locked_usd, reward_earned_usd, updated_at
  FROM user_wallet_balance_details
  WHERE user_id = ?
  ORDER BY asset_symbol ASC
`);
const findWalletDetailByUserAssetStatement = db.prepare(`
  SELECT user_id, asset_symbol, available_usd, locked_usd, reward_earned_usd, updated_at
  FROM user_wallet_balance_details
  WHERE user_id = ? AND asset_symbol = ?
  LIMIT 1
`);
const updateWalletDetailStatement = db.prepare(`
  UPDATE user_wallet_balance_details
  SET available_usd = @availableUsd,
      locked_usd = @lockedUsd,
      reward_earned_usd = @rewardEarnedUsd,
      updated_at = @updatedAt
  WHERE user_id = @userId AND asset_symbol = @assetSymbol
`);
const updateWalletDetailSymbolByUserStatement = db.prepare(`
  UPDATE user_wallet_balance_details
  SET asset_symbol = @toSymbol
  WHERE user_id = @userId AND asset_symbol = @fromSymbol
`);
const deleteWalletDetailByUserAssetStatement = db.prepare(`
  DELETE FROM user_wallet_balance_details
  WHERE user_id = ? AND asset_symbol = ?
`);
const updateWalletBalanceSymbolByUserStatement = db.prepare(`
  UPDATE user_wallet_balances
  SET asset_symbol = @toSymbol
  WHERE user_id = @userId AND asset_symbol = @fromSymbol
`);
const deleteWalletBalanceByUserAssetStatement = db.prepare(`
  DELETE FROM user_wallet_balances
  WHERE user_id = ? AND asset_symbol = ?
`);
const getUserTotalSpotAssetsStatement = db.prepare(`
  SELECT COALESCE(SUM(total_usd), 0) AS total
  FROM user_wallet_balances
  WHERE user_id = ?
`);

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "20mb" }));

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";
const APP_NAME = process.env.APP_NAME || "RampXTrading";
const shouldServeStaticAssets =
  (
    String(process.env.SERVE_STATIC || "")
      .trim()
      .toLowerCase() === "true" ||
    process.env.NODE_ENV === "production"
  ) &&
  fs.existsSync(staticDistDir);

if (shouldServeStaticAssets) {
  app.use(
    express.static(staticDistDir, {
      index: false,
      maxAge: "1h",
      etag: true,
    }),
  );
}

const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES || 10);
const RESET_TOKEN_TTL_MINUTES = Number(process.env.RESET_TOKEN_TTL_MINUTES || 15);
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);
const ADMIN_SIGNUP_KEY = String(process.env.ADMIN_SIGNUP_KEY || "").trim();
const ALLOW_PUBLIC_ADMIN_SIGNUP = String(process.env.ALLOW_PUBLIC_ADMIN_SIGNUP || "")
  .trim()
  .toLowerCase() === "true";
const ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS = Math.max(30_000, Number(process.env.ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000));
const ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS = Math.max(3, Number(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS || 8));
const TEST_KYC_FILE_MAX_BYTES = Number(process.env.TEST_KYC_FILE_MAX_BYTES || 350000);
const HASH_SECRET = process.env.AUTH_HASH_SECRET || "cryptobot-dev-secret";
const KYC_CERTIFICATIONS = new Set(["nid", "passport", "driving_license"]);
const KYC_FILE_MIME_TYPES = new Set([
  "image/jpg",
  "image/jpeg",
  "image/png",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const DEPOSIT_SCREENSHOT_FILE_MAX_BYTES = Number(process.env.DEPOSIT_SCREENSHOT_FILE_MAX_BYTES || 15 * 1024 * 1024);
const DEPOSIT_FILE_MIME_TYPES = new Set([
  "image/jpg",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
]);
const DEPOSIT_MIN_USD_DEFAULT = Number(process.env.DEPOSIT_MIN_USD_DEFAULT || 10);
const DEPOSIT_MAX_USD_DEFAULT = Number(process.env.DEPOSIT_MAX_USD_DEFAULT || 1000000);
const DEPOSIT_DEFAULT_ASSETS = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    chainName: "Bitcoin",
    rechargeAddress: "bc1qyrnm9xqr3k8jhv6txhpggu5yt2a6r4yqqp7n8n",
    qrCodeData: "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=bitcoin:bc1qyrnm9xqr3k8jhv6txhpggu5yt2a6r4yqqp7n8n",
    minAmountUsd: 10,
    maxAmountUsd: 1000000,
    sortOrder: 1,
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    chainName: "ERC20",
    rechargeAddress: "0x8f8f2F9a316d4e7F4478d68A3C7f3B0b9Dfd2F34",
    qrCodeData: "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=ethereum:0x8f8f2F9a316d4e7F4478d68A3C7f3B0b9Dfd2F34",
    minAmountUsd: 10,
    maxAmountUsd: 1000000,
    sortOrder: 2,
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    chainName: "TRC20",
    rechargeAddress: "TQ2fFxjZQhPHhYf4E1D2Y2m7pQeR4d2VqM",
    qrCodeData: "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=TQ2fFxjZQhPHhYf4E1D2Y2m7pQeR4d2VqM",
    minAmountUsd: 10,
    maxAmountUsd: 1000000,
    sortOrder: 3,
  },
  {
    symbol: "USDT",
    name: "Tether",
    chainName: "TRC20",
    rechargeAddress: "TF1K7F57N8dfh5tvx6aM2W1WAE72nAXRYd",
    qrCodeData: "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=TF1K7F57N8dfh5tvx6aM2W1WAE72nAXRYd",
    minAmountUsd: 10,
    maxAmountUsd: 1000000,
    sortOrder: 4,
  },
];
const SHOULD_RETURN_DEV_OTP =
  process.env.DEV_RETURN_OTP_IN_RESPONSE === "true" || process.env.NODE_ENV !== "production";

function getNow() {
  return new Date();
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function normalizeEmail(email = "") {
  return email.trim().toLowerCase();
}

function normalizeIdentifier(identifier = "") {
  return identifier.trim();
}

function toIso(date) {
  return date.toISOString();
}

function createHash(value) {
  return crypto.createHash("sha256").update(`${HASH_SECRET}:${value}`).digest("hex");
}

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function generateOpaqueToken() {
  return crypto.randomBytes(32).toString("hex");
}

function encodeBase64Url(value = "") {
  return Buffer.from(String(value), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value = "") {
  if (!value) {
    return "";
  }
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  const padded = normalized + "=".repeat(paddingLength);
  return Buffer.from(padded, "base64").toString("utf8");
}

function createSessionFingerprint(user = {}) {
  const seed = `${user.user_id || ""}:${user.password_hash || ""}`;
  return createHash(seed).slice(0, 24);
}

function signSessionPayload(encodedPayload = "") {
  return crypto.createHmac("sha256", HASH_SECRET).update(encodedPayload).digest("hex");
}

function buildSessionTokenSnapshot(user = {}) {
  return {
    name: String(user.name || "").trim().slice(0, 120),
    firstName: String(user.first_name || "").trim().slice(0, 80),
    lastName: String(user.last_name || "").trim().slice(0, 80),
    mobile: String(user.mobile || "").trim().slice(0, 40),
    avatarUrl: String(user.avatar_url || "").trim().slice(0, 4000),
    accountRole: String(user.account_role || "trader").trim().toLowerCase().replace(/\s+/g, "_").slice(0, 40),
    accountStatus: String(user.account_status || "active").trim().toLowerCase().replace(/\s+/g, "_").slice(0, 40),
    kycStatus: String(user.kyc_status || "pending").trim().toLowerCase().replace(/\s+/g, "_").slice(0, 40),
    authTag: String(user.auth_tag || "kyc-pending").trim().slice(0, 80),
    kycUpdatedAt: String(user.kyc_updated_at || "").trim().slice(0, 80),
    email: String(user.email || "").trim().toLowerCase().slice(0, 180),
    createdAt: String(user.created_at || "").trim().slice(0, 80),
  };
}

function createStatelessSessionToken({ user, expiresAt }) {
  const snapshot = buildSessionTokenSnapshot(user);
  const payload = {
    v: 1,
    uid: user.user_id || "",
    exp: expiresAt,
    fp: createSessionFingerprint(user),
    nm: snapshot.name,
    fn: snapshot.firstName,
    ln: snapshot.lastName,
    mb: snapshot.mobile,
    av: snapshot.avatarUrl,
    rl: snapshot.accountRole,
    st: snapshot.accountStatus,
    ks: snapshot.kycStatus,
    at: snapshot.authTag,
    ku: snapshot.kycUpdatedAt,
    em: snapshot.email,
    ca: snapshot.createdAt,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signSessionPayload(encodedPayload);
  return `cbs.${encodedPayload}.${signature}`;
}

function parseStatelessSessionToken(sessionToken = "") {
  const trimmed = String(sessionToken || "").trim();
  if (!trimmed.startsWith("cbs.")) {
    return null;
  }

  const parts = trimmed.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [, encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signSessionPayload(encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const receivedBuffer = Buffer.from(signature, "hex");
  if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload));
    if (
      Number(payload?.v) !== 1 ||
      !payload?.uid ||
      !payload?.exp ||
      typeof payload?.fp !== "string"
    ) {
      return null;
    }
    return {
      userId: String(payload.uid),
      expiresAt: String(payload.exp),
      fingerprint: String(payload.fp),
      tokenUser: {
        user_id: String(payload.uid),
        name: String(payload.nm || ""),
        first_name: String(payload.fn || ""),
        last_name: String(payload.ln || ""),
        mobile: String(payload.mb || ""),
        avatar_url: String(payload.av || ""),
        account_role: String(payload.rl || "trader"),
        account_status: String(payload.st || "active"),
        kyc_status: String(payload.ks || "pending"),
        auth_tag: String(payload.at || "kyc-pending"),
        kyc_updated_at: String(payload.ku || ""),
        email: String(payload.em || ""),
        created_at: String(payload.ca || ""),
      },
    };
  } catch {
    return null;
  }
}

function isExpired(isoDate) {
  return new Date(isoDate).getTime() < Date.now();
}

function findUserByIdentifier(identifier) {
  const cleanedIdentifier = normalizeIdentifier(identifier);
  if (/^\d{6}$/.test(cleanedIdentifier)) {
    return findUserByUserIdStatement.get(cleanedIdentifier) || null;
  }
  return findUserByEmailStatement.get(normalizeEmail(cleanedIdentifier)) || null;
}

function sanitizeEnv(value = "") {
  return String(value || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "");
}

const ADMIN_NOTIFICATION_DEFAULT_EMAILS = ["admin@rampxtrading.com", "support@rampxtrading.com"];
const NOTIFICATION_FROM_EMAIL_DEFAULT = "support@rampxtrading.com";
const NOTIFICATION_FROM_NAME_DEFAULT = "RampXTrading Support";

function normalizeEmailAddress(value = "") {
  return String(value || "").trim().toLowerCase();
}

function isValidEmailAddress(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function parseEmailList(value = "") {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeEmailAddress(item))
      .filter((item) => isValidEmailAddress(item));
  }

  return String(value || "")
    .split(",")
    .map((item) => normalizeEmailAddress(item))
    .filter((item) => isValidEmailAddress(item));
}

function dedupeEmails(values = []) {
  return Array.from(new Set((values || []).map((item) => normalizeEmailAddress(item)).filter(Boolean)));
}

function buildFromHeader(email = "", name = "") {
  const cleanEmail = normalizeEmailAddress(email);
  const cleanName = sanitizeEnv(name);
  if (!cleanEmail) {
    return "";
  }
  return cleanName ? `${cleanName} <${cleanEmail}>` : cleanEmail;
}

function resolveNotificationFromHeader() {
  const fromEmail = NOTIFICATION_FROM_EMAIL_DEFAULT;
  const fromName = sanitizeEnv(process.env.NOTIFICATION_FROM_NAME || NOTIFICATION_FROM_NAME_DEFAULT);
  return buildFromHeader(fromEmail || NOTIFICATION_FROM_EMAIL_DEFAULT, fromName || NOTIFICATION_FROM_NAME_DEFAULT);
}

function resolveAdminNotificationRecipients() {
  const configured = parseEmailList(sanitizeEnv(process.env.ADMIN_NOTIFICATION_EMAILS || ""));
  const seedRecipients = configured.length > 0 ? configured : ADMIN_NOTIFICATION_DEFAULT_EMAILS;
  let adminAccountRecipients = [];
  try {
    adminAccountRecipients = listAdminNotificationEmailsStatement
      .all()
      .map((row) => normalizeEmailAddress(row?.email || ""))
      .filter((email) => isValidEmailAddress(email));
  } catch {
    adminAccountRecipients = [];
  }
  return dedupeEmails([...seedRecipients, ...adminAccountRecipients]);
}

function maskAddress(value = "") {
  const clean = String(value || "").trim();
  if (!clean) {
    return "";
  }
  if (clean.length <= 10) {
    return `${clean.slice(0, 2)}***${clean.slice(-2)}`;
  }
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

function formatUsd(value = 0) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return "0.00";
  }
  return numeric.toFixed(2);
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildInfoTableRows(rows = []) {
  return rows
    .filter((row) => row && row.label && row.value !== undefined && row.value !== null && String(row.value) !== "")
    .map((row) => {
      const label = escapeHtml(row.label);
      const value = escapeHtml(String(row.value));
      return `<tr><td style="padding:6px 10px;font-weight:600;color:#334155;">${label}</td><td style="padding:6px 10px;color:#0f172a;">${value}</td></tr>`;
    })
    .join("");
}

function buildNotificationTemplate({ heading, intro, rows = [], closing = "" }) {
  const textRows = rows
    .filter((row) => row && row.label && row.value !== undefined && row.value !== null && String(row.value) !== "")
    .map((row) => `${row.label}: ${row.value}`)
    .join("\n");

  return {
    text: `${intro}\n\n${textRows}${closing ? `\n\n${closing}` : ""}`.trim(),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #0f172a;">
        <h2 style="margin: 0 0 12px 0;">${escapeHtml(APP_NAME)} - ${escapeHtml(heading)}</h2>
        <p style="margin: 0 0 14px 0;">${escapeHtml(intro)}</p>
        <table style="border-collapse: collapse; width: 100%; background: #f8fafc; border: 1px solid #e2e8f0;">
          ${buildInfoTableRows(rows)}
        </table>
        ${closing ? `<p style="margin-top: 14px; color: #475569;">${escapeHtml(closing)}</p>` : ""}
      </div>
    `,
  };
}

function getSmtpConfig() {
  const host = sanitizeEnv(process.env.SMTP_HOST);
  const portRaw = sanitizeEnv(process.env.SMTP_PORT || "587");
  const parsedPort = Number(portRaw || 587);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 587;
  const user = sanitizeEnv(process.env.SMTP_USER);
  const pass = sanitizeEnv(process.env.SMTP_PASS);
  const from = sanitizeEnv(process.env.SMTP_FROM);
  const familyRaw = sanitizeEnv(process.env.SMTP_IP_FAMILY || "");
  const family = familyRaw === "4" ? 4 : familyRaw === "6" ? 6 : undefined;
  const configuredPortsRaw = sanitizeEnv(process.env.SMTP_PORT_CANDIDATES || "");
  const configuredPorts = configuredPortsRaw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0 && value <= 65535);
  const ports = configuredPorts.length > 0 ? configuredPorts : [port];
  const normalizedHost = host.toLowerCase();
  if (normalizedHost === "smtp.gmail.com") {
    if (ports.includes(587) && !ports.includes(465)) {
      ports.push(465);
    } else if (ports.includes(465) && !ports.includes(587)) {
      ports.push(587);
    }
  }

  return {
    host,
    user,
    pass,
    from,
    family,
    ports: Array.from(new Set(ports)),
  };
}

function isSmtpConfigured() {
  const { host, user, pass, from } = getSmtpConfig();
  return Boolean(host && user && pass && from);
}

function getResendConfig() {
  const apiKey = sanitizeEnv(process.env.RESEND_API_KEY);
  const from = sanitizeEnv(process.env.RESEND_FROM || process.env.SMTP_FROM);
  return {
    apiKey,
    from,
  };
}

function isResendConfigured() {
  const { apiKey, from } = getResendConfig();
  return Boolean(apiKey && from);
}

function createSmtpTransporters() {
  const { host, user, pass, from, family, ports } = getSmtpConfig();
  if (!host || !user || !pass || !from) {
    throw new Error(
      "SMTP is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM to .env.",
    );
  }

  return ports.map((port) => ({
    port,
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 15000,
      requireTLS: port !== 465,
      tls: {
        servername: host,
        minVersion: "TLSv1.2",
      },
      ...(family ? { family } : {}),
    }),
  }));
}

function getOtpEmailTemplate({ email, otp, purpose, name }) {
  const expiresInText = `${OTP_TTL_MINUTES} minute${OTP_TTL_MINUTES > 1 ? "s" : ""}`;
  const title = purpose === "signup" ? "Your signup verification code" : "Your password reset code";
  const intro =
    purpose === "signup"
      ? "Use this code to complete your RampXTrading signup."
      : "Use this code to continue your RampXTrading password reset.";

  return {
    to: email,
    subject: `${APP_NAME}: ${title}`,
    text: `${intro}\n\nOTP: ${otp}\nExpires in: ${expiresInText}\n\nIf you did not request this, please ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a;">
        <h2 style="margin-bottom: 12px;">${APP_NAME}</h2>
        <p style="margin-bottom: 8px;">Hello ${name || "Trader"},</p>
        <p style="margin-bottom: 16px;">${intro}</p>
        <div style="font-size: 32px; letter-spacing: 8px; font-weight: 700; color: #2563eb; margin: 24px 0;">
          ${otp}
        </div>
        <p style="margin-bottom: 8px;">This code will expire in ${expiresInText}.</p>
        <p style="color: #64748b;">If you did not request this, you can ignore this email.</p>
      </div>
    `,
  };
}

async function sendOtpViaResend({ to, subject, text, html }) {
  const { apiKey, from } = getResendConfig();
  if (!apiKey || !from) {
    throw new Error("Resend is not configured. Add RESEND_API_KEY and RESEND_FROM.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(`Resend API error (${response.status}): ${raw || response.statusText || "Request failed"}`);
  }
}

async function sendEmailViaResend({ to, subject, text, html, fromOverride = "" }) {
  const { apiKey, from } = getResendConfig();
  const fromAddress = sanitizeEnv(fromOverride || from);
  if (!apiKey || !fromAddress) {
    throw new Error("Resend is not configured. Add RESEND_API_KEY and RESEND_FROM.");
  }

  const recipients = dedupeEmails(Array.isArray(to) ? to : parseEmailList(to));
  if (!recipients.length) {
    throw new Error("At least one valid recipient email is required.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: recipients,
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(`Resend API error (${response.status}): ${raw || response.statusText || "Request failed"}`);
  }
}

async function sendEmailWithFallback({ to, subject, text, html, fromOverride = "" }) {
  const recipients = dedupeEmails(Array.isArray(to) ? to : parseEmailList(to));
  if (!recipients.length) {
    throw new Error("At least one valid recipient email is required.");
  }

  const emailProviderPreference = sanitizeEnv(process.env.EMAIL_PROVIDER || process.env.EMAIL_API_PROVIDER).toLowerCase();
  const smtpReady = isSmtpConfigured();
  const resendReady = isResendConfigured();

  if (!smtpReady && !resendReady) {
    throw new Error(
      "No email provider configured. Set SMTP_* credentials or RESEND_API_KEY + RESEND_FROM in environment variables.",
    );
  }

  const attempts = [];
  if (emailProviderPreference === "resend") {
    attempts.push("resend");
    if (smtpReady) {
      attempts.push("smtp");
    }
  } else if (emailProviderPreference === "smtp") {
    attempts.push("smtp");
    if (resendReady) {
      attempts.push("resend");
    }
  } else {
    if (resendReady) {
      attempts.push("resend");
    }
    if (smtpReady) {
      attempts.push("smtp");
    }
  }

  const dedupedAttempts = Array.from(new Set(attempts));
  const errors = [];

  for (const method of dedupedAttempts) {
    try {
      if (method === "resend") {
        await sendEmailViaResend({ to: recipients, subject, text, html, fromOverride });
        return {
          method: "resend",
          recipients,
        };
      }

      const smtpFrom = sanitizeEnv(fromOverride || getSmtpConfig().from);
      const transporters = createSmtpTransporters();
      for (const { port, transporter } of transporters) {
        try {
          await transporter.sendMail({
            from: smtpFrom,
            to: recipients,
            subject,
            text,
            html,
          });
          return {
            method: `smtp:${port}`,
            recipients,
          };
        } catch (smtpPortError) {
          errors.push(`smtp:${port} ${smtpPortError?.message || smtpPortError}`);
        }
      }
    } catch (providerError) {
      errors.push(`${method}: ${providerError?.message || providerError}`);
    }
  }

  throw new Error(errors.join(" | "));
}

async function dispatchNotificationEmail({ to, subject, text, html, metaLabel = "notification" }) {
  try {
    const result = await sendEmailWithFallback({
      to,
      subject,
      text,
      html,
      fromOverride: resolveNotificationFromHeader(),
    });
    const method = String(result?.method || "unknown");
    const recipientCount = Array.isArray(result?.recipients) ? result.recipients.length : 0;
    // eslint-disable-next-line no-console
    console.log(`[email:${metaLabel}] delivered via ${method} to ${recipientCount} recipient(s).`);
  } catch (error) {
    // Non-blocking by design: action succeeds even if email fails.
    console.error(`[email:${metaLabel}]`, error?.message || error);
  }
}

function normalizeEmailServiceError(error) {
  const message = error?.message || "";

  if (/535|invalid login|eauth/i.test(message)) {
    return "OTP email service login failed. Use a valid SMTP login and SMTP key in .env.";
  }

  if (/sender/i.test(message) && /invalid|reject|verify|authenticated/i.test(message)) {
    return "OTP email sender is not verified. Update SMTP_FROM to a verified sender/domain.";
  }

  if (/smtp is not configured/i.test(message)) {
    return message;
  }

  if (/resend is not configured/i.test(message)) {
    return message;
  }

  if (/resend api error \(403\)/i.test(message) && /onboarding@resend\.dev|resend\.dev/i.test(message)) {
    return "Resend test sender (onboarding@resend.dev) can only send to your own Resend account email. For real users, verify your domain in Resend and set RESEND_FROM to that domain email.";
  }

  if (/timed out|timeout|etimedout|enetunreach|ehostunreach|econnrefused/i.test(message)) {
    return "SMTP connection timed out. On Railway Free/Trial/Hobby plans, SMTP is blocked. Use RESEND_API_KEY + RESEND_FROM (HTTPS email API) or upgrade to Railway Pro and redeploy.";
  }

  return message || "Failed to send OTP email.";
}

async function sendOtpEmail({ email, otp, purpose, name }) {
  const emailProviderPreference = sanitizeEnv(process.env.EMAIL_PROVIDER || process.env.EMAIL_API_PROVIDER).toLowerCase();
  const template = getOtpEmailTemplate({ email, otp, purpose, name });
  const smtpReady = isSmtpConfigured();
  const resendReady = isResendConfigured();

  if (!smtpReady && !resendReady) {
    throw new Error(
      "No email provider configured. Set SMTP_* credentials or RESEND_API_KEY + RESEND_FROM in environment variables.",
    );
  }

  const attempts = [];
  if (emailProviderPreference === "resend") {
    attempts.push("resend");
    if (smtpReady) {
      attempts.push("smtp");
    }
  } else if (emailProviderPreference === "smtp") {
    attempts.push("smtp");
    if (resendReady) {
      attempts.push("resend");
    }
  } else {
    if (resendReady) {
      attempts.push("resend");
    }
    if (smtpReady) {
      attempts.push("smtp");
    }
  }

  const dedupedAttempts = Array.from(new Set(attempts));

  const errors = [];
  for (const method of dedupedAttempts) {
    try {
      if (method === "resend") {
        await sendOtpViaResend(template);
        return;
      }

      const smtpFrom = getSmtpConfig().from;
      const transporters = createSmtpTransporters();
      for (const { port, transporter } of transporters) {
        try {
          await transporter.sendMail({
            from: smtpFrom,
            ...template,
          });
          return;
        } catch (smtpPortError) {
          errors.push(`smtp:${port} ${smtpPortError?.message || smtpPortError}`);
        }
      }
    } catch (providerError) {
      errors.push(`${method}: ${providerError?.message || providerError}`);
    }
  }

  throw new Error(errors.join(" | "));
}

function sendAdminNotificationEmail({ subject, text, html, metaLabel = "admin-notification" }) {
  const recipients = resolveAdminNotificationRecipients();
  if (!recipients.length) {
    return;
  }
  void dispatchNotificationEmail({
    to: recipients,
    subject,
    text,
    html,
    metaLabel,
  });
}

function sendUserNotificationEmail({ toEmail, subject, text, html, metaLabel = "user-notification" }) {
  const email = normalizeEmailAddress(toEmail);
  if (!isValidEmailAddress(email)) {
    return;
  }
  void dispatchNotificationEmail({
    to: [email],
    subject,
    text,
    html,
    metaLabel,
  });
}

function buildAdminDepositRequestMailPayload({ request, user }) {
  const rows = [
    { label: "User ID", value: request?.userId || user?.userId || "" },
    { label: "User Name", value: user?.name || "" },
    { label: "User Email", value: user?.email || "" },
    { label: "Request ID", value: request?.requestId || "" },
    { label: "Asset", value: request?.assetSymbol || "" },
    { label: "Chain", value: request?.chainName || "" },
    { label: "Amount (USD)", value: formatUsd(request?.amountUsd || 0) },
    { label: "Submitted At", value: request?.submittedAt || "" },
    { label: "Status", value: request?.status || "pending" },
  ];
  const template = buildNotificationTemplate({
    heading: "New Deposit Request",
    intro: "A user submitted a new deposit request and it is waiting for admin review.",
    rows,
  });
  return {
    subject: `${APP_NAME}: New Deposit Request (${request?.requestId || "N/A"})`,
    ...template,
  };
}

function buildAdminKycSubmissionMailPayload({ submission, user }) {
  const rows = [
    { label: "User ID", value: submission?.userId || user?.userId || "" },
    { label: "User Name", value: user?.name || "" },
    { label: "User Email", value: user?.email || "" },
    { label: "KYC Request ID", value: submission?.requestId || "" },
    { label: "Document Type", value: submission?.certification || "" },
    { label: "Document Serial", value: maskAddress(submission?.ssn || "") },
    { label: "Submitted At", value: submission?.submittedAt || "" },
    { label: "Status", value: submission?.status || "pending" },
  ];
  const template = buildNotificationTemplate({
    heading: "New KYC Submission",
    intro: "A user submitted KYC documents and this request is waiting for admin review.",
    rows,
    closing: "Sensitive files are available in admin dashboard only.",
  });
  return {
    subject: `${APP_NAME}: New KYC Submission (${submission?.requestId || "N/A"})`,
    ...template,
  };
}

function buildAdminWithdrawalRequestMailPayload({ withdrawal, user }) {
  const rows = [
    { label: "User ID", value: withdrawal?.userId || user?.userId || "" },
    { label: "User Name", value: user?.name || "" },
    { label: "User Email", value: user?.email || "" },
    { label: "Withdrawal Ref", value: withdrawal?.withdrawalRef || "" },
    { label: "Wallet", value: withdrawal?.walletSymbol || "" },
    { label: "Asset", value: withdrawal?.assetSymbol || "" },
    { label: "Network", value: withdrawal?.networkType || "" },
    { label: "Amount (USD)", value: formatUsd(withdrawal?.amountUsd || 0) },
    { label: "Net Amount (USD)", value: formatUsd(withdrawal?.netAmountUsd || 0) },
    { label: "Destination", value: maskAddress(withdrawal?.destinationAddress || "") },
    { label: "Submitted At", value: withdrawal?.submittedAt || "" },
    { label: "Status", value: withdrawal?.status || "pending" },
  ];
  const template = buildNotificationTemplate({
    heading: "New Withdrawal Request",
    intro: "A user submitted a new withdrawal request and it is waiting for admin review.",
    rows,
  });
  return {
    subject: `${APP_NAME}: New Withdrawal Request (${withdrawal?.withdrawalRef || "N/A"})`,
    ...template,
  };
}

function buildAdminLiveChatMailPayload({ thread, user, messageText }) {
  const rows = [
    { label: "User ID", value: user?.userId || thread?.userId || "" },
    { label: "User Name", value: user?.name || thread?.userName || "" },
    { label: "User Email", value: user?.email || thread?.userEmail || "" },
    { label: "Thread Ref", value: thread?.threadRef || "" },
    { label: "Message", value: sanitizeShortText(messageText || "", 260) },
    { label: "Sent At", value: thread?.lastMessageAt || "" },
    { label: "Status", value: thread?.status || "open" },
  ];
  const template = buildNotificationTemplate({
    heading: "Live Chat Message",
    intro: "A user sent a new live support chat message.",
    rows,
  });
  return {
    subject: `${APP_NAME}: Live Chat Message (${thread?.threadRef || "N/A"})`,
    ...template,
  };
}

function buildUserDepositDecisionMailPayload({ request, decision }) {
  const rows = [
    { label: "Request ID", value: request?.requestId || "" },
    { label: "Asset", value: request?.assetSymbol || "" },
    { label: "Submitted Amount (USD)", value: formatUsd(request?.submittedAmountUsd || request?.amountUsd || 0) },
    { label: "Credited Amount (USD)", value: formatUsd(request?.creditedAmountUsd || 0) },
    { label: "Decision", value: decision || request?.status || "" },
    { label: "Reviewed At", value: request?.reviewedAt || "" },
    { label: "Admin Note", value: request?.note || "" },
  ];
  const template = buildNotificationTemplate({
    heading: "Deposit Request Update",
    intro: "Your deposit request has been reviewed by RampXTrading Support.",
    rows,
  });
  return {
    subject: `${APP_NAME}: Deposit ${decision === "approved" ? "Approved" : "Rejected"} (${request?.requestId || "N/A"})`,
    ...template,
  };
}

function buildUserKycDecisionMailPayload({ request, decision }) {
  const rows = [
    { label: "KYC Request ID", value: request?.requestId || "" },
    { label: "Document Type", value: request?.certification || "" },
    { label: "Decision", value: decision || request?.status || "" },
    { label: "Reviewed At", value: request?.reviewedAt || "" },
    { label: "Admin Note", value: request?.note || "" },
  ];
  const template = buildNotificationTemplate({
    heading: "KYC Verification Update",
    intro: "Your KYC verification request has been reviewed by RampXTrading Support.",
    rows,
  });
  return {
    subject: `${APP_NAME}: KYC ${decision === "authenticated" ? "Approved" : "Rejected"}`,
    ...template,
  };
}

function buildUserWithdrawalFinalMailPayload({ withdrawal, decision }) {
  const rows = [
    { label: "Withdrawal Ref", value: withdrawal?.withdrawalRef || "" },
    { label: "Wallet", value: withdrawal?.walletSymbol || "" },
    { label: "Asset", value: withdrawal?.assetSymbol || "" },
    { label: "Network", value: withdrawal?.networkType || "" },
    { label: "Amount (USD)", value: formatUsd(withdrawal?.amountUsd || 0) },
    { label: "Fee (USD)", value: formatUsd(withdrawal?.feeAmountUsd || 0) },
    { label: "Net Amount (USD)", value: formatUsd(withdrawal?.netAmountUsd || 0) },
    { label: "Destination", value: maskAddress(withdrawal?.destinationAddress || "") },
    { label: "Final Status", value: decision || withdrawal?.status || "" },
    { label: "Reviewed At", value: withdrawal?.reviewedAt || "" },
    { label: "Completed At", value: withdrawal?.completedAt || "" },
    { label: "Admin Note", value: withdrawal?.note || "" },
  ];
  const template = buildNotificationTemplate({
    heading: "Withdrawal Status Update",
    intro: "Your withdrawal request reached a final status.",
    rows,
  });
  return {
    subject: `${APP_NAME}: Withdrawal ${String(decision || withdrawal?.status || "").toUpperCase()} (${withdrawal?.withdrawalRef || "N/A"})`,
    ...template,
  };
}

function buildOtpDeliveryPayload({ emailError, otp, successMessage, fallbackMessage }) {
  if (!emailError) {
    return {
      ok: true,
      message: successMessage,
      delivery: "email",
      otpExpiresInMinutes: OTP_TTL_MINUTES,
    };
  }

  const normalizedError = normalizeEmailServiceError(emailError);
  if (!SHOULD_RETURN_DEV_OTP) {
    return {
      ok: false,
      status: 502,
      error: normalizedError,
    };
  }

  return {
    ok: true,
    message: fallbackMessage,
    delivery: "dev-fallback",
    devOtp: otp,
    otpExpiresInMinutes: OTP_TTL_MINUTES,
    emailError: normalizedError,
  };
}

function cleanupExpiredRecords() {
  const nowIso = toIso(getNow());
  db.prepare("DELETE FROM otp_codes WHERE expires_at < ?").run(nowIso);
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(nowIso);
  db.prepare("DELETE FROM password_reset_tokens WHERE expires_at < ?").run(nowIso);
}

const adminLoginRateLimitStore = new Map();

function getRequestClientIp(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").trim();
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return String(req?.ip || req?.socket?.remoteAddress || "unknown");
}

function buildAdminLoginRateLimitKey(req, identifier = "") {
  return `${getRequestClientIp(req)}::${normalizeIdentifier(identifier)}`;
}

function pruneAdminLoginRateLimitStore(nowMs = Date.now()) {
  for (const [key, entry] of adminLoginRateLimitStore.entries()) {
    if (!entry || nowMs >= Number(entry.windowStartMs || 0) + ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS) {
      adminLoginRateLimitStore.delete(key);
    }
  }
}

function getAdminLoginRateLimitState(req, identifier = "") {
  pruneAdminLoginRateLimitStore();
  const key = buildAdminLoginRateLimitKey(req, identifier);
  const nowMs = Date.now();
  const current = adminLoginRateLimitStore.get(key);
  if (!current) {
    return { key, isBlocked: false, attempts: 0, retryAfterMs: 0 };
  }
  const elapsedMs = nowMs - Number(current.windowStartMs || nowMs);
  if (elapsedMs >= ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS) {
    adminLoginRateLimitStore.delete(key);
    return { key, isBlocked: false, attempts: 0, retryAfterMs: 0 };
  }

  const attempts = Number(current.attempts || 0);
  const retryAfterMs = Math.max(0, ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS - elapsedMs);
  return {
    key,
    isBlocked: attempts >= ADMIN_LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    attempts,
    retryAfterMs,
  };
}

function recordAdminLoginFailure(req, identifier = "") {
  const nowMs = Date.now();
  const key = buildAdminLoginRateLimitKey(req, identifier);
  const current = adminLoginRateLimitStore.get(key);
  if (!current || nowMs - Number(current.windowStartMs || 0) >= ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS) {
    adminLoginRateLimitStore.set(key, { attempts: 1, windowStartMs: nowMs });
    return;
  }
  adminLoginRateLimitStore.set(key, {
    attempts: Number(current.attempts || 0) + 1,
    windowStartMs: Number(current.windowStartMs || nowMs),
  });
}

function clearAdminLoginFailures(req, identifier = "") {
  const key = buildAdminLoginRateLimitKey(req, identifier);
  adminLoginRateLimitStore.delete(key);
}

function assertValidPassword(password = "") {
  if (password.trim().length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }
}

function assertValidName(name = "") {
  if (name.trim().length < 2) {
    throw new Error("Please enter your full name.");
  }
}

function assertValidEmail(email = "") {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Please enter a valid email address.");
  }
}

function assertValidPhone(phone = "") {
  const normalized = sanitizeMobile(phone);
  if (!/^\+?[0-9]{6,16}$/.test(normalized)) {
    throw new Error("Please enter a valid phone number.");
  }
}

function normalizePersonName(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function splitFullName(fullName = "") {
  const normalized = normalizePersonName(fullName);
  if (!normalized) {
    return { firstName: "", lastName: "" };
  }

  const parts = normalized.split(" ");
  const firstName = parts.shift() || "";
  const lastName = parts.join(" ");
  return { firstName, lastName };
}

function buildDisplayName(firstName = "", lastName = "", fallbackName = "") {
  const normalizedFirst = normalizePersonName(firstName);
  const normalizedLast = normalizePersonName(lastName);
  const joined = `${normalizedFirst} ${normalizedLast}`.trim();
  if (joined) {
    return joined;
  }
  return normalizePersonName(fallbackName);
}

function sanitizeMobile(mobile = "") {
  return String(mobile || "").trim();
}

function sanitizeAvatarUrl(avatarUrl = "") {
  return String(avatarUrl || "").trim();
}

function normalizeKycStatus(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "authenticated" || normalized === "approved") {
    return "authenticated";
  }
  if (normalized === "rejected" || normalized === "reject") {
    return "rejected";
  }
  return "pending";
}

function normalizeAccountRole(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (normalized === "admin") {
    return "admin";
  }
  if (normalized === "superadmin" || normalized === "super_admin") {
    return "super_admin";
  }
  if (normalized === "institution" || normalized === "institutional") {
    return "institutional";
  }
  if (normalized === "pro" || normalized === "protrader" || normalized === "pro_trader") {
    return "pro_trader";
  }
  return "trader";
}

function normalizeAccountStatus(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (normalized === "ban" || normalized === "banned") {
    return "banned";
  }
  if (normalized === "suspend" || normalized === "suspended") {
    return "suspended";
  }
  return "active";
}

function normalizeBinaryTradeOutcomeMode(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

  if (normalized === "win" || normalized === "force_win" || normalized === "always_win") {
    return "force_win";
  }
  if (normalized === "loss" || normalized === "force_loss" || normalized === "always_loss") {
    return "force_loss";
  }
  return "auto";
}

function deriveAuthTag(kycStatus) {
  if (kycStatus === "authenticated") {
    return "kyc-authenticated";
  }
  if (kycStatus === "rejected") {
    return "kyc-rejected";
  }
  return "kyc-pending";
}

function normalizeCertification(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
  if (normalized === "driving_license" || normalized === "driving_licence") {
    return "driving_license";
  }
  return normalized;
}

function sanitizeShortText(value = "", maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function hasAdminRole(value = "") {
  const role = normalizeAccountRole(value);
  return role === "admin" || role === "super_admin";
}

function parseKycFileData(rawData = "", sectionLabel = "file") {
  const normalized = String(rawData || "").trim();
  const match = normalized.match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/);

  if (!match) {
    throw new Error(`${sectionLabel} file data is invalid. Please upload again.`);
  }

  const mimeType = match[1].toLowerCase();
  if (!KYC_FILE_MIME_TYPES.has(mimeType)) {
    throw new Error(`${sectionLabel} file type is not supported.`);
  }

  const base64Body = match[2];
  const bytes = Buffer.byteLength(base64Body, "base64");
  return {
    mimeType,
    bytes,
  };
}

function normalizeUsdAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("Please enter a valid amount.");
  }
  return Number(numeric.toFixed(8));
}

function normalizeAssetSymbol(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 15);
}

function normalizeWalletScopedSymbol(value = "") {
  const raw = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "");
  if (!raw) {
    return "";
  }

  const scopedMatch = raw.match(/^(SPOT|MAIN|BINARY)_?([A-Z0-9]+)$/);
  if (scopedMatch) {
    const scope = scopedMatch[1];
    const asset = scopedMatch[2];
    if (!asset) {
      return "";
    }
    return `${scope}_${asset}`.slice(0, 24);
  }

  return normalizeAssetSymbol(raw);
}

function normalizeDashboardWalletSymbol(value = "") {
  const raw = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "");
  if (!raw) {
    return "";
  }

  const aliases = {
    SPOTUSDT: "SPOT_USDT",
    MAINUSDT: "MAIN_USDT",
    BINARYUSDT: "BINARY_USDT",
  };
  if (aliases[raw]) {
    return aliases[raw];
  }

  const scopedMatch = raw.match(/^(SPOT|MAIN|BINARY)_?([A-Z0-9]+)$/);
  if (scopedMatch) {
    const scope = scopedMatch[1];
    const asset = normalizeAssetSymbol(scopedMatch[2]);
    if (!asset) {
      return "";
    }
    return `${scope}_${asset}`.slice(0, 24);
  }

  const asset = normalizeAssetSymbol(raw);
  if (!asset) {
    return "";
  }
  if (asset === "USD") {
    return "SPOT_USDT";
  }
  return `SPOT_${asset}`.slice(0, 24);
}

function buildDashboardWalletSymbolCandidates(value = "") {
  const canonical = normalizeDashboardWalletSymbol(value || "SPOT_USDT");
  const raw = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "");

  const candidates = [];
  const push = (symbol = "") => {
    const normalized = String(symbol || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "");
    if (!normalized) {
      return;
    }
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  push(canonical);
  push(raw);
  push(canonical.replace(/_/g, ""));
  push(raw.replace(/_/g, ""));

  if (canonical.startsWith("SPOT_")) {
    push(canonical.slice(5));
  }

  const assetOnly = canonical.includes("_") ? canonical.split("_").slice(1).join("_") : "";
  push(assetOnly);

  return candidates;
}

function buildWalletSymbolLabel(symbol = "") {
  const normalized = normalizeDashboardWalletSymbol(symbol);
  if (!normalized) {
    return "Wallet";
  }
  const [scope = "SPOT", ...assetParts] = normalized.split("_");
  const asset = assetParts.join("_") || "USDT";
  const scopeLabel = `${scope.charAt(0)}${scope.slice(1).toLowerCase()}`;
  return `${scopeLabel} Wallet (${asset})`;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }
  return fallback;
}

function parseDepositScreenshotData(rawData = "") {
  const normalized = String(rawData || "").trim();
  const match = normalized.match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) {
    throw new Error("Transaction screenshot data is invalid. Please upload again.");
  }

  const mimeType = String(match[1] || "").toLowerCase();
  if (!DEPOSIT_FILE_MIME_TYPES.has(mimeType)) {
    throw new Error("Supported formats: JPG, JPEG, PNG, HEIC");
  }

  const base64Body = match[2];
  const bytes = Buffer.byteLength(base64Body, "base64");
  if (bytes > DEPOSIT_SCREENSHOT_FILE_MAX_BYTES) {
    throw new Error("Screenshot is too large. Max size is 15MB.");
  }

  return {
    mimeType,
    bytes,
  };
}

function normalizeDepositStatus(status = "") {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  if (normalized === "approved" || normalized === "accept" || normalized === "accepted") {
    return "approved";
  }
  if (normalized === "rejected" || normalized === "reject") {
    return "rejected";
  }
  return "pending";
}

const lumModule = createLumModule({
  db,
  getNow,
  toIso,
  normalizeAssetSymbol,
  normalizeUsdAmount,
  sanitizeShortText,
});

const {
  handleLumSummary,
  handleLumPlans,
  handleLumPlanDetail,
  handleLumInvest,
  handleLumInvestments,
  handleLumInvestmentDetail,
  handleLumEntrust,
  handleLumInfo,
  handleAdminLumPlansList,
  handleAdminLumPlanCreate,
  handleAdminLumPlanUpdate,
  handleAdminLumPlanDelete,
  handleAdminLumPlanToggleStatus,
  handleAdminLumInvestments,
  handleAdminLumInvestmentReview,
  handleAdminLumForceSettle,
  handleAdminLumDashboardSummary,
  handleAdminLumContentSave,
} = lumModule;

const binaryModule = createBinaryModule({
  db,
  getNow,
  toIso,
  normalizeAssetSymbol,
  normalizeUsdAmount,
  sanitizeShortText,
});

const {
  handleBinarySummary,
  handleBinaryPairs,
  handleBinaryPairChart,
  handleBinaryConfig,
  handleBinaryMarketPrices,
  handleBinaryTradeOpen,
  handleBinaryActiveTrades,
  handleBinaryTradeHistory,
  handleBinaryTradeDetail,
  handleBinaryTradeSettle,
  handleAdminBinaryDashboardSummary,
  handleAdminBinaryCategories,
  handleAdminBinaryCategoryCreate,
  handleAdminBinaryCategoryUpdate,
  handleAdminBinaryCategoryDelete,
  handleAdminBinaryPairs,
  handleAdminBinaryPairCreate,
  handleAdminBinaryPairUpdate,
  handleAdminBinaryPairDelete,
  handleAdminBinaryPairToggle,
  handleAdminBinaryPeriodRules,
  handleAdminBinaryPeriodRuleSave,
  handleAdminBinaryTrades,
  handleAdminBinaryTradeSettle,
  handleAdminBinaryTradeCancel,
  handleAdminBinaryEngineSettingsGet,
  handleAdminBinaryEngineSettingsSave,
  handleAdminBinaryManualTickPush,
} = binaryModule;

const transactionModule = createTransactionModule({
  db,
  getNow,
  toIso,
  normalizeAssetSymbol,
  normalizeUsdAmount,
  sanitizeShortText,
});

const {
  handleTransactionConvertPairsList,
  handleTransactionConvertQuote,
  handleTransactionConvertSubmit,
  handleTransactionConvertHistory,
  handleTransactionSpotPairsList,
  handleTransactionSpotMarketSummary,
  handleTransactionSpotTicks,
  handleTransactionSpotRecentTrades,
  handleTransactionSpotOrderPlace,
  handleTransactionSpotOrdersOpen,
  handleTransactionSpotOrdersHistory,
  handleTransactionSpotOrderCancel,
  handleTransactionSpotOrderbook,
  handleAdminTransactionDashboardSummary,
  handleAdminTransactionEngineSettingsGet,
  handleAdminTransactionEngineSettingsSave,
  handleAdminTransactionConvertPairsList,
  handleAdminTransactionConvertPairCreate,
  handleAdminTransactionConvertPairUpdate,
  handleAdminTransactionConvertPairDelete,
  handleAdminTransactionConvertPairToggleStatus,
  handleAdminTransactionConvertOrdersList,
  handleAdminTransactionConvertManualRatePush,
  handleAdminTransactionSpotPairsList,
  handleAdminTransactionSpotPairCreate,
  handleAdminTransactionSpotPairUpdate,
  handleAdminTransactionSpotPairDelete,
  handleAdminTransactionSpotPairToggleStatus,
  handleAdminTransactionSpotOrdersList,
  handleAdminTransactionSpotOrderCancel,
  handleAdminTransactionSpotOrderForceFill,
  handleAdminTransactionSpotManualTickPush,
  handleAdminTransactionSpotFeedSettingsSave,
  handleAdminTransactionAuditList,
} = transactionModule;

const assetsModule = createAssetsModule({
  db,
  getNow,
  toIso,
  normalizeAssetSymbol,
  normalizeUsdAmount,
  sanitizeShortText,
  notificationHooks: {
    onWithdrawalSubmitted: ({ withdrawal, user }) => {
      const mail = buildAdminWithdrawalRequestMailPayload({ withdrawal, user });
      sendAdminNotificationEmail({
        ...mail,
        metaLabel: "admin-withdrawal-request",
      });
    },
    onWithdrawalFinalized: ({ withdrawal, decision, user }) => {
      const mail = buildUserWithdrawalFinalMailPayload({ withdrawal, decision });
      sendUserNotificationEmail({
        toEmail: user?.email,
        ...mail,
        metaLabel: `user-withdrawal-${decision || withdrawal?.status || "final"}`,
      });
    },
  },
});

const {
  handleAssetsSummary,
  handleAssetsWallets,
  handleAssetsHistory,
  handleAssetsTransfer,
  handleAssetsConvert,
  handleAssetsWithdrawConfig,
  handleAssetsWithdraw,
  handleAssetsWithdrawals,
  handleAssetsTransfers,
  handleAssetsConversions,
  handleAdminAssetsDashboardSummary,
  handleAdminAssetsWallets,
  handleAdminAssetsWalletDetail,
  handleAdminAssetsWalletAdjust,
  handleAdminAssetsWalletFreeze,
  handleAdminAssetsWithdrawals,
  handleAdminAssetsWithdrawReview,
  handleAdminAssetsWithdrawComplete,
  handleAdminAssetsTransfers,
  handleAdminAssetsConversions,
  handleAdminAssetsSettingsGet,
  handleAdminAssetsSettingsSave,
  handleAdminAssetsAuditLogs,
  getDepositCreditWalletSymbol,
  ensureWalletDetailMirroredFromSummary,
  insertAssetWalletLedgerEntry,
} = assetsModule;

const supportModule = createSupportModule({
  db,
  getNow,
  toIso,
  sanitizeShortText,
  notificationHooks: {
    onLiveChatUserMessage: ({ thread, user, messageText }) => {
      const mail = buildAdminLiveChatMailPayload({ thread, user, messageText });
      sendAdminNotificationEmail({
        ...mail,
        metaLabel: "admin-live-chat-message",
      });
    },
  },
});

const {
  handleSupportTicketsList,
  handleSupportTicketDetail,
  handleSupportTicketCreate,
  handleSupportTicketMessageSend,
  handleSupportTicketStatusUpdate,
  handleSupportLiveThread,
  handleSupportLiveSend,
  handleAdminSupportDashboardSummary,
  handleAdminSupportTickets,
  handleAdminSupportTicketDetail,
  handleAdminSupportReply,
  handleAdminSupportTicketUpdate,
  handleAdminSupportLiveThreads,
  handleAdminSupportLiveThreadDetail,
  handleAdminSupportLiveReply,
  handleAdminSupportLiveUpdate,
  handleAdminSupportAuditLogs,
} = supportModule;

const launchpadModule = createLaunchpadModule({
  db,
  getNow,
  toIso,
  normalizeAssetSymbol,
  normalizeUsdAmount,
  sanitizeShortText,
});

const {
  getLaunchpadDashboardSnapshot,
  handleLaunchpadCatalog,
  handleLaunchpadDetail,
  handleLaunchpadWatchlistToggle,
  handleLaunchpadBuyPreview,
  handleLaunchpadBuySubmit,
  handleLaunchpadMyOrders,
  handleLaunchpadFeed,
  handleLaunchpadCountdown,
  handleAdminLaunchpadDashboardSummary,
  handleAdminLaunchpadLaunchesList,
  handleAdminLaunchpadLaunchCreate,
  handleAdminLaunchpadLaunchUpdate,
  handleAdminLaunchpadLaunchStatus,
  handleAdminLaunchpadTiersSave,
  handleAdminLaunchpadSettingsGet,
  handleAdminLaunchpadSettingsSave,
  handleAdminLaunchpadOrdersList,
  handleAdminLaunchpadOrdersRelease,
  handleAdminLaunchpadMarketSyncRun,
  handleAdminLaunchpadAuditList,
} = launchpadModule;

function normalizeNoticeSeverity(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "critical") {
    return "critical";
  }
  if (normalized === "warning" || normalized === "warn") {
    return "warning";
  }
  return "info";
}

function normalizeNoticeTargetMode(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "kyc" || normalized === "users" || normalized === "mixed") {
    return normalized;
  }
  return "all";
}

function normalizeNoticePriority(value, fallback = 50) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(0, Math.min(9999, Number(fallback) || 50));
  }
  return Math.max(0, Math.min(9999, Math.round(numeric)));
}

function normalizeOptionalIsoDate(value, label = "Date") {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} is invalid.`);
  }
  return toIso(parsed);
}

function normalizeNoticeTargetUserIds(values = []) {
  const input = Array.isArray(values) ? values : [values];
  const seen = new Set();
  const userIds = [];
  for (const value of input) {
    const userId = sanitizeShortText(value || "", 24);
    if (!userId || seen.has(userId)) {
      continue;
    }
    seen.add(userId);
    userIds.push(userId);
  }
  return userIds;
}

function formatNoticeKycLabel(status = "") {
  const normalized = normalizeKycStatus(status);
  if (normalized === "authenticated") {
    return "Authenticated";
  }
  if (normalized === "rejected") {
    return "Rejected";
  }
  return "Pending";
}

function buildNoticeTargetSummary({ targetMode = "all", targetKycStatus = "", targetUserIds = [] }) {
  const mode = normalizeNoticeTargetMode(targetMode);
  const usersCount = Array.isArray(targetUserIds) ? targetUserIds.length : 0;
  const kycLabel = targetKycStatus ? formatNoticeKycLabel(targetKycStatus) : "";
  if (mode === "kyc") {
    return kycLabel ? `KYC segment: ${kycLabel}` : "KYC segment";
  }
  if (mode === "users") {
    return `${usersCount} specific user${usersCount === 1 ? "" : "s"}`;
  }
  if (mode === "mixed") {
    const userChunk = `${usersCount} user${usersCount === 1 ? "" : "s"}`;
    if (kycLabel) {
      return `Mixed: ${kycLabel} + ${userChunk}`;
    }
    return `Mixed: ${userChunk}`;
  }
  return "All users";
}

function buildNoticePayload(row, { targetUserIds = [], fallbackMessage = "No notice posted yet." } = {}) {
  if (!row) {
    return {
      message: fallbackMessage,
      updatedAt: "",
    };
  }

  const targetMode = normalizeNoticeTargetMode(row.target_mode || "all");
  const normalizedTargetUsers = normalizeNoticeTargetUserIds(targetUserIds);
  const rawTargetKycStatus = sanitizeShortText(row.target_kyc_status || "", 32);
  const targetKycStatus =
    targetMode === "all" || targetMode === "users"
      ? ""
      : rawTargetKycStatus
        ? normalizeKycStatus(rawTargetKycStatus)
        : "";

  return {
    noticeId: Number(row.id || 0),
    title: sanitizeShortText(row.title || "", 120),
    message: sanitizeShortText(row.message || "", 700),
    severity: normalizeNoticeSeverity(row.severity || "info"),
    priority: normalizeNoticePriority(row.priority, 50),
    startsAt: String(row.starts_at || ""),
    expiresAt: String(row.expires_at || ""),
    isActive: Number(row.is_active || 0) === 1,
    isDismissible: Number(row.is_dismissible || 0) === 1,
    targetMode,
    targetKycStatus,
    targetUserIds: normalizedTargetUsers,
    targetSummary: buildNoticeTargetSummary({
      targetMode,
      targetKycStatus,
      targetUserIds: normalizedTargetUsers,
    }),
    createdBy: sanitizeShortText(row.created_by || "", 40),
    updatedBy: sanitizeShortText(row.updated_by || "", 40),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || row.created_at || ""),
  };
}

function resolveNoticeTargetUsers(noticeId) {
  return listNoticeTargetUsersByNoticeIdStatement
    .all(noticeId)
    .map((row) => sanitizeShortText(row?.user_id || "", 24))
    .filter(Boolean);
}

function isNoticeApplicableToUser(row, user = {}, targetUserIds = []) {
  const targetMode = normalizeNoticeTargetMode(row?.target_mode || "all");
  if (targetMode === "all") {
    return true;
  }

  const userId = sanitizeShortText(user?.userId || user?.user_id || "", 24);
  const userKycStatus = normalizeKycStatus(user?.kycStatus || user?.kyc_status || "pending");
  const rawTargetKycStatus = sanitizeShortText(row?.target_kyc_status || "", 32);
  const targetKycStatus = rawTargetKycStatus ? normalizeKycStatus(rawTargetKycStatus) : "";
  const targetUserSet = new Set(normalizeNoticeTargetUserIds(targetUserIds));
  const kycMatch = targetKycStatus ? targetKycStatus === userKycStatus : false;
  const userMatch = userId ? targetUserSet.has(userId) : false;

  if (targetMode === "kyc") {
    return targetKycStatus ? kycMatch : false;
  }
  if (targetMode === "users") {
    return userMatch;
  }
  return kycMatch || userMatch;
}

function resolveNoticesForUser(user = {}) {
  const userId = sanitizeShortText(user?.userId || user?.user_id || "", 24);
  if (!userId) {
    return {
      primary: buildNoticePayload(null),
      items: [],
      unreadCount: 0,
    };
  }

  const nowIso = toIso(getNow());
  const rows = listActiveNoticesForDeliveryStatement.all({ nowIso });
  if (!rows.length) {
    return {
      primary: buildNoticePayload(null),
      items: [],
      unreadCount: 0,
    };
  }

  const dismissedNoticeIds = new Set(
    listNoticeDismissalsByUserStatement
      .all(userId)
      .map((row) => Number(row?.notice_id || 0))
      .filter((noticeId) => Number.isInteger(noticeId) && noticeId > 0),
  );

  const applicableItems = [];
  for (const row of rows) {
    const noticeId = Number(row?.id || 0);
    if (!noticeId || dismissedNoticeIds.has(noticeId)) {
      continue;
    }
    const targetUserIds = resolveNoticeTargetUsers(noticeId);
    if (!isNoticeApplicableToUser(row, user, targetUserIds)) {
      continue;
    }
    applicableItems.push(buildNoticePayload(row, { targetUserIds }));
  }

  const primary = applicableItems.length ? applicableItems[0] : buildNoticePayload(null);
  return {
    primary,
    items: applicableItems,
    unreadCount: applicableItems.length,
  };
}

function ensureNoticeTargetUsersExist(userIds = []) {
  const invalid = [];
  for (const userId of userIds) {
    const user = findUserByUserIdStatement.get(userId);
    if (!user) {
      invalid.push(userId);
    }
  }
  if (invalid.length) {
    throw new Error(`Invalid target userId: ${invalid[0]}`);
  }
}

function buildNoticeWriteInput(
  input = {},
  { existingNotice = null, existingTargetUserIds = [], defaultIsActive = true, requireMessage = true } = {},
) {
  const messageRaw = input.message !== undefined ? input.message : existingNotice?.message || "";
  const message = sanitizeShortText(messageRaw || "", 700);
  if (requireMessage && message.length < 6) {
    throw new Error("Notice must contain at least 6 characters.");
  }

  let title = sanitizeShortText(
    input.title !== undefined ? input.title : existingNotice?.title || "",
    120,
  );
  if (!title) {
    title = sanitizeShortText(message || "System Notice", 120);
  }

  const severity = normalizeNoticeSeverity(input.severity !== undefined ? input.severity : existingNotice?.severity || "info");
  const priority = normalizeNoticePriority(
    input.priority !== undefined ? input.priority : existingNotice?.priority ?? 50,
    50,
  );
  const startsAt = normalizeOptionalIsoDate(
    input.startsAt !== undefined ? input.startsAt : existingNotice?.starts_at || "",
    "startsAt",
  );
  const expiresAt = normalizeOptionalIsoDate(
    input.expiresAt !== undefined ? input.expiresAt : existingNotice?.expires_at || "",
    "expiresAt",
  );

  if (startsAt && expiresAt && expiresAt <= startsAt) {
    throw new Error("expiresAt must be greater than startsAt.");
  }

  const isActive = normalizeBoolean(
    input.isActive !== undefined ? input.isActive : Number(existingNotice?.is_active || 0) === 1,
    defaultIsActive,
  );
  const isDismissible = normalizeBoolean(
    input.isDismissible !== undefined ? input.isDismissible : Number(existingNotice?.is_dismissible || 0) === 1,
    true,
  );

  const targetMode = normalizeNoticeTargetMode(
    input.targetMode !== undefined ? input.targetMode : existingNotice?.target_mode || "all",
  );

  let targetKycStatus = sanitizeShortText(
    input.targetKycStatus !== undefined ? input.targetKycStatus : existingNotice?.target_kyc_status || "",
    32,
  );
  targetKycStatus = targetKycStatus ? normalizeKycStatus(targetKycStatus) : "";

  let targetUserIds = normalizeNoticeTargetUserIds(
    input.targetUserIds !== undefined ? input.targetUserIds : existingTargetUserIds,
  );

  if (targetUserIds.length > 500) {
    throw new Error("Target user list cannot exceed 500 users.");
  }

  if (targetMode === "all") {
    targetKycStatus = "";
    targetUserIds = [];
  } else if (targetMode === "kyc") {
    if (!targetKycStatus) {
      throw new Error("targetKycStatus is required for KYC-targeted notices.");
    }
    targetUserIds = [];
  } else if (targetMode === "users") {
    targetKycStatus = "";
    if (!targetUserIds.length) {
      throw new Error("At least one target user is required.");
    }
  } else if (!targetKycStatus && !targetUserIds.length) {
    throw new Error("Mixed target notices require a KYC segment or specific users.");
  }

  ensureNoticeTargetUsersExist(targetUserIds);

  return {
    title,
    message,
    severity,
    priority,
    startsAt,
    expiresAt,
    isActive: isActive ? 1 : 0,
    isDismissible: isDismissible ? 1 : 0,
    targetMode,
    targetKycStatus: targetKycStatus || "",
    targetUserIds,
  };
}

function syncNoticeTargetUsers(noticeId, targetUserIds = [], nowIso = toIso(getNow())) {
  const normalizedNoticeId = Number(noticeId || 0);
  if (!normalizedNoticeId) {
    return;
  }
  deleteNoticeTargetUsersByNoticeIdStatement.run(normalizedNoticeId);
  for (const userId of normalizeNoticeTargetUserIds(targetUserIds)) {
    insertNoticeTargetUserStatement.run({
      noticeId: normalizedNoticeId,
      userId,
      createdAt: nowIso,
    });
  }
}

function buildDefaultHomePageContentConfig() {
  return {
    brand: {
      name: "RampXTrading",
      footerDescription:
        "The world's most trusted cryptocurrency trading platform with advanced security and professional tools.",
      copyrightText: "© 2024 RampXTrading. All rights reserved.",
    },
    nav: {
      loginText: "Login",
      signupText: "Start Trading",
      links: [
        { label: "Features", href: "#features" },
        { label: "How it Works", href: "#how-it-works" },
        { label: "Download", href: "#download" },
        { label: "FAQ", href: "#faq" },
      ],
    },
    hero: {
      titleLine1: "Advanced Crypto Trading",
      titleLine2: "Made Simple & Secure",
      description:
        "Trade cryptocurrencies with institutional-grade tools, real-time analytics, and bank-level security. Join thousands of traders who trust our platform.",
      primaryCtaText: "Start Trading Now",
      secondaryCtaText: "Login",
      portfolioTitle: "Live Portfolio",
      portfolioBalance: "$124,567.89",
      stats: {
        volumeTarget: 2.4,
        usersTarget: 500,
        uptimeTarget: 99.9,
        volumeLabel: "Trading Volume",
        usersLabel: "Active Users",
        uptimeLabel: "Uptime",
        volumeSuffix: "B+",
        usersSuffix: "K+",
        uptimeSuffix: "%",
      },
    },
    market: {
      enableRandomMovement: true,
      assets: [
        { name: "Bitcoin", symbol: "BTC", price: 67234.56, change: 2.34, iconClass: "btc" },
        { name: "Ethereum", symbol: "ETH", price: 3456.78, change: 1.87, iconClass: "eth" },
        { name: "Cardano", symbol: "ADA", price: 0.4567, change: -0.23, iconClass: "ada" },
      ],
    },
    sections: {
      features: {
        title: "Why Choose RampXTrading?",
        description: "Advanced features designed for both beginners and professional traders",
        items: [
          {
            icon: "fa-shield-alt",
            title: "Bank-Level Security",
            description:
              "Multi-layer security with cold storage, 2FA, and insurance coverage for your digital assets.",
          },
          {
            icon: "fa-chart-line",
            title: "Advanced Analytics",
            description:
              "Real-time market data, technical indicators, and AI-powered insights for better trading decisions.",
          },
          {
            icon: "fa-bolt",
            title: "Lightning Fast",
            description:
              "Execute trades in milliseconds with our high-performance trading engine and global infrastructure.",
          },
          {
            icon: "fa-coins",
            title: "300+ Cryptocurrencies",
            description:
              "Trade Bitcoin, Ethereum, and 300+ other cryptocurrencies with competitive fees and deep liquidity.",
          },
          {
            icon: "fa-mobile-alt",
            title: "Mobile Trading",
            description: "Secure mobile trading with verified access and instant account recovery.",
          },
          {
            icon: "fa-headset",
            title: "24/7 Support",
            description:
              "Get help anytime with our dedicated support team and comprehensive knowledge base.",
          },
        ],
      },
      howItWorks: {
        title: "How It Works",
        description: "Get started with crypto trading in just 3 simple steps",
        items: [
          {
            icon: "fa-user-plus",
            title: "Create Your Account",
            description: "Sign up with your name, email, OTP verification, and secure password.",
          },
          {
            icon: "fa-credit-card",
            title: "Fund Your Wallet",
            description: "Deposit funds securely and track your verified account from any device.",
          },
          {
            icon: "fa-exchange-alt",
            title: "Start Trading",
            description: "Trade with pro tools, live pricing, and a protected crypto dashboard.",
          },
        ],
      },
      download: {
        title: "Trade Anywhere, Anytime",
        description:
          "Download our mobile app and desktop application for seamless trading experience across all your devices.",
        buttons: [
          { icon: "fab fa-apple", labelTop: "Download for", labelBottom: "iOS", href: "#download" },
          { icon: "fab fa-google-play", labelTop: "Get it on", labelBottom: "Google Play", href: "#download" },
          { icon: "fas fa-desktop", labelTop: "Download for", labelBottom: "Desktop", href: "#download" },
        ],
      },
      faq: {
        title: "Frequently Asked Questions",
        description: "Get answers to the most common questions about our platform",
        items: [
          {
            question: "Is RampXTrading safe and secure?",
            answer:
              "Yes, we use bank-level security, email verification, encrypted password storage, and protected account recovery.",
          },
          {
            question: "What cryptocurrencies can I trade?",
            answer:
              "You can trade over 300 cryptocurrencies including Bitcoin, Ethereum, Cardano, Solana, and more.",
          },
          {
            question: "How do I get started?",
            answer:
              "Create your account, verify your email OTP, set your password, and your 6-digit user ID will be assigned instantly.",
          },
          {
            question: "Can I reset my password?",
            answer:
              "Yes. Use forgot password, enter your email or user ID, verify OTP from your signup email, and create a new password.",
          },
          {
            question: "Can I use the platform on mobile?",
            answer:
              "Yes. The mobile app and the web login now share the same backend account system and recovery flow.",
          },
        ],
      },
    },
    footer: {
      socialLinks: [
        { icon: "fab fa-twitter", href: "#home" },
        { icon: "fab fa-facebook", href: "#home" },
        { icon: "fab fa-linkedin", href: "#home" },
        { icon: "fab fa-telegram", href: "#home" },
      ],
      sections: [
        {
          title: "Products",
          links: [
            { label: "Spot Trading", href: "#home" },
            { label: "Futures Trading", href: "#home" },
            { label: "Margin Trading", href: "#home" },
            { label: "Staking", href: "#home" },
          ],
        },
        {
          title: "Company",
          links: [
            { label: "About Us", href: "#home" },
            { label: "Careers", href: "#home" },
            { label: "Press", href: "#home" },
            { label: "Legal", href: "#home" },
          ],
        },
        {
          title: "Resources",
          links: [
            { label: "Help Center", href: "#home" },
            { label: "API Documentation", href: "#home" },
            { label: "Trading Guide", href: "#home" },
            { label: "Blog", href: "#home" },
          ],
        },
        {
          title: "Support",
          links: [
            { label: "Contact Us", href: "#home" },
            { label: "Submit a Request", href: "#home" },
            { label: "System Status", href: "#home" },
            { label: "Bug Bounty", href: "#home" },
          ],
        },
      ],
      legalLinks: [
        { label: "Privacy Policy", href: "#home" },
        { label: "Terms of Service", href: "#home" },
        { label: "Cookie Policy", href: "#home" },
      ],
      adminPanelLinkText: "Admin Panel",
      adminPanelHref: "/admin",
    },
  };
}

function normalizeHomeContentHref(value = "", fallback = "#home") {
  const href = sanitizeShortText(value || "", 300);
  if (!href || /^javascript:/i.test(href)) {
    return fallback;
  }
  return href;
}

function normalizeHomePageContentConfig(content) {
  const base = buildDefaultHomePageContentConfig();
  const input = content && typeof content === "object" && !Array.isArray(content) ? content : {};

  const navInput = input.nav && typeof input.nav === "object" ? input.nav : {};
  const heroInput = input.hero && typeof input.hero === "object" ? input.hero : {};
  const heroStatsInput = heroInput.stats && typeof heroInput.stats === "object" ? heroInput.stats : {};
  const marketInput = input.market && typeof input.market === "object" ? input.market : {};
  const sectionsInput = input.sections && typeof input.sections === "object" ? input.sections : {};
  const footerInput = input.footer && typeof input.footer === "object" ? input.footer : {};
  const brandInput = input.brand && typeof input.brand === "object" ? input.brand : {};

  const normalizeArray = (rows, fallbackRows) =>
    Array.isArray(rows) && rows.length ? rows : fallbackRows;

  const normalizedContent = {
    brand: {
      name: sanitizeShortText(brandInput.name || base.brand.name, 120) || base.brand.name,
      footerDescription:
        sanitizeShortText(brandInput.footerDescription || base.brand.footerDescription, 500) ||
        base.brand.footerDescription,
      copyrightText:
        sanitizeShortText(brandInput.copyrightText || base.brand.copyrightText, 180) ||
        base.brand.copyrightText,
    },
    nav: {
      loginText: sanitizeShortText(navInput.loginText || base.nav.loginText, 40) || base.nav.loginText,
      signupText: sanitizeShortText(navInput.signupText || base.nav.signupText, 60) || base.nav.signupText,
      links: normalizeArray(navInput.links, base.nav.links)
        .map((row) => ({
          label: sanitizeShortText(row?.label || "", 80),
          href: normalizeHomeContentHref(row?.href, "#home"),
        }))
        .filter((row) => row.label),
    },
    hero: {
      titleLine1: sanitizeShortText(heroInput.titleLine1 || base.hero.titleLine1, 120) || base.hero.titleLine1,
      titleLine2: sanitizeShortText(heroInput.titleLine2 || base.hero.titleLine2, 120) || base.hero.titleLine2,
      description: sanitizeShortText(heroInput.description || base.hero.description, 700) || base.hero.description,
      primaryCtaText:
        sanitizeShortText(heroInput.primaryCtaText || base.hero.primaryCtaText, 80) || base.hero.primaryCtaText,
      secondaryCtaText:
        sanitizeShortText(heroInput.secondaryCtaText || base.hero.secondaryCtaText, 80) || base.hero.secondaryCtaText,
      portfolioTitle:
        sanitizeShortText(heroInput.portfolioTitle || base.hero.portfolioTitle, 80) || base.hero.portfolioTitle,
      portfolioBalance:
        sanitizeShortText(heroInput.portfolioBalance || base.hero.portfolioBalance, 40) || base.hero.portfolioBalance,
      stats: {
        volumeTarget: Number.isFinite(Number(heroStatsInput.volumeTarget))
          ? Number(heroStatsInput.volumeTarget)
          : base.hero.stats.volumeTarget,
        usersTarget: Number.isFinite(Number(heroStatsInput.usersTarget))
          ? Number(heroStatsInput.usersTarget)
          : base.hero.stats.usersTarget,
        uptimeTarget: Number.isFinite(Number(heroStatsInput.uptimeTarget))
          ? Number(heroStatsInput.uptimeTarget)
          : base.hero.stats.uptimeTarget,
        volumeLabel:
          sanitizeShortText(heroStatsInput.volumeLabel || base.hero.stats.volumeLabel, 80) ||
          base.hero.stats.volumeLabel,
        usersLabel:
          sanitizeShortText(heroStatsInput.usersLabel || base.hero.stats.usersLabel, 80) ||
          base.hero.stats.usersLabel,
        uptimeLabel:
          sanitizeShortText(heroStatsInput.uptimeLabel || base.hero.stats.uptimeLabel, 80) ||
          base.hero.stats.uptimeLabel,
        volumeSuffix:
          sanitizeShortText(heroStatsInput.volumeSuffix || base.hero.stats.volumeSuffix, 20) ||
          base.hero.stats.volumeSuffix,
        usersSuffix:
          sanitizeShortText(heroStatsInput.usersSuffix || base.hero.stats.usersSuffix, 20) ||
          base.hero.stats.usersSuffix,
        uptimeSuffix:
          sanitizeShortText(heroStatsInput.uptimeSuffix || base.hero.stats.uptimeSuffix, 20) ||
          base.hero.stats.uptimeSuffix,
      },
    },
    market: {
      enableRandomMovement:
        typeof marketInput.enableRandomMovement === "boolean"
          ? marketInput.enableRandomMovement
          : base.market.enableRandomMovement,
      assets: normalizeArray(marketInput.assets, base.market.assets)
        .map((row) => ({
          name: sanitizeShortText(row?.name || "", 80),
          symbol: sanitizeShortText(row?.symbol || "", 20).toUpperCase(),
          price: Number.isFinite(Number(row?.price)) ? Number(row.price) : 0,
          change: Number.isFinite(Number(row?.change)) ? Number(row.change) : 0,
          iconClass: sanitizeShortText(row?.iconClass || "btc", 40) || "btc",
        }))
        .filter((row) => row.name && row.symbol),
    },
    sections: {
      features: {
        title:
          sanitizeShortText(sectionsInput?.features?.title || base.sections.features.title, 120) ||
          base.sections.features.title,
        description:
          sanitizeShortText(sectionsInput?.features?.description || base.sections.features.description, 400) ||
          base.sections.features.description,
        items: normalizeArray(sectionsInput?.features?.items, base.sections.features.items)
          .map((row) => ({
            icon: sanitizeShortText(row?.icon || "fa-circle", 60) || "fa-circle",
            title: sanitizeShortText(row?.title || "", 100),
            description: sanitizeShortText(row?.description || "", 400),
          }))
          .filter((row) => row.title && row.description),
      },
      howItWorks: {
        title:
          sanitizeShortText(sectionsInput?.howItWorks?.title || base.sections.howItWorks.title, 120) ||
          base.sections.howItWorks.title,
        description:
          sanitizeShortText(
            sectionsInput?.howItWorks?.description || base.sections.howItWorks.description,
            400,
          ) || base.sections.howItWorks.description,
        items: normalizeArray(sectionsInput?.howItWorks?.items, base.sections.howItWorks.items)
          .map((row) => ({
            icon: sanitizeShortText(row?.icon || "fa-circle", 60) || "fa-circle",
            title: sanitizeShortText(row?.title || "", 100),
            description: sanitizeShortText(row?.description || "", 400),
          }))
          .filter((row) => row.title && row.description),
      },
      download: {
        title:
          sanitizeShortText(sectionsInput?.download?.title || base.sections.download.title, 120) ||
          base.sections.download.title,
        description:
          sanitizeShortText(sectionsInput?.download?.description || base.sections.download.description, 400) ||
          base.sections.download.description,
        buttons: normalizeArray(sectionsInput?.download?.buttons, base.sections.download.buttons)
          .map((row) => ({
            icon: sanitizeShortText(row?.icon || "fas fa-link", 60) || "fas fa-link",
            labelTop: sanitizeShortText(row?.labelTop || "", 80),
            labelBottom: sanitizeShortText(row?.labelBottom || "", 80),
            href: normalizeHomeContentHref(row?.href, "#download"),
          }))
          .filter((row) => row.labelBottom),
      },
      faq: {
        title:
          sanitizeShortText(sectionsInput?.faq?.title || base.sections.faq.title, 120) ||
          base.sections.faq.title,
        description:
          sanitizeShortText(sectionsInput?.faq?.description || base.sections.faq.description, 400) ||
          base.sections.faq.description,
        items: normalizeArray(sectionsInput?.faq?.items, base.sections.faq.items)
          .map((row) => ({
            question: sanitizeShortText(row?.question || "", 220),
            answer: sanitizeShortText(row?.answer || "", 700),
          }))
          .filter((row) => row.question && row.answer),
      },
    },
    footer: {
      socialLinks: normalizeArray(footerInput.socialLinks, base.footer.socialLinks)
        .map((row) => ({
          icon: sanitizeShortText(row?.icon || "fas fa-link", 60) || "fas fa-link",
          href: normalizeHomeContentHref(row?.href, "#home"),
        }))
        .filter((row) => row.icon),
      sections: normalizeArray(footerInput.sections, base.footer.sections)
        .map((section) => ({
          title: sanitizeShortText(section?.title || "", 120),
          links: normalizeArray(section?.links, [])
            .map((row) => {
              if (typeof row === "string") {
                return {
                  label: sanitizeShortText(row, 80),
                  href: "#home",
                };
              }
              return {
                label: sanitizeShortText(row?.label || "", 80),
                href: normalizeHomeContentHref(row?.href, "#home"),
              };
            })
            .filter((row) => row.label),
        }))
        .filter((section) => section.title),
      legalLinks: normalizeArray(footerInput.legalLinks, base.footer.legalLinks)
        .map((row) => ({
          label: sanitizeShortText(row?.label || "", 80),
          href: normalizeHomeContentHref(row?.href, "#home"),
        }))
        .filter((row) => row.label),
      adminPanelLinkText:
        sanitizeShortText(footerInput.adminPanelLinkText || base.footer.adminPanelLinkText, 80) ||
        base.footer.adminPanelLinkText,
      adminPanelHref: normalizeHomeContentHref(footerInput.adminPanelHref, "/admin"),
    },
  };

  if (!normalizedContent.nav.links.length) {
    normalizedContent.nav.links = base.nav.links;
  }
  if (!normalizedContent.market.assets.length) {
    normalizedContent.market.assets = base.market.assets;
  }
  if (!normalizedContent.sections.features.items.length) {
    normalizedContent.sections.features.items = base.sections.features.items;
  }
  if (!normalizedContent.sections.howItWorks.items.length) {
    normalizedContent.sections.howItWorks.items = base.sections.howItWorks.items;
  }
  if (!normalizedContent.sections.download.buttons.length) {
    normalizedContent.sections.download.buttons = base.sections.download.buttons;
  }
  if (!normalizedContent.sections.faq.items.length) {
    normalizedContent.sections.faq.items = base.sections.faq.items;
  }
  if (!normalizedContent.footer.sections.length) {
    normalizedContent.footer.sections = base.footer.sections;
  }
  if (!normalizedContent.footer.socialLinks.length) {
    normalizedContent.footer.socialLinks = base.footer.socialLinks;
  }
  if (!normalizedContent.footer.legalLinks.length) {
    normalizedContent.footer.legalLinks = base.footer.legalLinks;
  }

  return normalizedContent;
}

function readHomePageContentConfig() {
  const row = getLatestActiveHomePageConfigStatement.get();
  if (!row) {
    return {
      config: normalizeHomePageContentConfig(buildDefaultHomePageContentConfig()),
      source: "default",
      updatedAt: "",
      updatedBy: "",
    };
  }

  try {
    const parsed = JSON.parse(String(row.config_json || "{}"));
    return {
      config: normalizeHomePageContentConfig(parsed),
      source: "database",
      updatedAt: row.updated_at || row.created_at || "",
      updatedBy: row.updated_by || "",
    };
  } catch {
    return {
      config: normalizeHomePageContentConfig(buildDefaultHomePageContentConfig()),
      source: "default",
      updatedAt: row.updated_at || row.created_at || "",
      updatedBy: row.updated_by || "",
    };
  }
}

function buildDepositAssetPayload(row) {
  if (!row) {
    return null;
  }

  return {
    assetId: row.id,
    symbol: normalizeAssetSymbol(row.symbol || ""),
    name: sanitizeShortText(row.name || "", 80),
    chainName: sanitizeShortText(row.chain_name || "", 80),
    rechargeAddress: sanitizeShortText(row.recharge_address || "", 180),
    qrCodeData: String(row.qr_code_data || "").trim(),
    minAmountUsd: Number(row.min_amount_usd || 0),
    maxAmountUsd: Number(row.max_amount_usd || 0),
    sortOrder: Number(row.sort_order || 0),
    isEnabled: Number(row.is_enabled || 0) === 1,
    updatedAt: row.updated_at || "",
  };
}

function normalizeMarketPrioritySymbol(value = "") {
  return normalizeAssetSymbol(value || "");
}

function extractBaseSymbolFromPairCode(value = "") {
  const normalizedPairCode = normalizeAssetSymbol(value || "");
  if (!normalizedPairCode) {
    return "";
  }
  if (normalizedPairCode.endsWith("USDT") && normalizedPairCode.length > 4) {
    return normalizedPairCode.slice(0, -4);
  }
  return normalizedPairCode;
}

function buildDashboardMarketPrioritySymbols(depositAssets = []) {
  const symbols = [];
  const seen = new Set();
  const pushSymbol = (value = "") => {
    const normalized = normalizeMarketPrioritySymbol(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    symbols.push(normalized);
  };

  const depositList = Array.isArray(depositAssets) ? depositAssets : [];
  for (const asset of depositList) {
    pushSymbol(asset?.symbol || "");
  }

  let binaryRows = [];
  try {
    binaryRows = db
      .prepare(`
        SELECT base_asset, pair_code
        FROM binary_pairs
        WHERE is_enabled = 1
        ORDER BY display_sort_order ASC, pair_code ASC
      `)
      .all();
  } catch {
    binaryRows = [];
  }

  for (const row of binaryRows) {
    const baseAsset = normalizeMarketPrioritySymbol(row?.base_asset || "");
    if (baseAsset) {
      pushSymbol(baseAsset);
      continue;
    }
    pushSymbol(extractBaseSymbolFromPairCode(row?.pair_code || ""));
  }

  return symbols;
}

function buildWalletBalancePayload(row) {
  if (!row) {
    return null;
  }
  const symbol = normalizeDashboardWalletSymbol(row.asset_symbol || "");
  if (!symbol) {
    return null;
  }
  return {
    symbol,
    name: sanitizeShortText(row.asset_name || buildWalletSymbolLabel(symbol), 80),
    totalUsd: Number(row.total_usd || 0),
    updatedAt: row.updated_at || "",
  };
}

const DEPOSIT_APPROVAL_AMOUNT_META_PATTERN = /\[approved_amount_usd=([0-9]+(?:\.[0-9]+)?)\]/i;

function stripDepositApprovalMeta(note = "") {
  return String(note || "").replace(DEPOSIT_APPROVAL_AMOUNT_META_PATTERN, "").trim();
}

function extractDepositApprovedAmountFromNote(note = "", fallbackAmountUsd = 0) {
  const match = String(note || "").match(DEPOSIT_APPROVAL_AMOUNT_META_PATTERN);
  if (match?.[1]) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  const fallback = Number(fallbackAmountUsd || 0);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

function withDepositApprovalMeta(note = "", approvedAmountUsd = 0) {
  const amount = Number(approvedAmountUsd || 0);
  const normalizedAmount = Number.isFinite(amount) ? amount : 0;
  const cleanNote = sanitizeShortText(stripDepositApprovalMeta(note), 300);
  const meta = `[approved_amount_usd=${normalizedAmount.toFixed(2)}]`;
  return cleanNote ? `${meta} ${cleanNote}` : meta;
}

function buildDepositRequestPayload(row, options = {}) {
  if (!row) {
    return null;
  }

  const includeAdminFields = Boolean(options.includeAdminFields);
  const includeSensitiveMedia = Boolean(options.includeSensitiveMedia);
  const normalizedStatus = normalizeDepositStatus(row.status || "pending");
  const submittedAmountUsd = Number(row.amount_usd || 0);
  const creditedAmountUsd =
    normalizedStatus === "approved"
      ? extractDepositApprovedAmountFromNote(row.note || "", submittedAmountUsd)
      : 0;

  const payload = {
    requestId: row.id,
    userId: row.user_id,
    assetId: row.asset_id,
    assetSymbol: normalizeAssetSymbol(row.asset_symbol || ""),
    assetName: sanitizeShortText(row.asset_name || "", 80),
    chainName: sanitizeShortText(row.chain_name || "", 80),
    rechargeAddress: sanitizeShortText(row.recharge_address_snapshot || "", 180),
    amountUsd: submittedAmountUsd,
    submittedAmountUsd,
    creditedAmountUsd,
    screenshotFileName: sanitizeShortText(row.screenshot_file_name || "", 180),
    status: normalizedStatus,
    note: stripDepositApprovalMeta(row.note || ""),
    submittedAt: row.submitted_at || "",
    reviewedAt: row.reviewed_at || "",
    reviewedBy: row.reviewed_by || "",
  };

  if (includeAdminFields) {
    payload.accountName = sanitizeShortText(row.account_name || "", 120);
    payload.accountEmail = sanitizeShortText(row.account_email || "", 160);
    payload.accountAvatarUrl = sanitizeAvatarUrl(row.account_avatar_url || "");
  }

  if (includeSensitiveMedia) {
    payload.screenshotFileData = String(row.screenshot_file_data || "").trim();
  }

  return payload;
}

function findDashboardWalletDetailByAnySymbol(userId, assetSymbol = "") {
  const candidates = buildDashboardWalletSymbolCandidates(assetSymbol);
  for (const candidate of candidates) {
    const row = findWalletDetailByUserAssetStatement.get(userId, candidate);
    if (row) {
      return { row, symbol: candidate };
    }
  }
  return null;
}

function findDashboardWalletSummaryByAnySymbol(userId, assetSymbol = "") {
  const candidates = buildDashboardWalletSymbolCandidates(assetSymbol);
  for (const candidate of candidates) {
    const row = findWalletBalanceByUserAssetStatement.get(userId, candidate);
    if (row) {
      return { row, symbol: candidate };
    }
  }
  return null;
}

function migrateDashboardWalletSymbolForUser({ userId, fromSymbol, toSymbol, nowIso }) {
  const from = String(fromSymbol || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "");
  const to = normalizeDashboardWalletSymbol(toSymbol || from);
  if (!from || !to || from === to) {
    return;
  }

  const detailFrom = findWalletDetailByUserAssetStatement.get(userId, from);
  if (detailFrom) {
    const detailTo = findWalletDetailByUserAssetStatement.get(userId, to);
    if (detailTo) {
      updateWalletDetailStatement.run({
        userId,
        assetSymbol: to,
        availableUsd: Number((Number(detailTo.available_usd || 0) + Number(detailFrom.available_usd || 0)).toFixed(8)),
        lockedUsd: Number((Number(detailTo.locked_usd || 0) + Number(detailFrom.locked_usd || 0)).toFixed(8)),
        rewardEarnedUsd: Number((Number(detailTo.reward_earned_usd || 0) + Number(detailFrom.reward_earned_usd || 0)).toFixed(8)),
        updatedAt: nowIso,
      });
      deleteWalletDetailByUserAssetStatement.run(userId, from);
    } else {
      updateWalletDetailSymbolByUserStatement.run({
        toSymbol: to,
        userId,
        fromSymbol: from,
      });
    }
  }

  const summaryFrom = findWalletBalanceByUserAssetStatement.get(userId, from);
  if (summaryFrom) {
    const summaryTo = findWalletBalanceByUserAssetStatement.get(userId, to);
    if (summaryTo) {
      setWalletBalanceStatement.run({
        userId,
        assetSymbol: to,
        assetName: sanitizeShortText(summaryTo.asset_name || summaryFrom.asset_name || buildWalletSymbolLabel(to), 80),
        totalUsd: Number((Number(summaryTo.total_usd || 0) + Number(summaryFrom.total_usd || 0)).toFixed(8)),
        updatedAt: nowIso,
      });
      deleteWalletBalanceByUserAssetStatement.run(userId, from);
    } else {
      updateWalletBalanceSymbolByUserStatement.run({
        toSymbol: to,
        userId,
        fromSymbol: from,
      });
    }
  }
}

function normalizeDashboardWalletDataForUser(userId, nowIso) {
  const detailRows = listUserWalletDetailRowsStatement.all(userId);
  for (const row of detailRows) {
    const from = String(row.asset_symbol || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "");
    const to = normalizeDashboardWalletSymbol(from);
    if (!from || !to || from === to) {
      continue;
    }
    migrateDashboardWalletSymbolForUser({ userId, fromSymbol: from, toSymbol: to, nowIso });
  }

  const summaryRows = listUserWalletBalancesStatement.all(userId);
  for (const row of summaryRows) {
    const from = String(row.asset_symbol || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "");
    const to = normalizeDashboardWalletSymbol(from);
    if (!from || !to || from === to) {
      continue;
    }
    migrateDashboardWalletSymbolForUser({ userId, fromSymbol: from, toSymbol: to, nowIso });
  }

  const normalizedSummaryRows = listUserWalletBalancesStatement.all(userId);
  for (const row of normalizedSummaryRows) {
    const symbol = normalizeDashboardWalletSymbol(row.asset_symbol || "");
    if (!symbol) {
      continue;
    }
    ensureWalletDetailMirroredFromSummary({
      userId,
      assetSymbol: symbol,
      assetName: row.asset_name || buildWalletSymbolLabel(symbol),
      nowIso,
    });
  }

  const syncedDetailRows = listUserWalletDetailRowsStatement.all(userId);
  for (const row of syncedDetailRows) {
    const symbol = normalizeDashboardWalletSymbol(row.asset_symbol || "");
    if (!symbol) {
      continue;
    }
    const totalUsd = Number((Number(row.available_usd || 0) + Number(row.locked_usd || 0)).toFixed(8));
    const existingSummary = findWalletBalanceByUserAssetStatement.get(userId, symbol);
    setWalletBalanceStatement.run({
      userId,
      assetSymbol: symbol,
      assetName: sanitizeShortText(existingSummary?.asset_name || buildWalletSymbolLabel(symbol), 80),
      totalUsd,
      updatedAt: nowIso,
    });
  }
}

function readDashboardWallet(userId) {
  const nowIso = toIso(getNow());
  const normalizeTx = db.transaction(() => {
    normalizeDashboardWalletDataForUser(userId, nowIso);
  });
  normalizeTx();

  const summaryNameMap = listUserWalletBalancesStatement.all(userId).reduce((acc, row) => {
    const symbol = normalizeDashboardWalletSymbol(row.asset_symbol || "");
    if (!symbol || acc[symbol]) {
      return acc;
    }
    acc[symbol] = sanitizeShortText(row.asset_name || buildWalletSymbolLabel(symbol), 80);
    return acc;
  }, {});

  const aggregated = listUserWalletDetailRowsStatement.all(userId).reduce((acc, row) => {
    const symbol = normalizeDashboardWalletSymbol(row.asset_symbol || "");
    if (!symbol) {
      return acc;
    }
    const totalUsd = Number((Number(row.available_usd || 0) + Number(row.locked_usd || 0)).toFixed(8));
    if (!acc[symbol]) {
      acc[symbol] = {
        symbol,
        name: summaryNameMap[symbol] || buildWalletSymbolLabel(symbol),
        totalUsd: 0,
        updatedAt: row.updated_at || nowIso,
      };
    }
    acc[symbol].totalUsd = Number((acc[symbol].totalUsd + totalUsd).toFixed(8));
    if (row.updated_at && new Date(row.updated_at).getTime() > new Date(acc[symbol].updatedAt || 0).getTime()) {
      acc[symbol].updatedAt = row.updated_at;
    }
    return acc;
  }, {});

  const balances = Object.values(aggregated).sort((a, b) => b.totalUsd - a.totalUsd || a.symbol.localeCompare(b.symbol));
  const totalSpotAssetsUsd = balances.length
    ? Number(
        balances
          .filter((row) => String(row.symbol || "").startsWith("SPOT_"))
          .reduce((sum, row) => sum + Number(row.totalUsd || 0), 0)
          .toFixed(8),
      )
    : null;

  return {
    totalSpotAssetsUsd,
    balances,
  };
}

function applyWalletDetailDeltaIfExists({ userId, assetSymbol, deltaUsd, updatedAt }) {
  const symbol = normalizeDashboardWalletSymbol(assetSymbol || "");
  if (!symbol) {
    return null;
  }

  const matched = findDashboardWalletDetailByAnySymbol(userId, symbol);
  if (!matched) {
    return null;
  }
  if (matched.symbol !== symbol) {
    migrateDashboardWalletSymbolForUser({
      userId,
      fromSymbol: matched.symbol,
      toSymbol: symbol,
      nowIso: updatedAt,
    });
  }

  const existing = findWalletDetailByUserAssetStatement.get(userId, symbol);
  if (!existing) {
    return null;
  }

  const nextAvailable = Math.max(0, Number(existing.available_usd || 0) + Number(deltaUsd || 0));
  const lockedUsd = Number(existing.locked_usd || 0);
  const rewardEarnedUsd = Number(existing.reward_earned_usd || 0);

  updateWalletDetailStatement.run({
    userId,
    assetSymbol: symbol,
    availableUsd: Number(nextAvailable.toFixed(8)),
    lockedUsd: Number(lockedUsd.toFixed(8)),
    rewardEarnedUsd: Number(rewardEarnedUsd.toFixed(8)),
    updatedAt,
  });

  return findWalletDetailByUserAssetStatement.get(userId, symbol) || null;
}

function syncWalletSummaryFromDetailIfExists({ userId, assetSymbol, assetName, updatedAt }) {
  const symbol = normalizeDashboardWalletSymbol(assetSymbol || "");
  if (!symbol) {
    return;
  }

  const matched = findDashboardWalletDetailByAnySymbol(userId, symbol);
  if (!matched) {
    return;
  }
  if (matched.symbol !== symbol) {
    migrateDashboardWalletSymbolForUser({
      userId,
      fromSymbol: matched.symbol,
      toSymbol: symbol,
      nowIso: updatedAt,
    });
  }

  const detail = findWalletDetailByUserAssetStatement.get(userId, symbol);
  if (!detail) {
    return;
  }

  const totalUsd = Number((Number(detail.available_usd || 0) + Number(detail.locked_usd || 0)).toFixed(8));
  setWalletBalanceStatement.run({
    userId,
    assetSymbol: symbol,
    assetName: sanitizeShortText(assetName || buildWalletSymbolLabel(symbol), 80),
    totalUsd,
    updatedAt,
  });
}

function ensureDefaultDepositAssets() {
  const existingAssets = listDepositAssetsStatement.all();
  if (existingAssets.length > 0) {
    return;
  }

  const nowIso = toIso(getNow());
  for (const asset of DEPOSIT_DEFAULT_ASSETS) {
    insertDepositAssetStatement.run({
      symbol: asset.symbol,
      name: asset.name,
      chainName: asset.chainName,
      rechargeAddress: asset.rechargeAddress,
      qrCodeData: asset.qrCodeData,
      minAmountUsd: Number(asset.minAmountUsd || DEPOSIT_MIN_USD_DEFAULT),
      maxAmountUsd: Number(asset.maxAmountUsd || DEPOSIT_MAX_USD_DEFAULT),
      sortOrder: Number(asset.sortOrder || 0),
      isEnabled: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }
}

ensureDefaultDepositAssets();

function buildKycSubmissionPayload(row, options = {}) {
  if (!row) {
    return null;
  }

  const includeSensitiveMedia = Boolean(options.includeSensitiveMedia);
  const payload = {
    requestId: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    certification: row.certification,
    ssn: row.ssn,
    frontFileName: row.front_file_name,
    backFileName: row.back_file_name,
    status: normalizeKycStatus(row.status),
    note: row.note || "",
    submittedAt: row.submitted_at || "",
    reviewedAt: row.reviewed_at || "",
    reviewedBy: row.reviewed_by || "",
  };

  if (includeSensitiveMedia) {
    payload.frontFileData = String(row.front_file_data || "").trim();
    payload.backFileData = String(row.back_file_data || "").trim();
  }

  return payload;
}

function buildKycAdminPayload(row, options = {}) {
  if (!row) {
    return null;
  }

  const includeSensitiveMedia = Boolean(options.includeSensitiveMedia);
  const payload = {
    requestId: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    certification: row.certification,
    ssn: row.ssn,
    frontFileName: row.front_file_name,
    backFileName: row.back_file_name,
    status: normalizeKycStatus(row.status),
    note: row.note || "",
    submittedAt: row.submitted_at || "",
    reviewedAt: row.reviewed_at || "",
    reviewedBy: row.reviewed_by || "",
    accountName: row.account_name || "",
    accountEmail: row.account_email || "",
    accountAvatarUrl: sanitizeAvatarUrl(row.account_avatar_url || ""),
    accountKycStatus: normalizeKycStatus(row.account_kyc_status),
    accountAuthTag: row.account_auth_tag || deriveAuthTag(normalizeKycStatus(row.account_kyc_status)),
  };

  if (includeSensitiveMedia) {
    payload.frontFileData = String(row.front_file_data || "").trim();
    payload.backFileData = String(row.back_file_data || "").trim();
  }

  return payload;
}

function buildUserPayload(user = {}) {
  const firstName = normalizePersonName(user.first_name || "");
  const lastName = normalizePersonName(user.last_name || "");
  const name = buildDisplayName(firstName, lastName, user.name || "");
  const kycStatus = normalizeKycStatus(user.kyc_status || "");
  const latestKycSubmissionStatus = normalizeKycStatus(user.latest_kyc_submission_status || "");
  const kycSubmissionCount = Math.max(0, Number(user.kyc_submission_count || 0));
  const kycStage =
    kycStatus === "authenticated" ? "authenticated" : kycSubmissionCount > 0 ? "submitted_pending" : "not_submitted";
  const authTag = sanitizeShortText(user.auth_tag || deriveAuthTag(kycStatus), 60) || deriveAuthTag(kycStatus);
  const totalBalanceUsd = Number(user.total_balance_usd || 0);
  const isSessionActive = Number(user.is_session_active || 0) === 1;

  return {
    userId: user.user_id || "",
    name,
    firstName,
    lastName,
    mobile: sanitizeMobile(user.mobile || ""),
    avatarUrl: sanitizeAvatarUrl(user.avatar_url || ""),
    accountRole: normalizeAccountRole(user.account_role || ""),
    accountStatus: normalizeAccountStatus(user.account_status || ""),
    kycStatus,
    kycStage,
    latestKycSubmissionStatus,
    kycSubmissionCount,
    authTag,
    isKycAuthenticated: kycStatus === "authenticated",
    isActiveSession: isSessionActive,
    kycUpdatedAt: user.kyc_updated_at || "",
    email: user.email || "",
    createdAt: user.created_at || "",
    totalBalanceUsd: Number.isFinite(totalBalanceUsd) ? Number(totalBalanceUsd.toFixed(2)) : 0,
    binaryTradeOutcomeMode: normalizeBinaryTradeOutcomeMode(user.binary_trade_outcome_mode || "auto"),
  };
}

function buildAdminDirectoryUserPayload(row) {
  if (!row) {
    return null;
  }

  return {
    ...buildUserPayload(row),
  };
}

function buildAdminUserUpdateLogPayload(row = {}) {
  return {
    logId: Number(row.id || 0),
    adminUserId: String(row.admin_user_id || ""),
    adminEmail: String(row.admin_email || ""),
    targetUserId: String(row.target_user_id || ""),
    actionType: String(row.action_type || ""),
    fieldName: String(row.field_name || ""),
    previousValue: String(row.previous_value || ""),
    nextValue: String(row.next_value || ""),
    note: String(row.note || ""),
    createdAt: String(row.created_at || ""),
  };
}

function createUniqueUserId() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = String(crypto.randomInt(100000, 1000000));
    if (!findUserByUserIdStatement.get(candidate)) {
      return candidate;
    }
  }
  throw new Error("Unable to generate a unique user ID right now.");
}

function createUniqueDepositRequestId() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = Number(`${Date.now()}${crypto.randomInt(10, 100)}`);
    if (!findDepositRequestByIdStatement.get(candidate)) {
      return candidate;
    }
  }

  const fallback = Date.now();
  if (!findDepositRequestByIdStatement.get(fallback)) {
    return fallback;
  }
  throw new Error("Could not create a unique deposit request ID right now.");
}

function createSessionForUser(userId) {
  const user = findUserByUserIdStatement.get(userId);
  if (!user) {
    throw new Error("User not found.");
  }

  const createdAt = getNow();
  const expiresAt = toIso(addDays(createdAt, SESSION_TTL_DAYS));
  const sessionToken = createStatelessSessionToken({ user, expiresAt });

  try {
    insertSessionStatement.run({
      userId,
      sessionTokenHash: createHash(sessionToken),
      expiresAt,
      createdAt: toIso(createdAt),
    });
  } catch {
    // Stateless token auth keeps working even if session-table writes are unavailable.
  }
  return sessionToken;
}

function verifyOtp({ email, purpose, otp }) {
  const otpRow = latestOtpStatement.get(email, purpose);
  if (!otpRow) {
    throw new Error("OTP not found. Please request a new one.");
  }
  if (isExpired(otpRow.expires_at)) {
    throw new Error("OTP expired. Please request a new one.");
  }
  if (otpRow.otp_hash !== createHash(otp)) {
    throw new Error("Invalid OTP. Please check the code and try again.");
  }
  consumeOtpStatement.run(toIso(getNow()), otpRow.id);
}

function requireSession(req, res, next) {
  const authorizationHeader = req.headers.authorization || "";
  const sessionToken = authorizationHeader.startsWith("Bearer ")
    ? authorizationHeader.slice(7).trim()
    : "";

  if (!sessionToken) {
    res.status(401).json({ error: "Missing session token." });
    return;
  }

  cleanupExpiredRecords();

  const session = findSessionStatement.get(createHash(sessionToken));
  if (session && !isExpired(session.session_expires_at)) {
    req.currentUser = {
      ...buildUserPayload(session),
    };
    req.sessionToken = sessionToken;
    next();
    return;
  }

  const parsedToken = parseStatelessSessionToken(sessionToken);
  if (!parsedToken || isExpired(parsedToken.expiresAt)) {
    res.status(401).json({ error: "Session expired. Please login again." });
    return;
  }

  const user = findUserByUserIdStatement.get(parsedToken.userId);
  if (user) {
    const expectedFingerprint = createSessionFingerprint(user);
    if (expectedFingerprint !== parsedToken.fingerprint) {
      res.status(401).json({ error: "Session expired. Please login again." });
      return;
    }

    req.currentUser = {
      ...buildUserPayload({
        ...user,
        is_session_active: 1,
      }),
    };
    req.sessionToken = sessionToken;
    next();
    return;
  }

  if (!parsedToken.tokenUser?.user_id) {
    res.status(401).json({ error: "Session expired. Please login again." });
    return;
  }

  req.currentUser = {
    ...buildUserPayload({
      ...parsedToken.tokenUser,
      is_session_active: 1,
    }),
  };
  req.sessionToken = sessionToken;
  next();
}

function requireAdminSession(req, res, next) {
  requireSession(req, res, () => {
    if (!hasAdminRole(req.currentUser?.accountRole)) {
      res.status(403).json({ error: "Admin access required." });
      return;
    }
    next();
  });
}

app.get("/api/health", (_req, res) => {
  cleanupExpiredRecords();
  res.json({ ok: true, app: APP_NAME });
});

app.get("/api/auth/public-config", (_req, res) => {
  res.json({
    googleClientId: GOOGLE_CLIENT_ID,
    publicAuthBaseUrl: PUBLIC_AUTH_BASE_URL,
  });
});

app.get("/api/home/content", handleHomeContentGet);

async function handleSignupSendOtp(req, res) {
  try {
    cleanupExpiredRecords();
    const email = normalizeEmail(req.body.email);
    assertValidEmail(email);

    if (findUserByEmailStatement.get(email)) {
      res.status(409).json({ error: "An account with this email already exists. Please login." });
      return;
    }

    const otp = generateOtp();
    const createdAt = getNow();
    clearOtpStatement.run(email, "signup");
    insertOtpStatement.run({
      email,
      purpose: "signup",
      otpHash: createHash(otp),
      expiresAt: toIso(addMinutes(createdAt, OTP_TTL_MINUTES)),
      createdAt: toIso(createdAt),
    });

    console.log(`\n🔑 [DEV MODE] SIGNUP OTP FOR ${email}: ${otp}\n`);

    try {
      await sendOtpEmail({ email, otp, purpose: "signup", name: req.body.name?.trim() });
      res.json(
        buildOtpDeliveryPayload({
          otp,
          successMessage: "OTP sent to your email.",
          fallbackMessage: "OTP email failed, so a dev OTP was returned for local testing.",
        }),
      );
    } catch (emailError) {
      console.error("⚠️ SMTP EMAIL FAILED:", emailError.message);
      const payload = buildOtpDeliveryPayload({
        emailError,
        otp,
        successMessage: "OTP sent to your email.",
        fallbackMessage: "OTP email failed, so a dev OTP was returned for local testing.",
      });
      if (!payload.ok) {
        res.status(payload.status).json({ error: payload.error });
        return;
      }
      res.json(payload);
    }
  } catch (error) {
    res.status(400).json({ error: normalizeEmailServiceError(error) });
  }
}

async function handleSignupComplete(req, res) {
  try {
    cleanupExpiredRecords();
    const name = req.body.name?.trim() || "";
    const email = normalizeEmail(req.body.email);
    const otp = req.body.otp?.trim() || "";
    const password = req.body.password || "";

    assertValidName(name);
    assertValidEmail(email);
    assertValidPassword(password);
    if (!otp) {
      throw new Error("Please enter the OTP.");
    }
    if (findUserByEmailStatement.get(email)) {
      res.status(409).json({ error: "An account with this email already exists. Please login." });
      return;
    }

    verifyOtp({ email, purpose: "signup", otp });

    const userId = createUniqueUserId();
    const splitName = splitFullName(name);
    const passwordHash = await bcrypt.hash(password, 12);
    const createdAt = toIso(getNow());

    createUserStatement.run({
      userId,
      name,
      firstName: splitName.firstName,
      lastName: splitName.lastName,
      mobile: "",
      avatarUrl: "",
      accountRole: "trader",
      accountStatus: "active",
      kycStatus: "pending",
      authTag: "kyc-pending",
      kycUpdatedAt: createdAt,
      email,
      passwordHash,
      createdAt,
    });

    await persistDbToBlobSafe("signup.complete");

    const sessionToken = createSessionForUser(userId);
    const createdUser = findUserByUserIdStatement.get(userId);
    res.json({
      message: "Account created successfully.",
      sessionToken,
      user: buildUserPayload(createdUser || { user_id: userId, name, email }),
    });
  } catch (error) {
    res.status(error?.statusCode || 400).json({ error: error.message || "Signup failed." });
  }
}

async function handleGoogleAuth(req, res) {
  try {
    if (!googleClient) {
      throw new Error("Google authentication is not configured on the server.");
    }
    
    cleanupExpiredRecords();
    const { token } = req.body;
    if (!token) throw new Error("Google token is required.");

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_IDS,
    });
    
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new Error("Invalid verification payload from Google.");
    }
    if (payload.email_verified === false) {
      throw new Error("Google account email is not verified.");
    }

    const email = normalizeEmail(payload.email);
    const name = payload.name || "Google User";

    let user = findUserByEmailStatement.get(email);
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      const userId = createUniqueUserId();
      const splitName = splitFullName(name);
      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
      const createdAt = toIso(getNow());

      createUserStatement.run({
        userId,
        name,
        firstName: splitName.firstName,
        lastName: splitName.lastName,
        mobile: "",
        avatarUrl: "",
        accountRole: "trader",
        accountStatus: "active",
        kycStatus: "pending",
        authTag: "kyc-pending",
        kycUpdatedAt: createdAt,
        email,
        passwordHash,
        createdAt,
      });
      user = findUserByEmailStatement.get(email);
    }

    const sessionToken = createSessionForUser(user.user_id);
    res.json({
      message: isNewUser ? "Account created successfully with Google." : "Login successful.",
      sessionToken,
      user: buildUserPayload(user),
      isNewUser,
    });
  } catch (error) {
    console.error("Google Auth Error:", error);
    res.status(400).json({ error: error.message || "Google authentication failed." });
  }
}

async function handleLogin(req, res) {
  try {
    cleanupExpiredRecords();
    const identifier = normalizeIdentifier(req.body.identifier);
    const password = req.body.password || "";

    assertValidPassword(password);
    const user = findUserByIdentifier(identifier);
    if (!user) {
      res.status(404).json({ error: "Account not found." });
      return;
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }

    const sessionToken = createSessionForUser(user.user_id);
    res.json({
      message: "Login successful.",
      sessionToken,
      user: buildUserPayload(user),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Login failed." });
  }
}

async function handleAdminSignup(req, res) {
  try {
    cleanupExpiredRecords();

    const name = sanitizeShortText(req.body?.name || "", 120);
    const email = normalizeEmail(req.body?.email || "");
    const phone = sanitizeMobile(req.body?.phone || "");
    const password = req.body?.password || "";
    const adminSignupKey = sanitizeShortText(req.body?.adminSignupKey || "", 240);
    const totalAdminUsers = Number(countAdminUsersStatement.get()?.total || 0);
    const signupKeyMatches = ADMIN_SIGNUP_KEY ? adminSignupKey === ADMIN_SIGNUP_KEY : false;

    if (totalAdminUsers > 0 && !ALLOW_PUBLIC_ADMIN_SIGNUP && !signupKeyMatches) {
      res.status(403).json({
        error: "Public admin signup is disabled. Provide a valid admin signup key.",
      });
      return;
    }
    if (ADMIN_SIGNUP_KEY && !signupKeyMatches) {
      res.status(403).json({ error: "Invalid admin signup key." });
      return;
    }

    assertValidName(name);
    assertValidEmail(email);
    assertValidPhone(phone);
    assertValidPassword(password);

    if (findUserByEmailStatement.get(email)) {
      res.status(409).json({ error: "An account with this email already exists. Please login." });
      return;
    }

    const userId = createUniqueUserId();
    const splitName = splitFullName(name);
    const passwordHash = await bcrypt.hash(password, 12);
    const createdAt = toIso(getNow());

    createUserStatement.run({
      userId,
      name,
      firstName: splitName.firstName,
      lastName: splitName.lastName,
      mobile: phone,
      avatarUrl: "",
      accountRole: "admin",
      accountStatus: "active",
      kycStatus: "authenticated",
      authTag: deriveAuthTag("authenticated"),
      kycUpdatedAt: createdAt,
      email,
      passwordHash,
      createdAt,
    });

    await persistDbToBlobSafe("admin.auth.signup");

    const createdAdmin = findUserByUserIdStatement.get(userId);
    const sessionToken = createSessionForUser(userId);

    res.json({
      message: "Admin account created successfully.",
      sessionToken,
      user: buildUserPayload(createdAdmin || { user_id: userId, name, email, account_role: "admin" }),
    });
  } catch (error) {
    res.status(error?.statusCode || 400).json({ error: error.message || "Admin signup failed." });
  }
}

async function handleAdminLogin(req, res) {
  try {
    cleanupExpiredRecords();

    const identifier = sanitizeShortText(
      req.body?.identifier || req.body?.email || "",
      160,
    );
    const password = req.body?.password || "";

    if (!identifier) {
      throw new Error("Email or user ID is required.");
    }
    assertValidPassword(password);

    const rateLimitState = getAdminLoginRateLimitState(req, identifier);
    if (rateLimitState.isBlocked) {
      const retryMinutes = Math.ceil(rateLimitState.retryAfterMs / 60000);
      res.status(429).json({
        error: `Too many failed attempts. Try again in ${retryMinutes} minute${retryMinutes > 1 ? "s" : ""}.`,
      });
      return;
    }

    const user = findUserByIdentifier(identifier);
    if (!user) {
      recordAdminLoginFailure(req, identifier);
      res.status(401).json({ error: "Invalid admin credentials." });
      return;
    }
    if (!hasAdminRole(user.account_role || "")) {
      recordAdminLoginFailure(req, identifier);
      res.status(401).json({ error: "Invalid admin credentials." });
      return;
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      recordAdminLoginFailure(req, identifier);
      res.status(401).json({ error: "Invalid admin credentials." });
      return;
    }

    clearAdminLoginFailures(req, identifier);
    const sessionToken = createSessionForUser(user.user_id);
    res.json({
      message: "Admin login successful.",
      sessionToken,
      user: buildUserPayload(user),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Admin login failed." });
  }
}

function handleAdminSession(req, res) {
  res.json({ user: req.currentUser });
}

function handleAdminLogout(req, res) {
  deleteSessionStatement.run(createHash(req.sessionToken));
  res.json({ message: "Admin logged out." });
}

function handleSession(req, res) {
  res.json({ user: req.currentUser });
}

function handleLogout(req, res) {
  deleteSessionStatement.run(createHash(req.sessionToken));
  res.json({ message: "Logged out." });
}

async function handlePasswordLookup(req, res) {
  try {
    cleanupExpiredRecords();
    const identifier = normalizeIdentifier(req.body.identifier);
    const user = findUserByIdentifier(identifier);

    if (!user) {
      res.status(404).json({ error: "Account not found." });
      return;
    }

    const otp = generateOtp();
    const createdAt = getNow();

    clearOtpStatement.run(user.email, "reset");
    clearPasswordResetTokenStatement.run(user.email);

    insertOtpStatement.run({
      email: user.email,
      purpose: "reset",
      otpHash: createHash(otp),
      expiresAt: toIso(addMinutes(createdAt, OTP_TTL_MINUTES)),
      createdAt: toIso(createdAt),
    });

    console.log(`\n🔑 [DEV MODE] RESET OTP FOR ${user.email}: ${otp}\n`);
    try {
      await sendOtpEmail({ email: user.email, otp, purpose: "reset", name: user.name });
      res.json({
        ...buildOtpDeliveryPayload({
          otp,
          successMessage: "Account found. OTP sent to your email.",
          fallbackMessage: "OTP email failed, so a dev OTP was returned for local testing.",
        }),
        email: user.email,
        userId: user.user_id,
        name: user.name,
      });
    } catch (emailError) {
      console.error("⚠️ SMTP EMAIL FAILED:", emailError.message);
      const payload = buildOtpDeliveryPayload({
        emailError,
        otp,
        successMessage: "Account found. OTP sent to your email.",
        fallbackMessage: "OTP email failed, so a dev OTP was returned for local testing.",
      });
      if (!payload.ok) {
        res.status(payload.status).json({ error: payload.error });
        return;
      }
      res.json({
        ...payload,
        email: user.email,
        userId: user.user_id,
        name: user.name,
      });
    }
  } catch (error) {
    res.status(400).json({ error: normalizeEmailServiceError(error) });
  }
}

function handlePasswordVerifyOtp(req, res) {
  try {
    cleanupExpiredRecords();
    const identifier = normalizeIdentifier(req.body.identifier);
    const otp = req.body.otp?.trim() || "";
    const user = findUserByIdentifier(identifier);

    if (!user) {
      res.status(404).json({ error: "Account not found." });
      return;
    }
    if (!otp) {
      throw new Error("Please enter the OTP.");
    }

    verifyOtp({ email: user.email, purpose: "reset", otp });

    const resetToken = generateOpaqueToken();
    const createdAt = getNow();
    insertPasswordResetTokenStatement.run({
      email: user.email,
      resetTokenHash: createHash(resetToken),
      expiresAt: toIso(addMinutes(createdAt, RESET_TOKEN_TTL_MINUTES)),
      createdAt: toIso(createdAt),
    });

    res.json({
      message: "OTP verified. You can create a new password now.",
      resetToken,
      user: {
        userId: user.user_id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "OTP verification failed." });
  }
}

async function handlePasswordReset(req, res) {
  try {
    cleanupExpiredRecords();
    const resetToken = req.body.resetToken?.trim() || "";
    const password = req.body.password || "";
    const confirmPassword = req.body.confirmPassword || "";

    if (!resetToken) {
      throw new Error("Reset token is missing.");
    }
    assertValidPassword(password);
    if (password !== confirmPassword) {
      throw new Error("Passwords do not match.");
    }

    const tokenRow = latestPasswordResetTokenStatement.get(createHash(resetToken));
    if (!tokenRow || isExpired(tokenRow.expires_at)) {
      throw new Error("Reset session expired. Please start the forgot password flow again.");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    updateUserPasswordStatement.run(passwordHash, tokenRow.email);
    consumePasswordResetTokenStatement.run(toIso(getNow()), tokenRow.id);

    const user = findUserByEmailStatement.get(tokenRow.email);
    if (user) {
      deleteUserSessionsStatement.run(user.user_id);
    }

    res.json({ message: "Password updated. Please login with the new password." });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not reset password." });
  }
}

async function handleProfileUpdate(req, res) {
  try {
    cleanupExpiredRecords();
    const firstName = normalizePersonName(req.body.firstName || "");
    const lastName = normalizePersonName(req.body.lastName || "");
    const mobile = sanitizeMobile(req.body.mobile || "");
    const avatarUrl = sanitizeAvatarUrl(req.body.avatarUrl || "");

    if (!firstName) {
      throw new Error("First name is required.");
    }
    if (!lastName) {
      throw new Error("Last name is required.");
    }
    if (mobile && !/^\+?[0-9]{6,16}$/.test(mobile)) {
      throw new Error("Please enter a valid mobile number.");
    }
    if (avatarUrl.length > 1_500_000) {
      throw new Error("Profile photo is too large.");
    }

    const displayName = buildDisplayName(firstName, lastName, req.currentUser?.name || "");
    updateUserProfileStatement.run({
      userId: req.currentUser.userId,
      name: displayName || "Trader",
      firstName,
      lastName,
      mobile,
      avatarUrl,
    });

    const updatedUser = findUserByUserIdStatement.get(req.currentUser.userId);
    res.json({
      message: "Profile updated successfully.",
      user: buildUserPayload(updatedUser),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not update profile." });
  }
}

async function handlePasswordChange(req, res) {
  try {
    cleanupExpiredRecords();
    const currentPassword = req.body.currentPassword || "";
    const newPassword = req.body.newPassword || "";
    const confirmPassword = req.body.confirmPassword || "";

    if (!currentPassword) {
      throw new Error("Current password is required.");
    }
    assertValidPassword(newPassword);
    if (newPassword !== confirmPassword) {
      throw new Error("New password and confirm password do not match.");
    }

    const currentUser = findUserByUserIdStatement.get(req.currentUser.userId);
    if (!currentUser) {
      throw new Error("User not found.");
    }

    const passwordMatches = await bcrypt.compare(currentPassword, currentUser.password_hash);
    if (!passwordMatches) {
      res.status(401).json({ error: "Current password is incorrect." });
      return;
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    updateUserPasswordByUserIdStatement.run(newPasswordHash, req.currentUser.userId);

    res.json({ message: "Password updated successfully." });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not update password." });
  }
}

function handleKycStatus(req, res) {
  try {
    cleanupExpiredRecords();
    const currentUser = findUserByUserIdStatement.get(req.currentUser.userId);
    const latestSubmission = findLatestKycSubmissionByUserStatement.get(req.currentUser.userId);

    res.json({
      user: buildUserPayload(currentUser || req.currentUser),
      kyc: buildKycSubmissionPayload(latestSubmission),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not read KYC status." });
  }
}

async function handleKycSubmit(req, res) {
  try {
    cleanupExpiredRecords();
    const existingUser = findUserByUserIdStatement.get(req.currentUser.userId);
    const currentKycStatus = normalizeKycStatus(existingUser?.kyc_status || req.currentUser?.kycStatus || "");
    if (currentKycStatus === "authenticated") {
      throw new Error("KYC is already approved. New submission is not allowed.");
    }

    const fullName = normalizePersonName(req.body.fullName || "");
    const certification = normalizeCertification(req.body.certification || "");
    const ssn = sanitizeShortText(req.body.ssn || "", 60);
    const frontFileName = sanitizeShortText(req.body.frontFileName || "front-file", 180);
    const backFileName = sanitizeShortText(req.body.backFileName || "back-file", 180);
    const frontFileData = String(req.body.frontFileData || "").trim();
    const backFileData = String(req.body.backFileData || "").trim();

    if (!fullName || fullName.length < 3) {
      throw new Error("Full name must match your NID/Passport/Driving License.");
    }

    if (!KYC_CERTIFICATIONS.has(certification)) {
      throw new Error("Please select NID, Passport, or Driving License.");
    }

    if (!ssn || ssn.length < 4) {
      throw new Error("Please enter your serial number (SSN).");
    }

    if (!frontFileData || !backFileData) {
      throw new Error("Front part and back part documents are required.");
    }

    const frontFileInfo = parseKycFileData(frontFileData, "Front part");
    const backFileInfo = parseKycFileData(backFileData, "Back part");

    if (frontFileInfo.bytes > TEST_KYC_FILE_MAX_BYTES || backFileInfo.bytes > TEST_KYC_FILE_MAX_BYTES) {
      throw new Error(
        "Testing phase: upload a smaller file now. Larger upload sizes will be enabled with premium backend database upgrades.",
      );
    }

    const submittedAt = toIso(getNow());
    insertKycSubmissionStatement.run({
      userId: req.currentUser.userId,
      fullName,
      certification,
      ssn,
      frontFileName,
      frontFileData,
      backFileName,
      backFileData,
      status: "pending",
      note: "",
      submittedAt,
      reviewedAt: null,
      reviewedBy: null,
    });

    updateUserKycStatusStatement.run({
      userId: req.currentUser.userId,
      kycStatus: "pending",
      authTag: deriveAuthTag("pending"),
      kycUpdatedAt: submittedAt,
    });

    await persistDbToBlobSafe("kyc.submit");

    const updatedUser = findUserByUserIdStatement.get(req.currentUser.userId);
    const latestSubmission = findLatestKycSubmissionByUserStatement.get(req.currentUser.userId);
    const submissionPayload = buildKycSubmissionPayload(latestSubmission);
    const userPayload = buildUserPayload(updatedUser || req.currentUser);
    if (submissionPayload) {
      const mail = buildAdminKycSubmissionMailPayload({
        submission: submissionPayload,
        user: userPayload,
      });
      sendAdminNotificationEmail({
        ...mail,
        metaLabel: "admin-kyc-submission",
      });
    }

    res.json({
      message: "Submitted successfully. KYC is now pending admin review.",
      user: buildUserPayload(updatedUser || req.currentUser),
      kyc: submissionPayload,
    });
  } catch (error) {
    res.status(error?.statusCode || 400).json({ error: error.message || "Could not submit KYC." });
  }
}

function handleAdminKycList(req, res) {
  try {
    cleanupExpiredRecords();
    const includeSensitiveMedia = normalizeBoolean(
      req.body?.includeSensitiveMedia ?? req.query?.includeSensitiveMedia,
      false,
    );
    const rows = listLatestKycSubmissionsStatement.all();
    const totalAccounts = countUsersStatement.get()?.total || 0;
    const totalUsers = countPlatformUsersStatement.get()?.total || 0;
    const totalAdminUsers = countAdminUsersStatement.get()?.total || 0;
    const pending = countPlatformUsersByKycStatusStatement.get("pending")?.total || 0;
    const authenticated = countPlatformUsersByKycStatusStatement.get("authenticated")?.total || 0;
    const rejected = countPlatformUsersByKycStatusStatement.get("rejected")?.total || 0;
    const totalKycRequests = countPlatformKycSubmissionsTotalStatement.get()?.total || 0;
    const pendingKycRequests = countPlatformKycSubmissionsByStatusStatement.get("pending")?.total || 0;
    const authenticatedKycRequests = countPlatformKycSubmissionsByStatusStatement.get("authenticated")?.total || 0;
    const rejectedKycRequests = countPlatformKycSubmissionsByStatusStatement.get("rejected")?.total || 0;

    res.json({
      stats: {
        totalAccounts,
        totalUsers,
        totalPlatformUsers: totalUsers,
        totalAdminUsers,
        pendingVerifications: pending,
        authenticatedUsers: authenticated,
        rejectedUsers: rejected,
        totalKycRequests,
        pendingKycRequests,
        authenticatedKycRequests,
        rejectedKycRequests,
      },
      requests: rows.map((row) => buildKycAdminPayload(row, { includeSensitiveMedia })),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not load KYC requests." });
  }
}

function handleAdminKycRequestDetail(req, res) {
  try {
    cleanupExpiredRecords();
    const requestId = Number(req.body?.requestId || req.query?.requestId || req.params?.requestId || 0);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new Error("Valid requestId is required.");
    }

    const row = findKycSubmissionWithUserMediaByIdStatement.get(requestId);
    if (!row) {
      res.status(404).json({ error: "KYC request not found." });
      return;
    }

    res.json({
      request: buildKycAdminPayload(row, { includeSensitiveMedia: true }),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not load KYC request detail." });
  }
}

function handleAdminUsersList(req, res) {
  try {
    cleanupExpiredRecords();
    const rawStatus = String(req.body?.kycStatus || req.query?.kycStatus || "")
      .trim()
      .toLowerCase();
    const filterStatus =
      rawStatus === "pending" || rawStatus === "authenticated" || rawStatus === "rejected"
        ? rawStatus
        : "";
    const includeAdmins = normalizeBoolean(req.body?.includeAdmins ?? req.query?.includeAdmins, false);
    const nowIso = toIso(getNow());

    const userRows = includeAdmins
      ? listAllUsersForAdminStatement.all({ nowIso })
      : listPlatformUsersStatement.all({ nowIso });
    const allUsers = userRows.map((row) => buildAdminDirectoryUserPayload(row)).filter(Boolean);
    const users = filterStatus ? allUsers.filter((row) => row.kycStatus === filterStatus) : allUsers;
    const totalUsers = countPlatformUsersStatement.get()?.total || 0;
    const activeUsers = countActivePlatformUsersStatement.get(nowIso)?.total || 0;

    res.json({
      stats: {
        totalAccounts: countUsersStatement.get()?.total || 0,
        totalUsers,
        totalPlatformUsers: totalUsers,
        totalAdminUsers: countAdminUsersStatement.get()?.total || 0,
        activeUsers,
        pendingVerifications: countPlatformUsersByKycStatusStatement.get("pending")?.total || 0,
        authenticatedUsers: countPlatformUsersByKycStatusStatement.get("authenticated")?.total || 0,
        rejectedUsers: countPlatformUsersByKycStatusStatement.get("rejected")?.total || 0,
      },
      filter: filterStatus || "all",
      includeAdmins,
      users,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not load users." });
  }
}

function handleAdminUserDetail(req, res) {
  try {
    cleanupExpiredRecords();
    const userId = sanitizeShortText(req.body?.userId || req.params?.userId || "", 24);
    if (!userId) {
      throw new Error("Valid userId is required.");
    }

    const userRow = findAdminUserByUserIdStatement.get({ userId, nowIso: toIso(getNow()) });
    if (!userRow) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    const kycHistory = listUserKycHistoryForAdminStatement
      .all(userId)
      .map((row) => buildKycSubmissionPayload(row, { includeSensitiveMedia: true }))
      .filter(Boolean);
    const depositHistory = listUserDepositHistoryForAdminStatement
      .all(userId)
      .map((row) => buildDepositRequestPayload(row, { includeSensitiveMedia: true }))
      .filter(Boolean);
    const adminUpdateHistory = listAdminUserUpdateLogsByTargetStatement
      .all(userId)
      .map((row) => buildAdminUserUpdateLogPayload(row))
      .filter(Boolean);

    res.json({
      user: buildAdminDirectoryUserPayload(userRow),
      wallet: readDashboardWallet(userId),
      history: {
        kyc: kycHistory,
        deposit: depositHistory,
        adminUpdates: adminUpdateHistory,
      },
      latest: {
        kyc: kycHistory[0] || null,
        deposit: depositHistory[0] || null,
        adminUpdate: adminUpdateHistory[0] || null,
      },
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not load user details." });
  }
}

async function handleAdminUserDelete(req, res) {
  try {
    cleanupExpiredRecords();
    const userId = sanitizeShortText(req.body?.userId || "", 24);
    if (!userId) {
      throw new Error("Valid userId is required.");
    }

    const userRow = findUserByUserIdStatement.get(userId);
    if (!userRow) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    if (hasAdminRole(userRow.account_role || "")) {
      res.status(403).json({ error: "Admin accounts cannot be deleted from user management." });
      return;
    }
    if (userId === req.currentUser?.userId) {
      res.status(403).json({ error: "You cannot delete your own account." });
      return;
    }

    const removeTransaction = db.transaction(() => {
      deleteUserSessionsStatement.run(userId);
      deleteUserWalletBalancesStatement.run(userId);
      deleteUserWalletDetailRowsStatement.run(userId);
      deleteUserKycSubmissionsStatement.run(userId);
      deleteUserDepositRequestsStatement.run(userId);
      deleteUserAdminUserUpdateLogsStatement.run(userId);
      deleteOtpByEmailStatement.run(userRow.email);
      clearPasswordResetTokenStatement.run(userRow.email);
      deleteUserByUserIdStatement.run(userId);
    });

    removeTransaction();
    await persistDbToBlobSafe("admin.user.delete");

    res.json({
      message: "User deleted successfully.",
      user: {
        userId,
        email: userRow.email || "",
        name: userRow.name || "",
      },
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not delete user." });
  }
}

async function handleAdminUserUpdate(req, res) {
  try {
    cleanupExpiredRecords();
    const userId = sanitizeShortText(req.body?.userId || "", 24);
    if (!userId) {
      throw new Error("Valid userId is required.");
    }

    const nowIso = toIso(getNow());
    const existingUser = findAdminUserByUserIdStatement.get({ userId, nowIso });
    if (!existingUser) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    const name = sanitizeShortText(req.body?.name || existingUser.name || "", 120);
    const firstName = sanitizeShortText(req.body?.firstName || existingUser.first_name || "", 80);
    const lastName = sanitizeShortText(req.body?.lastName || existingUser.last_name || "", 80);
    const mobile = sanitizeMobile(req.body?.mobile || existingUser.mobile || "");
    const avatarUrl = sanitizeAvatarUrl(req.body?.avatarUrl || existingUser.avatar_url || "");
    const accountRole = normalizeAccountRole(req.body?.accountRole || existingUser.account_role || "trader");
    const accountStatus = normalizeAccountStatus(req.body?.accountStatus || existingUser.account_status || "active");
    const email = normalizeEmail(req.body?.email || existingUser.email || "");
    const kycStatus = normalizeKycStatus(req.body?.kycStatus || existingUser.kyc_status || "pending");
    const binaryTradeOutcomeMode = normalizeBinaryTradeOutcomeMode(
      req.body?.binaryTradeOutcomeMode ?? req.body?.binary_trade_outcome_mode ?? existingUser.binary_trade_outcome_mode ?? "auto",
    );
    const authTag = deriveAuthTag(kycStatus);

    assertValidName(name);
    assertValidEmail(email);

    const sameEmailOwner = findUserByEmailStatement.get(email);
    if (sameEmailOwner && sameEmailOwner.user_id !== userId) {
      throw new Error("This email is already used by another user.");
    }

    const nextWalletBalances = Array.isArray(req.body?.walletBalances) ? req.body.walletBalances : null;
    const auditEntries = [];
    const addAuditEntry = ({ actionType, fieldName, previousValue, nextValue, note = "" }) => {
      const prev = String(previousValue ?? "");
      const next = String(nextValue ?? "");
      if (prev === next && !note) {
        return;
      }
      auditEntries.push({
        actionType: sanitizeShortText(actionType || "user_update", 60),
        fieldName: sanitizeShortText(fieldName || "", 80),
        previousValue: sanitizeShortText(prev, 300),
        nextValue: sanitizeShortText(next, 300),
        note: sanitizeShortText(note, 300),
      });
    };

    addAuditEntry({
      actionType: "profile_update",
      fieldName: "name",
      previousValue: existingUser.name || "",
      nextValue: name,
    });
    addAuditEntry({
      actionType: "profile_update",
      fieldName: "first_name",
      previousValue: existingUser.first_name || "",
      nextValue: firstName,
    });
    addAuditEntry({
      actionType: "profile_update",
      fieldName: "last_name",
      previousValue: existingUser.last_name || "",
      nextValue: lastName,
    });
    addAuditEntry({
      actionType: "profile_update",
      fieldName: "mobile",
      previousValue: existingUser.mobile || "",
      nextValue: mobile,
    });
    addAuditEntry({
      actionType: "profile_update",
      fieldName: "avatar_url",
      previousValue: existingUser.avatar_url || "",
      nextValue: avatarUrl,
    });
    addAuditEntry({
      actionType: "profile_update",
      fieldName: "account_role",
      previousValue: normalizeAccountRole(existingUser.account_role || "trader"),
      nextValue: accountRole,
    });
    addAuditEntry({
      actionType: "profile_update",
      fieldName: "account_status",
      previousValue: normalizeAccountStatus(existingUser.account_status || "active"),
      nextValue: accountStatus,
    });
    addAuditEntry({
      actionType: "profile_update",
      fieldName: "email",
      previousValue: existingUser.email || "",
      nextValue: email,
    });
    addAuditEntry({
      actionType: "profile_update",
      fieldName: "kyc_status",
      previousValue: normalizeKycStatus(existingUser.kyc_status || "pending"),
      nextValue: kycStatus,
    });
    addAuditEntry({
      actionType: "binary_outcome_update",
      fieldName: "binary_trade_outcome_mode",
      previousValue: normalizeBinaryTradeOutcomeMode(existingUser.binary_trade_outcome_mode || "auto"),
      nextValue: binaryTradeOutcomeMode,
    });

    const updateTransaction = db.transaction(() => {
      updateUserProfileByAdminStatement.run({
        userId,
        name,
        firstName,
        lastName,
        mobile,
        avatarUrl,
        accountRole,
        accountStatus,
        email,
        kycStatus,
        authTag,
        kycUpdatedAt: nowIso,
        binaryTradeOutcomeMode,
      });

      if (nextWalletBalances) {
        for (const walletItem of nextWalletBalances) {
          const symbol = normalizeDashboardWalletSymbol(walletItem?.symbol || "");
          const assetName = sanitizeShortText(walletItem?.name || buildWalletSymbolLabel(symbol), 80);
          const totalUsd = Number(Number(walletItem?.totalUsd || 0).toFixed(8));

          if (!symbol) {
            continue;
          }
          if (!Number.isFinite(totalUsd) || totalUsd < 0) {
            throw new Error(`Wallet amount for ${symbol} must be a valid non-negative number.`);
          }

          const matchedSummary = findDashboardWalletSummaryByAnySymbol(userId, symbol);
          if (matchedSummary && matchedSummary.symbol !== symbol) {
            migrateDashboardWalletSymbolForUser({
              userId,
              fromSymbol: matchedSummary.symbol,
              toSymbol: symbol,
              nowIso,
            });
          }
          const matchedDetail = findDashboardWalletDetailByAnySymbol(userId, symbol);
          if (matchedDetail && matchedDetail.symbol !== symbol) {
            migrateDashboardWalletSymbolForUser({
              userId,
              fromSymbol: matchedDetail.symbol,
              toSymbol: symbol,
              nowIso,
            });
          }

          ensureWalletDetailMirroredFromSummary({
            userId,
            assetSymbol: symbol,
            assetName,
            nowIso,
          });

          const detail = findWalletDetailByUserAssetStatement.get(userId, symbol);
          const lockedUsd = Number(detail?.locked_usd || 0);
          const rewardEarnedUsd = Number(detail?.reward_earned_usd || 0);
          if (totalUsd < lockedUsd) {
            throw new Error(`Wallet amount for ${symbol} cannot be less than locked balance (${lockedUsd.toFixed(2)}).`);
          }
          const availableUsd = Number((totalUsd - lockedUsd).toFixed(8));
          updateWalletDetailStatement.run({
            userId,
            assetSymbol: symbol,
            availableUsd,
            lockedUsd: Number(lockedUsd.toFixed(8)),
            rewardEarnedUsd: Number(rewardEarnedUsd.toFixed(8)),
            updatedAt: nowIso,
          });

          const existingSummary = findWalletBalanceByUserAssetStatement.get(userId, symbol);
          const previousTotalUsd = Number(existingSummary?.total_usd || 0);
          setWalletBalanceStatement.run({
            userId,
            assetSymbol: symbol,
            assetName,
            totalUsd,
            updatedAt: nowIso,
          });

          addAuditEntry({
            actionType: "wallet_update",
            fieldName: `wallet.${symbol}.total_usd`,
            previousValue: previousTotalUsd.toFixed(8),
            nextValue: totalUsd.toFixed(8),
          });
        }
      }

      for (const entry of auditEntries) {
        insertAdminUserUpdateLogStatement.run({
          adminUserId: String(req.currentUser?.userId || ""),
          adminEmail: String(req.currentUser?.email || ""),
          targetUserId: userId,
          actionType: entry.actionType,
          fieldName: entry.fieldName,
          previousValue: entry.previousValue,
          nextValue: entry.nextValue,
          note: entry.note,
          createdAt: nowIso,
        });
      }
    });

    updateTransaction();
    await persistDbToBlobSafe("admin.user.update");

    const updatedUser = findAdminUserByUserIdStatement.get({ userId, nowIso: toIso(getNow()) });
    const kycHistory = listUserKycHistoryForAdminStatement
      .all(userId)
      .map((row) => buildKycSubmissionPayload(row, { includeSensitiveMedia: true }))
      .filter(Boolean);
    const depositHistory = listUserDepositHistoryForAdminStatement
      .all(userId)
      .map((row) => buildDepositRequestPayload(row, { includeSensitiveMedia: true }))
      .filter(Boolean);
    const adminUpdateHistory = listAdminUserUpdateLogsByTargetStatement
      .all(userId)
      .map((row) => buildAdminUserUpdateLogPayload(row))
      .filter(Boolean);

    res.json({
      message: "User profile updated successfully.",
      user: buildAdminDirectoryUserPayload(updatedUser),
      wallet: readDashboardWallet(userId),
      history: {
        kyc: kycHistory,
        deposit: depositHistory,
        adminUpdates: adminUpdateHistory,
      },
      latest: {
        kyc: kycHistory[0] || null,
        deposit: depositHistory[0] || null,
        adminUpdate: adminUpdateHistory[0] || null,
      },
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not update user profile." });
  }
}

async function handleAdminKycReview(req, res) {
  try {
    cleanupExpiredRecords();
    const requestId = Number(req.body.requestId);
    const decision = normalizeKycStatus(req.body.decision || "");
    const note = sanitizeShortText(req.body.note || "", 300);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new Error("Valid requestId is required.");
    }
    if (decision !== "authenticated" && decision !== "rejected" && decision !== "pending") {
      throw new Error("Decision must be authenticated, rejected, or pending.");
    }
    if (decision === "rejected" && !note) {
      throw new Error("Reject reason is required.");
    }

    const submission = findKycSubmissionByIdStatement.get(requestId);
    if (!submission) {
      res.status(404).json({ error: "KYC request not found." });
      return;
    }

    const submissionUser = findUserByUserIdStatement.get(submission.user_id);
    if (!submissionUser) {
      res.status(404).json({ error: "KYC request user not found." });
      return;
    }
    if (hasAdminRole(submissionUser.account_role || "")) {
      res.status(403).json({ error: "Admin account KYC cannot be reviewed from this queue." });
      return;
    }

    const reviewedAt = toIso(getNow());
    updateKycSubmissionReviewStatement.run({
      id: requestId,
      status: decision,
      note,
      reviewedAt,
      reviewedBy: "admin",
    });

    updateUserKycStatusStatement.run({
      userId: submission.user_id,
      kycStatus: decision,
      authTag: deriveAuthTag(decision),
      kycUpdatedAt: reviewedAt,
    });

    await persistDbToBlobSafe("admin.kyc.review");

    const updatedUser = findUserByUserIdStatement.get(submission.user_id);
    const reviewedRequest = findKycSubmissionWithUserByIdStatement.get(requestId);
    if (decision === "authenticated" || decision === "rejected") {
      const userPayload = buildUserPayload(updatedUser || { user_id: submission.user_id });
      const requestPayload = buildKycAdminPayload(reviewedRequest);
      if (userPayload?.email && requestPayload) {
        const mail = buildUserKycDecisionMailPayload({
          request: requestPayload,
          decision,
        });
        sendUserNotificationEmail({
          toEmail: userPayload.email,
          ...mail,
          metaLabel: `user-kyc-${decision}`,
        });
      }
    }

    const responseMessageByDecision = {
      authenticated: "KYC approved successfully.",
      rejected: "KYC request rejected.",
      pending: "KYC request moved back to pending.",
    };

    res.json({
      message: responseMessageByDecision[decision] || "KYC request updated.",
      user: buildUserPayload(updatedUser || { user_id: submission.user_id }),
      request: buildKycAdminPayload(reviewedRequest),
    });
  } catch (error) {
    res.status(error?.statusCode || 400).json({ error: error.message || "Could not review KYC request." });
  }
}

function handleDashboardSnapshot(req, res) {
  try {
    cleanupExpiredRecords();
    const currentUser = findUserByUserIdStatement.get(req.currentUser.userId);
    const dashboardUser = buildUserPayload(currentUser || req.currentUser);
    const noticeState = resolveNoticesForUser(dashboardUser);
    const wallet = readDashboardWallet(req.currentUser.userId);
    const depositAssets = listEnabledDepositAssetsStatement
      .all()
      .map((row) => buildDepositAssetPayload(row))
      .filter(Boolean);
    const prioritySymbols = buildDashboardMarketPrioritySymbols(depositAssets);
    const launchpad = getLaunchpadDashboardSnapshot({ userId: req.currentUser.userId });

    res.json({
      user: dashboardUser,
      notice: noticeState.primary,
      notices: {
        items: noticeState.items,
        unreadCount: noticeState.unreadCount,
      },
      wallet,
      deposit: {
        assets: depositAssets,
      },
      market: {
        prioritySymbols,
      },
      launchpad,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not load dashboard snapshot." });
  }
}

async function handleDepositCreate(req, res) {
  try {
    await syncDepositStateFromBlobSafe({ context: "deposit.create.pre" });
    cleanupExpiredRecords();

    const assetId = Number(req.body.assetId);
    const amountUsd = normalizeUsdAmount(req.body.amountUsd);
    const screenshotFileName = sanitizeShortText(req.body.screenshotFileName || "transaction-screenshot", 180);
    const screenshotFileData = String(req.body.screenshotFileData || "").trim();

    if (!Number.isInteger(assetId) || assetId <= 0) {
      throw new Error("Please select a crypto asset first.");
    }
    if (!screenshotFileData) {
      throw new Error("Transaction screenshot is required.");
    }

    parseDepositScreenshotData(screenshotFileData);

    const asset = findDepositAssetByIdStatement.get(assetId);
    if (!asset || Number(asset.is_enabled || 0) !== 1) {
      throw new Error("Selected asset is not available for deposit right now.");
    }

    const minAmountUsd = Number(asset.min_amount_usd || DEPOSIT_MIN_USD_DEFAULT);
    const maxAmountUsd = Number(asset.max_amount_usd || DEPOSIT_MAX_USD_DEFAULT);
    if (amountUsd < minAmountUsd || amountUsd > maxAmountUsd) {
      throw new Error(`Amount must be between ${minAmountUsd} and ${maxAmountUsd} USD.`);
    }

    const submittedAt = toIso(getNow());
    const requestId = createUniqueDepositRequestId();
    insertDepositRequestStatement.run({
      requestId,
      userId: req.currentUser.userId,
      assetId,
      assetSymbol: normalizeAssetSymbol(asset.symbol || ""),
      assetName: sanitizeShortText(asset.name || "", 80),
      chainName: sanitizeShortText(asset.chain_name || "", 80),
      rechargeAddressSnapshot: sanitizeShortText(asset.recharge_address || "", 180),
      amountUsd,
      screenshotFileName,
      screenshotFileData,
      status: "pending",
      note: "",
      submittedAt,
      reviewedAt: null,
      reviewedBy: null,
    });

    await persistDbToBlobSafe("deposit.create");

    const createdRequest = findDepositRequestByIdStatement.get(requestId);
    const requestPayload = buildDepositRequestPayload(createdRequest);
    const userPayload = buildUserPayload(req.currentUser || {});
    if (requestPayload) {
      const mail = buildAdminDepositRequestMailPayload({
        request: requestPayload,
        user: userPayload,
      });
      sendAdminNotificationEmail({
        ...mail,
        metaLabel: "admin-deposit-request",
      });
    }
    res.json({
      message: "Deposit request submitted successfully. Admin review pending.",
      request: requestPayload,
    });
  } catch (error) {
    res.status(error?.statusCode || 400).json({ error: error.message || "Could not submit deposit request." });
  }
}

async function handleDepositRecords(req, res) {
  try {
    await syncDepositStateFromBlobSafe({ context: "deposit.records.pre" });
    cleanupExpiredRecords();
    const rows = listDepositRequestsByUserStatement.all(req.currentUser.userId);
    res.json({
      records: rows.map((row) => buildDepositRequestPayload(row)).filter(Boolean),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not load deposit records." });
  }
}

function handleAdminNoticeGet(_req, res) {
  try {
    cleanupExpiredRecords();
    const nowIso = toIso(getNow());
    const latestNoticeRow = getLatestActiveNoticeStatement.get({ nowIso });
    const latestNoticeTargetUsers = latestNoticeRow ? resolveNoticeTargetUsers(Number(latestNoticeRow.id || 0)) : [];
    const notice = buildNoticePayload(latestNoticeRow, { targetUserIds: latestNoticeTargetUsers });
    const allRows = listAllNoticesStatement.all();
    const activeCount = allRows.filter((row) => Number(row?.is_active || 0) === 1).length;
    res.json({
      notice,
      stats: {
        total: allRows.length,
        active: activeCount,
      },
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not load admin notice." });
  }
}

async function handleAdminNoticeUpdate(req, res) {
  try {
    cleanupExpiredRecords();
    const message = sanitizeShortText(req.body.message || "", 700);
    if (message.length < 6) {
      throw new Error("Notice must contain at least 6 characters.");
    }

    const nowIso = toIso(getNow());
    const updatedBy = sanitizeShortText(req.currentUser?.userId || "admin", 40) || "admin";
    const updateNoticeTransaction = db.transaction(() => {
      clearActiveNoticesStatement.run({
        updatedBy,
        updatedAt: nowIso,
      });
      const info = insertNoticeStatement.run({
        title: sanitizeShortText(req.body?.title || "System Notice", 120) || "System Notice",
        message,
        severity: "info",
        priority: 50,
        startsAt: nowIso,
        expiresAt: "",
        isActive: 1,
        isDismissible: 1,
        targetMode: "all",
        targetKycStatus: "",
        createdBy: updatedBy,
        updatedBy,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      return Number(info.lastInsertRowid || 0);
    });

    const noticeId = updateNoticeTransaction();
    await persistDbToBlobSafe("admin.notice.update");
    const latestNotice = noticeId ? findNoticeByIdStatement.get(noticeId) : null;
    const targetUsers = noticeId ? resolveNoticeTargetUsers(noticeId) : [];
    res.json({
      message: "Notice published successfully.",
      notice: buildNoticePayload(latestNotice, { targetUserIds: targetUsers }),
    });
  } catch (error) {
    res.status(error?.statusCode || 400).json({ error: error.message || "Could not update notice." });
  }
}

function handleAdminNoticeList(req, res) {
  try {
    cleanupExpiredRecords();
    const pageInput = Number(req.body?.page || req.query?.page || 1);
    const limitInput = Number(req.body?.limit || req.query?.limit || 20);
    const page = Number.isFinite(pageInput) && pageInput > 0 ? Math.floor(pageInput) : 1;
    const limit = Number.isFinite(limitInput) && limitInput > 0 ? Math.min(100, Math.floor(limitInput)) : 20;

    const statusRaw = String(req.body?.status || req.query?.status || "all")
      .trim()
      .toLowerCase();
    const status = ["all", "active", "inactive", "scheduled", "expired", "archived"].includes(statusRaw)
      ? statusRaw
      : "all";
    const targetModeRaw = String(req.body?.targetMode || req.query?.targetMode || "all")
      .trim()
      .toLowerCase();
    const targetMode = ["all", "kyc", "users", "mixed"].includes(targetModeRaw) ? targetModeRaw : "all";
    const severityRaw = String(req.body?.severity || req.query?.severity || "all")
      .trim()
      .toLowerCase();
    const severity = ["all", "info", "warning", "critical"].includes(severityRaw) ? severityRaw : "all";
    const keyword = String(req.body?.keyword || req.query?.keyword || "")
      .trim()
      .toLowerCase();

    const nowIso = toIso(getNow());
    const rows = listAllNoticesStatement.all();
    const filteredRows = rows
      .filter((row) => {
        const rowIsActive = Number(row?.is_active || 0) === 1;
        const startsAt = String(row?.starts_at || "");
        const expiresAt = String(row?.expires_at || "");
        const scheduled = rowIsActive && startsAt && startsAt > nowIso;
        const expired = rowIsActive && expiresAt && expiresAt <= nowIso;
        const activeNow = rowIsActive && !scheduled && !expired;

        if (status === "active" && !activeNow) {
          return false;
        }
        if ((status === "inactive" || status === "archived") && rowIsActive) {
          return false;
        }
        if (status === "scheduled" && !scheduled) {
          return false;
        }
        if (status === "expired" && !expired) {
          return false;
        }
        if (targetMode !== "all" && normalizeNoticeTargetMode(row?.target_mode || "all") !== targetMode) {
          return false;
        }
        if (severity !== "all" && normalizeNoticeSeverity(row?.severity || "info") !== severity) {
          return false;
        }
        if (keyword) {
          const candidate = `${row?.title || ""} ${row?.message || ""} ${row?.created_by || ""} ${row?.updated_by || ""}`.toLowerCase();
          if (!candidate.includes(keyword)) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const byUpdated = String(b?.updated_at || b?.created_at || "").localeCompare(String(a?.updated_at || a?.created_at || ""));
        if (byUpdated !== 0) {
          return byUpdated;
        }
        return Number(b?.id || 0) - Number(a?.id || 0);
      });

    const total = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * limit;
    const pagedRows = filteredRows.slice(offset, offset + limit);

    const items = pagedRows.map((row) =>
      buildNoticePayload(row, {
        targetUserIds: resolveNoticeTargetUsers(Number(row?.id || 0)),
      }),
    );

    res.json({
      items,
      pagination: {
        page: safePage,
        limit,
        total,
        totalPages,
        hasMore: safePage < totalPages,
      },
      filters: {
        status,
        targetMode,
        severity,
        keyword,
      },
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not load notice history." });
  }
}

async function handleAdminNoticeCreate(req, res) {
  try {
    cleanupExpiredRecords();
    const actor = sanitizeShortText(req.currentUser?.userId || "admin", 40) || "admin";
    const nowIso = toIso(getNow());
    const noticeInput = buildNoticeWriteInput(req.body || {}, {
      defaultIsActive: true,
      requireMessage: true,
    });

    const createTransaction = db.transaction(() => {
      const info = insertNoticeStatement.run({
        title: noticeInput.title,
        message: noticeInput.message,
        severity: noticeInput.severity,
        priority: noticeInput.priority,
        startsAt: noticeInput.startsAt,
        expiresAt: noticeInput.expiresAt,
        isActive: noticeInput.isActive,
        isDismissible: noticeInput.isDismissible,
        targetMode: noticeInput.targetMode,
        targetKycStatus: noticeInput.targetKycStatus,
        createdBy: actor,
        updatedBy: actor,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      const noticeId = Number(info.lastInsertRowid || 0);
      syncNoticeTargetUsers(noticeId, noticeInput.targetUserIds, nowIso);
      return noticeId;
    });

    const noticeId = createTransaction();
    await persistDbToBlobSafe("admin.notice.create");
    const row = noticeId ? findNoticeByIdStatement.get(noticeId) : null;

    res.json({
      message: "Notice created successfully.",
      notice: buildNoticePayload(row, {
        targetUserIds: noticeInput.targetUserIds,
      }),
    });
  } catch (error) {
    res.status(error?.statusCode || 400).json({ error: error.message || "Could not create notice." });
  }
}

async function handleAdminNoticeUpdateV2(req, res) {
  try {
    cleanupExpiredRecords();
    const noticeId = Number(req.body?.noticeId || req.query?.noticeId || 0);
    if (!Number.isInteger(noticeId) || noticeId <= 0) {
      throw new Error("Valid noticeId is required.");
    }

    const existingNotice = findNoticeByIdStatement.get(noticeId);
    if (!existingNotice) {
      res.status(404).json({ error: "Notice not found." });
      return;
    }

    const existingTargetUserIds = resolveNoticeTargetUsers(noticeId);
    const actor = sanitizeShortText(req.currentUser?.userId || "admin", 40) || "admin";
    const nowIso = toIso(getNow());
    const noticeInput = buildNoticeWriteInput(req.body || {}, {
      existingNotice,
      existingTargetUserIds,
      defaultIsActive: Number(existingNotice?.is_active || 0) === 1,
      requireMessage: true,
    });

    const updateTransaction = db.transaction(() => {
      updateNoticeStatement.run({
        noticeId,
        title: noticeInput.title,
        message: noticeInput.message,
        severity: noticeInput.severity,
        priority: noticeInput.priority,
        startsAt: noticeInput.startsAt,
        expiresAt: noticeInput.expiresAt,
        isActive: noticeInput.isActive,
        isDismissible: noticeInput.isDismissible,
        targetMode: noticeInput.targetMode,
        targetKycStatus: noticeInput.targetKycStatus,
        updatedBy: actor,
        updatedAt: nowIso,
      });
      syncNoticeTargetUsers(noticeId, noticeInput.targetUserIds, nowIso);
    });

    updateTransaction();
    await persistDbToBlobSafe("admin.notice.update.v2");
    const row = findNoticeByIdStatement.get(noticeId);
    res.json({
      message: "Notice updated successfully.",
      notice: buildNoticePayload(row, {
        targetUserIds: noticeInput.targetUserIds,
      }),
    });
  } catch (error) {
    res.status(error?.statusCode || 400).json({ error: error.message || "Could not update notice." });
  }
}

async function handleAdminNoticeStatus(req, res) {
  try {
    cleanupExpiredRecords();
    const noticeId = Number(req.body?.noticeId || req.query?.noticeId || 0);
    if (!Number.isInteger(noticeId) || noticeId <= 0) {
      throw new Error("Valid noticeId is required.");
    }

    const existingNotice = findNoticeByIdStatement.get(noticeId);
    if (!existingNotice) {
      res.status(404).json({ error: "Notice not found." });
      return;
    }

    const statusRaw = String(req.body?.status || req.query?.status || "")
      .trim()
      .toLowerCase();
    let nextIsActive = normalizeBoolean(req.body?.isActive, Number(existingNotice?.is_active || 0) === 1) ? 1 : 0;
    if (["active", "activate", "enabled", "publish", "published"].includes(statusRaw)) {
      nextIsActive = 1;
    }
    if (["inactive", "deactivate", "disabled", "archive", "archived"].includes(statusRaw)) {
      nextIsActive = 0;
    }

    const actor = sanitizeShortText(req.currentUser?.userId || "admin", 40) || "admin";
    const nowIso = toIso(getNow());
    updateNoticeStatusStatement.run({
      noticeId,
      isActive: nextIsActive,
      updatedBy: actor,
      updatedAt: nowIso,
    });

    await persistDbToBlobSafe("admin.notice.status");
    const row = findNoticeByIdStatement.get(noticeId);
    res.json({
      message: nextIsActive ? "Notice activated." : "Notice deactivated.",
      notice: buildNoticePayload(row, {
        targetUserIds: resolveNoticeTargetUsers(noticeId),
      }),
    });
  } catch (error) {
    res.status(error?.statusCode || 400).json({ error: error.message || "Could not update notice status." });
  }
}

async function handleNoticeDismiss(req, res) {
  try {
    cleanupExpiredRecords();
    const noticeId = Number(req.body?.noticeId || req.query?.noticeId || 0);
    if (!Number.isInteger(noticeId) || noticeId <= 0) {
      throw new Error("Valid noticeId is required.");
    }

    const row = findNoticeByIdStatement.get(noticeId);
    if (!row) {
      res.status(404).json({ error: "Notice not found." });
      return;
    }
    if (Number(row.is_dismissible || 0) !== 1) {
      throw new Error("This notice cannot be dismissed.");
    }

    const nowIso = toIso(getNow());
    const startsAt = String(row.starts_at || "");
    const expiresAt = String(row.expires_at || "");
    const isLive = Number(row.is_active || 0) === 1 && (!startsAt || startsAt <= nowIso) && (!expiresAt || expiresAt > nowIso);
    if (!isLive) {
      throw new Error("This notice is not currently active.");
    }

    const targetUserIds = resolveNoticeTargetUsers(noticeId);
    if (!isNoticeApplicableToUser(row, req.currentUser, targetUserIds)) {
      res.status(404).json({ error: "Notice not found for this user." });
      return;
    }

    insertNoticeDismissalStatement.run({
      noticeId,
      userId: req.currentUser.userId,
      dismissedAt: nowIso,
    });
    await persistDbToBlobSafe("notice.dismiss");

    const resolved = resolveNoticesForUser(req.currentUser);
    res.json({
      message: "Notice dismissed.",
      notice: resolved.primary,
      notices: {
        items: resolved.items,
        unreadCount: resolved.unreadCount,
      },
    });
  } catch (error) {
    res.status(error?.statusCode || 400).json({ error: error.message || "Could not dismiss notice." });
  }
}

function handleHomeContentGet(_req, res) {
  try {
    cleanupExpiredRecords();
    const homeContent = readHomePageContentConfig();
    res.json({
      content: homeContent.config,
      updatedAt: homeContent.updatedAt,
      source: homeContent.source,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not load home page content." });
  }
}

function handleAdminHomeContentGet(_req, res) {
  try {
    cleanupExpiredRecords();
    const homeContent = readHomePageContentConfig();
    res.json({
      content: homeContent.config,
      updatedAt: homeContent.updatedAt,
      updatedBy: homeContent.updatedBy,
      source: homeContent.source,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not load admin home content." });
  }
}

async function handleAdminHomeContentSave(req, res) {
  try {
    cleanupExpiredRecords();
    const payload = req.body?.content;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Valid content object is required.");
    }

    const normalized = normalizeHomePageContentConfig(payload);
    const nowIso = toIso(getNow());
    const updateBy = sanitizeShortText(req.currentUser?.userId || "admin", 40) || "admin";

    const updateTransaction = db.transaction(() => {
      clearActiveHomePageConfigsStatement.run({ updatedAt: nowIso });
      insertHomePageConfigStatement.run({
        configJson: JSON.stringify(normalized),
        isActive: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedBy: updateBy,
      });
    });

    updateTransaction();
    await persistDbToBlobSafe("admin.home.content.save");

    res.json({
      message: "Website home content saved successfully.",
      content: normalized,
      updatedAt: nowIso,
      updatedBy: updateBy,
    });
  } catch (error) {
    res.status(error?.statusCode || 400).json({ error: error.message || "Could not save home content." });
  }
}

function handleAdminDepositAssetsList(_req, res) {
  try {
    cleanupExpiredRecords();
    const rows = listDepositAssetsStatement.all();
    const assets = rows.map((row) => buildDepositAssetPayload(row)).filter(Boolean);
    const enabledAssets = assets.filter((item) => item.isEnabled).length;
    res.json({
      stats: {
        totalAssets: assets.length,
        enabledAssets,
      },
      assets,
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not load deposit assets." });
  }
}

async function handleAdminDepositAssetUpsert(req, res) {
  try {
    cleanupExpiredRecords();
    const assetId = Number(req.body.assetId);
    const hasAssetId = Number.isInteger(assetId) && assetId > 0;
    const symbol = normalizeAssetSymbol(req.body.symbol || "");
    const name = sanitizeShortText(req.body.name || "", 80);
    const chainName = sanitizeShortText(req.body.chainName || "", 80);
    const rechargeAddress = sanitizeShortText(req.body.rechargeAddress || "", 180);
    const qrCodeData = String(req.body.qrCodeData || "").trim();
    const minAmountUsd = normalizeUsdAmount(req.body.minAmountUsd ?? DEPOSIT_MIN_USD_DEFAULT);
    const maxAmountUsd = normalizeUsdAmount(req.body.maxAmountUsd ?? DEPOSIT_MAX_USD_DEFAULT);
    const sortOrder = Number.isFinite(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : 0;
    const isEnabled = normalizeBoolean(req.body.isEnabled, true) ? 1 : 0;

    if (!symbol) {
      throw new Error("Symbol is required.");
    }
    if (!name) {
      throw new Error("Asset name is required.");
    }
    if (!chainName) {
      throw new Error("Chain name is required.");
    }
    if (!rechargeAddress) {
      throw new Error("Recharge address is required.");
    }
    if (!qrCodeData) {
      throw new Error("QR code data is required.");
    }
    if (minAmountUsd > maxAmountUsd) {
      throw new Error("Min amount must be less than or equal to max amount.");
    }

    const existingBySymbol = findDepositAssetBySymbolStatement.get(symbol);
    if (existingBySymbol && (!hasAssetId || existingBySymbol.id !== assetId)) {
      throw new Error("This symbol is already configured.");
    }

    const nowIso = toIso(getNow());
    if (hasAssetId) {
      const existing = findDepositAssetByIdStatement.get(assetId);
      if (!existing) {
        res.status(404).json({ error: "Deposit asset not found." });
        return;
      }

      updateDepositAssetStatement.run({
        id: assetId,
        symbol,
        name,
        chainName,
        rechargeAddress,
        qrCodeData,
        minAmountUsd,
        maxAmountUsd,
        sortOrder,
        isEnabled,
        updatedAt: nowIso,
      });

      await persistDbToBlobSafe("admin.deposit.asset.upsert");

      const updatedAsset = findDepositAssetByIdStatement.get(assetId);
      res.json({
        message: "Deposit asset updated.",
        asset: buildDepositAssetPayload(updatedAsset),
      });
      return;
    }

    const insertResult = insertDepositAssetStatement.run({
      symbol,
      name,
      chainName,
      rechargeAddress,
      qrCodeData,
      minAmountUsd,
      maxAmountUsd,
      sortOrder,
      isEnabled,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    await persistDbToBlobSafe("admin.deposit.asset.upsert");

    const createdAsset = findDepositAssetByIdStatement.get(insertResult.lastInsertRowid);
    res.json({
      message: "Deposit asset created.",
      asset: buildDepositAssetPayload(createdAsset),
    });
  } catch (error) {
    res.status(error?.statusCode || 400).json({ error: error.message || "Could not save deposit asset." });
  }
}

async function handleAdminDepositAssetDelete(req, res) {
  try {
    cleanupExpiredRecords();
    const assetId = Number(req.body.assetId || req.query.assetId || 0);
    if (!Number.isInteger(assetId) || assetId <= 0) {
      throw new Error("Valid assetId is required.");
    }

    const existing = findDepositAssetByIdStatement.get(assetId);
    if (!existing) {
      res.status(404).json({ error: "Deposit asset not found." });
      return;
    }

    const linkedRequests = Number(countDepositRequestsByAssetIdStatement.get(assetId)?.total || 0);
    deleteDepositAssetByIdStatement.run(assetId);
    await persistDbToBlobSafe("admin.deposit.asset.delete");

    res.json({
      message:
        linkedRequests > 0
          ? "Deposit asset deleted. Historical requests are preserved."
          : "Deposit asset deleted successfully.",
      assetId,
      linkedRequests,
    });
  } catch (error) {
    res.status(error?.statusCode || 400).json({ error: error.message || "Could not delete deposit asset." });
  }
}

async function handleAdminDepositRequestsList(req, res) {
  try {
    await syncDepositStateFromBlobSafe({ context: "admin.deposit.requests.list.pre" });
    cleanupExpiredRecords();
    const includeSensitiveMedia = normalizeBoolean(
      req.body?.includeSensitiveMedia ?? req.query?.includeSensitiveMedia,
      false,
    );
    const rows = listAdminDepositRequestsStatement.all();
    res.json({
      stats: {
        totalRequests: countDepositRequestsTotalStatement.get()?.total || 0,
        pendingRequests: countDepositRequestsByStatusStatement.get("pending")?.total || 0,
        approvedRequests: countDepositRequestsByStatusStatement.get("approved")?.total || 0,
        rejectedRequests: countDepositRequestsByStatusStatement.get("rejected")?.total || 0,
      },
      requests: rows
        .map((row) => buildDepositRequestPayload(row, { includeAdminFields: true, includeSensitiveMedia }))
        .filter(Boolean),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not load deposit requests." });
  }
}

function handleAdminDepositRequestDetail(req, res) {
  try {
    cleanupExpiredRecords();
    const requestId = Number(req.body?.requestId || req.query?.requestId || req.params?.requestId || 0);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new Error("Valid requestId is required.");
    }

    const row = findAdminDepositRequestWithMediaByIdStatement.get(requestId);
    if (!row) {
      res.status(404).json({ error: "Deposit request not found." });
      return;
    }

    res.json({
      request: buildDepositRequestPayload(row, {
        includeAdminFields: true,
        includeSensitiveMedia: true,
      }),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not load deposit request detail." });
  }
}

async function handleAdminDepositRequestReview(req, res) {
  try {
    await syncDepositStateFromBlobSafe({ force: true, context: "admin.deposit.request.review.pre" });
    cleanupExpiredRecords();
    const requestId = Number(req.body.requestId);
    const decision = normalizeDepositStatus(req.body.decision || "");
    const noteInput = sanitizeShortText(req.body.note || "", 300);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new Error("Valid requestId is required.");
    }
    if (decision !== "approved" && decision !== "rejected" && decision !== "pending") {
      throw new Error("Decision must be approved, rejected, or pending.");
    }
    if (decision === "rejected" && !noteInput) {
      throw new Error("Reject reason is required.");
    }

    const request = findDepositRequestByIdStatement.get(requestId);
    if (!request) {
      res.status(404).json({ error: "Deposit request not found." });
      return;
    }
    const previousStatus = normalizeDepositStatus(request.status || "pending");
    const submittedAmountUsd = Number(request.amount_usd || 0);
    const previousApprovedAmountUsd = extractDepositApprovedAmountFromNote(
      request.note || "",
      submittedAmountUsd,
    );
    const requestedApprovedAmountInput = req.body.approvedAmountUsd;
    const hasApprovedAmountInput =
      requestedApprovedAmountInput !== undefined &&
      requestedApprovedAmountInput !== null &&
      String(requestedApprovedAmountInput).trim() !== "";
    const approvedAmountUsd = decision === "approved"
      ? hasApprovedAmountInput
        ? normalizeUsdAmount(requestedApprovedAmountInput)
        : submittedAmountUsd
      : 0;
    const note = decision === "approved"
      ? withDepositApprovalMeta(noteInput, approvedAmountUsd)
      : noteInput;

    if (decision === "approved" && (!Number.isFinite(approvedAmountUsd) || approvedAmountUsd <= 0)) {
      throw new Error("Approved amount must be greater than 0.");
    }
    const depositCreditWalletSymbol = normalizeDashboardWalletSymbol(getDepositCreditWalletSymbol() || "SPOT_USDT") || "SPOT_USDT";
    const depositCreditWalletName = buildWalletSymbolLabel(depositCreditWalletSymbol);

    const reviewedAt = toIso(getNow());
    const reviewTransaction = db.transaction(() => {
      normalizeDashboardWalletDataForUser(request.user_id, reviewedAt);

      updateDepositRequestReviewStatement.run({
        id: requestId,
        status: decision,
        note,
        reviewedAt,
        reviewedBy: "admin",
      });

      if (previousStatus !== "approved" && decision === "approved") {
        ensureWalletDetailMirroredFromSummary({
          userId: request.user_id,
          assetSymbol: depositCreditWalletSymbol,
          assetName: depositCreditWalletName,
          nowIso: reviewedAt,
        });

        applyWalletDetailDeltaIfExists({
          userId: request.user_id,
          assetSymbol: depositCreditWalletSymbol,
          deltaUsd: approvedAmountUsd,
          updatedAt: reviewedAt,
        });
        syncWalletSummaryFromDetailIfExists({
          userId: request.user_id,
          assetSymbol: depositCreditWalletSymbol,
          assetName: depositCreditWalletName,
          updatedAt: reviewedAt,
        });

        insertAssetWalletLedgerEntry({
          userId: request.user_id,
          ledgerRefType: "deposit_approval",
          ledgerRefId: String(request.id || requestId),
          walletSymbol: depositCreditWalletSymbol,
          assetSymbol: request.asset_symbol || "USDT",
          movementType: "credit",
          amountUsd: approvedAmountUsd,
          note: `Deposit approved (${request.asset_symbol || "USDT"}).`,
          createdAt: reviewedAt,
          createdBy: "admin",
        });
      }

      if (previousStatus === "approved" && decision !== "approved") {
        ensureWalletDetailMirroredFromSummary({
          userId: request.user_id,
          assetSymbol: depositCreditWalletSymbol,
          assetName: depositCreditWalletName,
          nowIso: reviewedAt,
        });

        applyWalletDetailDeltaIfExists({
          userId: request.user_id,
          assetSymbol: depositCreditWalletSymbol,
          deltaUsd: -previousApprovedAmountUsd,
          updatedAt: reviewedAt,
        });
        syncWalletSummaryFromDetailIfExists({
          userId: request.user_id,
          assetSymbol: depositCreditWalletSymbol,
          assetName: depositCreditWalletName,
          updatedAt: reviewedAt,
        });

        insertAssetWalletLedgerEntry({
          userId: request.user_id,
          ledgerRefType: "deposit_approval",
          ledgerRefId: String(request.id || requestId),
          walletSymbol: depositCreditWalletSymbol,
          assetSymbol: request.asset_symbol || "USDT",
          movementType: "debit",
          amountUsd: previousApprovedAmountUsd,
          note: `Deposit approval reverted (${request.asset_symbol || "USDT"}).`,
          createdAt: reviewedAt,
          createdBy: "admin",
        });
      }

      if (previousStatus === "approved" && decision === "approved") {
        const deltaUsd = approvedAmountUsd - previousApprovedAmountUsd;

        if (Math.abs(deltaUsd) >= 0.000001) {
          ensureWalletDetailMirroredFromSummary({
            userId: request.user_id,
            assetSymbol: depositCreditWalletSymbol,
            assetName: depositCreditWalletName,
            nowIso: reviewedAt,
          });

          applyWalletDetailDeltaIfExists({
            userId: request.user_id,
            assetSymbol: depositCreditWalletSymbol,
            deltaUsd,
            updatedAt: reviewedAt,
          });
          syncWalletSummaryFromDetailIfExists({
            userId: request.user_id,
            assetSymbol: depositCreditWalletSymbol,
            assetName: depositCreditWalletName,
            updatedAt: reviewedAt,
          });

          insertAssetWalletLedgerEntry({
            userId: request.user_id,
            ledgerRefType: "deposit_approval_adjustment",
            ledgerRefId: String(request.id || requestId),
            walletSymbol: depositCreditWalletSymbol,
            assetSymbol: request.asset_symbol || "USDT",
            movementType: deltaUsd >= 0 ? "credit" : "debit",
            amountUsd: Math.abs(deltaUsd),
            note:
              deltaUsd >= 0
                ? `Deposit approved amount increased (${request.asset_symbol || "USDT"}).`
                : `Deposit approved amount reduced (${request.asset_symbol || "USDT"}).`,
            createdAt: reviewedAt,
            createdBy: "admin",
          });
        }
      }
    });

    reviewTransaction();
    await persistDbToBlobSafe("admin.deposit.request.review");

    const reviewedRequest = findAdminDepositRequestWithMediaByIdStatement.get(requestId);
    if (decision === "approved" || decision === "rejected") {
      const requestPayload = buildDepositRequestPayload(reviewedRequest, {
        includeAdminFields: true,
      });
      if (requestPayload?.accountEmail) {
        const mail = buildUserDepositDecisionMailPayload({
          request: requestPayload,
          decision,
        });
        sendUserNotificationEmail({
          toEmail: requestPayload.accountEmail,
          ...mail,
          metaLabel: `user-deposit-${decision}`,
        });
      }
    }
    const responseMessageByDecision = {
      approved:
        previousStatus === "approved"
          ? `Deposit approval updated. Credited amount is $${approvedAmountUsd.toFixed(2)}.`
          : `Deposit approved. Credited amount is $${approvedAmountUsd.toFixed(2)}.`,
      rejected: "Deposit rejected and wallet adjusted.",
      pending: "Deposit moved back to pending.",
    };

    res.json({
      message: responseMessageByDecision[decision] || "Deposit request updated.",
      request: buildDepositRequestPayload(reviewedRequest, {
        includeAdminFields: true,
        includeSensitiveMedia: true,
      }),
      wallet: readDashboardWallet(request.user_id),
    });
  } catch (error) {
    res.status(error?.statusCode || 400).json({ error: error.message || "Could not review deposit request." });
  }
}

app.post("/api/auth/gateway", async (req, res) => {
  const action = String(req.body?.action || "").trim().toLowerCase();

  switch (action) {
    case "admin.auth.signup":
      await handleAdminSignup(req, res);
      return;
    case "admin.auth.login":
      await handleAdminLogin(req, res);
      return;
    case "admin.auth.session":
      requireAdminSession(req, res, () => handleAdminSession(req, res));
      return;
    case "admin.auth.logout":
      requireAdminSession(req, res, () => handleAdminLogout(req, res));
      return;
    case "home.content.get":
      handleHomeContentGet(req, res);
      return;
    case "signup.send-otp":
      await handleSignupSendOtp(req, res);
      return;
    case "signup.complete":
      await handleSignupComplete(req, res);
      return;
    case "google":
      await handleGoogleAuth(req, res);
      return;
    case "login":
      await handleLogin(req, res);
      return;
    case "session":
      requireSession(req, res, () => handleSession(req, res));
      return;
    case "logout":
      requireSession(req, res, () => handleLogout(req, res));
      return;
    case "password.lookup":
      await handlePasswordLookup(req, res);
      return;
    case "password.verify-otp":
      handlePasswordVerifyOtp(req, res);
      return;
    case "password.reset":
      await handlePasswordReset(req, res);
      return;
    case "profile.update":
      requireSession(req, res, async () => {
        await handleProfileUpdate(req, res);
      });
      return;
    case "password.change":
      requireSession(req, res, async () => {
        await handlePasswordChange(req, res);
      });
      return;
    case "kyc.submit":
      requireSession(req, res, () => handleKycSubmit(req, res));
      return;
    case "kyc.status":
      requireSession(req, res, () => handleKycStatus(req, res));
      return;
    case "dashboard.snapshot":
      requireSession(req, res, () => handleDashboardSnapshot(req, res));
      return;
    case "notice.dismiss":
      requireSession(req, res, () => handleNoticeDismiss(req, res));
      return;
    case "deposit.create":
      requireSession(req, res, () => handleDepositCreate(req, res));
      return;
    case "deposit.records":
      requireSession(req, res, () => handleDepositRecords(req, res));
      return;
    case "launchpad.catalog":
      requireSession(req, res, () => handleLaunchpadCatalog(req, res));
      return;
    case "launchpad.detail":
      requireSession(req, res, () => handleLaunchpadDetail(req, res));
      return;
    case "launchpad.watchlist.toggle":
      requireSession(req, res, () => handleLaunchpadWatchlistToggle(req, res));
      return;
    case "launchpad.buy.preview":
      requireSession(req, res, () => handleLaunchpadBuyPreview(req, res));
      return;
    case "launchpad.buy.submit":
      requireSession(req, res, () => handleLaunchpadBuySubmit(req, res));
      return;
    case "launchpad.my.orders":
      requireSession(req, res, () => handleLaunchpadMyOrders(req, res));
      return;
    case "launchpad.feed":
      requireSession(req, res, () => handleLaunchpadFeed(req, res));
      return;
    case "launchpad.countdown":
      requireSession(req, res, () => handleLaunchpadCountdown(req, res));
      return;
    case "lum.summary":
      requireSession(req, res, () => handleLumSummary(req, res));
      return;
    case "lum.plans":
      requireSession(req, res, () => handleLumPlans(req, res));
      return;
    case "lum.plan.detail":
      requireSession(req, res, () => handleLumPlanDetail(req, res));
      return;
    case "lum.invest":
      requireSession(req, res, () => handleLumInvest(req, res));
      return;
    case "lum.investments":
      requireSession(req, res, () => handleLumInvestments(req, res));
      return;
    case "lum.investment.detail":
      requireSession(req, res, () => handleLumInvestmentDetail(req, res));
      return;
    case "lum.entrust":
      requireSession(req, res, () => handleLumEntrust(req, res));
      return;
    case "lum.info":
      requireSession(req, res, () => handleLumInfo(req, res));
      return;
    case "binary.summary":
      requireSession(req, res, () => handleBinarySummary(req, res));
      return;
    case "binary.pairs":
      requireSession(req, res, () => handleBinaryPairs(req, res));
      return;
    case "binary.pair.chart":
      req.params = { ...(req.params || {}), id: String(req.body?.pairId || req.query?.pairId || "") };
      requireSession(req, res, () => handleBinaryPairChart(req, res));
      return;
    case "binary.config":
      requireSession(req, res, () => handleBinaryConfig(req, res));
      return;
    case "binary.market.prices":
      requireSession(req, res, () => handleBinaryMarketPrices(req, res));
      return;
    case "binary.trade.open":
      requireSession(req, res, () => handleBinaryTradeOpen(req, res));
      return;
    case "binary.trades.active":
      requireSession(req, res, () => handleBinaryActiveTrades(req, res));
      return;
    case "binary.trades.history":
      requireSession(req, res, () => handleBinaryTradeHistory(req, res));
      return;
    case "binary.trade.detail":
      req.params = { ...(req.params || {}), id: String(req.body?.tradeId || req.query?.tradeId || "") };
      requireSession(req, res, () => handleBinaryTradeDetail(req, res));
      return;
    case "binary.trade.settle":
      req.params = { ...(req.params || {}), id: String(req.body?.tradeId || req.query?.tradeId || "") };
      requireSession(req, res, () => handleBinaryTradeSettle(req, res));
      return;
    case "transaction.convert.pairs.list":
      requireSession(req, res, () => handleTransactionConvertPairsList(req, res));
      return;
    case "transaction.convert.quote":
      requireSession(req, res, () => handleTransactionConvertQuote(req, res));
      return;
    case "transaction.convert.submit":
      requireSession(req, res, () => handleTransactionConvertSubmit(req, res));
      return;
    case "transaction.convert.history":
      requireSession(req, res, () => handleTransactionConvertHistory(req, res));
      return;
    case "transaction.spot.pairs.list":
      requireSession(req, res, () => handleTransactionSpotPairsList(req, res));
      return;
    case "transaction.spot.market-summary":
      requireSession(req, res, () => handleTransactionSpotMarketSummary(req, res));
      return;
    case "transaction.spot.ticks":
      requireSession(req, res, () => handleTransactionSpotTicks(req, res));
      return;
    case "transaction.spot.recent-trades":
      requireSession(req, res, () => handleTransactionSpotRecentTrades(req, res));
      return;
    case "transaction.spot.order.place":
      requireSession(req, res, () => handleTransactionSpotOrderPlace(req, res));
      return;
    case "transaction.spot.orders.open":
      requireSession(req, res, () => handleTransactionSpotOrdersOpen(req, res));
      return;
    case "transaction.spot.orders.history":
      requireSession(req, res, () => handleTransactionSpotOrdersHistory(req, res));
      return;
    case "transaction.spot.order.cancel":
      requireSession(req, res, () => handleTransactionSpotOrderCancel(req, res));
      return;
    case "transaction.spot.orderbook":
      requireSession(req, res, () => handleTransactionSpotOrderbook(req, res));
      return;
    case "assets.summary":
      requireSession(req, res, () => handleAssetsSummary(req, res));
      return;
    case "assets.wallets":
      requireSession(req, res, () => handleAssetsWallets(req, res));
      return;
    case "assets.history":
      requireSession(req, res, () => handleAssetsHistory(req, res));
      return;
    case "assets.transfer":
      requireSession(req, res, () => handleAssetsTransfer(req, res));
      return;
    case "assets.convert":
      requireSession(req, res, () => handleAssetsConvert(req, res));
      return;
    case "assets.convert.quote":
      requireSession(req, res, () => handleAssetsConvert(req, res));
      return;
    case "assets.withdraw.config":
      requireSession(req, res, () => handleAssetsWithdrawConfig(req, res));
      return;
    case "assets.withdraw.submit":
      requireSession(req, res, () => handleAssetsWithdraw(req, res));
      return;
    case "assets.withdrawals":
      requireSession(req, res, () => handleAssetsWithdrawals(req, res));
      return;
    case "assets.transfers":
      requireSession(req, res, () => handleAssetsTransfers(req, res));
      return;
    case "assets.conversions":
      requireSession(req, res, () => handleAssetsConversions(req, res));
      return;
    case "support.tickets.list":
      requireSession(req, res, () => handleSupportTicketsList(req, res));
      return;
    case "support.ticket.detail":
      req.params = { ...(req.params || {}), ticketRef: String(req.body?.ticketRef || req.query?.ticketRef || "") };
      requireSession(req, res, () => handleSupportTicketDetail(req, res));
      return;
    case "support.ticket.create":
      requireSession(req, res, () => handleSupportTicketCreate(req, res));
      return;
    case "support.ticket.message.send":
      req.params = { ...(req.params || {}), ticketRef: String(req.body?.ticketRef || req.query?.ticketRef || "") };
      requireSession(req, res, () => handleSupportTicketMessageSend(req, res));
      return;
    case "support.ticket.status.update":
      req.params = { ...(req.params || {}), ticketRef: String(req.body?.ticketRef || req.query?.ticketRef || "") };
      requireSession(req, res, () => handleSupportTicketStatusUpdate(req, res));
      return;
    case "support.live.thread":
      requireSession(req, res, () => handleSupportLiveThread(req, res));
      return;
    case "support.live.send":
      requireSession(req, res, () => handleSupportLiveSend(req, res));
      return;
    case "admin.assets.dashboard-summary":
      requireAdminSession(req, res, () => handleAdminAssetsDashboardSummary(req, res));
      return;
    case "admin.assets.wallets":
      requireAdminSession(req, res, () => handleAdminAssetsWallets(req, res));
      return;
    case "admin.assets.wallet.detail":
      requireAdminSession(req, res, () => handleAdminAssetsWalletDetail(req, res));
      return;
    case "admin.assets.wallet.adjust":
      requireAdminSession(req, res, () => handleAdminAssetsWalletAdjust(req, res));
      return;
    case "admin.assets.wallet.freeze":
      requireAdminSession(req, res, () => handleAdminAssetsWalletFreeze(req, res));
      return;
    case "admin.assets.withdrawals":
      requireAdminSession(req, res, () => handleAdminAssetsWithdrawals(req, res));
      return;
    case "admin.assets.withdrawals.review":
      requireAdminSession(req, res, () => handleAdminAssetsWithdrawReview(req, res));
      return;
    case "admin.assets.withdrawals.complete":
      requireAdminSession(req, res, () => handleAdminAssetsWithdrawComplete(req, res));
      return;
    case "admin.assets.transfers":
      requireAdminSession(req, res, () => handleAdminAssetsTransfers(req, res));
      return;
    case "admin.assets.conversions":
      requireAdminSession(req, res, () => handleAdminAssetsConversions(req, res));
      return;
    case "admin.assets.settings":
      requireAdminSession(req, res, () => handleAdminAssetsSettingsGet(req, res));
      return;
    case "admin.assets.settings.save":
      requireAdminSession(req, res, () => handleAdminAssetsSettingsSave(req, res));
      return;
    case "admin.assets.audit-logs":
      requireAdminSession(req, res, () => handleAdminAssetsAuditLogs(req, res));
      return;
    case "admin.support.dashboard-summary":
      requireAdminSession(req, res, () => handleAdminSupportDashboardSummary(req, res));
      return;
    case "admin.support.tickets":
      requireAdminSession(req, res, () => handleAdminSupportTickets(req, res));
      return;
    case "admin.support.ticket.detail":
      req.params = { ...(req.params || {}), ticketRef: String(req.body?.ticketRef || req.query?.ticketRef || "") };
      requireAdminSession(req, res, () => handleAdminSupportTicketDetail(req, res));
      return;
    case "admin.support.ticket.reply":
      requireAdminSession(req, res, () => handleAdminSupportReply(req, res));
      return;
    case "admin.support.ticket.update":
      requireAdminSession(req, res, () => handleAdminSupportTicketUpdate(req, res));
      return;
    case "admin.support.audit-logs":
      requireAdminSession(req, res, () => handleAdminSupportAuditLogs(req, res));
      return;
    case "admin.support.live.threads":
      requireAdminSession(req, res, () => handleAdminSupportLiveThreads(req, res));
      return;
    case "admin.support.live.thread.detail":
      req.params = { ...(req.params || {}), threadRef: String(req.body?.threadRef || req.query?.threadRef || "") };
      requireAdminSession(req, res, () => handleAdminSupportLiveThreadDetail(req, res));
      return;
    case "admin.support.live.reply":
      requireAdminSession(req, res, () => handleAdminSupportLiveReply(req, res));
      return;
    case "admin.support.live.update":
      requireAdminSession(req, res, () => handleAdminSupportLiveUpdate(req, res));
      return;
    case "admin.launchpad.dashboard-summary":
      requireAdminSession(req, res, () => handleAdminLaunchpadDashboardSummary(req, res));
      return;
    case "admin.launchpad.launches.list":
      requireAdminSession(req, res, () => handleAdminLaunchpadLaunchesList(req, res));
      return;
    case "admin.launchpad.launches.create":
      requireAdminSession(req, res, () => handleAdminLaunchpadLaunchCreate(req, res));
      return;
    case "admin.launchpad.launches.update":
      requireAdminSession(req, res, () => handleAdminLaunchpadLaunchUpdate(req, res));
      return;
    case "admin.launchpad.launches.status":
      requireAdminSession(req, res, () => handleAdminLaunchpadLaunchStatus(req, res));
      return;
    case "admin.launchpad.tiers.save":
      requireAdminSession(req, res, () => handleAdminLaunchpadTiersSave(req, res));
      return;
    case "admin.launchpad.settings.get":
      requireAdminSession(req, res, () => handleAdminLaunchpadSettingsGet(req, res));
      return;
    case "admin.launchpad.settings.save":
      requireAdminSession(req, res, () => handleAdminLaunchpadSettingsSave(req, res));
      return;
    case "admin.launchpad.orders.list":
      requireAdminSession(req, res, () => handleAdminLaunchpadOrdersList(req, res));
      return;
    case "admin.launchpad.orders.release":
      requireAdminSession(req, res, () => handleAdminLaunchpadOrdersRelease(req, res));
      return;
    case "admin.launchpad.market-sync.run":
      requireAdminSession(req, res, () => handleAdminLaunchpadMarketSyncRun(req, res));
      return;
    case "admin.launchpad.audit.list":
      requireAdminSession(req, res, () => handleAdminLaunchpadAuditList(req, res));
      return;
    case "admin.kyc.list":
      requireAdminSession(req, res, () => handleAdminKycList(req, res));
      return;
    case "admin.kyc.request.detail":
      requireAdminSession(req, res, () => handleAdminKycRequestDetail(req, res));
      return;
    case "admin.users.list":
      requireAdminSession(req, res, () => handleAdminUsersList(req, res));
      return;
    case "admin.user.detail":
      requireAdminSession(req, res, () => handleAdminUserDetail(req, res));
      return;
    case "admin.user.update":
      requireAdminSession(req, res, () => handleAdminUserUpdate(req, res));
      return;
    case "admin.user.delete":
      requireAdminSession(req, res, () => handleAdminUserDelete(req, res));
      return;
    case "admin.kyc.review":
      requireAdminSession(req, res, () => handleAdminKycReview(req, res));
      return;
    case "admin.notice.get":
      requireAdminSession(req, res, () => handleAdminNoticeGet(req, res));
      return;
    case "admin.notice.update":
      requireAdminSession(req, res, () => handleAdminNoticeUpdate(req, res));
      return;
    case "admin.notice.list":
      requireAdminSession(req, res, () => handleAdminNoticeList(req, res));
      return;
    case "admin.notice.create":
      requireAdminSession(req, res, () => handleAdminNoticeCreate(req, res));
      return;
    case "admin.notice.update.v2":
      requireAdminSession(req, res, () => handleAdminNoticeUpdateV2(req, res));
      return;
    case "admin.notice.status":
      requireAdminSession(req, res, () => handleAdminNoticeStatus(req, res));
      return;
    case "admin.home.content.get":
      requireAdminSession(req, res, () => handleAdminHomeContentGet(req, res));
      return;
    case "admin.home.content.save":
      requireAdminSession(req, res, () => handleAdminHomeContentSave(req, res));
      return;
    case "admin.deposit.assets.list":
      requireAdminSession(req, res, () => handleAdminDepositAssetsList(req, res));
      return;
    case "admin.deposit.asset.upsert":
      requireAdminSession(req, res, () => handleAdminDepositAssetUpsert(req, res));
      return;
    case "admin.deposit.asset.delete":
      requireAdminSession(req, res, () => handleAdminDepositAssetDelete(req, res));
      return;
    case "admin.deposit.requests.list":
      requireAdminSession(req, res, () => handleAdminDepositRequestsList(req, res));
      return;
    case "admin.deposit.request.detail":
      requireAdminSession(req, res, () => handleAdminDepositRequestDetail(req, res));
      return;
    case "admin.deposit.request.review":
      requireAdminSession(req, res, () => handleAdminDepositRequestReview(req, res));
      return;
    case "admin.lum.plans.list":
      requireAdminSession(req, res, () => handleAdminLumPlansList(req, res));
      return;
    case "admin.lum.plans.create":
      requireAdminSession(req, res, () => handleAdminLumPlanCreate(req, res));
      return;
    case "admin.lum.plans.update":
      requireAdminSession(req, res, () => handleAdminLumPlanUpdate(req, res));
      return;
    case "admin.lum.plans.delete":
      requireAdminSession(req, res, () => handleAdminLumPlanDelete(req, res));
      return;
    case "admin.lum.plans.toggle-status":
      requireAdminSession(req, res, () => handleAdminLumPlanToggleStatus(req, res));
      return;
    case "admin.lum.investments.list":
      requireAdminSession(req, res, () => handleAdminLumInvestments(req, res));
      return;
    case "admin.lum.investments.review":
      requireAdminSession(req, res, () => handleAdminLumInvestmentReview(req, res));
      return;
    case "admin.lum.investments.force-settle":
      requireAdminSession(req, res, () => handleAdminLumForceSettle(req, res));
      return;
    case "admin.lum.dashboard-summary":
      requireAdminSession(req, res, () => handleAdminLumDashboardSummary(req, res));
      return;
    case "admin.lum.content.save":
      requireAdminSession(req, res, () => handleAdminLumContentSave(req, res));
      return;
    case "admin.binary.dashboard-summary":
      requireAdminSession(req, res, () => handleAdminBinaryDashboardSummary(req, res));
      return;
    case "admin.binary.categories":
      requireAdminSession(req, res, () => handleAdminBinaryCategories(req, res));
      return;
    case "admin.binary.categories.create":
      requireAdminSession(req, res, () => handleAdminBinaryCategoryCreate(req, res));
      return;
    case "admin.binary.categories.update":
      requireAdminSession(req, res, () => handleAdminBinaryCategoryUpdate(req, res));
      return;
    case "admin.binary.categories.delete":
      requireAdminSession(req, res, () => handleAdminBinaryCategoryDelete(req, res));
      return;
    case "admin.binary.pairs":
      requireAdminSession(req, res, () => handleAdminBinaryPairs(req, res));
      return;
    case "admin.binary.pairs.create":
      requireAdminSession(req, res, () => handleAdminBinaryPairCreate(req, res));
      return;
    case "admin.binary.pairs.update":
      requireAdminSession(req, res, () => handleAdminBinaryPairUpdate(req, res));
      return;
    case "admin.binary.pairs.delete":
      requireAdminSession(req, res, () => handleAdminBinaryPairDelete(req, res));
      return;
    case "admin.binary.pairs.toggle-status":
      requireAdminSession(req, res, () => handleAdminBinaryPairToggle(req, res));
      return;
    case "admin.binary.period-rules":
      requireAdminSession(req, res, () => handleAdminBinaryPeriodRules(req, res));
      return;
    case "admin.binary.period-rules.save":
      requireAdminSession(req, res, () => handleAdminBinaryPeriodRuleSave(req, res));
      return;
    case "admin.binary.trades":
      requireAdminSession(req, res, () => handleAdminBinaryTrades(req, res));
      return;
    case "admin.binary.trades.settle":
      requireAdminSession(req, res, () => handleAdminBinaryTradeSettle(req, res));
      return;
    case "admin.binary.trades.cancel":
      requireAdminSession(req, res, () => handleAdminBinaryTradeCancel(req, res));
      return;
    case "admin.binary.engine-settings":
      requireAdminSession(req, res, () => handleAdminBinaryEngineSettingsGet(req, res));
      return;
    case "admin.binary.engine-settings.save":
      requireAdminSession(req, res, () => handleAdminBinaryEngineSettingsSave(req, res));
      return;
    case "admin.binary.manual-tick.push":
      requireAdminSession(req, res, () => handleAdminBinaryManualTickPush(req, res));
      return;
    case "admin.transaction.dashboard-summary":
      requireAdminSession(req, res, () => handleAdminTransactionDashboardSummary(req, res));
      return;
    case "admin.transaction.engine-settings.get":
      requireAdminSession(req, res, () => handleAdminTransactionEngineSettingsGet(req, res));
      return;
    case "admin.transaction.engine-settings.save":
      requireAdminSession(req, res, () => handleAdminTransactionEngineSettingsSave(req, res));
      return;
    case "admin.transaction.convert.pairs.list":
      requireAdminSession(req, res, () => handleAdminTransactionConvertPairsList(req, res));
      return;
    case "admin.transaction.convert.pairs.create":
      requireAdminSession(req, res, () => handleAdminTransactionConvertPairCreate(req, res));
      return;
    case "admin.transaction.convert.pairs.update":
      requireAdminSession(req, res, () => handleAdminTransactionConvertPairUpdate(req, res));
      return;
    case "admin.transaction.convert.pairs.delete":
      requireAdminSession(req, res, () => handleAdminTransactionConvertPairDelete(req, res));
      return;
    case "admin.transaction.convert.pairs.toggle-status":
      requireAdminSession(req, res, () => handleAdminTransactionConvertPairToggleStatus(req, res));
      return;
    case "admin.transaction.convert.orders.list":
      requireAdminSession(req, res, () => handleAdminTransactionConvertOrdersList(req, res));
      return;
    case "admin.transaction.convert.manual-rate.push":
      requireAdminSession(req, res, () => handleAdminTransactionConvertManualRatePush(req, res));
      return;
    case "admin.transaction.spot.pairs.list":
      requireAdminSession(req, res, () => handleAdminTransactionSpotPairsList(req, res));
      return;
    case "admin.transaction.spot.pairs.create":
      requireAdminSession(req, res, () => handleAdminTransactionSpotPairCreate(req, res));
      return;
    case "admin.transaction.spot.pairs.update":
      requireAdminSession(req, res, () => handleAdminTransactionSpotPairUpdate(req, res));
      return;
    case "admin.transaction.spot.pairs.delete":
      requireAdminSession(req, res, () => handleAdminTransactionSpotPairDelete(req, res));
      return;
    case "admin.transaction.spot.pairs.toggle-status":
      requireAdminSession(req, res, () => handleAdminTransactionSpotPairToggleStatus(req, res));
      return;
    case "admin.transaction.spot.orders.list":
      requireAdminSession(req, res, () => handleAdminTransactionSpotOrdersList(req, res));
      return;
    case "admin.transaction.spot.order.cancel":
      requireAdminSession(req, res, () => handleAdminTransactionSpotOrderCancel(req, res));
      return;
    case "admin.transaction.spot.order.force-fill":
      requireAdminSession(req, res, () => handleAdminTransactionSpotOrderForceFill(req, res));
      return;
    case "admin.transaction.spot.manual-tick.push":
      requireAdminSession(req, res, () => handleAdminTransactionSpotManualTickPush(req, res));
      return;
    case "admin.transaction.spot.feed.settings.save":
      requireAdminSession(req, res, () => handleAdminTransactionSpotFeedSettingsSave(req, res));
      return;
    case "admin.transaction.audit.list":
      requireAdminSession(req, res, () => handleAdminTransactionAuditList(req, res));
      return;
    default:
      res.status(400).json({ error: "Unknown auth action." });
  }
});

app.post("/api/auth/signup/send-otp", handleSignupSendOtp);
app.post("/api/auth/signup/complete", handleSignupComplete);
app.post("/api/auth/google", handleGoogleAuth);
app.post("/api/auth/login", handleLogin);
app.get("/api/auth/session", requireSession, handleSession);
app.post("/api/auth/logout", requireSession, handleLogout);
app.post("/api/auth/password/lookup", handlePasswordLookup);
app.post("/api/auth/password/verify-otp", handlePasswordVerifyOtp);
app.post("/api/auth/password/reset", handlePasswordReset);
app.post("/api/auth/profile", requireSession, handleProfileUpdate);
app.post("/api/auth/password/change", requireSession, handlePasswordChange);
app.post("/api/auth/kyc", requireSession, handleKycSubmit);
app.get("/api/auth/kyc", requireSession, handleKycStatus);
app.get("/api/auth/dashboard", requireSession, handleDashboardSnapshot);
app.post("/api/auth/deposit", requireSession, handleDepositCreate);
app.get("/api/auth/deposit/records", requireSession, handleDepositRecords);
app.get("/api/lum/summary", requireSession, handleLumSummary);
app.get("/api/lum/plans", requireSession, handleLumPlans);
app.get("/api/lum/plans/:id", requireSession, handleLumPlanDetail);
app.post("/api/lum/invest", requireSession, handleLumInvest);
app.get("/api/lum/investments", requireSession, handleLumInvestments);
app.get("/api/lum/investments/:id", requireSession, handleLumInvestmentDetail);
app.get("/api/lum/entrust", requireSession, handleLumEntrust);
app.get("/api/lum/info", requireSession, handleLumInfo);
app.get("/api/binary/summary", requireSession, handleBinarySummary);
app.get("/api/binary/pairs", requireSession, handleBinaryPairs);
app.get("/api/binary/pairs/:id/chart", requireSession, handleBinaryPairChart);
app.get("/api/binary/config", requireSession, handleBinaryConfig);
app.post("/api/binary/market/prices", requireSession, handleBinaryMarketPrices);
app.post("/api/binary/trades/open", requireSession, handleBinaryTradeOpen);
app.get("/api/binary/trades/active", requireSession, handleBinaryActiveTrades);
app.get("/api/binary/trades/history", requireSession, handleBinaryTradeHistory);
app.get("/api/binary/trades/:id", requireSession, handleBinaryTradeDetail);
app.post("/api/binary/trades/:id/settle", requireSession, handleBinaryTradeSettle);
app.get("/api/transaction/convert/pairs", requireSession, handleTransactionConvertPairsList);
app.post("/api/transaction/convert/quote", requireSession, handleTransactionConvertQuote);
app.post("/api/transaction/convert/submit", requireSession, handleTransactionConvertSubmit);
app.get("/api/transaction/convert/history", requireSession, handleTransactionConvertHistory);
app.get("/api/transaction/spot/pairs", requireSession, handleTransactionSpotPairsList);
app.get("/api/transaction/spot/market-summary", requireSession, handleTransactionSpotMarketSummary);
app.get("/api/transaction/spot/ticks", requireSession, handleTransactionSpotTicks);
app.get("/api/transaction/spot/recent-trades", requireSession, handleTransactionSpotRecentTrades);
app.post("/api/transaction/spot/order/place", requireSession, handleTransactionSpotOrderPlace);
app.get("/api/transaction/spot/orders/open", requireSession, handleTransactionSpotOrdersOpen);
app.get("/api/transaction/spot/orders/history", requireSession, handleTransactionSpotOrdersHistory);
app.post("/api/transaction/spot/order/cancel", requireSession, handleTransactionSpotOrderCancel);
app.get("/api/transaction/spot/orderbook", requireSession, handleTransactionSpotOrderbook);
app.get("/api/assets/summary", requireSession, handleAssetsSummary);
app.get("/api/assets/wallets", requireSession, handleAssetsWallets);
app.get("/api/assets/history", requireSession, handleAssetsHistory);
app.post("/api/assets/transfer", requireSession, handleAssetsTransfer);
app.post("/api/assets/convert", requireSession, handleAssetsConvert);
app.get("/api/assets/withdraw/config", requireSession, handleAssetsWithdrawConfig);
app.post("/api/assets/withdraw", requireSession, handleAssetsWithdraw);
app.get("/api/assets/withdrawals", requireSession, handleAssetsWithdrawals);
app.get("/api/assets/transfers", requireSession, handleAssetsTransfers);
app.get("/api/assets/conversions", requireSession, handleAssetsConversions);
app.get("/api/support/tickets", requireSession, handleSupportTicketsList);
app.get("/api/support/tickets/:ticketRef", requireSession, handleSupportTicketDetail);
app.post("/api/support/tickets", requireSession, handleSupportTicketCreate);
app.post("/api/support/tickets/:ticketRef/messages", requireSession, handleSupportTicketMessageSend);
app.post("/api/support/tickets/:ticketRef/status", requireSession, handleSupportTicketStatusUpdate);
app.get("/api/support/live/thread", requireSession, handleSupportLiveThread);
app.post("/api/support/live/send", requireSession, handleSupportLiveSend);
app.get("/api/admin/assets/dashboard-summary", requireAdminSession, handleAdminAssetsDashboardSummary);
app.get("/api/admin/assets/wallets", requireAdminSession, handleAdminAssetsWallets);
app.get("/api/admin/assets/wallets/:userId", requireAdminSession, handleAdminAssetsWalletDetail);
app.post("/api/admin/assets/wallets/adjust", requireAdminSession, handleAdminAssetsWalletAdjust);
app.post("/api/admin/assets/wallets/freeze", requireAdminSession, handleAdminAssetsWalletFreeze);
app.get("/api/admin/assets/withdrawals", requireAdminSession, handleAdminAssetsWithdrawals);
app.post("/api/admin/assets/withdrawals/review", requireAdminSession, handleAdminAssetsWithdrawReview);
app.post("/api/admin/assets/withdrawals/complete", requireAdminSession, handleAdminAssetsWithdrawComplete);
app.get("/api/admin/assets/transfers", requireAdminSession, handleAdminAssetsTransfers);
app.get("/api/admin/assets/conversions", requireAdminSession, handleAdminAssetsConversions);
app.get("/api/admin/assets/settings", requireAdminSession, handleAdminAssetsSettingsGet);
app.post("/api/admin/assets/settings/save", requireAdminSession, handleAdminAssetsSettingsSave);
app.get("/api/admin/assets/audit-logs", requireAdminSession, handleAdminAssetsAuditLogs);
app.get("/api/admin/support/dashboard-summary", requireAdminSession, handleAdminSupportDashboardSummary);
app.get("/api/admin/support/tickets", requireAdminSession, handleAdminSupportTickets);
app.get("/api/admin/support/tickets/:ticketRef", requireAdminSession, handleAdminSupportTicketDetail);
app.post("/api/admin/support/tickets/reply", requireAdminSession, handleAdminSupportReply);
app.post("/api/admin/support/tickets/update", requireAdminSession, handleAdminSupportTicketUpdate);
app.get("/api/admin/support/audit-logs", requireAdminSession, handleAdminSupportAuditLogs);
app.get("/api/admin/support/live/threads", requireAdminSession, handleAdminSupportLiveThreads);
app.get("/api/admin/support/live/threads/:threadRef", requireAdminSession, handleAdminSupportLiveThreadDetail);
app.post("/api/admin/support/live/reply", requireAdminSession, handleAdminSupportLiveReply);
app.post("/api/admin/support/live/update", requireAdminSession, handleAdminSupportLiveUpdate);
app.post("/api/admin/auth/signup", handleAdminSignup);
app.post("/api/admin/auth/login", handleAdminLogin);
app.get("/api/admin/auth/session", requireAdminSession, handleAdminSession);
app.post("/api/admin/auth/logout", requireAdminSession, handleAdminLogout);
app.get("/api/admin/kyc", requireAdminSession, handleAdminKycList);
app.get("/api/admin/kyc/:requestId", requireAdminSession, handleAdminKycRequestDetail);
app.post("/api/admin/kyc/review", requireAdminSession, handleAdminKycReview);
app.get("/api/admin/users", requireAdminSession, handleAdminUsersList);
app.post("/api/admin/users/list", requireAdminSession, handleAdminUsersList);
app.get("/api/admin/users/:userId", requireAdminSession, handleAdminUserDetail);
app.post("/api/admin/users/detail", requireAdminSession, handleAdminUserDetail);
app.post("/api/admin/users/update", requireAdminSession, handleAdminUserUpdate);
app.post("/api/admin/users/delete", requireAdminSession, handleAdminUserDelete);
app.get("/api/admin/notice", requireAdminSession, handleAdminNoticeGet);
app.post("/api/admin/notice", requireAdminSession, handleAdminNoticeUpdate);
app.get("/api/admin/deposit/assets", requireAdminSession, handleAdminDepositAssetsList);
app.post("/api/admin/deposit/assets", requireAdminSession, handleAdminDepositAssetUpsert);
app.post("/api/admin/deposit/assets/delete", requireAdminSession, handleAdminDepositAssetDelete);
app.get("/api/admin/deposit/requests", requireAdminSession, handleAdminDepositRequestsList);
app.get("/api/admin/deposit/requests/:requestId", requireAdminSession, handleAdminDepositRequestDetail);
app.post("/api/admin/deposit/requests/review", requireAdminSession, handleAdminDepositRequestReview);
app.get("/api/admin/lum/plans", requireAdminSession, handleAdminLumPlansList);
app.post("/api/admin/lum/plans/create", requireAdminSession, handleAdminLumPlanCreate);
app.post("/api/admin/lum/plans/update", requireAdminSession, handleAdminLumPlanUpdate);
app.post("/api/admin/lum/plans/delete", requireAdminSession, handleAdminLumPlanDelete);
app.post("/api/admin/lum/plans/toggle-status", requireAdminSession, handleAdminLumPlanToggleStatus);
app.get("/api/admin/lum/investments", requireAdminSession, handleAdminLumInvestments);
app.post("/api/admin/lum/investments/review", requireAdminSession, handleAdminLumInvestmentReview);
app.post("/api/admin/lum/investments/force-settle", requireAdminSession, handleAdminLumForceSettle);
app.get("/api/admin/lum/dashboard-summary", requireAdminSession, handleAdminLumDashboardSummary);
app.post("/api/admin/lum/content/save", requireAdminSession, handleAdminLumContentSave);
app.get("/api/admin/binary/dashboard-summary", requireAdminSession, handleAdminBinaryDashboardSummary);
app.get("/api/admin/binary/categories", requireAdminSession, handleAdminBinaryCategories);
app.post("/api/admin/binary/categories/create", requireAdminSession, handleAdminBinaryCategoryCreate);
app.post("/api/admin/binary/categories/update", requireAdminSession, handleAdminBinaryCategoryUpdate);
app.post("/api/admin/binary/categories/delete", requireAdminSession, handleAdminBinaryCategoryDelete);
app.get("/api/admin/binary/pairs", requireAdminSession, handleAdminBinaryPairs);
app.post("/api/admin/binary/pairs/create", requireAdminSession, handleAdminBinaryPairCreate);
app.post("/api/admin/binary/pairs/update", requireAdminSession, handleAdminBinaryPairUpdate);
app.post("/api/admin/binary/pairs/delete", requireAdminSession, handleAdminBinaryPairDelete);
app.post("/api/admin/binary/pairs/toggle-status", requireAdminSession, handleAdminBinaryPairToggle);
app.get("/api/admin/binary/period-rules", requireAdminSession, handleAdminBinaryPeriodRules);
app.post("/api/admin/binary/period-rules/save", requireAdminSession, handleAdminBinaryPeriodRuleSave);
app.get("/api/admin/binary/trades", requireAdminSession, handleAdminBinaryTrades);
app.post("/api/admin/binary/trades/settle", requireAdminSession, handleAdminBinaryTradeSettle);
app.post("/api/admin/binary/trades/cancel", requireAdminSession, handleAdminBinaryTradeCancel);
app.get("/api/admin/binary/engine-settings", requireAdminSession, handleAdminBinaryEngineSettingsGet);
app.post("/api/admin/binary/engine-settings/save", requireAdminSession, handleAdminBinaryEngineSettingsSave);
app.post("/api/admin/binary/manual-tick/push", requireAdminSession, handleAdminBinaryManualTickPush);
app.get("/api/admin/transaction/dashboard-summary", requireAdminSession, handleAdminTransactionDashboardSummary);
app.get("/api/admin/transaction/engine-settings", requireAdminSession, handleAdminTransactionEngineSettingsGet);
app.post("/api/admin/transaction/engine-settings/save", requireAdminSession, handleAdminTransactionEngineSettingsSave);
app.get("/api/admin/transaction/convert/pairs", requireAdminSession, handleAdminTransactionConvertPairsList);
app.post("/api/admin/transaction/convert/pairs/create", requireAdminSession, handleAdminTransactionConvertPairCreate);
app.post("/api/admin/transaction/convert/pairs/update", requireAdminSession, handleAdminTransactionConvertPairUpdate);
app.post("/api/admin/transaction/convert/pairs/delete", requireAdminSession, handleAdminTransactionConvertPairDelete);
app.post("/api/admin/transaction/convert/pairs/toggle-status", requireAdminSession, handleAdminTransactionConvertPairToggleStatus);
app.get("/api/admin/transaction/convert/orders", requireAdminSession, handleAdminTransactionConvertOrdersList);
app.post("/api/admin/transaction/convert/manual-rate/push", requireAdminSession, handleAdminTransactionConvertManualRatePush);
app.get("/api/admin/transaction/spot/pairs", requireAdminSession, handleAdminTransactionSpotPairsList);
app.post("/api/admin/transaction/spot/pairs/create", requireAdminSession, handleAdminTransactionSpotPairCreate);
app.post("/api/admin/transaction/spot/pairs/update", requireAdminSession, handleAdminTransactionSpotPairUpdate);
app.post("/api/admin/transaction/spot/pairs/delete", requireAdminSession, handleAdminTransactionSpotPairDelete);
app.post("/api/admin/transaction/spot/pairs/toggle-status", requireAdminSession, handleAdminTransactionSpotPairToggleStatus);
app.get("/api/admin/transaction/spot/orders", requireAdminSession, handleAdminTransactionSpotOrdersList);
app.post("/api/admin/transaction/spot/order/cancel", requireAdminSession, handleAdminTransactionSpotOrderCancel);
app.post("/api/admin/transaction/spot/order/force-fill", requireAdminSession, handleAdminTransactionSpotOrderForceFill);
app.post("/api/admin/transaction/spot/manual-tick/push", requireAdminSession, handleAdminTransactionSpotManualTickPush);
app.post("/api/admin/transaction/spot/feed-settings/save", requireAdminSession, handleAdminTransactionSpotFeedSettingsSave);
app.get("/api/admin/transaction/audit", requireAdminSession, handleAdminTransactionAuditList);

if (shouldServeStaticAssets) {
  app.get("/", (_req, res) => {
    res.sendFile(path.join(staticDistDir, "index.html"));
  });

  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(path.join(staticDistDir, "index.html"));
  });
}

if (shouldUseBlobDbSync && !restoredFromBlob) {
  try {
    await persistDbToBlob();
  } catch (error) {
    // Ignore initial persistence failures and keep runtime functional.
    // eslint-disable-next-line no-console
    console.error("[auth-api] initial blob persistence failed:", error?.message || error);
  }
}

const isExecutedDirectly = (() => {
  if (!process.argv[1]) {
    return false;
  }
  return path.resolve(process.argv[1]) === __filename;
})();

if (isExecutedDirectly) {
  app.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`[auth-api] running on http://${HOST}:${PORT}`);
  });
}

export default app;
