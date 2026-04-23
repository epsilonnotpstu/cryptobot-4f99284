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
    message TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
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
}

ensureUserProfileColumns();

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
      kyc_updated_at = @kycUpdatedAt
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
const listLatestKycSubmissionsStatement = db.prepare(`
  SELECT k.id, k.user_id, k.full_name, k.certification, k.ssn, k.front_file_name, k.front_file_data,
    k.back_file_name, k.back_file_data,
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
  SELECT * FROM platform_notices
  WHERE is_active = 1
  ORDER BY updated_at DESC, id DESC
  LIMIT 1
`);
const clearActiveNoticesStatement = db.prepare(`
  UPDATE platform_notices
  SET is_active = 0,
      updated_at = @updatedAt
  WHERE is_active = 1
`);
const insertNoticeStatement = db.prepare(`
  INSERT INTO platform_notices (message, is_active, created_at, updated_at)
  VALUES (@message, @isActive, @createdAt, @updatedAt)
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
    d.recharge_address_snapshot, d.amount_usd, d.screenshot_file_name, d.screenshot_file_data,
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
const findAdminDepositRequestByIdStatement = db.prepare(`
  SELECT d.id, d.user_id, d.asset_id, d.asset_symbol, d.asset_name, d.chain_name,
         d.recharge_address_snapshot, d.amount_usd, d.screenshot_file_name, d.screenshot_file_data,
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
         u.email, u.created_at, COALESCE(SUM(w.total_usd), 0) AS total_balance_usd,
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
         u.email, u.created_at, COALESCE(SUM(w.total_usd), 0) AS total_balance_usd,
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
const findAdminUserByUserIdStatement = db.prepare(`
  SELECT u.user_id, u.name, u.first_name, u.last_name, u.mobile, u.avatar_url,
         u.account_role, u.account_status, u.kyc_status, u.auth_tag, u.kyc_updated_at,
         u.email, u.created_at, COALESCE(SUM(w.total_usd), 0) AS total_balance_usd,
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
const APP_NAME = process.env.APP_NAME || "CryptoBot Prime";
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

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass || !process.env.SMTP_FROM) {
    throw new Error(
      "SMTP is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM to .env.",
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
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

  return message || "Failed to send OTP email.";
}

async function sendOtpEmail({ email, otp, purpose, name }) {
  const transporter = getTransporter();
  const expiresInText = `${OTP_TTL_MINUTES} minute${OTP_TTL_MINUTES > 1 ? "s" : ""}`;
  const title = purpose === "signup" ? "Your signup verification code" : "Your password reset code";
  const intro =
    purpose === "signup"
      ? "Use this code to complete your CryptoBot Prime signup."
      : "Use this code to continue your CryptoBot Prime password reset.";

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
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
  });
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
  handleBinaryTradeOpen,
  handleBinaryActiveTrades,
  handleBinaryTradeHistory,
  handleBinaryTradeDetail,
  handleBinaryTradeSettle,
  handleAdminBinaryDashboardSummary,
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
});

const {
  handleSupportTicketsList,
  handleSupportTicketDetail,
  handleSupportTicketCreate,
  handleSupportTicketMessageSend,
  handleSupportTicketStatusUpdate,
  handleAdminSupportDashboardSummary,
  handleAdminSupportTickets,
  handleAdminSupportTicketDetail,
  handleAdminSupportReply,
  handleAdminSupportTicketUpdate,
  handleAdminSupportAuditLogs,
} = supportModule;

function buildNoticePayload(row) {
  if (!row) {
    return {
      message: "No notice posted yet.",
      updatedAt: "",
    };
  }
  return {
    noticeId: row.id,
    message: row.message || "",
    updatedAt: row.updated_at || row.created_at || "",
  };
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

    const email = normalizeEmail(req.body?.email || "");
    const password = req.body?.password || "";

    assertValidEmail(email);
    assertValidPassword(password);

    const user = findUserByEmailStatement.get(email);
    if (!user) {
      res.status(404).json({ error: "Admin account not found." });
      return;
    }
    if (!hasAdminRole(user.account_role || "")) {
      res.status(403).json({ error: "This account does not have admin access." });
      return;
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }

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
        "Testing phase: upload a smaller file. Premium backend DB হলে বড় সাইজ upload enable করা হবে.",
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

    res.json({
      message: "Submitted successfully. KYC is now pending admin review.",
      user: buildUserPayload(updatedUser || req.currentUser),
      kyc: buildKycSubmissionPayload(latestSubmission),
    });
  } catch (error) {
    res.status(error?.statusCode || 400).json({ error: error.message || "Could not submit KYC." });
  }
}

function handleAdminKycList(_req, res) {
  try {
    cleanupExpiredRecords();
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
      requests: rows.map((row) => buildKycAdminPayload(row, { includeSensitiveMedia: true })),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not load KYC requests." });
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

    res.json({
      user: buildAdminDirectoryUserPayload(userRow),
      wallet: readDashboardWallet(userId),
      history: {
        kyc: kycHistory,
        deposit: depositHistory,
      },
      latest: {
        kyc: kycHistory[0] || null,
        deposit: depositHistory[0] || null,
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
      deleteUserKycSubmissionsStatement.run(userId);
      deleteUserDepositRequestsStatement.run(userId);
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
    const authTag = deriveAuthTag(kycStatus);

    assertValidName(name);
    assertValidEmail(email);

    const sameEmailOwner = findUserByEmailStatement.get(email);
    if (sameEmailOwner && sameEmailOwner.user_id !== userId) {
      throw new Error("This email is already used by another user.");
    }

    const nextWalletBalances = Array.isArray(req.body?.walletBalances) ? req.body.walletBalances : null;

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
      });

      if (nextWalletBalances) {
        for (const walletItem of nextWalletBalances) {
          const symbol = normalizeWalletScopedSymbol(walletItem?.symbol || "");
          const assetName = sanitizeShortText(walletItem?.name || symbol || "Asset", 80);
          const totalUsd = Number(walletItem?.totalUsd || 0);

          if (!symbol) {
            continue;
          }
          if (!Number.isFinite(totalUsd) || totalUsd < 0) {
            throw new Error(`Wallet amount for ${symbol} must be a valid non-negative number.`);
          }

          setWalletBalanceStatement.run({
            userId,
            assetSymbol: symbol,
            assetName,
            totalUsd: Number(totalUsd.toFixed(8)),
            updatedAt: nowIso,
          });
        }
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

    res.json({
      message: "User profile updated successfully.",
      user: buildAdminDirectoryUserPayload(updatedUser),
      wallet: readDashboardWallet(userId),
      history: {
        kyc: kycHistory,
        deposit: depositHistory,
      },
      latest: {
        kyc: kycHistory[0] || null,
        deposit: depositHistory[0] || null,
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
    const notice = buildNoticePayload(getLatestActiveNoticeStatement.get());
    const wallet = readDashboardWallet(req.currentUser.userId);
    const depositAssets = listEnabledDepositAssetsStatement
      .all()
      .map((row) => buildDepositAssetPayload(row))
      .filter(Boolean);

    res.json({
      user: buildUserPayload(currentUser || req.currentUser),
      notice,
      wallet,
      deposit: {
        assets: depositAssets,
      },
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
    res.json({
      message: "Deposit request submitted successfully. Admin review pending.",
      request: buildDepositRequestPayload(createdRequest),
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
    res.json({
      notice: buildNoticePayload(getLatestActiveNoticeStatement.get()),
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
    const updateNoticeTransaction = db.transaction(() => {
      clearActiveNoticesStatement.run({ updatedAt: nowIso });
      insertNoticeStatement.run({
        message,
        isActive: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    });

    updateNoticeTransaction();
    await persistDbToBlobSafe("admin.notice.update");
    const latestNotice = getLatestActiveNoticeStatement.get();
    res.json({
      message: "Notice published successfully.",
      notice: buildNoticePayload(latestNotice),
    });
  } catch (error) {
    res.status(error?.statusCode || 400).json({ error: error.message || "Could not update notice." });
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

async function handleAdminDepositRequestsList(_req, res) {
  try {
    await syncDepositStateFromBlobSafe({ context: "admin.deposit.requests.list.pre" });
    cleanupExpiredRecords();
    const rows = listAdminDepositRequestsStatement.all();
    res.json({
      stats: {
        totalRequests: countDepositRequestsTotalStatement.get()?.total || 0,
        pendingRequests: countDepositRequestsByStatusStatement.get("pending")?.total || 0,
        approvedRequests: countDepositRequestsByStatusStatement.get("approved")?.total || 0,
        rejectedRequests: countDepositRequestsByStatusStatement.get("rejected")?.total || 0,
      },
      requests: rows
        .map((row) => buildDepositRequestPayload(row, { includeAdminFields: true, includeSensitiveMedia: true }))
        .filter(Boolean),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not load deposit requests." });
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

    const reviewedRequest = findAdminDepositRequestByIdStatement.get(requestId);
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
    case "deposit.create":
      requireSession(req, res, () => handleDepositCreate(req, res));
      return;
    case "deposit.records":
      requireSession(req, res, () => handleDepositRecords(req, res));
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
    case "admin.kyc.list":
      requireAdminSession(req, res, () => handleAdminKycList(req, res));
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
app.post("/api/admin/auth/signup", handleAdminSignup);
app.post("/api/admin/auth/login", handleAdminLogin);
app.get("/api/admin/auth/session", requireAdminSession, handleAdminSession);
app.post("/api/admin/auth/logout", requireAdminSession, handleAdminLogout);
app.get("/api/admin/kyc", requireAdminSession, handleAdminKycList);
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
