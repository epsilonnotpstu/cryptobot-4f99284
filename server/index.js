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
         u.auth_tag AS account_auth_tag
  FROM kyc_submissions k
  JOIN users u ON u.user_id = k.user_id
  WHERE k.id = ?
  LIMIT 1
`);
const listLatestKycSubmissionsStatement = db.prepare(`
  SELECT k.id, k.user_id, k.full_name, k.certification, k.ssn, k.front_file_name, k.back_file_name,
         k.status, k.note, k.submitted_at, k.reviewed_at, k.reviewed_by,
         u.name AS account_name, u.email AS account_email, u.kyc_status AS account_kyc_status,
         u.auth_tag AS account_auth_tag
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

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "4mb" }));

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

function buildKycSubmissionPayload(row) {
  if (!row) {
    return null;
  }

  return {
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
}

function buildKycAdminPayload(row) {
  if (!row) {
    return null;
  }

  return {
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
    accountKycStatus: normalizeKycStatus(row.account_kyc_status),
    accountAuthTag: row.account_auth_tag || deriveAuthTag(normalizeKycStatus(row.account_kyc_status)),
  };
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
      requests: rows.map((row) => buildKycAdminPayload(row)),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not load KYC requests." });
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
    if (decision !== "authenticated" && decision !== "rejected") {
      throw new Error("Decision must be authenticated or rejected.");
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

    res.json({
      message: decision === "authenticated" ? "User is now authenticated." : "KYC request rejected.",
      user: buildUserPayload(updatedUser || { user_id: submission.user_id }),
      request: buildKycAdminPayload(reviewedRequest),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || "Could not review KYC request." });
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
    case "admin.kyc.list":
      handleAdminKycList(req, res);
      return;
    case "admin.kyc.review":
      handleAdminKycReview(req, res);
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
app.get("/api/admin/kyc", handleAdminKycList);
app.post("/api/admin/kyc/review", handleAdminKycReview);

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
