function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toMoney(value = 0) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Number(numeric.toFixed(8));
}

function normalizeText(value = "") {
  return String(value || "").trim();
}

function normalizeUpper(value = "") {
  return normalizeText(value).toUpperCase();
}

function normalizeLower(value = "") {
  return normalizeText(value).toLowerCase();
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = normalizeLower(value);
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function buildTransferRef() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `WTR-${stamp}-${rand}`;
}

function buildConversionRef() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `WCV-${stamp}-${rand}`;
}

function buildWithdrawalRef() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `WDR-${stamp}-${rand}`;
}

function parseIsoMs(value = "") {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildPagination(rawPage, rawLimit, defaultLimit = 20, maxLimit = 200) {
  const page = Math.max(1, Math.floor(toNumber(rawPage, 1)));
  const limit = Math.max(1, Math.min(maxLimit, Math.floor(toNumber(rawLimit, defaultLimit))));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function percent(value, total) {
  if (!total || total <= 0) {
    return 0;
  }
  return Number(((Number(value || 0) / total) * 100).toFixed(2));
}

const CORE_WALLET_META = [
  {
    scope: "SPOT",
    symbol: "SPOT_USDT",
    title: "Spot Wallet",
    subtitle: "Primary custody wallet",
  },
  {
    scope: "MAIN",
    symbol: "MAIN_USDT",
    title: "Main Wallet",
    subtitle: "Internal reserve wallet",
  },
  {
    scope: "BINARY",
    symbol: "BINARY_USDT",
    title: "Binary Wallet",
    subtitle: "Dedicated binary trading wallet",
  },
];

const CORE_WALLET_SET = new Set(CORE_WALLET_META.map((item) => item.symbol));

const HISTORY_TYPE_SET = new Set(["all", "deposit", "withdraw", "transfer", "convert", "binary", "lum"]);

const DEFAULT_WITHDRAW_ASSETS = ["USDT", "BTC", "ETH"];

const DEFAULT_WITHDRAW_NETWORKS = {
  USDT: ["TRC20", "ERC20", "BEP20"],
  BTC: ["BTC"],
  ETH: ["ERC20", "BEP20"],
};

const DEFAULT_ASSET_PRICE_USD = {
  USDT: 1,
  BTC: 68000,
  ETH: 3500,
  BNB: 620,
  SOL: 155,
  ADA: 0.75,
  XRP: 0.72,
  DOGE: 0.22,
};

const WITHDRAW_OPEN_STATUS_SET = new Set(["pending", "processing", "approved"]);
const WITHDRAW_FINAL_STATUS_SET = new Set(["completed", "rejected", "cancelled"]);
const WITHDRAW_REVIEW_ALLOWED_SET = new Set(["pending", "processing", "approved", "rejected", "cancelled"]);

function normalizeAssetCode(value = "") {
  return normalizeUpper(value).replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

function normalizeWalletSymbol(value = "", fallback = "SPOT_USDT") {
  const raw = normalizeUpper(value).replace(/[^A-Z0-9_]/g, "");
  const fallbackRaw = normalizeUpper(fallback).replace(/[^A-Z0-9_]/g, "") || "SPOT_USDT";
  const normalized = raw || fallbackRaw;

  const aliases = {
    SPOTUSDT: "SPOT_USDT",
    MAINUSDT: "MAIN_USDT",
    BINARYUSDT: "BINARY_USDT",
  };

  if (aliases[normalized]) {
    return aliases[normalized];
  }

  const match = normalized.match(/^(SPOT|MAIN|BINARY)_?([A-Z0-9]+)$/);
  if (match) {
    return `${match[1]}_${match[2]}`;
  }

  if (/^[A-Z0-9]+$/.test(normalized)) {
    const asset = normalized === "USD" ? "USDT" : normalized;
    return `SPOT_${asset}`;
  }

  return "SPOT_USDT";
}

function getWalletScope(walletSymbol = "") {
  const symbol = normalizeWalletSymbol(walletSymbol, walletSymbol);
  if (symbol.startsWith("MAIN_")) {
    return "MAIN";
  }
  if (symbol.startsWith("BINARY_")) {
    return "BINARY";
  }
  return "SPOT";
}

function toCoreWalletSymbol(walletSymbol = "") {
  const scope = getWalletScope(walletSymbol);
  return `${scope}_USDT`;
}

function buildScopedWalletSymbol(scope = "SPOT", assetSymbol = "USDT") {
  const normalizedScope = normalizeUpper(scope);
  const normalizedAsset = normalizeAssetCode(assetSymbol || "USDT") || "USDT";
  return normalizeWalletSymbol(`${normalizedScope}_${normalizedAsset}`, `${normalizedScope}_${normalizedAsset}`);
}

function normalizeHistoryType(value = "all") {
  const normalized = normalizeLower(value || "all");
  if (HISTORY_TYPE_SET.has(normalized)) {
    return normalized;
  }
  return "all";
}

function normalizeWalletFilter(value = "all") {
  const raw = normalizeLower(value || "all");
  if (!raw || raw === "all") {
    return "all";
  }
  const normalized = normalizeWalletSymbol(value || "SPOT_USDT", "SPOT_USDT");
  if (!CORE_WALLET_SET.has(normalized)) {
    throw new Error("Unsupported wallet filter.");
  }
  return normalized;
}

function mapStatus(value = "") {
  const normalized = normalizeLower(value);
  return normalized || "pending";
}

function normalizeTransferStatus(value = "") {
  const normalized = normalizeLower(value);
  if (["completed", "cancelled", "failed"].includes(normalized)) {
    return normalized;
  }
  return "completed";
}

function normalizeConversionStatus(value = "") {
  const normalized = normalizeLower(value);
  if (["completed", "cancelled", "failed"].includes(normalized)) {
    return normalized;
  }
  return "completed";
}

function normalizeWithdrawalStatus(value = "") {
  const normalized = normalizeLower(value);
  if (["pending", "approved", "rejected", "processing", "completed", "cancelled"].includes(normalized)) {
    return normalized;
  }
  return "pending";
}

function normalizeMovementType(value = "") {
  const normalized = normalizeLower(value);
  if (["credit", "debit", "lock", "unlock"].includes(normalized)) {
    return normalized;
  }
  return "credit";
}

export function createAssetsModule({
  db,
  getNow,
  toIso,
  normalizeAssetSymbol,
  normalizeUsdAmount,
  sanitizeShortText,
}) {
  const defaultWithdrawMinUsd = Math.max(0.01, toNumber(process.env.WITHDRAW_MIN_USD, 10));
  const defaultWithdrawMaxUsd = Math.max(defaultWithdrawMinUsd, toNumber(process.env.WITHDRAW_MAX_USD, 500000));
  const defaultWithdrawFeePercent = Math.max(0, toNumber(process.env.WITHDRAW_FEE_PERCENT, 0.2));
  const defaultConvertFeePercent = Math.max(0, toNumber(process.env.ASSETS_CONVERT_FEE_PERCENT, 0.1));

  const defaultAllowWithdrawFromMain = normalizeBoolean(process.env.ASSETS_ALLOW_MAIN_WITHDRAW, false);
  const defaultAllowWithdrawFromBinary = normalizeBoolean(process.env.ASSETS_ALLOW_BINARY_WITHDRAW, false);
  const defaultAllowMainBinaryTransfer = normalizeBoolean(process.env.ASSETS_ALLOW_MAIN_BINARY_TRANSFER, false);

  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_transfer_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_ref TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      from_wallet_symbol TEXT NOT NULL,
      to_wallet_symbol TEXT NOT NULL,
      asset_symbol TEXT NOT NULL DEFAULT 'USDT',
      amount_usd REAL NOT NULL,
      status TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wallet_conversion_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversion_ref TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      wallet_symbol TEXT NOT NULL,
      from_asset_symbol TEXT NOT NULL,
      to_asset_symbol TEXT NOT NULL,
      source_amount REAL NOT NULL,
      rate_snapshot REAL NOT NULL,
      converted_amount REAL NOT NULL,
      fee_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      withdrawal_ref TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      wallet_symbol TEXT NOT NULL DEFAULT 'SPOT_USDT',
      asset_symbol TEXT NOT NULL,
      network_type TEXT,
      destination_address TEXT,
      destination_label TEXT,
      amount_usd REAL NOT NULL,
      fee_amount_usd REAL NOT NULL DEFAULT 0,
      net_amount_usd REAL NOT NULL,
      status TEXT NOT NULL,
      note TEXT,
      submitted_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asset_wallet_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      ledger_ref_type TEXT NOT NULL,
      ledger_ref_id TEXT,
      wallet_symbol TEXT NOT NULL,
      asset_symbol TEXT NOT NULL DEFAULT 'USDT',
      movement_type TEXT NOT NULL,
      amount_usd REAL NOT NULL,
      balance_before_usd REAL,
      balance_after_usd REAL,
      note TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT
    );

    CREATE TABLE IF NOT EXISTS asset_admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_user_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS asset_module_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      deposits_credit_wallet_symbol TEXT NOT NULL DEFAULT 'SPOT_USDT',
      withdrawals_enabled INTEGER NOT NULL DEFAULT 1,
      withdraw_allowed_from_spot INTEGER NOT NULL DEFAULT 1,
      withdraw_allowed_from_main INTEGER NOT NULL DEFAULT 0,
      withdraw_allowed_from_binary INTEGER NOT NULL DEFAULT 0,
      min_withdraw_usd REAL NOT NULL DEFAULT 10,
      max_withdraw_usd REAL,
      withdraw_fee_percent REAL NOT NULL DEFAULT 0.2,
      supported_withdraw_assets_json TEXT NOT NULL DEFAULT '["USDT","BTC","ETH"]',
      withdraw_network_map_json TEXT NOT NULL DEFAULT '{"USDT":["TRC20","ERC20","BEP20"],"BTC":["BTC"],"ETH":["ERC20","BEP20"]}',
      transfers_enabled INTEGER NOT NULL DEFAULT 1,
      convert_enabled INTEGER NOT NULL DEFAULT 1,
      convert_fee_percent REAL NOT NULL DEFAULT 0.1,
      conversion_pairs_json TEXT NOT NULL DEFAULT '[]',
      allow_spot_to_binary INTEGER NOT NULL DEFAULT 1,
      allow_binary_to_spot INTEGER NOT NULL DEFAULT 1,
      allow_spot_to_main INTEGER NOT NULL DEFAULT 1,
      allow_main_to_spot INTEGER NOT NULL DEFAULT 1,
      allow_main_to_binary INTEGER NOT NULL DEFAULT 0,
      allow_binary_to_main INTEGER NOT NULL DEFAULT 0,
      auto_create_wallet_details INTEGER NOT NULL DEFAULT 1,
      wallet_freeze_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS wallet_freeze_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      wallet_symbol TEXT NOT NULL,
      freeze_deposit INTEGER NOT NULL DEFAULT 0,
      freeze_withdraw INTEGER NOT NULL DEFAULT 0,
      freeze_transfer INTEGER NOT NULL DEFAULT 0,
      freeze_convert INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT,
      UNIQUE(user_id, wallet_symbol)
    );

    CREATE INDEX IF NOT EXISTS idx_wallet_transfer_user_created ON wallet_transfer_requests(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_wallet_conversion_user_created ON wallet_conversion_requests(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_withdrawal_user_created ON withdrawal_requests(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_asset_wallet_ledger_user_created ON asset_wallet_ledger(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_asset_admin_audit_created ON asset_admin_audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_wallet_freeze_user_wallet ON wallet_freeze_rules(user_id, wallet_symbol);
  `);

  const findWalletDetailStatement = db.prepare(`
    SELECT user_id, asset_symbol, available_usd, locked_usd, reward_earned_usd, updated_at
    FROM user_wallet_balance_details
    WHERE user_id = ? AND asset_symbol = ?
    LIMIT 1
  `);
  const insertWalletDetailStatement = db.prepare(`
    INSERT INTO user_wallet_balance_details (
      user_id,
      asset_symbol,
      available_usd,
      locked_usd,
      reward_earned_usd,
      updated_at
    ) VALUES (
      @userId,
      @assetSymbol,
      @availableUsd,
      @lockedUsd,
      @rewardEarnedUsd,
      @updatedAt
    )
  `);
  const updateWalletDetailStatement = db.prepare(`
    UPDATE user_wallet_balance_details
    SET available_usd = @availableUsd,
        locked_usd = @lockedUsd,
        reward_earned_usd = @rewardEarnedUsd,
        updated_at = @updatedAt
    WHERE user_id = @userId AND asset_symbol = @assetSymbol
  `);
  const updateWalletDetailSymbolStatement = db.prepare(`
    UPDATE user_wallet_balance_details
    SET asset_symbol = @toSymbol
    WHERE user_id = @userId AND asset_symbol = @fromSymbol
  `);
  const deleteWalletDetailBySymbolStatement = db.prepare(`
    DELETE FROM user_wallet_balance_details
    WHERE user_id = @userId AND asset_symbol = @assetSymbol
  `);

  const findWalletSummaryStatement = db.prepare(`
    SELECT user_id, asset_symbol, asset_name, total_usd, updated_at
    FROM user_wallet_balances
    WHERE user_id = ? AND asset_symbol = ?
    LIMIT 1
  `);

  const setWalletSummaryStatement = db.prepare(`
    INSERT INTO user_wallet_balances (
      user_id,
      asset_symbol,
      asset_name,
      total_usd,
      updated_at
    ) VALUES (
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
  const updateWalletSummarySymbolStatement = db.prepare(`
    UPDATE user_wallet_balances
    SET asset_symbol = @toSymbol
    WHERE user_id = @userId AND asset_symbol = @fromSymbol
  `);
  const deleteWalletSummaryBySymbolStatement = db.prepare(`
    DELETE FROM user_wallet_balances
    WHERE user_id = @userId AND asset_symbol = @assetSymbol
  `);

  const listWalletDetailsByUserStatement = db.prepare(`
    SELECT user_id, asset_symbol, available_usd, locked_usd, reward_earned_usd, updated_at
    FROM user_wallet_balance_details
    WHERE user_id = ?
    ORDER BY asset_symbol ASC
  `);

  const listWalletSummariesByUserStatement = db.prepare(`
    SELECT user_id, asset_symbol, asset_name, total_usd, updated_at
    FROM user_wallet_balances
    WHERE user_id = ?
    ORDER BY asset_symbol ASC
  `);

  const insertTransferRequestStatement = db.prepare(`
    INSERT INTO wallet_transfer_requests (
      transfer_ref,
      user_id,
      from_wallet_symbol,
      to_wallet_symbol,
      asset_symbol,
      amount_usd,
      status,
      note,
      created_at,
      updated_at
    ) VALUES (
      @transferRef,
      @userId,
      @fromWalletSymbol,
      @toWalletSymbol,
      @assetSymbol,
      @amountUsd,
      @status,
      @note,
      @createdAt,
      @updatedAt
    )
  `);

  const listTransfersByUserStatement = db.prepare(`
    SELECT *
    FROM wallet_transfer_requests
    WHERE user_id = @userId
    ORDER BY created_at DESC, id DESC
    LIMIT @limit OFFSET @offset
  `);

  const countTransfersByUserStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM wallet_transfer_requests
    WHERE user_id = ?
  `);

  const insertConversionRequestStatement = db.prepare(`
    INSERT INTO wallet_conversion_requests (
      conversion_ref,
      user_id,
      wallet_symbol,
      from_asset_symbol,
      to_asset_symbol,
      source_amount,
      rate_snapshot,
      converted_amount,
      fee_amount,
      status,
      note,
      created_at,
      updated_at
    ) VALUES (
      @conversionRef,
      @userId,
      @walletSymbol,
      @fromAssetSymbol,
      @toAssetSymbol,
      @sourceAmount,
      @rateSnapshot,
      @convertedAmount,
      @feeAmount,
      @status,
      @note,
      @createdAt,
      @updatedAt
    )
  `);

  const listConversionsByUserStatement = db.prepare(`
    SELECT *
    FROM wallet_conversion_requests
    WHERE user_id = @userId
    ORDER BY created_at DESC, id DESC
    LIMIT @limit OFFSET @offset
  `);

  const countConversionsByUserStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM wallet_conversion_requests
    WHERE user_id = ?
  `);

  const insertWithdrawalRequestStatement = db.prepare(`
    INSERT INTO withdrawal_requests (
      withdrawal_ref,
      user_id,
      wallet_symbol,
      asset_symbol,
      network_type,
      destination_address,
      destination_label,
      amount_usd,
      fee_amount_usd,
      net_amount_usd,
      status,
      note,
      submitted_at,
      reviewed_at,
      reviewed_by,
      completed_at,
      created_at,
      updated_at
    ) VALUES (
      @withdrawalRef,
      @userId,
      @walletSymbol,
      @assetSymbol,
      @networkType,
      @destinationAddress,
      @destinationLabel,
      @amountUsd,
      @feeAmountUsd,
      @netAmountUsd,
      @status,
      @note,
      @submittedAt,
      @reviewedAt,
      @reviewedBy,
      @completedAt,
      @createdAt,
      @updatedAt
    )
  `);

  const listWithdrawalsByUserStatement = db.prepare(`
    SELECT *
    FROM withdrawal_requests
    WHERE user_id = @userId
    ORDER BY created_at DESC, id DESC
    LIMIT @limit OFFSET @offset
  `);

  const countWithdrawalsByUserStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM withdrawal_requests
    WHERE user_id = ?
  `);

  const findWithdrawalByIdStatement = db.prepare(`
    SELECT *
    FROM withdrawal_requests
    WHERE id = ?
    LIMIT 1
  `);

  const findWithdrawalByRefStatement = db.prepare(`
    SELECT *
    FROM withdrawal_requests
    WHERE withdrawal_ref = ?
    LIMIT 1
  `);

  const updateWithdrawalStatusStatement = db.prepare(`
    UPDATE withdrawal_requests
    SET status = @status,
        note = @note,
        reviewed_at = @reviewedAt,
        reviewed_by = @reviewedBy,
        completed_at = @completedAt,
        updated_at = @updatedAt
    WHERE id = @id
  `);

  const listWithdrawalsForAdminStatement = db.prepare(`
    SELECT w.*, u.name AS account_name, u.email AS account_email
    FROM withdrawal_requests w
    LEFT JOIN users u ON u.user_id = w.user_id
    WHERE (@statusFilter = 'all' OR w.status = @statusFilter)
      AND (@assetFilter = 'all' OR w.asset_symbol = @assetFilter)
      AND (@networkFilter = 'all' OR IFNULL(w.network_type, '') = @networkFilter)
      AND (@walletFilter = 'all' OR w.wallet_symbol = @walletFilter)
      AND (@userKeyword = '' OR w.user_id LIKE @likeUserKeyword OR u.email LIKE @likeUserKeyword OR u.name LIKE @likeUserKeyword)
    ORDER BY w.created_at DESC, w.id DESC
    LIMIT @limit OFFSET @offset
  `);

  const countWithdrawalsForAdminStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM withdrawal_requests w
    LEFT JOIN users u ON u.user_id = w.user_id
    WHERE (@statusFilter = 'all' OR w.status = @statusFilter)
      AND (@assetFilter = 'all' OR w.asset_symbol = @assetFilter)
      AND (@networkFilter = 'all' OR IFNULL(w.network_type, '') = @networkFilter)
      AND (@walletFilter = 'all' OR w.wallet_symbol = @walletFilter)
      AND (@userKeyword = '' OR w.user_id LIKE @likeUserKeyword OR u.email LIKE @likeUserKeyword OR u.name LIKE @likeUserKeyword)
  `);

  const listTransfersForAdminStatement = db.prepare(`
    SELECT t.*, u.name AS account_name, u.email AS account_email
    FROM wallet_transfer_requests t
    LEFT JOIN users u ON u.user_id = t.user_id
    WHERE (@statusFilter = 'all' OR t.status = @statusFilter)
      AND (@routeFilter = 'all' OR (t.from_wallet_symbol || '->' || t.to_wallet_symbol) = @routeFilter)
      AND (@walletFilter = 'all' OR t.from_wallet_symbol = @walletFilter OR t.to_wallet_symbol = @walletFilter)
      AND (@userKeyword = '' OR t.user_id LIKE @likeUserKeyword OR u.email LIKE @likeUserKeyword OR u.name LIKE @likeUserKeyword)
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT @limit OFFSET @offset
  `);

  const countTransfersForAdminStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM wallet_transfer_requests t
    LEFT JOIN users u ON u.user_id = t.user_id
    WHERE (@statusFilter = 'all' OR t.status = @statusFilter)
      AND (@routeFilter = 'all' OR (t.from_wallet_symbol || '->' || t.to_wallet_symbol) = @routeFilter)
      AND (@walletFilter = 'all' OR t.from_wallet_symbol = @walletFilter OR t.to_wallet_symbol = @walletFilter)
      AND (@userKeyword = '' OR t.user_id LIKE @likeUserKeyword OR u.email LIKE @likeUserKeyword OR u.name LIKE @likeUserKeyword)
  `);

  const listConversionsForAdminStatement = db.prepare(`
    SELECT c.*, u.name AS account_name, u.email AS account_email
    FROM wallet_conversion_requests c
    LEFT JOIN users u ON u.user_id = c.user_id
    WHERE (@statusFilter = 'all' OR c.status = @statusFilter)
      AND (@walletFilter = 'all' OR c.wallet_symbol = @walletFilter)
      AND (@fromAssetFilter = 'all' OR c.from_asset_symbol = @fromAssetFilter)
      AND (@toAssetFilter = 'all' OR c.to_asset_symbol = @toAssetFilter)
      AND (@userKeyword = '' OR c.user_id LIKE @likeUserKeyword OR u.email LIKE @likeUserKeyword OR u.name LIKE @likeUserKeyword)
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT @limit OFFSET @offset
  `);

  const countConversionsForAdminStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM wallet_conversion_requests c
    LEFT JOIN users u ON u.user_id = c.user_id
    WHERE (@statusFilter = 'all' OR c.status = @statusFilter)
      AND (@walletFilter = 'all' OR c.wallet_symbol = @walletFilter)
      AND (@fromAssetFilter = 'all' OR c.from_asset_symbol = @fromAssetFilter)
      AND (@toAssetFilter = 'all' OR c.to_asset_symbol = @toAssetFilter)
      AND (@userKeyword = '' OR c.user_id LIKE @likeUserKeyword OR u.email LIKE @likeUserKeyword OR u.name LIKE @likeUserKeyword)
  `);

  const findAssetModuleSettingsStatement = db.prepare(`
    SELECT *
    FROM asset_module_settings
    WHERE id = 1
    LIMIT 1
  `);

  const upsertAssetModuleSettingsStatement = db.prepare(`
    INSERT INTO asset_module_settings (
      id,
      deposits_credit_wallet_symbol,
      withdrawals_enabled,
      withdraw_allowed_from_spot,
      withdraw_allowed_from_main,
      withdraw_allowed_from_binary,
      min_withdraw_usd,
      max_withdraw_usd,
      withdraw_fee_percent,
      supported_withdraw_assets_json,
      withdraw_network_map_json,
      transfers_enabled,
      convert_enabled,
      convert_fee_percent,
      conversion_pairs_json,
      allow_spot_to_binary,
      allow_binary_to_spot,
      allow_spot_to_main,
      allow_main_to_spot,
      allow_main_to_binary,
      allow_binary_to_main,
      auto_create_wallet_details,
      wallet_freeze_enabled,
      created_at,
      updated_at,
      updated_by
    ) VALUES (
      1,
      @depositsCreditWalletSymbol,
      @withdrawalsEnabled,
      @withdrawAllowedFromSpot,
      @withdrawAllowedFromMain,
      @withdrawAllowedFromBinary,
      @minWithdrawUsd,
      @maxWithdrawUsd,
      @withdrawFeePercent,
      @supportedWithdrawAssetsJson,
      @withdrawNetworkMapJson,
      @transfersEnabled,
      @convertEnabled,
      @convertFeePercent,
      @conversionPairsJson,
      @allowSpotToBinary,
      @allowBinaryToSpot,
      @allowSpotToMain,
      @allowMainToSpot,
      @allowMainToBinary,
      @allowBinaryToMain,
      @autoCreateWalletDetails,
      @walletFreezeEnabled,
      @createdAt,
      @updatedAt,
      @updatedBy
    )
    ON CONFLICT(id)
    DO UPDATE SET
      deposits_credit_wallet_symbol = excluded.deposits_credit_wallet_symbol,
      withdrawals_enabled = excluded.withdrawals_enabled,
      withdraw_allowed_from_spot = excluded.withdraw_allowed_from_spot,
      withdraw_allowed_from_main = excluded.withdraw_allowed_from_main,
      withdraw_allowed_from_binary = excluded.withdraw_allowed_from_binary,
      min_withdraw_usd = excluded.min_withdraw_usd,
      max_withdraw_usd = excluded.max_withdraw_usd,
      withdraw_fee_percent = excluded.withdraw_fee_percent,
      supported_withdraw_assets_json = excluded.supported_withdraw_assets_json,
      withdraw_network_map_json = excluded.withdraw_network_map_json,
      transfers_enabled = excluded.transfers_enabled,
      convert_enabled = excluded.convert_enabled,
      convert_fee_percent = excluded.convert_fee_percent,
      conversion_pairs_json = excluded.conversion_pairs_json,
      allow_spot_to_binary = excluded.allow_spot_to_binary,
      allow_binary_to_spot = excluded.allow_binary_to_spot,
      allow_spot_to_main = excluded.allow_spot_to_main,
      allow_main_to_spot = excluded.allow_main_to_spot,
      allow_main_to_binary = excluded.allow_main_to_binary,
      allow_binary_to_main = excluded.allow_binary_to_main,
      auto_create_wallet_details = excluded.auto_create_wallet_details,
      wallet_freeze_enabled = excluded.wallet_freeze_enabled,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `);

  const findWalletFreezeRuleStatement = db.prepare(`
    SELECT *
    FROM wallet_freeze_rules
    WHERE user_id = ? AND wallet_symbol = ?
    LIMIT 1
  `);

  const upsertWalletFreezeRuleStatement = db.prepare(`
    INSERT INTO wallet_freeze_rules (
      user_id,
      wallet_symbol,
      freeze_deposit,
      freeze_withdraw,
      freeze_transfer,
      freeze_convert,
      note,
      created_at,
      updated_at,
      updated_by
    ) VALUES (
      @userId,
      @walletSymbol,
      @freezeDeposit,
      @freezeWithdraw,
      @freezeTransfer,
      @freezeConvert,
      @note,
      @createdAt,
      @updatedAt,
      @updatedBy
    )
    ON CONFLICT(user_id, wallet_symbol)
    DO UPDATE SET
      freeze_deposit = excluded.freeze_deposit,
      freeze_withdraw = excluded.freeze_withdraw,
      freeze_transfer = excluded.freeze_transfer,
      freeze_convert = excluded.freeze_convert,
      note = excluded.note,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `);

  const listWalletFreezeRulesByUserStatement = db.prepare(`
    SELECT *
    FROM wallet_freeze_rules
    WHERE user_id = ?
    ORDER BY wallet_symbol ASC, id DESC
  `);

  const listWalletFreezeRulesStatement = db.prepare(`
    SELECT f.*, u.name AS account_name, u.email AS account_email
    FROM wallet_freeze_rules f
    LEFT JOIN users u ON u.user_id = f.user_id
    WHERE (@walletFilter = 'all' OR f.wallet_symbol = @walletFilter)
      AND (@userKeyword = '' OR f.user_id LIKE @likeUserKeyword OR u.email LIKE @likeUserKeyword OR u.name LIKE @likeUserKeyword)
    ORDER BY f.updated_at DESC, f.id DESC
    LIMIT @limit OFFSET @offset
  `);

  const countWalletFreezeRulesStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM wallet_freeze_rules f
    LEFT JOIN users u ON u.user_id = f.user_id
    WHERE (@walletFilter = 'all' OR f.wallet_symbol = @walletFilter)
      AND (@userKeyword = '' OR f.user_id LIKE @likeUserKeyword OR u.email LIKE @likeUserKeyword OR u.name LIKE @likeUserKeyword)
  `);

  const insertAssetAdminAuditLogStatement = db.prepare(`
    INSERT INTO asset_admin_audit_logs (
      admin_user_id,
      action_type,
      target_type,
      target_id,
      note,
      created_at
    ) VALUES (
      @adminUserId,
      @actionType,
      @targetType,
      @targetId,
      @note,
      @createdAt
    )
  `);

  const listAssetAdminAuditLogsStatement = db.prepare(`
    SELECT a.*, u.name AS admin_name, u.email AS admin_email
    FROM asset_admin_audit_logs a
    LEFT JOIN users u ON u.user_id = a.admin_user_id
    WHERE (@actionFilter = 'all' OR a.action_type = @actionFilter)
      AND (@keyword = '' OR a.admin_user_id LIKE @likeKeyword OR a.target_id LIKE @likeKeyword OR a.note LIKE @likeKeyword OR u.email LIKE @likeKeyword OR u.name LIKE @likeKeyword)
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT @limit OFFSET @offset
  `);

  const countAssetAdminAuditLogsStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM asset_admin_audit_logs a
    LEFT JOIN users u ON u.user_id = a.admin_user_id
    WHERE (@actionFilter = 'all' OR a.action_type = @actionFilter)
      AND (@keyword = '' OR a.admin_user_id LIKE @likeKeyword OR a.target_id LIKE @likeKeyword OR a.note LIKE @likeKeyword OR u.email LIKE @likeKeyword OR u.name LIKE @likeKeyword)
  `);

  const findUserIdentityStatement = db.prepare(`
    SELECT user_id, name, email, account_status, kyc_status
    FROM users
    WHERE user_id = ?
    LIMIT 1
  `);

  const listWalletDeskRowsStatement = db.prepare(`
    SELECT
      u.user_id,
      u.name AS account_name,
      u.email AS account_email,
      COALESCE(SUM(CASE WHEN d.asset_symbol LIKE 'SPOT_%' THEN d.available_usd ELSE 0 END), 0) AS spot_available_usd,
      COALESCE(SUM(CASE WHEN d.asset_symbol LIKE 'SPOT_%' THEN d.locked_usd ELSE 0 END), 0) AS spot_locked_usd,
      COALESCE(SUM(CASE WHEN d.asset_symbol LIKE 'MAIN_%' THEN d.available_usd ELSE 0 END), 0) AS main_available_usd,
      COALESCE(SUM(CASE WHEN d.asset_symbol LIKE 'MAIN_%' THEN d.locked_usd ELSE 0 END), 0) AS main_locked_usd,
      COALESCE(SUM(CASE WHEN d.asset_symbol LIKE 'BINARY_%' THEN d.available_usd ELSE 0 END), 0) AS binary_available_usd,
      COALESCE(SUM(CASE WHEN d.asset_symbol LIKE 'BINARY_%' THEN d.locked_usd ELSE 0 END), 0) AS binary_locked_usd,
      COALESCE(SUM(d.available_usd), 0) AS total_available_usd,
      COALESCE(SUM(d.locked_usd), 0) AS total_locked_usd,
      COALESCE(SUM(d.available_usd + d.locked_usd), 0) AS total_assets_usd,
      (
        SELECT l.ledger_ref_type
        FROM asset_wallet_ledger l
        WHERE l.user_id = u.user_id
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT 1
      ) AS latest_activity_type,
      (
        SELECT l.created_at
        FROM asset_wallet_ledger l
        WHERE l.user_id = u.user_id
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT 1
      ) AS latest_activity_at
    FROM platform_users u
    LEFT JOIN user_wallet_balance_details d ON d.user_id = u.user_id
    WHERE (@userKeyword = '' OR u.user_id LIKE @likeUserKeyword OR u.email LIKE @likeUserKeyword OR u.name LIKE @likeUserKeyword)
    GROUP BY u.user_id, u.name, u.email
    HAVING (
      @walletFilter = 'all'
      OR (@walletFilter = 'SPOT_USDT' AND (COALESCE(SUM(CASE WHEN d.asset_symbol LIKE 'SPOT_%' THEN d.available_usd + d.locked_usd ELSE 0 END), 0) > 0))
      OR (@walletFilter = 'MAIN_USDT' AND (COALESCE(SUM(CASE WHEN d.asset_symbol LIKE 'MAIN_%' THEN d.available_usd + d.locked_usd ELSE 0 END), 0) > 0))
      OR (@walletFilter = 'BINARY_USDT' AND (COALESCE(SUM(CASE WHEN d.asset_symbol LIKE 'BINARY_%' THEN d.available_usd + d.locked_usd ELSE 0 END), 0) > 0))
    )
    ORDER BY total_assets_usd DESC, u.user_id ASC
    LIMIT @limit OFFSET @offset
  `);

  const countWalletDeskRowsStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM (
      SELECT
        u.user_id,
        COALESCE(SUM(CASE WHEN d.asset_symbol LIKE 'SPOT_%' THEN d.available_usd + d.locked_usd ELSE 0 END), 0) AS spot_total_usd,
        COALESCE(SUM(CASE WHEN d.asset_symbol LIKE 'MAIN_%' THEN d.available_usd + d.locked_usd ELSE 0 END), 0) AS main_total_usd,
        COALESCE(SUM(CASE WHEN d.asset_symbol LIKE 'BINARY_%' THEN d.available_usd + d.locked_usd ELSE 0 END), 0) AS binary_total_usd
      FROM platform_users u
      LEFT JOIN user_wallet_balance_details d ON d.user_id = u.user_id
      WHERE (@userKeyword = '' OR u.user_id LIKE @likeUserKeyword OR u.email LIKE @likeUserKeyword OR u.name LIKE @likeUserKeyword)
      GROUP BY u.user_id
      HAVING (
        @walletFilter = 'all'
        OR (@walletFilter = 'SPOT_USDT' AND spot_total_usd > 0)
        OR (@walletFilter = 'MAIN_USDT' AND main_total_usd > 0)
        OR (@walletFilter = 'BINARY_USDT' AND binary_total_usd > 0)
      )
    ) scoped_users
  `);

  const totalsByWalletScopeStatement = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN asset_symbol LIKE 'SPOT_%' THEN available_usd + locked_usd ELSE 0 END), 0) AS total_spot_assets,
      COALESCE(SUM(CASE WHEN asset_symbol LIKE 'MAIN_%' THEN available_usd + locked_usd ELSE 0 END), 0) AS total_main_assets,
      COALESCE(SUM(CASE WHEN asset_symbol LIKE 'BINARY_%' THEN available_usd + locked_usd ELSE 0 END), 0) AS total_binary_assets,
      COALESCE(SUM(available_usd + locked_usd), 0) AS total_user_assets,
      COALESCE(SUM(locked_usd), 0) AS total_locked_assets
    FROM user_wallet_balance_details
  `);

  const countPendingWithdrawalsStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM withdrawal_requests
    WHERE status IN ('pending', 'processing')
  `);

  const countTransfersByDateStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM wallet_transfer_requests
    WHERE substr(created_at, 1, 10) = ?
  `);

  const countConversionsByDateStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM wallet_conversion_requests
    WHERE substr(created_at, 1, 10) = ?
  `);

  const listWalletMovementTrendStatement = db.prepare(`
    SELECT
      substr(created_at, 1, 10) AS day,
      COALESCE(SUM(CASE WHEN wallet_symbol LIKE 'SPOT_%' THEN amount_usd ELSE 0 END), 0) AS spot_amount_usd,
      COALESCE(SUM(CASE WHEN wallet_symbol LIKE 'MAIN_%' THEN amount_usd ELSE 0 END), 0) AS main_amount_usd,
      COALESCE(SUM(CASE WHEN wallet_symbol LIKE 'BINARY_%' THEN amount_usd ELSE 0 END), 0) AS binary_amount_usd,
      COUNT(*) AS action_count
    FROM asset_wallet_ledger
    WHERE created_at >= @fromDate
    GROUP BY substr(created_at, 1, 10)
    ORDER BY day ASC
  `);

  const listTopExposureUsersStatement = db.prepare(`
    SELECT
      u.user_id,
      u.name AS account_name,
      u.email AS account_email,
      COALESCE(SUM(d.available_usd + d.locked_usd), 0) AS total_assets_usd,
      COALESCE(SUM(d.locked_usd), 0) AS total_locked_usd
    FROM platform_users u
    LEFT JOIN user_wallet_balance_details d ON d.user_id = u.user_id
    GROUP BY u.user_id, u.name, u.email
    ORDER BY total_assets_usd DESC, u.user_id ASC
    LIMIT @limit
  `);

  const listMostActiveActionsStatement = db.prepare(`
    SELECT
      ledger_ref_type,
      COUNT(*) AS action_count,
      COALESCE(SUM(amount_usd), 0) AS volume_usd
    FROM asset_wallet_ledger
    GROUP BY ledger_ref_type
    ORDER BY action_count DESC, volume_usd DESC, ledger_ref_type ASC
    LIMIT @limit
  `);

  const listAssetWalletLedgerByUserStatement = db.prepare(`
    SELECT *
    FROM asset_wallet_ledger
    WHERE user_id = @userId
      AND (@walletFilter = 'all' OR wallet_symbol = @walletFilter)
      AND (@typeFilter = 'all' OR ledger_ref_type = @typeFilter)
    ORDER BY created_at DESC, id DESC
    LIMIT @limit OFFSET @offset
  `);

  const countAssetWalletLedgerByUserStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM asset_wallet_ledger
    WHERE user_id = @userId
      AND (@walletFilter = 'all' OR wallet_symbol = @walletFilter)
      AND (@typeFilter = 'all' OR ledger_ref_type = @typeFilter)
  `);

  const countWithdrawalsByStatusForAdminStatement = db.prepare(`
    SELECT status, COUNT(*) AS total
    FROM withdrawal_requests
    GROUP BY status
  `);

  const insertAssetWalletLedgerStatement = db.prepare(`
    INSERT INTO asset_wallet_ledger (
      user_id,
      ledger_ref_type,
      ledger_ref_id,
      wallet_symbol,
      asset_symbol,
      movement_type,
      amount_usd,
      balance_before_usd,
      balance_after_usd,
      note,
      created_at,
      created_by
    ) VALUES (
      @userId,
      @ledgerRefType,
      @ledgerRefId,
      @walletSymbol,
      @assetSymbol,
      @movementType,
      @amountUsd,
      @balanceBeforeUsd,
      @balanceAfterUsd,
      @note,
      @createdAt,
      @createdBy
    )
  `);

  const listDepositsByUserStatement = db.prepare(`
    SELECT id, user_id, asset_symbol, amount_usd, status, note, submitted_at, reviewed_at
    FROM deposit_requests
    WHERE user_id = ?
    ORDER BY submitted_at DESC, id DESC
    LIMIT 400
  `);

  const listBinaryLedgerByUserStatement = db.prepare(`
    SELECT id, user_id, trade_id, ledger_type, asset_symbol, amount_usd, balance_before_usd, balance_after_usd, note, created_at
    FROM binary_wallet_ledger
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 500
  `);

  const listLumLedgerByUserStatement = db.prepare(`
    SELECT id, user_id, investment_id, ledger_type, asset_symbol, amount_usd, balance_before_usd, balance_after_usd, note, created_at
    FROM lum_wallet_ledger
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 500
  `);

  const findSpotPairByCodeStatement = db.prepare(`
    SELECT pair_code, base_asset, quote_asset, current_price, is_enabled
    FROM spot_pairs
    WHERE pair_code = ?
    LIMIT 1
  `);

  function parseJsonArray(value, fallback = []) {
    try {
      const parsed = JSON.parse(String(value || "[]"));
      if (!Array.isArray(parsed)) {
        return [...fallback];
      }
      return parsed;
    } catch {
      return [...fallback];
    }
  }

  function parseJsonObject(value, fallback = {}) {
    try {
      const parsed = JSON.parse(String(value || "{}"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ...fallback };
      }
      return parsed;
    } catch {
      return { ...fallback };
    }
  }

  function normalizeNetworkMap(value = {}) {
    const base = value && typeof value === "object" ? value : {};
    const next = {};
    for (const [asset, networks] of Object.entries(base)) {
      const code = normalizeAssetCode(asset);
      if (!code) {
        continue;
      }
      const list = Array.isArray(networks) ? networks : [];
      const normalizedNetworks = list
        .map((item) => sanitizeShortText(item || "", 40))
        .filter(Boolean);
      if (normalizedNetworks.length) {
        next[code] = [...new Set(normalizedNetworks)];
      }
    }
    return next;
  }

  function normalizeConversionPair(value = "") {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }
    const parts = raw
      .split(/->|:|\/|-/)
      .map((item) => normalizeAssetCode(item))
      .filter(Boolean);
    if (parts.length !== 2 || parts[0] === parts[1]) {
      return "";
    }
    return `${parts[0]}->${parts[1]}`;
  }

  function normalizeModuleSettingsRow(raw = null) {
    const supportedAssets = parseJsonArray(raw?.supported_withdraw_assets_json, DEFAULT_WITHDRAW_ASSETS)
      .map((item) => normalizeAssetCode(item))
      .filter(Boolean);
    const uniqueAssets = [...new Set(supportedAssets.length ? supportedAssets : DEFAULT_WITHDRAW_ASSETS)];

    const networkMap = normalizeNetworkMap({
      ...DEFAULT_WITHDRAW_NETWORKS,
      ...parseJsonObject(raw?.withdraw_network_map_json, DEFAULT_WITHDRAW_NETWORKS),
    });

    const normalizedPairs = parseJsonArray(raw?.conversion_pairs_json, [])
      .map((item) => normalizeConversionPair(item))
      .filter(Boolean);

    return {
      depositsCreditWalletSymbol: normalizeWalletSymbol(raw?.deposits_credit_wallet_symbol || "SPOT_USDT", "SPOT_USDT"),
      withdrawalsEnabled: normalizeBoolean(raw?.withdrawals_enabled, true),
      withdrawAllowedFromSpot: normalizeBoolean(raw?.withdraw_allowed_from_spot, true),
      withdrawAllowedFromMain: normalizeBoolean(raw?.withdraw_allowed_from_main, defaultAllowWithdrawFromMain),
      withdrawAllowedFromBinary: normalizeBoolean(raw?.withdraw_allowed_from_binary, defaultAllowWithdrawFromBinary),
      minWithdrawUsd: Math.max(0.01, toNumber(raw?.min_withdraw_usd, defaultWithdrawMinUsd)),
      maxWithdrawUsd: Math.max(
        Math.max(0.01, toNumber(raw?.min_withdraw_usd, defaultWithdrawMinUsd)),
        toNumber(raw?.max_withdraw_usd, defaultWithdrawMaxUsd),
      ),
      withdrawFeePercent: Math.max(0, toNumber(raw?.withdraw_fee_percent, defaultWithdrawFeePercent)),
      supportedWithdrawAssets: uniqueAssets,
      withdrawNetworkMap: networkMap,
      transfersEnabled: normalizeBoolean(raw?.transfers_enabled, true),
      convertEnabled: normalizeBoolean(raw?.convert_enabled, true),
      convertFeePercent: Math.max(0, toNumber(raw?.convert_fee_percent, defaultConvertFeePercent)),
      conversionPairs: [...new Set(normalizedPairs)],
      allowSpotToBinary: normalizeBoolean(raw?.allow_spot_to_binary, true),
      allowBinaryToSpot: normalizeBoolean(raw?.allow_binary_to_spot, true),
      allowSpotToMain: normalizeBoolean(raw?.allow_spot_to_main, true),
      allowMainToSpot: normalizeBoolean(raw?.allow_main_to_spot, true),
      allowMainToBinary: normalizeBoolean(raw?.allow_main_to_binary, defaultAllowMainBinaryTransfer),
      allowBinaryToMain: normalizeBoolean(raw?.allow_binary_to_main, defaultAllowMainBinaryTransfer),
      autoCreateWalletDetails: normalizeBoolean(raw?.auto_create_wallet_details, true),
      walletFreezeEnabled: normalizeBoolean(raw?.wallet_freeze_enabled, true),
      updatedAt: String(raw?.updated_at || ""),
      updatedBy: String(raw?.updated_by || ""),
    };
  }

  function buildAssetModuleSettingsPayload(rawInput = {}, actor = "system") {
    const raw = rawInput || {};
    const nowIso = toIso(getNow());
    const normalized = normalizeModuleSettingsRow(raw);
    return {
      depositsCreditWalletSymbol: normalizeWalletSymbol(
        raw.depositsCreditWalletSymbol || normalized.depositsCreditWalletSymbol || "SPOT_USDT",
        "SPOT_USDT",
      ),
      withdrawalsEnabled: normalizeBoolean(raw.withdrawalsEnabled, normalized.withdrawalsEnabled) ? 1 : 0,
      withdrawAllowedFromSpot: normalizeBoolean(raw.withdrawAllowedFromSpot, normalized.withdrawAllowedFromSpot) ? 1 : 0,
      withdrawAllowedFromMain: normalizeBoolean(raw.withdrawAllowedFromMain, normalized.withdrawAllowedFromMain) ? 1 : 0,
      withdrawAllowedFromBinary: normalizeBoolean(raw.withdrawAllowedFromBinary, normalized.withdrawAllowedFromBinary) ? 1 : 0,
      minWithdrawUsd: Math.max(0.01, toNumber(raw.minWithdrawUsd, normalized.minWithdrawUsd)),
      maxWithdrawUsd: (() => {
        const value = raw.maxWithdrawUsd;
        if (value === null || value === "" || value === undefined) {
          return null;
        }
        return Math.max(0.01, toNumber(value, normalized.maxWithdrawUsd));
      })(),
      withdrawFeePercent: Math.max(0, toNumber(raw.withdrawFeePercent, normalized.withdrawFeePercent)),
      supportedWithdrawAssetsJson: JSON.stringify(
        [...new Set((Array.isArray(raw.supportedWithdrawAssets) ? raw.supportedWithdrawAssets : normalized.supportedWithdrawAssets).map((item) => normalizeAssetCode(item)).filter(Boolean))],
      ),
      withdrawNetworkMapJson: JSON.stringify(
        normalizeNetworkMap(
          raw.withdrawNetworkMap && typeof raw.withdrawNetworkMap === "object"
            ? raw.withdrawNetworkMap
            : normalized.withdrawNetworkMap,
        ),
      ),
      transfersEnabled: normalizeBoolean(raw.transfersEnabled, normalized.transfersEnabled) ? 1 : 0,
      convertEnabled: normalizeBoolean(raw.convertEnabled, normalized.convertEnabled) ? 1 : 0,
      convertFeePercent: Math.max(0, toNumber(raw.convertFeePercent, normalized.convertFeePercent)),
      conversionPairsJson: JSON.stringify(
        [...new Set((Array.isArray(raw.conversionPairs) ? raw.conversionPairs : normalized.conversionPairs).map((item) => normalizeConversionPair(item)).filter(Boolean))],
      ),
      allowSpotToBinary: normalizeBoolean(raw.allowSpotToBinary, normalized.allowSpotToBinary) ? 1 : 0,
      allowBinaryToSpot: normalizeBoolean(raw.allowBinaryToSpot, normalized.allowBinaryToSpot) ? 1 : 0,
      allowSpotToMain: normalizeBoolean(raw.allowSpotToMain, normalized.allowSpotToMain) ? 1 : 0,
      allowMainToSpot: normalizeBoolean(raw.allowMainToSpot, normalized.allowMainToSpot) ? 1 : 0,
      allowMainToBinary: normalizeBoolean(raw.allowMainToBinary, normalized.allowMainToBinary) ? 1 : 0,
      allowBinaryToMain: normalizeBoolean(raw.allowBinaryToMain, normalized.allowBinaryToMain) ? 1 : 0,
      autoCreateWalletDetails: normalizeBoolean(raw.autoCreateWalletDetails, normalized.autoCreateWalletDetails) ? 1 : 0,
      walletFreezeEnabled: normalizeBoolean(raw.walletFreezeEnabled, normalized.walletFreezeEnabled) ? 1 : 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      updatedBy: sanitizeShortText(actor || "system", 80) || "system",
    };
  }

  function ensureAssetModuleSettingsSeed() {
    const existing = findAssetModuleSettingsStatement.get();
    if (existing) {
      return;
    }
    upsertAssetModuleSettingsStatement.run(
      buildAssetModuleSettingsPayload(
        {
          depositsCreditWalletSymbol: "SPOT_USDT",
          withdrawalsEnabled: true,
          withdrawAllowedFromSpot: true,
          withdrawAllowedFromMain: defaultAllowWithdrawFromMain,
          withdrawAllowedFromBinary: defaultAllowWithdrawFromBinary,
          minWithdrawUsd: defaultWithdrawMinUsd,
          maxWithdrawUsd: defaultWithdrawMaxUsd,
          withdrawFeePercent: defaultWithdrawFeePercent,
          supportedWithdrawAssets: DEFAULT_WITHDRAW_ASSETS,
          withdrawNetworkMap: DEFAULT_WITHDRAW_NETWORKS,
          transfersEnabled: true,
          convertEnabled: true,
          convertFeePercent: defaultConvertFeePercent,
          conversionPairs: [],
          allowSpotToBinary: true,
          allowBinaryToSpot: true,
          allowSpotToMain: true,
          allowMainToSpot: true,
          allowMainToBinary: defaultAllowMainBinaryTransfer,
          allowBinaryToMain: defaultAllowMainBinaryTransfer,
          autoCreateWalletDetails: true,
          walletFreezeEnabled: true,
        },
        "system",
      ),
    );
  }

  function getAssetModuleSettings() {
    const row = findAssetModuleSettingsStatement.get();
    return normalizeModuleSettingsRow(row);
  }

  function getDepositCreditWalletSymbol() {
    return getAssetModuleSettings().depositsCreditWalletSymbol || "SPOT_USDT";
  }

  function mapFreezeRuleRow(row) {
    if (!row) {
      return null;
    }
    return {
      freezeRuleId: toNumber(row.id, 0),
      userId: String(row.user_id || ""),
      walletSymbol: normalizeWalletSymbol(row.wallet_symbol || "SPOT_USDT", "SPOT_USDT"),
      freezeDeposit: normalizeBoolean(row.freeze_deposit, false),
      freezeWithdraw: normalizeBoolean(row.freeze_withdraw, false),
      freezeTransfer: normalizeBoolean(row.freeze_transfer, false),
      freezeConvert: normalizeBoolean(row.freeze_convert, false),
      note: String(row.note || ""),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
      updatedBy: String(row.updated_by || ""),
      accountName: String(row.account_name || ""),
      accountEmail: String(row.account_email || ""),
    };
  }

  function insertAssetAdminAuditLog({ adminUserId, actionType, targetType, targetId, note = "", createdAt }) {
    insertAssetAdminAuditLogStatement.run({
      adminUserId: sanitizeShortText(adminUserId || "admin", 80) || "admin",
      actionType: sanitizeShortText(actionType || "asset_action", 80) || "asset_action",
      targetType: sanitizeShortText(targetType || "asset_target", 80) || "asset_target",
      targetId: sanitizeShortText(String(targetId || ""), 120) || "unknown",
      note: sanitizeShortText(note || "", 320),
      createdAt: createdAt || toIso(getNow()),
    });
  }

  function assertWalletActionAllowed({ userId, walletSymbol, actionType }) {
    const settings = getAssetModuleSettings();
    if (!settings.walletFreezeEnabled) {
      return;
    }

    const coreWallet = toCoreWalletSymbol(walletSymbol || "SPOT_USDT");
    const rule = findWalletFreezeRuleStatement.get(userId, coreWallet);
    if (!rule) {
      return;
    }

    const type = normalizeLower(actionType || "");
    const blocked =
      (type === "deposit" && normalizeBoolean(rule.freeze_deposit, false)) ||
      (type === "withdraw" && normalizeBoolean(rule.freeze_withdraw, false)) ||
      (type === "transfer" && normalizeBoolean(rule.freeze_transfer, false)) ||
      (type === "convert" && normalizeBoolean(rule.freeze_convert, false));
    if (blocked) {
      throw new Error(rule.note ? `Wallet action blocked: ${rule.note}` : `Wallet action blocked for ${coreWallet}.`);
    }
  }

  ensureAssetModuleSettingsSeed();

  function parseRequestValue(req, key, fallback = null) {
    if (req?.body && Object.prototype.hasOwnProperty.call(req.body, key)) {
      return req.body[key];
    }
    if (req?.query && Object.prototype.hasOwnProperty.call(req.query, key)) {
      return req.query[key];
    }
    return fallback;
  }

  function normalizeRawWalletSymbol(value = "") {
    return normalizeUpper(value).replace(/[^A-Z0-9_]/g, "");
  }

  function buildWalletSymbolCandidates(symbol = "") {
    const canonical = normalizeWalletSymbol(symbol, symbol || "SPOT_USDT");
    const raw = normalizeRawWalletSymbol(symbol);
    const candidates = [];
    const push = (value = "") => {
      const normalized = normalizeRawWalletSymbol(value);
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

    const canonicalAsset = canonical.includes("_") ? canonical.split("_").slice(1).join("_") : "";
    push(canonicalAsset);
    if (canonicalAsset) {
      push(canonicalAsset.replace(/[^A-Z0-9]/g, ""));
    }

    if (canonical.startsWith("SPOT_")) {
      push(canonical.slice(5));
    }

    return candidates;
  }

  function findWalletDetailByAnySymbol(userId, symbol = "") {
    const candidates = buildWalletSymbolCandidates(symbol);
    for (const candidate of candidates) {
      const row = findWalletDetailStatement.get(userId, candidate);
      if (row) {
        return { row, symbol: candidate };
      }
    }
    return null;
  }

  function findWalletSummaryByAnySymbol(userId, symbol = "") {
    const candidates = buildWalletSymbolCandidates(symbol);
    for (const candidate of candidates) {
      const row = findWalletSummaryStatement.get(userId, candidate);
      if (row) {
        return { row, symbol: candidate };
      }
    }
    return null;
  }

  function migrateWalletAliasForUser({ userId, fromSymbol, toSymbol, nowIso }) {
    const from = normalizeRawWalletSymbol(fromSymbol || "");
    const to = normalizeWalletSymbol(toSymbol || "", toSymbol || from || "SPOT_USDT");
    if (!from || !to || from === to) {
      return;
    }

    const detailFrom = findWalletDetailStatement.get(userId, from);
    if (detailFrom) {
      const detailTo = findWalletDetailStatement.get(userId, to);
      if (detailTo) {
        updateWalletDetailStatement.run({
          userId,
          assetSymbol: to,
          availableUsd: toMoney(toNumber(detailTo.available_usd, 0) + toNumber(detailFrom.available_usd, 0)),
          lockedUsd: toMoney(toNumber(detailTo.locked_usd, 0) + toNumber(detailFrom.locked_usd, 0)),
          rewardEarnedUsd: toMoney(toNumber(detailTo.reward_earned_usd, 0) + toNumber(detailFrom.reward_earned_usd, 0)),
          updatedAt: nowIso,
        });
        deleteWalletDetailBySymbolStatement.run({ userId, assetSymbol: from });
      } else {
        updateWalletDetailSymbolStatement.run({
          toSymbol: to,
          userId,
          fromSymbol: from,
        });
      }
    }

    const summaryFrom = findWalletSummaryStatement.get(userId, from);
    if (summaryFrom) {
      const summaryTo = findWalletSummaryStatement.get(userId, to);
      if (summaryTo) {
        setWalletSummaryStatement.run({
          userId,
          assetSymbol: to,
          assetName: sanitizeShortText(summaryTo.asset_name || summaryFrom.asset_name || to, 80),
          totalUsd: toMoney(toNumber(summaryTo.total_usd, 0) + toNumber(summaryFrom.total_usd, 0)),
          updatedAt: nowIso,
        });
        deleteWalletSummaryBySymbolStatement.run({ userId, assetSymbol: from });
      } else {
        updateWalletSummarySymbolStatement.run({
          toSymbol: to,
          userId,
          fromSymbol: from,
        });
      }
    }
  }

  function normalizeLegacyWalletSymbolsForUser(userId, nowIso) {
    const detailRows = listWalletDetailsByUserStatement.all(userId);
    for (const row of detailRows) {
      const from = normalizeRawWalletSymbol(row.asset_symbol || "");
      const to = normalizeWalletSymbol(from, from || "SPOT_USDT");
      if (!from || !to || from === to) {
        continue;
      }
      migrateWalletAliasForUser({ userId, fromSymbol: from, toSymbol: to, nowIso });
    }

    const summaryRows = listWalletSummariesByUserStatement.all(userId);
    for (const row of summaryRows) {
      const from = normalizeRawWalletSymbol(row.asset_symbol || "");
      const to = normalizeWalletSymbol(from, from || "SPOT_USDT");
      if (!from || !to || from === to) {
        continue;
      }
      migrateWalletAliasForUser({ userId, fromSymbol: from, toSymbol: to, nowIso });
    }
  }

  function toWalletMeta(scope) {
    const matched = CORE_WALLET_META.find((item) => item.scope === scope);
    if (matched) {
      return matched;
    }
    return CORE_WALLET_META[0];
  }

  function shouldAllowWithdraw(walletSymbol, settings = getAssetModuleSettings()) {
    const normalized = normalizeWalletSymbol(walletSymbol, walletSymbol);
    if (!settings.withdrawalsEnabled) {
      return false;
    }
    if (normalized === "SPOT_USDT") {
      return Boolean(settings.withdrawAllowedFromSpot);
    }
    if (normalized === "MAIN_USDT") {
      return Boolean(settings.withdrawAllowedFromMain);
    }
    if (normalized === "BINARY_USDT") {
      return Boolean(settings.withdrawAllowedFromBinary);
    }
    return false;
  }

  function assertTransferFlowAllowed(fromWalletSymbol, toWalletSymbol, settings = getAssetModuleSettings()) {
    if (!settings.transfersEnabled) {
      throw new Error("Internal transfer is currently disabled.");
    }

    const from = normalizeWalletSymbol(fromWalletSymbol, fromWalletSymbol);
    const to = normalizeWalletSymbol(toWalletSymbol, toWalletSymbol);

    if (!CORE_WALLET_SET.has(from) || !CORE_WALLET_SET.has(to)) {
      throw new Error("Unsupported wallet transfer route.");
    }
    if (from === to) {
      throw new Error("Source and destination wallets cannot be the same.");
    }

    const route = `${from}->${to}`;
    const routeAllowMap = {
      "SPOT_USDT->BINARY_USDT": Boolean(settings.allowSpotToBinary),
      "BINARY_USDT->SPOT_USDT": Boolean(settings.allowBinaryToSpot),
      "SPOT_USDT->MAIN_USDT": Boolean(settings.allowSpotToMain),
      "MAIN_USDT->SPOT_USDT": Boolean(settings.allowMainToSpot),
      "MAIN_USDT->BINARY_USDT": Boolean(settings.allowMainToBinary),
      "BINARY_USDT->MAIN_USDT": Boolean(settings.allowBinaryToMain),
    };

    if (Object.prototype.hasOwnProperty.call(routeAllowMap, route)) {
      if (!routeAllowMap[route]) {
        throw new Error("Selected transfer route is disabled by admin settings.");
      }
      return;
    }

    throw new Error("Unsupported wallet transfer route.");
  }

  function ensureWalletDetailRow(userId, assetSymbol, nowIso, assetNameFallback = "") {
    const symbol = normalizeWalletSymbol(assetSymbol, assetSymbol);
    let detail = findWalletDetailStatement.get(userId, symbol);

    if (!detail) {
      const aliasDetail = findWalletDetailByAnySymbol(userId, symbol);
      if (aliasDetail?.symbol && aliasDetail.symbol !== symbol) {
        migrateWalletAliasForUser({
          userId,
          fromSymbol: aliasDetail.symbol,
          toSymbol: symbol,
          nowIso,
        });
        detail = findWalletDetailStatement.get(userId, symbol);
      }
    }

    if (!detail) {
      const aliasSummary = findWalletSummaryByAnySymbol(userId, symbol);
      if (aliasSummary?.symbol && aliasSummary.symbol !== symbol) {
        migrateWalletAliasForUser({
          userId,
          fromSymbol: aliasSummary.symbol,
          toSymbol: symbol,
          nowIso,
        });
      }

      const summary = findWalletSummaryStatement.get(userId, symbol);
      const availableUsd = toMoney(toNumber(summary?.total_usd, 0));
      insertWalletDetailStatement.run({
        userId,
        assetSymbol: symbol,
        availableUsd,
        lockedUsd: 0,
        rewardEarnedUsd: 0,
        updatedAt: nowIso,
      });
      detail = findWalletDetailStatement.get(userId, symbol);

      if (!summary) {
        const nextName = sanitizeShortText(assetNameFallback || symbol, 80);
        setWalletSummaryStatement.run({
          userId,
          assetSymbol: symbol,
          assetName: nextName,
          totalUsd: availableUsd,
          updatedAt: nowIso,
        });
      }
    }

    return {
      user_id: userId,
      asset_symbol: symbol,
      available_usd: toMoney(toNumber(detail?.available_usd, 0)),
      locked_usd: toMoney(toNumber(detail?.locked_usd, 0)),
      reward_earned_usd: toMoney(toNumber(detail?.reward_earned_usd, 0)),
      updated_at: detail?.updated_at || nowIso,
    };
  }

  function saveWalletDetail({ userId, assetSymbol, availableUsd, lockedUsd, rewardEarnedUsd, updatedAt }) {
    const symbol = normalizeWalletSymbol(assetSymbol, assetSymbol);
    const payload = {
      userId,
      assetSymbol: symbol,
      availableUsd: toMoney(availableUsd),
      lockedUsd: toMoney(lockedUsd),
      rewardEarnedUsd: toMoney(rewardEarnedUsd),
      updatedAt,
    };

    const updateResult = updateWalletDetailStatement.run(payload);
    if (!updateResult.changes) {
      insertWalletDetailStatement.run(payload);
    }

    return ensureWalletDetailRow(userId, symbol, updatedAt, symbol);
  }

  function syncWalletSummaryFromDetail({ userId, assetSymbol, updatedAt, assetNameFallback = "" }) {
    const symbol = normalizeWalletSymbol(assetSymbol, assetSymbol);
    const detail = ensureWalletDetailRow(userId, symbol, updatedAt, assetNameFallback || symbol);
    const totalUsd = toMoney(toNumber(detail.available_usd, 0) + toNumber(detail.locked_usd, 0));
    const existingSummary = findWalletSummaryStatement.get(userId, symbol);
    const assetName = sanitizeShortText(existingSummary?.asset_name || assetNameFallback || symbol, 80);

    setWalletSummaryStatement.run({
      userId,
      assetSymbol: symbol,
      assetName,
      totalUsd,
      updatedAt,
    });

    return {
      symbol,
      totalUsd,
      availableUsd: toMoney(toNumber(detail.available_usd, 0)),
      lockedUsd: toMoney(toNumber(detail.locked_usd, 0)),
    };
  }

  function ensureWalletDetailMirroredFromSummary({ userId, assetSymbol, assetName = "", nowIso }) {
    const symbol = normalizeWalletSymbol(assetSymbol, assetSymbol);
    const existing = findWalletDetailStatement.get(userId, symbol);
    if (existing) {
      return {
        symbol,
        availableUsd: toMoney(toNumber(existing.available_usd, 0)),
        lockedUsd: toMoney(toNumber(existing.locked_usd, 0)),
      };
    }

    const summary = findWalletSummaryStatement.get(userId, symbol);
    const availableUsd = toMoney(toNumber(summary?.total_usd, 0));

    insertWalletDetailStatement.run({
      userId,
      assetSymbol: symbol,
      availableUsd,
      lockedUsd: 0,
      rewardEarnedUsd: 0,
      updatedAt: nowIso,
    });

    if (!summary) {
      setWalletSummaryStatement.run({
        userId,
        assetSymbol: symbol,
        assetName: sanitizeShortText(assetName || symbol, 80),
        totalUsd: availableUsd,
        updatedAt: nowIso,
      });
    }

    return {
      symbol,
      availableUsd,
      lockedUsd: 0,
    };
  }

  function insertAssetWalletLedgerEntry({
    userId,
    ledgerRefType,
    ledgerRefId = "",
    walletSymbol,
    assetSymbol,
    movementType,
    amountUsd,
    balanceBeforeUsd = null,
    balanceAfterUsd = null,
    note = "",
    createdAt,
    createdBy = "",
  }) {
    insertAssetWalletLedgerStatement.run({
      userId,
      ledgerRefType: sanitizeShortText(ledgerRefType || "wallet_event", 80),
      ledgerRefId: sanitizeShortText(String(ledgerRefId || ""), 80) || null,
      walletSymbol: normalizeWalletSymbol(walletSymbol, walletSymbol),
      assetSymbol: normalizeAssetCode(assetSymbol || "USDT") || "USDT",
      movementType: normalizeMovementType(movementType || "credit"),
      amountUsd: toMoney(amountUsd),
      balanceBeforeUsd: balanceBeforeUsd === null ? null : toMoney(balanceBeforeUsd),
      balanceAfterUsd: balanceAfterUsd === null ? null : toMoney(balanceAfterUsd),
      note: sanitizeShortText(note || "", 280),
      createdAt: createdAt || toIso(getNow()),
      createdBy: sanitizeShortText(createdBy || "system", 80),
    });
  }

  function ensureWalletDetailRowsFromSummaries(userId, nowIso) {
    const summaries = listWalletSummariesByUserStatement.all(userId);
    for (const row of summaries) {
      ensureWalletDetailMirroredFromSummary({
        userId,
        assetSymbol: row.asset_symbol,
        assetName: row.asset_name,
        nowIso,
      });
    }
  }

  function ensureCoreWallets(userId, nowIso) {
    for (const meta of CORE_WALLET_META) {
      ensureWalletDetailRow(userId, meta.symbol, nowIso, meta.title);
      syncWalletSummaryFromDetail({
        userId,
        assetSymbol: meta.symbol,
        updatedAt: nowIso,
        assetNameFallback: `${meta.title} (USDT)`,
      });
    }
  }

  function buildWalletAggregation(userId) {
    const nowIso = toIso(getNow());
    normalizeLegacyWalletSymbolsForUser(userId, nowIso);
    ensureWalletDetailRowsFromSummaries(userId, nowIso);
    ensureCoreWallets(userId, nowIso);

    const details = listWalletDetailsByUserStatement.all(userId).map((row) => ({
      symbol: normalizeWalletSymbol(row.asset_symbol || ""),
      availableUsd: toMoney(toNumber(row.available_usd, 0)),
      lockedUsd: toMoney(toNumber(row.locked_usd, 0)),
      rewardEarnedUsd: toMoney(toNumber(row.reward_earned_usd, 0)),
      updatedAt: row.updated_at || "",
    }));

    const grouped = {
      SPOT: { availableUsd: 0, lockedUsd: 0, coinCount: 0, updatedAt: "" },
      MAIN: { availableUsd: 0, lockedUsd: 0, coinCount: 0, updatedAt: "" },
      BINARY: { availableUsd: 0, lockedUsd: 0, coinCount: 0, updatedAt: "" },
    };

    const seenAssets = {
      SPOT: new Set(),
      MAIN: new Set(),
      BINARY: new Set(),
    };

    for (const row of details) {
      const scope = getWalletScope(row.symbol);
      const assetPart = row.symbol.includes("_") ? row.symbol.split("_").slice(1).join("_") : normalizeAssetCode(row.symbol);
      grouped[scope].availableUsd = toMoney(grouped[scope].availableUsd + row.availableUsd);
      grouped[scope].lockedUsd = toMoney(grouped[scope].lockedUsd + row.lockedUsd);
      if (assetPart) {
        seenAssets[scope].add(assetPart);
      }

      if (!grouped[scope].updatedAt || parseIsoMs(row.updatedAt) > parseIsoMs(grouped[scope].updatedAt)) {
        grouped[scope].updatedAt = row.updatedAt || grouped[scope].updatedAt;
      }
    }

    for (const scope of Object.keys(grouped)) {
      grouped[scope].coinCount = seenAssets[scope].size;
    }

    const wallets = CORE_WALLET_META.map((meta) => {
      const availableUsd = toMoney(grouped[meta.scope].availableUsd);
      const lockedUsd = toMoney(grouped[meta.scope].lockedUsd);
      const totalUsd = toMoney(availableUsd + lockedUsd);
      return {
        walletName: meta.title,
        walletSubtitle: meta.subtitle,
        walletScope: meta.scope,
        walletSymbol: meta.symbol,
        availableUsd,
        lockedUsd,
        totalUsd,
        coinCount: grouped[meta.scope].coinCount,
        updatedAt: grouped[meta.scope].updatedAt || nowIso,
      };
    });

    const totalAssets = toMoney(wallets.reduce((sum, item) => sum + item.totalUsd, 0));
    const distributionPercentages = wallets.reduce((acc, item) => {
      acc[item.walletSymbol] = percent(item.totalUsd, totalAssets);
      return acc;
    }, {});

    const chartData = wallets.map((item) => ({
      key: item.walletSymbol,
      label: item.walletName,
      valueUsd: item.totalUsd,
      percentage: distributionPercentages[item.walletSymbol] || 0,
    }));

    return {
      wallets: wallets.map((item) => ({
        ...item,
        percentage: distributionPercentages[item.walletSymbol] || 0,
      })),
      totalAssets,
      distributionPercentages,
      chartData,
      walletDetails: details,
    };
  }

  function mapTransferRow(row) {
    if (!row) {
      return null;
    }
    return {
      transferId: toNumber(row.id, 0),
      transferRef: normalizeUpper(row.transfer_ref || ""),
      userId: String(row.user_id || ""),
      fromWalletSymbol: normalizeWalletSymbol(row.from_wallet_symbol || "SPOT_USDT", "SPOT_USDT"),
      toWalletSymbol: normalizeWalletSymbol(row.to_wallet_symbol || "MAIN_USDT", "MAIN_USDT"),
      assetSymbol: normalizeAssetCode(row.asset_symbol || "USDT") || "USDT",
      amountUsd: toMoney(toNumber(row.amount_usd, 0)),
      status: normalizeTransferStatus(row.status || "completed"),
      note: String(row.note || ""),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
    };
  }

  function mapConversionRow(row) {
    if (!row) {
      return null;
    }
    return {
      conversionId: toNumber(row.id, 0),
      conversionRef: normalizeUpper(row.conversion_ref || ""),
      userId: String(row.user_id || ""),
      walletSymbol: normalizeWalletSymbol(row.wallet_symbol || "SPOT_USDT", "SPOT_USDT"),
      fromAssetSymbol: normalizeAssetCode(row.from_asset_symbol || "USDT") || "USDT",
      toAssetSymbol: normalizeAssetCode(row.to_asset_symbol || "USDT") || "USDT",
      sourceAmount: toMoney(toNumber(row.source_amount, 0)),
      rateSnapshot: toMoney(toNumber(row.rate_snapshot, 0)),
      convertedAmount: toMoney(toNumber(row.converted_amount, 0)),
      feeAmount: toMoney(toNumber(row.fee_amount, 0)),
      status: normalizeConversionStatus(row.status || "completed"),
      note: String(row.note || ""),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
    };
  }

  function mapWithdrawalRow(row) {
    if (!row) {
      return null;
    }
    return {
      withdrawalId: toNumber(row.id, 0),
      withdrawalRef: normalizeUpper(row.withdrawal_ref || ""),
      userId: String(row.user_id || ""),
      walletSymbol: normalizeWalletSymbol(row.wallet_symbol || "SPOT_USDT", "SPOT_USDT"),
      assetSymbol: normalizeAssetCode(row.asset_symbol || "USDT") || "USDT",
      networkType: String(row.network_type || ""),
      destinationAddress: String(row.destination_address || ""),
      destinationLabel: String(row.destination_label || ""),
      amountUsd: toMoney(toNumber(row.amount_usd, 0)),
      feeAmountUsd: toMoney(toNumber(row.fee_amount_usd, 0)),
      netAmountUsd: toMoney(toNumber(row.net_amount_usd, 0)),
      status: normalizeWithdrawalStatus(row.status || "pending"),
      note: String(row.note || ""),
      submittedAt: String(row.submitted_at || ""),
      reviewedAt: String(row.reviewed_at || ""),
      reviewedBy: String(row.reviewed_by || ""),
      completedAt: String(row.completed_at || ""),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
    };
  }

  function resolveAssetUsdRate(assetSymbol = "USDT") {
    const asset = normalizeAssetCode(assetSymbol || "USDT") || "USDT";
    if (asset === "USDT" || asset === "USD") {
      return 1;
    }

    const directCode = `${asset}USDT`;
    const direct = findSpotPairByCodeStatement.get(directCode);
    if (direct && Number(direct.is_enabled || 0) === 1) {
      const directPrice = toNumber(direct.current_price, 0);
      if (directPrice > 0) {
        return toMoney(directPrice);
      }
    }

    const reverseCode = `USDT${asset}`;
    const reverse = findSpotPairByCodeStatement.get(reverseCode);
    if (reverse && Number(reverse.is_enabled || 0) === 1) {
      const reversePrice = toNumber(reverse.current_price, 0);
      if (reversePrice > 0) {
        return toMoney(1 / reversePrice);
      }
    }

    return DEFAULT_ASSET_PRICE_USD[asset] || null;
  }

  function resolveConvertQuote({ fromAssetSymbol, toAssetSymbol, amount, settings = getAssetModuleSettings() }) {
    const fromAsset = normalizeAssetCode(fromAssetSymbol || "");
    const toAsset = normalizeAssetCode(toAssetSymbol || "");

    if (!fromAsset || !toAsset) {
      throw new Error("Select valid assets for conversion.");
    }
    if (fromAsset === toAsset) {
      throw new Error("From and To assets cannot be the same.");
    }
    if (!settings.convertEnabled) {
      throw new Error("Convert is currently disabled.");
    }

    const pairKey = `${fromAsset}->${toAsset}`;
    if (Array.isArray(settings.conversionPairs) && settings.conversionPairs.length) {
      if (!settings.conversionPairs.includes(pairKey)) {
        throw new Error("Selected conversion pair is disabled by admin settings.");
      }
    }

    const sourceAmount = normalizeUsdAmount(amount);
    const fromRateUsd = resolveAssetUsdRate(fromAsset);
    const toRateUsd = resolveAssetUsdRate(toAsset);

    if (!fromRateUsd || !toRateUsd) {
      throw new Error("Selected conversion pair is not supported yet.");
    }

    const usdEquivalent = toMoney(sourceAmount * fromRateUsd);
    const grossConvertedAmount = toMoney(usdEquivalent / toRateUsd);
    const activeConvertFeePercent = Math.max(0, toNumber(settings.convertFeePercent, defaultConvertFeePercent));
    const feeAmount = toMoney(grossConvertedAmount * (activeConvertFeePercent / 100));
    const convertedAmount = toMoney(Math.max(0, grossConvertedAmount - feeAmount));

    if (convertedAmount <= 0) {
      throw new Error("Converted amount is too low after fee.");
    }

    return {
      fromAsset,
      toAsset,
      sourceAmount,
      usdEquivalent,
      rateSnapshot: toMoney(fromRateUsd / toRateUsd),
      grossConvertedAmount,
      convertedAmount,
      feeAmount,
      feePercent: activeConvertFeePercent,
      fromRateUsd,
      toRateUsd,
    };
  }

  function buildWithdrawConfigPayload(userId = "") {
    const settings = getAssetModuleSettings();
    const supportedAssets = new Set(
      Array.isArray(settings.supportedWithdrawAssets) && settings.supportedWithdrawAssets.length
        ? settings.supportedWithdrawAssets
        : DEFAULT_WITHDRAW_ASSETS,
    );
    const defaultWalletSymbol = settings.depositsCreditWalletSymbol || "SPOT_USDT";
    const userFreezeRules = listWalletFreezeRulesByUserStatement.all(userId).reduce((acc, row) => {
      const symbol = normalizeWalletSymbol(row.wallet_symbol || "SPOT_USDT", "SPOT_USDT");
      acc[symbol] = mapFreezeRuleRow(row);
      return acc;
    }, {});

    if (userId) {
      const nowIso = toIso(getNow());
      normalizeLegacyWalletSymbolsForUser(userId, nowIso);
      ensureWalletDetailRowsFromSummaries(userId, nowIso);
      ensureCoreWallets(userId, nowIso);

      const rows = listWalletDetailsByUserStatement.all(userId);
      for (const row of rows) {
        const symbol = normalizeWalletSymbol(row.asset_symbol || "", row.asset_symbol || "");
        const parts = symbol.split("_");
        if (parts.length >= 2) {
          const asset = normalizeAssetCode(parts.slice(1).join("_"));
          if (asset) {
            supportedAssets.add(asset);
          }
        }
      }
    }

    const getWithdrawBaseRule = (walletSymbol) => {
      const normalized = normalizeWalletSymbol(walletSymbol || "SPOT_USDT", "SPOT_USDT");
      if (!settings.withdrawalsEnabled) {
        return { canWithdraw: false, reason: "Withdrawal is currently disabled by admin." };
      }
      if (normalized === "SPOT_USDT") {
        return {
          canWithdraw: Boolean(settings.withdrawAllowedFromSpot),
          reason: settings.withdrawAllowedFromSpot ? "" : "Spot wallet withdrawal is disabled.",
        };
      }
      if (normalized === "MAIN_USDT") {
        return {
          canWithdraw: Boolean(settings.withdrawAllowedFromMain),
          reason: settings.withdrawAllowedFromMain ? "" : "Main wallet direct withdrawal is disabled.",
        };
      }
      return {
        canWithdraw: Boolean(settings.withdrawAllowedFromBinary),
        reason: settings.withdrawAllowedFromBinary ? "" : "Move funds to Spot wallet before withdrawing.",
      };
    };

    const walletRestrictions = {
      SPOT_USDT: getWithdrawBaseRule("SPOT_USDT"),
      MAIN_USDT: getWithdrawBaseRule("MAIN_USDT"),
      BINARY_USDT: getWithdrawBaseRule("BINARY_USDT"),
    };

    for (const symbol of Object.keys(walletRestrictions)) {
      const freeze = userFreezeRules[symbol];
      if (freeze?.freezeWithdraw) {
        walletRestrictions[symbol] = {
          canWithdraw: false,
          reason: freeze.note || "Withdrawal is frozen for this wallet by admin.",
        };
      }
    }

    const assetList = [...supportedAssets]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map((asset) => ({
        assetSymbol: asset,
        networks: settings.withdrawNetworkMap?.[asset] || DEFAULT_WITHDRAW_NETWORKS[asset] || [asset],
      }));

    return {
      assets: assetList,
      supportedAssets: assetList.map((item) => item.assetSymbol),
      supportedNetworks: settings.withdrawNetworkMap,
      minWithdrawUsd: settings.minWithdrawUsd,
      maxWithdrawUsd: settings.maxWithdrawUsd,
      withdrawFeePercent: settings.withdrawFeePercent,
      allowMainBinaryTransfer: settings.allowMainToBinary || settings.allowBinaryToMain,
      walletRestrictions,
      defaultWalletSymbol,
      defaultAssetSymbol: "USDT",
    };
  }

  function mapDepositHistoryRow(row) {
    const status = mapStatus(row.status || "pending");
    const depositWalletSymbol = getDepositCreditWalletSymbol();
    return {
      historyId: `deposit-${row.id}`,
      type: "deposit",
      walletSymbol: depositWalletSymbol,
      assetSymbol: normalizeAssetCode(row.asset_symbol || "USDT") || "USDT",
      amountUsd: toMoney(toNumber(row.amount_usd, 0)),
      signedAmountUsd: toMoney(toNumber(row.amount_usd, 0)),
      feeAmountUsd: 0,
      netAmountUsd: toMoney(toNumber(row.amount_usd, 0)),
      status,
      title: "Deposit Request",
      subtitle: `Deposit ${status}`,
      note: String(row.note || ""),
      ref: `DEP-${row.id}`,
      createdAt: String(row.submitted_at || ""),
      updatedAt: String(row.reviewed_at || row.submitted_at || ""),
    };
  }

  function mapBinaryHistoryRow(row) {
    const ledgerType = normalizeLower(row.ledger_type || "binary_activity");
    const isNegative =
      ledgerType.includes("loss") || ledgerType.includes("debit") || ledgerType.includes("lock") || ledgerType.includes("stake");
    const amount = toMoney(toNumber(row.amount_usd, 0));

    return {
      historyId: `binary-${row.id}`,
      type: "binary",
      walletSymbol: toCoreWalletSymbol(row.asset_symbol || "BINARY_USDT"),
      assetSymbol: normalizeAssetCode(row.asset_symbol || "USDT") || "USDT",
      amountUsd: amount,
      signedAmountUsd: isNegative ? toMoney(-Math.abs(amount)) : Math.abs(amount),
      feeAmountUsd: 0,
      netAmountUsd: amount,
      status: "completed",
      title: "Binary Wallet Movement",
      subtitle: ledgerType,
      note: String(row.note || ""),
      ref: `BIN-${row.trade_id || row.id}`,
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.created_at || ""),
    };
  }

  function mapLumHistoryRow(row) {
    const ledgerType = normalizeLower(row.ledger_type || "lum_activity");
    const isNegative = ledgerType.includes("lock") || ledgerType.includes("debit");
    const amount = toMoney(toNumber(row.amount_usd, 0));

    return {
      historyId: `lum-${row.id}`,
      type: "lum",
      walletSymbol: toCoreWalletSymbol(row.asset_symbol || "SPOT_USDT"),
      assetSymbol: normalizeAssetCode(row.asset_symbol || "USDT") || "USDT",
      amountUsd: amount,
      signedAmountUsd: isNegative ? toMoney(-Math.abs(amount)) : Math.abs(amount),
      feeAmountUsd: 0,
      netAmountUsd: amount,
      status: "completed",
      title: "LUM Wallet Movement",
      subtitle: ledgerType,
      note: String(row.note || ""),
      ref: `LUM-${row.investment_id || row.id}`,
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.created_at || ""),
    };
  }

  function mapTransferHistoryRow(row) {
    const mapped = mapTransferRow(row);
    return {
      historyId: `transfer-${mapped.transferId}`,
      type: "transfer",
      walletSymbol: mapped.fromWalletSymbol,
      secondaryWalletSymbol: mapped.toWalletSymbol,
      assetSymbol: mapped.assetSymbol,
      amountUsd: mapped.amountUsd,
      signedAmountUsd: toMoney(-Math.abs(mapped.amountUsd)),
      feeAmountUsd: 0,
      netAmountUsd: mapped.amountUsd,
      status: mapped.status,
      title: "Wallet Transfer",
      subtitle: `${mapped.fromWalletSymbol} -> ${mapped.toWalletSymbol}`,
      note: mapped.note,
      ref: mapped.transferRef,
      createdAt: mapped.createdAt,
      updatedAt: mapped.updatedAt,
    };
  }

  function mapConversionHistoryRow(row) {
    const mapped = mapConversionRow(row);
    return {
      historyId: `convert-${mapped.conversionId}`,
      type: "convert",
      walletSymbol: mapped.walletSymbol,
      assetSymbol: mapped.fromAssetSymbol,
      secondaryAssetSymbol: mapped.toAssetSymbol,
      amountUsd: mapped.sourceAmount,
      signedAmountUsd: toMoney(-Math.abs(mapped.sourceAmount)),
      feeAmountUsd: mapped.feeAmount,
      netAmountUsd: mapped.convertedAmount,
      status: mapped.status,
      title: "Asset Conversion",
      subtitle: `${mapped.fromAssetSymbol} -> ${mapped.toAssetSymbol}`,
      note: mapped.note,
      ref: mapped.conversionRef,
      createdAt: mapped.createdAt,
      updatedAt: mapped.updatedAt,
    };
  }

  function mapWithdrawalHistoryRow(row) {
    const mapped = mapWithdrawalRow(row);
    return {
      historyId: `withdraw-${mapped.withdrawalId}`,
      type: "withdraw",
      walletSymbol: mapped.walletSymbol,
      assetSymbol: mapped.assetSymbol,
      amountUsd: mapped.amountUsd,
      signedAmountUsd: toMoney(-Math.abs(mapped.amountUsd)),
      feeAmountUsd: mapped.feeAmountUsd,
      netAmountUsd: mapped.netAmountUsd,
      status: mapped.status,
      title: "Withdrawal Request",
      subtitle: mapped.networkType ? `${mapped.assetSymbol} via ${mapped.networkType}` : mapped.assetSymbol,
      note: mapped.note,
      ref: mapped.withdrawalRef,
      createdAt: mapped.createdAt,
      updatedAt: mapped.updatedAt,
    };
  }

  function filterRowsByWallet(rows, walletFilter) {
    if (walletFilter === "all") {
      return rows;
    }
    return rows.filter((row) => {
      const primaryWallet = normalizeWalletSymbol(row.walletSymbol || "", row.walletSymbol || "");
      const secondaryWallet = normalizeWalletSymbol(row.secondaryWalletSymbol || "", row.secondaryWalletSymbol || "");
      return primaryWallet === walletFilter || secondaryWallet === walletFilter;
    });
  }

  function buildHistoryRows(userId, typeFilter, walletFilter) {
    const rows = [];

    if (typeFilter === "all" || typeFilter === "deposit") {
      rows.push(...listDepositsByUserStatement.all(userId).map((row) => mapDepositHistoryRow(row)));
    }

    if (typeFilter === "all" || typeFilter === "withdraw") {
      rows.push(
        ...listWithdrawalsByUserStatement
          .all({ userId, limit: 500, offset: 0 })
          .map((row) => mapWithdrawalHistoryRow(row)),
      );
    }

    if (typeFilter === "all" || typeFilter === "transfer") {
      rows.push(
        ...listTransfersByUserStatement
          .all({ userId, limit: 500, offset: 0 })
          .map((row) => mapTransferHistoryRow(row)),
      );
    }

    if (typeFilter === "all" || typeFilter === "convert") {
      rows.push(
        ...listConversionsByUserStatement
          .all({ userId, limit: 500, offset: 0 })
          .map((row) => mapConversionHistoryRow(row)),
      );
    }

    if (typeFilter === "all" || typeFilter === "binary") {
      rows.push(...listBinaryLedgerByUserStatement.all(userId).map((row) => mapBinaryHistoryRow(row)));
    }

    if (typeFilter === "all" || typeFilter === "lum") {
      rows.push(...listLumLedgerByUserStatement.all(userId).map((row) => mapLumHistoryRow(row)));
    }

    const filtered = filterRowsByWallet(rows, walletFilter);
    filtered.sort((a, b) => parseIsoMs(b.createdAt) - parseIsoMs(a.createdAt));
    return filtered;
  }

  function createTransfer({ userId, fromWalletSymbol, toWalletSymbol, amountUsd, note = "" }) {
    const settings = getAssetModuleSettings();
    const fromWallet = normalizeWalletSymbol(fromWalletSymbol || "", "SPOT_USDT");
    const toWallet = normalizeWalletSymbol(toWalletSymbol || "", "MAIN_USDT");
    assertTransferFlowAllowed(fromWallet, toWallet, settings);
    assertWalletActionAllowed({ userId, walletSymbol: fromWallet, actionType: "transfer" });

    const transferAmount = normalizeUsdAmount(amountUsd);
    const nowIso = toIso(getNow());

    const tx = db.transaction(() => {
      normalizeLegacyWalletSymbolsForUser(userId, nowIso);
      ensureCoreWallets(userId, nowIso);

      const fromDetail = ensureWalletDetailRow(userId, fromWallet, nowIso, fromWallet);
      const toDetail = ensureWalletDetailRow(userId, toWallet, nowIso, toWallet);

      const fromAvailable = toMoney(toNumber(fromDetail.available_usd, 0));
      if (fromAvailable < transferAmount) {
        throw new Error(`Insufficient available balance in ${fromWallet}.`);
      }

      const toAvailable = toMoney(toNumber(toDetail.available_usd, 0));

      const nextFrom = saveWalletDetail({
        userId,
        assetSymbol: fromWallet,
        availableUsd: toMoney(fromAvailable - transferAmount),
        lockedUsd: toNumber(fromDetail.locked_usd, 0),
        rewardEarnedUsd: toNumber(fromDetail.reward_earned_usd, 0),
        updatedAt: nowIso,
      });

      const nextTo = saveWalletDetail({
        userId,
        assetSymbol: toWallet,
        availableUsd: toMoney(toAvailable + transferAmount),
        lockedUsd: toNumber(toDetail.locked_usd, 0),
        rewardEarnedUsd: toNumber(toDetail.reward_earned_usd, 0),
        updatedAt: nowIso,
      });

      syncWalletSummaryFromDetail({ userId, assetSymbol: fromWallet, updatedAt: nowIso, assetNameFallback: fromWallet });
      syncWalletSummaryFromDetail({ userId, assetSymbol: toWallet, updatedAt: nowIso, assetNameFallback: toWallet });

      const transferRef = buildTransferRef();
      insertTransferRequestStatement.run({
        transferRef,
        userId,
        fromWalletSymbol: fromWallet,
        toWalletSymbol: toWallet,
        assetSymbol: "USDT",
        amountUsd: transferAmount,
        status: "completed",
        note: sanitizeShortText(note || "", 280),
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      insertAssetWalletLedgerEntry({
        userId,
        ledgerRefType: "wallet_transfer",
        ledgerRefId: transferRef,
        walletSymbol: fromWallet,
        assetSymbol: "USDT",
        movementType: "debit",
        amountUsd: transferAmount,
        balanceBeforeUsd: fromAvailable,
        balanceAfterUsd: toNumber(nextFrom.available_usd, 0),
        note: `Transfer to ${toWallet}`,
        createdAt: nowIso,
        createdBy: userId,
      });

      insertAssetWalletLedgerEntry({
        userId,
        ledgerRefType: "wallet_transfer",
        ledgerRefId: transferRef,
        walletSymbol: toWallet,
        assetSymbol: "USDT",
        movementType: "credit",
        amountUsd: transferAmount,
        balanceBeforeUsd: toAvailable,
        balanceAfterUsd: toNumber(nextTo.available_usd, 0),
        note: `Transfer from ${fromWallet}`,
        createdAt: nowIso,
        createdBy: userId,
      });

      const transferRow = db.prepare(`SELECT * FROM wallet_transfer_requests WHERE transfer_ref = ? LIMIT 1`).get(transferRef);
      return {
        transfer: mapTransferRow(transferRow),
        wallet: buildWalletAggregation(userId),
      };
    });

    return tx();
  }

  function createConversion({ userId, walletSymbol, fromAssetSymbol, toAssetSymbol, amount, note = "" }) {
    const settings = getAssetModuleSettings();
    const selectedWallet = normalizeWalletSymbol(walletSymbol || "SPOT_USDT", "SPOT_USDT");
    if (!CORE_WALLET_SET.has(selectedWallet)) {
      throw new Error("Unsupported wallet for conversion.");
    }
    assertWalletActionAllowed({ userId, walletSymbol: selectedWallet, actionType: "convert" });

    const scope = getWalletScope(selectedWallet);
    const quote = resolveConvertQuote({
      fromAssetSymbol,
      toAssetSymbol,
      amount,
      settings,
    });

    const fromWalletAssetSymbol = buildScopedWalletSymbol(scope, quote.fromAsset);
    const toWalletAssetSymbol = buildScopedWalletSymbol(scope, quote.toAsset);
    const nowIso = toIso(getNow());

    const tx = db.transaction(() => {
      normalizeLegacyWalletSymbolsForUser(userId, nowIso);
      ensureCoreWallets(userId, nowIso);

      const fromDetail = ensureWalletDetailRow(userId, fromWalletAssetSymbol, nowIso, `${scope} ${quote.fromAsset}`);
      const toDetail = ensureWalletDetailRow(userId, toWalletAssetSymbol, nowIso, `${scope} ${quote.toAsset}`);

      const fromAvailable = toMoney(toNumber(fromDetail.available_usd, 0));
      const toAvailable = toMoney(toNumber(toDetail.available_usd, 0));

      if (fromAvailable < quote.sourceAmount) {
        throw new Error(`Insufficient ${quote.fromAsset} balance in ${selectedWallet}.`);
      }

      const nextFrom = saveWalletDetail({
        userId,
        assetSymbol: fromWalletAssetSymbol,
        availableUsd: toMoney(fromAvailable - quote.sourceAmount),
        lockedUsd: toNumber(fromDetail.locked_usd, 0),
        rewardEarnedUsd: toNumber(fromDetail.reward_earned_usd, 0),
        updatedAt: nowIso,
      });

      const nextTo = saveWalletDetail({
        userId,
        assetSymbol: toWalletAssetSymbol,
        availableUsd: toMoney(toAvailable + quote.convertedAmount),
        lockedUsd: toNumber(toDetail.locked_usd, 0),
        rewardEarnedUsd: toNumber(toDetail.reward_earned_usd, 0),
        updatedAt: nowIso,
      });

      syncWalletSummaryFromDetail({ userId, assetSymbol: fromWalletAssetSymbol, updatedAt: nowIso, assetNameFallback: fromWalletAssetSymbol });
      syncWalletSummaryFromDetail({ userId, assetSymbol: toWalletAssetSymbol, updatedAt: nowIso, assetNameFallback: toWalletAssetSymbol });

      const conversionRef = buildConversionRef();
      insertConversionRequestStatement.run({
        conversionRef,
        userId,
        walletSymbol: selectedWallet,
        fromAssetSymbol: quote.fromAsset,
        toAssetSymbol: quote.toAsset,
        sourceAmount: quote.sourceAmount,
        rateSnapshot: quote.rateSnapshot,
        convertedAmount: quote.convertedAmount,
        feeAmount: quote.feeAmount,
        status: "completed",
        note: sanitizeShortText(note || "", 280),
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      insertAssetWalletLedgerEntry({
        userId,
        ledgerRefType: "wallet_convert",
        ledgerRefId: conversionRef,
        walletSymbol: selectedWallet,
        assetSymbol: quote.fromAsset,
        movementType: "debit",
        amountUsd: quote.sourceAmount,
        balanceBeforeUsd: fromAvailable,
        balanceAfterUsd: toNumber(nextFrom.available_usd, 0),
        note: `Convert ${quote.fromAsset} -> ${quote.toAsset}`,
        createdAt: nowIso,
        createdBy: userId,
      });

      insertAssetWalletLedgerEntry({
        userId,
        ledgerRefType: "wallet_convert",
        ledgerRefId: conversionRef,
        walletSymbol: selectedWallet,
        assetSymbol: quote.toAsset,
        movementType: "credit",
        amountUsd: quote.convertedAmount,
        balanceBeforeUsd: toAvailable,
        balanceAfterUsd: toNumber(nextTo.available_usd, 0),
        note: `Convert receive ${quote.toAsset}`,
        createdAt: nowIso,
        createdBy: userId,
      });

      const row = db.prepare(`SELECT * FROM wallet_conversion_requests WHERE conversion_ref = ? LIMIT 1`).get(conversionRef);
      return {
        conversion: mapConversionRow(row),
        quote,
        wallet: buildWalletAggregation(userId),
      };
    });

    return tx();
  }

  function createWithdrawal({
    userId,
    walletSymbol,
    assetSymbol,
    networkType,
    amountUsd,
    destinationAddress,
    destinationLabel = "",
    note = "",
  }) {
    const settings = getAssetModuleSettings();
    const selectedWallet = normalizeWalletSymbol(walletSymbol || "SPOT_USDT", "SPOT_USDT");
    const coreWallet = toCoreWalletSymbol(selectedWallet);

    if (!CORE_WALLET_SET.has(coreWallet)) {
      throw new Error("Unsupported wallet for withdrawal.");
    }

    assertWalletActionAllowed({ userId, walletSymbol: coreWallet, actionType: "withdraw" });

    if (!shouldAllowWithdraw(coreWallet, settings)) {
      if (coreWallet === "BINARY_USDT") {
        throw new Error("Binary wallet direct withdrawal is disabled. Transfer to Spot wallet first.");
      }
      if (coreWallet === "MAIN_USDT") {
        throw new Error("Main wallet direct withdrawal is disabled.");
      }
      throw new Error("Withdrawal is not available for this wallet.");
    }

    const normalizedAsset = normalizeAssetCode(assetSymbol || "USDT") || "USDT";
    const amount = normalizeUsdAmount(amountUsd);

    if (Array.isArray(settings.supportedWithdrawAssets) && settings.supportedWithdrawAssets.length) {
      if (!settings.supportedWithdrawAssets.includes(normalizedAsset)) {
        throw new Error("This asset is currently not allowed for withdrawal.");
      }
    }

    if (amount < settings.minWithdrawUsd) {
      throw new Error(`Minimum withdrawal is ${settings.minWithdrawUsd} ${normalizedAsset}.`);
    }
    if (settings.maxWithdrawUsd !== null && amount > settings.maxWithdrawUsd) {
      throw new Error(`Maximum withdrawal is ${settings.maxWithdrawUsd} ${normalizedAsset}.`);
    }

    const normalizedNetwork = sanitizeShortText(networkType || "", 40);
    const networkOptions = settings.withdrawNetworkMap?.[normalizedAsset] || DEFAULT_WITHDRAW_NETWORKS[normalizedAsset] || [normalizedAsset];
    if (networkOptions.length > 0 && normalizedNetwork && !networkOptions.includes(normalizedNetwork)) {
      throw new Error("Selected network is not supported for this asset.");
    }

    const cleanAddress = sanitizeShortText(destinationAddress || "", 240);
    if (!cleanAddress || cleanAddress.length < 10) {
      throw new Error("Please provide a valid destination address.");
    }

    const selectedScope = getWalletScope(coreWallet);
    const sourceWalletAssetSymbol = buildScopedWalletSymbol(selectedScope, normalizedAsset);

    const feeAmountUsd = toMoney(amount * (Math.max(0, toNumber(settings.withdrawFeePercent, defaultWithdrawFeePercent)) / 100));
    const netAmountUsd = toMoney(Math.max(0, amount - feeAmountUsd));
    if (netAmountUsd <= 0) {
      throw new Error("Net withdrawal amount is too low after fee.");
    }

    const nowIso = toIso(getNow());

    const tx = db.transaction(() => {
      normalizeLegacyWalletSymbolsForUser(userId, nowIso);
      ensureCoreWallets(userId, nowIso);

      const sourceWallet = ensureWalletDetailRow(userId, sourceWalletAssetSymbol, nowIso, sourceWalletAssetSymbol);
      const availableBefore = toMoney(toNumber(sourceWallet.available_usd, 0));
      const lockedBefore = toMoney(toNumber(sourceWallet.locked_usd, 0));

      if (availableBefore < amount) {
        throw new Error(`Insufficient available ${normalizedAsset} balance.`);
      }

      const nextWallet = saveWalletDetail({
        userId,
        assetSymbol: sourceWalletAssetSymbol,
        availableUsd: toMoney(availableBefore - amount),
        lockedUsd: toMoney(lockedBefore + amount),
        rewardEarnedUsd: toNumber(sourceWallet.reward_earned_usd, 0),
        updatedAt: nowIso,
      });

      syncWalletSummaryFromDetail({
        userId,
        assetSymbol: sourceWalletAssetSymbol,
        updatedAt: nowIso,
        assetNameFallback: sourceWalletAssetSymbol,
      });

      const withdrawalRef = buildWithdrawalRef();
      insertWithdrawalRequestStatement.run({
        withdrawalRef,
        userId,
        walletSymbol: coreWallet,
        assetSymbol: normalizedAsset,
        networkType: normalizedNetwork || null,
        destinationAddress: cleanAddress,
        destinationLabel: sanitizeShortText(destinationLabel || "", 120) || null,
        amountUsd: amount,
        feeAmountUsd,
        netAmountUsd,
        status: "pending",
        note: sanitizeShortText(note || "", 280),
        submittedAt: nowIso,
        reviewedAt: null,
        reviewedBy: null,
        completedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      insertAssetWalletLedgerEntry({
        userId,
        ledgerRefType: "withdraw_request",
        ledgerRefId: withdrawalRef,
        walletSymbol: coreWallet,
        assetSymbol: normalizedAsset,
        movementType: "lock",
        amountUsd: amount,
        balanceBeforeUsd: availableBefore,
        balanceAfterUsd: toNumber(nextWallet.available_usd, 0),
        note: `Withdrawal request submitted (${normalizedAsset}).`,
        createdAt: nowIso,
        createdBy: userId,
      });

      const row = db.prepare(`SELECT * FROM withdrawal_requests WHERE withdrawal_ref = ? LIMIT 1`).get(withdrawalRef);
      return {
        withdrawal: mapWithdrawalRow(row),
        wallet: buildWalletAggregation(userId),
      };
    });

    return tx();
  }

  function toLikeKeyword(value = "") {
    const keyword = sanitizeShortText(value || "", 120);
    return keyword ? `%${keyword}%` : "";
  }

  function mapWalletDeskRow(row) {
    return {
      userId: String(row.user_id || ""),
      accountName: String(row.account_name || ""),
      accountEmail: String(row.account_email || ""),
      spotAvailableUsd: toMoney(toNumber(row.spot_available_usd, 0)),
      spotLockedUsd: toMoney(toNumber(row.spot_locked_usd, 0)),
      mainAvailableUsd: toMoney(toNumber(row.main_available_usd, 0)),
      mainLockedUsd: toMoney(toNumber(row.main_locked_usd, 0)),
      binaryAvailableUsd: toMoney(toNumber(row.binary_available_usd, 0)),
      binaryLockedUsd: toMoney(toNumber(row.binary_locked_usd, 0)),
      totalAvailableUsd: toMoney(toNumber(row.total_available_usd, 0)),
      totalLockedUsd: toMoney(toNumber(row.total_locked_usd, 0)),
      totalAssetsUsd: toMoney(toNumber(row.total_assets_usd, 0)),
      latestActivityType: String(row.latest_activity_type || ""),
      latestActivityAt: String(row.latest_activity_at || ""),
    };
  }

  function mapAdminTransferRow(row) {
    const mapped = mapTransferRow(row);
    return {
      ...mapped,
      accountName: String(row?.account_name || ""),
      accountEmail: String(row?.account_email || ""),
      route: `${mapped.fromWalletSymbol}->${mapped.toWalletSymbol}`,
    };
  }

  function mapAdminConversionRow(row) {
    const mapped = mapConversionRow(row);
    return {
      ...mapped,
      accountName: String(row?.account_name || ""),
      accountEmail: String(row?.account_email || ""),
      pairKey: `${mapped.fromAssetSymbol}->${mapped.toAssetSymbol}`,
    };
  }

  function mapAdminWithdrawalRow(row) {
    const mapped = mapWithdrawalRow(row);
    return {
      ...mapped,
      accountName: String(row?.account_name || ""),
      accountEmail: String(row?.account_email || ""),
    };
  }

  function mapAssetAuditRow(row) {
    return {
      auditLogId: toNumber(row?.id, 0),
      adminUserId: String(row?.admin_user_id || ""),
      adminName: String(row?.admin_name || ""),
      adminEmail: String(row?.admin_email || ""),
      actionType: String(row?.action_type || ""),
      targetType: String(row?.target_type || ""),
      targetId: String(row?.target_id || ""),
      note: String(row?.note || ""),
      createdAt: String(row?.created_at || ""),
    };
  }

  function mapAssetLedgerRow(row) {
    return {
      ledgerId: toNumber(row?.id, 0),
      userId: String(row?.user_id || ""),
      ledgerRefType: String(row?.ledger_ref_type || ""),
      ledgerRefId: String(row?.ledger_ref_id || ""),
      walletSymbol: normalizeWalletSymbol(row?.wallet_symbol || "SPOT_USDT", "SPOT_USDT"),
      assetSymbol: normalizeAssetCode(row?.asset_symbol || "USDT") || "USDT",
      movementType: normalizeMovementType(row?.movement_type || "credit"),
      amountUsd: toMoney(toNumber(row?.amount_usd, 0)),
      balanceBeforeUsd: row?.balance_before_usd === null || row?.balance_before_usd === undefined ? null : toMoney(toNumber(row.balance_before_usd, 0)),
      balanceAfterUsd: row?.balance_after_usd === null || row?.balance_after_usd === undefined ? null : toMoney(toNumber(row.balance_after_usd, 0)),
      note: String(row?.note || ""),
      createdAt: String(row?.created_at || ""),
      createdBy: String(row?.created_by || ""),
    };
  }

  function getAdminActor(req) {
    return sanitizeShortText(req?.currentUser?.userId || req?.currentUser?.email || "admin", 80) || "admin";
  }

  function parseArrayInput(value) {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === "string") {
      const text = value.trim();
      if (!text) {
        return [];
      }
      if (text.startsWith("[")) {
        try {
          const parsed = JSON.parse(text);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return text
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
        }
      }
      return text
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  function parseObjectInput(value, fallback = {}) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        return fallback;
      }
    }
    return fallback;
  }

  function resolveCoreWalletFilter(rawValue = "all") {
    return normalizeWalletFilter(rawValue || "all");
  }

  function loadWalletDeskFilters(req) {
    return {
      walletFilter: resolveCoreWalletFilter(parseRequestValue(req, "wallet", "all")),
      userKeyword: sanitizeShortText(parseRequestValue(req, "userKeyword", ""), 120),
    };
  }

  function buildFreezeSummaryForUser(userId = "") {
    const rules = listWalletFreezeRulesByUserStatement.all(userId).map((row) => mapFreezeRuleRow(row));
    const summary = {
      hasAnyFreeze: false,
      freezeDeposit: false,
      freezeWithdraw: false,
      freezeTransfer: false,
      freezeConvert: false,
    };

    for (const row of rules) {
      summary.freezeDeposit = summary.freezeDeposit || Boolean(row.freezeDeposit);
      summary.freezeWithdraw = summary.freezeWithdraw || Boolean(row.freezeWithdraw);
      summary.freezeTransfer = summary.freezeTransfer || Boolean(row.freezeTransfer);
      summary.freezeConvert = summary.freezeConvert || Boolean(row.freezeConvert);
    }
    summary.hasAnyFreeze = summary.freezeDeposit || summary.freezeWithdraw || summary.freezeTransfer || summary.freezeConvert;
    return { summary, rules };
  }

  function handleAdminAssetsDashboardSummary(_req, res) {
    try {
      const totals = totalsByWalletScopeStatement.get() || {};
      const totalSpotAssets = toMoney(toNumber(totals.total_spot_assets, 0));
      const totalMainAssets = toMoney(toNumber(totals.total_main_assets, 0));
      const totalBinaryAssets = toMoney(toNumber(totals.total_binary_assets, 0));
      const totalUserAssets = toMoney(toNumber(totals.total_user_assets, 0));
      const totalLockedAssets = toMoney(toNumber(totals.total_locked_assets, 0));
      const today = toIso(getNow()).slice(0, 10);
      const fromDate = toIso(new Date(getNow().getTime() - 13 * 24 * 60 * 60 * 1000));

      const walletDistribution = [
        { walletSymbol: "SPOT_USDT", walletName: "Spot Wallet", valueUsd: totalSpotAssets },
        { walletSymbol: "MAIN_USDT", walletName: "Main Wallet", valueUsd: totalMainAssets },
        { walletSymbol: "BINARY_USDT", walletName: "Binary Wallet", valueUsd: totalBinaryAssets },
      ].map((item) => ({
        ...item,
        percentage: percent(item.valueUsd, totalUserAssets),
      }));

      const movementTrend = listWalletMovementTrendStatement
        .all({ fromDate })
        .map((row) => ({
          day: String(row.day || ""),
          spotAmountUsd: toMoney(toNumber(row.spot_amount_usd, 0)),
          mainAmountUsd: toMoney(toNumber(row.main_amount_usd, 0)),
          binaryAmountUsd: toMoney(toNumber(row.binary_amount_usd, 0)),
          actionCount: toNumber(row.action_count, 0),
        }));

      const topExposureUsers = listTopExposureUsersStatement.all({ limit: 8 }).map((row) => ({
        userId: String(row.user_id || ""),
        accountName: String(row.account_name || ""),
        accountEmail: String(row.account_email || ""),
        totalAssetsUsd: toMoney(toNumber(row.total_assets_usd, 0)),
        totalLockedUsd: toMoney(toNumber(row.total_locked_usd, 0)),
      }));

      const mostActiveActions = listMostActiveActionsStatement.all({ limit: 8 }).map((row) => ({
        ledgerRefType: String(row.ledger_ref_type || ""),
        actionCount: toNumber(row.action_count, 0),
        volumeUsd: toMoney(toNumber(row.volume_usd, 0)),
      }));

      res.json({
        summary: {
          totalSpotAssets,
          totalMainAssets,
          totalBinaryAssets,
          totalUserAssets,
          totalLockedAssets,
          pendingWithdrawals: toNumber(countPendingWithdrawalsStatement.get()?.total, 0),
          todayTransfers: toNumber(countTransfersByDateStatement.get(today)?.total, 0),
          todayConversions: toNumber(countConversionsByDateStatement.get(today)?.total, 0),
        },
        walletDistribution,
        movementTrend,
        topExposureUsers,
        mostActiveActions,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load assets dashboard summary." });
    }
  }

  function handleAdminAssetsWallets(req, res) {
    try {
      const filters = loadWalletDeskFilters(req);
      const { page, limit, offset } = buildPagination(
        parseRequestValue(req, "page", 1),
        parseRequestValue(req, "limit", 30),
        30,
        200,
      );

      const scopedParams = {
        walletFilter: filters.walletFilter,
        userKeyword: filters.userKeyword,
        likeUserKeyword: toLikeKeyword(filters.userKeyword),
        limit,
        offset,
      };

      const rows = listWalletDeskRowsStatement.all(scopedParams).map((row) => {
        const mapped = mapWalletDeskRow(row);
        const freeze = buildFreezeSummaryForUser(mapped.userId);
        return {
          ...mapped,
          freezeSummary: freeze.summary,
        };
      });

      const total = toNumber(countWalletDeskRowsStatement.get(scopedParams)?.total, 0);

      res.json({
        filter: {
          wallet: filters.walletFilter,
          userKeyword: filters.userKeyword,
        },
        pagination: {
          page,
          limit,
          total,
          hasMore: offset + rows.length < total,
        },
        rows,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load wallets desk." });
    }
  }

  function handleAdminAssetsWalletDetail(req, res) {
    try {
      const userId = sanitizeShortText(
        req?.params?.userId || parseRequestValue(req, "userId", req?.query?.userId || ""),
        80,
      );
      if (!userId) {
        throw new Error("Valid userId is required.");
      }

      const identity = findUserIdentityStatement.get(userId);
      if (!identity) {
        res.status(404).json({ error: "User not found." });
        return;
      }

      const walletFilter = resolveCoreWalletFilter(parseRequestValue(req, "wallet", "all"));
      const typeFilter = sanitizeShortText(parseRequestValue(req, "type", "all"), 80) || "all";
      const { page, limit, offset } = buildPagination(
        parseRequestValue(req, "page", 1),
        parseRequestValue(req, "limit", 40),
        40,
        200,
      );

      const wallet = buildWalletAggregation(userId);
      const freeze = buildFreezeSummaryForUser(userId);
      const ledgerRows = listAssetWalletLedgerByUserStatement
        .all({
          userId,
          walletFilter,
          typeFilter,
          limit,
          offset,
        })
        .map((row) => mapAssetLedgerRow(row));
      const ledgerTotal = toNumber(
        countAssetWalletLedgerByUserStatement.get({
          userId,
          walletFilter,
          typeFilter,
        })?.total,
        0,
      );

      res.json({
        user: {
          userId: String(identity.user_id || ""),
          accountName: String(identity.name || ""),
          accountEmail: String(identity.email || ""),
          accountStatus: String(identity.account_status || ""),
          kycStatus: String(identity.kyc_status || ""),
        },
        wallet: {
          wallets: wallet.wallets,
          totalAssets: wallet.totalAssets,
          distributionPercentages: wallet.distributionPercentages,
          chartData: wallet.chartData,
          walletDetails: wallet.walletDetails,
        },
        freezeRules: freeze.rules,
        freezeSummary: freeze.summary,
        recentLedger: {
          pagination: {
            page,
            limit,
            total: ledgerTotal,
            hasMore: offset + ledgerRows.length < ledgerTotal,
          },
          rows: ledgerRows,
        },
        historyRows: buildHistoryRows(userId, "all", walletFilter).slice(0, 200),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load wallet detail." });
    }
  }

  function handleAdminAssetsWalletAdjust(req, res) {
    try {
      const userId = sanitizeShortText(parseRequestValue(req, "userId", ""), 80);
      const walletSymbol = normalizeWalletSymbol(parseRequestValue(req, "walletSymbol", "SPOT_USDT"), "SPOT_USDT");
      const amountUsd = normalizeUsdAmount(parseRequestValue(req, "amountUsd", 0));
      const movementRaw = normalizeLower(parseRequestValue(req, "movementType", "credit"));
      const movementType = normalizeMovementType(movementRaw);
      const note = sanitizeShortText(parseRequestValue(req, "note", ""), 280);
      const actor = getAdminActor(req);

      if (!userId) {
        throw new Error("Valid userId is required.");
      }
      if (!["credit", "debit", "lock", "unlock"].includes(movementRaw)) {
        throw new Error("movementType must be one of credit, debit, lock, unlock.");
      }

      const identity = findUserIdentityStatement.get(userId);
      if (!identity) {
        res.status(404).json({ error: "User not found." });
        return;
      }

      const nowIso = toIso(getNow());
      const tx = db.transaction(() => {
        normalizeLegacyWalletSymbolsForUser(userId, nowIso);
        ensureWalletDetailRowsFromSummaries(userId, nowIso);
        ensureCoreWallets(userId, nowIso);

        const walletDetail = ensureWalletDetailRow(userId, walletSymbol, nowIso, walletSymbol);
        const availableBefore = toMoney(toNumber(walletDetail.available_usd, 0));
        const lockedBefore = toMoney(toNumber(walletDetail.locked_usd, 0));

        let nextAvailable = availableBefore;
        let nextLocked = lockedBefore;

        if (movementType === "credit") {
          nextAvailable = toMoney(nextAvailable + amountUsd);
        } else if (movementType === "debit") {
          if (availableBefore < amountUsd) {
            throw new Error("Insufficient available balance for debit adjustment.");
          }
          nextAvailable = toMoney(nextAvailable - amountUsd);
        } else if (movementType === "lock") {
          if (availableBefore < amountUsd) {
            throw new Error("Insufficient available balance for lock adjustment.");
          }
          nextAvailable = toMoney(nextAvailable - amountUsd);
          nextLocked = toMoney(nextLocked + amountUsd);
        } else if (movementType === "unlock") {
          if (lockedBefore < amountUsd) {
            throw new Error("Insufficient locked balance for unlock adjustment.");
          }
          nextLocked = toMoney(nextLocked - amountUsd);
          nextAvailable = toMoney(nextAvailable + amountUsd);
        }

        const saved = saveWalletDetail({
          userId,
          assetSymbol: walletSymbol,
          availableUsd: nextAvailable,
          lockedUsd: nextLocked,
          rewardEarnedUsd: toNumber(walletDetail.reward_earned_usd, 0),
          updatedAt: nowIso,
        });

        syncWalletSummaryFromDetail({
          userId,
          assetSymbol: walletSymbol,
          updatedAt: nowIso,
          assetNameFallback: walletSymbol,
        });

        const adjustmentRef = `ADJ-${Date.now().toString(36).toUpperCase()}`;
        insertAssetWalletLedgerEntry({
          userId,
          ledgerRefType: "manual_adjustment",
          ledgerRefId: adjustmentRef,
          walletSymbol: walletSymbol,
          assetSymbol: walletSymbol.includes("_") ? walletSymbol.split("_").slice(1).join("_") : "USDT",
          movementType,
          amountUsd,
          balanceBeforeUsd: movementType === "unlock" ? lockedBefore : availableBefore,
          balanceAfterUsd: movementType === "unlock" ? nextLocked : toNumber(saved.available_usd, 0),
          note: note || `Admin manual ${movementType} adjustment.`,
          createdAt: nowIso,
          createdBy: actor,
        });

        insertAssetAdminAuditLog({
          adminUserId: actor,
          actionType: "wallet_adjustment",
          targetType: "wallet",
          targetId: `${userId}:${walletSymbol}`,
          note: note || `Manual ${movementType} ${amountUsd}`,
          createdAt: nowIso,
        });

        return {
          wallet: buildWalletAggregation(userId),
        };
      });

      const result = tx();
      res.json({
        message: "Wallet balance adjusted successfully.",
        userId,
        walletSymbol,
        movementType,
        amountUsd,
        wallet: {
          wallets: result.wallet.wallets,
          totalAssets: result.wallet.totalAssets,
          distributionPercentages: result.wallet.distributionPercentages,
          chartData: result.wallet.chartData,
          walletDetails: result.wallet.walletDetails,
        },
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not adjust wallet balance." });
    }
  }

  function handleAdminAssetsWalletFreeze(req, res) {
    try {
      const userId = sanitizeShortText(parseRequestValue(req, "userId", ""), 80);
      const walletSymbol = resolveCoreWalletFilter(parseRequestValue(req, "walletSymbol", "SPOT_USDT"));
      const freezeDeposit = normalizeBoolean(parseRequestValue(req, "freezeDeposit", false), false);
      const freezeWithdraw = normalizeBoolean(parseRequestValue(req, "freezeWithdraw", false), false);
      const freezeTransfer = normalizeBoolean(parseRequestValue(req, "freezeTransfer", false), false);
      const freezeConvert = normalizeBoolean(parseRequestValue(req, "freezeConvert", false), false);
      const note = sanitizeShortText(parseRequestValue(req, "note", ""), 280);
      const actor = getAdminActor(req);

      if (!userId) {
        throw new Error("Valid userId is required.");
      }
      if (walletSymbol === "all") {
        throw new Error("walletSymbol is required.");
      }

      const identity = findUserIdentityStatement.get(userId);
      if (!identity) {
        res.status(404).json({ error: "User not found." });
        return;
      }

      const nowIso = toIso(getNow());
      const existing = findWalletFreezeRuleStatement.get(userId, walletSymbol);
      upsertWalletFreezeRuleStatement.run({
        userId,
        walletSymbol,
        freezeDeposit: freezeDeposit ? 1 : 0,
        freezeWithdraw: freezeWithdraw ? 1 : 0,
        freezeTransfer: freezeTransfer ? 1 : 0,
        freezeConvert: freezeConvert ? 1 : 0,
        note,
        createdAt: existing?.created_at || nowIso,
        updatedAt: nowIso,
        updatedBy: actor,
      });

      insertAssetAdminAuditLog({
        adminUserId: actor,
        actionType: "wallet_freeze_update",
        targetType: "wallet_freeze_rule",
        targetId: `${userId}:${walletSymbol}`,
        note: note || "Wallet freeze rule updated.",
        createdAt: nowIso,
      });

      const updated = mapFreezeRuleRow(findWalletFreezeRuleStatement.get(userId, walletSymbol));
      res.json({
        message: "Wallet freeze rule saved.",
        rule: updated,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not update freeze rule." });
    }
  }

  function resolveAdminWithdrawalRow(req) {
    const withdrawalId = toNumber(parseRequestValue(req, "withdrawalId", 0), 0);
    const withdrawalRef = sanitizeShortText(parseRequestValue(req, "withdrawalRef", ""), 80);
    if (withdrawalId > 0) {
      return findWithdrawalByIdStatement.get(withdrawalId);
    }
    if (withdrawalRef) {
      return findWithdrawalByRefStatement.get(withdrawalRef);
    }
    throw new Error("withdrawalId or withdrawalRef is required.");
  }

  function updateWithdrawalForAdmin({ existing, status, note, actor, completedAt = null }) {
    const nowIso = toIso(getNow());
    updateWithdrawalStatusStatement.run({
      id: existing.id,
      status,
      note: note || String(existing.note || ""),
      reviewedAt: nowIso,
      reviewedBy: actor,
      completedAt,
      updatedAt: nowIso,
    });
    return findWithdrawalByIdStatement.get(existing.id);
  }

  function handleAdminAssetsWithdrawals(req, res) {
    try {
      const { page, limit, offset } = buildPagination(
        parseRequestValue(req, "page", 1),
        parseRequestValue(req, "limit", 40),
        40,
        200,
      );

      const statusRaw = normalizeLower(parseRequestValue(req, "status", "all"));
      const statusFilter = statusRaw === "all" ? "all" : normalizeWithdrawalStatus(statusRaw);
      const assetFilterRaw = parseRequestValue(req, "asset", "all");
      const assetFilter = normalizeLower(assetFilterRaw) === "all" ? "all" : normalizeAssetCode(assetFilterRaw || "USDT");
      const networkFilterRaw = sanitizeShortText(parseRequestValue(req, "network", "all"), 40);
      const networkFilter = normalizeLower(networkFilterRaw) === "all" ? "all" : networkFilterRaw;
      const walletFilter = resolveCoreWalletFilter(parseRequestValue(req, "wallet", "all"));
      const userKeyword = sanitizeShortText(parseRequestValue(req, "userKeyword", ""), 120);

      const scopedParams = {
        statusFilter,
        assetFilter,
        networkFilter,
        walletFilter,
        userKeyword,
        likeUserKeyword: toLikeKeyword(userKeyword),
        limit,
        offset,
      };

      const rows = listWithdrawalsForAdminStatement.all(scopedParams).map((row) => mapAdminWithdrawalRow(row));
      const total = toNumber(countWithdrawalsForAdminStatement.get(scopedParams)?.total, 0);

      const statusMap = {};
      for (const row of countWithdrawalsByStatusForAdminStatement.all()) {
        statusMap[normalizeWithdrawalStatus(row.status || "")] = toNumber(row.total, 0);
      }

      res.json({
        filter: {
          status: statusFilter,
          asset: assetFilter,
          network: networkFilter,
          wallet: walletFilter,
          userKeyword,
        },
        stats: {
          total,
          pending: toNumber(statusMap.pending, 0),
          processing: toNumber(statusMap.processing, 0),
          approved: toNumber(statusMap.approved, 0),
          rejected: toNumber(statusMap.rejected, 0),
          completed: toNumber(statusMap.completed, 0),
          cancelled: toNumber(statusMap.cancelled, 0),
        },
        pagination: {
          page,
          limit,
          total,
          hasMore: offset + rows.length < total,
        },
        rows,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load withdrawal desk." });
    }
  }

  function handleAdminAssetsWithdrawReview(req, res) {
    try {
      const actor = getAdminActor(req);
      const decisionRaw = parseRequestValue(req, "decision", parseRequestValue(req, "status", ""));
      if (!sanitizeShortText(decisionRaw || "", 40)) {
        throw new Error("decision or status is required.");
      }
      const targetStatus = normalizeWithdrawalStatus(decisionRaw || "pending");
      const note = sanitizeShortText(parseRequestValue(req, "note", ""), 280);

      if (!WITHDRAW_REVIEW_ALLOWED_SET.has(targetStatus)) {
        throw new Error("Invalid review status.");
      }
      if (targetStatus === "completed") {
        throw new Error("Use complete endpoint to finalize withdrawals.");
      }

      const existing = resolveAdminWithdrawalRow(req);
      if (!existing) {
        res.status(404).json({ error: "Withdrawal not found." });
        return;
      }

      const previousStatus = normalizeWithdrawalStatus(existing.status || "pending");
      if (WITHDRAW_FINAL_STATUS_SET.has(previousStatus) && previousStatus !== targetStatus) {
        throw new Error(`Withdrawal already finalized as ${previousStatus}.`);
      }

      const tx = db.transaction(() => {
        const nowIso = toIso(getNow());
        const userId = String(existing.user_id || "");
        const walletSymbol = normalizeWalletSymbol(existing.wallet_symbol || "SPOT_USDT", "SPOT_USDT");
        const scope = getWalletScope(walletSymbol);
        const assetCode = normalizeAssetCode(existing.asset_symbol || "USDT") || "USDT";
        const walletAssetSymbol = buildScopedWalletSymbol(scope, assetCode);
        const amountUsd = toMoney(toNumber(existing.amount_usd, 0));

        if (
          WITHDRAW_OPEN_STATUS_SET.has(previousStatus) &&
          (targetStatus === "rejected" || targetStatus === "cancelled")
        ) {
          const detail = ensureWalletDetailRow(userId, walletAssetSymbol, nowIso, walletAssetSymbol);
          const availableBefore = toMoney(toNumber(detail.available_usd, 0));
          const lockedBefore = toMoney(toNumber(detail.locked_usd, 0));
          if (lockedBefore < amountUsd) {
            throw new Error("Locked balance is not sufficient to unlock this withdrawal.");
          }

          const saved = saveWalletDetail({
            userId,
            assetSymbol: walletAssetSymbol,
            availableUsd: toMoney(availableBefore + amountUsd),
            lockedUsd: toMoney(lockedBefore - amountUsd),
            rewardEarnedUsd: toNumber(detail.reward_earned_usd, 0),
            updatedAt: nowIso,
          });

          syncWalletSummaryFromDetail({
            userId,
            assetSymbol: walletAssetSymbol,
            updatedAt: nowIso,
            assetNameFallback: walletAssetSymbol,
          });

          insertAssetWalletLedgerEntry({
            userId,
            ledgerRefType: targetStatus === "rejected" ? "withdraw_rejected" : "withdraw_cancelled",
            ledgerRefId: String(existing.withdrawal_ref || existing.id || ""),
            walletSymbol,
            assetSymbol: assetCode,
            movementType: "unlock",
            amountUsd,
            balanceBeforeUsd: lockedBefore,
            balanceAfterUsd: toNumber(saved.locked_usd, 0),
            note: note || `Withdrawal ${targetStatus} by admin.`,
            createdAt: nowIso,
            createdBy: actor,
          });
        }

        const updated = updateWithdrawalForAdmin({
          existing,
          status: targetStatus,
          note,
          actor,
          completedAt: existing.completed_at || null,
        });

        insertAssetAdminAuditLog({
          adminUserId: actor,
          actionType: "withdrawal_review",
          targetType: "withdrawal_request",
          targetId: String(updated.withdrawal_ref || updated.id || ""),
          note: note || `Status set to ${targetStatus}`,
          createdAt: nowIso,
        });

        return updated;
      });

      const updated = tx();
      res.json({
        message: "Withdrawal status updated.",
        withdrawal: mapAdminWithdrawalRow(updated),
        wallet: buildWalletAggregation(updated.user_id),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not review withdrawal request." });
    }
  }

  function handleAdminAssetsWithdrawComplete(req, res) {
    try {
      const actor = getAdminActor(req);
      const note = sanitizeShortText(parseRequestValue(req, "note", ""), 280);
      const existing = resolveAdminWithdrawalRow(req);

      if (!existing) {
        res.status(404).json({ error: "Withdrawal not found." });
        return;
      }

      const previousStatus = normalizeWithdrawalStatus(existing.status || "pending");
      if (previousStatus === "completed") {
        res.json({
          message: "Withdrawal already completed.",
          withdrawal: mapAdminWithdrawalRow(existing),
          wallet: buildWalletAggregation(existing.user_id),
        });
        return;
      }
      if (WITHDRAW_FINAL_STATUS_SET.has(previousStatus) && previousStatus !== "completed") {
        throw new Error(`Cannot complete a ${previousStatus} withdrawal.`);
      }

      const tx = db.transaction(() => {
        const nowIso = toIso(getNow());
        const userId = String(existing.user_id || "");
        const walletSymbol = normalizeWalletSymbol(existing.wallet_symbol || "SPOT_USDT", "SPOT_USDT");
        const scope = getWalletScope(walletSymbol);
        const assetCode = normalizeAssetCode(existing.asset_symbol || "USDT") || "USDT";
        const walletAssetSymbol = buildScopedWalletSymbol(scope, assetCode);
        const amountUsd = toMoney(toNumber(existing.amount_usd, 0));

        const detail = ensureWalletDetailRow(userId, walletAssetSymbol, nowIso, walletAssetSymbol);
        const availableBefore = toMoney(toNumber(detail.available_usd, 0));
        const lockedBefore = toMoney(toNumber(detail.locked_usd, 0));
        if (lockedBefore < amountUsd) {
          throw new Error("Locked balance is insufficient to complete withdrawal.");
        }

        const saved = saveWalletDetail({
          userId,
          assetSymbol: walletAssetSymbol,
          availableUsd: availableBefore,
          lockedUsd: toMoney(lockedBefore - amountUsd),
          rewardEarnedUsd: toNumber(detail.reward_earned_usd, 0),
          updatedAt: nowIso,
        });

        syncWalletSummaryFromDetail({
          userId,
          assetSymbol: walletAssetSymbol,
          updatedAt: nowIso,
          assetNameFallback: walletAssetSymbol,
        });

        const updated = updateWithdrawalForAdmin({
          existing,
          status: "completed",
          note,
          actor,
          completedAt: nowIso,
        });

        insertAssetWalletLedgerEntry({
          userId,
          ledgerRefType: "withdraw_approved",
          ledgerRefId: String(updated.withdrawal_ref || updated.id || ""),
          walletSymbol,
          assetSymbol: assetCode,
          movementType: "debit",
          amountUsd,
          balanceBeforeUsd: lockedBefore,
          balanceAfterUsd: toNumber(saved.locked_usd, 0),
          note: note || "Withdrawal completed by admin.",
          createdAt: nowIso,
          createdBy: actor,
        });

        insertAssetAdminAuditLog({
          adminUserId: actor,
          actionType: "withdrawal_completed",
          targetType: "withdrawal_request",
          targetId: String(updated.withdrawal_ref || updated.id || ""),
          note: note || "Marked as completed.",
          createdAt: nowIso,
        });

        return updated;
      });

      const updated = tx();
      res.json({
        message: "Withdrawal marked as completed.",
        withdrawal: mapAdminWithdrawalRow(updated),
        wallet: buildWalletAggregation(updated.user_id),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not complete withdrawal request." });
    }
  }

  function handleAdminAssetsTransfers(req, res) {
    try {
      const { page, limit, offset } = buildPagination(
        parseRequestValue(req, "page", 1),
        parseRequestValue(req, "limit", 50),
        50,
        200,
      );

      const statusRaw = normalizeLower(parseRequestValue(req, "status", "all"));
      const statusFilter = statusRaw === "all" ? "all" : normalizeTransferStatus(statusRaw);
      const routeFilterRaw = sanitizeShortText(parseRequestValue(req, "route", "all"), 80).toUpperCase();
      const routeFilter = routeFilterRaw && routeFilterRaw !== "ALL" ? routeFilterRaw : "all";
      const walletFilter = resolveCoreWalletFilter(parseRequestValue(req, "wallet", "all"));
      const userKeyword = sanitizeShortText(parseRequestValue(req, "userKeyword", ""), 120);

      const scopedParams = {
        statusFilter,
        routeFilter,
        walletFilter,
        userKeyword,
        likeUserKeyword: toLikeKeyword(userKeyword),
        limit,
        offset,
      };

      const rows = listTransfersForAdminStatement.all(scopedParams).map((row) => mapAdminTransferRow(row));
      const total = toNumber(countTransfersForAdminStatement.get(scopedParams)?.total, 0);

      res.json({
        filter: {
          status: statusFilter,
          route: routeFilter,
          wallet: walletFilter,
          userKeyword,
        },
        pagination: {
          page,
          limit,
          total,
          hasMore: offset + rows.length < total,
        },
        rows,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load transfer desk." });
    }
  }

  function handleAdminAssetsConversions(req, res) {
    try {
      const { page, limit, offset } = buildPagination(
        parseRequestValue(req, "page", 1),
        parseRequestValue(req, "limit", 50),
        50,
        200,
      );

      const statusRaw = normalizeLower(parseRequestValue(req, "status", "all"));
      const statusFilter = statusRaw === "all" ? "all" : normalizeConversionStatus(statusRaw);
      const walletFilter = resolveCoreWalletFilter(parseRequestValue(req, "wallet", "all"));
      const fromAssetRaw = parseRequestValue(req, "fromAsset", "all");
      const toAssetRaw = parseRequestValue(req, "toAsset", "all");
      const fromAssetFilter = normalizeLower(fromAssetRaw) === "all" ? "all" : normalizeAssetCode(fromAssetRaw || "");
      const toAssetFilter = normalizeLower(toAssetRaw) === "all" ? "all" : normalizeAssetCode(toAssetRaw || "");
      const userKeyword = sanitizeShortText(parseRequestValue(req, "userKeyword", ""), 120);

      const scopedParams = {
        statusFilter,
        walletFilter,
        fromAssetFilter,
        toAssetFilter,
        userKeyword,
        likeUserKeyword: toLikeKeyword(userKeyword),
        limit,
        offset,
      };

      const rows = listConversionsForAdminStatement.all(scopedParams).map((row) => mapAdminConversionRow(row));
      const total = toNumber(countConversionsForAdminStatement.get(scopedParams)?.total, 0);

      res.json({
        filter: {
          status: statusFilter,
          wallet: walletFilter,
          fromAsset: fromAssetFilter,
          toAsset: toAssetFilter,
          userKeyword,
        },
        pagination: {
          page,
          limit,
          total,
          hasMore: offset + rows.length < total,
        },
        rows,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load conversion desk." });
    }
  }

  function handleAdminAssetsSettingsGet(_req, res) {
    try {
      const settings = getAssetModuleSettings();
      res.json({
        settings,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load asset module settings." });
    }
  }

  function handleAdminAssetsSettingsSave(req, res) {
    try {
      const actor = getAdminActor(req);
      const current = getAssetModuleSettings();
      const body = req?.body || {};
      const supportedWithdrawAssets = parseArrayInput(
        Object.prototype.hasOwnProperty.call(body, "supportedWithdrawAssets")
          ? body.supportedWithdrawAssets
          : current.supportedWithdrawAssets,
      );
      const conversionPairs = parseArrayInput(
        Object.prototype.hasOwnProperty.call(body, "conversionPairs")
          ? body.conversionPairs
          : current.conversionPairs,
      );
      const withdrawNetworkMap = parseObjectInput(
        Object.prototype.hasOwnProperty.call(body, "withdrawNetworkMap")
          ? body.withdrawNetworkMap
          : current.withdrawNetworkMap,
        current.withdrawNetworkMap,
      );

      const merged = {
        ...current,
        ...body,
        supportedWithdrawAssets,
        conversionPairs,
        withdrawNetworkMap,
      };

      const payload = buildAssetModuleSettingsPayload(merged, actor);
      if (payload.maxWithdrawUsd !== null && payload.maxWithdrawUsd < payload.minWithdrawUsd) {
        payload.maxWithdrawUsd = payload.minWithdrawUsd;
      }

      upsertAssetModuleSettingsStatement.run(payload);
      const settings = getAssetModuleSettings();
      const nowIso = toIso(getNow());
      insertAssetAdminAuditLog({
        adminUserId: actor,
        actionType: "settings_change",
        targetType: "asset_module_settings",
        targetId: "1",
        note: sanitizeShortText(body.note || "Asset module settings updated.", 280),
        createdAt: nowIso,
      });

      res.json({
        message: "Asset module settings saved.",
        settings,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not save asset module settings." });
    }
  }

  function handleAdminAssetsAuditLogs(req, res) {
    try {
      const { page, limit, offset } = buildPagination(
        parseRequestValue(req, "page", 1),
        parseRequestValue(req, "limit", 50),
        50,
        300,
      );
      const actionRaw = sanitizeShortText(parseRequestValue(req, "actionType", "all"), 80);
      const actionFilter = normalizeLower(actionRaw) === "all" ? "all" : actionRaw;
      const keyword = sanitizeShortText(parseRequestValue(req, "keyword", ""), 120);

      const rows = listAssetAdminAuditLogsStatement
        .all({
          actionFilter,
          keyword,
          likeKeyword: toLikeKeyword(keyword),
          limit,
          offset,
        })
        .map((row) => mapAssetAuditRow(row));
      const total = toNumber(
        countAssetAdminAuditLogsStatement.get({
          actionFilter,
          keyword,
          likeKeyword: toLikeKeyword(keyword),
        })?.total,
        0,
      );

      res.json({
        filter: {
          actionType: actionFilter,
          keyword,
        },
        pagination: {
          page,
          limit,
          total,
          hasMore: offset + rows.length < total,
        },
        rows,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load asset audit logs." });
    }
  }

  function handleAssetsSummary(req, res) {
    try {
      const payload = buildWalletAggregation(req.currentUser.userId);
      res.json({
        wallets: payload.wallets,
        totalAssets: payload.totalAssets,
        distributionPercentages: payload.distributionPercentages,
        chartData: payload.chartData,
        walletDetails: payload.walletDetails,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load assets summary." });
    }
  }

  function handleAssetsWallets(req, res) {
    try {
      const payload = buildWalletAggregation(req.currentUser.userId);
      res.json({
        wallets: payload.wallets,
        totalAssets: payload.totalAssets,
        walletDetails: payload.walletDetails,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load wallets." });
    }
  }

  function handleAssetsHistory(req, res) {
    try {
      const typeFilter = normalizeHistoryType(parseRequestValue(req, "type", "all"));
      const walletFilter = normalizeWalletFilter(parseRequestValue(req, "wallet", "all"));
      const { page, limit, offset } = buildPagination(
        parseRequestValue(req, "page", 1),
        parseRequestValue(req, "limit", 20),
        20,
        200,
      );

      const allRows = buildHistoryRows(req.currentUser.userId, typeFilter, walletFilter);
      const rows = allRows.slice(offset, offset + limit);

      res.json({
        filter: {
          type: typeFilter,
          wallet: walletFilter,
        },
        pagination: {
          page,
          limit,
          total: allRows.length,
          hasMore: offset + rows.length < allRows.length,
        },
        rows,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load assets history." });
    }
  }

  function handleAssetsTransfer(req, res) {
    try {
      const result = createTransfer({
        userId: req.currentUser.userId,
        fromWalletSymbol: parseRequestValue(req, "fromWalletSymbol", ""),
        toWalletSymbol: parseRequestValue(req, "toWalletSymbol", ""),
        amountUsd: parseRequestValue(req, "amountUsd", 0),
        note: parseRequestValue(req, "note", ""),
      });

      res.json({
        message: "Transfer completed successfully.",
        transfer: result.transfer,
        wallet: {
          wallets: result.wallet.wallets,
          totalAssets: result.wallet.totalAssets,
          distributionPercentages: result.wallet.distributionPercentages,
          chartData: result.wallet.chartData,
          walletDetails: result.wallet.walletDetails,
        },
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not complete transfer." });
    }
  }

  function handleAssetsConvert(req, res) {
    try {
      const walletSymbol = parseRequestValue(req, "walletSymbol", "SPOT_USDT");
      const fromAssetSymbol = parseRequestValue(req, "fromAssetSymbol", "");
      const toAssetSymbol = parseRequestValue(req, "toAssetSymbol", "");
      const amount = parseRequestValue(req, "amount", 0);
      const previewOnly = normalizeBoolean(parseRequestValue(req, "previewOnly", false), false);

      if (previewOnly) {
        const quote = resolveConvertQuote({
          fromAssetSymbol,
          toAssetSymbol,
          amount,
        });
        res.json({
          quote: {
            walletSymbol: normalizeWalletSymbol(walletSymbol || "SPOT_USDT", "SPOT_USDT"),
            fromAsset: quote.fromAsset,
            toAsset: quote.toAsset,
            sourceAmount: quote.sourceAmount,
            convertedAmount: quote.convertedAmount,
            feeAmount: quote.feeAmount,
            rateSnapshot: quote.rateSnapshot,
            usdEquivalent: quote.usdEquivalent,
            feePercent: quote.feePercent,
          },
        });
        return;
      }

      const result = createConversion({
        userId: req.currentUser.userId,
        walletSymbol,
        fromAssetSymbol,
        toAssetSymbol,
        amount,
        note: parseRequestValue(req, "note", ""),
      });

      res.json({
        message: "Conversion completed successfully.",
        conversion: result.conversion,
        quote: {
          fromAsset: result.quote.fromAsset,
          toAsset: result.quote.toAsset,
          sourceAmount: result.quote.sourceAmount,
          convertedAmount: result.quote.convertedAmount,
          feeAmount: result.quote.feeAmount,
          rateSnapshot: result.quote.rateSnapshot,
          usdEquivalent: result.quote.usdEquivalent,
          feePercent: result.quote.feePercent,
        },
        wallet: {
          wallets: result.wallet.wallets,
          totalAssets: result.wallet.totalAssets,
          distributionPercentages: result.wallet.distributionPercentages,
          chartData: result.wallet.chartData,
          walletDetails: result.wallet.walletDetails,
        },
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not complete conversion." });
    }
  }

  function handleAssetsWithdrawConfig(req, res) {
    try {
      const payload = buildWithdrawConfigPayload(req.currentUser.userId);
      res.json(payload);
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load withdraw config." });
    }
  }

  function handleAssetsWithdraw(req, res) {
    try {
      const result = createWithdrawal({
        userId: req.currentUser.userId,
        walletSymbol: parseRequestValue(req, "walletSymbol", "SPOT_USDT"),
        assetSymbol: parseRequestValue(req, "assetSymbol", "USDT"),
        networkType: parseRequestValue(req, "networkType", ""),
        amountUsd: parseRequestValue(req, "amountUsd", 0),
        destinationAddress: parseRequestValue(req, "destinationAddress", ""),
        destinationLabel: parseRequestValue(req, "destinationLabel", ""),
        note: parseRequestValue(req, "note", ""),
      });

      res.json({
        message: "Withdrawal request submitted and pending review.",
        withdrawal: result.withdrawal,
        wallet: {
          wallets: result.wallet.wallets,
          totalAssets: result.wallet.totalAssets,
          distributionPercentages: result.wallet.distributionPercentages,
          chartData: result.wallet.chartData,
          walletDetails: result.wallet.walletDetails,
        },
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not submit withdrawal request." });
    }
  }

  function handleAssetsWithdrawals(req, res) {
    try {
      const { page, limit, offset } = buildPagination(
        parseRequestValue(req, "page", 1),
        parseRequestValue(req, "limit", 30),
        30,
        200,
      );

      const rows = listWithdrawalsByUserStatement
        .all({ userId: req.currentUser.userId, limit, offset })
        .map((row) => mapWithdrawalRow(row));

      const total = toNumber(countWithdrawalsByUserStatement.get(req.currentUser.userId)?.total, 0);

      res.json({
        pagination: {
          page,
          limit,
          total,
          hasMore: offset + rows.length < total,
        },
        rows,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load withdrawals." });
    }
  }

  function handleAssetsTransfers(req, res) {
    try {
      const { page, limit, offset } = buildPagination(
        parseRequestValue(req, "page", 1),
        parseRequestValue(req, "limit", 30),
        30,
        200,
      );

      const rows = listTransfersByUserStatement
        .all({ userId: req.currentUser.userId, limit, offset })
        .map((row) => mapTransferRow(row));

      const total = toNumber(countTransfersByUserStatement.get(req.currentUser.userId)?.total, 0);

      res.json({
        pagination: {
          page,
          limit,
          total,
          hasMore: offset + rows.length < total,
        },
        rows,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load transfers." });
    }
  }

  function handleAssetsConversions(req, res) {
    try {
      const { page, limit, offset } = buildPagination(
        parseRequestValue(req, "page", 1),
        parseRequestValue(req, "limit", 30),
        30,
        200,
      );

      const rows = listConversionsByUserStatement
        .all({ userId: req.currentUser.userId, limit, offset })
        .map((row) => mapConversionRow(row));

      const total = toNumber(countConversionsByUserStatement.get(req.currentUser.userId)?.total, 0);

      res.json({
        pagination: {
          page,
          limit,
          total,
          hasMore: offset + rows.length < total,
        },
        rows,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load conversions." });
    }
  }

  return {
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
  };
}
