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

function nowUnixMs() {
  return Date.now();
}

function parseIsoToMs(value = "") {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function moneyDisplay(value = 0) {
  return Number(toMoney(value).toFixed(2));
}

function normalizeText(value = "") {
  return String(value || "").trim();
}

function normalizeLower(value = "") {
  return normalizeText(value).toLowerCase();
}

function normalizeUpper(value = "") {
  return normalizeText(value).toUpperCase();
}

function normalizeWalletAssetSymbol(value = "", fallback = "USDT") {
  const cleaned = normalizeUpper(value).replace(/[^A-Z0-9_]/g, "");
  const fallbackCleaned = normalizeUpper(fallback).replace(/[^A-Z0-9_]/g, "") || "USDT";
  const resolved = cleaned || fallbackCleaned;
  const aliases = {
    SPOTUSDT: "SPOT_USDT",
    MAINUSDT: "MAIN_USDT",
    BINARYUSDT: "BINARY_USDT",
  };
  return aliases[resolved] || resolved;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildTradeRef() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `BIN-${stamp}-${rand}`;
}

function addSecondsIso(baseIso, seconds, toIso, getNow) {
  const baseMs = parseIsoToMs(baseIso) || getNow().getTime();
  return toIso(new Date(baseMs + Number(seconds || 0) * 1000));
}

function normalizeDirection(value = "") {
  const normalized = normalizeLower(value);
  if (normalized === "long" || normalized === "short") {
    return normalized;
  }
  throw new Error("Direction must be long or short.");
}

function normalizeTradeResult(value = "") {
  const normalized = normalizeLower(value);
  if (["active", "won", "lost", "draw", "cancelled", "error"].includes(normalized)) {
    return normalized;
  }
  return "active";
}

function normalizePairSourceType(value = "internal_feed") {
  const normalized = normalizeLower(value);
  if (["internal_feed", "external_api", "manual_admin_feed"].includes(normalized)) {
    return normalized;
  }
  return "internal_feed";
}

function normalizeEngineMode(value = "internal_tick") {
  const normalized = normalizeLower(value);
  if (["internal_tick", "external_price_sync", "manual_admin_tick"].includes(normalized)) {
    return normalized;
  }
  return "internal_tick";
}

function normalizeOutcomeMode(value = "auto") {
  const normalized = normalizeLower(value);
  if (["auto", "force_win", "force_loss"].includes(normalized)) {
    return normalized;
  }
  return "auto";
}

function normalizeWalletLockStatus(value = "locked") {
  const normalized = normalizeLower(value);
  return normalized === "released" ? "released" : "locked";
}

function normalizeBooleanNumber(value, fallback = 0) {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  const normalized = normalizeLower(String(value));
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return 1;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return 0;
  }
  return fallback ? 1 : 0;
}

function calculateBinaryTradeProjection(stakeAmountUsd, payoutPercent) {
  const stake = toNumber(stakeAmountUsd, 0);
  const payout = toNumber(payoutPercent, 0);
  const expectedProfitUsd = toMoney(stake * (payout / 100));
  const expectedTotalPayoutUsd = toMoney(stake + expectedProfitUsd);

  return {
    expectedProfitUsd,
    expectedTotalPayoutUsd,
  };
}

function evaluateBinaryTradeResult(direction, entryPrice, settlementPrice) {
  const normalizedDirection = normalizeDirection(direction);
  const entry = toNumber(entryPrice, 0);
  const settlement = toNumber(settlementPrice, 0);

  const entryRounded = Number(entry.toFixed(12));
  const settlementRounded = Number(settlement.toFixed(12));

  if (settlementRounded === entryRounded) {
    return "draw";
  }

  if (normalizedDirection === "long") {
    return settlementRounded > entryRounded ? "won" : "lost";
  }

  return settlementRounded < entryRounded ? "won" : "lost";
}

function pickSeedPrice(pairCode = "") {
  const code = normalizeUpper(pairCode);
  if (code.startsWith("BTC")) return 63000;
  if (code.startsWith("ETH")) return 3200;
  if (code.startsWith("SOL")) return 145;
  if (code.startsWith("BNB")) return 580;
  if (code.startsWith("ADA")) return 0.62;
  if (code.startsWith("XRP")) return 0.58;
  if (code.startsWith("DOGE")) return 0.16;
  if (code.startsWith("USDT")) return 1;
  return 100;
}

function randomWalkPrice(currentPrice) {
  const current = Math.max(0.00000001, toNumber(currentPrice, 0));
  const drift = (Math.random() - 0.5) * 0.004;
  const next = current * (1 + drift);
  return Math.max(0.00000001, next);
}

const BINANCE_MULTI_PRICE_URL = "https://api.binance.com/api/v3/ticker/price";

export function createBinaryModule({
  db,
  getNow,
  toIso,
  normalizeAssetSymbol,
  normalizeUsdAmount,
  sanitizeShortText,
}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS binary_pairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pair_code TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      base_asset TEXT NOT NULL,
      quote_asset TEXT NOT NULL,
      price_source_type TEXT NOT NULL DEFAULT 'internal_feed',
      source_symbol TEXT,
      current_price REAL NOT NULL DEFAULT 0,
      previous_price REAL NOT NULL DEFAULT 0,
      price_precision INTEGER NOT NULL DEFAULT 2,
      chart_timeframe_label TEXT NOT NULL DEFAULT '1s',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      is_featured INTEGER NOT NULL DEFAULT 0,
      display_sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS binary_period_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pair_id INTEGER,
      period_seconds INTEGER NOT NULL,
      payout_percent REAL NOT NULL,
      refund_percent_on_draw REAL NOT NULL DEFAULT 100,
      is_active INTEGER NOT NULL DEFAULT 1,
      display_sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS binary_price_ticks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pair_id INTEGER NOT NULL,
      price REAL NOT NULL,
      tick_time TEXT NOT NULL,
      source_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS binary_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_ref TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      pair_id INTEGER NOT NULL,
      pair_code_snapshot TEXT NOT NULL,
      pair_display_name_snapshot TEXT NOT NULL,
      direction TEXT NOT NULL,
      period_seconds INTEGER NOT NULL,
      payout_percent_snapshot REAL NOT NULL,
      draw_refund_percent_snapshot REAL NOT NULL DEFAULT 100,
      wallet_asset_symbol TEXT NOT NULL DEFAULT 'BINARY_USDT',
      stake_amount_usd REAL NOT NULL,
      expected_profit_usd REAL NOT NULL,
      expected_total_payout_usd REAL NOT NULL,
      entry_price REAL NOT NULL,
      settlement_price REAL,
      result_status TEXT NOT NULL,
      opened_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      settled_at TEXT,
      wallet_lock_status TEXT NOT NULL DEFAULT 'locked',
      pnl_usd REAL NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS binary_wallet_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      trade_id INTEGER,
      ledger_type TEXT NOT NULL,
      asset_symbol TEXT NOT NULL DEFAULT 'BINARY_USDT',
      amount_usd REAL NOT NULL,
      balance_before_usd REAL,
      balance_after_usd REAL,
      note TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT
    );

    CREATE TABLE IF NOT EXISTS binary_admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_user_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS binary_engine_settings (
      id INTEGER PRIMARY KEY,
      engine_mode TEXT NOT NULL DEFAULT 'internal_tick',
      settlement_price_mode TEXT NOT NULL DEFAULT 'latest_tick_at_or_before_expiry',
      tick_interval_ms INTEGER NOT NULL DEFAULT 1000,
      chart_history_limit INTEGER NOT NULL DEFAULT 180,
      binary_wallet_asset_symbol TEXT NOT NULL DEFAULT 'BINARY_USDT',
      require_kyc_for_binary INTEGER NOT NULL DEFAULT 0,
      allow_draw_refund INTEGER NOT NULL DEFAULT 1,
      max_open_trades_per_user INTEGER NOT NULL DEFAULT 1,
      global_min_stake_usd REAL NOT NULL DEFAULT 10,
      global_max_stake_usd REAL,
      allow_same_second_multi_trade INTEGER NOT NULL DEFAULT 0,
      trade_outcome_mode TEXT NOT NULL DEFAULT 'auto',
      auto_transfer_from_spot INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const findEngineSettingsStatement = db.prepare(`SELECT * FROM binary_engine_settings WHERE id = 1 LIMIT 1`);
  const findUserTradeOutcomeModeStatement = db.prepare(`
    SELECT binary_trade_outcome_mode
    FROM users
    WHERE user_id = ?
    LIMIT 1
  `);
  const upsertEngineSettingsStatement = db.prepare(`
    INSERT INTO binary_engine_settings (
      id,
      engine_mode,
      settlement_price_mode,
      tick_interval_ms,
      chart_history_limit,
      binary_wallet_asset_symbol,
      require_kyc_for_binary,
      allow_draw_refund,
      max_open_trades_per_user,
      global_min_stake_usd,
      global_max_stake_usd,
      allow_same_second_multi_trade,
      trade_outcome_mode,
      auto_transfer_from_spot,
      created_at,
      updated_at
    ) VALUES (
      1,
      @engineMode,
      @settlementPriceMode,
      @tickIntervalMs,
      @chartHistoryLimit,
      @binaryWalletAssetSymbol,
      @requireKycForBinary,
      @allowDrawRefund,
      @maxOpenTradesPerUser,
      @globalMinStakeUsd,
      @globalMaxStakeUsd,
      @allowSameSecondMultiTrade,
      @tradeOutcomeMode,
      @autoTransferFromSpot,
      @createdAt,
      @updatedAt
    )
    ON CONFLICT(id)
    DO UPDATE SET
      engine_mode = excluded.engine_mode,
      settlement_price_mode = excluded.settlement_price_mode,
      tick_interval_ms = excluded.tick_interval_ms,
      chart_history_limit = excluded.chart_history_limit,
      binary_wallet_asset_symbol = excluded.binary_wallet_asset_symbol,
      require_kyc_for_binary = excluded.require_kyc_for_binary,
      allow_draw_refund = excluded.allow_draw_refund,
      max_open_trades_per_user = excluded.max_open_trades_per_user,
      global_min_stake_usd = excluded.global_min_stake_usd,
      global_max_stake_usd = excluded.global_max_stake_usd,
      allow_same_second_multi_trade = excluded.allow_same_second_multi_trade,
      trade_outcome_mode = excluded.trade_outcome_mode,
      auto_transfer_from_spot = excluded.auto_transfer_from_spot,
      updated_at = excluded.updated_at
  `);

  const listEnabledPairsStatement = db.prepare(`
    SELECT * FROM binary_pairs
    WHERE is_enabled = 1
    ORDER BY is_featured DESC, display_sort_order ASC, id ASC
  `);
  const listAllPairsStatement = db.prepare(`
    SELECT * FROM binary_pairs
    ORDER BY is_featured DESC, display_sort_order ASC, id ASC
  `);
  const findPairByIdStatement = db.prepare(`SELECT * FROM binary_pairs WHERE id = ? LIMIT 1`);
  const findPairByCodeStatement = db.prepare(`SELECT * FROM binary_pairs WHERE pair_code = ? LIMIT 1`);
  const insertPairStatement = db.prepare(`
    INSERT INTO binary_pairs (
      pair_code,
      display_name,
      base_asset,
      quote_asset,
      price_source_type,
      source_symbol,
      current_price,
      previous_price,
      price_precision,
      chart_timeframe_label,
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
      @chartTimeframeLabel,
      @isEnabled,
      @isFeatured,
      @displaySortOrder,
      @createdAt,
      @updatedAt,
      @createdBy,
      @updatedBy
    )
  `);
  const updatePairStatement = db.prepare(`
    UPDATE binary_pairs
    SET pair_code = @pairCode,
        display_name = @displayName,
        base_asset = @baseAsset,
        quote_asset = @quoteAsset,
        price_source_type = @priceSourceType,
        source_symbol = @sourceSymbol,
        price_precision = @pricePrecision,
        chart_timeframe_label = @chartTimeframeLabel,
        is_enabled = @isEnabled,
        is_featured = @isFeatured,
        display_sort_order = @displaySortOrder,
        updated_at = @updatedAt,
        updated_by = @updatedBy
    WHERE id = @id
  `);
  const updatePairStatusStatement = db.prepare(`
    UPDATE binary_pairs
    SET is_enabled = @isEnabled,
        updated_at = @updatedAt,
        updated_by = @updatedBy
    WHERE id = @id
  `);
  const deletePairStatement = db.prepare(`DELETE FROM binary_pairs WHERE id = ?`);
  const updatePairPriceStatement = db.prepare(`
    UPDATE binary_pairs
    SET previous_price = @previousPrice,
        current_price = @currentPrice,
        updated_at = @updatedAt
    WHERE id = @id
  `);

  const listRulesForAdminStatement = db.prepare(`
    SELECT r.*, p.display_name AS pair_display_name
    FROM binary_period_rules r
    LEFT JOIN binary_pairs p ON p.id = r.pair_id
    ORDER BY COALESCE(r.pair_id, 0) ASC, r.period_seconds ASC, r.display_sort_order ASC, r.id ASC
  `);
  const listActiveRulesForPairStatement = db.prepare(`
    SELECT * FROM binary_period_rules
    WHERE is_active = 1
      AND (pair_id = @pairId OR pair_id IS NULL)
    ORDER BY
      CASE WHEN pair_id = @pairId THEN 0 ELSE 1 END,
      period_seconds ASC,
      display_sort_order ASC,
      id ASC
  `);
  const findRuleByIdStatement = db.prepare(`SELECT * FROM binary_period_rules WHERE id = ? LIMIT 1`);
  const insertRuleStatement = db.prepare(`
    INSERT INTO binary_period_rules (
      pair_id,
      period_seconds,
      payout_percent,
      refund_percent_on_draw,
      is_active,
      display_sort_order,
      created_at,
      updated_at,
      created_by,
      updated_by
    ) VALUES (
      @pairId,
      @periodSeconds,
      @payoutPercent,
      @refundPercentOnDraw,
      @isActive,
      @displaySortOrder,
      @createdAt,
      @updatedAt,
      @createdBy,
      @updatedBy
    )
  `);
  const updateRuleStatement = db.prepare(`
    UPDATE binary_period_rules
    SET pair_id = @pairId,
        period_seconds = @periodSeconds,
        payout_percent = @payoutPercent,
        refund_percent_on_draw = @refundPercentOnDraw,
        is_active = @isActive,
        display_sort_order = @displaySortOrder,
        updated_at = @updatedAt,
        updated_by = @updatedBy
    WHERE id = @id
  `);

  const listTicksByPairStatement = db.prepare(`
    SELECT * FROM binary_price_ticks
    WHERE pair_id = @pairId
    ORDER BY tick_time DESC, id DESC
    LIMIT @limit
  `);
  const insertTickStatement = db.prepare(`
    INSERT INTO binary_price_ticks (pair_id, price, tick_time, source_type, created_at)
    VALUES (@pairId, @price, @tickTime, @sourceType, @createdAt)
  `);
  const deleteOldTicksByPairStatement = db.prepare(`
    DELETE FROM binary_price_ticks
    WHERE pair_id = @pairId
      AND id NOT IN (
        SELECT id FROM binary_price_ticks
        WHERE pair_id = @pairId
        ORDER BY tick_time DESC, id DESC
        LIMIT @limit
      )
  `);
  const findTickAtOrBeforeStatement = db.prepare(`
    SELECT * FROM binary_price_ticks
    WHERE pair_id = @pairId
      AND tick_time <= @expiresAt
    ORDER BY tick_time DESC, id DESC
    LIMIT 1
  `);
  const findTickAfterStatement = db.prepare(`
    SELECT * FROM binary_price_ticks
    WHERE pair_id = @pairId
      AND tick_time > @expiresAt
    ORDER BY tick_time ASC, id ASC
    LIMIT 1
  `);

  const insertTradeStatement = db.prepare(`
    INSERT INTO binary_trades (
      trade_ref,
      user_id,
      pair_id,
      pair_code_snapshot,
      pair_display_name_snapshot,
      direction,
      period_seconds,
      payout_percent_snapshot,
      draw_refund_percent_snapshot,
      wallet_asset_symbol,
      stake_amount_usd,
      expected_profit_usd,
      expected_total_payout_usd,
      entry_price,
      settlement_price,
      result_status,
      opened_at,
      expires_at,
      settled_at,
      wallet_lock_status,
      pnl_usd,
      note,
      created_at,
      updated_at
    ) VALUES (
      @tradeRef,
      @userId,
      @pairId,
      @pairCodeSnapshot,
      @pairDisplayNameSnapshot,
      @direction,
      @periodSeconds,
      @payoutPercentSnapshot,
      @drawRefundPercentSnapshot,
      @walletAssetSymbol,
      @stakeAmountUsd,
      @expectedProfitUsd,
      @expectedTotalPayoutUsd,
      @entryPrice,
      @settlementPrice,
      @resultStatus,
      @openedAt,
      @expiresAt,
      @settledAt,
      @walletLockStatus,
      @pnlUsd,
      @note,
      @createdAt,
      @updatedAt
    )
  `);
  const findTradeByIdStatement = db.prepare(`SELECT * FROM binary_trades WHERE id = ? LIMIT 1`);
  const findTradeByRefStatement = db.prepare(`SELECT * FROM binary_trades WHERE trade_ref = ? LIMIT 1`);
  const listActiveTradesByUserStatement = db.prepare(`
    SELECT * FROM binary_trades
    WHERE user_id = @userId
      AND result_status = 'active'
    ORDER BY opened_at DESC, id DESC
  `);
  const countOpenTradesByUserStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM binary_trades
    WHERE user_id = @userId
      AND result_status = 'active'
  `);
  const countOpenTradesByUserSameSecondStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM binary_trades
    WHERE user_id = @userId
      AND result_status = 'active'
      AND opened_at = @openedAt
  `);
  const listHistoryTradesByUserStatement = db.prepare(`
    SELECT * FROM binary_trades
    WHERE user_id = @userId
      AND (@resultFilter = 'all' OR result_status = @resultFilter)
      AND (@pairId = 0 OR pair_id = @pairId)
    ORDER BY opened_at DESC, id DESC
    LIMIT @limit OFFSET @offset
  `);
  const countHistoryTradesByUserStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM binary_trades
    WHERE user_id = @userId
      AND (@resultFilter = 'all' OR result_status = @resultFilter)
      AND (@pairId = 0 OR pair_id = @pairId)
  `);
  const listExpiredActiveTradesGlobalStatement = db.prepare(`
    SELECT * FROM binary_trades
    WHERE result_status = 'active'
      AND expires_at <= @nowIso
    ORDER BY expires_at ASC, id ASC
    LIMIT 300
  `);
  const listExpiredActiveTradesForUserStatement = db.prepare(`
    SELECT * FROM binary_trades
    WHERE user_id = @userId
      AND result_status = 'active'
      AND expires_at <= @nowIso
    ORDER BY expires_at ASC, id ASC
    LIMIT 200
  `);
  const updateTradeSettlementStatement = db.prepare(`
    UPDATE binary_trades
    SET settlement_price = @settlementPrice,
        result_status = @resultStatus,
        settled_at = @settledAt,
        wallet_lock_status = @walletLockStatus,
        pnl_usd = @pnlUsd,
        note = @note,
        updated_at = @updatedAt
    WHERE id = @id
  `);

  const listTradesForAdminStatement = db.prepare(`
    SELECT t.*, u.name AS account_name, u.email AS account_email
    FROM binary_trades t
    LEFT JOIN users u ON u.user_id = t.user_id
    WHERE (@resultFilter = 'all' OR t.result_status = @resultFilter)
      AND (@pairId = 0 OR t.pair_id = @pairId)
      AND (@keyword = '' OR t.trade_ref LIKE @likeKeyword OR t.user_id LIKE @likeKeyword OR u.email LIKE @likeKeyword OR u.name LIKE @likeKeyword)
    ORDER BY t.opened_at DESC, t.id DESC
    LIMIT @limit OFFSET @offset
  `);
  const countTradesForAdminStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM binary_trades t
    LEFT JOIN users u ON u.user_id = t.user_id
    WHERE (@resultFilter = 'all' OR t.result_status = @resultFilter)
      AND (@pairId = 0 OR t.pair_id = @pairId)
      AND (@keyword = '' OR t.trade_ref LIKE @likeKeyword OR t.user_id LIKE @likeKeyword OR u.email LIKE @likeKeyword OR u.name LIKE @likeKeyword)
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

  const insertWalletLedgerStatement = db.prepare(`
    INSERT INTO binary_wallet_ledger (
      user_id,
      trade_id,
      ledger_type,
      asset_symbol,
      amount_usd,
      balance_before_usd,
      balance_after_usd,
      note,
      created_at,
      created_by
    ) VALUES (
      @userId,
      @tradeId,
      @ledgerType,
      @assetSymbol,
      @amountUsd,
      @balanceBeforeUsd,
      @balanceAfterUsd,
      @note,
      @createdAt,
      @createdBy
    )
  `);

  const insertAuditStatement = db.prepare(`
    INSERT INTO binary_admin_audit_logs (
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

  function migrateWalletSymbolAlias(fromSymbol, toSymbol) {
    const from = normalizeUpper(fromSymbol).replace(/[^A-Z0-9_]/g, "");
    const to = normalizeWalletAssetSymbol(toSymbol, toSymbol);
    if (!from || !to || from === to) {
      return;
    }

    const aliasTx = db.transaction(() => {
      const detailRows = db
        .prepare(
          `SELECT user_id, available_usd, locked_usd, reward_earned_usd, updated_at
           FROM user_wallet_balance_details
           WHERE asset_symbol = ?`,
        )
        .all(from);

      for (const row of detailRows) {
        const existingTo = db
          .prepare(
            `SELECT user_id, available_usd, locked_usd, reward_earned_usd
             FROM user_wallet_balance_details
             WHERE user_id = ? AND asset_symbol = ?
             LIMIT 1`,
          )
          .get(row.user_id, to);

        if (existingTo) {
          db.prepare(
            `UPDATE user_wallet_balance_details
             SET available_usd = ?,
                 locked_usd = ?,
                 reward_earned_usd = ?,
                 updated_at = ?
             WHERE user_id = ? AND asset_symbol = ?`,
          ).run(
            toMoney(toNumber(existingTo.available_usd, 0) + toNumber(row.available_usd, 0)),
            toMoney(toNumber(existingTo.locked_usd, 0) + toNumber(row.locked_usd, 0)),
            toMoney(toNumber(existingTo.reward_earned_usd, 0) + toNumber(row.reward_earned_usd, 0)),
            row.updated_at || toIso(getNow()),
            row.user_id,
            to,
          );
          db.prepare(`DELETE FROM user_wallet_balance_details WHERE user_id = ? AND asset_symbol = ?`).run(row.user_id, from);
        } else {
          db.prepare(`UPDATE user_wallet_balance_details SET asset_symbol = ? WHERE user_id = ? AND asset_symbol = ?`).run(
            to,
            row.user_id,
            from,
          );
        }
      }

      const summaryRows = db
        .prepare(
          `SELECT user_id, asset_name, total_usd, updated_at
           FROM user_wallet_balances
           WHERE asset_symbol = ?`,
        )
        .all(from);

      for (const row of summaryRows) {
        const existingTo = db
          .prepare(
            `SELECT user_id, total_usd
             FROM user_wallet_balances
             WHERE user_id = ? AND asset_symbol = ?
             LIMIT 1`,
          )
          .get(row.user_id, to);

        if (existingTo) {
          db.prepare(
            `UPDATE user_wallet_balances
             SET total_usd = ?, updated_at = ?
             WHERE user_id = ? AND asset_symbol = ?`,
          ).run(
            toMoney(toNumber(existingTo.total_usd, 0) + toNumber(row.total_usd, 0)),
            row.updated_at || toIso(getNow()),
            row.user_id,
            to,
          );
          db.prepare(`DELETE FROM user_wallet_balances WHERE user_id = ? AND asset_symbol = ?`).run(row.user_id, from);
        } else {
          db.prepare(`UPDATE user_wallet_balances SET asset_symbol = ?, asset_name = ? WHERE user_id = ? AND asset_symbol = ?`).run(
            to,
            to,
            row.user_id,
            from,
          );
        }
      }

      db.prepare(`UPDATE binary_trades SET wallet_asset_symbol = ? WHERE wallet_asset_symbol = ?`).run(to, from);
      db.prepare(`UPDATE binary_wallet_ledger SET asset_symbol = ? WHERE asset_symbol = ?`).run(to, from);
      db.prepare(`UPDATE binary_engine_settings SET binary_wallet_asset_symbol = ? WHERE binary_wallet_asset_symbol = ?`).run(to, from);
    });

    aliasTx();
  }

  function ensureEngineSettings() {
    const existing = findEngineSettingsStatement.get();
    const nowIso = toIso(getNow());

    upsertEngineSettingsStatement.run({
      engineMode: normalizeEngineMode(existing?.engine_mode || "internal_tick"),
      settlementPriceMode: normalizeText(existing?.settlement_price_mode || "latest_tick_at_or_before_expiry") || "latest_tick_at_or_before_expiry",
      tickIntervalMs: Math.max(400, Math.min(60_000, Math.floor(toNumber(existing?.tick_interval_ms, 1000)))),
      chartHistoryLimit: Math.max(60, Math.min(1000, Math.floor(toNumber(existing?.chart_history_limit, 180)))),
      binaryWalletAssetSymbol: normalizeWalletAssetSymbol(existing?.binary_wallet_asset_symbol || "BINARY_USDT", "BINARY_USDT"),
      requireKycForBinary: normalizeBooleanNumber(existing?.require_kyc_for_binary, 0),
      allowDrawRefund: normalizeBooleanNumber(existing?.allow_draw_refund, 1),
      maxOpenTradesPerUser: Math.max(1, Math.floor(toNumber(existing?.max_open_trades_per_user, 1))),
      globalMinStakeUsd: Math.max(0.01, toMoney(toNumber(existing?.global_min_stake_usd, 10))),
      globalMaxStakeUsd:
        existing?.global_max_stake_usd === null || existing?.global_max_stake_usd === undefined
          ? null
          : Math.max(0.01, toMoney(toNumber(existing?.global_max_stake_usd, 0))),
      allowSameSecondMultiTrade: normalizeBooleanNumber(existing?.allow_same_second_multi_trade, 0),
      tradeOutcomeMode: normalizeOutcomeMode(existing?.trade_outcome_mode || "auto"),
      autoTransferFromSpot: normalizeBooleanNumber(existing?.auto_transfer_from_spot, 1),
      createdAt: existing?.created_at || nowIso,
      updatedAt: nowIso,
    });
  }

  function mapEngineSettings(row = null) {
    const raw = row || findEngineSettingsStatement.get() || {};
    return {
      engineMode: normalizeEngineMode(raw.engine_mode || "internal_tick"),
      settlementPriceMode: normalizeText(raw.settlement_price_mode || "latest_tick_at_or_before_expiry") || "latest_tick_at_or_before_expiry",
      tickIntervalMs: Math.max(400, Math.min(60_000, Math.floor(toNumber(raw.tick_interval_ms, 1000)))),
      chartHistoryLimit: Math.max(60, Math.min(1000, Math.floor(toNumber(raw.chart_history_limit, 180)))),
      binaryWalletAssetSymbol: normalizeWalletAssetSymbol(raw.binary_wallet_asset_symbol || "BINARY_USDT", "BINARY_USDT"),
      requireKycForBinary: normalizeBooleanNumber(raw.require_kyc_for_binary, 0) === 1,
      allowDrawRefund: normalizeBooleanNumber(raw.allow_draw_refund, 1) === 1,
      maxOpenTradesPerUser: Math.max(1, Math.floor(toNumber(raw.max_open_trades_per_user, 1))),
      globalMinStakeUsd: Math.max(0.01, toMoney(toNumber(raw.global_min_stake_usd, 10))),
      globalMaxStakeUsd:
        raw.global_max_stake_usd === null || raw.global_max_stake_usd === undefined
          ? null
          : Math.max(0.01, toMoney(toNumber(raw.global_max_stake_usd, 0))),
      allowSameSecondMultiTrade: normalizeBooleanNumber(raw.allow_same_second_multi_trade, 0) === 1,
      tradeOutcomeMode: normalizeOutcomeMode(raw.trade_outcome_mode || "auto"),
      autoTransferFromSpot: normalizeBooleanNumber(raw.auto_transfer_from_spot, 1) === 1,
      updatedAt: raw.updated_at || "",
    };
  }

  function resolveTradeOutcomeModeForUser(userId, fallbackMode = "auto") {
    const account = findUserTradeOutcomeModeStatement.get(String(userId || ""));
    const userMode = normalizeOutcomeMode(account?.binary_trade_outcome_mode || "auto");
    if (userMode !== "auto") {
      return userMode;
    }
    return normalizeOutcomeMode(fallbackMode || "auto");
  }

  function mapPair(row) {
    if (!row) {
      return null;
    }
    return {
      pairId: Number(row.id || 0),
      pairCode: normalizeUpper(row.pair_code || ""),
      displayName: String(row.display_name || ""),
      baseAsset: normalizeUpper(row.base_asset || ""),
      quoteAsset: normalizeUpper(row.quote_asset || ""),
      priceSourceType: normalizePairSourceType(row.price_source_type || "internal_feed"),
      sourceSymbol: String(row.source_symbol || ""),
      currentPrice: toNumber(row.current_price, 0),
      previousPrice: toNumber(row.previous_price, 0),
      pricePrecision: Math.max(2, Math.min(10, Math.floor(toNumber(row.price_precision, 2)))),
      chartTimeframeLabel: String(row.chart_timeframe_label || "1s"),
      isEnabled: normalizeBooleanNumber(row.is_enabled, 1) === 1,
      isFeatured: normalizeBooleanNumber(row.is_featured, 0) === 1,
      displaySortOrder: Math.floor(toNumber(row.display_sort_order, 0)),
      updatedAt: String(row.updated_at || ""),
    };
  }

  function mapRule(row) {
    if (!row) {
      return null;
    }
    return {
      ruleId: Number(row.id || 0),
      pairId: row.pair_id === null || row.pair_id === undefined ? null : Number(row.pair_id || 0),
      pairDisplayName: String(row.pair_display_name || ""),
      periodSeconds: Math.max(1, Math.floor(toNumber(row.period_seconds, 30))),
      payoutPercent: toMoney(toNumber(row.payout_percent, 0)),
      refundPercentOnDraw: toMoney(toNumber(row.refund_percent_on_draw, 100)),
      isActive: normalizeBooleanNumber(row.is_active, 1) === 1,
      displaySortOrder: Math.floor(toNumber(row.display_sort_order, 0)),
      updatedAt: String(row.updated_at || ""),
    };
  }

  function mapTrade(row, options = {}) {
    if (!row) {
      return null;
    }
    const nowIso = options.nowIso || toIso(getNow());
    const expiresAtMs = parseIsoToMs(row.expires_at || "");
    const remainingSeconds = row.result_status === "active"
      ? Math.max(0, Math.ceil((expiresAtMs - parseIsoToMs(nowIso)) / 1000))
      : 0;

    const payload = {
      tradeId: Number(row.id || 0),
      tradeRef: String(row.trade_ref || ""),
      userId: String(row.user_id || ""),
      pairId: Number(row.pair_id || 0),
      pairCode: String(row.pair_code_snapshot || ""),
      pairDisplayName: String(row.pair_display_name_snapshot || ""),
      direction: normalizeDirection(row.direction || "long"),
      periodSeconds: Math.max(1, Math.floor(toNumber(row.period_seconds, 30))),
      payoutPercent: toMoney(toNumber(row.payout_percent_snapshot, 0)),
      drawRefundPercent: toMoney(toNumber(row.draw_refund_percent_snapshot, 100)),
      walletAssetSymbol: normalizeUpper(row.wallet_asset_symbol || "BINARY_USDT"),
      stakeAmountUsd: toMoney(toNumber(row.stake_amount_usd, 0)),
      expectedProfitUsd: toMoney(toNumber(row.expected_profit_usd, 0)),
      expectedTotalPayoutUsd: toMoney(toNumber(row.expected_total_payout_usd, 0)),
      entryPrice: toNumber(row.entry_price, 0),
      settlementPrice: row.settlement_price === null || row.settlement_price === undefined ? null : toNumber(row.settlement_price, 0),
      resultStatus: normalizeTradeResult(row.result_status || "active"),
      openedAt: String(row.opened_at || ""),
      expiresAt: String(row.expires_at || ""),
      settledAt: String(row.settled_at || ""),
      walletLockStatus: normalizeWalletLockStatus(row.wallet_lock_status || "locked"),
      pnlUsd: toMoney(toNumber(row.pnl_usd, 0)),
      note: String(row.note || ""),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
      remainingSeconds,
    };

    if (options.includeAccount) {
      payload.accountName = String(row.account_name || "");
      payload.accountEmail = String(row.account_email || "");
    }

    return payload;
  }

  function writeAudit(adminUserId, actionType, targetType, targetId, note = "") {
    insertAuditStatement.run({
      adminUserId: String(adminUserId || "admin"),
      actionType: String(actionType || "action"),
      targetType: String(targetType || "entity"),
      targetId: String(targetId || ""),
      note: sanitizeShortText(note || "", 320),
      createdAt: toIso(getNow()),
    });
  }

  function writeWalletLedger({
    userId,
    tradeId,
    ledgerType,
    assetSymbol,
    amountUsd,
    balanceBeforeUsd,
    balanceAfterUsd,
    note,
    createdBy,
  }) {
    insertWalletLedgerStatement.run({
      userId,
      tradeId: tradeId || null,
      ledgerType: String(ledgerType || "binary_manual_adjustment"),
      assetSymbol: normalizeWalletAssetSymbol(assetSymbol || "BINARY_USDT", "BINARY_USDT"),
      amountUsd: toMoney(amountUsd),
      balanceBeforeUsd: toMoney(balanceBeforeUsd),
      balanceAfterUsd: toMoney(balanceAfterUsd),
      note: sanitizeShortText(note || "", 280),
      createdAt: toIso(getNow()),
      createdBy: createdBy || null,
    });
  }

  function ensureWalletDetailRow(userId, assetSymbol, nowIso, fallbackSummarySymbol) {
    const symbol = normalizeWalletAssetSymbol(assetSymbol || "BINARY_USDT", "BINARY_USDT");
    const existing = findWalletDetailStatement.get(userId, symbol);
    if (existing) {
      return existing;
    }

    const fallbackSymbol = normalizeWalletAssetSymbol(fallbackSummarySymbol || symbol, symbol);
    const summary = findWalletSummaryByAssetStatement.get(userId, fallbackSymbol);
    const availableUsd = toMoney(toNumber(summary?.total_usd, 0));

    insertWalletDetailStatement.run({
      userId,
      assetSymbol: symbol,
      availableUsd,
      lockedUsd: 0,
      rewardEarnedUsd: 0,
      updatedAt: nowIso,
    });

    const created = findWalletDetailStatement.get(userId, symbol);

    if (!findWalletSummaryByAssetStatement.get(userId, symbol)) {
      setWalletSummaryStatement.run({
        userId,
        assetSymbol: symbol,
        assetName: symbol,
        totalUsd: toMoney(toNumber(created?.available_usd, 0) + toNumber(created?.locked_usd, 0)),
        updatedAt: nowIso,
      });
    }

    return created;
  }

  function saveWalletDetail({ userId, assetSymbol, availableUsd, lockedUsd, rewardEarnedUsd, updatedAt }) {
    updateWalletDetailStatement.run({
      userId,
      assetSymbol,
      availableUsd: toMoney(availableUsd),
      lockedUsd: toMoney(lockedUsd),
      rewardEarnedUsd: toMoney(rewardEarnedUsd),
      updatedAt,
    });

    return findWalletDetailStatement.get(userId, assetSymbol);
  }

  function syncWalletSummaryFromDetail({ userId, assetSymbol, detail, updatedAt }) {
    const totalUsd = toMoney(toNumber(detail?.available_usd, 0) + toNumber(detail?.locked_usd, 0));
    setWalletSummaryStatement.run({
      userId,
      assetSymbol,
      assetName: assetSymbol,
      totalUsd,
      updatedAt,
    });
  }

  function getOrCreateCoreWallets(userId, settings, nowIso) {
    const spotSymbol = "SPOT_USDT";
    const mainSymbol = "MAIN_USDT";
    const binarySymbol = normalizeWalletAssetSymbol(settings.binaryWalletAssetSymbol || "BINARY_USDT", "BINARY_USDT");

    const spot = ensureWalletDetailRow(userId, spotSymbol, nowIso, spotSymbol);
    const main = ensureWalletDetailRow(userId, mainSymbol, nowIso, mainSymbol);
    const binary = ensureWalletDetailRow(userId, binarySymbol, nowIso, binarySymbol);

    return {
      spotSymbol,
      mainSymbol,
      binarySymbol,
      spot,
      main,
      binary,
    };
  }

  function maybeAutoTransferFromSpotToBinary({ userId, requiredAmountUsd, wallets, nowIso, actor }) {
    if (requiredAmountUsd <= 0) {
      return wallets;
    }

    const currentSpot = findWalletDetailStatement.get(userId, wallets.spotSymbol) || wallets.spot;
    const currentBinary = findWalletDetailStatement.get(userId, wallets.binarySymbol) || wallets.binary;

    const spotAvailable = toNumber(currentSpot?.available_usd, 0);
    if (spotAvailable < requiredAmountUsd) {
      return wallets;
    }

    const nextSpotAvailable = toMoney(spotAvailable - requiredAmountUsd);
    const nextSpot = saveWalletDetail({
      userId,
      assetSymbol: wallets.spotSymbol,
      availableUsd: nextSpotAvailable,
      lockedUsd: toNumber(currentSpot?.locked_usd, 0),
      rewardEarnedUsd: toNumber(currentSpot?.reward_earned_usd, 0),
      updatedAt: nowIso,
    });
    syncWalletSummaryFromDetail({ userId, assetSymbol: wallets.spotSymbol, detail: nextSpot, updatedAt: nowIso });

    const binaryAvailable = toNumber(currentBinary?.available_usd, 0);
    const nextBinaryAvailable = toMoney(binaryAvailable + requiredAmountUsd);
    const nextBinary = saveWalletDetail({
      userId,
      assetSymbol: wallets.binarySymbol,
      availableUsd: nextBinaryAvailable,
      lockedUsd: toNumber(currentBinary?.locked_usd, 0),
      rewardEarnedUsd: toNumber(currentBinary?.reward_earned_usd, 0),
      updatedAt: nowIso,
    });
    syncWalletSummaryFromDetail({ userId, assetSymbol: wallets.binarySymbol, detail: nextBinary, updatedAt: nowIso });

    writeWalletLedger({
      userId,
      tradeId: null,
      ledgerType: "binary_manual_adjustment",
      assetSymbol: wallets.binarySymbol,
      amountUsd: requiredAmountUsd,
      balanceBeforeUsd: binaryAvailable,
      balanceAfterUsd: nextBinaryAvailable,
      note: `Auto transfer from ${wallets.spotSymbol} to ${wallets.binarySymbol}.`,
      createdBy: actor,
    });

    return {
      ...wallets,
      spot: nextSpot,
      binary: nextBinary,
    };
  }

  function normalizeRuleResult(rules) {
    const byPeriod = new Map();
    for (const row of ensureArray(rules)) {
      const mapped = mapRule(row);
      if (!mapped) {
        continue;
      }
      if (!byPeriod.has(mapped.periodSeconds)) {
        byPeriod.set(mapped.periodSeconds, mapped);
      }
    }
    return [...byPeriod.values()].sort((a, b) => a.periodSeconds - b.periodSeconds || a.displaySortOrder - b.displaySortOrder);
  }

  function resolveRulesForPair(pairId) {
    return normalizeRuleResult(listActiveRulesForPairStatement.all({ pairId }));
  }

  function resolveRuleForPeriod(pairId, periodSeconds) {
    const targetPeriod = Math.max(1, Math.floor(toNumber(periodSeconds, 0)));
    const rules = resolveRulesForPair(pairId);
    return rules.find((item) => item.periodSeconds === targetPeriod) || null;
  }

  function ensureDefaultPairsFromDepositAssets(actor = "system") {
    const assets = db
      .prepare(`
        SELECT symbol, name, is_enabled, sort_order
        FROM deposit_assets
        ORDER BY sort_order ASC, symbol ASC
      `)
      .all();

    const nowIso = toIso(getNow());

    for (const asset of assets) {
      const symbol = normalizeAssetSymbol(asset?.symbol || "");
      if (!symbol || symbol === "USDT") {
        continue;
      }
      const pairCode = `${symbol}USDT`;
      const exists = findPairByCodeStatement.get(pairCode);
      if (exists) {
        continue;
      }

      const seedPrice = pickSeedPrice(pairCode);
      insertPairStatement.run({
        pairCode,
        displayName: `${symbol}/USDT`,
        baseAsset: symbol,
        quoteAsset: "USDT",
        priceSourceType: "internal_feed",
        sourceSymbol: pairCode,
        currentPrice: seedPrice,
        previousPrice: seedPrice,
        pricePrecision: seedPrice >= 100 ? 2 : seedPrice >= 1 ? 4 : 6,
        chartTimeframeLabel: "1s",
        isEnabled: normalizeBooleanNumber(asset?.is_enabled, 1),
        isFeatured: 0,
        displaySortOrder: Math.max(0, Math.floor(toNumber(asset?.sort_order, 0))),
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor,
        updatedBy: actor,
      });
    }
  }

  function ensureDefaultRules(actor = "system") {
    const hasRules = Number(db.prepare(`SELECT COUNT(*) AS total FROM binary_period_rules`).get()?.total || 0) > 0;
    if (hasRules) {
      return;
    }

    const nowIso = toIso(getNow());
    const seeds = [
      { periodSeconds: 30, payoutPercent: 40, refundPercentOnDraw: 100, displaySortOrder: 1 },
      { periodSeconds: 60, payoutPercent: 50, refundPercentOnDraw: 100, displaySortOrder: 2 },
      { periodSeconds: 90, payoutPercent: 61, refundPercentOnDraw: 100, displaySortOrder: 3 },
      { periodSeconds: 120, payoutPercent: 70, refundPercentOnDraw: 100, displaySortOrder: 4 },
      { periodSeconds: 300, payoutPercent: 99, refundPercentOnDraw: 100, displaySortOrder: 5 },
    ];

    for (const seed of seeds) {
      insertRuleStatement.run({
        pairId: null,
        periodSeconds: seed.periodSeconds,
        payoutPercent: seed.payoutPercent,
        refundPercentOnDraw: seed.refundPercentOnDraw,
        isActive: 1,
        displaySortOrder: seed.displaySortOrder,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: actor,
        updatedBy: actor,
      });
    }
  }

  function ensureDefaultTicks() {
    const nowIso = toIso(getNow());
    const pairs = listAllPairsStatement.all();
    for (const pair of pairs) {
      const existingTick = db.prepare(`SELECT id FROM binary_price_ticks WHERE pair_id = ? LIMIT 1`).get(pair.id);
      if (existingTick) {
        continue;
      }
      const price = toNumber(pair.current_price, 0) > 0 ? toNumber(pair.current_price, 0) : pickSeedPrice(pair.pair_code);
      insertTickStatement.run({
        pairId: pair.id,
        price,
        tickTime: nowIso,
        sourceType: normalizePairSourceType(pair.price_source_type || "internal_feed"),
        createdAt: nowIso,
      });
      updatePairPriceStatement.run({
        id: pair.id,
        previousPrice: price,
        currentPrice: price,
        updatedAt: nowIso,
      });
    }
  }

  function syncPairTicks(limit) {
    const safeLimit = Math.max(60, Math.min(2000, Math.floor(toNumber(limit, 180))));
    const pairs = listAllPairsStatement.all();
    for (const pair of pairs) {
      deleteOldTicksByPairStatement.run({ pairId: pair.id, limit: safeLimit });
    }
  }

  migrateWalletSymbolAlias("SPOTUSDT", "SPOT_USDT");
  migrateWalletSymbolAlias("MAINUSDT", "MAIN_USDT");
  migrateWalletSymbolAlias("BINARYUSDT", "BINARY_USDT");

  ensureEngineSettings();
  ensureDefaultPairsFromDepositAssets();
  ensureDefaultRules();
  ensureDefaultTicks();
  syncPairTicks(mapEngineSettings().chartHistoryLimit * 3);

  let tickEngineTimer = null;
  let tickEngineInFlight = false;

  function applyInternalTicks() {
    const settings = mapEngineSettings();
    if (settings.engineMode !== "internal_tick") {
      return;
    }

    const nowIso = toIso(getNow());
    const pairs = listEnabledPairsStatement.all();
    for (const row of pairs) {
      const pair = mapPair(row);
      const previous = toNumber(pair?.currentPrice, 0) > 0 ? toNumber(pair.currentPrice, 0) : pickSeedPrice(pair.pairCode);
      const nextPrice = randomWalkPrice(previous);

      updatePairPriceStatement.run({
        id: pair.pairId,
        previousPrice: previous,
        currentPrice: nextPrice,
        updatedAt: nowIso,
      });

      insertTickStatement.run({
        pairId: pair.pairId,
        price: nextPrice,
        tickTime: nowIso,
        sourceType: "internal_feed",
        createdAt: nowIso,
      });
    }

    syncPairTicks(settings.chartHistoryLimit * 3);
  }

async function fetchExternalTickerMap(symbols = []) {
    const normalizedSymbols = [...new Set(ensureArray(symbols).map((item) => normalizeUpper(item)).filter(Boolean))];
    if (!normalizedSymbols.length || typeof fetch !== "function") {
      return new Map();
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3800);

    try {
      const query = encodeURIComponent(JSON.stringify(normalizedSymbols));
      const response = await fetch(`${BINANCE_MULTI_PRICE_URL}?symbols=${query}`, {
        method: "GET",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`batch-failed-${response.status}`);
      }
      const payload = await response.json();
      if (!Array.isArray(payload)) {
        throw new Error("batch-invalid-shape");
      }

      const priceMap = new Map();
      for (const row of payload) {
        const symbol = normalizeUpper(row?.symbol || "");
        const price = toNumber(row?.price, 0);
        if (symbol && price > 0) {
          priceMap.set(symbol, price);
        }
      }
      return priceMap;
    } catch {
      const fallbackMap = new Map();
      for (const symbol of normalizedSymbols) {
        const localController = new AbortController();
        const localTimeout = setTimeout(() => localController.abort(), 2200);
        try {
          const singleRes = await fetch(`${BINANCE_MULTI_PRICE_URL}?symbol=${encodeURIComponent(symbol)}`, {
            method: "GET",
            signal: localController.signal,
          });
          if (!singleRes.ok) {
            continue;
          }
          const singlePayload = await singleRes.json();
          const singlePrice = toNumber(singlePayload?.price, 0);
          if (singlePrice > 0) {
            fallbackMap.set(symbol, singlePrice);
          }
        } catch {
          // Ignore single-symbol fallback failure.
        } finally {
          clearTimeout(localTimeout);
        }
      }
      return fallbackMap;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function applyExternalTicks() {
    const settings = mapEngineSettings();
    if (settings.engineMode !== "external_price_sync") {
      return;
    }

    const pairs = listEnabledPairsStatement.all().map((row) => mapPair(row)).filter(Boolean);
    if (!pairs.length) {
      return;
    }

    const externalPairs = pairs.filter((pair) => pair.priceSourceType === "external_api");
    const internalPairs = pairs.filter((pair) => pair.priceSourceType !== "external_api");
    const symbols = externalPairs.map((pair) => normalizeUpper(pair.sourceSymbol || pair.pairCode));
    const externalPriceMap = await fetchExternalTickerMap(symbols);
    const nowIso = toIso(getNow());

    for (const pair of externalPairs) {
      const key = normalizeUpper(pair.sourceSymbol || pair.pairCode);
      const previous = toNumber(pair.currentPrice, 0) > 0 ? toNumber(pair.currentPrice, 0) : pickSeedPrice(pair.pairCode);
      const resolvedExternal = toNumber(externalPriceMap.get(key), 0);
      const nextPrice = resolvedExternal > 0 ? resolvedExternal : randomWalkPrice(previous);

      updatePairPriceStatement.run({
        id: pair.pairId,
        previousPrice: previous,
        currentPrice: nextPrice,
        updatedAt: nowIso,
      });

      insertTickStatement.run({
        pairId: pair.pairId,
        price: nextPrice,
        tickTime: nowIso,
        sourceType: resolvedExternal > 0 ? "external_api" : "internal_feed",
        createdAt: nowIso,
      });
    }

    for (const pair of internalPairs) {
      const previous = toNumber(pair.currentPrice, 0) > 0 ? toNumber(pair.currentPrice, 0) : pickSeedPrice(pair.pairCode);
      const nextPrice = randomWalkPrice(previous);

      updatePairPriceStatement.run({
        id: pair.pairId,
        previousPrice: previous,
        currentPrice: nextPrice,
        updatedAt: nowIso,
      });

      insertTickStatement.run({
        pairId: pair.pairId,
        price: nextPrice,
        tickTime: nowIso,
        sourceType: "internal_feed",
        createdAt: nowIso,
      });
    }

    syncPairTicks(settings.chartHistoryLimit * 3);
  }

  async function runTickEngineCycle() {
    const settings = mapEngineSettings();
    if (settings.engineMode === "internal_tick") {
      applyInternalTicks();
      return;
    }
    if (settings.engineMode === "external_price_sync") {
      await applyExternalTicks();
      return;
    }
    syncPairTicks(settings.chartHistoryLimit * 3);
  }

  function startTickEngine() {
    if (tickEngineTimer) {
      clearInterval(tickEngineTimer);
      tickEngineTimer = null;
    }

    const settings = mapEngineSettings();
    const intervalMs = settings.tickIntervalMs;
    const tickRunner = async () => {
      if (tickEngineInFlight) {
        return;
      }
      tickEngineInFlight = true;
      try {
        await runTickEngineCycle();
      } catch {
        // Keep engine alive even if one tick fails.
      } finally {
        tickEngineInFlight = false;
      }
    };

    void tickRunner();
    tickEngineTimer = setInterval(() => {
      void tickRunner();
    }, intervalMs);
  }

  startTickEngine();

  function resolveSettlementPrice(pairId, expiresAtIso) {
    const tickBefore = findTickAtOrBeforeStatement.get({ pairId, expiresAt: expiresAtIso });
    if (tickBefore) {
      return toNumber(tickBefore.price, 0);
    }

    const tickAfter = findTickAfterStatement.get({ pairId, expiresAt: expiresAtIso });
    if (tickAfter) {
      const expiresMs = parseIsoToMs(expiresAtIso);
      const nextMs = parseIsoToMs(tickAfter.tick_time);
      if (expiresMs > 0 && nextMs > 0 && nextMs - expiresMs <= 10_000) {
        return toNumber(tickAfter.price, 0);
      }
    }

    return null;
  }

  function settleBinaryTradeById(tradeId, actor = "system") {
    const trade = findTradeByIdStatement.get(Number(tradeId || 0));
    if (!trade) {
      throw new Error("Trade not found.");
    }

    if (normalizeTradeResult(trade.result_status) !== "active") {
      return mapTrade(trade);
    }

    const settings = mapEngineSettings();
    const nowIso = toIso(getNow());
    const nowMs = parseIsoToMs(nowIso);
    const expiresMs = parseIsoToMs(trade.expires_at || "");
    if (!expiresMs || nowMs < expiresMs) {
      throw new Error("Trade is not expired yet.");
    }

    let settlementPrice = resolveSettlementPrice(trade.pair_id, trade.expires_at);
    if (settlementPrice === null) {
      throw new Error("Settlement tick is not available yet.");
    }

    const effectiveOutcomeMode = resolveTradeOutcomeModeForUser(trade.user_id, settings.tradeOutcomeMode);
    let resultStatus = evaluateBinaryTradeResult(trade.direction, trade.entry_price, settlementPrice);
    if (effectiveOutcomeMode === "force_win") {
      resultStatus = "won";
      const epsilon = Math.pow(10, -Math.max(2, Math.min(10, toNumber(findPairByIdStatement.get(trade.pair_id)?.price_precision, 2))));
      settlementPrice = trade.direction === "long" ? toNumber(trade.entry_price, 0) + epsilon : toNumber(trade.entry_price, 0) - epsilon;
    } else if (effectiveOutcomeMode === "force_loss") {
      resultStatus = "lost";
      const epsilon = Math.pow(10, -Math.max(2, Math.min(10, toNumber(findPairByIdStatement.get(trade.pair_id)?.price_precision, 2))));
      settlementPrice = trade.direction === "long" ? toNumber(trade.entry_price, 0) - epsilon : toNumber(trade.entry_price, 0) + epsilon;
    }

    const stake = toMoney(toNumber(trade.stake_amount_usd, 0));
    const payoutPercent = toMoney(toNumber(trade.payout_percent_snapshot, 0));
    const drawRefundPercent = toMoney(toNumber(trade.draw_refund_percent_snapshot, 100));

    const walletSymbol = normalizeWalletAssetSymbol(
      trade.wallet_asset_symbol || settings.binaryWalletAssetSymbol || "BINARY_USDT",
      "BINARY_USDT",
    );

    const settleTx = db.transaction(() => {
      const detail = ensureWalletDetailRow(trade.user_id, walletSymbol, nowIso, walletSymbol);
      const beforeAvailable = toNumber(detail.available_usd, 0);
      const beforeLocked = toNumber(detail.locked_usd, 0);
      const rewardEarnedBefore = toNumber(detail.reward_earned_usd, 0);

      const unlockedStake = Math.min(beforeLocked, stake);
      let nextLocked = toMoney(Math.max(0, beforeLocked - unlockedStake));
      let nextAvailable = toMoney(beforeAvailable);
      let rewardEarned = rewardEarnedBefore;
      let pnlUsd = 0;
      let note = "";

      if (resultStatus === "won") {
        const profit = toMoney(stake * (payoutPercent / 100));
        nextAvailable = toMoney(beforeAvailable + unlockedStake + profit);
        rewardEarned = toMoney(rewardEarnedBefore + profit);
        pnlUsd = toMoney(profit);
        note = "Trade won.";

        writeWalletLedger({
          userId: trade.user_id,
          tradeId: trade.id,
          ledgerType: "binary_refund",
          assetSymbol: walletSymbol,
          amountUsd: unlockedStake,
          balanceBeforeUsd: beforeAvailable,
          balanceAfterUsd: beforeAvailable + unlockedStake,
          note: `Principal returned for ${trade.trade_ref}.`,
          createdBy: actor,
        });

        writeWalletLedger({
          userId: trade.user_id,
          tradeId: trade.id,
          ledgerType: "binary_win_profit",
          assetSymbol: walletSymbol,
          amountUsd: profit,
          balanceBeforeUsd: beforeAvailable + unlockedStake,
          balanceAfterUsd: nextAvailable,
          note: `Profit credited for ${trade.trade_ref}.`,
          createdBy: actor,
        });
      } else if (resultStatus === "lost") {
        pnlUsd = toMoney(-stake);
        note = "Trade lost.";

        writeWalletLedger({
          userId: trade.user_id,
          tradeId: trade.id,
          ledgerType: "binary_loss",
          assetSymbol: walletSymbol,
          amountUsd: stake,
          balanceBeforeUsd: beforeAvailable,
          balanceAfterUsd: beforeAvailable,
          note: `Stake consumed for ${trade.trade_ref}.`,
          createdBy: actor,
        });
      } else {
        const allowDrawRefund = settings.allowDrawRefund;
        const refundPercent = allowDrawRefund ? drawRefundPercent : 0;
        const refundAmount = toMoney(stake * (refundPercent / 100));
        nextAvailable = toMoney(beforeAvailable + refundAmount);
        pnlUsd = toMoney(refundAmount - stake);
        note = refundAmount > 0 ? "Trade draw refunded." : "Trade draw without refund.";

        writeWalletLedger({
          userId: trade.user_id,
          tradeId: trade.id,
          ledgerType: "binary_draw_refund",
          assetSymbol: walletSymbol,
          amountUsd: refundAmount,
          balanceBeforeUsd: beforeAvailable,
          balanceAfterUsd: nextAvailable,
          note: `Draw refund for ${trade.trade_ref}.`,
          createdBy: actor,
        });
      }

      const saved = saveWalletDetail({
        userId: trade.user_id,
        assetSymbol: walletSymbol,
        availableUsd: nextAvailable,
        lockedUsd: nextLocked,
        rewardEarnedUsd: rewardEarned,
        updatedAt: nowIso,
      });
      syncWalletSummaryFromDetail({ userId: trade.user_id, assetSymbol: walletSymbol, detail: saved, updatedAt: nowIso });

      updateTradeSettlementStatement.run({
        id: trade.id,
        settlementPrice: toNumber(settlementPrice, 0),
        resultStatus,
        settledAt: nowIso,
        walletLockStatus: "released",
        pnlUsd,
        note: sanitizeShortText(note, 220),
        updatedAt: nowIso,
      });
    });

    settleTx();

    const updated = findTradeByIdStatement.get(trade.id);
    return mapTrade(updated);
  }

  function settleExpiredBinaryTrades({ userId } = {}) {
    const nowIso = toIso(getNow());
    const rows = userId
      ? listExpiredActiveTradesForUserStatement.all({ userId, nowIso })
      : listExpiredActiveTradesGlobalStatement.all({ nowIso });

    for (const row of rows) {
      try {
        settleBinaryTradeById(row.id, "system");
      } catch {
        // Skip unresolved trades and continue.
      }
    }
  }

  function openBinaryTradeForUser(userId, payload = {}) {
    const settings = mapEngineSettings();
    const now = getNow();
    const nowIso = toIso(now);

    settleExpiredBinaryTrades({ userId });

    const account = findUserAccountStatement.get(userId);
    if (!account) {
      throw new Error("User account not found.");
    }

    const accountStatus = normalizeLower(account.account_status || "active");
    if (accountStatus !== "active") {
      throw new Error("Your account cannot open a trade right now.");
    }

    if (settings.requireKycForBinary && normalizeLower(account.kyc_status || "pending") !== "authenticated") {
      throw new Error("KYC authentication is required for binary trading.");
    }

    const pairId = Number(payload.pairId || 0);
    const pair = findPairByIdStatement.get(pairId);
    if (!pair || normalizeBooleanNumber(pair.is_enabled, 0) !== 1) {
      throw new Error("Selected pair is not available.");
    }

    const direction = normalizeDirection(payload.direction || "long");
    const periodSeconds = Math.max(1, Math.floor(toNumber(payload.periodSeconds, 0)));
    const rule = resolveRuleForPeriod(pair.id, periodSeconds);
    if (!rule) {
      throw new Error("Selected period is not available for this pair.");
    }

    const stakeAmountUsd = normalizeUsdAmount(payload.stakeAmountUsd);
    if (stakeAmountUsd < settings.globalMinStakeUsd) {
      throw new Error(`Minimum stake is ${settings.globalMinStakeUsd}.`);
    }
    if (settings.globalMaxStakeUsd !== null && stakeAmountUsd > settings.globalMaxStakeUsd) {
      throw new Error(`Maximum stake is ${settings.globalMaxStakeUsd}.`);
    }

    const openTradesCount = Number(countOpenTradesByUserStatement.get({ userId })?.total || 0);
    if (openTradesCount >= settings.maxOpenTradesPerUser) {
      throw new Error(`Maximum ${settings.maxOpenTradesPerUser} open trade(s) allowed.`);
    }

    if (!settings.allowSameSecondMultiTrade) {
      const sameSecondCount = Number(
        countOpenTradesByUserSameSecondStatement.get({
          userId,
          openedAt: nowIso,
        })?.total || 0,
      );
      if (sameSecondCount > 0) {
        throw new Error("Please wait a second before opening another trade.");
      }
    }

    const entryTick = db
      .prepare(`
        SELECT * FROM binary_price_ticks
        WHERE pair_id = ?
        ORDER BY tick_time DESC, id DESC
        LIMIT 1
      `)
      .get(pair.id);

    const entryPrice = entryTick ? toNumber(entryTick.price, 0) : toNumber(pair.current_price, 0) || pickSeedPrice(pair.pair_code);
    const projection = calculateBinaryTradeProjection(stakeAmountUsd, rule.payoutPercent);
    const tradeRef = buildTradeRef();
    const expiresAt = addSecondsIso(nowIso, periodSeconds, toIso, getNow);

    const createTx = db.transaction(() => {
      const wallets = getOrCreateCoreWallets(userId, settings, nowIso);

      let binaryWallet = findWalletDetailStatement.get(userId, wallets.binarySymbol) || wallets.binary;
      let binaryAvailable = toNumber(binaryWallet?.available_usd, 0);

      if (binaryAvailable < stakeAmountUsd && settings.autoTransferFromSpot) {
        const required = stakeAmountUsd - binaryAvailable;
        const movedWallets = maybeAutoTransferFromSpotToBinary({
          userId,
          requiredAmountUsd: required,
          wallets,
          nowIso,
          actor: userId,
        });
        binaryWallet = findWalletDetailStatement.get(userId, movedWallets.binarySymbol) || movedWallets.binary;
        binaryAvailable = toNumber(binaryWallet?.available_usd, 0);
      }

      if (binaryAvailable < stakeAmountUsd) {
        throw new Error(`Insufficient ${wallets.binarySymbol} balance.`);
      }

      const beforeAvailable = binaryAvailable;
      const beforeLocked = toNumber(binaryWallet?.locked_usd, 0);

      const nextAvailable = toMoney(beforeAvailable - stakeAmountUsd);
      const nextLocked = toMoney(beforeLocked + stakeAmountUsd);
      const nextBinary = saveWalletDetail({
        userId,
        assetSymbol: wallets.binarySymbol,
        availableUsd: nextAvailable,
        lockedUsd: nextLocked,
        rewardEarnedUsd: toNumber(binaryWallet?.reward_earned_usd, 0),
        updatedAt: nowIso,
      });
      syncWalletSummaryFromDetail({ userId, assetSymbol: wallets.binarySymbol, detail: nextBinary, updatedAt: nowIso });

      const insert = insertTradeStatement.run({
        tradeRef,
        userId,
        pairId: pair.id,
        pairCodeSnapshot: normalizeUpper(pair.pair_code || ""),
        pairDisplayNameSnapshot: String(pair.display_name || `${pair.base_asset}/${pair.quote_asset}`),
        direction,
        periodSeconds,
        payoutPercentSnapshot: rule.payoutPercent,
        drawRefundPercentSnapshot: rule.refundPercentOnDraw,
        walletAssetSymbol: wallets.binarySymbol,
        stakeAmountUsd: toMoney(stakeAmountUsd),
        expectedProfitUsd: projection.expectedProfitUsd,
        expectedTotalPayoutUsd: projection.expectedTotalPayoutUsd,
        entryPrice: toNumber(entryPrice, 0),
        settlementPrice: null,
        resultStatus: "active",
        openedAt: nowIso,
        expiresAt,
        settledAt: null,
        walletLockStatus: "locked",
        pnlUsd: 0,
        note: "",
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      writeWalletLedger({
        userId,
        tradeId: Number(insert.lastInsertRowid || 0),
        ledgerType: "binary_lock",
        assetSymbol: wallets.binarySymbol,
        amountUsd: stakeAmountUsd,
        balanceBeforeUsd: beforeAvailable,
        balanceAfterUsd: nextAvailable,
        note: `Stake locked for ${tradeRef}.`,
        createdBy: userId,
      });
    });

    createTx();

    const created = findTradeByRefStatement.get(tradeRef);
    if (!created) {
      throw new Error("Could not open trade.");
    }

    return {
      message: "Binary trade opened successfully.",
      trade: mapTrade(created),
      summary: loadBinarySummaryForUser(userId),
    };
  }

  function loadBinarySummaryForUser(userId) {
    const settings = mapEngineSettings();
    const nowIso = toIso(getNow());
    settleExpiredBinaryTrades({ userId });

    const wallets = getOrCreateCoreWallets(userId, settings, nowIso);
    const latestSpot = findWalletDetailStatement.get(userId, wallets.spotSymbol) || wallets.spot;
    const latestMain = findWalletDetailStatement.get(userId, wallets.mainSymbol) || wallets.main;
    const latestBinary = findWalletDetailStatement.get(userId, wallets.binarySymbol) || wallets.binary;

    const allTrades = db
      .prepare(`SELECT * FROM binary_trades WHERE user_id = ? ORDER BY opened_at DESC, id DESC`)
      .all(userId);

    let winCount = 0;
    let lossCount = 0;
    let drawCount = 0;
    let totalProfit = 0;
    let totalLoss = 0;

    for (const row of allTrades) {
      const status = normalizeTradeResult(row.result_status);
      const pnl = toNumber(row.pnl_usd, 0);
      if (status === "won") {
        winCount += 1;
        totalProfit += Math.max(0, pnl);
      } else if (status === "lost") {
        lossCount += 1;
        totalLoss += Math.abs(Math.min(0, pnl));
      } else if (status === "draw") {
        drawCount += 1;
      }
    }

    const activeTradeCount = allTrades.filter((row) => normalizeTradeResult(row.result_status) === "active").length;

    return {
      binaryWallet: moneyDisplay(toNumber(latestBinary.available_usd, 0)),
      availableBalance: moneyDisplay(toNumber(latestBinary.available_usd, 0)),
      lockedBalance: moneyDisplay(toNumber(latestBinary.locked_usd, 0)),
      spotWallet: moneyDisplay(toNumber(latestSpot.available_usd, 0)),
      mainWallet: moneyDisplay(toNumber(latestMain.available_usd, 0)),
      activeTradeCount,
      totalTrades: allTrades.length,
      winCount,
      lossCount,
      drawCount,
      totalProfit: moneyDisplay(totalProfit),
      totalLoss: moneyDisplay(totalLoss),
      netPnl: moneyDisplay(totalProfit - totalLoss),
      walletAssetSymbol: wallets.binarySymbol,
    };
  }

  function getDefaultPair() {
    const pair = listEnabledPairsStatement.all()[0] || listAllPairsStatement.all()[0] || null;
    return mapPair(pair);
  }

  function getPairChartPayload(pairId, settingsOverride = null) {
    const pairRow = findPairByIdStatement.get(Number(pairId || 0));
    if (!pairRow || normalizeBooleanNumber(pairRow.is_enabled, 0) !== 1) {
      throw new Error("Pair not available.");
    }

    const pair = mapPair(pairRow);
    const settings = settingsOverride || mapEngineSettings();
    const rules = resolveRulesForPair(pair.pairId);
    const ticks = listTicksByPairStatement
      .all({ pairId: pair.pairId, limit: settings.chartHistoryLimit })
      .reverse()
      .map((row) => ({
        tickId: Number(row.id || 0),
        pairId: Number(row.pair_id || 0),
        price: toNumber(row.price, 0),
        tickTime: String(row.tick_time || ""),
        sourceType: String(row.source_type || "internal_feed"),
      }));

    return {
      pair,
      currentPrice: toNumber(pair.currentPrice, 0),
      ticks,
      activePeriodRules: rules,
    };
  }

  function listUserTradeHistory(userId, { resultFilter = "all", pairId = 0, page = 1, limit = 20 } = {}) {
    settleExpiredBinaryTrades({ userId });
    const safePage = Math.max(1, Math.floor(toNumber(page, 1)));
    const safeLimit = Math.max(1, Math.min(100, Math.floor(toNumber(limit, 20))));
    const offset = (safePage - 1) * safeLimit;

    const normalizedFilter = normalizeLower(resultFilter || "all");
    const allowed = new Set(["all", "active", "won", "lost", "draw", "cancelled", "error"]);
    const appliedFilter = allowed.has(normalizedFilter) ? normalizedFilter : "all";

    const rows = listHistoryTradesByUserStatement.all({
      userId,
      resultFilter: appliedFilter,
      pairId: Number(pairId || 0),
      limit: safeLimit,
      offset,
    });
    const total = Number(
      countHistoryTradesByUserStatement.get({ userId, resultFilter: appliedFilter, pairId: Number(pairId || 0) })?.total || 0,
    );

    return {
      trades: rows.map((row) => mapTrade(row)).filter(Boolean),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
      },
    };
  }

  function getAdminBinarySummary() {
    settleExpiredBinaryTrades();

    const trades = db.prepare(`SELECT * FROM binary_trades ORDER BY opened_at DESC`).all();
    let totalActiveStakes = 0;
    let totalSettledProfitPaid = 0;
    let totalLossesCollected = 0;
    let activeTradesCount = 0;
    let todayTradesCount = 0;
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    const pairCountMap = new Map();
    const breakdown = { won: 0, lost: 0, draw: 0, active: 0, cancelled: 0, error: 0 };

    for (const row of trades) {
      const status = normalizeTradeResult(row.result_status);
      const openedMs = parseIsoToMs(row.opened_at || "");
      if (openedMs >= todayStart) {
        todayTradesCount += 1;
      }

      pairCountMap.set(row.pair_code_snapshot, Number(pairCountMap.get(row.pair_code_snapshot) || 0) + 1);
      if (breakdown[status] !== undefined) {
        breakdown[status] += 1;
      }

      if (status === "active") {
        totalActiveStakes += toNumber(row.stake_amount_usd, 0);
        activeTradesCount += 1;
      }
      if (status === "won") {
        totalSettledProfitPaid += Math.max(0, toNumber(row.pnl_usd, 0));
      }
      if (status === "lost") {
        totalLossesCollected += Math.abs(Math.min(0, toNumber(row.pnl_usd, 0)));
      }
    }

    const topTradedPairs = [...pairCountMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([pairCode, count]) => ({ pairCode, count }));

    return {
      totalActiveStakes: moneyDisplay(totalActiveStakes),
      totalSettledProfitPaid: moneyDisplay(totalSettledProfitPaid),
      totalLossesCollected: moneyDisplay(totalLossesCollected),
      netHouseExposure: moneyDisplay(totalLossesCollected - totalSettledProfitPaid),
      activeTradesCount,
      todayTradesCount,
      topTradedPairs,
      breakdown,
      totalTrades: trades.length,
    };
  }

  function parsePairPayload(raw, actorUserId) {
    const pairCode = normalizeUpper(raw.pairCode || raw.pair_code || "");
    const displayName = normalizeText(raw.displayName || raw.display_name || "");
    const baseAsset = normalizeUpper(raw.baseAsset || raw.base_asset || pairCode.replace(/USDT$/i, ""));
    const quoteAsset = normalizeUpper(raw.quoteAsset || raw.quote_asset || "USDT");
    const priceSourceType = normalizePairSourceType(raw.priceSourceType || raw.price_source_type || "internal_feed");
    const sourceSymbol = normalizeText(raw.sourceSymbol || raw.source_symbol || pairCode);
    const pricePrecision = Math.max(2, Math.min(10, Math.floor(toNumber(raw.pricePrecision ?? raw.price_precision, 2))));
    const chartTimeframeLabel = normalizeText(raw.chartTimeframeLabel || raw.chart_timeframe_label || "1s") || "1s";
    const isEnabled = normalizeBooleanNumber(raw.isEnabled ?? raw.is_enabled, 1);
    const isFeatured = normalizeBooleanNumber(raw.isFeatured ?? raw.is_featured, 0);
    const displaySortOrder = Math.max(0, Math.floor(toNumber(raw.displaySortOrder ?? raw.display_sort_order, 0)));

    if (!pairCode) {
      throw new Error("Pair code is required.");
    }
    if (!displayName) {
      throw new Error("Display name is required.");
    }
    if (!baseAsset || !quoteAsset) {
      throw new Error("Base and quote assets are required.");
    }

    const existing = findPairByCodeStatement.get(pairCode);
    const seedPrice = existing ? toNumber(existing.current_price, 0) : pickSeedPrice(pairCode);

    return {
      pairCode,
      displayName,
      baseAsset,
      quoteAsset,
      priceSourceType,
      sourceSymbol,
      currentPrice: seedPrice,
      previousPrice: seedPrice,
      pricePrecision,
      chartTimeframeLabel,
      isEnabled,
      isFeatured,
      displaySortOrder,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    };
  }

  function parseRulePayload(raw, actorUserId) {
    const pairIdRaw = raw.pairId ?? raw.pair_id;
    const pairId = pairIdRaw === null || pairIdRaw === undefined || pairIdRaw === "" ? null : Number(pairIdRaw);

    if (pairId !== null && (!Number.isInteger(pairId) || pairId <= 0)) {
      throw new Error("Invalid pair id for rule.");
    }

    const periodSeconds = Math.max(1, Math.floor(toNumber(raw.periodSeconds ?? raw.period_seconds, 0)));
    const payoutPercent = toMoney(toNumber(raw.payoutPercent ?? raw.payout_percent, 0));
    const refundPercentOnDraw = toMoney(toNumber(raw.refundPercentOnDraw ?? raw.refund_percent_on_draw, 100));
    const isActive = normalizeBooleanNumber(raw.isActive ?? raw.is_active, 1);
    const displaySortOrder = Math.max(0, Math.floor(toNumber(raw.displaySortOrder ?? raw.display_sort_order, 0)));

    if (periodSeconds <= 0) {
      throw new Error("Period seconds must be greater than zero.");
    }

    return {
      pairId,
      periodSeconds,
      payoutPercent,
      refundPercentOnDraw,
      isActive,
      displaySortOrder,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    };
  }

  function handleBinarySummary(req, res) {
    try {
      const summary = loadBinarySummaryForUser(req.currentUser.userId);
      res.json({ ok: true, data: summary, summary });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not load binary summary." });
    }
  }

  function handleBinaryPairs(_req, res) {
    try {
      ensureDefaultPairsFromDepositAssets();
      const pairs = listEnabledPairsStatement.all().map((row) => mapPair(row)).filter(Boolean);
      res.json({ ok: true, data: pairs, pairs });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not load pairs." });
    }
  }

  function handleBinaryPairChart(req, res) {
    try {
      const pairId = Number(req.params?.id || req.query?.pairId || req.body?.pairId || 0);
      if (!Number.isInteger(pairId) || pairId <= 0) {
        throw new Error("Valid pair id is required.");
      }

      settleExpiredBinaryTrades({ userId: req.currentUser.userId });
      const chart = getPairChartPayload(pairId);
      res.json({ ok: true, data: chart, ...chart });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not load pair chart." });
    }
  }

  function handleBinaryConfig(_req, res) {
    try {
      ensureDefaultPairsFromDepositAssets();
      const settings = mapEngineSettings();
      const defaultPair = getDefaultPair();
      const availablePeriods = defaultPair ? resolveRulesForPair(defaultPair.pairId) : [];

      res.json({
        ok: true,
        data: {
          minStakeUsd: settings.globalMinStakeUsd,
          maxStakeUsd: settings.globalMaxStakeUsd,
          settings,
          availablePeriods,
          defaultPair,
          engineMode: settings.engineMode,
        },
      });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not load binary config." });
    }
  }

  function handleBinaryTradeOpen(req, res) {
    try {
      const payload = openBinaryTradeForUser(req.currentUser.userId, {
        pairId: req.body.pairId,
        direction: req.body.direction,
        periodSeconds: req.body.periodSeconds,
        stakeAmountUsd: req.body.stakeAmountUsd,
      });
      res.json({ ok: true, data: payload, ...payload });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not open trade." });
    }
  }

  function handleBinaryActiveTrades(req, res) {
    try {
      settleExpiredBinaryTrades({ userId: req.currentUser.userId });
      const rows = listActiveTradesByUserStatement.all({ userId: req.currentUser.userId });
      const trades = rows.map((row) => mapTrade(row)).filter(Boolean);
      res.json({ ok: true, data: trades, trades });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not load active trades." });
    }
  }

  function handleBinaryTradeHistory(req, res) {
    try {
      const payload = listUserTradeHistory(req.currentUser.userId, {
        resultFilter: req.query?.result || req.body?.result || "all",
        pairId: Number(req.query?.pairId || req.body?.pairId || 0),
        page: Number(req.query?.page || req.body?.page || 1),
        limit: Number(req.query?.limit || req.body?.limit || 20),
      });
      res.json({ ok: true, data: payload, ...payload });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not load trade history." });
    }
  }

  function handleBinaryTradeDetail(req, res) {
    try {
      settleExpiredBinaryTrades({ userId: req.currentUser.userId });
      const tradeId = Number(req.params?.id || req.query?.tradeId || req.body?.tradeId || 0);
      if (!Number.isInteger(tradeId) || tradeId <= 0) {
        throw new Error("Valid trade id is required.");
      }
      const trade = findTradeByIdStatement.get(tradeId);
      if (!trade || String(trade.user_id || "") !== String(req.currentUser.userId || "")) {
        res.status(404).json({ ok: false, error: "Trade not found." });
        return;
      }
      res.json({ ok: true, data: mapTrade(trade), trade: mapTrade(trade) });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not load trade detail." });
    }
  }

  function handleBinaryTradeSettle(req, res) {
    try {
      const tradeId = Number(req.params?.id || req.query?.tradeId || req.body?.tradeId || 0);
      if (!Number.isInteger(tradeId) || tradeId <= 0) {
        throw new Error("Valid trade id is required.");
      }
      const trade = findTradeByIdStatement.get(tradeId);
      if (!trade || String(trade.user_id || "") !== String(req.currentUser.userId || "")) {
        res.status(404).json({ ok: false, error: "Trade not found." });
        return;
      }

      const settled = settleBinaryTradeById(tradeId, req.currentUser.userId);
      res.json({
        ok: true,
        data: {
          trade: settled,
          summary: loadBinarySummaryForUser(req.currentUser.userId),
        },
      });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not settle trade." });
    }
  }

  function handleAdminBinaryDashboardSummary(req, res) {
    try {
      settleExpiredBinaryTrades();
      const summary = getAdminBinarySummary();
      res.json({ ok: true, data: summary, summary });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not load binary dashboard summary." });
    }
  }

  function handleAdminBinaryPairs(_req, res) {
    try {
      ensureDefaultPairsFromDepositAssets();
      const pairs = listAllPairsStatement.all().map((row) => mapPair(row)).filter(Boolean);
      res.json({ ok: true, data: pairs, pairs });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not load admin pairs." });
    }
  }

  function handleAdminBinaryPairCreate(req, res) {
    try {
      const payload = parsePairPayload(req.body || {}, req.currentUser.userId);
      if (findPairByCodeStatement.get(payload.pairCode)) {
        throw new Error("Pair code already exists.");
      }

      const nowIso = toIso(getNow());
      const result = insertPairStatement.run({
        ...payload,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      insertTickStatement.run({
        pairId: Number(result.lastInsertRowid || 0),
        price: payload.currentPrice,
        tickTime: nowIso,
        sourceType: payload.priceSourceType,
        createdAt: nowIso,
      });

      writeAudit(req.currentUser.userId, "pair_create", "pair", result.lastInsertRowid, payload.displayName);

      res.json({
        ok: true,
        data: {
          message: "Binary pair created.",
          pair: mapPair(findPairByIdStatement.get(result.lastInsertRowid)),
        },
      });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not create pair." });
    }
  }

  function handleAdminBinaryPairUpdate(req, res) {
    try {
      const pairId = Number(req.body?.pairId || req.body?.id || 0);
      if (!Number.isInteger(pairId) || pairId <= 0) {
        throw new Error("Valid pairId is required.");
      }
      const existing = findPairByIdStatement.get(pairId);
      if (!existing) {
        res.status(404).json({ ok: false, error: "Pair not found." });
        return;
      }

      const payload = parsePairPayload({ ...existing, ...req.body }, req.currentUser.userId);
      const duplicate = findPairByCodeStatement.get(payload.pairCode);
      if (duplicate && Number(duplicate.id) !== pairId) {
        throw new Error("Pair code already exists.");
      }

      updatePairStatement.run({
        ...payload,
        id: pairId,
        updatedAt: toIso(getNow()),
      });

      writeAudit(req.currentUser.userId, "pair_update", "pair", pairId, payload.displayName);

      res.json({ ok: true, data: { message: "Pair updated.", pair: mapPair(findPairByIdStatement.get(pairId)) } });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not update pair." });
    }
  }

  function handleAdminBinaryPairDelete(req, res) {
    try {
      const pairId = Number(req.body?.pairId || req.query?.pairId || 0);
      if (!Number.isInteger(pairId) || pairId <= 0) {
        throw new Error("Valid pairId is required.");
      }
      const existing = findPairByIdStatement.get(pairId);
      if (!existing) {
        res.status(404).json({ ok: false, error: "Pair not found." });
        return;
      }

      deletePairStatement.run(pairId);
      writeAudit(req.currentUser.userId, "pair_delete", "pair", pairId, existing.display_name || "");

      res.json({ ok: true, data: { message: "Pair deleted.", pairId } });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not delete pair." });
    }
  }

  function handleAdminBinaryPairToggle(req, res) {
    try {
      const pairId = Number(req.body?.pairId || 0);
      if (!Number.isInteger(pairId) || pairId <= 0) {
        throw new Error("Valid pairId is required.");
      }
      const existing = findPairByIdStatement.get(pairId);
      if (!existing) {
        res.status(404).json({ ok: false, error: "Pair not found." });
        return;
      }

      const isEnabled = normalizeBooleanNumber(req.body?.isEnabled, normalizeBooleanNumber(existing.is_enabled, 1));
      updatePairStatusStatement.run({
        id: pairId,
        isEnabled,
        updatedAt: toIso(getNow()),
        updatedBy: req.currentUser.userId,
      });

      writeAudit(req.currentUser.userId, "pair_toggle_status", "pair", pairId, `isEnabled=${isEnabled}`);

      res.json({
        ok: true,
        data: {
          message: "Pair status updated.",
          pair: mapPair(findPairByIdStatement.get(pairId)),
        },
      });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not toggle pair status." });
    }
  }

  function handleAdminBinaryPeriodRules(_req, res) {
    try {
      const rules = listRulesForAdminStatement.all().map((row) => mapRule(row)).filter(Boolean);
      res.json({ ok: true, data: rules, rules });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not load period rules." });
    }
  }

  function handleAdminBinaryPeriodRuleSave(req, res) {
    try {
      const ruleId = Number(req.body?.ruleId || 0);
      const payload = parseRulePayload(req.body || {}, req.currentUser.userId);
      const nowIso = toIso(getNow());

      if (ruleId > 0) {
        const existing = findRuleByIdStatement.get(ruleId);
        if (!existing) {
          res.status(404).json({ ok: false, error: "Rule not found." });
          return;
        }

        updateRuleStatement.run({
          id: ruleId,
          ...payload,
          updatedAt: nowIso,
        });
        writeAudit(req.currentUser.userId, "period_rule_update", "period_rule", ruleId, `${payload.periodSeconds}s`);

        res.json({
          ok: true,
          data: { message: "Rule updated.", rule: mapRule(findRuleByIdStatement.get(ruleId)) },
        });
        return;
      }

      const insert = insertRuleStatement.run({
        ...payload,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      writeAudit(req.currentUser.userId, "period_rule_create", "period_rule", insert.lastInsertRowid, `${payload.periodSeconds}s`);

      res.json({
        ok: true,
        data: { message: "Rule created.", rule: mapRule(findRuleByIdStatement.get(insert.lastInsertRowid)) },
      });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not save period rule." });
    }
  }

  function handleAdminBinaryTrades(req, res) {
    try {
      settleExpiredBinaryTrades();
      const resultFilter = normalizeLower(req.query?.status || req.body?.status || "all");
      const pairId = Number(req.query?.pairId || req.body?.pairId || 0);
      const keyword = sanitizeShortText(req.query?.keyword || req.body?.keyword || "", 120);
      const likeKeyword = `%${keyword}%`;
      const page = Math.max(1, Math.floor(toNumber(req.query?.page || req.body?.page, 1)));
      const limit = Math.max(1, Math.min(200, Math.floor(toNumber(req.query?.limit || req.body?.limit, 50))));
      const offset = (page - 1) * limit;

      const rows = listTradesForAdminStatement.all({
        resultFilter,
        pairId,
        keyword,
        likeKeyword,
        limit,
        offset,
      });
      const total = Number(
        countTradesForAdminStatement.get({ resultFilter, pairId, keyword, likeKeyword })?.total || 0,
      );

      res.json({
        ok: true,
        data: {
          trades: rows.map((row) => mapTrade(row, { includeAccount: true })).filter(Boolean),
          pagination: { page, limit, total },
        },
      });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not load admin trades." });
    }
  }

  function handleAdminBinaryTradeSettle(req, res) {
    try {
      const tradeId = Number(req.body?.tradeId || 0);
      if (!Number.isInteger(tradeId) || tradeId <= 0) {
        throw new Error("Valid tradeId is required.");
      }
      const settled = settleBinaryTradeById(tradeId, req.currentUser.userId);
      writeAudit(req.currentUser.userId, "trade_force_settle", "trade", tradeId, req.body?.note || "");
      res.json({ ok: true, data: { message: "Trade settled.", trade: settled } });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not settle trade." });
    }
  }

  function handleAdminBinaryTradeCancel(req, res) {
    try {
      const tradeId = Number(req.body?.tradeId || 0);
      if (!Number.isInteger(tradeId) || tradeId <= 0) {
        throw new Error("Valid tradeId is required.");
      }
      const trade = findTradeByIdStatement.get(tradeId);
      if (!trade) {
        res.status(404).json({ ok: false, error: "Trade not found." });
        return;
      }
      if (normalizeTradeResult(trade.result_status) !== "active") {
        throw new Error("Only active trades can be cancelled.");
      }

      const nowIso = toIso(getNow());
      const settings = mapEngineSettings();
      const walletSymbol = normalizeWalletAssetSymbol(
        trade.wallet_asset_symbol || settings.binaryWalletAssetSymbol || "BINARY_USDT",
        "BINARY_USDT",
      );

      const tx = db.transaction(() => {
        const detail = ensureWalletDetailRow(trade.user_id, walletSymbol, nowIso, walletSymbol);
        const beforeAvailable = toNumber(detail.available_usd, 0);
        const beforeLocked = toNumber(detail.locked_usd, 0);
        const stake = toNumber(trade.stake_amount_usd, 0);
        const unlocked = Math.min(beforeLocked, stake);

        const nextAvailable = toMoney(beforeAvailable + unlocked);
        const nextLocked = toMoney(Math.max(0, beforeLocked - unlocked));

        const saved = saveWalletDetail({
          userId: trade.user_id,
          assetSymbol: walletSymbol,
          availableUsd: nextAvailable,
          lockedUsd: nextLocked,
          rewardEarnedUsd: toNumber(detail.reward_earned_usd, 0),
          updatedAt: nowIso,
        });
        syncWalletSummaryFromDetail({ userId: trade.user_id, assetSymbol: walletSymbol, detail: saved, updatedAt: nowIso });

        writeWalletLedger({
          userId: trade.user_id,
          tradeId: trade.id,
          ledgerType: "binary_refund",
          assetSymbol: walletSymbol,
          amountUsd: unlocked,
          balanceBeforeUsd: beforeAvailable,
          balanceAfterUsd: nextAvailable,
          note: `Trade cancelled by admin: ${trade.trade_ref}`,
          createdBy: req.currentUser.userId,
        });

        updateTradeSettlementStatement.run({
          id: trade.id,
          settlementPrice: null,
          resultStatus: "cancelled",
          settledAt: nowIso,
          walletLockStatus: "released",
          pnlUsd: 0,
          note: sanitizeShortText(req.body?.note || "Cancelled by admin.", 220),
          updatedAt: nowIso,
        });
      });

      tx();
      writeAudit(req.currentUser.userId, "trade_cancel", "trade", tradeId, req.body?.note || "");

      res.json({ ok: true, data: { message: "Trade cancelled and refunded.", trade: mapTrade(findTradeByIdStatement.get(tradeId)) } });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not cancel trade." });
    }
  }

  function handleAdminBinaryEngineSettingsGet(_req, res) {
    try {
      const settings = mapEngineSettings();
      res.json({ ok: true, data: settings, settings });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not load engine settings." });
    }
  }

  function handleAdminBinaryEngineSettingsSave(req, res) {
    try {
      const current = mapEngineSettings();
      const nowIso = toIso(getNow());

      const next = {
        engineMode: normalizeEngineMode(req.body?.engineMode ?? req.body?.engine_mode ?? current.engineMode),
        settlementPriceMode:
          normalizeText(req.body?.settlementPriceMode ?? req.body?.settlement_price_mode ?? current.settlementPriceMode) ||
          current.settlementPriceMode,
        tickIntervalMs: Math.max(400, Math.min(60_000, Math.floor(toNumber(req.body?.tickIntervalMs ?? req.body?.tick_interval_ms, current.tickIntervalMs)))),
        chartHistoryLimit: Math.max(60, Math.min(1000, Math.floor(toNumber(req.body?.chartHistoryLimit ?? req.body?.chart_history_limit, current.chartHistoryLimit)))),
        binaryWalletAssetSymbol:
          normalizeWalletAssetSymbol(
            req.body?.binaryWalletAssetSymbol ?? req.body?.binary_wallet_asset_symbol ?? current.binaryWalletAssetSymbol,
            current.binaryWalletAssetSymbol,
          ) || current.binaryWalletAssetSymbol,
        requireKycForBinary: normalizeBooleanNumber(req.body?.requireKycForBinary ?? req.body?.require_kyc_for_binary, current.requireKycForBinary ? 1 : 0),
        allowDrawRefund: normalizeBooleanNumber(req.body?.allowDrawRefund ?? req.body?.allow_draw_refund, current.allowDrawRefund ? 1 : 0),
        maxOpenTradesPerUser: Math.max(1, Math.floor(toNumber(req.body?.maxOpenTradesPerUser ?? req.body?.max_open_trades_per_user, current.maxOpenTradesPerUser))),
        globalMinStakeUsd: Math.max(0.01, toMoney(toNumber(req.body?.globalMinStakeUsd ?? req.body?.global_min_stake_usd, current.globalMinStakeUsd))),
        globalMaxStakeUsd:
          req.body?.globalMaxStakeUsd === null || req.body?.global_max_stake_usd === null || req.body?.globalMaxStakeUsd === "" || req.body?.global_max_stake_usd === ""
            ? null
            : Math.max(0.01, toMoney(toNumber(req.body?.globalMaxStakeUsd ?? req.body?.global_max_stake_usd, current.globalMaxStakeUsd || 0))),
        allowSameSecondMultiTrade: normalizeBooleanNumber(
          req.body?.allowSameSecondMultiTrade ?? req.body?.allow_same_second_multi_trade,
          current.allowSameSecondMultiTrade ? 1 : 0,
        ),
        tradeOutcomeMode: normalizeOutcomeMode(req.body?.tradeOutcomeMode ?? req.body?.trade_outcome_mode ?? current.tradeOutcomeMode),
        autoTransferFromSpot: normalizeBooleanNumber(req.body?.autoTransferFromSpot ?? req.body?.auto_transfer_from_spot, current.autoTransferFromSpot ? 1 : 0),
      };

      if (next.globalMaxStakeUsd !== null && next.globalMaxStakeUsd < next.globalMinStakeUsd) {
        throw new Error("Max stake must be greater than or equal to min stake.");
      }

      upsertEngineSettingsStatement.run({
        ...next,
        requireKycForBinary: next.requireKycForBinary,
        allowDrawRefund: next.allowDrawRefund,
        allowSameSecondMultiTrade: next.allowSameSecondMultiTrade,
        autoTransferFromSpot: next.autoTransferFromSpot,
        createdAt: findEngineSettingsStatement.get()?.created_at || nowIso,
        updatedAt: nowIso,
      });

      startTickEngine();
      writeAudit(req.currentUser.userId, "engine_settings_save", "engine_settings", "1", JSON.stringify(next));

      res.json({ ok: true, data: { message: "Engine settings updated.", settings: mapEngineSettings() } });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not save engine settings." });
    }
  }

  function handleAdminBinaryManualTickPush(req, res) {
    try {
      const pairId = Number(req.body?.pairId || 0);
      const price = toNumber(req.body?.price, 0);
      if (!Number.isInteger(pairId) || pairId <= 0) {
        throw new Error("Valid pairId is required.");
      }
      if (!Number.isFinite(price) || price <= 0) {
        throw new Error("Valid price is required.");
      }

      const pair = findPairByIdStatement.get(pairId);
      if (!pair) {
        res.status(404).json({ ok: false, error: "Pair not found." });
        return;
      }

      const nowIso = toIso(getNow());
      updatePairPriceStatement.run({
        id: pairId,
        previousPrice: toNumber(pair.current_price, price),
        currentPrice: price,
        updatedAt: nowIso,
      });

      insertTickStatement.run({
        pairId,
        price,
        tickTime: nowIso,
        sourceType: "manual_admin_feed",
        createdAt: nowIso,
      });

      syncPairTicks(mapEngineSettings().chartHistoryLimit * 3);
      writeAudit(req.currentUser.userId, "manual_tick_push", "pair", pairId, `price=${price}`);

      res.json({ ok: true, data: { message: "Manual tick pushed.", chart: getPairChartPayload(pairId) } });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message || "Could not push manual tick." });
    }
  }

  return {
    settleExpiredBinaryTrades,
    settleBinaryTradeById,
    resolveSettlementPrice,
    calculateBinaryTradeProjection,
    evaluateBinaryTradeResult,

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

    mapEngineSettings,
  };
}
