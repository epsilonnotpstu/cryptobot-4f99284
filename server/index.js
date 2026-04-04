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

dotenv.config();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
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
const dataDir = process.env.AUTH_DATA_DIR
  ? path.resolve(process.env.AUTH_DATA_DIR)
  : isVercelRuntime
    ? path.join("/tmp", "cryptobot2-auth-data")
    : path.join(rootDir, "server", "data");

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "auth.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    mobile TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
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

const createUserStatement = db.prepare(`
  INSERT INTO users (
    user_id,
    name,
    first_name,
    last_name,
    mobile,
    avatar_url,
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
         users.kyc_status, users.auth_tag, users.kyc_updated_at, users.email
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
const countUsersByKycStatusStatement = db.prepare("SELECT COUNT(*) AS total FROM users WHERE kyc_status = ?");
const findKycSubmissionWithUserByIdStatement = db.prepare(`
  SELECT k.id, k.user_id, k.full_name, k.certification, k.ssn, k.front_file_name, k.back_file_name,
         k.status, k.note, k.submitted_at, k.reviewed_at, k.reviewed_by,
         u.name AS account_name, u.email AS account_email, u.kyc_status AS account_kyc_status,
    u.auth_tag AS account_auth_tag, u.avatar_url AS account_avatar_url
  FROM kyc_submissions k
  JOIN users u ON u.user_id = k.user_id
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
  JOIN users u ON u.user_id = k.user_id
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
const insertDepositRequestStatement = db.prepare(`
  INSERT INTO deposit_requests (
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
const listAdminUsersStatement = db.prepare(`
  SELECT user_id, name, first_name, last_name, mobile, avatar_url,
         kyc_status, auth_tag, kyc_updated_at, email, created_at
  FROM users
  ORDER BY created_at DESC, id DESC
  LIMIT 1000
`);
const findAdminUserByUserIdStatement = db.prepare(`
  SELECT user_id, name, first_name, last_name, mobile, avatar_url,
         kyc_status, auth_tag, kyc_updated_at, email, created_at
  FROM users
  WHERE user_id = ?
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
  return {
    symbol: normalizeAssetSymbol(row.asset_symbol || ""),
    name: sanitizeShortText(row.asset_name || "", 80),
    totalUsd: Number(row.total_usd || 0),
    updatedAt: row.updated_at || "",
  };
}

function buildDepositRequestPayload(row, options = {}) {
  if (!row) {
    return null;
  }

  const includeAdminFields = Boolean(options.includeAdminFields);
  const includeSensitiveMedia = Boolean(options.includeSensitiveMedia);
  const payload = {
    requestId: row.id,
    userId: row.user_id,
    assetId: row.asset_id,
    assetSymbol: normalizeAssetSymbol(row.asset_symbol || ""),
    assetName: sanitizeShortText(row.asset_name || "", 80),
    chainName: sanitizeShortText(row.chain_name || "", 80),
    rechargeAddress: sanitizeShortText(row.recharge_address_snapshot || "", 180),
    amountUsd: Number(row.amount_usd || 0),
    screenshotFileName: sanitizeShortText(row.screenshot_file_name || "", 180),
    status: normalizeDepositStatus(row.status || "pending"),
    note: row.note || "",
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

function readDashboardWallet(userId) {
  const balances = listUserWalletBalancesStatement
    .all(userId)
    .map((row) => buildWalletBalancePayload(row))
    .filter(Boolean);
  const usdBalance = balances.find((item) => normalizeAssetSymbol(item.symbol) === "USD");
  const totalSpotAssetsUsd = usdBalance ? Number(Number(usdBalance.totalUsd || 0).toFixed(8)) : null;

  return {
    totalSpotAssetsUsd,
    balances,
  };
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
  const authTag = sanitizeShortText(user.auth_tag || deriveAuthTag(kycStatus), 60) || deriveAuthTag(kycStatus);

  return {
    userId: user.user_id || "",
    name,
    firstName,
    lastName,
    mobile: sanitizeMobile(user.mobile || ""),
    avatarUrl: sanitizeAvatarUrl(user.avatar_url || ""),
    kycStatus,
    authTag,
    isKycAuthenticated: kycStatus === "authenticated",
    kycUpdatedAt: user.kyc_updated_at || "",
    email: user.email || "",
    createdAt: user.created_at || "",
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

function createSessionForUser(userId) {
  const sessionToken = generateOpaqueToken();
  const createdAt = getNow();
  insertSessionStatement.run({
    userId,
    sessionTokenHash: createHash(sessionToken),
    expiresAt: toIso(addDays(createdAt, SESSION_TTL_DAYS)),
    createdAt: toIso(createdAt),
  });
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
  if (!session || isExpired(session.session_expires_at)) {
    res.status(401).json({ error: "Session expired. Please login again." });
    return;
  }

  req.currentUser = {
    ...buildUserPayload(session),
  };
  req.sessionToken = sessionToken;
  next();
}

app.get("/api/health", (_req, res) => {
  cleanupExpiredRecords();
  res.json({ ok: true, app: APP_NAME });
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
      kycStatus: "pending",
      authTag: "kyc-pending",
      kycUpdatedAt: createdAt,
      email,
      passwordHash,
      createdAt,
    });

    const sessionToken = createSessionForUser(userId);
    const createdUser = findUserByUserIdStatement.get(userId);
    res.json({
      message: "Account created successfully.",
      sessionToken,
      user: buildUserPayload(createdUser || { user_id: userId, name, email }),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Signup failed." });
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

function handleKycSubmit(req, res) {
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

    const updatedUser = findUserByUserIdStatement.get(req.currentUser.userId);
    const latestSubmission = findLatestKycSubmissionByUserStatement.get(req.currentUser.userId);

    res.json({
      message: "Submitted successfully. KYC is now pending admin review.",
      user: buildUserPayload(updatedUser || req.currentUser),
      kyc: buildKycSubmissionPayload(latestSubmission),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not submit KYC." });
  }
}

function handleAdminKycList(_req, res) {
  try {
    cleanupExpiredRecords();
    const rows = listLatestKycSubmissionsStatement.all();
    const pending = countUsersByKycStatusStatement.get("pending")?.total || 0;
    const authenticated = countUsersByKycStatusStatement.get("authenticated")?.total || 0;
    const rejected = countUsersByKycStatusStatement.get("rejected")?.total || 0;
    const totalUsers = countUsersStatement.get()?.total || 0;

    res.json({
      stats: {
        totalUsers,
        pendingVerifications: pending,
        authenticatedUsers: authenticated,
        rejectedUsers: rejected,
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
    const filterStatus = rawStatus ? normalizeKycStatus(rawStatus) : "";

    const allUsers = listAdminUsersStatement
      .all()
      .map((row) => buildAdminDirectoryUserPayload(row))
      .filter(Boolean);
    const users = filterStatus ? allUsers.filter((row) => row.kycStatus === filterStatus) : allUsers;

    res.json({
      stats: {
        totalUsers: countUsersStatement.get()?.total || 0,
        pendingVerifications: countUsersByKycStatusStatement.get("pending")?.total || 0,
        authenticatedUsers: countUsersByKycStatusStatement.get("authenticated")?.total || 0,
        rejectedUsers: countUsersByKycStatusStatement.get("rejected")?.total || 0,
      },
      filter: filterStatus || "all",
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

    const userRow = findAdminUserByUserIdStatement.get(userId);
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

function handleAdminUserUpdate(req, res) {
  try {
    cleanupExpiredRecords();
    const userId = sanitizeShortText(req.body?.userId || "", 24);
    if (!userId) {
      throw new Error("Valid userId is required.");
    }

    const existingUser = findAdminUserByUserIdStatement.get(userId);
    if (!existingUser) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    const name = sanitizeShortText(req.body?.name || existingUser.name || "", 120);
    const firstName = sanitizeShortText(req.body?.firstName || existingUser.first_name || "", 80);
    const lastName = sanitizeShortText(req.body?.lastName || existingUser.last_name || "", 80);
    const mobile = sanitizeMobile(req.body?.mobile || existingUser.mobile || "");
    const avatarUrl = sanitizeAvatarUrl(req.body?.avatarUrl || existingUser.avatar_url || "");
    const email = normalizeEmail(req.body?.email || existingUser.email || "");
    const kycStatus = normalizeKycStatus(req.body?.kycStatus || existingUser.kyc_status || "pending");
    const authTag = deriveAuthTag(kycStatus);

    assertValidName(name);
    assertValidEmail(email);

    const sameEmailOwner = findUserByEmailStatement.get(email);
    if (sameEmailOwner && sameEmailOwner.user_id !== userId) {
      throw new Error("This email is already used by another user.");
    }

    const nowIso = toIso(getNow());
    const nextWalletBalances = Array.isArray(req.body?.walletBalances) ? req.body.walletBalances : null;

    const updateTransaction = db.transaction(() => {
      updateUserProfileByAdminStatement.run({
        userId,
        name,
        firstName,
        lastName,
        mobile,
        avatarUrl,
        email,
        kycStatus,
        authTag,
        kycUpdatedAt: nowIso,
      });

      if (nextWalletBalances) {
        for (const walletItem of nextWalletBalances) {
          const symbol = normalizeAssetSymbol(walletItem?.symbol || "");
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

    const updatedUser = findAdminUserByUserIdStatement.get(userId);
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

function handleAdminKycReview(req, res) {
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
    res.status(400).json({ error: error.message || "Could not review KYC request." });
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

function handleDepositCreate(req, res) {
  try {
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
    const insertResult = insertDepositRequestStatement.run({
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

    const createdRequest = findDepositRequestByIdStatement.get(insertResult.lastInsertRowid);
    res.json({
      message: "Deposit request submitted successfully. Admin review pending.",
      request: buildDepositRequestPayload(createdRequest),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not submit deposit request." });
  }
}

function handleDepositRecords(req, res) {
  try {
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

function handleAdminNoticeUpdate(req, res) {
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
    const latestNotice = getLatestActiveNoticeStatement.get();
    res.json({
      message: "Notice published successfully.",
      notice: buildNoticePayload(latestNotice),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not update notice." });
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

function handleAdminDepositAssetUpsert(req, res) {
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

    const createdAsset = findDepositAssetByIdStatement.get(insertResult.lastInsertRowid);
    res.json({
      message: "Deposit asset created.",
      asset: buildDepositAssetPayload(createdAsset),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not save deposit asset." });
  }
}

function handleAdminDepositRequestsList(_req, res) {
  try {
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

function handleAdminDepositRequestReview(req, res) {
  try {
    cleanupExpiredRecords();
    const requestId = Number(req.body.requestId);
    const decision = normalizeDepositStatus(req.body.decision || "");
    const note = sanitizeShortText(req.body.note || "", 300);

    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new Error("Valid requestId is required.");
    }
    if (decision !== "approved" && decision !== "rejected" && decision !== "pending") {
      throw new Error("Decision must be approved, rejected, or pending.");
    }
    if (decision === "rejected" && !note) {
      throw new Error("Reject reason is required.");
    }

    const request = findDepositRequestByIdStatement.get(requestId);
    if (!request) {
      res.status(404).json({ error: "Deposit request not found." });
      return;
    }
    const previousStatus = normalizeDepositStatus(request.status || "pending");

    const reviewedAt = toIso(getNow());
    const reviewTransaction = db.transaction(() => {
      updateDepositRequestReviewStatement.run({
        id: requestId,
        status: decision,
        note,
        reviewedAt,
        reviewedBy: "admin",
      });

      if (previousStatus !== "approved" && decision === "approved") {
        upsertWalletBalanceStatement.run({
          userId: request.user_id,
          assetSymbol: normalizeAssetSymbol(request.asset_symbol || ""),
          assetName: sanitizeShortText(request.asset_name || "", 80),
          totalUsd: Number(request.amount_usd || 0),
          updatedAt: reviewedAt,
        });
      }

      if (previousStatus === "approved" && decision !== "approved") {
        const assetSymbol = normalizeAssetSymbol(request.asset_symbol || "");
        const existingBalance = findWalletBalanceByUserAssetStatement.get(request.user_id, assetSymbol);
        const currentTotal = Number(existingBalance?.total_usd || 0);
        const deductedTotal = Math.max(0, currentTotal - Number(request.amount_usd || 0));

        setWalletBalanceStatement.run({
          userId: request.user_id,
          assetSymbol,
          assetName: sanitizeShortText(request.asset_name || assetSymbol || "Asset", 80),
          totalUsd: Number(deductedTotal.toFixed(8)),
          updatedAt: reviewedAt,
        });
      }
    });

    reviewTransaction();

    const reviewedRequest = findAdminDepositRequestByIdStatement.get(requestId);
    const responseMessageByDecision = {
      approved: "Deposit approved and wallet adjusted.",
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
    res.status(400).json({ error: error.message || "Could not review deposit request." });
  }
}

app.post("/api/auth/gateway", async (req, res) => {
  const action = String(req.body?.action || "").trim().toLowerCase();

  switch (action) {
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
    case "admin.kyc.list":
      handleAdminKycList(req, res);
      return;
    case "admin.users.list":
      handleAdminUsersList(req, res);
      return;
    case "admin.user.detail":
      handleAdminUserDetail(req, res);
      return;
    case "admin.user.update":
      handleAdminUserUpdate(req, res);
      return;
    case "admin.kyc.review":
      handleAdminKycReview(req, res);
      return;
    case "admin.notice.get":
      handleAdminNoticeGet(req, res);
      return;
    case "admin.notice.update":
      handleAdminNoticeUpdate(req, res);
      return;
    case "admin.deposit.assets.list":
      handleAdminDepositAssetsList(req, res);
      return;
    case "admin.deposit.asset.upsert":
      handleAdminDepositAssetUpsert(req, res);
      return;
    case "admin.deposit.requests.list":
      handleAdminDepositRequestsList(req, res);
      return;
    case "admin.deposit.request.review":
      handleAdminDepositRequestReview(req, res);
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
app.get("/api/admin/kyc", handleAdminKycList);
app.post("/api/admin/kyc/review", handleAdminKycReview);
app.get("/api/admin/users", handleAdminUsersList);
app.post("/api/admin/users/list", handleAdminUsersList);
app.get("/api/admin/users/:userId", handleAdminUserDetail);
app.post("/api/admin/users/detail", handleAdminUserDetail);
app.post("/api/admin/users/update", handleAdminUserUpdate);
app.get("/api/admin/notice", handleAdminNoticeGet);
app.post("/api/admin/notice", handleAdminNoticeUpdate);
app.get("/api/admin/deposit/assets", handleAdminDepositAssetsList);
app.post("/api/admin/deposit/assets", handleAdminDepositAssetUpsert);
app.get("/api/admin/deposit/requests", handleAdminDepositRequestsList);
app.post("/api/admin/deposit/requests/review", handleAdminDepositRequestReview);

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
