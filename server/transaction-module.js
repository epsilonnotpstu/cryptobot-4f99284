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
  return String(value ?? "").trim();
}

function normalizeLower(value = "") {
  return normalizeText(value).toLowerCase();
}

function normalizeUpper(value = "") {
  return normalizeText(value).toUpperCase();
}

function normalizeBooleanNumber(value, fallback = 0) {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  const normalized = normalizeLower(value);
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return 1;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return 0;
  }
  return fallback ? 1 : 0;
}

function roundToPrecision(value, precision = 8) {
  const numeric = toNumber(value, 0);
  const safePrecision = Math.max(0, Math.min(12, Number.isFinite(Number(precision)) ? Number(precision) : 8));
  return Number(numeric.toFixed(safePrecision));
}

function normalizeRateSourceType(value = "internal_feed") {
  const normalized = normalizeLower(value);
  if (["internal_feed", "external_api", "manual_admin_feed"].includes(normalized)) {
    return normalized;
  }
  return "internal_feed";
}

function normalizeOrderSide(value = "") {
  const normalized = normalizeLower(value);
  if (normalized === "buy" || normalized === "sell") {
    return normalized;
  }
  throw new Error("Order side must be buy or sell.");
}

function normalizeOrderType(value = "") {
  const normalized = normalizeLower(value);
  if (normalized === "market" || normalized === "limit") {
    return normalized;
  }
  throw new Error("Order type must be market or limit.");
}

function normalizeOrderStatus(value = "") {
  const normalized = normalizeLower(value);
  if (["open", "partially_filled", "filled", "cancelled", "rejected", "error"].includes(normalized)) {
    return normalized;
  }
  return "open";
}

function normalizeConvertStatus(value = "") {
  const normalized = normalizeLower(value);
  if (["pending", "completed", "failed", "cancelled"].includes(normalized)) {
    return normalized;
  }
  return "pending";
}

function buildConvertRef() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CVT-${stamp}-${rand}`;
}

function buildSpotOrderRef() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SPD-${stamp}-${rand}`;
}

function buildSpotTradeRef() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TRD-${stamp}-${rand}`;
}

function pickSeedPrice(pairCode = "") {
  const code = normalizeUpper(pairCode);
  if (code.startsWith("BTC")) return 68000;
  if (code.startsWith("ETH")) return 3500;
  if (code.startsWith("BNB")) return 650;
  if (code.startsWith("SOL")) return 180;
  if (code.startsWith("ADA")) return 0.72;
  if (code.startsWith("XRP")) return 0.75;
  if (code.startsWith("DOGE")) return 0.2;
  if (code.startsWith("USDT")) return 1;
  return 100;
}

function parseIsoMs(value = "") {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function moneyDisplay(value = 0) {
  return Number(toMoney(value).toFixed(2));
}

function normalizeAssetCode(value = "") {
  return normalizeUpper(value).replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

function normalizeWalletSymbol(value = "", fallback = "SPOT_USDT") {
  const raw = normalizeUpper(value).replace(/[^A-Z0-9_]/g, "");
  const normalized = raw || normalizeUpper(fallback).replace(/[^A-Z0-9_]/g, "") || "SPOT_USDT";
  const aliases = {
    SPOTUSDT: "SPOT_USDT",
    MAINUSDT: "MAIN_USDT",
    BINARYUSDT: "BINARY_USDT",
  };
  if (aliases[normalized]) {
    return aliases[normalized];
  }
  const scopedMatch = normalized.match(/^(SPOT|MAIN|BINARY)_?([A-Z0-9]+)$/);
  if (scopedMatch) {
    return `${scopedMatch[1]}_${scopedMatch[2]}`;
  }
  if (/^[A-Z0-9]+$/.test(normalized)) {
    const asset = normalized === "USD" ? "USDT" : normalized;
    return `SPOT_${asset}`;
  }
  return "SPOT_USDT";
}

function makeSpotWalletSymbol(assetCode = "") {
  const normalizedAsset = normalizeAssetCode(assetCode);
  if (!normalizedAsset) {
    return "SPOT_USDT";
  }
  return normalizeWalletSymbol(`SPOT_${normalizedAsset}`, `SPOT_${normalizedAsset}`);
}

function makeAssetDisplayName(assetCode = "") {
  const normalized = normalizeAssetCode(assetCode);
  if (!normalized) {
    return "Spot Wallet";
  }
  return `Spot Wallet (${normalized})`;
}

function buildPagination(rawPage, rawLimit, defaultLimit = 30, maxLimit = 200) {
  const page = Math.max(1, Math.floor(toNumber(rawPage, 1)));
  const limit = Math.max(1, Math.min(maxLimit, Math.floor(toNumber(rawLimit, defaultLimit))));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function createTransactionModule({
  db,
  getNow,
  toIso,
  normalizeAssetSymbol,
  normalizeUsdAmount,
  sanitizeShortText,
}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS convert_pairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pair_code TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      from_asset TEXT NOT NULL,
      to_asset TEXT NOT NULL,
      rate_source_type TEXT NOT NULL DEFAULT 'internal_feed',
      source_symbol TEXT,
      min_amount_usd REAL NOT NULL DEFAULT 1,
      max_amount_usd REAL NOT NULL DEFAULT 100000,
      fee_percent REAL NOT NULL DEFAULT 0,
      spread_percent REAL NOT NULL DEFAULT 0,
      fixed_fee_usd REAL NOT NULL DEFAULT 0,
      manual_rate REAL,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      display_sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS convert_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      convert_ref TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      convert_pair_id INTEGER NOT NULL,
      pair_code_snapshot TEXT NOT NULL,
      display_name_snapshot TEXT NOT NULL,
      from_asset_snapshot TEXT NOT NULL,
      to_asset_snapshot TEXT NOT NULL,
      from_amount REAL NOT NULL,
      raw_rate REAL NOT NULL,
      applied_rate REAL NOT NULL,
      fee_amount REAL NOT NULL,
      receive_amount REAL NOT NULL,
      status TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS convert_wallet_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      convert_id INTEGER NOT NULL,
      ledger_type TEXT NOT NULL,
      asset_symbol TEXT NOT NULL,
      amount REAL NOT NULL,
      balance_before REAL,
      balance_after REAL,
      note TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT
    );

    CREATE TABLE IF NOT EXISTS convert_admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_user_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spot_pairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pair_code TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      base_asset TEXT NOT NULL,
      quote_asset TEXT NOT NULL,
      price_source_type TEXT NOT NULL DEFAULT 'internal_feed',
      source_symbol TEXT,
      current_price REAL NOT NULL DEFAULT 0,
      previous_price REAL NOT NULL DEFAULT 0,
      price_precision INTEGER NOT NULL DEFAULT 4,
      quantity_precision INTEGER NOT NULL DEFAULT 6,
      min_order_size REAL NOT NULL DEFAULT 0.0001,
      max_order_size REAL NOT NULL DEFAULT 100000,
      maker_fee_percent REAL NOT NULL DEFAULT 0.1,
      taker_fee_percent REAL NOT NULL DEFAULT 0.15,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      is_featured INTEGER NOT NULL DEFAULT 0,
      display_sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS spot_price_ticks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pair_id INTEGER NOT NULL,
      price REAL NOT NULL,
      tick_time TEXT NOT NULL,
      source_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spot_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_ref TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      pair_id INTEGER NOT NULL,
      pair_code_snapshot TEXT NOT NULL,
      pair_display_name_snapshot TEXT NOT NULL,
      base_asset_snapshot TEXT NOT NULL,
      quote_asset_snapshot TEXT NOT NULL,
      side TEXT NOT NULL,
      order_type TEXT NOT NULL,
      price REAL,
      quantity REAL NOT NULL,
      filled_quantity REAL NOT NULL DEFAULT 0,
      avg_fill_price REAL,
      quote_amount REAL,
      fee_amount REAL NOT NULL DEFAULT 0,
      fee_asset TEXT,
      status TEXT NOT NULL,
      locked_asset_symbol TEXT NOT NULL,
      locked_amount REAL NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      filled_at TEXT,
      cancelled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS spot_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_ref TEXT NOT NULL UNIQUE,
      order_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      pair_id INTEGER NOT NULL,
      pair_code_snapshot TEXT NOT NULL,
      side TEXT NOT NULL,
      execution_price REAL NOT NULL,
      execution_quantity REAL NOT NULL,
      quote_total REAL NOT NULL,
      fee_amount REAL NOT NULL,
      fee_asset TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spot_wallet_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      order_id INTEGER,
      trade_id INTEGER,
      ledger_type TEXT NOT NULL,
      asset_symbol TEXT NOT NULL,
      amount REAL NOT NULL,
      balance_before REAL,
      balance_after REAL,
      note TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT
    );

    CREATE TABLE IF NOT EXISTS spot_admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_user_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transaction_engine_settings (
      id INTEGER PRIMARY KEY,
      transaction_module_enabled INTEGER NOT NULL DEFAULT 1,
      convert_enabled INTEGER NOT NULL DEFAULT 1,
      spot_enabled INTEGER NOT NULL DEFAULT 1,
      maintenance_mode_enabled INTEGER NOT NULL DEFAULT 0,
      maintenance_message TEXT,
      emergency_freeze_enabled INTEGER NOT NULL DEFAULT 0,
      default_convert_fee_percent REAL NOT NULL DEFAULT 0.1,
      default_convert_spread_percent REAL NOT NULL DEFAULT 0.1,
      default_fixed_convert_fee_usd REAL NOT NULL DEFAULT 0,
      default_maker_fee_percent REAL NOT NULL DEFAULT 0.1,
      default_taker_fee_percent REAL NOT NULL DEFAULT 0.15,
      default_min_order_size REAL NOT NULL DEFAULT 0.0001,
      default_max_order_size REAL NOT NULL DEFAULT 100000,
      manual_rate_mode_enabled INTEGER NOT NULL DEFAULT 1,
      manual_price_mode_enabled INTEGER NOT NULL DEFAULT 1,
      require_active_account_only INTEGER NOT NULL DEFAULT 1,
      block_suspended_users INTEGER NOT NULL DEFAULT 1,
      block_banned_users INTEGER NOT NULL DEFAULT 1,
      kyc_required_above_amount_usd REAL,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_convert_orders_user_created ON convert_orders(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_convert_orders_pair_created ON convert_orders(convert_pair_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_spot_orders_user_status ON spot_orders(user_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_spot_orders_pair_status ON spot_orders(pair_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_spot_trades_pair_created ON spot_trades(pair_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_spot_ticks_pair_time ON spot_price_ticks(pair_id, tick_time DESC);
  `);

  const findEngineSettingsStatement = db.prepare(`SELECT * FROM transaction_engine_settings WHERE id = 1 LIMIT 1`);
  const upsertEngineSettingsStatement = db.prepare(`
    INSERT INTO transaction_engine_settings (
      id,
      transaction_module_enabled,
      convert_enabled,
      spot_enabled,
      maintenance_mode_enabled,
      maintenance_message,
      emergency_freeze_enabled,
      default_convert_fee_percent,
      default_convert_spread_percent,
      default_fixed_convert_fee_usd,
      default_maker_fee_percent,
      default_taker_fee_percent,
      default_min_order_size,
      default_max_order_size,
      manual_rate_mode_enabled,
      manual_price_mode_enabled,
      require_active_account_only,
      block_suspended_users,
      block_banned_users,
      kyc_required_above_amount_usd,
      updated_at,
      updated_by
    ) VALUES (
      1,
      @transactionModuleEnabled,
      @convertEnabled,
      @spotEnabled,
      @maintenanceModeEnabled,
      @maintenanceMessage,
      @emergencyFreezeEnabled,
      @defaultConvertFeePercent,
      @defaultConvertSpreadPercent,
      @defaultFixedConvertFeeUsd,
      @defaultMakerFeePercent,
      @defaultTakerFeePercent,
      @defaultMinOrderSize,
      @defaultMaxOrderSize,
      @manualRateModeEnabled,
      @manualPriceModeEnabled,
      @requireActiveAccountOnly,
      @blockSuspendedUsers,
      @blockBannedUsers,
      @kycRequiredAboveAmountUsd,
      @updatedAt,
      @updatedBy
    )
    ON CONFLICT(id)
    DO UPDATE SET
      transaction_module_enabled = excluded.transaction_module_enabled,
      convert_enabled = excluded.convert_enabled,
      spot_enabled = excluded.spot_enabled,
      maintenance_mode_enabled = excluded.maintenance_mode_enabled,
      maintenance_message = excluded.maintenance_message,
      emergency_freeze_enabled = excluded.emergency_freeze_enabled,
      default_convert_fee_percent = excluded.default_convert_fee_percent,
      default_convert_spread_percent = excluded.default_convert_spread_percent,
      default_fixed_convert_fee_usd = excluded.default_fixed_convert_fee_usd,
      default_maker_fee_percent = excluded.default_maker_fee_percent,
      default_taker_fee_percent = excluded.default_taker_fee_percent,
      default_min_order_size = excluded.default_min_order_size,
      default_max_order_size = excluded.default_max_order_size,
      manual_rate_mode_enabled = excluded.manual_rate_mode_enabled,
      manual_price_mode_enabled = excluded.manual_price_mode_enabled,
      require_active_account_only = excluded.require_active_account_only,
      block_suspended_users = excluded.block_suspended_users,
      block_banned_users = excluded.block_banned_users,
      kyc_required_above_amount_usd = excluded.kyc_required_above_amount_usd,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `);

  const listEnabledConvertPairsStatement = db.prepare(`
    SELECT * FROM convert_pairs
    WHERE is_enabled = 1
    ORDER BY display_sort_order ASC, id ASC
  `);
  const listAllConvertPairsStatement = db.prepare(`
    SELECT * FROM convert_pairs
    ORDER BY display_sort_order ASC, id ASC
  `);
  const findConvertPairByIdStatement = db.prepare(`SELECT * FROM convert_pairs WHERE id = ? LIMIT 1`);
  const findConvertPairByCodeStatement = db.prepare(`SELECT * FROM convert_pairs WHERE pair_code = ? LIMIT 1`);
  const insertConvertPairStatement = db.prepare(`
    INSERT INTO convert_pairs (
      pair_code,
      display_name,
      from_asset,
      to_asset,
      rate_source_type,
      source_symbol,
      min_amount_usd,
      max_amount_usd,
      fee_percent,
      spread_percent,
      fixed_fee_usd,
      manual_rate,
      is_enabled,
      display_sort_order,
      created_at,
      updated_at,
      created_by,
      updated_by
    ) VALUES (
      @pairCode,
      @displayName,
      @fromAsset,
      @toAsset,
      @rateSourceType,
      @sourceSymbol,
      @minAmountUsd,
      @maxAmountUsd,
      @feePercent,
      @spreadPercent,
      @fixedFeeUsd,
      @manualRate,
      @isEnabled,
      @displaySortOrder,
      @createdAt,
      @updatedAt,
      @createdBy,
      @updatedBy
    )
  `);
  const updateConvertPairStatement = db.prepare(`
    UPDATE convert_pairs
    SET pair_code = @pairCode,
        display_name = @displayName,
        from_asset = @fromAsset,
        to_asset = @toAsset,
        rate_source_type = @rateSourceType,
        source_symbol = @sourceSymbol,
        min_amount_usd = @minAmountUsd,
        max_amount_usd = @maxAmountUsd,
        fee_percent = @feePercent,
        spread_percent = @spreadPercent,
        fixed_fee_usd = @fixedFeeUsd,
        manual_rate = @manualRate,
        is_enabled = @isEnabled,
        display_sort_order = @displaySortOrder,
        updated_at = @updatedAt,
        updated_by = @updatedBy
    WHERE id = @id
  `);
  const updateConvertPairStatusStatement = db.prepare(`
    UPDATE convert_pairs
    SET is_enabled = @isEnabled,
        updated_at = @updatedAt,
        updated_by = @updatedBy
    WHERE id = @id
  `);
  const updateConvertPairManualRateStatement = db.prepare(`
    UPDATE convert_pairs
    SET manual_rate = @manualRate,
        updated_at = @updatedAt,
        updated_by = @updatedBy
    WHERE id = @id
  `);
  const deleteConvertPairStatement = db.prepare(`DELETE FROM convert_pairs WHERE id = ?`);

  const insertConvertOrderStatement = db.prepare(`
    INSERT INTO convert_orders (
      convert_ref,
      user_id,
      convert_pair_id,
      pair_code_snapshot,
      display_name_snapshot,
      from_asset_snapshot,
      to_asset_snapshot,
      from_amount,
      raw_rate,
      applied_rate,
      fee_amount,
      receive_amount,
      status,
      note,
      created_at,
      completed_at,
      updated_at
    ) VALUES (
      @convertRef,
      @userId,
      @convertPairId,
      @pairCodeSnapshot,
      @displayNameSnapshot,
      @fromAssetSnapshot,
      @toAssetSnapshot,
      @fromAmount,
      @rawRate,
      @appliedRate,
      @feeAmount,
      @receiveAmount,
      @status,
      @note,
      @createdAt,
      @completedAt,
      @updatedAt
    )
  `);
  const findConvertOrderByIdStatement = db.prepare(`SELECT * FROM convert_orders WHERE id = ? LIMIT 1`);
  const listConvertOrdersByUserStatement = db.prepare(`
    SELECT * FROM convert_orders
    WHERE user_id = @userId
      AND (@statusFilter = 'all' OR status = @statusFilter)
      AND (@pairCode = '' OR pair_code_snapshot = @pairCode)
    ORDER BY created_at DESC, id DESC
    LIMIT @limit OFFSET @offset
  `);
  const countConvertOrdersByUserStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM convert_orders
    WHERE user_id = @userId
      AND (@statusFilter = 'all' OR status = @statusFilter)
      AND (@pairCode = '' OR pair_code_snapshot = @pairCode)
  `);
  const listConvertOrdersForAdminStatement = db.prepare(`
    SELECT o.*, u.name AS account_name, u.email AS account_email
    FROM convert_orders o
    LEFT JOIN users u ON u.user_id = o.user_id
    WHERE (@statusFilter = 'all' OR o.status = @statusFilter)
      AND (@pairCode = '' OR o.pair_code_snapshot = @pairCode)
      AND (@userKeyword = '' OR o.user_id LIKE @likeUserKeyword OR u.email LIKE @likeUserKeyword OR u.name LIKE @likeUserKeyword)
      AND (@fromDate = '' OR o.created_at >= @fromDate)
      AND (@toDate = '' OR o.created_at <= @toDate)
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT @limit OFFSET @offset
  `);
  const countConvertOrdersForAdminStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM convert_orders o
    LEFT JOIN users u ON u.user_id = o.user_id
    WHERE (@statusFilter = 'all' OR o.status = @statusFilter)
      AND (@pairCode = '' OR o.pair_code_snapshot = @pairCode)
      AND (@userKeyword = '' OR o.user_id LIKE @likeUserKeyword OR u.email LIKE @likeUserKeyword OR u.name LIKE @likeUserKeyword)
      AND (@fromDate = '' OR o.created_at >= @fromDate)
      AND (@toDate = '' OR o.created_at <= @toDate)
  `);
  const countConvertOrdersByPairStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM convert_orders
    WHERE convert_pair_id = ?
  `);

  const insertConvertWalletLedgerStatement = db.prepare(`
    INSERT INTO convert_wallet_ledger (
      user_id,
      convert_id,
      ledger_type,
      asset_symbol,
      amount,
      balance_before,
      balance_after,
      note,
      created_at,
      created_by
    ) VALUES (
      @userId,
      @convertId,
      @ledgerType,
      @assetSymbol,
      @amount,
      @balanceBefore,
      @balanceAfter,
      @note,
      @createdAt,
      @createdBy
    )
  `);
  const insertConvertAuditStatement = db.prepare(`
    INSERT INTO convert_admin_audit_logs (
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

  const listEnabledSpotPairsStatement = db.prepare(`
    SELECT * FROM spot_pairs
    WHERE is_enabled = 1
    ORDER BY is_featured DESC, display_sort_order ASC, id ASC
  `);
  const listAllSpotPairsStatement = db.prepare(`
    SELECT * FROM spot_pairs
    ORDER BY is_featured DESC, display_sort_order ASC, id ASC
  `);
  const findSpotPairByIdStatement = db.prepare(`SELECT * FROM spot_pairs WHERE id = ? LIMIT 1`);
  const findSpotPairByCodeStatement = db.prepare(`SELECT * FROM spot_pairs WHERE pair_code = ? LIMIT 1`);
  const findSpotPairByBaseQuoteStatement = db.prepare(`
    SELECT * FROM spot_pairs
    WHERE base_asset = @baseAsset AND quote_asset = @quoteAsset
    LIMIT 1
  `);
  const insertSpotPairStatement = db.prepare(`
    INSERT INTO spot_pairs (
      pair_code,
      display_name,
      base_asset,
      quote_asset,
      price_source_type,
      source_symbol,
      current_price,
      previous_price,
      price_precision,
      quantity_precision,
      min_order_size,
      max_order_size,
      maker_fee_percent,
      taker_fee_percent,
      is_enabled,
      is_featured,
      display_sort_order,
      created_at,
      updated_at,
      created_by,
      updated_by
    ) VALUES (
      @pairCode,
      @displayName,
      @baseAsset,
      @quoteAsset,
      @priceSourceType,
      @sourceSymbol,
      @currentPrice,
      @previousPrice,
      @pricePrecision,
      @quantityPrecision,
      @minOrderSize,
      @maxOrderSize,
      @makerFeePercent,
      @takerFeePercent,
      @isEnabled,
      @isFeatured,
      @displaySortOrder,
      @createdAt,
      @updatedAt,
      @createdBy,
      @updatedBy
    )
  `);
  const updateSpotPairStatement = db.prepare(`
    UPDATE spot_pairs
    SET pair_code = @pairCode,
        display_name = @displayName,
        base_asset = @baseAsset,
        quote_asset = @quoteAsset,
        price_source_type = @priceSourceType,
        source_symbol = @sourceSymbol,
        price_precision = @pricePrecision,
        quantity_precision = @quantityPrecision,
        min_order_size = @minOrderSize,
        max_order_size = @maxOrderSize,
        maker_fee_percent = @makerFeePercent,
        taker_fee_percent = @takerFeePercent,
        is_enabled = @isEnabled,
        is_featured = @isFeatured,
        display_sort_order = @displaySortOrder,
        updated_at = @updatedAt,
        updated_by = @updatedBy
    WHERE id = @id
  `);
  const updateSpotPairStatusStatement = db.prepare(`
    UPDATE spot_pairs
    SET is_enabled = @isEnabled,
        updated_at = @updatedAt,
        updated_by = @updatedBy
    WHERE id = @id
  `);
  const deleteSpotPairStatement = db.prepare(`DELETE FROM spot_pairs WHERE id = ?`);
  const updateSpotPairPriceStatement = db.prepare(`
    UPDATE spot_pairs
    SET previous_price = @previousPrice,
        current_price = @currentPrice,
        updated_at = @updatedAt,
        updated_by = @updatedBy
    WHERE id = @id
  `);

  const insertSpotTickStatement = db.prepare(`
    INSERT INTO spot_price_ticks (pair_id, price, tick_time, source_type, created_at)
    VALUES (@pairId, @price, @tickTime, @sourceType, @createdAt)
  `);
  const listSpotTicksByPairStatement = db.prepare(`
    SELECT * FROM spot_price_ticks
    WHERE pair_id = @pairId
    ORDER BY tick_time DESC, id DESC
    LIMIT @limit
  `);
  const findLatestSpotTickByPairStatement = db.prepare(`
    SELECT * FROM spot_price_ticks
    WHERE pair_id = @pairId
    ORDER BY tick_time DESC, id DESC
    LIMIT 1
  `);
  const trimOldSpotTicksByPairStatement = db.prepare(`
    DELETE FROM spot_price_ticks
    WHERE pair_id = @pairId
      AND id NOT IN (
        SELECT id FROM spot_price_ticks
        WHERE pair_id = @pairId
        ORDER BY tick_time DESC, id DESC
        LIMIT @limit
      )
  `);

  const insertSpotOrderStatement = db.prepare(`
    INSERT INTO spot_orders (
      order_ref,
      user_id,
      pair_id,
      pair_code_snapshot,
      pair_display_name_snapshot,
      base_asset_snapshot,
      quote_asset_snapshot,
      side,
      order_type,
      price,
      quantity,
      filled_quantity,
      avg_fill_price,
      quote_amount,
      fee_amount,
      fee_asset,
      status,
      locked_asset_symbol,
      locked_amount,
      note,
      created_at,
      updated_at,
      filled_at,
      cancelled_at
    ) VALUES (
      @orderRef,
      @userId,
      @pairId,
      @pairCodeSnapshot,
      @pairDisplayNameSnapshot,
      @baseAssetSnapshot,
      @quoteAssetSnapshot,
      @side,
      @orderType,
      @price,
      @quantity,
      @filledQuantity,
      @avgFillPrice,
      @quoteAmount,
      @feeAmount,
      @feeAsset,
      @status,
      @lockedAssetSymbol,
      @lockedAmount,
      @note,
      @createdAt,
      @updatedAt,
      @filledAt,
      @cancelledAt
    )
  `);
  const findSpotOrderByIdStatement = db.prepare(`SELECT * FROM spot_orders WHERE id = ? LIMIT 1`);
  const updateSpotOrderFillStatement = db.prepare(`
    UPDATE spot_orders
    SET filled_quantity = @filledQuantity,
        avg_fill_price = @avgFillPrice,
        quote_amount = @quoteAmount,
        fee_amount = @feeAmount,
        fee_asset = @feeAsset,
        status = @status,
        locked_amount = @lockedAmount,
        note = @note,
        updated_at = @updatedAt,
        filled_at = @filledAt
    WHERE id = @id
  `);
  const updateSpotOrderCancelStatement = db.prepare(`
    UPDATE spot_orders
    SET status = @status,
        note = @note,
        updated_at = @updatedAt,
        cancelled_at = @cancelledAt,
        locked_amount = @lockedAmount
    WHERE id = @id
  `);
  const listOpenSpotOrdersByUserStatement = db.prepare(`
    SELECT * FROM spot_orders
    WHERE user_id = @userId
      AND status IN ('open', 'partially_filled')
      AND (@pairId = 0 OR pair_id = @pairId)
    ORDER BY created_at DESC, id DESC
    LIMIT @limit OFFSET @offset
  `);
  const countOpenSpotOrdersByUserStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM spot_orders
    WHERE user_id = @userId
      AND status IN ('open', 'partially_filled')
      AND (@pairId = 0 OR pair_id = @pairId)
  `);
  const listSpotOrderHistoryByUserStatement = db.prepare(`
    SELECT * FROM spot_orders
    WHERE user_id = @userId
      AND (@statusFilter = 'all' OR status = @statusFilter)
      AND (@pairId = 0 OR pair_id = @pairId)
    ORDER BY created_at DESC, id DESC
    LIMIT @limit OFFSET @offset
  `);
  const countSpotOrderHistoryByUserStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM spot_orders
    WHERE user_id = @userId
      AND (@statusFilter = 'all' OR status = @statusFilter)
      AND (@pairId = 0 OR pair_id = @pairId)
  `);
  const listSpotOrdersForAdminStatement = db.prepare(`
    SELECT o.*, u.name AS account_name, u.email AS account_email
    FROM spot_orders o
    LEFT JOIN users u ON u.user_id = o.user_id
    WHERE (@statusFilter = 'all' OR o.status = @statusFilter)
      AND (@pairId = 0 OR o.pair_id = @pairId)
      AND (@orderType = 'all' OR o.order_type = @orderType)
      AND (@side = 'all' OR o.side = @side)
      AND (@userKeyword = '' OR o.user_id LIKE @likeUserKeyword OR u.email LIKE @likeUserKeyword OR u.name LIKE @likeUserKeyword)
      AND (@fromDate = '' OR o.created_at >= @fromDate)
      AND (@toDate = '' OR o.created_at <= @toDate)
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT @limit OFFSET @offset
  `);
  const countSpotOrdersForAdminStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM spot_orders o
    LEFT JOIN users u ON u.user_id = o.user_id
    WHERE (@statusFilter = 'all' OR o.status = @statusFilter)
      AND (@pairId = 0 OR o.pair_id = @pairId)
      AND (@orderType = 'all' OR o.order_type = @orderType)
      AND (@side = 'all' OR o.side = @side)
      AND (@userKeyword = '' OR o.user_id LIKE @likeUserKeyword OR u.email LIKE @likeUserKeyword OR u.name LIKE @likeUserKeyword)
      AND (@fromDate = '' OR o.created_at >= @fromDate)
      AND (@toDate = '' OR o.created_at <= @toDate)
  `);
  const countSpotOrdersByPairStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM spot_orders
    WHERE pair_id = ?
  `);

  const insertSpotTradeStatement = db.prepare(`
    INSERT INTO spot_trades (
      trade_ref,
      order_id,
      user_id,
      pair_id,
      pair_code_snapshot,
      side,
      execution_price,
      execution_quantity,
      quote_total,
      fee_amount,
      fee_asset,
      created_at
    ) VALUES (
      @tradeRef,
      @orderId,
      @userId,
      @pairId,
      @pairCodeSnapshot,
      @side,
      @executionPrice,
      @executionQuantity,
      @quoteTotal,
      @feeAmount,
      @feeAsset,
      @createdAt
    )
  `);
  const findSpotTradeByIdStatement = db.prepare(`SELECT * FROM spot_trades WHERE id = ? LIMIT 1`);
  const listRecentSpotTradesByPairStatement = db.prepare(`
    SELECT * FROM spot_trades
    WHERE pair_id = @pairId
    ORDER BY created_at DESC, id DESC
    LIMIT @limit
  `);

  const insertSpotWalletLedgerStatement = db.prepare(`
    INSERT INTO spot_wallet_ledger (
      user_id,
      order_id,
      trade_id,
      ledger_type,
      asset_symbol,
      amount,
      balance_before,
      balance_after,
      note,
      created_at,
      created_by
    ) VALUES (
      @userId,
      @orderId,
      @tradeId,
      @ledgerType,
      @assetSymbol,
      @amount,
      @balanceBefore,
      @balanceAfter,
      @note,
      @createdAt,
      @createdBy
    )
  `);
  const insertSpotAuditStatement = db.prepare(`
    INSERT INTO spot_admin_audit_logs (
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

  const listAuditLogsStatement = db.prepare(`
    SELECT * FROM (
      SELECT
        id,
        admin_user_id,
        action_type,
        target_type,
        target_id,
        note,
        created_at,
        'convert' AS scope
      FROM convert_admin_audit_logs
      UNION ALL
      SELECT
        id,
        admin_user_id,
        action_type,
        target_type,
        target_id,
        note,
        created_at,
        'spot' AS scope
      FROM spot_admin_audit_logs
    )
    ORDER BY created_at DESC, id DESC
    LIMIT @limit OFFSET @offset
  `);

  const findUserAccountStatement = db.prepare(`
    SELECT user_id, account_status, kyc_status
    FROM users
    WHERE user_id = ?
    LIMIT 1
  `);

  const findWalletSummaryByAssetStatement = db.prepare(`
    SELECT * FROM user_wallet_balances
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

  const findWalletDetailStatement = db.prepare(`
    SELECT * FROM user_wallet_balance_details
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

  const listWalletDetailRowsStatement = db.prepare(`
    SELECT user_id, asset_symbol, available_usd, locked_usd, reward_earned_usd, updated_at
    FROM user_wallet_balance_details
  `);
  const listWalletSummaryRowsStatement = db.prepare(`
    SELECT user_id, asset_symbol, asset_name, total_usd, updated_at
    FROM user_wallet_balances
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
  const updateWalletSummarySymbolStatement = db.prepare(`
    UPDATE user_wallet_balances
    SET asset_symbol = @toSymbol
    WHERE user_id = @userId AND asset_symbol = @fromSymbol
  `);
  const deleteWalletSummaryBySymbolStatement = db.prepare(`
    DELETE FROM user_wallet_balances
    WHERE user_id = @userId AND asset_symbol = @assetSymbol
  `);

  function collapseWalletSymbol(value = "") {
    const raw = normalizeUpper(value).replace(/[^A-Z0-9_]/g, "");
    if (!raw) {
      return "";
    }
    if (typeof normalizeAssetSymbol === "function") {
      const normalized = normalizeUpper(normalizeAssetSymbol(raw));
      if (normalized) {
        return normalized;
      }
    }
    return raw.replace(/_/g, "");
  }

  function isScopedWalletSymbol(value = "") {
    const normalized = normalizeUpper(value).replace(/[^A-Z0-9_]/g, "");
    return /^(SPOT|MAIN|BINARY)_[A-Z0-9]+$/.test(normalized);
  }

  function buildWalletSymbolCandidates(assetSymbol = "", fallback = "SPOT_USDT") {
    const canonical = normalizeWalletSymbol(assetSymbol, fallback);
    const candidates = [];
    const pushSymbol = (value = "") => {
      const normalized = normalizeUpper(value).replace(/[^A-Z0-9_]/g, "");
      if (!normalized) {
        return;
      }
      if (!candidates.includes(normalized)) {
        candidates.push(normalized);
      }
    };

    pushSymbol(canonical);
    pushSymbol(assetSymbol);
    pushSymbol(canonical.replace(/_/g, ""));
    pushSymbol(collapseWalletSymbol(canonical));
    pushSymbol(collapseWalletSymbol(assetSymbol));
    const canonicalAssetOnly = canonical.includes("_") ? canonical.split("_").slice(1).join("_") : "";
    pushSymbol(canonicalAssetOnly);
    if (canonicalAssetOnly) {
      pushSymbol(canonicalAssetOnly.replace(/[^A-Z0-9]/g, ""));
    }

    return candidates;
  }

  function findWalletDetailByAnySymbol(userId, assetSymbol, fallback = "SPOT_USDT") {
    const candidates = buildWalletSymbolCandidates(assetSymbol, fallback);
    for (const symbol of candidates) {
      const row = findWalletDetailStatement.get(userId, symbol);
      if (row) {
        return { row, symbol };
      }
    }
    return null;
  }

  function findWalletSummaryByAnySymbol(userId, assetSymbol, fallback = "SPOT_USDT") {
    const candidates = buildWalletSymbolCandidates(assetSymbol, fallback);
    for (const symbol of candidates) {
      const row = findWalletSummaryByAssetStatement.get(userId, symbol);
      if (row) {
        return { row, symbol };
      }
    }
    return null;
  }

  function migrateWalletAliasForUser({ userId, fromSymbol, toSymbol, nowIso }) {
    const from = normalizeUpper(fromSymbol || "").replace(/[^A-Z0-9_]/g, "");
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

    const summaryFrom = findWalletSummaryByAssetStatement.get(userId, from);
    if (summaryFrom) {
      const summaryTo = findWalletSummaryByAssetStatement.get(userId, to);
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

  function migrateWalletAliasSymbols() {
    const tx = db.transaction(() => {
      const detailRows = listWalletDetailRowsStatement.all();
      for (const row of detailRows) {
        const original = normalizeUpper(row.asset_symbol || "");
        const canonical = normalizeWalletSymbol(original, original);
        if (!canonical || canonical === original) {
          continue;
        }

        const existing = findWalletDetailStatement.get(row.user_id, canonical);
        if (existing) {
          updateWalletDetailStatement.run({
            userId: row.user_id,
            assetSymbol: canonical,
            availableUsd: toMoney(toNumber(existing.available_usd, 0) + toNumber(row.available_usd, 0)),
            lockedUsd: toMoney(toNumber(existing.locked_usd, 0) + toNumber(row.locked_usd, 0)),
            rewardEarnedUsd: toMoney(toNumber(existing.reward_earned_usd, 0) + toNumber(row.reward_earned_usd, 0)),
            updatedAt: row.updated_at || toIso(getNow()),
          });
          db.prepare(`DELETE FROM user_wallet_balance_details WHERE user_id = ? AND asset_symbol = ?`).run(row.user_id, original);
        } else {
          db.prepare(`UPDATE user_wallet_balance_details SET asset_symbol = ? WHERE user_id = ? AND asset_symbol = ?`).run(
            canonical,
            row.user_id,
            original,
          );
        }
      }

      const summaryRows = listWalletSummaryRowsStatement.all();
      for (const row of summaryRows) {
        const original = normalizeUpper(row.asset_symbol || "");
        const canonical = normalizeWalletSymbol(original, original);
        if (!canonical || canonical === original) {
          continue;
        }

        const existing = findWalletSummaryByAssetStatement.get(row.user_id, canonical);
        if (existing) {
          setWalletSummaryStatement.run({
            userId: row.user_id,
            assetSymbol: canonical,
            assetName: sanitizeShortText(existing.asset_name || row.asset_name || canonical, 80),
            totalUsd: toMoney(toNumber(existing.total_usd, 0) + toNumber(row.total_usd, 0)),
            updatedAt: row.updated_at || toIso(getNow()),
          });
          db.prepare(`DELETE FROM user_wallet_balances WHERE user_id = ? AND asset_symbol = ?`).run(row.user_id, original);
        } else {
          db.prepare(`UPDATE user_wallet_balances SET asset_symbol = ? WHERE user_id = ? AND asset_symbol = ?`).run(
            canonical,
            row.user_id,
            original,
          );
        }
      }
    });

    tx();
  }

  function ensureEngineSettingsSeed() {
    const nowIso = toIso(getNow());
    const existing = findEngineSettingsStatement.get();
    if (existing) {
      return;
    }

    upsertEngineSettingsStatement.run({
      transactionModuleEnabled: 1,
      convertEnabled: 1,
      spotEnabled: 1,
      maintenanceModeEnabled: 0,
      maintenanceMessage: "",
      emergencyFreezeEnabled: 0,
      defaultConvertFeePercent: 0.1,
      defaultConvertSpreadPercent: 0.1,
      defaultFixedConvertFeeUsd: 0,
      defaultMakerFeePercent: 0.1,
      defaultTakerFeePercent: 0.15,
      defaultMinOrderSize: 0.0001,
      defaultMaxOrderSize: 100000,
      manualRateModeEnabled: 1,
      manualPriceModeEnabled: 1,
      requireActiveAccountOnly: 1,
      blockSuspendedUsers: 1,
      blockBannedUsers: 1,
      kycRequiredAboveAmountUsd: null,
      updatedAt: nowIso,
      updatedBy: "system",
    });
  }

  function normalizeEngineSettingsRow(raw) {
    if (!raw) {
      return null;
    }

    return {
      transactionModuleEnabled: normalizeBooleanNumber(raw.transaction_module_enabled, 1) === 1,
      convertEnabled: normalizeBooleanNumber(raw.convert_enabled, 1) === 1,
      spotEnabled: normalizeBooleanNumber(raw.spot_enabled, 1) === 1,
      maintenanceModeEnabled: normalizeBooleanNumber(raw.maintenance_mode_enabled, 0) === 1,
      maintenanceMessage: sanitizeShortText(raw.maintenance_message || "", 260),
      emergencyFreezeEnabled: normalizeBooleanNumber(raw.emergency_freeze_enabled, 0) === 1,
      defaultConvertFeePercent: toNumber(raw.default_convert_fee_percent, 0.1),
      defaultConvertSpreadPercent: toNumber(raw.default_convert_spread_percent, 0.1),
      defaultFixedConvertFeeUsd: toNumber(raw.default_fixed_convert_fee_usd, 0),
      defaultMakerFeePercent: toNumber(raw.default_maker_fee_percent, 0.1),
      defaultTakerFeePercent: toNumber(raw.default_taker_fee_percent, 0.15),
      defaultMinOrderSize: Math.max(0.00000001, toNumber(raw.default_min_order_size, 0.0001)),
      defaultMaxOrderSize: Math.max(0.00000001, toNumber(raw.default_max_order_size, 100000)),
      manualRateModeEnabled: normalizeBooleanNumber(raw.manual_rate_mode_enabled, 1) === 1,
      manualPriceModeEnabled: normalizeBooleanNumber(raw.manual_price_mode_enabled, 1) === 1,
      requireActiveAccountOnly: normalizeBooleanNumber(raw.require_active_account_only, 1) === 1,
      blockSuspendedUsers: normalizeBooleanNumber(raw.block_suspended_users, 1) === 1,
      blockBannedUsers: normalizeBooleanNumber(raw.block_banned_users, 1) === 1,
      kycRequiredAboveAmountUsd:
        raw.kyc_required_above_amount_usd === null || raw.kyc_required_above_amount_usd === undefined
          ? null
          : toNumber(raw.kyc_required_above_amount_usd, 0),
      updatedAt: raw.updated_at || "",
      updatedBy: raw.updated_by || "",
    };
  }

  function getEngineSettings() {
    ensureEngineSettingsSeed();
    const row = findEngineSettingsStatement.get();
    const normalized = normalizeEngineSettingsRow(row);
    return (
      normalized || {
        transactionModuleEnabled: true,
        convertEnabled: true,
        spotEnabled: true,
        maintenanceModeEnabled: false,
        maintenanceMessage: "",
        emergencyFreezeEnabled: false,
        defaultConvertFeePercent: 0.1,
        defaultConvertSpreadPercent: 0.1,
        defaultFixedConvertFeeUsd: 0,
        defaultMakerFeePercent: 0.1,
        defaultTakerFeePercent: 0.15,
        defaultMinOrderSize: 0.0001,
        defaultMaxOrderSize: 100000,
        manualRateModeEnabled: true,
        manualPriceModeEnabled: true,
        requireActiveAccountOnly: true,
        blockSuspendedUsers: true,
        blockBannedUsers: true,
        kycRequiredAboveAmountUsd: null,
        updatedAt: "",
        updatedBy: "",
      }
    );
  }

  function toConvertPairPayload(row) {
    if (!row) {
      return null;
    }

    return {
      pairId: toNumber(row.id, 0),
      pairCode: normalizeUpper(row.pair_code || ""),
      displayName: sanitizeShortText(row.display_name || "", 120),
      fromAsset: normalizeAssetCode(row.from_asset || ""),
      toAsset: normalizeAssetCode(row.to_asset || ""),
      rateSourceType: normalizeRateSourceType(row.rate_source_type || "internal_feed"),
      sourceSymbol: normalizeUpper(row.source_symbol || ""),
      minAmountUsd: toNumber(row.min_amount_usd, 0),
      maxAmountUsd: toNumber(row.max_amount_usd, 0),
      feePercent: toNumber(row.fee_percent, 0),
      spreadPercent: toNumber(row.spread_percent, 0),
      fixedFeeUsd: toNumber(row.fixed_fee_usd, 0),
      manualRate: row.manual_rate === null || row.manual_rate === undefined ? null : toNumber(row.manual_rate, 0),
      isEnabled: normalizeBooleanNumber(row.is_enabled, 1) === 1,
      displaySortOrder: toNumber(row.display_sort_order, 0),
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || "",
      createdBy: row.created_by || "",
      updatedBy: row.updated_by || "",
    };
  }

  function toSpotPairPayload(row) {
    if (!row) {
      return null;
    }

    const currentPrice = toNumber(row.current_price, 0);
    const previousPrice = toNumber(row.previous_price, currentPrice);
    const changePercent = previousPrice > 0 ? ((currentPrice - previousPrice) / previousPrice) * 100 : 0;

    return {
      pairId: toNumber(row.id, 0),
      pairCode: normalizeUpper(row.pair_code || ""),
      displayName: sanitizeShortText(row.display_name || "", 120),
      baseAsset: normalizeAssetCode(row.base_asset || ""),
      quoteAsset: normalizeAssetCode(row.quote_asset || ""),
      priceSourceType: normalizeRateSourceType(row.price_source_type || "internal_feed"),
      sourceSymbol: normalizeUpper(row.source_symbol || ""),
      currentPrice,
      previousPrice,
      changePercent: Number(changePercent.toFixed(4)),
      pricePrecision: Math.max(0, Math.min(12, toNumber(row.price_precision, 4))),
      quantityPrecision: Math.max(0, Math.min(12, toNumber(row.quantity_precision, 6))),
      minOrderSize: toNumber(row.min_order_size, 0.0001),
      maxOrderSize: toNumber(row.max_order_size, 100000),
      makerFeePercent: toNumber(row.maker_fee_percent, 0.1),
      takerFeePercent: toNumber(row.taker_fee_percent, 0.15),
      isEnabled: normalizeBooleanNumber(row.is_enabled, 1) === 1,
      isFeatured: normalizeBooleanNumber(row.is_featured, 0) === 1,
      displaySortOrder: toNumber(row.display_sort_order, 0),
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || "",
      createdBy: row.created_by || "",
      updatedBy: row.updated_by || "",
    };
  }

  function toConvertOrderPayload(row) {
    if (!row) {
      return null;
    }

    return {
      convertId: toNumber(row.id, 0),
      convertRef: normalizeUpper(row.convert_ref || ""),
      userId: row.user_id || "",
      convertPairId: toNumber(row.convert_pair_id, 0),
      pairCode: normalizeUpper(row.pair_code_snapshot || ""),
      displayName: sanitizeShortText(row.display_name_snapshot || "", 120),
      fromAsset: normalizeAssetCode(row.from_asset_snapshot || ""),
      toAsset: normalizeAssetCode(row.to_asset_snapshot || ""),
      fromAmount: toNumber(row.from_amount, 0),
      rawRate: toNumber(row.raw_rate, 0),
      appliedRate: toNumber(row.applied_rate, 0),
      feeAmount: toNumber(row.fee_amount, 0),
      receiveAmount: toNumber(row.receive_amount, 0),
      status: normalizeConvertStatus(row.status || "pending"),
      note: row.note || "",
      createdAt: row.created_at || "",
      completedAt: row.completed_at || "",
      updatedAt: row.updated_at || "",
      accountName: row.account_name || "",
      accountEmail: row.account_email || "",
    };
  }

  function toSpotOrderPayload(row) {
    if (!row) {
      return null;
    }

    return {
      orderId: toNumber(row.id, 0),
      orderRef: normalizeUpper(row.order_ref || ""),
      userId: row.user_id || "",
      pairId: toNumber(row.pair_id, 0),
      pairCode: normalizeUpper(row.pair_code_snapshot || ""),
      pairDisplayName: sanitizeShortText(row.pair_display_name_snapshot || "", 120),
      baseAsset: normalizeAssetCode(row.base_asset_snapshot || ""),
      quoteAsset: normalizeAssetCode(row.quote_asset_snapshot || ""),
      side: normalizeOrderSide(row.side || "buy"),
      orderType: normalizeOrderType(row.order_type || "market"),
      price: row.price === null || row.price === undefined ? null : toNumber(row.price, 0),
      quantity: toNumber(row.quantity, 0),
      filledQuantity: toNumber(row.filled_quantity, 0),
      avgFillPrice: row.avg_fill_price === null || row.avg_fill_price === undefined ? null : toNumber(row.avg_fill_price, 0),
      quoteAmount: row.quote_amount === null || row.quote_amount === undefined ? null : toNumber(row.quote_amount, 0),
      feeAmount: toNumber(row.fee_amount, 0),
      feeAsset: normalizeAssetCode(row.fee_asset || ""),
      status: normalizeOrderStatus(row.status || "open"),
      lockedAssetSymbol: normalizeWalletSymbol(row.locked_asset_symbol || "SPOT_USDT"),
      lockedAmount: toNumber(row.locked_amount, 0),
      note: row.note || "",
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || "",
      filledAt: row.filled_at || "",
      cancelledAt: row.cancelled_at || "",
      accountName: row.account_name || "",
      accountEmail: row.account_email || "",
    };
  }

  function toSpotTradePayload(row) {
    if (!row) {
      return null;
    }

    return {
      tradeId: toNumber(row.id, 0),
      tradeRef: normalizeUpper(row.trade_ref || ""),
      orderId: toNumber(row.order_id, 0),
      userId: row.user_id || "",
      pairId: toNumber(row.pair_id, 0),
      pairCode: normalizeUpper(row.pair_code_snapshot || ""),
      side: normalizeOrderSide(row.side || "buy"),
      executionPrice: toNumber(row.execution_price, 0),
      executionQuantity: toNumber(row.execution_quantity, 0),
      quoteTotal: toNumber(row.quote_total, 0),
      feeAmount: toNumber(row.fee_amount, 0),
      feeAsset: normalizeAssetCode(row.fee_asset || ""),
      createdAt: row.created_at || "",
    };
  }

  function toTickPayload(row) {
    if (!row) {
      return null;
    }

    return {
      tickId: toNumber(row.id, 0),
      pairId: toNumber(row.pair_id, 0),
      price: toNumber(row.price, 0),
      tickTime: row.tick_time || "",
      sourceType: normalizeRateSourceType(row.source_type || "internal_feed"),
      createdAt: row.created_at || "",
    };
  }

  function ensureDefaultSpotPairs() {
    const existing = listAllSpotPairsStatement.all();
    if (existing.length > 0) {
      return;
    }

    const nowIso = toIso(getNow());
    const seedPairs = [
      {
        pairCode: "BTCUSDT",
        displayName: "BTC/USDT",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        seedPrice: pickSeedPrice("BTCUSDT"),
        pricePrecision: 2,
        quantityPrecision: 6,
      },
      {
        pairCode: "ETHUSDT",
        displayName: "ETH/USDT",
        baseAsset: "ETH",
        quoteAsset: "USDT",
        seedPrice: pickSeedPrice("ETHUSDT"),
        pricePrecision: 2,
        quantityPrecision: 6,
      },
      {
        pairCode: "BNBUSDT",
        displayName: "BNB/USDT",
        baseAsset: "BNB",
        quoteAsset: "USDT",
        seedPrice: pickSeedPrice("BNBUSDT"),
        pricePrecision: 2,
        quantityPrecision: 6,
      },
      {
        pairCode: "SOLUSDT",
        displayName: "SOL/USDT",
        baseAsset: "SOL",
        quoteAsset: "USDT",
        seedPrice: pickSeedPrice("SOLUSDT"),
        pricePrecision: 3,
        quantityPrecision: 5,
      },
    ];

    for (let index = 0; index < seedPairs.length; index += 1) {
      const pair = seedPairs[index];
      insertSpotPairStatement.run({
        pairCode: pair.pairCode,
        displayName: pair.displayName,
        baseAsset: pair.baseAsset,
        quoteAsset: pair.quoteAsset,
        priceSourceType: "internal_feed",
        sourceSymbol: pair.pairCode,
        currentPrice: toMoney(pair.seedPrice),
        previousPrice: toMoney(pair.seedPrice),
        pricePrecision: pair.pricePrecision,
        quantityPrecision: pair.quantityPrecision,
        minOrderSize: 0.0001,
        maxOrderSize: 100000,
        makerFeePercent: 0.1,
        takerFeePercent: 0.15,
        isEnabled: 1,
        isFeatured: index === 0 ? 1 : 0,
        displaySortOrder: index,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: "system",
        updatedBy: "system",
      });

      const created = findSpotPairByCodeStatement.get(pair.pairCode);
      if (created) {
        insertSpotTickStatement.run({
          pairId: created.id,
          price: toMoney(pair.seedPrice),
          tickTime: nowIso,
          sourceType: "internal_feed",
          createdAt: nowIso,
        });
      }
    }
  }

  function ensureDefaultConvertPairs() {
    const existing = listAllConvertPairsStatement.all();
    if (existing.length > 0) {
      return;
    }

    const spotPairs = listAllSpotPairsStatement
      .all()
      .filter((row) => normalizeBooleanNumber(row.is_enabled, 1) === 1 && normalizeAssetCode(row.quote_asset || "") === "USDT");

    const nowIso = toIso(getNow());
    let sortIndex = 0;

    for (const row of spotPairs) {
      const base = normalizeAssetCode(row.base_asset || "");
      const quote = normalizeAssetCode(row.quote_asset || "");
      if (!base || !quote || base === quote) {
        continue;
      }

      const directCode = `${base}_${quote}`;
      if (!findConvertPairByCodeStatement.get(directCode)) {
        insertConvertPairStatement.run({
          pairCode: directCode,
          displayName: `${base} to ${quote}`,
          fromAsset: base,
          toAsset: quote,
          rateSourceType: "internal_feed",
          sourceSymbol: normalizeUpper(row.pair_code || ""),
          minAmountUsd: 1,
          maxAmountUsd: 100000,
          feePercent: 0.1,
          spreadPercent: 0.1,
          fixedFeeUsd: 0,
          manualRate: null,
          isEnabled: 1,
          displaySortOrder: sortIndex,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: "system",
          updatedBy: "system",
        });
        sortIndex += 1;
      }

      const reverseCode = `${quote}_${base}`;
      if (!findConvertPairByCodeStatement.get(reverseCode)) {
        insertConvertPairStatement.run({
          pairCode: reverseCode,
          displayName: `${quote} to ${base}`,
          fromAsset: quote,
          toAsset: base,
          rateSourceType: "internal_feed",
          sourceSymbol: normalizeUpper(row.pair_code || ""),
          minAmountUsd: 1,
          maxAmountUsd: 100000,
          feePercent: 0.1,
          spreadPercent: 0.1,
          fixedFeeUsd: 0,
          manualRate: null,
          isEnabled: 1,
          displaySortOrder: sortIndex,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: "system",
          updatedBy: "system",
        });
        sortIndex += 1;
      }
    }
  }

  function insertConvertAudit({ adminUserId, actionType, targetType, targetId, note }) {
    insertConvertAuditStatement.run({
      adminUserId: sanitizeShortText(adminUserId || "system", 40),
      actionType: sanitizeShortText(actionType || "unknown", 80),
      targetType: sanitizeShortText(targetType || "unknown", 80),
      targetId: sanitizeShortText(String(targetId || ""), 80),
      note: sanitizeShortText(note || "", 300),
      createdAt: toIso(getNow()),
    });
  }

  function insertSpotAudit({ adminUserId, actionType, targetType, targetId, note }) {
    insertSpotAuditStatement.run({
      adminUserId: sanitizeShortText(adminUserId || "system", 40),
      actionType: sanitizeShortText(actionType || "unknown", 80),
      targetType: sanitizeShortText(targetType || "unknown", 80),
      targetId: sanitizeShortText(String(targetId || ""), 80),
      note: sanitizeShortText(note || "", 300),
      createdAt: toIso(getNow()),
    });
  }

  function ensureWalletDetailRow(userId, assetSymbol, nowIso) {
    const symbol = normalizeWalletSymbol(assetSymbol, assetSymbol);
    let detail = findWalletDetailStatement.get(userId, symbol);
    if (!detail) {
      const aliasDetail = findWalletDetailByAnySymbol(userId, symbol, assetSymbol);
      if (aliasDetail?.symbol && aliasDetail.symbol !== symbol && isScopedWalletSymbol(symbol)) {
        migrateWalletAliasForUser({
          userId,
          fromSymbol: aliasDetail.symbol,
          toSymbol: symbol,
          nowIso,
        });
        detail = findWalletDetailStatement.get(userId, symbol);
      }
    }

    if (detail) {
      return {
        user_id: userId,
        asset_symbol: symbol,
        available_usd: toNumber(detail.available_usd, 0),
        locked_usd: toNumber(detail.locked_usd, 0),
        reward_earned_usd: toNumber(detail.reward_earned_usd, 0),
        updated_at: detail.updated_at || nowIso,
      };
    }

    const aliasSummary = findWalletSummaryByAnySymbol(userId, symbol, assetSymbol);
    if (aliasSummary?.symbol && aliasSummary.symbol !== symbol && isScopedWalletSymbol(symbol)) {
      migrateWalletAliasForUser({
        userId,
        fromSymbol: aliasSummary.symbol,
        toSymbol: symbol,
        nowIso,
      });
    }

    const summary = findWalletSummaryByAssetStatement.get(userId, symbol);
    const startingAvailable = toMoney(toNumber(summary?.total_usd, 0));

    insertWalletDetailStatement.run({
      userId,
      assetSymbol: symbol,
      availableUsd: startingAvailable,
      lockedUsd: 0,
      rewardEarnedUsd: 0,
      updatedAt: nowIso,
    });

    if (!summary) {
      setWalletSummaryStatement.run({
        userId,
        assetSymbol: symbol,
        assetName: sanitizeShortText(makeAssetDisplayName(symbol.replace(/^SPOT_/, "")), 80),
        totalUsd: startingAvailable,
        updatedAt: nowIso,
      });
    }

    detail = findWalletDetailStatement.get(userId, symbol);
    return {
      user_id: userId,
      asset_symbol: symbol,
      available_usd: toNumber(detail?.available_usd, startingAvailable),
      locked_usd: toNumber(detail?.locked_usd, 0),
      reward_earned_usd: toNumber(detail?.reward_earned_usd, 0),
      updated_at: detail?.updated_at || nowIso,
    };
  }

  function saveWalletDetail({ userId, assetSymbol, availableUsd, lockedUsd, rewardEarnedUsd, updatedAt }) {
    const symbol = normalizeWalletSymbol(assetSymbol, assetSymbol);

    const updateResult = updateWalletDetailStatement.run({
      userId,
      assetSymbol: symbol,
      availableUsd: toMoney(availableUsd),
      lockedUsd: toMoney(lockedUsd),
      rewardEarnedUsd: toMoney(rewardEarnedUsd),
      updatedAt,
    });
    if (!updateResult.changes) {
      insertWalletDetailStatement.run({
        userId,
        assetSymbol: symbol,
        availableUsd: toMoney(availableUsd),
        lockedUsd: toMoney(lockedUsd),
        rewardEarnedUsd: toMoney(rewardEarnedUsd),
        updatedAt,
      });
    }

    const next = findWalletDetailStatement.get(userId, symbol) || {
      user_id: userId,
      asset_symbol: symbol,
      available_usd: toMoney(availableUsd),
      locked_usd: toMoney(lockedUsd),
      reward_earned_usd: toMoney(rewardEarnedUsd),
      updated_at: updatedAt,
    };

    return {
      user_id: userId,
      asset_symbol: symbol,
      available_usd: toNumber(next.available_usd, 0),
      locked_usd: toNumber(next.locked_usd, 0),
      reward_earned_usd: toNumber(next.reward_earned_usd, 0),
      updated_at: next.updated_at || updatedAt,
    };
  }

  function syncWalletSummaryFromDetail({ userId, assetSymbol, updatedAt }) {
    const symbol = normalizeWalletSymbol(assetSymbol, assetSymbol);
    let detail = findWalletDetailStatement.get(userId, symbol);
    if (!detail) {
      const aliasDetail = findWalletDetailByAnySymbol(userId, symbol, symbol);
      if (aliasDetail?.symbol && aliasDetail.symbol !== symbol && isScopedWalletSymbol(symbol)) {
        migrateWalletAliasForUser({
          userId,
          fromSymbol: aliasDetail.symbol,
          toSymbol: symbol,
          nowIso: updatedAt || toIso(getNow()),
        });
        detail = findWalletDetailStatement.get(userId, symbol);
      } else if (aliasDetail?.row) {
        detail = aliasDetail.row;
      }
    }
    const available = toNumber(detail?.available_usd, 0);
    const locked = toNumber(detail?.locked_usd, 0);
    const total = toMoney(available + locked);

    const existingSummary = findWalletSummaryByAssetStatement.get(userId, symbol);
    const assetName = sanitizeShortText(existingSummary?.asset_name || makeAssetDisplayName(symbol.replace(/^SPOT_/, "")), 80);

    setWalletSummaryStatement.run({
      userId,
      assetSymbol: symbol,
      assetName,
      totalUsd: total,
      updatedAt,
    });

    return {
      symbol,
      total,
      available: available,
      locked: locked,
    };
  }

  function buildWalletSnapshot(userId) {
    const summaryRows = db
      .prepare(
        `SELECT asset_symbol, asset_name, total_usd, updated_at
         FROM user_wallet_balances
         WHERE user_id = ?
         ORDER BY total_usd DESC, asset_symbol ASC`,
      )
      .all(userId);

    const balanceBySymbol = new Map();
    for (const row of summaryRows) {
      const symbol = normalizeWalletSymbol(row.asset_symbol || "");
      if (!symbol) {
        continue;
      }
      const existing = balanceBySymbol.get(symbol);
      const rowUpdatedAt = row.updated_at || "";
      const rowTotal = toNumber(row.total_usd, 0);

      if (!existing) {
        balanceBySymbol.set(symbol, {
          symbol,
          name: sanitizeShortText(row.asset_name || row.asset_symbol || symbol, 80),
          totalUsd: toMoney(rowTotal),
          updatedAt: rowUpdatedAt,
        });
        continue;
      }

      existing.totalUsd = toMoney(existing.totalUsd + rowTotal);
      if (!existing.name) {
        existing.name = sanitizeShortText(row.asset_name || row.asset_symbol || symbol, 80);
      }
      if (parseIsoMs(rowUpdatedAt) > parseIsoMs(existing.updatedAt || "")) {
        existing.updatedAt = rowUpdatedAt;
      }
    }

    const detailRows = db
      .prepare(
        `SELECT asset_symbol, available_usd, locked_usd, reward_earned_usd, updated_at
         FROM user_wallet_balance_details
         WHERE user_id = ?
         ORDER BY asset_symbol ASC`,
      )
      .all(userId)
      .filter(Boolean);

    const detailBySymbol = new Map();
    for (const row of detailRows) {
      const symbol = normalizeWalletSymbol(row.asset_symbol || "");
      if (!symbol) {
        continue;
      }
      const existing = detailBySymbol.get(symbol);
      const rowUpdatedAt = row.updated_at || "";
      const rowAvailable = toNumber(row.available_usd, 0);
      const rowLocked = toNumber(row.locked_usd, 0);
      const rowReward = toNumber(row.reward_earned_usd, 0);

      if (!existing) {
        detailBySymbol.set(symbol, {
          symbol,
          availableUsd: toMoney(rowAvailable),
          lockedUsd: toMoney(rowLocked),
          rewardEarnedUsd: toMoney(rowReward),
          updatedAt: rowUpdatedAt,
        });
        continue;
      }

      existing.availableUsd = toMoney(existing.availableUsd + rowAvailable);
      existing.lockedUsd = toMoney(existing.lockedUsd + rowLocked);
      existing.rewardEarnedUsd = toMoney(existing.rewardEarnedUsd + rowReward);
      if (parseIsoMs(rowUpdatedAt) > parseIsoMs(existing.updatedAt || "")) {
        existing.updatedAt = rowUpdatedAt;
      }
    }

    for (const [symbol, detail] of detailBySymbol.entries()) {
      const totalFromDetail = toMoney(toNumber(detail.availableUsd, 0) + toNumber(detail.lockedUsd, 0));
      const existingSummary = balanceBySymbol.get(symbol);
      if (existingSummary) {
        existingSummary.totalUsd = totalFromDetail;
        if (parseIsoMs(detail.updatedAt || "") > parseIsoMs(existingSummary.updatedAt || "")) {
          existingSummary.updatedAt = detail.updatedAt || existingSummary.updatedAt;
        }
      } else {
        balanceBySymbol.set(symbol, {
          symbol,
          name: sanitizeShortText(makeAssetDisplayName(symbol.replace(/^SPOT_/, "")), 80),
          totalUsd: totalFromDetail,
          updatedAt: detail.updatedAt || "",
        });
      }
    }

    const balances = Array.from(balanceBySymbol.values()).sort((a, b) => b.totalUsd - a.totalUsd || a.symbol.localeCompare(b.symbol));
    const details = Array.from(detailBySymbol.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));

    return {
      balances,
      details,
    };
  }

  function getCurrentUserAccount(userId, fallback = null) {
    const fromDb = findUserAccountStatement.get(userId);
    if (fromDb) {
      return {
        userId: fromDb.user_id,
        accountStatus: normalizeLower(fromDb.account_status || "active"),
        kycStatus: normalizeLower(fromDb.kyc_status || "pending"),
      };
    }

    if (fallback) {
      return {
        userId: fallback.userId || userId,
        accountStatus: normalizeLower(fallback.accountStatus || "active"),
        kycStatus: normalizeLower(fallback.kycStatus || "pending"),
      };
    }

    return {
      userId,
      accountStatus: "active",
      kycStatus: "pending",
    };
  }

  function assertUserTransactionAccess({ req, settings, submodule, amountUsd = 0 }) {
    if (!req?.currentUser?.userId) {
      throw new Error("Session invalid. Please login again.");
    }

    if (!settings.transactionModuleEnabled) {
      throw new Error("Transaction module is disabled by admin.");
    }
    if (submodule === "convert" && !settings.convertEnabled) {
      throw new Error("Convert module is disabled by admin.");
    }
    if (submodule === "spot" && !settings.spotEnabled) {
      throw new Error("Spot trading module is disabled by admin.");
    }
    if (settings.emergencyFreezeEnabled) {
      throw new Error("Trading is temporarily frozen by admin. Please try later.");
    }
    if (settings.maintenanceModeEnabled) {
      throw new Error(settings.maintenanceMessage || "Module is under maintenance. Please try later.");
    }

    const account = getCurrentUserAccount(req.currentUser.userId, {
      accountStatus: req.currentUser.accountStatus,
      kycStatus: req.currentUser.kycStatus,
      userId: req.currentUser.userId,
    });

    if (settings.requireActiveAccountOnly && account.accountStatus !== "active") {
      throw new Error("Only active accounts can use this module.");
    }
    if (settings.blockSuspendedUsers && account.accountStatus === "suspended") {
      throw new Error("Your account is suspended for trading.");
    }
    if (settings.blockBannedUsers && account.accountStatus === "banned") {
      throw new Error("Your account is banned from trading.");
    }

    const threshold = settings.kycRequiredAboveAmountUsd;
    if (threshold !== null && threshold !== undefined && toNumber(amountUsd, 0) >= toNumber(threshold, 0)) {
      if (account.kycStatus !== "authenticated") {
        throw new Error("KYC authentication required for this transaction amount.");
      }
    }
  }

  function resolvePriceForPair(pairRow, { staleMs = 300000 } = {}) {
    if (!pairRow) {
      throw new Error("Pair not found.");
    }

    const currentPrice = toNumber(pairRow.current_price, 0);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error("Price feed unavailable for this pair.");
    }

    const latestTick = findLatestSpotTickByPairStatement.get({ pairId: pairRow.id });
    const lastUpdateTime = parseIsoMs(latestTick?.tick_time || pairRow.updated_at || "");
    const nowMs = getNow().getTime();
    if (!lastUpdateTime || nowMs - lastUpdateTime > staleMs) {
      // Auto-heal stale internal feeds by refreshing the latest known price tick.
      pushTick({
        pairId: pairRow.id,
        price: currentPrice,
        sourceType: normalizeRateSourceType(pairRow.price_source_type || "internal_feed"),
        atIso: toIso(getNow()),
      });
    }

    return currentPrice;
  }

  function resolveDirectPairRate(baseAsset, quoteAsset) {
    const direct = findSpotPairByBaseQuoteStatement.get({
      baseAsset: normalizeAssetCode(baseAsset),
      quoteAsset: normalizeAssetCode(quoteAsset),
    });

    if (!direct || normalizeBooleanNumber(direct.is_enabled, 0) !== 1) {
      return null;
    }

    const price = resolvePriceForPair(direct);
    return {
      pair: direct,
      rate: price,
    };
  }

  function resolveConversionRawRate({ fromAsset, toAsset, sourceSymbol = "", pairRateSourceType = "internal_feed", settings }) {
    const from = normalizeAssetCode(fromAsset);
    const to = normalizeAssetCode(toAsset);

    if (!from || !to) {
      throw new Error("Asset selection is invalid.");
    }
    if (from === to) {
      throw new Error("From and To assets cannot be the same.");
    }

    const sourceType = normalizeRateSourceType(pairRateSourceType || "internal_feed");
    const normalizedSource = normalizeUpper(sourceSymbol || "");

    if (settings.manualRateModeEnabled && sourceType === "manual_admin_feed") {
      return null;
    }

    if (normalizedSource) {
      const sourcePair = findSpotPairByCodeStatement.get(normalizedSource);
      if (sourcePair && normalizeBooleanNumber(sourcePair.is_enabled, 0) === 1) {
        const base = normalizeAssetCode(sourcePair.base_asset || "");
        const quote = normalizeAssetCode(sourcePair.quote_asset || "");
        const sourcePrice = resolvePriceForPair(sourcePair);
        if (base === from && quote === to) {
          return sourcePrice;
        }
        if (base === to && quote === from) {
          return toMoney(1 / sourcePrice);
        }
      }
    }

    const direct = resolveDirectPairRate(from, to);
    if (direct) {
      return direct.rate;
    }

    const reverse = resolveDirectPairRate(to, from);
    if (reverse) {
      return toMoney(1 / reverse.rate);
    }

    const fromToUsdt =
      from === "USDT"
        ? 1
        : (() => {
            const pair = resolveDirectPairRate(from, "USDT");
            if (!pair) {
              return null;
            }
            return pair.rate;
          })();

    const usdtToTo =
      to === "USDT"
        ? 1
        : (() => {
            const pair = resolveDirectPairRate(to, "USDT");
            if (!pair) {
              return null;
            }
            return toMoney(1 / pair.rate);
          })();

    if (fromToUsdt && usdtToTo) {
      return toMoney(fromToUsdt * usdtToTo);
    }

    throw new Error("No valid market rate found for this conversion pair.");
  }

  function resolveConvertQuote({ pairRow, amount, settings }) {
    const pair = toConvertPairPayload(pairRow);
    if (!pair || !pair.isEnabled) {
      throw new Error("Convert pair is disabled.");
    }

    const fromAsset = normalizeAssetCode(pair.fromAsset);
    const toAsset = normalizeAssetCode(pair.toAsset);
    if (!fromAsset || !toAsset || fromAsset === toAsset) {
      throw new Error("Invalid convert pair configuration.");
    }

    const fromAmount = normalizeUsdAmount(amount);

    const rawRate =
      pair.manualRate !== null && pair.manualRate > 0 && (settings.manualRateModeEnabled || pair.rateSourceType === "manual_admin_feed")
        ? toNumber(pair.manualRate, 0)
        : resolveConversionRawRate({
            fromAsset,
            toAsset,
            sourceSymbol: pair.sourceSymbol,
            pairRateSourceType: pair.rateSourceType,
            settings,
          });

    if (!Number.isFinite(rawRate) || rawRate <= 0) {
      throw new Error("Conversion rate unavailable.");
    }

    const fromToUsd =
      fromAsset === "USDT"
        ? 1
        : toNumber(
            resolveConversionRawRate({
              fromAsset,
              toAsset: "USDT",
              sourceSymbol: pair.sourceSymbol,
              pairRateSourceType: pair.rateSourceType,
              settings,
            }),
            0,
          );

    const amountUsdEquivalent = toMoney(fromAmount * Math.max(0, fromToUsd));

    const minAmountUsd = Math.max(0, toNumber(pair.minAmountUsd, 0));
    const maxAmountUsd = Math.max(minAmountUsd, toNumber(pair.maxAmountUsd, 100000000));

    if (amountUsdEquivalent < minAmountUsd) {
      throw new Error(`Minimum convert amount is ${minAmountUsd} USD.`);
    }
    if (amountUsdEquivalent > maxAmountUsd) {
      throw new Error(`Maximum convert amount is ${maxAmountUsd} USD.`);
    }

    const spreadPercent = Math.max(0, pair.spreadPercent ?? settings.defaultConvertSpreadPercent);
    const feePercent = Math.max(0, pair.feePercent ?? settings.defaultConvertFeePercent);
    const fixedFee = Math.max(0, pair.fixedFeeUsd ?? settings.defaultFixedConvertFeeUsd);

    const appliedRate = toMoney(rawRate * (1 - spreadPercent / 100));
    if (appliedRate <= 0) {
      throw new Error("Applied conversion rate is invalid.");
    }

    const grossReceive = toMoney(fromAmount * appliedRate);
    const percentFeeAmount = toMoney(grossReceive * (feePercent / 100));
    const feeAmount = toMoney(percentFeeAmount + fixedFee);
    const receiveAmount = toMoney(Math.max(0, grossReceive - feeAmount));

    if (receiveAmount <= 0) {
      throw new Error("Receive amount is too low after fee and spread.");
    }

    return {
      pair,
      fromAsset,
      toAsset,
      fromAmount,
      amountUsdEquivalent,
      rawRate: toMoney(rawRate),
      appliedRate,
      spreadPercent,
      feePercent,
      fixedFee,
      grossReceive,
      feeAmount,
      receiveAmount,
    };
  }

  function pushTick({ pairId, price, sourceType = "internal_feed", atIso = "" }) {
    const nowIso = atIso || toIso(getNow());
    insertSpotTickStatement.run({
      pairId,
      price: toMoney(price),
      tickTime: nowIso,
      sourceType: normalizeRateSourceType(sourceType),
      createdAt: nowIso,
    });
    trimOldSpotTicksByPairStatement.run({ pairId, limit: 2000 });
  }

  function createWalletLedgerEntry({
    scope,
    userId,
    orderId = null,
    tradeId = null,
    convertId = null,
    ledgerType,
    assetSymbol,
    amount,
    balanceBefore,
    balanceAfter,
    note,
    createdAt,
    createdBy,
  }) {
    if (scope === "convert") {
      insertConvertWalletLedgerStatement.run({
        userId,
        convertId,
        ledgerType,
        assetSymbol: normalizeWalletSymbol(assetSymbol, assetSymbol),
        amount: toMoney(amount),
        balanceBefore: toMoney(balanceBefore),
        balanceAfter: toMoney(balanceAfter),
        note: sanitizeShortText(note || "", 280),
        createdAt,
        createdBy: sanitizeShortText(createdBy || "system", 40),
      });
      return;
    }

    insertSpotWalletLedgerStatement.run({
      userId,
      orderId,
      tradeId,
      ledgerType,
      assetSymbol: normalizeWalletSymbol(assetSymbol, assetSymbol),
      amount: toMoney(amount),
      balanceBefore: toMoney(balanceBefore),
      balanceAfter: toMoney(balanceAfter),
      note: sanitizeShortText(note || "", 280),
      createdAt,
      createdBy: sanitizeShortText(createdBy || "system", 40),
    });
  }

  function createConvertOrderForUser({ req, pairRow, amount, note = "" }) {
    const settings = getEngineSettings();
    const quote = resolveConvertQuote({ pairRow, amount, settings });
    assertUserTransactionAccess({ req, settings, submodule: "convert", amountUsd: quote.amountUsdEquivalent });

    const userId = req.currentUser.userId;
    const nowIso = toIso(getNow());
    const fromWalletSymbol = makeSpotWalletSymbol(quote.fromAsset);
    const toWalletSymbol = makeSpotWalletSymbol(quote.toAsset);

    const tx = db.transaction(() => {
      const fromWallet = ensureWalletDetailRow(userId, fromWalletSymbol, nowIso);
      const toWallet = ensureWalletDetailRow(userId, toWalletSymbol, nowIso);
      const fromWalletResolvedSymbol = normalizeWalletSymbol(fromWallet.asset_symbol || fromWalletSymbol, fromWalletSymbol);
      const toWalletResolvedSymbol = normalizeWalletSymbol(toWallet.asset_symbol || toWalletSymbol, toWalletSymbol);

      const availableFrom = toNumber(fromWallet.available_usd, 0);
      if (availableFrom < quote.fromAmount) {
        throw new Error(`Insufficient ${quote.fromAsset} balance.`);
      }

      const nextFromAvailable = toMoney(availableFrom - quote.fromAmount);
      const nextFrom = saveWalletDetail({
        userId,
        assetSymbol: fromWalletResolvedSymbol,
        availableUsd: nextFromAvailable,
        lockedUsd: toNumber(fromWallet.locked_usd, 0),
        rewardEarnedUsd: toNumber(fromWallet.reward_earned_usd, 0),
        updatedAt: nowIso,
      });

      const beforeToAvailable = toNumber(toWallet.available_usd, 0);
      const afterToAvailable = toMoney(beforeToAvailable + quote.receiveAmount);
      const nextTo = saveWalletDetail({
        userId,
        assetSymbol: toWalletResolvedSymbol,
        availableUsd: afterToAvailable,
        lockedUsd: toNumber(toWallet.locked_usd, 0),
        rewardEarnedUsd: toNumber(toWallet.reward_earned_usd, 0),
        updatedAt: nowIso,
      });

      syncWalletSummaryFromDetail({ userId, assetSymbol: fromWalletResolvedSymbol, updatedAt: nowIso });
      syncWalletSummaryFromDetail({ userId, assetSymbol: toWalletResolvedSymbol, updatedAt: nowIso });

      const convertRef = buildConvertRef();
      insertConvertOrderStatement.run({
        convertRef,
        userId,
        convertPairId: quote.pair.pairId,
        pairCodeSnapshot: quote.pair.pairCode,
        displayNameSnapshot: quote.pair.displayName,
        fromAssetSnapshot: quote.fromAsset,
        toAssetSnapshot: quote.toAsset,
        fromAmount: quote.fromAmount,
        rawRate: quote.rawRate,
        appliedRate: quote.appliedRate,
        feeAmount: quote.feeAmount,
        receiveAmount: quote.receiveAmount,
        status: "completed",
        note: sanitizeShortText(note, 280),
        createdAt: nowIso,
        completedAt: nowIso,
        updatedAt: nowIso,
      });

      const createdOrder = db.prepare(`SELECT * FROM convert_orders WHERE convert_ref = ? LIMIT 1`).get(convertRef);
      const convertId = createdOrder?.id;

      createWalletLedgerEntry({
        scope: "convert",
        userId,
        convertId,
        ledgerType: "convert_debit",
        assetSymbol: fromWalletResolvedSymbol,
        amount: -quote.fromAmount,
        balanceBefore: availableFrom,
        balanceAfter: nextFrom.available_usd,
        note: `Convert ${quote.fromAsset}->${quote.toAsset}`,
        createdAt: nowIso,
        createdBy: userId,
      });

      createWalletLedgerEntry({
        scope: "convert",
        userId,
        convertId,
        ledgerType: "convert_credit",
        assetSymbol: toWalletResolvedSymbol,
        amount: quote.receiveAmount,
        balanceBefore: beforeToAvailable,
        balanceAfter: nextTo.available_usd,
        note: `Convert receive ${quote.toAsset}`,
        createdAt: nowIso,
        createdBy: userId,
      });

      if (quote.feeAmount > 0) {
        createWalletLedgerEntry({
          scope: "convert",
          userId,
          convertId,
          ledgerType: "convert_fee",
          assetSymbol: toWalletResolvedSymbol,
          amount: -quote.feeAmount,
          balanceBefore: toMoney(beforeToAvailable + quote.grossReceive),
          balanceAfter: nextTo.available_usd,
          note: `Convert fee ${quote.toAsset}`,
          createdAt: nowIso,
          createdBy: userId,
        });
      }

      return {
        order: toConvertOrderPayload(createdOrder),
        quote,
      };
    });

    return tx();
  }

  function computeOrderLockAmount({ side, orderType, price, quantity, feePercent }) {
    if (side === "buy") {
      const quoteCost = toMoney(toNumber(price, 0) * toNumber(quantity, 0));
      const feeCost = toMoney(quoteCost * (toNumber(feePercent, 0) / 100));
      return toMoney(quoteCost + feeCost);
    }

    return toMoney(quantity);
  }

  function validateSpotOrderRequest({ req, settings, pairRow, side, orderType, quantity, price }) {
    if (!pairRow || normalizeBooleanNumber(pairRow.is_enabled, 0) !== 1) {
      throw new Error("Selected pair is disabled.");
    }

    const baseAsset = normalizeAssetCode(pairRow.base_asset || "");
    const quoteAsset = normalizeAssetCode(pairRow.quote_asset || "");
    if (!baseAsset || !quoteAsset || baseAsset === quoteAsset) {
      throw new Error("Pair configuration is invalid.");
    }

    const parsedQuantity = roundToPrecision(quantity, toNumber(pairRow.quantity_precision, 6));
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      throw new Error("Order quantity must be greater than zero.");
    }

    const minOrderSize = Math.max(0, toNumber(pairRow.min_order_size, settings.defaultMinOrderSize));
    const maxOrderSize = Math.max(minOrderSize, toNumber(pairRow.max_order_size, settings.defaultMaxOrderSize));
    if (parsedQuantity < minOrderSize) {
      throw new Error(`Minimum order size is ${minOrderSize}.`);
    }
    if (parsedQuantity > maxOrderSize) {
      throw new Error(`Maximum order size is ${maxOrderSize}.`);
    }

    let executionPrice = null;
    if (orderType === "limit") {
      const parsedPrice = roundToPrecision(price, toNumber(pairRow.price_precision, 4));
      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        throw new Error("Limit price must be a positive number.");
      }
      executionPrice = parsedPrice;
    } else {
      executionPrice = roundToPrecision(resolvePriceForPair(pairRow), toNumber(pairRow.price_precision, 4));
    }

    const quoteAmount = toMoney(executionPrice * parsedQuantity);
    const feePercent = orderType === "market" ? toNumber(pairRow.taker_fee_percent, settings.defaultTakerFeePercent) : toNumber(pairRow.maker_fee_percent, settings.defaultMakerFeePercent);

    const amountUsdForAccess = side === "buy" ? quoteAmount : toMoney(quoteAmount);
    assertUserTransactionAccess({ req, settings, submodule: "spot", amountUsd: amountUsdForAccess });

    const lockAssetSymbol = side === "buy" ? makeSpotWalletSymbol(quoteAsset) : makeSpotWalletSymbol(baseAsset);
    const lockAmount = computeOrderLockAmount({
      side,
      orderType,
      price: executionPrice,
      quantity: parsedQuantity,
      feePercent,
    });

    return {
      baseAsset,
      quoteAsset,
      quantity: parsedQuantity,
      executionPrice,
      quoteAmount,
      feePercent,
      lockAssetSymbol,
      lockAmount,
    };
  }

  function settleSpotOrderFill({ orderRow, pairRow, executionPrice, feePercent, filledBy = "system", note = "" }) {
    const userId = orderRow.user_id;
    const nowIso = toIso(getNow());
    const quantity = toNumber(orderRow.quantity, 0);
    const side = normalizeOrderSide(orderRow.side || "buy");

    if (quantity <= 0) {
      throw new Error("Order quantity invalid.");
    }

    const quoteTotal = toMoney(toNumber(executionPrice, 0) * quantity);
    const feeAmount = toMoney(quoteTotal * (toNumber(feePercent, 0) / 100));

    const baseAsset = normalizeAssetCode(orderRow.base_asset_snapshot || pairRow.base_asset || "");
    const quoteAsset = normalizeAssetCode(orderRow.quote_asset_snapshot || pairRow.quote_asset || "");
    const baseSymbol = makeSpotWalletSymbol(baseAsset);
    const quoteSymbol = makeSpotWalletSymbol(quoteAsset);

    const lockSymbol = normalizeWalletSymbol(orderRow.locked_asset_symbol || "", quoteSymbol);

    const lockWallet = ensureWalletDetailRow(userId, lockSymbol, nowIso);
    const lockAvailableBefore = toNumber(lockWallet.available_usd, 0);
    const lockLockedBefore = toNumber(lockWallet.locked_usd, 0);
    const lockAmount = toMoney(toNumber(orderRow.locked_amount, 0));
    if (lockLockedBefore < lockAmount) {
      throw new Error("Locked wallet state mismatch.");
    }

    const updateRows = [];
    const ledgerRows = [];

    if (side === "buy") {
      const consumeQuote = toMoney(quoteTotal + feeAmount);
      if (lockAmount < consumeQuote) {
        throw new Error("Locked balance is insufficient to fill buy order.");
      }

      const quoteWallet = ensureWalletDetailRow(userId, quoteSymbol, nowIso);
      const quoteLockedBefore = toNumber(quoteWallet.locked_usd, 0);
      const quoteAvailableBefore = toNumber(quoteWallet.available_usd, 0);
      const quoteLockedAfter = toMoney(quoteLockedBefore - lockAmount);
      const quoteRefund = toMoney(lockAmount - consumeQuote);
      const quoteAvailableAfter = toMoney(quoteAvailableBefore + quoteRefund);

      updateRows.push({
        symbol: quoteSymbol,
        available: quoteAvailableAfter,
        locked: quoteLockedAfter,
        reward: toNumber(quoteWallet.reward_earned_usd, 0),
      });

      const baseWallet = ensureWalletDetailRow(userId, baseSymbol, nowIso);
      const baseAvailableBefore = toNumber(baseWallet.available_usd, 0);
      const baseAvailableAfter = toMoney(baseAvailableBefore + quantity);

      updateRows.push({
        symbol: baseSymbol,
        available: baseAvailableAfter,
        locked: toNumber(baseWallet.locked_usd, 0),
        reward: toNumber(baseWallet.reward_earned_usd, 0),
      });

      ledgerRows.push({
        ledgerType: "buy_debit",
        assetSymbol: quoteSymbol,
        amount: -consumeQuote,
        balanceBefore: toMoney(quoteAvailableBefore + quoteLockedBefore),
        balanceAfter: toMoney(quoteAvailableAfter + quoteLockedAfter),
        note: `Buy ${baseAsset}`,
      });

      if (quoteRefund > 0) {
        ledgerRows.push({
          ledgerType: "order_unlock",
          assetSymbol: quoteSymbol,
          amount: quoteRefund,
          balanceBefore: quoteAvailableBefore,
          balanceAfter: quoteAvailableAfter,
          note: "Buy order lock remainder released",
        });
      }

      ledgerRows.push({
        ledgerType: "buy_credit",
        assetSymbol: baseSymbol,
        amount: quantity,
        balanceBefore: baseAvailableBefore,
        balanceAfter: baseAvailableAfter,
        note: `Buy fill ${baseAsset}`,
      });

      if (feeAmount > 0) {
        ledgerRows.push({
          ledgerType: "fee_debit",
          assetSymbol: quoteSymbol,
          amount: -feeAmount,
          balanceBefore: toMoney(quoteAvailableBefore + quoteLockedBefore),
          balanceAfter: toMoney(quoteAvailableAfter + quoteLockedAfter),
          note: `Trade fee ${quoteAsset}`,
        });
      }
    } else {
      const baseWallet = ensureWalletDetailRow(userId, baseSymbol, nowIso);
      const baseLockedBefore = toNumber(baseWallet.locked_usd, 0);
      const baseAvailableBefore = toNumber(baseWallet.available_usd, 0);
      if (baseLockedBefore < lockAmount) {
        throw new Error("Locked base balance mismatch.");
      }

      const baseLockedAfter = toMoney(baseLockedBefore - lockAmount);
      updateRows.push({
        symbol: baseSymbol,
        available: baseAvailableBefore,
        locked: baseLockedAfter,
        reward: toNumber(baseWallet.reward_earned_usd, 0),
      });

      const quoteWallet = ensureWalletDetailRow(userId, quoteSymbol, nowIso);
      const quoteAvailableBefore = toNumber(quoteWallet.available_usd, 0);
      const receiveQuote = toMoney(quoteTotal - feeAmount);
      const quoteAvailableAfter = toMoney(quoteAvailableBefore + receiveQuote);

      updateRows.push({
        symbol: quoteSymbol,
        available: quoteAvailableAfter,
        locked: toNumber(quoteWallet.locked_usd, 0),
        reward: toNumber(quoteWallet.reward_earned_usd, 0),
      });

      ledgerRows.push({
        ledgerType: "sell_debit",
        assetSymbol: baseSymbol,
        amount: -quantity,
        balanceBefore: toMoney(baseAvailableBefore + baseLockedBefore),
        balanceAfter: toMoney(baseAvailableBefore + baseLockedAfter),
        note: `Sell ${baseAsset}`,
      });

      ledgerRows.push({
        ledgerType: "sell_credit",
        assetSymbol: quoteSymbol,
        amount: toMoney(quoteTotal),
        balanceBefore: quoteAvailableBefore,
        balanceAfter: toMoney(quoteAvailableBefore + quoteTotal),
        note: `Sell receive ${quoteAsset}`,
      });

      if (feeAmount > 0) {
        ledgerRows.push({
          ledgerType: "fee_debit",
          assetSymbol: quoteSymbol,
          amount: -feeAmount,
          balanceBefore: toMoney(quoteAvailableBefore + quoteTotal),
          balanceAfter: quoteAvailableAfter,
          note: `Trade fee ${quoteAsset}`,
        });
      }
    }

    for (const row of updateRows) {
      saveWalletDetail({
        userId,
        assetSymbol: row.symbol,
        availableUsd: row.available,
        lockedUsd: row.locked,
        rewardEarnedUsd: row.reward,
        updatedAt: nowIso,
      });
      syncWalletSummaryFromDetail({ userId, assetSymbol: row.symbol, updatedAt: nowIso });
    }

    updateSpotOrderFillStatement.run({
      id: orderRow.id,
      filledQuantity: quantity,
      avgFillPrice: toMoney(executionPrice),
      quoteAmount: quoteTotal,
      feeAmount,
      feeAsset: quoteAsset,
      status: "filled",
      lockedAmount: 0,
      note: sanitizeShortText(note || orderRow.note || "", 300),
      updatedAt: nowIso,
      filledAt: nowIso,
    });

    insertSpotTradeStatement.run({
      tradeRef: buildSpotTradeRef(),
      orderId: orderRow.id,
      userId,
      pairId: orderRow.pair_id,
      pairCodeSnapshot: normalizeUpper(orderRow.pair_code_snapshot || ""),
      side,
      executionPrice: toMoney(executionPrice),
      executionQuantity: quantity,
      quoteTotal,
      feeAmount,
      feeAsset: quoteAsset,
      createdAt: nowIso,
    });

    const tradeRow = db.prepare(`SELECT * FROM spot_trades WHERE order_id = ? ORDER BY id DESC LIMIT 1`).get(orderRow.id);

    for (const entry of ledgerRows) {
      createWalletLedgerEntry({
        scope: "spot",
        userId,
        orderId: orderRow.id,
        tradeId: tradeRow?.id || null,
        ledgerType: entry.ledgerType,
        assetSymbol: entry.assetSymbol,
        amount: entry.amount,
        balanceBefore: entry.balanceBefore,
        balanceAfter: entry.balanceAfter,
        note: entry.note,
        createdAt: nowIso,
        createdBy: filledBy,
      });
    }

    pushTick({
      pairId: orderRow.pair_id,
      price: executionPrice,
      sourceType: "internal_feed",
      atIso: nowIso,
    });

    return {
      order: toSpotOrderPayload(findSpotOrderByIdStatement.get(orderRow.id)),
      trade: toSpotTradePayload(tradeRow),
    };
  }

  function placeSpotOrder({ req, pairRow, side, orderType, quantity, price, note = "" }) {
    const settings = getEngineSettings();
    const validated = validateSpotOrderRequest({
      req,
      settings,
      pairRow,
      side,
      orderType,
      quantity,
      price,
    });

    const userId = req.currentUser.userId;
    const nowIso = toIso(getNow());

    const tx = db.transaction(() => {
      const lockWallet = ensureWalletDetailRow(userId, validated.lockAssetSymbol, nowIso);
      const lockAssetSymbol = normalizeWalletSymbol(lockWallet.asset_symbol || validated.lockAssetSymbol, validated.lockAssetSymbol);
      const availableBefore = toNumber(lockWallet.available_usd, 0);
      const lockedBefore = toNumber(lockWallet.locked_usd, 0);

      if (availableBefore < validated.lockAmount) {
        throw new Error("Insufficient balance for this order.");
      }

      const nextAvailable = toMoney(availableBefore - validated.lockAmount);
      const nextLocked = toMoney(lockedBefore + validated.lockAmount);

      saveWalletDetail({
        userId,
        assetSymbol: lockAssetSymbol,
        availableUsd: nextAvailable,
        lockedUsd: nextLocked,
        rewardEarnedUsd: toNumber(lockWallet.reward_earned_usd, 0),
        updatedAt: nowIso,
      });
      syncWalletSummaryFromDetail({ userId, assetSymbol: lockAssetSymbol, updatedAt: nowIso });

      const orderRef = buildSpotOrderRef();
      insertSpotOrderStatement.run({
        orderRef,
        userId,
        pairId: toNumber(pairRow.id, 0),
        pairCodeSnapshot: normalizeUpper(pairRow.pair_code || ""),
        pairDisplayNameSnapshot: sanitizeShortText(pairRow.display_name || "", 120),
        baseAssetSnapshot: validated.baseAsset,
        quoteAssetSnapshot: validated.quoteAsset,
        side,
        orderType,
        price: orderType === "limit" ? validated.executionPrice : null,
        quantity: validated.quantity,
        filledQuantity: 0,
        avgFillPrice: null,
        quoteAmount: null,
        feeAmount: 0,
        feeAsset: null,
        status: "open",
        lockedAssetSymbol: lockAssetSymbol,
        lockedAmount: validated.lockAmount,
        note: sanitizeShortText(note, 300),
        createdAt: nowIso,
        updatedAt: nowIso,
        filledAt: null,
        cancelledAt: null,
      });

      const created = db.prepare(`SELECT * FROM spot_orders WHERE order_ref = ? LIMIT 1`).get(orderRef);

      createWalletLedgerEntry({
        scope: "spot",
        userId,
        orderId: created.id,
        ledgerType: "order_lock",
        assetSymbol: lockAssetSymbol,
        amount: -validated.lockAmount,
        balanceBefore: availableBefore,
        balanceAfter: nextAvailable,
        note: `${side.toUpperCase()} ${orderType.toUpperCase()} order lock`,
        createdAt: nowIso,
        createdBy: userId,
      });

      if (orderType === "market") {
        const fill = settleSpotOrderFill({
          orderRow: created,
          pairRow,
          executionPrice: validated.executionPrice,
          feePercent: validated.feePercent,
          filledBy: userId,
          note: sanitizeShortText(note || "Market order auto-filled", 300),
        });

        return {
          order: fill.order,
          trade: fill.trade,
          autoFilled: true,
        };
      }

      return {
        order: toSpotOrderPayload(created),
        trade: null,
        autoFilled: false,
      };
    });

    return tx();
  }

  function cancelSpotOrder({ orderRow, cancelledBy = "system", note = "" }) {
    const nowIso = toIso(getNow());
    const status = normalizeOrderStatus(orderRow.status || "open");
    if (status !== "open" && status !== "partially_filled") {
      throw new Error("Only open or partially filled orders can be cancelled.");
    }

    const userId = orderRow.user_id;
    const lockSymbol = normalizeWalletSymbol(orderRow.locked_asset_symbol || "SPOT_USDT", "SPOT_USDT");
    const lockAmount = toMoney(toNumber(orderRow.locked_amount, 0));

    const tx = db.transaction(() => {
      if (lockAmount > 0) {
        const wallet = ensureWalletDetailRow(userId, lockSymbol, nowIso);
        const availableBefore = toNumber(wallet.available_usd, 0);
        const lockedBefore = toNumber(wallet.locked_usd, 0);
        if (lockedBefore < lockAmount) {
          throw new Error("Locked balance mismatch.");
        }

        const availableAfter = toMoney(availableBefore + lockAmount);
        const lockedAfter = toMoney(lockedBefore - lockAmount);

        saveWalletDetail({
          userId,
          assetSymbol: lockSymbol,
          availableUsd: availableAfter,
          lockedUsd: lockedAfter,
          rewardEarnedUsd: toNumber(wallet.reward_earned_usd, 0),
          updatedAt: nowIso,
        });
        syncWalletSummaryFromDetail({ userId, assetSymbol: lockSymbol, updatedAt: nowIso });

        createWalletLedgerEntry({
          scope: "spot",
          userId,
          orderId: orderRow.id,
          ledgerType: "order_unlock",
          assetSymbol: lockSymbol,
          amount: lockAmount,
          balanceBefore: availableBefore,
          balanceAfter: availableAfter,
          note: sanitizeShortText(note || "Order cancelled and lock released", 280),
          createdAt: nowIso,
          createdBy: cancelledBy,
        });
      }

      updateSpotOrderCancelStatement.run({
        id: orderRow.id,
        status: "cancelled",
        note: sanitizeShortText(note || orderRow.note || "", 300),
        updatedAt: nowIso,
        cancelledAt: nowIso,
        lockedAmount: 0,
      });

      return toSpotOrderPayload(findSpotOrderByIdStatement.get(orderRow.id));
    });

    return tx();
  }

  function parseConvertPairInput(raw = {}, existing = null) {
    const fromAsset = normalizeAssetCode(raw.fromAsset ?? raw.from_asset ?? existing?.from_asset ?? "");
    const toAsset = normalizeAssetCode(raw.toAsset ?? raw.to_asset ?? existing?.to_asset ?? "");
    if (!fromAsset || !toAsset) {
      throw new Error("From and To assets are required.");
    }
    if (fromAsset === toAsset) {
      throw new Error("From and To assets cannot be same.");
    }

    const defaultCode = `${fromAsset}_${toAsset}`;
    const pairCode = normalizeUpper(raw.pairCode ?? raw.pair_code ?? existing?.pair_code ?? defaultCode).replace(/[^A-Z0-9_]/g, "").slice(0, 64);
    if (!pairCode) {
      throw new Error("Valid pairCode is required.");
    }

    const displayName = sanitizeShortText(raw.displayName ?? raw.display_name ?? existing?.display_name ?? `${fromAsset} to ${toAsset}`, 120);
    const rateSourceType = normalizeRateSourceType(raw.rateSourceType ?? raw.rate_source_type ?? existing?.rate_source_type ?? "internal_feed");
    const sourceSymbol = normalizeUpper(raw.sourceSymbol ?? raw.source_symbol ?? existing?.source_symbol ?? "").replace(/[^A-Z0-9_]/g, "").slice(0, 32);
    const minAmountUsd = Math.max(0, toNumber(raw.minAmountUsd ?? raw.min_amount_usd ?? existing?.min_amount_usd, 1));
    const maxAmountUsd = Math.max(minAmountUsd, toNumber(raw.maxAmountUsd ?? raw.max_amount_usd ?? existing?.max_amount_usd, 100000));
    const feePercent = Math.max(0, toNumber(raw.feePercent ?? raw.fee_percent ?? existing?.fee_percent, 0.1));
    const spreadPercent = Math.max(0, toNumber(raw.spreadPercent ?? raw.spread_percent ?? existing?.spread_percent, 0.1));
    const fixedFeeUsd = Math.max(0, toNumber(raw.fixedFeeUsd ?? raw.fixed_fee_usd ?? existing?.fixed_fee_usd, 0));
    const manualRateRaw = raw.manualRate ?? raw.manual_rate ?? existing?.manual_rate;
    const manualRate =
      manualRateRaw === null || manualRateRaw === undefined || manualRateRaw === ""
        ? null
        : Math.max(0, toNumber(manualRateRaw, 0));
    const isEnabled = normalizeBooleanNumber(raw.isEnabled ?? raw.is_enabled ?? existing?.is_enabled, 1);
    const displaySortOrder = Math.max(0, Math.floor(toNumber(raw.displaySortOrder ?? raw.display_sort_order ?? existing?.display_sort_order, 0)));

    return {
      pairCode,
      displayName,
      fromAsset,
      toAsset,
      rateSourceType,
      sourceSymbol,
      minAmountUsd,
      maxAmountUsd,
      feePercent,
      spreadPercent,
      fixedFeeUsd,
      manualRate,
      isEnabled,
      displaySortOrder,
    };
  }

  function parseSpotPairInput(raw = {}, existing = null, settings = getEngineSettings()) {
    const baseAsset = normalizeAssetCode(raw.baseAsset ?? raw.base_asset ?? existing?.base_asset ?? "");
    const quoteAsset = normalizeAssetCode(raw.quoteAsset ?? raw.quote_asset ?? existing?.quote_asset ?? "USDT");
    if (!baseAsset || !quoteAsset) {
      throw new Error("Base and Quote assets are required.");
    }
    if (baseAsset === quoteAsset) {
      throw new Error("Base and Quote cannot be same.");
    }

    const defaultPairCode = `${baseAsset}${quoteAsset}`;
    const pairCode = normalizeUpper(raw.pairCode ?? raw.pair_code ?? existing?.pair_code ?? defaultPairCode).replace(/[^A-Z0-9]/g, "").slice(0, 40);
    if (!pairCode) {
      throw new Error("Valid pairCode is required.");
    }

    const displayName = sanitizeShortText(raw.displayName ?? raw.display_name ?? existing?.display_name ?? `${baseAsset}/${quoteAsset}`, 120);
    const priceSourceType = normalizeRateSourceType(raw.priceSourceType ?? raw.price_source_type ?? existing?.price_source_type ?? "internal_feed");
    const sourceSymbol = normalizeUpper(raw.sourceSymbol ?? raw.source_symbol ?? existing?.source_symbol ?? pairCode).replace(/[^A-Z0-9_]/g, "").slice(0, 32);
    const pricePrecision = Math.max(0, Math.min(12, Math.floor(toNumber(raw.pricePrecision ?? raw.price_precision ?? existing?.price_precision, 4))));
    const quantityPrecision = Math.max(0, Math.min(12, Math.floor(toNumber(raw.quantityPrecision ?? raw.quantity_precision ?? existing?.quantity_precision, 6))));
    const minOrderSize = Math.max(0.00000001, toNumber(raw.minOrderSize ?? raw.min_order_size ?? existing?.min_order_size, settings.defaultMinOrderSize));
    const maxOrderSize = Math.max(minOrderSize, toNumber(raw.maxOrderSize ?? raw.max_order_size ?? existing?.max_order_size, settings.defaultMaxOrderSize));
    const makerFeePercent = Math.max(0, toNumber(raw.makerFeePercent ?? raw.maker_fee_percent ?? existing?.maker_fee_percent, settings.defaultMakerFeePercent));
    const takerFeePercent = Math.max(0, toNumber(raw.takerFeePercent ?? raw.taker_fee_percent ?? existing?.taker_fee_percent, settings.defaultTakerFeePercent));
    const currentPrice = Math.max(0, toNumber(raw.currentPrice ?? raw.current_price ?? existing?.current_price, pickSeedPrice(pairCode)));
    const previousPrice = Math.max(0, toNumber(raw.previousPrice ?? raw.previous_price ?? existing?.previous_price, currentPrice));
    const isEnabled = normalizeBooleanNumber(raw.isEnabled ?? raw.is_enabled ?? existing?.is_enabled, 1);
    const isFeatured = normalizeBooleanNumber(raw.isFeatured ?? raw.is_featured ?? existing?.is_featured, 0);
    const displaySortOrder = Math.max(0, Math.floor(toNumber(raw.displaySortOrder ?? raw.display_sort_order ?? existing?.display_sort_order, 0)));

    return {
      pairCode,
      displayName,
      baseAsset,
      quoteAsset,
      priceSourceType,
      sourceSymbol,
      currentPrice: toMoney(currentPrice),
      previousPrice: toMoney(previousPrice),
      pricePrecision,
      quantityPrecision,
      minOrderSize,
      maxOrderSize,
      makerFeePercent,
      takerFeePercent,
      isEnabled,
      isFeatured,
      displaySortOrder,
    };
  }

  function buildMarketSummary(pairRow) {
    const payload = toSpotPairPayload(pairRow);
    if (!payload) {
      return null;
    }

    const recentTrades = listRecentSpotTradesByPairStatement
      .all({ pairId: payload.pairId, limit: 60 })
      .map((row) => toSpotTradePayload(row))
      .filter(Boolean);

    const volumeBase = recentTrades.reduce((sum, trade) => sum + toNumber(trade.executionQuantity, 0), 0);
    const volumeQuote = recentTrades.reduce((sum, trade) => sum + toNumber(trade.quoteTotal, 0), 0);

    return {
      ...payload,
      volumeBase: toMoney(volumeBase),
      volumeQuote: toMoney(volumeQuote),
      tradeCount24h: recentTrades.length,
    };
  }

  function buildDashboardSummary() {
    const convertSummary = db
      .prepare(
        `SELECT
           COUNT(*) AS total_orders,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_orders,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_orders,
           SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
           COALESCE(SUM(CASE WHEN status = 'completed' THEN from_amount ELSE 0 END), 0) AS total_volume,
           COALESCE(SUM(CASE WHEN status = 'completed' THEN fee_amount ELSE 0 END), 0) AS total_fee
         FROM convert_orders`,
      )
      .get();

    const spotSummary = db
      .prepare(
        `SELECT
           COUNT(*) AS total_orders,
           SUM(CASE WHEN status IN ('open','partially_filled') THEN 1 ELSE 0 END) AS open_orders,
           SUM(CASE WHEN status = 'filled' THEN 1 ELSE 0 END) AS filled_orders,
           SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
           SUM(CASE WHEN status IN ('error','rejected') THEN 1 ELSE 0 END) AS failed_orders,
           COALESCE(SUM(CASE WHEN status = 'filled' THEN quote_amount ELSE 0 END), 0) AS total_volume,
           COALESCE(SUM(CASE WHEN status = 'filled' THEN fee_amount ELSE 0 END), 0) AS total_fee
         FROM spot_orders`,
      )
      .get();

    const pairSummary = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM convert_pairs) AS total_convert_pairs,
           (SELECT COUNT(*) FROM convert_pairs WHERE is_enabled = 1) AS enabled_convert_pairs,
           (SELECT COUNT(*) FROM spot_pairs) AS total_spot_pairs,
           (SELECT COUNT(*) FROM spot_pairs WHERE is_enabled = 1) AS enabled_spot_pairs`,
      )
      .get();

    const topPairs = db
      .prepare(
        `SELECT pair_code_snapshot AS pair_code, COUNT(*) AS trades, COALESCE(SUM(quote_total), 0) AS volume
         FROM spot_trades
         GROUP BY pair_code_snapshot
         ORDER BY volume DESC, trades DESC
         LIMIT 8`,
      )
      .all()
      .map((row) => ({
        pairCode: normalizeUpper(row.pair_code || ""),
        trades: toNumber(row.trades, 0),
        volume: toMoney(row.volume),
      }));

    const topUsers = db
      .prepare(
        `SELECT user_id, COUNT(*) AS orders, COALESCE(SUM(quote_amount), 0) AS volume
         FROM spot_orders
         WHERE status = 'filled'
         GROUP BY user_id
         ORDER BY volume DESC, orders DESC
         LIMIT 8`,
      )
      .all()
      .map((row) => ({
        userId: row.user_id || "",
        orders: toNumber(row.orders, 0),
        volume: toMoney(row.volume),
      }));

    return {
      totalConvertPairs: toNumber(pairSummary?.total_convert_pairs, 0),
      enabledConvertPairs: toNumber(pairSummary?.enabled_convert_pairs, 0),
      totalSpotPairs: toNumber(pairSummary?.total_spot_pairs, 0),
      enabledSpotPairs: toNumber(pairSummary?.enabled_spot_pairs, 0),
      totalConvertOrders: toNumber(convertSummary?.total_orders, 0),
      completedConvertOrders: toNumber(convertSummary?.completed_orders, 0),
      failedConvertOrders: toNumber(convertSummary?.failed_orders, 0),
      cancelledConvertOrders: toNumber(convertSummary?.cancelled_orders, 0),
      totalConvertVolume: toMoney(convertSummary?.total_volume || 0),
      totalConvertFee: toMoney(convertSummary?.total_fee || 0),
      totalSpotOrders: toNumber(spotSummary?.total_orders, 0),
      openSpotOrders: toNumber(spotSummary?.open_orders, 0),
      filledSpotOrders: toNumber(spotSummary?.filled_orders, 0),
      cancelledSpotOrders: toNumber(spotSummary?.cancelled_orders, 0),
      failedSpotOrders: toNumber(spotSummary?.failed_orders, 0),
      totalSpotVolume: toMoney(spotSummary?.total_volume || 0),
      totalSpotFee: toMoney(spotSummary?.total_fee || 0),
      topPairs,
      topUsers,
    };
  }

  function handleTransactionConvertPairsList(req, res) {
    try {
      const settings = getEngineSettings();
      assertUserTransactionAccess({ req, settings, submodule: "convert", amountUsd: 0 });

      const pairs = listEnabledConvertPairsStatement
        .all()
        .map((row) => toConvertPairPayload(row))
        .filter(Boolean);

      res.json({
        pairs,
        settings,
        wallet: buildWalletSnapshot(req.currentUser.userId),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load convert pairs." });
    }
  }

  function handleTransactionConvertQuote(req, res) {
    try {
      const settings = getEngineSettings();
      const pairId = toNumber(req.body?.pairId ?? req.query?.pairId, 0);
      const amount = req.body?.amount ?? req.query?.amount;
      const pairRow = findConvertPairByIdStatement.get(pairId);
      if (!pairRow) {
        throw new Error("Convert pair not found.");
      }

      const quote = resolveConvertQuote({ pairRow, amount, settings });
      assertUserTransactionAccess({ req, settings, submodule: "convert", amountUsd: quote.amountUsdEquivalent });

      res.json({
        quote: {
          pairId: quote.pair.pairId,
          pairCode: quote.pair.pairCode,
          fromAsset: quote.fromAsset,
          toAsset: quote.toAsset,
          fromAmount: quote.fromAmount,
          amountUsdEquivalent: quote.amountUsdEquivalent,
          rawRate: quote.rawRate,
          appliedRate: quote.appliedRate,
          spreadPercent: quote.spreadPercent,
          feePercent: quote.feePercent,
          fixedFeeUsd: quote.fixedFee,
          grossReceive: quote.grossReceive,
          feeAmount: quote.feeAmount,
          receiveAmount: quote.receiveAmount,
        },
        wallet: buildWalletSnapshot(req.currentUser.userId),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not generate convert quote." });
    }
  }

  function handleTransactionConvertSubmit(req, res) {
    try {
      const pairId = toNumber(req.body?.pairId, 0);
      const amount = req.body?.amount;
      const note = sanitizeShortText(req.body?.note || "", 280);

      const pairRow = findConvertPairByIdStatement.get(pairId);
      if (!pairRow) {
        throw new Error("Convert pair not found.");
      }

      const result = createConvertOrderForUser({ req, pairRow, amount, note });

      res.json({
        message: "Conversion completed successfully.",
        order: result.order,
        quote: {
          rawRate: result.quote.rawRate,
          appliedRate: result.quote.appliedRate,
          feeAmount: result.quote.feeAmount,
          receiveAmount: result.quote.receiveAmount,
          fromAmount: result.quote.fromAmount,
        },
        wallet: buildWalletSnapshot(req.currentUser.userId),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Conversion failed." });
    }
  }

  function handleTransactionConvertHistory(req, res) {
    try {
      const userId = req.currentUser.userId;
      const statusFilter = normalizeLower(req.query?.status || req.body?.status || "all");
      const pairCode = normalizeUpper(req.query?.pairCode || req.body?.pairCode || "");
      const { page, limit, offset } = buildPagination(req.query?.page || req.body?.page, req.query?.limit || req.body?.limit, 30, 150);

      const orders = listConvertOrdersByUserStatement
        .all({ userId, statusFilter, pairCode, limit, offset })
        .map((row) => toConvertOrderPayload(row))
        .filter(Boolean);

      const total = toNumber(countConvertOrdersByUserStatement.get({ userId, statusFilter, pairCode })?.total, 0);

      res.json({
        orders,
        pagination: { page, limit, total },
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load convert history." });
    }
  }

  function handleTransactionSpotPairsList(req, res) {
    try {
      const settings = getEngineSettings();
      assertUserTransactionAccess({ req, settings, submodule: "spot", amountUsd: 0 });

      const pairs = listEnabledSpotPairsStatement
        .all()
        .map((row) => toSpotPairPayload(row))
        .filter(Boolean);

      res.json({
        pairs,
        settings,
        wallet: buildWalletSnapshot(req.currentUser.userId),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load spot pairs." });
    }
  }

  function handleTransactionSpotMarketSummary(req, res) {
    try {
      const pairId = toNumber(req.query?.pairId || req.body?.pairId, 0);
      const row = findSpotPairByIdStatement.get(pairId);
      if (!row || normalizeBooleanNumber(row.is_enabled, 0) !== 1) {
        throw new Error("Pair not found.");
      }

      const summary = buildMarketSummary(row);
      res.json({ summary });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load market summary." });
    }
  }

  function handleTransactionSpotTicks(req, res) {
    try {
      const pairId = toNumber(req.query?.pairId || req.body?.pairId, 0);
      const limit = Math.max(1, Math.min(500, Math.floor(toNumber(req.query?.limit || req.body?.limit, 120))));
      const row = findSpotPairByIdStatement.get(pairId);
      if (!row || normalizeBooleanNumber(row.is_enabled, 0) !== 1) {
        throw new Error("Pair not found.");
      }

      const ticks = listSpotTicksByPairStatement
        .all({ pairId, limit })
        .map((item) => toTickPayload(item))
        .filter(Boolean)
        .reverse();

      res.json({ ticks });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load ticks." });
    }
  }

  function handleTransactionSpotRecentTrades(req, res) {
    try {
      const pairId = toNumber(req.query?.pairId || req.body?.pairId, 0);
      const limit = Math.max(1, Math.min(200, Math.floor(toNumber(req.query?.limit || req.body?.limit, 60))));
      const row = findSpotPairByIdStatement.get(pairId);
      if (!row || normalizeBooleanNumber(row.is_enabled, 0) !== 1) {
        throw new Error("Pair not found.");
      }

      const trades = listRecentSpotTradesByPairStatement
        .all({ pairId, limit })
        .map((item) => toSpotTradePayload(item))
        .filter(Boolean);

      res.json({ trades });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load recent trades." });
    }
  }

  function handleTransactionSpotOrderPlace(req, res) {
    try {
      const pairId = toNumber(req.body?.pairId, 0);
      const side = normalizeOrderSide(req.body?.side || "");
      const orderType = normalizeOrderType(req.body?.orderType || req.body?.order_type || "");
      const quantity = req.body?.quantity;
      const price = req.body?.price;
      const note = sanitizeShortText(req.body?.note || "", 280);

      const pairRow = findSpotPairByIdStatement.get(pairId);
      if (!pairRow) {
        throw new Error("Pair not found.");
      }

      const placed = placeSpotOrder({
        req,
        pairRow,
        side,
        orderType,
        quantity,
        price,
        note,
      });

      res.json({
        message: placed.autoFilled ? "Market order executed successfully." : "Order placed successfully.",
        order: placed.order,
        trade: placed.trade,
        wallet: buildWalletSnapshot(req.currentUser.userId),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not place spot order." });
    }
  }

  function handleTransactionSpotOrdersOpen(req, res) {
    try {
      const userId = req.currentUser.userId;
      const pairId = Math.max(0, Math.floor(toNumber(req.query?.pairId || req.body?.pairId, 0)));
      const { page, limit, offset } = buildPagination(req.query?.page || req.body?.page, req.query?.limit || req.body?.limit, 30, 150);

      const orders = listOpenSpotOrdersByUserStatement
        .all({ userId, pairId, limit, offset })
        .map((row) => toSpotOrderPayload(row))
        .filter(Boolean);

      const total = toNumber(countOpenSpotOrdersByUserStatement.get({ userId, pairId })?.total, 0);

      res.json({
        orders,
        pagination: { page, limit, total },
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load open orders." });
    }
  }

  function handleTransactionSpotOrdersHistory(req, res) {
    try {
      const userId = req.currentUser.userId;
      const pairId = Math.max(0, Math.floor(toNumber(req.query?.pairId || req.body?.pairId, 0)));
      const statusFilter = normalizeLower(req.query?.status || req.body?.status || "all");
      const { page, limit, offset } = buildPagination(req.query?.page || req.body?.page, req.query?.limit || req.body?.limit, 40, 200);

      const orders = listSpotOrderHistoryByUserStatement
        .all({ userId, pairId, statusFilter, limit, offset })
        .map((row) => toSpotOrderPayload(row))
        .filter(Boolean);

      const total = toNumber(countSpotOrderHistoryByUserStatement.get({ userId, pairId, statusFilter })?.total, 0);

      res.json({
        orders,
        pagination: { page, limit, total },
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load order history." });
    }
  }

  function handleTransactionSpotOrderCancel(req, res) {
    try {
      const orderId = toNumber(req.body?.orderId || req.body?.id || req.query?.orderId || req.query?.id, 0);
      if (orderId <= 0) {
        throw new Error("Valid orderId is required.");
      }

      const orderRow = findSpotOrderByIdStatement.get(orderId);
      if (!orderRow) {
        throw new Error("Order not found.");
      }
      if (orderRow.user_id !== req.currentUser.userId) {
        throw new Error("You can cancel only your own orders.");
      }

      const cancelled = cancelSpotOrder({ orderRow, cancelledBy: req.currentUser.userId, note: req.body?.note || "" });

      res.json({
        message: "Order cancelled successfully.",
        order: cancelled,
        wallet: buildWalletSnapshot(req.currentUser.userId),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not cancel order." });
    }
  }

  function handleTransactionSpotOrderbook(req, res) {
    try {
      const pairId = toNumber(req.query?.pairId || req.body?.pairId, 0);
      const row = findSpotPairByIdStatement.get(pairId);
      if (!row) {
        throw new Error("Pair not found.");
      }

      const openOrders = db
        .prepare(
          `SELECT side, price, SUM(quantity - filled_quantity) AS remaining_quantity
           FROM spot_orders
           WHERE pair_id = ?
             AND status IN ('open','partially_filled')
             AND order_type = 'limit'
           GROUP BY side, price
           ORDER BY price DESC`,
        )
        .all(pairId);

      const bids = [];
      const asks = [];
      for (const order of openOrders) {
        const rowPayload = {
          price: toNumber(order.price, 0),
          quantity: toMoney(order.remaining_quantity || 0),
        };
        if (normalizeLower(order.side) === "buy") {
          bids.push(rowPayload);
        } else {
          asks.push(rowPayload);
        }
      }

      asks.sort((a, b) => a.price - b.price);
      bids.sort((a, b) => b.price - a.price);

      res.json({ orderbook: { bids: bids.slice(0, 60), asks: asks.slice(0, 60) } });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load orderbook." });
    }
  }

  function handleAdminTransactionDashboardSummary(_req, res) {
    try {
      res.json({
        summary: buildDashboardSummary(),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load transaction summary." });
    }
  }

  function handleAdminTransactionEngineSettingsGet(_req, res) {
    try {
      res.json({
        settings: getEngineSettings(),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load transaction settings." });
    }
  }
  function handleAdminTransactionEngineSettingsSave(req, res) {
    try {
      const current = getEngineSettings();
      const nowIso = toIso(getNow());

      const payload = {
        transactionModuleEnabled: normalizeBooleanNumber(req.body?.transactionModuleEnabled ?? req.body?.transaction_module_enabled, current.transactionModuleEnabled ? 1 : 0),
        convertEnabled: normalizeBooleanNumber(req.body?.convertEnabled ?? req.body?.convert_enabled, current.convertEnabled ? 1 : 0),
        spotEnabled: normalizeBooleanNumber(req.body?.spotEnabled ?? req.body?.spot_enabled, current.spotEnabled ? 1 : 0),
        maintenanceModeEnabled: normalizeBooleanNumber(req.body?.maintenanceModeEnabled ?? req.body?.maintenance_mode_enabled, current.maintenanceModeEnabled ? 1 : 0),
        maintenanceMessage: sanitizeShortText(req.body?.maintenanceMessage ?? req.body?.maintenance_message ?? current.maintenanceMessage, 260),
        emergencyFreezeEnabled: normalizeBooleanNumber(req.body?.emergencyFreezeEnabled ?? req.body?.emergency_freeze_enabled, current.emergencyFreezeEnabled ? 1 : 0),
        defaultConvertFeePercent: Math.max(0, toNumber(req.body?.defaultConvertFeePercent ?? req.body?.default_convert_fee_percent, current.defaultConvertFeePercent)),
        defaultConvertSpreadPercent: Math.max(0, toNumber(req.body?.defaultConvertSpreadPercent ?? req.body?.default_convert_spread_percent, current.defaultConvertSpreadPercent)),
        defaultFixedConvertFeeUsd: Math.max(0, toNumber(req.body?.defaultFixedConvertFeeUsd ?? req.body?.default_fixed_convert_fee_usd, current.defaultFixedConvertFeeUsd)),
        defaultMakerFeePercent: Math.max(0, toNumber(req.body?.defaultMakerFeePercent ?? req.body?.default_maker_fee_percent, current.defaultMakerFeePercent)),
        defaultTakerFeePercent: Math.max(0, toNumber(req.body?.defaultTakerFeePercent ?? req.body?.default_taker_fee_percent, current.defaultTakerFeePercent)),
        defaultMinOrderSize: Math.max(0.00000001, toNumber(req.body?.defaultMinOrderSize ?? req.body?.default_min_order_size, current.defaultMinOrderSize)),
        defaultMaxOrderSize: Math.max(
          0.00000001,
          toNumber(req.body?.defaultMaxOrderSize ?? req.body?.default_max_order_size, current.defaultMaxOrderSize),
        ),
        manualRateModeEnabled: normalizeBooleanNumber(req.body?.manualRateModeEnabled ?? req.body?.manual_rate_mode_enabled, current.manualRateModeEnabled ? 1 : 0),
        manualPriceModeEnabled: normalizeBooleanNumber(req.body?.manualPriceModeEnabled ?? req.body?.manual_price_mode_enabled, current.manualPriceModeEnabled ? 1 : 0),
        requireActiveAccountOnly: normalizeBooleanNumber(req.body?.requireActiveAccountOnly ?? req.body?.require_active_account_only, current.requireActiveAccountOnly ? 1 : 0),
        blockSuspendedUsers: normalizeBooleanNumber(req.body?.blockSuspendedUsers ?? req.body?.block_suspended_users, current.blockSuspendedUsers ? 1 : 0),
        blockBannedUsers: normalizeBooleanNumber(req.body?.blockBannedUsers ?? req.body?.block_banned_users, current.blockBannedUsers ? 1 : 0),
        kycRequiredAboveAmountUsd:
          req.body?.kycRequiredAboveAmountUsd === null || req.body?.kyc_required_above_amount_usd === null
            ? null
            : req.body?.kycRequiredAboveAmountUsd === undefined && req.body?.kyc_required_above_amount_usd === undefined
              ? current.kycRequiredAboveAmountUsd
              : Math.max(0, toNumber(req.body?.kycRequiredAboveAmountUsd ?? req.body?.kyc_required_above_amount_usd, 0)),
      };

      upsertEngineSettingsStatement.run({
        ...payload,
        updatedAt: nowIso,
        updatedBy: req.currentUser?.userId || "admin",
      });

      insertConvertAudit({
        adminUserId: req.currentUser?.userId || "admin",
        actionType: "engine_settings_save",
        targetType: "transaction_engine_settings",
        targetId: "1",
        note: "Transaction engine settings updated",
      });

      res.json({
        message: "Transaction settings saved successfully.",
        settings: getEngineSettings(),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not save transaction settings." });
    }
  }

  function handleAdminTransactionConvertPairsList(_req, res) {
    try {
      const pairs = listAllConvertPairsStatement.all().map((row) => toConvertPairPayload(row)).filter(Boolean);
      res.json({ pairs });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load convert pairs." });
    }
  }

  function handleAdminTransactionConvertPairCreate(req, res) {
    try {
      const nowIso = toIso(getNow());
      const payload = parseConvertPairInput(req.body || {}, null);
      if (findConvertPairByCodeStatement.get(payload.pairCode)) {
        throw new Error("Convert pair code already exists.");
      }

      insertConvertPairStatement.run({
        ...payload,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: req.currentUser?.userId || "admin",
        updatedBy: req.currentUser?.userId || "admin",
      });

      const created = findConvertPairByCodeStatement.get(payload.pairCode);
      insertConvertAudit({
        adminUserId: req.currentUser?.userId || "admin",
        actionType: "convert_pair_create",
        targetType: "convert_pair",
        targetId: String(created?.id || payload.pairCode),
        note: payload.displayName,
      });

      res.json({
        message: "Convert pair created successfully.",
        pair: toConvertPairPayload(created),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not create convert pair." });
    }
  }

  function handleAdminTransactionConvertPairUpdate(req, res) {
    try {
      const pairId = toNumber(req.body?.pairId ?? req.body?.id, 0);
      if (pairId <= 0) {
        throw new Error("Valid pairId is required.");
      }

      const existing = findConvertPairByIdStatement.get(pairId);
      if (!existing) {
        throw new Error("Convert pair not found.");
      }

      const nowIso = toIso(getNow());
      const payload = parseConvertPairInput(req.body || {}, existing);
      const duplicate = findConvertPairByCodeStatement.get(payload.pairCode);
      if (duplicate && toNumber(duplicate.id, 0) !== pairId) {
        throw new Error("Another pair already uses this pairCode.");
      }

      updateConvertPairStatement.run({
        ...payload,
        id: pairId,
        updatedAt: nowIso,
        updatedBy: req.currentUser?.userId || "admin",
      });

      const updated = findConvertPairByIdStatement.get(pairId);
      insertConvertAudit({
        adminUserId: req.currentUser?.userId || "admin",
        actionType: "convert_pair_update",
        targetType: "convert_pair",
        targetId: String(pairId),
        note: sanitizeShortText(req.body?.note || "", 280) || payload.displayName,
      });

      res.json({
        message: "Convert pair updated successfully.",
        pair: toConvertPairPayload(updated),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not update convert pair." });
    }
  }

  function handleAdminTransactionConvertPairDelete(req, res) {
    try {
      const pairId = toNumber(req.body?.pairId ?? req.body?.id, 0);
      if (pairId <= 0) {
        throw new Error("Valid pairId is required.");
      }

      const existing = findConvertPairByIdStatement.get(pairId);
      if (!existing) {
        throw new Error("Convert pair not found.");
      }

      const linkedOrders = toNumber(countConvertOrdersByPairStatement.get(pairId)?.total, 0);
      if (linkedOrders > 0) {
        throw new Error("Pair has historical orders. Disable it instead of deleting.");
      }

      deleteConvertPairStatement.run(pairId);
      insertConvertAudit({
        adminUserId: req.currentUser?.userId || "admin",
        actionType: "convert_pair_delete",
        targetType: "convert_pair",
        targetId: String(pairId),
        note: sanitizeShortText(req.body?.note || existing.display_name || "", 280),
      });

      res.json({
        message: "Convert pair deleted successfully.",
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not delete convert pair." });
    }
  }

  function handleAdminTransactionConvertPairToggleStatus(req, res) {
    try {
      const pairId = toNumber(req.body?.pairId ?? req.body?.id, 0);
      if (pairId <= 0) {
        throw new Error("Valid pairId is required.");
      }

      const existing = findConvertPairByIdStatement.get(pairId);
      if (!existing) {
        throw new Error("Convert pair not found.");
      }

      const isEnabled = normalizeBooleanNumber(req.body?.isEnabled ?? req.body?.is_enabled, normalizeBooleanNumber(existing.is_enabled, 1));
      const nowIso = toIso(getNow());

      updateConvertPairStatusStatement.run({
        id: pairId,
        isEnabled,
        updatedAt: nowIso,
        updatedBy: req.currentUser?.userId || "admin",
      });

      const updated = findConvertPairByIdStatement.get(pairId);
      insertConvertAudit({
        adminUserId: req.currentUser?.userId || "admin",
        actionType: "convert_pair_toggle_status",
        targetType: "convert_pair",
        targetId: String(pairId),
        note: `set is_enabled=${isEnabled}`,
      });

      res.json({
        message: "Convert pair status updated.",
        pair: toConvertPairPayload(updated),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not update convert pair status." });
    }
  }

  function handleAdminTransactionConvertOrdersList(req, res) {
    try {
      const statusFilter = normalizeLower(req.query?.status || req.body?.status || "all");
      const pairCode = normalizeUpper(req.query?.pairCode || req.body?.pairCode || "");
      const userKeyword = sanitizeShortText(req.query?.userKeyword || req.body?.userKeyword || "", 120);
      const fromDate = sanitizeShortText(req.query?.fromDate || req.body?.fromDate || "", 40);
      const toDate = sanitizeShortText(req.query?.toDate || req.body?.toDate || "", 40);
      const likeUserKeyword = userKeyword ? `%${userKeyword}%` : "";
      const { page, limit, offset } = buildPagination(req.query?.page || req.body?.page, req.query?.limit || req.body?.limit, 50, 300);

      const orders = listConvertOrdersForAdminStatement
        .all({ statusFilter, pairCode, userKeyword, likeUserKeyword, fromDate, toDate, limit, offset })
        .map((row) => toConvertOrderPayload(row))
        .filter(Boolean);

      const total = toNumber(
        countConvertOrdersForAdminStatement.get({ statusFilter, pairCode, userKeyword, likeUserKeyword, fromDate, toDate })?.total,
        0,
      );

      res.json({
        orders,
        pagination: { page, limit, total },
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load convert orders." });
    }
  }

  function handleAdminTransactionConvertManualRatePush(req, res) {
    try {
      const pairId = toNumber(req.body?.pairId ?? req.body?.id, 0);
      const manualRate = Math.max(0, toNumber(req.body?.manualRate ?? req.body?.manual_rate, 0));
      if (pairId <= 0 || manualRate <= 0) {
        throw new Error("Valid pairId and manualRate are required.");
      }

      const pair = findConvertPairByIdStatement.get(pairId);
      if (!pair) {
        throw new Error("Convert pair not found.");
      }

      const nowIso = toIso(getNow());
      updateConvertPairManualRateStatement.run({
        id: pairId,
        manualRate,
        updatedAt: nowIso,
        updatedBy: req.currentUser?.userId || "admin",
      });

      const updated = findConvertPairByIdStatement.get(pairId);
      insertConvertAudit({
        adminUserId: req.currentUser?.userId || "admin",
        actionType: "convert_manual_rate_push",
        targetType: "convert_pair",
        targetId: String(pairId),
        note: `manual_rate=${manualRate}`,
      });

      res.json({
        message: "Manual convert rate updated.",
        pair: toConvertPairPayload(updated),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not push manual rate." });
    }
  }

  function handleAdminTransactionSpotPairsList(_req, res) {
    try {
      const pairs = listAllSpotPairsStatement.all().map((row) => toSpotPairPayload(row)).filter(Boolean);
      res.json({ pairs });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load spot pairs." });
    }
  }

  function handleAdminTransactionSpotPairCreate(req, res) {
    try {
      const settings = getEngineSettings();
      const payload = parseSpotPairInput(req.body || {}, null, settings);
      if (findSpotPairByCodeStatement.get(payload.pairCode)) {
        throw new Error("Spot pair code already exists.");
      }

      const nowIso = toIso(getNow());
      insertSpotPairStatement.run({
        ...payload,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: req.currentUser?.userId || "admin",
        updatedBy: req.currentUser?.userId || "admin",
      });

      const created = findSpotPairByCodeStatement.get(payload.pairCode);
      if (created && payload.currentPrice > 0) {
        pushTick({
          pairId: created.id,
          price: payload.currentPrice,
          sourceType: payload.priceSourceType,
          atIso: nowIso,
        });
      }

      insertSpotAudit({
        adminUserId: req.currentUser?.userId || "admin",
        actionType: "spot_pair_create",
        targetType: "spot_pair",
        targetId: String(created?.id || payload.pairCode),
        note: payload.displayName,
      });

      res.json({
        message: "Spot pair created successfully.",
        pair: toSpotPairPayload(created),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not create spot pair." });
    }
  }

  function handleAdminTransactionSpotPairUpdate(req, res) {
    try {
      const pairId = toNumber(req.body?.pairId ?? req.body?.id, 0);
      if (pairId <= 0) {
        throw new Error("Valid pairId is required.");
      }

      const existing = findSpotPairByIdStatement.get(pairId);
      if (!existing) {
        throw new Error("Spot pair not found.");
      }

      const settings = getEngineSettings();
      const payload = parseSpotPairInput(req.body || {}, existing, settings);
      const duplicate = findSpotPairByCodeStatement.get(payload.pairCode);
      if (duplicate && toNumber(duplicate.id, 0) !== pairId) {
        throw new Error("Another pair already uses this pairCode.");
      }

      const nowIso = toIso(getNow());
      updateSpotPairStatement.run({
        ...payload,
        id: pairId,
        updatedAt: nowIso,
        updatedBy: req.currentUser?.userId || "admin",
      });

      if (req.body?.currentPrice !== undefined || req.body?.current_price !== undefined) {
        updateSpotPairPriceStatement.run({
          id: pairId,
          previousPrice: toMoney(existing.current_price || payload.currentPrice),
          currentPrice: payload.currentPrice,
          updatedAt: nowIso,
          updatedBy: req.currentUser?.userId || "admin",
        });
        pushTick({ pairId, price: payload.currentPrice, sourceType: payload.priceSourceType, atIso: nowIso });
      }

      const updated = findSpotPairByIdStatement.get(pairId);
      insertSpotAudit({
        adminUserId: req.currentUser?.userId || "admin",
        actionType: "spot_pair_update",
        targetType: "spot_pair",
        targetId: String(pairId),
        note: sanitizeShortText(req.body?.note || payload.displayName, 280),
      });

      res.json({
        message: "Spot pair updated successfully.",
        pair: toSpotPairPayload(updated),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not update spot pair." });
    }
  }

  function handleAdminTransactionSpotPairDelete(req, res) {
    try {
      const pairId = toNumber(req.body?.pairId ?? req.body?.id, 0);
      if (pairId <= 0) {
        throw new Error("Valid pairId is required.");
      }

      const existing = findSpotPairByIdStatement.get(pairId);
      if (!existing) {
        throw new Error("Spot pair not found.");
      }

      const linkedOrders = toNumber(countSpotOrdersByPairStatement.get(pairId)?.total, 0);
      if (linkedOrders > 0) {
        throw new Error("Pair has historical orders. Disable it instead of deleting.");
      }

      deleteSpotPairStatement.run(pairId);
      insertSpotAudit({
        adminUserId: req.currentUser?.userId || "admin",
        actionType: "spot_pair_delete",
        targetType: "spot_pair",
        targetId: String(pairId),
        note: sanitizeShortText(req.body?.note || existing.display_name || "", 280),
      });

      res.json({ message: "Spot pair deleted successfully." });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not delete spot pair." });
    }
  }

  function handleAdminTransactionSpotPairToggleStatus(req, res) {
    try {
      const pairId = toNumber(req.body?.pairId ?? req.body?.id, 0);
      if (pairId <= 0) {
        throw new Error("Valid pairId is required.");
      }

      const existing = findSpotPairByIdStatement.get(pairId);
      if (!existing) {
        throw new Error("Spot pair not found.");
      }

      const isEnabled = normalizeBooleanNumber(req.body?.isEnabled ?? req.body?.is_enabled, normalizeBooleanNumber(existing.is_enabled, 1));
      const nowIso = toIso(getNow());
      updateSpotPairStatusStatement.run({
        id: pairId,
        isEnabled,
        updatedAt: nowIso,
        updatedBy: req.currentUser?.userId || "admin",
      });

      const updated = findSpotPairByIdStatement.get(pairId);
      insertSpotAudit({
        adminUserId: req.currentUser?.userId || "admin",
        actionType: "spot_pair_toggle_status",
        targetType: "spot_pair",
        targetId: String(pairId),
        note: `set is_enabled=${isEnabled}`,
      });

      res.json({
        message: "Spot pair status updated.",
        pair: toSpotPairPayload(updated),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not update spot pair status." });
    }
  }

  function handleAdminTransactionSpotOrdersList(req, res) {
    try {
      const statusFilter = normalizeLower(req.query?.status || req.body?.status || "all");
      const pairId = Math.max(0, Math.floor(toNumber(req.query?.pairId || req.body?.pairId, 0)));
      const orderType = normalizeLower(req.query?.orderType || req.body?.orderType || "all");
      const side = normalizeLower(req.query?.side || req.body?.side || "all");
      const userKeyword = sanitizeShortText(req.query?.userKeyword || req.body?.userKeyword || "", 120);
      const fromDate = sanitizeShortText(req.query?.fromDate || req.body?.fromDate || "", 40);
      const toDate = sanitizeShortText(req.query?.toDate || req.body?.toDate || "", 40);
      const likeUserKeyword = userKeyword ? `%${userKeyword}%` : "";
      const { page, limit, offset } = buildPagination(req.query?.page || req.body?.page, req.query?.limit || req.body?.limit, 60, 300);

      const orders = listSpotOrdersForAdminStatement
        .all({ statusFilter, pairId, orderType, side, userKeyword, likeUserKeyword, fromDate, toDate, limit, offset })
        .map((row) => toSpotOrderPayload(row))
        .filter(Boolean);

      const total = toNumber(
        countSpotOrdersForAdminStatement.get({ statusFilter, pairId, orderType, side, userKeyword, likeUserKeyword, fromDate, toDate })?.total,
        0,
      );

      res.json({
        orders,
        pagination: { page, limit, total },
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load spot orders." });
    }
  }

  function handleAdminTransactionSpotOrderCancel(req, res) {
    try {
      const orderId = toNumber(req.body?.orderId ?? req.body?.id, 0);
      if (orderId <= 0) {
        throw new Error("Valid orderId is required.");
      }

      const order = findSpotOrderByIdStatement.get(orderId);
      if (!order) {
        throw new Error("Order not found.");
      }

      const cancelled = cancelSpotOrder({
        orderRow: order,
        cancelledBy: req.currentUser?.userId || "admin",
        note: sanitizeShortText(req.body?.note || "", 280) || "Cancelled by admin",
      });

      insertSpotAudit({
        adminUserId: req.currentUser?.userId || "admin",
        actionType: "spot_order_cancel",
        targetType: "spot_order",
        targetId: String(orderId),
        note: sanitizeShortText(req.body?.note || "admin cancellation", 280),
      });

      res.json({
        message: "Spot order cancelled by admin.",
        order: cancelled,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not cancel spot order." });
    }
  }

  function handleAdminTransactionSpotOrderForceFill(req, res) {
    try {
      const orderId = toNumber(req.body?.orderId ?? req.body?.id, 0);
      if (orderId <= 0) {
        throw new Error("Valid orderId is required.");
      }

      const order = findSpotOrderByIdStatement.get(orderId);
      if (!order) {
        throw new Error("Order not found.");
      }

      const status = normalizeOrderStatus(order.status || "open");
      if (status !== "open" && status !== "partially_filled") {
        throw new Error("Only open/partially filled order can be force-filled.");
      }

      const pair = findSpotPairByIdStatement.get(order.pair_id);
      if (!pair) {
        throw new Error("Pair not found.");
      }

      const requestedPrice = req.body?.executionPrice ?? req.body?.price;
      const executionPrice =
        requestedPrice !== undefined && requestedPrice !== null && requestedPrice !== ""
          ? roundToPrecision(requestedPrice, toNumber(pair.price_precision, 4))
          : roundToPrecision(resolvePriceForPair(pair), toNumber(pair.price_precision, 4));

      if (executionPrice <= 0) {
        throw new Error("Execution price is invalid.");
      }

      const feePercent = order.order_type === "market" ? toNumber(pair.taker_fee_percent, 0.15) : toNumber(pair.maker_fee_percent, 0.1);
      const fill = db.transaction(() =>
        settleSpotOrderFill({
          orderRow: order,
          pairRow: pair,
          executionPrice,
          feePercent,
          filledBy: req.currentUser?.userId || "admin",
          note: sanitizeShortText(req.body?.note || "Force-filled by admin", 280),
        }))();

      insertSpotAudit({
        adminUserId: req.currentUser?.userId || "admin",
        actionType: "spot_order_force_fill",
        targetType: "spot_order",
        targetId: String(orderId),
        note: `executionPrice=${executionPrice}`,
      });

      res.json({
        message: "Order force-filled successfully.",
        order: fill.order,
        trade: fill.trade,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not force-fill order." });
    }
  }

  function handleAdminTransactionSpotManualTickPush(req, res) {
    try {
      const pairId = toNumber(req.body?.pairId ?? req.body?.id, 0);
      const price = Math.max(0, toNumber(req.body?.price, 0));
      if (pairId <= 0 || price <= 0) {
        throw new Error("Valid pairId and price are required.");
      }

      const pair = findSpotPairByIdStatement.get(pairId);
      if (!pair) {
        throw new Error("Spot pair not found.");
      }

      const nowIso = toIso(getNow());
      updateSpotPairPriceStatement.run({
        id: pairId,
        previousPrice: toMoney(pair.current_price || price),
        currentPrice: toMoney(price),
        updatedAt: nowIso,
        updatedBy: req.currentUser?.userId || "admin",
      });
      pushTick({ pairId, price, sourceType: "manual_admin_feed", atIso: nowIso });

      insertSpotAudit({
        adminUserId: req.currentUser?.userId || "admin",
        actionType: "spot_manual_tick_push",
        targetType: "spot_pair",
        targetId: String(pairId),
        note: `price=${price}`,
      });

      res.json({
        message: "Manual tick pushed successfully.",
        pair: toSpotPairPayload(findSpotPairByIdStatement.get(pairId)),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not push manual tick." });
    }
  }

  function handleAdminTransactionSpotFeedSettingsSave(req, res) {
    try {
      const pairId = toNumber(req.body?.pairId ?? req.body?.id, 0);
      const nowIso = toIso(getNow());

      if (pairId > 0) {
        const pair = findSpotPairByIdStatement.get(pairId);
        if (!pair) {
          throw new Error("Spot pair not found.");
        }

        const sourceType = normalizeRateSourceType(req.body?.priceSourceType ?? req.body?.price_source_type ?? pair.price_source_type);
        const sourceSymbol = normalizeUpper(
          req.body?.sourceSymbol ?? req.body?.source_symbol ?? pair.source_symbol ?? pair.pair_code,
        )
          .replace(/[^A-Z0-9_]/g, "")
          .slice(0, 32);

        db.prepare(
          `UPDATE spot_pairs
           SET price_source_type = @priceSourceType,
               source_symbol = @sourceSymbol,
               updated_at = @updatedAt,
               updated_by = @updatedBy
           WHERE id = @id`,
        ).run({
          id: pairId,
          priceSourceType: sourceType,
          sourceSymbol,
          updatedAt: nowIso,
          updatedBy: req.currentUser?.userId || "admin",
        });

        insertSpotAudit({
          adminUserId: req.currentUser?.userId || "admin",
          actionType: "spot_feed_settings_save",
          targetType: "spot_pair",
          targetId: String(pairId),
          note: `sourceType=${sourceType}, sourceSymbol=${sourceSymbol}`,
        });
      }

      const settings = getEngineSettings();
      const nextManualPriceMode = normalizeBooleanNumber(req.body?.manualPriceModeEnabled ?? req.body?.manual_price_mode_enabled, settings.manualPriceModeEnabled ? 1 : 0);
      const nextManualRateMode = normalizeBooleanNumber(req.body?.manualRateModeEnabled ?? req.body?.manual_rate_mode_enabled, settings.manualRateModeEnabled ? 1 : 0);

      upsertEngineSettingsStatement.run({
        transactionModuleEnabled: settings.transactionModuleEnabled ? 1 : 0,
        convertEnabled: settings.convertEnabled ? 1 : 0,
        spotEnabled: settings.spotEnabled ? 1 : 0,
        maintenanceModeEnabled: settings.maintenanceModeEnabled ? 1 : 0,
        maintenanceMessage: settings.maintenanceMessage,
        emergencyFreezeEnabled: settings.emergencyFreezeEnabled ? 1 : 0,
        defaultConvertFeePercent: settings.defaultConvertFeePercent,
        defaultConvertSpreadPercent: settings.defaultConvertSpreadPercent,
        defaultFixedConvertFeeUsd: settings.defaultFixedConvertFeeUsd,
        defaultMakerFeePercent: settings.defaultMakerFeePercent,
        defaultTakerFeePercent: settings.defaultTakerFeePercent,
        defaultMinOrderSize: settings.defaultMinOrderSize,
        defaultMaxOrderSize: settings.defaultMaxOrderSize,
        manualRateModeEnabled: nextManualRateMode,
        manualPriceModeEnabled: nextManualPriceMode,
        requireActiveAccountOnly: settings.requireActiveAccountOnly ? 1 : 0,
        blockSuspendedUsers: settings.blockSuspendedUsers ? 1 : 0,
        blockBannedUsers: settings.blockBannedUsers ? 1 : 0,
        kycRequiredAboveAmountUsd: settings.kycRequiredAboveAmountUsd,
        updatedAt: nowIso,
        updatedBy: req.currentUser?.userId || "admin",
      });

      insertConvertAudit({
        adminUserId: req.currentUser?.userId || "admin",
        actionType: "feed_global_mode_save",
        targetType: "transaction_engine_settings",
        targetId: "1",
        note: `manualRateMode=${nextManualRateMode}, manualPriceMode=${nextManualPriceMode}`,
      });

      res.json({
        message: "Feed settings saved successfully.",
        settings: getEngineSettings(),
        pair: pairId > 0 ? toSpotPairPayload(findSpotPairByIdStatement.get(pairId)) : null,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not save feed settings." });
    }
  }

  function handleAdminTransactionAuditList(req, res) {
    try {
      const { page, limit, offset } = buildPagination(req.query?.page || req.body?.page, req.query?.limit || req.body?.limit, 80, 300);
      const logs = listAuditLogsStatement.all({ limit, offset }).map((row) => ({
        logId: `${row.scope}-${row.id}`,
        scope: row.scope,
        adminUserId: row.admin_user_id || "",
        actionType: row.action_type || "",
        targetType: row.target_type || "",
        targetId: row.target_id || "",
        note: row.note || "",
        createdAt: row.created_at || "",
      }));

      res.json({
        logs,
        pagination: { page, limit },
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load audit logs." });
    }
  }

  migrateWalletAliasSymbols();
  ensureEngineSettingsSeed();
  ensureDefaultSpotPairs();
  ensureDefaultConvertPairs();

  return {
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
  };
}
