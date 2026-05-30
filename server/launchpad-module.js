function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toInt(value, fallback = 0) {
  return Math.floor(toNumber(value, fallback));
}

function toMoney(value) {
  return Number(toNumber(value, 0).toFixed(8));
}

function normalizeText(value = "") {
  return String(value ?? "").trim();
}

function normalizeUpper(value = "") {
  return normalizeText(value).toUpperCase();
}

function normalizeLower(value = "") {
  return normalizeText(value).toLowerCase();
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

function toIsoSafe(value) {
  try {
    return new Date(value).toISOString();
  } catch {
    return "";
  }
}

function parseIsoMs(value = "") {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function buildPagination(rawPage, rawLimit, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(1, toInt(rawPage, 1));
  const limit = Math.max(1, Math.min(maxLimit, toInt(rawLimit, defaultLimit)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function normalizeCoreWalletSymbol(value = "", fallback = "SPOT_USDT") {
  const raw = normalizeUpper(value).replace(/[^A-Z0-9_]/g, "");
  const normalized = raw || normalizeUpper(fallback);

  const aliases = {
    SPOTUSDT: "SPOT_USDT",
    MAINUSDT: "MAIN_USDT",
    BINARYUSDT: "BINARY_USDT",
  };

  if (aliases[normalized]) {
    return aliases[normalized];
  }

  if (/^(SPOT|MAIN|BINARY)_?[A-Z0-9]+$/.test(normalized)) {
    if (normalized.includes("_")) {
      return normalized;
    }
    const scope = normalized.startsWith("SPOT")
      ? "SPOT"
      : normalized.startsWith("MAIN")
        ? "MAIN"
        : "BINARY";
    const asset = normalized.replace(/^(SPOT|MAIN|BINARY)/, "") || "USDT";
    return `${scope}_${asset}`;
  }

  if (/^[A-Z0-9]+$/.test(normalized)) {
    return `SPOT_${normalized}`;
  }

  return normalizeUpper(fallback || "SPOT_USDT");
}

function makeSpotWalletSymbol(assetCode = "") {
  const asset = normalizeUpper(assetCode).replace(/[^A-Z0-9]/g, "") || "USDT";
  return normalizeCoreWalletSymbol(`SPOT_${asset}`, `SPOT_${asset}`);
}

function makeLaunchRef() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `LCH-${stamp}-${rand}`;
}

function makeParticipationRef() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `LPO-${stamp}-${rand}`;
}

function normalizeLaunchStatus(value = "draft") {
  const normalized = normalizeLower(value);
  if (["draft", "upcoming", "live", "ended", "sold_out", "releasing", "released", "paused", "cancelled"].includes(normalized)) {
    return normalized;
  }
  return "draft";
}

function normalizeEventType(value = "system") {
  const normalized = normalizeLower(value);
  if (["real_buy", "real_join", "simulated_buy", "simulated_join", "whale_alert", "system"].includes(normalized)) {
    return normalized;
  }
  return "system";
}

function randomBetween(min, max) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.random() * (high - low) + low;
}

const SIM_USERS = ["CryptoNinja", "TraderX", "WhaleEyes", "BullRunner", "BitNova", "AlphaQuant", "CoinArc", "MetaPulse"];
const SIM_COUNTRIES = ["SG", "AE", "UK", "US", "JP", "HK", "DE", "CA"];

export function createLaunchpadModule({
  db,
  getNow,
  toIso,
  normalizeAssetSymbol,
  normalizeUsdAmount,
  sanitizeShortText,
  notificationHooks = null,
}) {
  function safeNotify(hookName, payload) {
    const hook = notificationHooks?.[hookName];
    if (typeof hook !== "function") {
      return;
    }
    try {
      hook(payload);
    } catch {
      // Non-blocking by design: launchpad workflow must continue even if notifications fail.
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS launch_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      launch_ref TEXT NOT NULL UNIQUE,
      coin_symbol TEXT NOT NULL,
      coin_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      launch_price_usd REAL NOT NULL,
      listing_price_usd REAL NOT NULL,
      total_supply REAL NOT NULL,
      tokens_for_sale REAL NOT NULL,
      min_buy_usd REAL NOT NULL DEFAULT 10,
      max_buy_usd REAL NOT NULL DEFAULT 100000,
      per_user_cap_usd REAL NOT NULL DEFAULT 5000,
      max_slots INTEGER NOT NULL DEFAULT 500,
      vip_start_at TEXT,
      public_start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      trading_open_at TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      sold_tokens REAL NOT NULL DEFAULT 0,
      sold_usd REAL NOT NULL DEFAULT 0,
      watchlist_count INTEGER NOT NULL DEFAULT 0,
      hype_percent REAL NOT NULL DEFAULT 0,
      expected_roi_x REAL NOT NULL DEFAULT 1,
      last_activity_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS launch_price_tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      launch_id INTEGER NOT NULL,
      min_sold_percent REAL NOT NULL,
      max_sold_percent REAL NOT NULL,
      price_usd REAL NOT NULL,
      display_sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS launch_participations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participation_ref TEXT NOT NULL UNIQUE,
      launch_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      buy_usd REAL NOT NULL,
      allocation_tokens REAL NOT NULL,
      price_used_usd REAL NOT NULL,
      wallet_debit_symbol TEXT NOT NULL DEFAULT 'SPOT_USDT',
      release_wallet_symbol TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      released_at TEXT
    );

    CREATE TABLE IF NOT EXISTS launch_watchlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      launch_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(launch_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS launch_activity_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      launch_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      is_simulated INTEGER NOT NULL DEFAULT 0,
      message TEXT NOT NULL,
      display_name TEXT,
      country_code TEXT,
      amount_usd REAL,
      token_amount REAL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS launch_hype_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      launch_id INTEGER NOT NULL,
      hype_percent REAL NOT NULL,
      metrics_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS launch_market_sync (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      launch_id INTEGER NOT NULL UNIQUE,
      spot_pair_code TEXT,
      spot_pair_id INTEGER,
      spot_sync_status TEXT NOT NULL DEFAULT 'pending',
      convert_pair_code TEXT,
      convert_pair_id INTEGER,
      convert_sync_status TEXT NOT NULL DEFAULT 'pending',
      binary_pair_code TEXT,
      binary_pair_id INTEGER,
      binary_sync_status TEXT NOT NULL DEFAULT 'pending',
      auto_created_at TEXT,
      last_synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS launch_engine_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      launchpad_enabled INTEGER NOT NULL DEFAULT 1,
      maintenance_mode_enabled INTEGER NOT NULL DEFAULT 0,
      maintenance_message TEXT,
      simulated_feed_enabled INTEGER NOT NULL DEFAULT 1,
      simulated_idle_seconds INTEGER NOT NULL DEFAULT 45,
      simulated_min_amount_usd REAL NOT NULL DEFAULT 50,
      simulated_max_amount_usd REAL NOT NULL DEFAULT 2500,
      whale_threshold_usd REAL NOT NULL DEFAULT 1000,
      auto_release_enabled INTEGER NOT NULL DEFAULT 1,
      default_trading_delay_seconds INTEGER NOT NULL DEFAULT 900,
      allow_labelled_simulated_feed INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS launch_admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_user_id TEXT,
      action_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_launch_projects_status_time ON launch_projects(status, public_start_at, end_at);
    CREATE INDEX IF NOT EXISTS idx_launch_participations_launch_user ON launch_participations(launch_id, user_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_launch_activity_events_launch_time ON launch_activity_events(launch_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_launch_watchlists_launch ON launch_watchlists(launch_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_launch_watchlists_user ON launch_watchlists(user_id, created_at DESC);
  `);

  const ensureColumn = (tableName, columnName, columnDefinition) => {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => String(column.name || ""));
    if (!columns.includes(columnName)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
    }
  };

  ensureColumn("binary_pairs", "category_id", "category_id INTEGER");
  ensureColumn("binary_pairs", "market_symbol", "market_symbol TEXT");
  ensureColumn("binary_pairs", "icon_image_url", "icon_image_url TEXT");

  const q = {
    engineGet: db.prepare(`SELECT * FROM launch_engine_settings WHERE id = 1 LIMIT 1`),
    engineSave: db.prepare(`
      INSERT INTO launch_engine_settings (
        id,
        launchpad_enabled,
        maintenance_mode_enabled,
        maintenance_message,
        simulated_feed_enabled,
        simulated_idle_seconds,
        simulated_min_amount_usd,
        simulated_max_amount_usd,
        whale_threshold_usd,
        auto_release_enabled,
        default_trading_delay_seconds,
        allow_labelled_simulated_feed,
        updated_at,
        updated_by
      ) VALUES (
        1,
        @launchpadEnabled,
        @maintenanceModeEnabled,
        @maintenanceMessage,
        @simulatedFeedEnabled,
        @simulatedIdleSeconds,
        @simulatedMinAmountUsd,
        @simulatedMaxAmountUsd,
        @whaleThresholdUsd,
        @autoReleaseEnabled,
        @defaultTradingDelaySeconds,
        @allowLabelledSimulatedFeed,
        @updatedAt,
        @updatedBy
      )
      ON CONFLICT(id) DO UPDATE SET
        launchpad_enabled = excluded.launchpad_enabled,
        maintenance_mode_enabled = excluded.maintenance_mode_enabled,
        maintenance_message = excluded.maintenance_message,
        simulated_feed_enabled = excluded.simulated_feed_enabled,
        simulated_idle_seconds = excluded.simulated_idle_seconds,
        simulated_min_amount_usd = excluded.simulated_min_amount_usd,
        simulated_max_amount_usd = excluded.simulated_max_amount_usd,
        whale_threshold_usd = excluded.whale_threshold_usd,
        auto_release_enabled = excluded.auto_release_enabled,
        default_trading_delay_seconds = excluded.default_trading_delay_seconds,
        allow_labelled_simulated_feed = excluded.allow_labelled_simulated_feed,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `),
    launchById: db.prepare(`SELECT * FROM launch_projects WHERE id = ? LIMIT 1`),
    launchByRef: db.prepare(`SELECT * FROM launch_projects WHERE launch_ref = ? LIMIT 1`),
    launchBySymbol: db.prepare(`SELECT * FROM launch_projects WHERE coin_symbol = ? ORDER BY id DESC LIMIT 1`),
    listLaunches: db.prepare(`
      SELECT *
      FROM launch_projects
      WHERE (@status = 'all' OR status = @status)
      ORDER BY
        CASE
          WHEN status = 'live' THEN 1
          WHEN status = 'upcoming' THEN 2
          WHEN status = 'draft' THEN 3
          WHEN status = 'ended' THEN 4
          WHEN status = 'released' THEN 5
          ELSE 6
        END,
        public_start_at ASC,
        id DESC
      LIMIT @limit OFFSET @offset
    `),
    countLaunches: db.prepare(`SELECT COUNT(*) AS total FROM launch_projects WHERE (@status = 'all' OR status = @status)`),
    listUserWatchlistedLaunches: db.prepare(`
      SELECT p.*
      FROM launch_watchlists w
      INNER JOIN launch_projects p ON p.id = w.launch_id
      WHERE w.user_id = ?
      ORDER BY w.created_at DESC
    `),
    insertLaunch: db.prepare(`
      INSERT INTO launch_projects (
        launch_ref,
        coin_symbol,
        coin_name,
        description,
        launch_price_usd,
        listing_price_usd,
        total_supply,
        tokens_for_sale,
        min_buy_usd,
        max_buy_usd,
        per_user_cap_usd,
        max_slots,
        vip_start_at,
        public_start_at,
        end_at,
        trading_open_at,
        status,
        sold_tokens,
        sold_usd,
        watchlist_count,
        hype_percent,
        expected_roi_x,
        last_activity_at,
        created_at,
        updated_at,
        created_by,
        updated_by
      ) VALUES (
        @launchRef,
        @coinSymbol,
        @coinName,
        @description,
        @launchPriceUsd,
        @listingPriceUsd,
        @totalSupply,
        @tokensForSale,
        @minBuyUsd,
        @maxBuyUsd,
        @perUserCapUsd,
        @maxSlots,
        @vipStartAt,
        @publicStartAt,
        @endAt,
        @tradingOpenAt,
        @status,
        @soldTokens,
        @soldUsd,
        @watchlistCount,
        @hypePercent,
        @expectedRoiX,
        @lastActivityAt,
        @createdAt,
        @updatedAt,
        @createdBy,
        @updatedBy
      )
    `),
    updateLaunch: db.prepare(`
      UPDATE launch_projects
      SET
        coin_name = @coinName,
        description = @description,
        launch_price_usd = @launchPriceUsd,
        listing_price_usd = @listingPriceUsd,
        total_supply = @totalSupply,
        tokens_for_sale = @tokensForSale,
        min_buy_usd = @minBuyUsd,
        max_buy_usd = @maxBuyUsd,
        per_user_cap_usd = @perUserCapUsd,
        max_slots = @maxSlots,
        vip_start_at = @vipStartAt,
        public_start_at = @publicStartAt,
        end_at = @endAt,
        trading_open_at = @tradingOpenAt,
        status = @status,
        expected_roi_x = @expectedRoiX,
        updated_at = @updatedAt,
        updated_by = @updatedBy
      WHERE id = @id
    `),
    updateLaunchStatus: db.prepare(`
      UPDATE launch_projects
      SET status = @status,
          updated_at = @updatedAt,
          updated_by = @updatedBy
      WHERE id = @id
    `),
    patchLaunchMetrics: db.prepare(`
      UPDATE launch_projects
      SET sold_tokens = @soldTokens,
          sold_usd = @soldUsd,
          watchlist_count = @watchlistCount,
          hype_percent = @hypePercent,
          last_activity_at = @lastActivityAt,
          updated_at = @updatedAt
      WHERE id = @id
    `),
    tiersByLaunch: db.prepare(`
      SELECT *
      FROM launch_price_tiers
      WHERE launch_id = @launchId AND is_active = 1
      ORDER BY display_sort_order ASC, min_sold_percent ASC, id ASC
    `),
    deactivateTiers: db.prepare(`UPDATE launch_price_tiers SET is_active = 0, updated_at = @updatedAt WHERE launch_id = @launchId`),
    insertTier: db.prepare(`
      INSERT INTO launch_price_tiers (
        launch_id,
        min_sold_percent,
        max_sold_percent,
        price_usd,
        display_sort_order,
        is_active,
        created_at,
        updated_at
      ) VALUES (
        @launchId,
        @minSoldPercent,
        @maxSoldPercent,
        @priceUsd,
        @displaySortOrder,
        @isActive,
        @createdAt,
        @updatedAt
      )
    `),
    watchlistByLaunchUser: db.prepare(`SELECT id FROM launch_watchlists WHERE launch_id = ? AND user_id = ? LIMIT 1`),
    watchlistInsert: db.prepare(`INSERT INTO launch_watchlists (launch_id, user_id, created_at) VALUES (?, ?, ?)`),
    watchlistDelete: db.prepare(`DELETE FROM launch_watchlists WHERE launch_id = ? AND user_id = ?`),
    watchlistCountLaunch: db.prepare(`SELECT COUNT(*) AS total FROM launch_watchlists WHERE launch_id = ?`),
    watchlistCountUser: db.prepare(`SELECT COUNT(*) AS total FROM launch_watchlists WHERE user_id = ?`),
    launchEventInsert: db.prepare(`
      INSERT INTO launch_activity_events (
        launch_id,
        event_type,
        is_simulated,
        message,
        display_name,
        country_code,
        amount_usd,
        token_amount,
        created_at
      ) VALUES (
        @launchId,
        @eventType,
        @isSimulated,
        @message,
        @displayName,
        @countryCode,
        @amountUsd,
        @tokenAmount,
        @createdAt
      )
    `),
    launchEventsByLaunch: db.prepare(`SELECT * FROM launch_activity_events WHERE launch_id = @launchId ORDER BY id DESC LIMIT @limit`),
    launchEventLatest: db.prepare(`SELECT * FROM launch_activity_events WHERE launch_id = ? ORDER BY id DESC LIMIT 1`),
    hypeSnapshotInsert: db.prepare(`
      INSERT INTO launch_hype_snapshots (
        launch_id,
        hype_percent,
        metrics_json,
        created_at
      ) VALUES (
        @launchId,
        @hypePercent,
        @metricsJson,
        @createdAt
      )
    `),
    participationInsert: db.prepare(`
      INSERT INTO launch_participations (
        participation_ref,
        launch_id,
        user_id,
        buy_usd,
        allocation_tokens,
        price_used_usd,
        wallet_debit_symbol,
        release_wallet_symbol,
        status,
        note,
        created_at,
        updated_at,
        released_at
      ) VALUES (
        @participationRef,
        @launchId,
        @userId,
        @buyUsd,
        @allocationTokens,
        @priceUsedUsd,
        @walletDebitSymbol,
        @releaseWalletSymbol,
        @status,
        @note,
        @createdAt,
        @updatedAt,
        @releasedAt
      )
    `),
    participationsByLaunch: db.prepare(`
      SELECT p.*, u.email AS account_email, u.name AS account_name
      FROM launch_participations p
      LEFT JOIN users u ON u.user_id = p.user_id
      WHERE p.launch_id = @launchId
        AND (@status = 'all' OR p.status = @status)
      ORDER BY p.id DESC
      LIMIT @limit OFFSET @offset
    `),
    participationsCountByLaunch: db.prepare(`SELECT COUNT(*) AS total FROM launch_participations WHERE launch_id = @launchId AND (@status = 'all' OR status = @status)`),
    participationsByUser: db.prepare(`
      SELECT p.*, l.coin_symbol, l.coin_name, l.launch_ref, l.status AS launch_status, l.public_start_at, l.end_at, l.trading_open_at
      FROM launch_participations p
      INNER JOIN launch_projects l ON l.id = p.launch_id
      WHERE p.user_id = @userId
      ORDER BY p.id DESC
      LIMIT @limit OFFSET @offset
    `),
    participationsCountByUser: db.prepare(`SELECT COUNT(*) AS total FROM launch_participations WHERE user_id = @userId`),
    participationByRef: db.prepare(`SELECT * FROM launch_participations WHERE participation_ref = ? LIMIT 1`),
    uniqueParticipantsByLaunch: db.prepare(`SELECT COUNT(DISTINCT user_id) AS total FROM launch_participations WHERE launch_id = ? AND status IN ('pending','released')`),
    userBuySumByLaunch: db.prepare(`SELECT COALESCE(SUM(buy_usd), 0) AS total FROM launch_participations WHERE launch_id = ? AND user_id = ? AND status IN ('pending','released')`),
    launchTokensSum: db.prepare(`SELECT COALESCE(SUM(allocation_tokens), 0) AS total FROM launch_participations WHERE launch_id = ? AND status IN ('pending','released')`),
    launchUsdSum: db.prepare(`SELECT COALESCE(SUM(buy_usd), 0) AS total FROM launch_participations WHERE launch_id = ? AND status IN ('pending','released')`),
    pendingParticipationsByLaunch: db.prepare(`SELECT * FROM launch_participations WHERE launch_id = ? AND status = 'pending' ORDER BY id ASC`),
    participationMarkReleased: db.prepare(`
      UPDATE launch_participations
      SET status = 'released',
          release_wallet_symbol = @releaseWalletSymbol,
          updated_at = @updatedAt,
          released_at = @releasedAt,
          note = @note
      WHERE id = @id
    `),
    marketSyncByLaunch: db.prepare(`SELECT * FROM launch_market_sync WHERE launch_id = ? LIMIT 1`),
    marketSyncSave: db.prepare(`
      INSERT INTO launch_market_sync (
        launch_id,
        spot_pair_code,
        spot_pair_id,
        spot_sync_status,
        convert_pair_code,
        convert_pair_id,
        convert_sync_status,
        binary_pair_code,
        binary_pair_id,
        binary_sync_status,
        auto_created_at,
        last_synced_at
      ) VALUES (
        @launchId,
        @spotPairCode,
        @spotPairId,
        @spotSyncStatus,
        @convertPairCode,
        @convertPairId,
        @convertSyncStatus,
        @binaryPairCode,
        @binaryPairId,
        @binarySyncStatus,
        @autoCreatedAt,
        @lastSyncedAt
      )
      ON CONFLICT(launch_id) DO UPDATE SET
        spot_pair_code = excluded.spot_pair_code,
        spot_pair_id = excluded.spot_pair_id,
        spot_sync_status = excluded.spot_sync_status,
        convert_pair_code = excluded.convert_pair_code,
        convert_pair_id = excluded.convert_pair_id,
        convert_sync_status = excluded.convert_sync_status,
        binary_pair_code = excluded.binary_pair_code,
        binary_pair_id = excluded.binary_pair_id,
        binary_sync_status = excluded.binary_sync_status,
        auto_created_at = excluded.auto_created_at,
        last_synced_at = excluded.last_synced_at
    `),
    auditInsert: db.prepare(`
      INSERT INTO launch_admin_audit_logs (
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
    `),
    auditList: db.prepare(`
      SELECT *
      FROM launch_admin_audit_logs
      ORDER BY id DESC
      LIMIT @limit OFFSET @offset
    `),
    auditCount: db.prepare(`SELECT COUNT(*) AS total FROM launch_admin_audit_logs`),
    userById: db.prepare(`SELECT user_id, email, name, account_status, account_role, kyc_status FROM users WHERE user_id = ? LIMIT 1`),
    walletDetailByUserAsset: db.prepare(`SELECT * FROM user_wallet_balance_details WHERE user_id = ? AND asset_symbol = ? LIMIT 1`),
    walletDetailUpsert: db.prepare(`
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
      ON CONFLICT(user_id, asset_symbol)
      DO UPDATE SET
        available_usd = excluded.available_usd,
        locked_usd = excluded.locked_usd,
        reward_earned_usd = excluded.reward_earned_usd,
        updated_at = excluded.updated_at
    `),
    walletSummaryByUserAsset: db.prepare(`SELECT * FROM user_wallet_balances WHERE user_id = ? AND asset_symbol = ? LIMIT 1`),
    walletSummaryUpsert: db.prepare(`
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
    `),
    walletListByUser: db.prepare(`SELECT * FROM user_wallet_balance_details WHERE user_id = ? ORDER BY asset_symbol ASC`),
    walletLedgerInsert: db.prepare(`
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
    `),
    spotPairByCode: db.prepare(`SELECT * FROM spot_pairs WHERE pair_code = ? LIMIT 1`),
    spotPairInsert: db.prepare(`
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
    `),
    spotPairToggle: db.prepare(`UPDATE spot_pairs SET is_enabled = @isEnabled, updated_at = @updatedAt, updated_by = @updatedBy WHERE id = @id`),
    convertPairByCode: db.prepare(`SELECT * FROM convert_pairs WHERE pair_code = ? LIMIT 1`),
    convertPairInsert: db.prepare(`
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
    `),
    convertPairToggle: db.prepare(`UPDATE convert_pairs SET is_enabled = @isEnabled, updated_at = @updatedAt, updated_by = @updatedBy WHERE id = @id`),
    binaryPairByCode: db.prepare(`SELECT * FROM binary_pairs WHERE pair_code = ? LIMIT 1`),
    binaryPairInsert: db.prepare(`
      INSERT INTO binary_pairs (
        pair_code,
        display_name,
        base_asset,
        quote_asset,
        category_id,
        market_symbol,
        icon_image_url,
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
        @categoryId,
        @marketSymbol,
        @iconImageUrl,
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
    `),
    binaryPairToggle: db.prepare(`UPDATE binary_pairs SET is_enabled = @isEnabled, updated_at = @updatedAt, updated_by = @updatedBy WHERE id = @id`),
    binaryCategoryBySlug: db.prepare(`SELECT id FROM binary_market_categories WHERE slug = ? LIMIT 1`),
  };

  function mapEngineSettings(raw = null) {
    const row = raw || q.engineGet.get() || {};
    return {
      launchpadEnabled: normalizeBooleanNumber(row.launchpad_enabled, 1) === 1,
      maintenanceModeEnabled: normalizeBooleanNumber(row.maintenance_mode_enabled, 0) === 1,
      maintenanceMessage: String(row.maintenance_message || ""),
      simulatedFeedEnabled: normalizeBooleanNumber(row.simulated_feed_enabled, 1) === 1,
      simulatedIdleSeconds: Math.max(15, toInt(row.simulated_idle_seconds, 45)),
      simulatedMinAmountUsd: Math.max(1, toNumber(row.simulated_min_amount_usd, 50)),
      simulatedMaxAmountUsd: Math.max(5, toNumber(row.simulated_max_amount_usd, 2500)),
      whaleThresholdUsd: Math.max(100, toNumber(row.whale_threshold_usd, 1000)),
      autoReleaseEnabled: normalizeBooleanNumber(row.auto_release_enabled, 1) === 1,
      defaultTradingDelaySeconds: Math.max(60, toInt(row.default_trading_delay_seconds, 900)),
      allowLabelledSimulatedFeed: normalizeBooleanNumber(row.allow_labelled_simulated_feed, 1) === 1,
      updatedAt: String(row.updated_at || ""),
      updatedBy: String(row.updated_by || "system"),
    };
  }

  function saveEngineSettings(input = {}, updatedBy = "system") {
    const nowIso = toIso(getNow());
    const current = mapEngineSettings();

    const merged = {
      launchpadEnabled: "launchpadEnabled" in input ? Boolean(input.launchpadEnabled) : current.launchpadEnabled,
      maintenanceModeEnabled: "maintenanceModeEnabled" in input ? Boolean(input.maintenanceModeEnabled) : current.maintenanceModeEnabled,
      maintenanceMessage: "maintenanceMessage" in input ? sanitizeShortText(input.maintenanceMessage || "", 220) : current.maintenanceMessage,
      simulatedFeedEnabled: "simulatedFeedEnabled" in input ? Boolean(input.simulatedFeedEnabled) : current.simulatedFeedEnabled,
      simulatedIdleSeconds: "simulatedIdleSeconds" in input ? Math.max(15, toInt(input.simulatedIdleSeconds, 45)) : current.simulatedIdleSeconds,
      simulatedMinAmountUsd: "simulatedMinAmountUsd" in input ? Math.max(1, toNumber(input.simulatedMinAmountUsd, 50)) : current.simulatedMinAmountUsd,
      simulatedMaxAmountUsd: "simulatedMaxAmountUsd" in input ? Math.max(5, toNumber(input.simulatedMaxAmountUsd, 2500)) : current.simulatedMaxAmountUsd,
      whaleThresholdUsd: "whaleThresholdUsd" in input ? Math.max(100, toNumber(input.whaleThresholdUsd, 1000)) : current.whaleThresholdUsd,
      autoReleaseEnabled: "autoReleaseEnabled" in input ? Boolean(input.autoReleaseEnabled) : current.autoReleaseEnabled,
      defaultTradingDelaySeconds:
        "defaultTradingDelaySeconds" in input
          ? Math.max(60, toInt(input.defaultTradingDelaySeconds, 900))
          : current.defaultTradingDelaySeconds,
      allowLabelledSimulatedFeed:
        "allowLabelledSimulatedFeed" in input ? Boolean(input.allowLabelledSimulatedFeed) : current.allowLabelledSimulatedFeed,
      updatedAt: nowIso,
      updatedBy: sanitizeShortText(updatedBy || "system", 80),
    };

    q.engineSave.run({
      launchpadEnabled: merged.launchpadEnabled ? 1 : 0,
      maintenanceModeEnabled: merged.maintenanceModeEnabled ? 1 : 0,
      maintenanceMessage: merged.maintenanceMessage,
      simulatedFeedEnabled: merged.simulatedFeedEnabled ? 1 : 0,
      simulatedIdleSeconds: merged.simulatedIdleSeconds,
      simulatedMinAmountUsd: merged.simulatedMinAmountUsd,
      simulatedMaxAmountUsd: merged.simulatedMaxAmountUsd,
      whaleThresholdUsd: merged.whaleThresholdUsd,
      autoReleaseEnabled: merged.autoReleaseEnabled ? 1 : 0,
      defaultTradingDelaySeconds: merged.defaultTradingDelaySeconds,
      allowLabelledSimulatedFeed: merged.allowLabelledSimulatedFeed ? 1 : 0,
      updatedAt: merged.updatedAt,
      updatedBy: merged.updatedBy,
    });

    return mapEngineSettings(q.engineGet.get());
  }

  saveEngineSettings({}, "system");

  function mapTier(row) {
    return {
      tierId: toInt(row?.id, 0),
      launchId: toInt(row?.launch_id, 0),
      minSoldPercent: toMoney(row?.min_sold_percent || 0),
      maxSoldPercent: toMoney(row?.max_sold_percent || 100),
      priceUsd: toMoney(row?.price_usd || 0),
      displaySortOrder: toInt(row?.display_sort_order, 0),
      isActive: normalizeBooleanNumber(row?.is_active, 1) === 1,
    };
  }

  function readLaunchTiers(launchId) {
    return q.tiersByLaunch.all({ launchId }).map(mapTier);
  }

  function buildDefaultTiers(basePrice) {
    const p = Math.max(0.00000001, toNumber(basePrice, 0.01));
    return [
      { minSoldPercent: 0, maxSoldPercent: 25, priceUsd: toMoney(p), displaySortOrder: 0, isActive: true },
      { minSoldPercent: 25, maxSoldPercent: 50, priceUsd: toMoney(p * 1.5), displaySortOrder: 1, isActive: true },
      { minSoldPercent: 50, maxSoldPercent: 75, priceUsd: toMoney(p * 2), displaySortOrder: 2, isActive: true },
      { minSoldPercent: 75, maxSoldPercent: 100, priceUsd: toMoney(p * 3), displaySortOrder: 3, isActive: true },
    ];
  }

  function saveLaunchTiers({ launchId, tiers = [], nowIso }) {
    const launch = q.launchById.get(launchId);
    const normalized = (Array.isArray(tiers) ? tiers : [])
      .map((item, index) => ({
        minSoldPercent: Math.max(0, Math.min(100, toNumber(item.minSoldPercent ?? item.min_sold_percent, 0))),
        maxSoldPercent: Math.max(0, Math.min(100, toNumber(item.maxSoldPercent ?? item.max_sold_percent, 100))),
        priceUsd: Math.max(0.00000001, toNumber(item.priceUsd ?? item.price_usd, 0.00000001)),
        displaySortOrder: Math.max(0, toInt(item.displaySortOrder ?? item.display_sort_order, index)),
        isActive: normalizeBooleanNumber(item.isActive ?? item.is_active, 1) === 1,
      }))
      .map((row) => ({ ...row, maxSoldPercent: Math.max(row.minSoldPercent, row.maxSoldPercent) }))
      .sort((a, b) => a.displaySortOrder - b.displaySortOrder || a.minSoldPercent - b.minSoldPercent);

    const finalRows = normalized.length ? normalized : buildDefaultTiers(launch?.launch_price_usd || 0.01);

    const tx = db.transaction(() => {
      q.deactivateTiers.run({ launchId, updatedAt: nowIso });
      finalRows.forEach((tier, index) => {
        q.insertTier.run({
          launchId,
          minSoldPercent: tier.minSoldPercent,
          maxSoldPercent: tier.maxSoldPercent,
          priceUsd: tier.priceUsd,
          displaySortOrder: tier.displaySortOrder ?? index,
          isActive: tier.isActive ? 1 : 0,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      });
    });

    tx();
    return readLaunchTiers(launchId);
  }

  function inferLaunchPhase(launchRow) {
    const nowMs = parseIsoMs(toIso(getNow()));
    const startMs = parseIsoMs(launchRow?.public_start_at || "");
    const endMs = parseIsoMs(launchRow?.end_at || "");
    const status = normalizeLaunchStatus(launchRow?.status || "draft");

    if (["cancelled", "paused", "released", "releasing"].includes(status)) {
      return status;
    }
    if (status === "sold_out") {
      return "sold_out";
    }
    if (startMs > 0 && nowMs < startMs) {
      return "upcoming";
    }
    if (startMs > 0 && nowMs >= startMs && (endMs <= 0 || nowMs < endMs)) {
      return "live";
    }
    if (endMs > 0 && nowMs >= endMs) {
      return "ended";
    }
    return "upcoming";
  }

  function mapLaunch(row, { includeInternal = false } = {}) {
    if (!row) {
      return null;
    }

    const launchPriceUsd = Math.max(0.00000001, toNumber(row.launch_price_usd, 0.01));
    const listingPriceUsd = Math.max(launchPriceUsd, toNumber(row.listing_price_usd, launchPriceUsd));
    const tokensForSale = Math.max(0, toNumber(row.tokens_for_sale, 0));
    const soldTokens = Math.max(0, toNumber(row.sold_tokens, 0));
    const soldPercent = tokensForSale > 0 ? Math.min(100, toMoney((soldTokens / tokensForSale) * 100)) : 0;
    const nowMs = parseIsoMs(toIso(getNow()));
    const startMs = parseIsoMs(row.public_start_at || "");
    const endMs = parseIsoMs(row.end_at || "");
    const tradingMs = parseIsoMs(row.trading_open_at || "");
    const phase = inferLaunchPhase(row);

    const output = {
      launchId: toInt(row.id, 0),
      launchRef: String(row.launch_ref || ""),
      coinSymbol: normalizeAssetSymbol(row.coin_symbol || ""),
      coinName: String(row.coin_name || ""),
      description: String(row.description || ""),
      launchPriceUsd: toMoney(launchPriceUsd),
      listingPriceUsd: toMoney(listingPriceUsd),
      totalSupply: toMoney(row.total_supply || 0),
      tokensForSale: toMoney(tokensForSale),
      minBuyUsd: toMoney(row.min_buy_usd || 0),
      maxBuyUsd: toMoney(row.max_buy_usd || 0),
      perUserCapUsd: toMoney(row.per_user_cap_usd || 0),
      maxSlots: Math.max(0, toInt(row.max_slots, 0)),
      vipStartAt: String(row.vip_start_at || ""),
      publicStartAt: String(row.public_start_at || ""),
      endAt: String(row.end_at || ""),
      tradingOpenAt: String(row.trading_open_at || ""),
      status: normalizeLaunchStatus(row.status || "draft"),
      phase,
      soldTokens: toMoney(soldTokens),
      soldUsd: toMoney(row.sold_usd || 0),
      soldPercent,
      remainingTokens: toMoney(Math.max(0, tokensForSale - soldTokens)),
      watchlistCount: Math.max(0, toInt(row.watchlist_count, 0)),
      hypePercent: Math.max(0, Math.min(100, toInt(row.hype_percent, 0))),
      expectedRoiX: Math.max(0, toMoney(row.expected_roi_x || listingPriceUsd / launchPriceUsd || 1)),
      lastActivityAt: String(row.last_activity_at || ""),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
      startsInSeconds: startMs > nowMs ? Math.floor((startMs - nowMs) / 1000) : 0,
      endsInSeconds: endMs > nowMs ? Math.floor((endMs - nowMs) / 1000) : 0,
      tradingOpensInSeconds: tradingMs > nowMs ? Math.floor((tradingMs - nowMs) / 1000) : 0,
      scarcityLabel:
        soldPercent >= 95 ? "Almost Sold Out" : soldPercent >= 75 ? "Selling Fast" : soldPercent >= 50 ? "Momentum Rising" : "Open",
    };

    if (includeInternal) {
      output._internal = row;
    }

    return output;
  }

  function mapParticipation(row) {
    if (!row) {
      return null;
    }

    return {
      participationId: toInt(row.id, 0),
      participationRef: String(row.participation_ref || ""),
      launchId: toInt(row.launch_id, 0),
      launchRef: String(row.launch_ref || ""),
      coinSymbol: normalizeAssetSymbol(row.coin_symbol || ""),
      coinName: String(row.coin_name || ""),
      launchStatus: normalizeLaunchStatus(row.launch_status || ""),
      userId: String(row.user_id || ""),
      accountEmail: String(row.account_email || ""),
      accountName: String(row.account_name || ""),
      buyUsd: toMoney(row.buy_usd || 0),
      allocationTokens: toMoney(row.allocation_tokens || 0),
      priceUsedUsd: toMoney(row.price_used_usd || 0),
      walletDebitSymbol: normalizeCoreWalletSymbol(row.wallet_debit_symbol || "SPOT_USDT", "SPOT_USDT"),
      releaseWalletSymbol: normalizeCoreWalletSymbol(row.release_wallet_symbol || `SPOT_${normalizeAssetSymbol(row.coin_symbol || "USDT")}`, "SPOT_USDT"),
      status: normalizeLower(row.status || "pending"),
      note: String(row.note || ""),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
      releasedAt: String(row.released_at || ""),
      publicStartAt: String(row.public_start_at || ""),
      endAt: String(row.end_at || ""),
      tradingOpenAt: String(row.trading_open_at || ""),
    };
  }

  function mapEvent(row) {
    if (!row) {
      return null;
    }

    return {
      eventId: toInt(row.id, 0),
      launchId: toInt(row.launch_id, 0),
      eventType: normalizeEventType(row.event_type || "system"),
      isSimulated: normalizeBooleanNumber(row.is_simulated, 0) === 1,
      message: String(row.message || ""),
      displayName: String(row.display_name || ""),
      countryCode: String(row.country_code || ""),
      amountUsd: row.amount_usd === null || row.amount_usd === undefined ? null : toMoney(row.amount_usd),
      tokenAmount: row.token_amount === null || row.token_amount === undefined ? null : toMoney(row.token_amount),
      createdAt: String(row.created_at || ""),
    };
  }

  function writeAudit(adminUserId, actionType, targetType, targetId, note = "") {
    q.auditInsert.run({
      adminUserId: sanitizeShortText(adminUserId || "system", 80),
      actionType: sanitizeShortText(actionType || "unknown", 80),
      targetType: sanitizeShortText(targetType || "unknown", 80),
      targetId: sanitizeShortText(String(targetId || ""), 120),
      note: sanitizeShortText(note || "", 350),
      createdAt: toIso(getNow()),
    });
  }

  function ensureWalletDetail(userId, assetSymbol, nowIso) {
    const symbol = normalizeCoreWalletSymbol(assetSymbol, assetSymbol);
    const existing = q.walletDetailByUserAsset.get(userId, symbol);
    if (existing) {
      return {
        userId,
        assetSymbol: symbol,
        availableUsd: toMoney(existing.available_usd || 0),
        lockedUsd: toMoney(existing.locked_usd || 0),
        rewardEarnedUsd: toMoney(existing.reward_earned_usd || 0),
      };
    }

    const summary = q.walletSummaryByUserAsset.get(userId, symbol);
    const totalUsd = toMoney(summary?.total_usd || 0);

    q.walletDetailUpsert.run({
      userId,
      assetSymbol: symbol,
      availableUsd: totalUsd,
      lockedUsd: 0,
      rewardEarnedUsd: 0,
      updatedAt: nowIso,
    });

    q.walletSummaryUpsert.run({
      userId,
      assetSymbol: symbol,
      assetName: sanitizeShortText(summary?.asset_name || symbol, 80),
      totalUsd,
      updatedAt: nowIso,
    });

    return {
      userId,
      assetSymbol: symbol,
      availableUsd: totalUsd,
      lockedUsd: 0,
      rewardEarnedUsd: 0,
    };
  }

  function saveWalletDetail({ userId, assetSymbol, availableUsd, lockedUsd, rewardEarnedUsd, updatedAt }) {
    q.walletDetailUpsert.run({
      userId,
      assetSymbol,
      availableUsd: toMoney(availableUsd),
      lockedUsd: toMoney(lockedUsd),
      rewardEarnedUsd: toMoney(rewardEarnedUsd),
      updatedAt,
    });
  }

  function syncWalletSummaryFromDetail({ userId, assetSymbol, updatedAt }) {
    const detail = q.walletDetailByUserAsset.get(userId, assetSymbol);
    const totalUsd = toMoney(toNumber(detail?.available_usd, 0) + toNumber(detail?.locked_usd, 0));
    const existing = q.walletSummaryByUserAsset.get(userId, assetSymbol);

    q.walletSummaryUpsert.run({
      userId,
      assetSymbol,
      assetName: sanitizeShortText(existing?.asset_name || assetSymbol, 80),
      totalUsd,
      updatedAt,
    });
  }

  function insertWalletLedger({
    userId,
    refType,
    refId,
    walletSymbol,
    assetSymbol,
    movementType,
    amountUsd,
    beforeUsd,
    afterUsd,
    note,
    createdAt,
    createdBy,
  }) {
    q.walletLedgerInsert.run({
      userId,
      ledgerRefType: sanitizeShortText(refType || "launchpad", 80),
      ledgerRefId: sanitizeShortText(String(refId || ""), 80),
      walletSymbol: normalizeCoreWalletSymbol(walletSymbol || "SPOT_USDT", "SPOT_USDT"),
      assetSymbol: normalizeAssetSymbol(assetSymbol || "USDT"),
      movementType: sanitizeShortText(movementType || "debit", 20),
      amountUsd: toMoney(amountUsd),
      balanceBeforeUsd: toMoney(beforeUsd),
      balanceAfterUsd: toMoney(afterUsd),
      note: sanitizeShortText(note || "", 280),
      createdAt,
      createdBy: sanitizeShortText(createdBy || "system", 50),
    });
  }

  function recomputeLaunchMetrics(launchId) {
    const launchRow = q.launchById.get(launchId);
    if (!launchRow) {
      return null;
    }

    const soldTokens = toMoney(q.launchTokensSum.get(launchId)?.total || 0);
    const soldUsd = toMoney(q.launchUsdSum.get(launchId)?.total || 0);
    const watchlistCount = Math.max(0, toInt(q.watchlistCountLaunch.get(launchId)?.total, 0));
    const nowIso = toIso(getNow());

    const recentBuys = db
      .prepare(`SELECT COUNT(*) AS total FROM launch_participations WHERE launch_id = ? AND created_at >= ?`)
      .get(launchId, toIso(new Date(Date.now() - 2 * 60 * 60 * 1000)));
    const recentEvents = db
      .prepare(`SELECT COUNT(*) AS total FROM launch_activity_events WHERE launch_id = ? AND created_at >= ?`)
      .get(launchId, toIso(new Date(Date.now() - 30 * 60 * 1000)));

    const soldPercent = toNumber(launchRow.tokens_for_sale, 0) > 0 ? Math.min(100, (soldTokens / toNumber(launchRow.tokens_for_sale, 1)) * 100) : 0;
    const hype = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          soldPercent * 0.45 +
            Math.min(30, watchlistCount / 40) +
            Math.min(15, toNumber(recentBuys?.total, 0) * 1.5) +
            Math.min(10, toNumber(recentEvents?.total, 0) * 0.8),
        ),
      ),
    );

    q.patchLaunchMetrics.run({
      id: launchId,
      soldTokens,
      soldUsd,
      watchlistCount,
      hypePercent: hype,
      lastActivityAt: nowIso,
      updatedAt: nowIso,
    });

    q.hypeSnapshotInsert.run({
      launchId,
      hypePercent: hype,
      metricsJson: JSON.stringify({
        soldPercent: toMoney(soldPercent),
        watchlistCount,
        recentBuys: toInt(recentBuys?.total, 0),
        recentEvents: toInt(recentEvents?.total, 0),
      }),
      createdAt: nowIso,
    });

    return mapLaunch(q.launchById.get(launchId));
  }

  function readCurrentTierPrice(launch, tiers = []) {
    const soldPercent = Math.max(0, Math.min(100, toNumber(launch?.soldPercent, 0)));
    const normalized = tiers.length ? tiers : readLaunchTiers(launch.launchId);

    const matched = normalized.find((tier) => soldPercent >= tier.minSoldPercent && soldPercent < tier.maxSoldPercent + 0.000001);
    if (matched) {
      return toMoney(matched.priceUsd);
    }

    return toMoney(launch.launchPriceUsd || 0.01);
  }

  function listEvents(launchId, limit = 20) {
    return q.launchEventsByLaunch
      .all({ launchId, limit: Math.max(1, Math.min(120, toInt(limit, 20))) })
      .map(mapEvent)
      .reverse();
  }

  function insertEvent({ launchId, eventType, isSimulated = false, message = "", displayName = "", countryCode = "", amountUsd = null, tokenAmount = null, createdAt = null }) {
    q.launchEventInsert.run({
      launchId,
      eventType: normalizeEventType(eventType),
      isSimulated: isSimulated ? 1 : 0,
      message: sanitizeShortText(message || "Market pulse", 220),
      displayName: sanitizeShortText(displayName || "", 80),
      countryCode: sanitizeShortText(countryCode || "", 8),
      amountUsd: amountUsd === null ? null : toMoney(amountUsd),
      tokenAmount: tokenAmount === null ? null : toMoney(tokenAmount),
      createdAt: createdAt || toIso(getNow()),
    });
  }

  function maybeInsertSimulatedEvent(launch, settings) {
    if (!settings.simulatedFeedEnabled || !settings.allowLabelledSimulatedFeed) {
      return;
    }

    const latest = q.launchEventLatest.get(launch.launchId);
    const latestMs = parseIsoMs(latest?.created_at || "");
    const nowMs = parseIsoMs(toIso(getNow()));

    if (latestMs > 0 && nowMs - latestMs < settings.simulatedIdleSeconds * 1000) {
      return;
    }

    const user = SIM_USERS[toInt(Math.floor(Math.random() * SIM_USERS.length), 0)] || "Trader";
    const country = SIM_COUNTRIES[toInt(Math.floor(Math.random() * SIM_COUNTRIES.length), 0)] || "SG";
    const amountUsd = toMoney(randomBetween(settings.simulatedMinAmountUsd, settings.simulatedMaxAmountUsd));
    const price = Math.max(0.00000001, launch.launchPriceUsd || 0.01);
    const tokenAmount = toMoney(amountUsd / price);

    const buyEvent = Math.random() < 0.65;
    insertEvent({
      launchId: launch.launchId,
      eventType: buyEvent ? "simulated_buy" : "simulated_join",
      isSimulated: true,
      displayName: user,
      countryCode: country,
      amountUsd: buyEvent ? amountUsd : null,
      tokenAmount: buyEvent ? tokenAmount : null,
      message: buyEvent
        ? `[Simulated] ${user} from ${country} bought $${amountUsd.toFixed(2)} ${launch.coinSymbol}`
        : `[Simulated] ${user} joined ${launch.coinSymbol} launch`,
      createdAt: toIso(getNow()),
    });
  }

  function countDownPayload(launch) {
    if (!launch) {
      return null;
    }

    return {
      launchId: launch.launchId,
      phase: launch.phase,
      startsInSeconds: launch.startsInSeconds,
      endsInSeconds: launch.endsInSeconds,
      tradingOpensInSeconds: launch.tradingOpensInSeconds,
      publicStartAt: launch.publicStartAt,
      endAt: launch.endAt,
      tradingOpenAt: launch.tradingOpenAt,
    };
  }

  function requireLaunchpadEnabledOrThrow() {
    const settings = mapEngineSettings();
    if (!settings.launchpadEnabled) {
      const error = new Error("Launchpad is currently disabled.");
      error.statusCode = 403;
      throw error;
    }
    if (settings.maintenanceModeEnabled) {
      const error = new Error(settings.maintenanceMessage || "Launchpad is under maintenance.");
      error.statusCode = 503;
      throw error;
    }
    return settings;
  }

  function getLaunchByInput(body = {}) {
    const rawId = toInt(body.launchId || body.id, 0);
    const rawRef = normalizeText(body.launchRef || body.launch_ref);

    let row = null;
    if (rawId > 0) {
      row = q.launchById.get(rawId);
    }
    if (!row && rawRef) {
      row = q.launchByRef.get(rawRef);
    }
    return row;
  }

  function refreshLaunchLifecycle(launchRow, { allowRelease = true } = {}) {
    if (!launchRow) {
      return null;
    }

    const nowIso = toIso(getNow());
    const nowMs = parseIsoMs(nowIso);
    const status = normalizeLaunchStatus(launchRow.status || "draft");
    const startMs = parseIsoMs(launchRow.public_start_at || "");
    const endMs = parseIsoMs(launchRow.end_at || "");
    const tradingMs = parseIsoMs(launchRow.trading_open_at || "");
    const soldTokens = toNumber(launchRow.sold_tokens, 0);
    const tokensForSale = Math.max(0, toNumber(launchRow.tokens_for_sale, 0));
    const soldOut = tokensForSale > 0 && soldTokens >= tokensForSale - 0.00000001;

    let nextStatus = status;

    if (!["cancelled", "paused", "released", "releasing"].includes(status)) {
      if (soldOut) {
        nextStatus = "sold_out";
      } else if (startMs > 0 && nowMs < startMs) {
        nextStatus = "upcoming";
      } else if (startMs > 0 && nowMs >= startMs && (endMs <= 0 || nowMs < endMs)) {
        nextStatus = "live";
      } else if (endMs > 0 && nowMs >= endMs) {
        nextStatus = "ended";
      }
    }

    if (nextStatus !== status) {
      q.updateLaunchStatus.run({
        id: launchRow.id,
        status: nextStatus,
        updatedAt: nowIso,
        updatedBy: "system",
      });
    }

    const fresh = q.launchById.get(launchRow.id);
    const mapped = mapLaunch(fresh, { includeInternal: true });
    const settings = mapEngineSettings();

    if (nextStatus !== status && mapped) {
      safeNotify("onLaunchStatusChanged", {
        launch: mapped,
        previousStatus: status,
        nextStatus,
        source: "system_lifecycle",
      });
    }

    if (mapped && mapped.phase === "live") {
      maybeInsertSimulatedEvent(mapped, settings);
    }

    if (allowRelease && settings.autoReleaseEnabled && ["ended", "sold_out", "releasing"].includes(mapped?.phase || "")) {
      if (tradingMs > 0 && nowMs >= tradingMs) {
        releaseLaunchAllocations({
          launchId: mapped.launchId,
          releasedBy: "system",
          note: "Auto release on trading open",
        });
      }
    }

    recomputeLaunchMetrics(launchRow.id);

    return mapLaunch(q.launchById.get(launchRow.id));
  }

  function refreshAllLaunchesLifecycle() {
    const launches = q.listLaunches.all({ status: "all", limit: 300, offset: 0 });
    launches.forEach((row) => {
      refreshLaunchLifecycle(row);
    });
  }

  function assertUserCanBuy(user, launch, amountUsd) {
    const status = normalizeLower(user?.account_status || "active");
    const kyc = normalizeLower(user?.kyc_status || "pending");

    if (status !== "active") {
      const error = new Error("Your account is not active.");
      error.statusCode = 403;
      throw error;
    }
    if (!["authenticated", "approved"].includes(kyc)) {
      const error = new Error("KYC authentication is required before launch participation.");
      error.statusCode = 403;
      throw error;
    }
    if (!launch || launch.phase !== "live") {
      const error = new Error("Launch is not live right now.");
      error.statusCode = 400;
      throw error;
    }
    if (amountUsd < launch.minBuyUsd) {
      throw new Error(`Minimum buy is $${launch.minBuyUsd.toFixed(2)}.`);
    }
    if (amountUsd > launch.maxBuyUsd) {
      throw new Error(`Maximum buy per order is $${launch.maxBuyUsd.toFixed(2)}.`);
    }

    const currentParticipants = toInt(q.uniqueParticipantsByLaunch.get(launch.launchId)?.total, 0);
    if (launch.maxSlots > 0 && currentParticipants >= launch.maxSlots) {
      throw new Error("Launch slots are full.");
    }

    const userSoFar = toNumber(q.userBuySumByLaunch.get(launch.launchId, user.user_id)?.total, 0);
    if (userSoFar + amountUsd > launch.perUserCapUsd + 0.000001) {
      throw new Error(`Per-user cap exceeded. Remaining cap: $${Math.max(0, launch.perUserCapUsd - userSoFar).toFixed(2)}.`);
    }
  }

  function ensureMarketSyncDraft(launchRow) {
    const nowIso = toIso(getNow());
    const symbol = normalizeAssetSymbol(launchRow.coin_symbol || "");
    const spotPairCode = `${symbol}USDT`;
    const convertPairCodeForward = `${symbol}_USDT`;
    const convertPairCodeReverse = `USDT_${symbol}`;
    const binaryPairCode = `${symbol}USDT`;

    let spotPair = q.spotPairByCode.get(spotPairCode);
    if (!spotPair) {
      q.spotPairInsert.run({
        pairCode: spotPairCode,
        displayName: `${symbol}/USDT`,
        baseAsset: symbol,
        quoteAsset: "USDT",
        priceSourceType: "internal_feed",
        sourceSymbol: spotPairCode,
        currentPrice: toMoney(launchRow.listing_price_usd || launchRow.launch_price_usd || 0.01),
        previousPrice: toMoney(launchRow.launch_price_usd || 0.01),
        pricePrecision: 6,
        quantityPrecision: 6,
        minOrderSize: 0.0001,
        maxOrderSize: 100000,
        makerFeePercent: 0.1,
        takerFeePercent: 0.15,
        isEnabled: 0,
        isFeatured: 0,
        displaySortOrder: 998,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: "launchpad",
        updatedBy: "launchpad",
      });
      spotPair = q.spotPairByCode.get(spotPairCode);
    }

    let convertPairF = q.convertPairByCode.get(convertPairCodeForward);
    if (!convertPairF) {
      q.convertPairInsert.run({
        pairCode: convertPairCodeForward,
        displayName: `${symbol} to USDT`,
        fromAsset: symbol,
        toAsset: "USDT",
        rateSourceType: "internal_feed",
        sourceSymbol: spotPairCode,
        minAmountUsd: 1,
        maxAmountUsd: 200000,
        feePercent: 0.1,
        spreadPercent: 0.15,
        fixedFeeUsd: 0,
        manualRate: null,
        isEnabled: 0,
        displaySortOrder: 998,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: "launchpad",
        updatedBy: "launchpad",
      });
      convertPairF = q.convertPairByCode.get(convertPairCodeForward);
    }

    let convertPairR = q.convertPairByCode.get(convertPairCodeReverse);
    if (!convertPairR) {
      q.convertPairInsert.run({
        pairCode: convertPairCodeReverse,
        displayName: `USDT to ${symbol}`,
        fromAsset: "USDT",
        toAsset: symbol,
        rateSourceType: "internal_feed",
        sourceSymbol: spotPairCode,
        minAmountUsd: 1,
        maxAmountUsd: 200000,
        feePercent: 0.1,
        spreadPercent: 0.15,
        fixedFeeUsd: 0,
        manualRate: null,
        isEnabled: 0,
        displaySortOrder: 999,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: "launchpad",
        updatedBy: "launchpad",
      });
      convertPairR = q.convertPairByCode.get(convertPairCodeReverse);
    }

    const newCoinCategory = q.binaryCategoryBySlug.get("new-coin")?.id || q.binaryCategoryBySlug.get("crypto")?.id || null;
    let binaryPair = q.binaryPairByCode.get(binaryPairCode);
    if (!binaryPair) {
      q.binaryPairInsert.run({
        pairCode: binaryPairCode,
        displayName: `${symbol}/USDT`,
        baseAsset: symbol,
        quoteAsset: "USDT",
        categoryId: newCoinCategory,
        marketSymbol: spotPairCode,
        iconImageUrl: "",
        priceSourceType: "internal_feed",
        sourceSymbol: spotPairCode,
        currentPrice: toMoney(launchRow.listing_price_usd || launchRow.launch_price_usd || 0.01),
        previousPrice: toMoney(launchRow.launch_price_usd || 0.01),
        pricePrecision: 4,
        chartTimeframeLabel: "1s",
        isEnabled: 0,
        isFeatured: 0,
        displaySortOrder: 998,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: "launchpad",
        updatedBy: "launchpad",
      });
      binaryPair = q.binaryPairByCode.get(binaryPairCode);
    }

    q.marketSyncSave.run({
      launchId: launchRow.id,
      spotPairCode,
      spotPairId: spotPair?.id || null,
      spotSyncStatus: spotPair ? "draft" : "failed",
      convertPairCode: convertPairCodeForward,
      convertPairId: convertPairF?.id || null,
      convertSyncStatus: convertPairF && convertPairR ? "draft" : "failed",
      binaryPairCode,
      binaryPairId: binaryPair?.id || null,
      binarySyncStatus: binaryPair ? "draft" : "failed",
      autoCreatedAt: nowIso,
      lastSyncedAt: nowIso,
    });

    return {
      spotPair,
      convertPairForward: convertPairF,
      convertPairReverse: convertPairR,
      binaryPair,
      sync: q.marketSyncByLaunch.get(launchRow.id),
    };
  }

  function releaseLaunchAllocations({ launchId, releasedBy = "admin", note = "Manual release" }) {
    const launchRow = q.launchById.get(launchId);
    if (!launchRow) {
      throw new Error("Launch not found.");
    }

    const nowIso = toIso(getNow());
    const coinSymbol = normalizeAssetSymbol(launchRow.coin_symbol || "");
    const releaseWalletSymbol = makeSpotWalletSymbol(coinSymbol);

    const tx = db.transaction(() => {
      q.updateLaunchStatus.run({
        id: launchRow.id,
        status: "releasing",
        updatedAt: nowIso,
        updatedBy: releasedBy,
      });

      const pending = q.pendingParticipationsByLaunch.all(launchRow.id);
      pending.forEach((row) => {
        const userId = String(row.user_id || "");
        const amountTokens = toMoney(row.allocation_tokens || 0);
        if (!userId || amountTokens <= 0) {
          return;
        }

        const wallet = ensureWalletDetail(userId, releaseWalletSymbol, nowIso);
        const before = toMoney(wallet.availableUsd);
        const after = toMoney(before + amountTokens);

        saveWalletDetail({
          userId,
          assetSymbol: releaseWalletSymbol,
          availableUsd: after,
          lockedUsd: wallet.lockedUsd,
          rewardEarnedUsd: wallet.rewardEarnedUsd,
          updatedAt: nowIso,
        });
        syncWalletSummaryFromDetail({ userId, assetSymbol: releaseWalletSymbol, updatedAt: nowIso });

        insertWalletLedger({
          userId,
          refType: "launchpad_release",
          refId: row.participation_ref,
          walletSymbol: releaseWalletSymbol,
          assetSymbol: coinSymbol,
          movementType: "credit",
          amountUsd: amountTokens,
          beforeUsd: before,
          afterUsd: after,
          note: `${coinSymbol} launch allocation released`,
          createdAt: nowIso,
          createdBy: releasedBy,
        });

        q.participationMarkReleased.run({
          id: row.id,
          releaseWalletSymbol,
          updatedAt: nowIso,
          releasedAt: nowIso,
          note: sanitizeShortText(note || "Released", 220),
        });
      });

      q.updateLaunchStatus.run({
        id: launchRow.id,
        status: "released",
        updatedAt: nowIso,
        updatedBy: releasedBy,
      });
    });

    tx();
    recomputeLaunchMetrics(launchId);
    return mapLaunch(q.launchById.get(launchId));
  }

  function getLaunchForResponse(rawLaunch, userId = "") {
    if (!rawLaunch) {
      return null;
    }
    const mapped = mapLaunch(rawLaunch);
    const tiers = readLaunchTiers(mapped.launchId);
    const tierPrice = readCurrentTierPrice(mapped, tiers);

    return {
      ...mapped,
      currentTierPriceUsd: tierPrice,
      tiers,
      isWatchlisted: userId ? Boolean(q.watchlistByLaunchUser.get(mapped.launchId, userId)) : false,
      uniqueParticipants: toInt(q.uniqueParticipantsByLaunch.get(mapped.launchId)?.total, 0),
    };
  }

  function getLaunchpadDashboardSnapshot({ userId = "" } = {}) {
    refreshAllLaunchesLifecycle();

    const liveRaw = q.listLaunches.all({ status: "live", limit: 20, offset: 0 });
    const upcomingRaw = q.listLaunches.all({ status: "upcoming", limit: 20, offset: 0 });
    const endedRaw = q.listLaunches.all({ status: "ended", limit: 20, offset: 0 });

    const featuredRaw = liveRaw[0] || upcomingRaw[0] || endedRaw[0] || null;
    const featured = featuredRaw ? getLaunchForResponse(featuredRaw, userId) : null;

    return {
      enabled: mapEngineSettings().launchpadEnabled,
      featured,
      counts: {
        live: liveRaw.length,
        upcoming: upcomingRaw.length,
        ended: endedRaw.length,
      },
      user: {
        watchlistCount: userId ? toInt(q.watchlistCountUser.get(userId)?.total, 0) : 0,
      },
    };
  }

  function handleLaunchpadCatalog(req, res) {
    try {
      const settings = requireLaunchpadEnabledOrThrow();
      refreshAllLaunchesLifecycle();

      const status = normalizeLower(req.body?.status || "all");
      const phase = normalizeLower(req.body?.phase || "all");
      const pagination = buildPagination(req.body?.page, req.body?.limit, 20, 120);
      const mode = status !== "all" ? status : phase;
      const filterStatus = ["all", "live", "upcoming", "ended", "sold_out", "released", "draft", "paused", "cancelled"].includes(mode)
        ? mode
        : "all";

      const rows = q.listLaunches.all({ status: filterStatus, limit: pagination.limit, offset: pagination.offset });
      const total = toInt(q.countLaunches.get({ status: filterStatus })?.total, 0);
      const launches = rows.map((row) => getLaunchForResponse(row, req.currentUser?.userId || ""));
      const watchlist = q.listUserWatchlistedLaunches
        .all(req.currentUser?.userId || "")
        .map((row) => getLaunchForResponse(row, req.currentUser?.userId || ""));

      res.json({
        settings,
        phase: filterStatus,
        page: pagination.page,
        limit: pagination.limit,
        total,
        launches,
        watchlist,
      });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not load launchpad catalog." });
    }
  }

  function handleLaunchpadDetail(req, res) {
    try {
      requireLaunchpadEnabledOrThrow();
      refreshAllLaunchesLifecycle();

      const launchRow = getLaunchByInput(req.body || {});
      if (!launchRow) {
        res.status(404).json({ error: "Launch not found." });
        return;
      }

      const launch = getLaunchForResponse(launchRow, req.currentUser?.userId || "");
      const feed = listEvents(launch.launchId, req.body?.feedLimit || 20);
      const myCommittedUsd = toMoney(q.userBuySumByLaunch.get(launch.launchId, req.currentUser.userId)?.total || 0);
      const myCapRemainingUsd = toMoney(Math.max(0, launch.perUserCapUsd - myCommittedUsd));

      res.json({
        launch,
        feed,
        countdown: countDownPayload(launch),
        myStats: {
          committedUsd: myCommittedUsd,
          capRemainingUsd: myCapRemainingUsd,
        },
      });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not load launch detail." });
    }
  }

  function handleLaunchpadWatchlistToggle(req, res) {
    try {
      requireLaunchpadEnabledOrThrow();
      const launchRow = getLaunchByInput(req.body || {});
      if (!launchRow) {
        res.status(404).json({ error: "Launch not found." });
        return;
      }

      const launchId = toInt(launchRow.id, 0);
      const userId = req.currentUser.userId;
      const nowIso = toIso(getNow());
      const existing = q.watchlistByLaunchUser.get(launchId, userId);

      if (existing) {
        q.watchlistDelete.run(launchId, userId);
      } else {
        q.watchlistInsert.run(launchId, userId, nowIso);
      }

      recomputeLaunchMetrics(launchId);
      const launch = getLaunchForResponse(q.launchById.get(launchId), userId);

      res.json({
        message: existing ? "Removed from watchlist." : "Added to watchlist.",
        launch,
        isWatchlisted: !existing,
        watchlistCount: launch.watchlistCount,
      });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not update watchlist." });
    }
  }

  function handleLaunchpadBuyPreview(req, res) {
    try {
      requireLaunchpadEnabledOrThrow();
      refreshAllLaunchesLifecycle();

      const launchRow = getLaunchByInput(req.body || {});
      if (!launchRow) {
        res.status(404).json({ error: "Launch not found." });
        return;
      }

      const launch = getLaunchForResponse(launchRow, req.currentUser?.userId || "");
      const buyUsd = normalizeUsdAmount(req.body?.buyUsd || req.body?.amountUsd || 0);
      if (buyUsd <= 0) {
        throw new Error("Buy amount must be greater than zero.");
      }

      const user = q.userById.get(req.currentUser.userId);
      assertUserCanBuy(user, launch, buyUsd);

      const tierPriceUsd = readCurrentTierPrice(launch, launch.tiers);
      const allocationTokens = toMoney(buyUsd / Math.max(0.00000001, tierPriceUsd));

      if (allocationTokens > launch.remainingTokens + 0.00000001) {
        throw new Error(`Only ${launch.remainingTokens.toFixed(6)} ${launch.coinSymbol} remaining for this launch.`);
      }

      const fundingWalletSymbol = "SPOT_USDT";
      const wallet = ensureWalletDetail(req.currentUser.userId, fundingWalletSymbol, toIso(getNow()));
      const insufficientByUsd = toMoney(Math.max(0, buyUsd - wallet.availableUsd));

      res.json({
        launch,
        fundingWallet: {
          symbol: fundingWalletSymbol,
          availableUsd: toMoney(wallet.availableUsd),
        },
        preview: {
          buyUsd: toMoney(buyUsd),
          tierPriceUsd,
          allocationTokens,
          estimatedListingValueUsd: toMoney(allocationTokens * launch.listingPriceUsd),
          expectedProfitUsd: toMoney(allocationTokens * (launch.listingPriceUsd - tierPriceUsd)),
          insufficientByUsd,
        },
      });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not preview launch buy." });
    }
  }

  function handleLaunchpadBuySubmit(req, res) {
    try {
      const settings = requireLaunchpadEnabledOrThrow();
      refreshAllLaunchesLifecycle();

      const launchRow = getLaunchByInput(req.body || {});
      if (!launchRow) {
        res.status(404).json({ error: "Launch not found." });
        return;
      }

      const launch = getLaunchForResponse(launchRow, req.currentUser?.userId || "");
      const buyUsd = normalizeUsdAmount(req.body?.buyUsd || req.body?.amountUsd || 0);
      if (buyUsd <= 0) {
        throw new Error("Buy amount must be greater than zero.");
      }

      const user = q.userById.get(req.currentUser.userId);
      assertUserCanBuy(user, launch, buyUsd);

      const tierPriceUsd = readCurrentTierPrice(launch, launch.tiers);
      const allocationTokens = toMoney(buyUsd / Math.max(0.00000001, tierPriceUsd));
      if (allocationTokens > launch.remainingTokens + 0.00000001) {
        throw new Error(`Only ${launch.remainingTokens.toFixed(6)} ${launch.coinSymbol} remaining for this launch.`);
      }

      const nowIso = toIso(getNow());
      const participationRef = makeParticipationRef();
      const debitWalletSymbol = "SPOT_USDT";
      const releaseWalletSymbol = makeSpotWalletSymbol(launch.coinSymbol);

      const tx = db.transaction(() => {
        const wallet = ensureWalletDetail(req.currentUser.userId, debitWalletSymbol, nowIso);
        if (wallet.availableUsd < buyUsd - 0.00000001) {
          throw new Error(`Insufficient ${debitWalletSymbol} balance.`);
        }

        const before = toMoney(wallet.availableUsd);
        const after = toMoney(before - buyUsd);
        saveWalletDetail({
          userId: req.currentUser.userId,
          assetSymbol: debitWalletSymbol,
          availableUsd: after,
          lockedUsd: wallet.lockedUsd,
          rewardEarnedUsd: wallet.rewardEarnedUsd,
          updatedAt: nowIso,
        });
        syncWalletSummaryFromDetail({ userId: req.currentUser.userId, assetSymbol: debitWalletSymbol, updatedAt: nowIso });

        insertWalletLedger({
          userId: req.currentUser.userId,
          refType: "launchpad_buy",
          refId: participationRef,
          walletSymbol: debitWalletSymbol,
          assetSymbol: "USDT",
          movementType: "debit",
          amountUsd: buyUsd,
          beforeUsd: before,
          afterUsd: after,
          note: `Launch buy for ${launch.coinSymbol}`,
          createdAt: nowIso,
          createdBy: req.currentUser.userId,
        });

        q.participationInsert.run({
          participationRef,
          launchId: launch.launchId,
          userId: req.currentUser.userId,
          buyUsd: toMoney(buyUsd),
          allocationTokens,
          priceUsedUsd: tierPriceUsd,
          walletDebitSymbol: debitWalletSymbol,
          releaseWalletSymbol,
          status: "pending",
          note: "Awaiting trading open release",
          createdAt: nowIso,
          updatedAt: nowIso,
          releasedAt: null,
        });

        insertEvent({
          launchId: launch.launchId,
          eventType: "real_buy",
          isSimulated: false,
          message: `${sanitizeShortText(user?.name || req.currentUser.name || "Trader", 60)} bought $${buyUsd.toFixed(2)} ${launch.coinSymbol}`,
          displayName: sanitizeShortText(user?.name || req.currentUser.name || "Trader", 80),
          countryCode: "",
          amountUsd: buyUsd,
          tokenAmount: allocationTokens,
          createdAt: nowIso,
        });

        if (buyUsd >= settings.whaleThresholdUsd) {
          insertEvent({
            launchId: launch.launchId,
            eventType: "whale_alert",
            isSimulated: false,
            message: `Whale bought $${buyUsd.toFixed(2)} ${launch.coinSymbol}`,
            displayName: sanitizeShortText(user?.name || req.currentUser.name || "Whale", 80),
            countryCode: "",
            amountUsd: buyUsd,
            tokenAmount: allocationTokens,
            createdAt: nowIso,
          });
        }
      });

      tx();

      const refreshed = recomputeLaunchMetrics(launch.launchId);
      const latestLaunch = getLaunchForResponse(q.launchById.get(launch.launchId), req.currentUser.userId);
      ensureMarketSyncDraft(q.launchById.get(launch.launchId));
      refreshLaunchLifecycle(q.launchById.get(launch.launchId));

      res.json({
        message: "Launch participation submitted successfully.",
        participation: {
          participationRef,
          buyUsd: toMoney(buyUsd),
          allocationTokens,
          priceUsedUsd: tierPriceUsd,
          status: "pending",
          releaseWalletSymbol,
        },
        launch: latestLaunch || refreshed,
      });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not submit launch buy." });
    }
  }

  function handleLaunchpadMyOrders(req, res) {
    try {
      requireLaunchpadEnabledOrThrow();
      const pagination = buildPagination(req.body?.page, req.body?.limit, 20, 120);

      const rows = q.participationsByUser.all({
        userId: req.currentUser.userId,
        limit: pagination.limit,
        offset: pagination.offset,
      });
      const total = toInt(q.participationsCountByUser.get({ userId: req.currentUser.userId })?.total, 0);

      res.json({
        page: pagination.page,
        limit: pagination.limit,
        total,
        orders: rows.map(mapParticipation),
      });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not load launch orders." });
    }
  }

  function handleLaunchpadFeed(req, res) {
    try {
      requireLaunchpadEnabledOrThrow();
      refreshAllLaunchesLifecycle();

      const launchRow = getLaunchByInput(req.body || {});
      if (!launchRow) {
        res.status(404).json({ error: "Launch not found." });
        return;
      }

      const launch = mapLaunch(launchRow);
      const settings = mapEngineSettings();
      if (launch.phase === "live") {
        maybeInsertSimulatedEvent(launch, settings);
      }

      const feed = listEvents(launch.launchId, req.body?.limit || 30);
      res.json({ launch, feed });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not load launch feed." });
    }
  }

  function handleLaunchpadCountdown(req, res) {
    try {
      requireLaunchpadEnabledOrThrow();
      refreshAllLaunchesLifecycle();

      const launchRow = getLaunchByInput(req.body || {});
      if (!launchRow) {
        res.status(404).json({ error: "Launch not found." });
        return;
      }

      const launch = mapLaunch(q.launchById.get(launchRow.id));
      res.json({ launch, countdown: countDownPayload(launch) });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not load countdown." });
    }
  }

  function handleAdminLaunchpadDashboardSummary(req, res) {
    try {
      refreshAllLaunchesLifecycle();

      const all = q.listLaunches.all({ status: "all", limit: 500, offset: 0 }).map(mapLaunch);
      const live = all.filter((item) => item.phase === "live").length;
      const upcoming = all.filter((item) => item.phase === "upcoming").length;
      const ended = all.filter((item) => item.phase === "ended" || item.phase === "sold_out").length;
      const totalRaisedUsd = toMoney(all.reduce((sum, item) => sum + toNumber(item.soldUsd, 0), 0));
      const totalPendingOrders = toInt(
        db.prepare(`SELECT COUNT(*) AS total FROM launch_participations WHERE status = 'pending'`).get()?.total,
        0,
      );

      res.json({
        settings: mapEngineSettings(),
        stats: {
          totalLaunches: all.length,
          live,
          upcoming,
          ended,
          totalRaisedUsd,
          totalPendingOrders,
        },
        featured: all[0] || null,
      });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not load launchpad admin summary." });
    }
  }

  function handleAdminLaunchpadLaunchesList(req, res) {
    try {
      refreshAllLaunchesLifecycle();
      const pagination = buildPagination(req.body?.page, req.body?.limit, 20, 200);
      const status = normalizeLower(req.body?.status || "all");
      const filter = ["all", "live", "upcoming", "ended", "sold_out", "released", "draft", "paused", "cancelled"].includes(status)
        ? status
        : "all";

      const rows = q.listLaunches.all({ status: filter, limit: pagination.limit, offset: pagination.offset });
      const total = toInt(q.countLaunches.get({ status: filter })?.total, 0);

      res.json({
        page: pagination.page,
        limit: pagination.limit,
        total,
        launches: rows.map((row) => getLaunchForResponse(row)),
      });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not list launches." });
    }
  }

  function parseLaunchInput(body = {}, existing = null) {
    const coinSymbol = normalizeAssetSymbol(body.coinSymbol || body.coin_symbol || existing?.coin_symbol || "");
    if (!coinSymbol || coinSymbol === "USDT") {
      throw new Error("Valid coin symbol is required.");
    }

    const coinName = sanitizeShortText(body.coinName || body.coin_name || existing?.coin_name || coinSymbol, 100);
    const launchPriceUsd = Math.max(0.00000001, toNumber(body.launchPriceUsd ?? body.launch_price_usd ?? existing?.launch_price_usd, 0.01));
    const listingPriceUsd = Math.max(launchPriceUsd, toNumber(body.listingPriceUsd ?? body.listing_price_usd ?? existing?.listing_price_usd, launchPriceUsd));
    const totalSupply = Math.max(0, toNumber(body.totalSupply ?? body.total_supply ?? existing?.total_supply, 0));
    const tokensForSale = Math.max(0, toNumber(body.tokensForSale ?? body.tokens_for_sale ?? existing?.tokens_for_sale, totalSupply));
    const minBuyUsd = Math.max(1, toNumber(body.minBuyUsd ?? body.min_buy_usd ?? existing?.min_buy_usd, 10));
    const maxBuyUsd = Math.max(minBuyUsd, toNumber(body.maxBuyUsd ?? body.max_buy_usd ?? existing?.max_buy_usd, 100000));
    const perUserCapUsd = Math.max(minBuyUsd, toNumber(body.perUserCapUsd ?? body.per_user_cap_usd ?? existing?.per_user_cap_usd, 5000));
    const maxSlots = Math.max(1, toInt(body.maxSlots ?? body.max_slots ?? existing?.max_slots, 500));

    const publicStartAt = toIsoSafe(body.publicStartAt || body.public_start_at || existing?.public_start_at || "");
    const endAt = toIsoSafe(body.endAt || body.end_at || existing?.end_at || "");
    const vipStartAt = normalizeText(body.vipStartAt || body.vip_start_at || existing?.vip_start_at || "");
    const vipStartIso = vipStartAt ? toIsoSafe(vipStartAt) : "";
    let tradingOpenAt = normalizeText(body.tradingOpenAt || body.trading_open_at || existing?.trading_open_at || "");

    if (!publicStartAt || !endAt) {
      throw new Error("publicStartAt and endAt are required.");
    }

    if (parseIsoMs(endAt) <= parseIsoMs(publicStartAt)) {
      throw new Error("endAt must be later than publicStartAt.");
    }

    if (!tradingOpenAt) {
      const defaults = mapEngineSettings();
      tradingOpenAt = toIso(new Date(parseIsoMs(endAt) + defaults.defaultTradingDelaySeconds * 1000));
    } else {
      tradingOpenAt = toIsoSafe(tradingOpenAt);
    }

    const expectedRoiX = Math.max(0, toNumber(body.expectedRoiX ?? body.expected_roi_x, listingPriceUsd / launchPriceUsd));
    const description = sanitizeShortText(body.description || existing?.description || "", 900);

    return {
      coinSymbol,
      coinName,
      description,
      launchPriceUsd,
      listingPriceUsd,
      totalSupply,
      tokensForSale,
      minBuyUsd,
      maxBuyUsd,
      perUserCapUsd,
      maxSlots,
      vipStartAt: vipStartIso || null,
      publicStartAt,
      endAt,
      tradingOpenAt,
      expectedRoiX,
    };
  }

  function handleAdminLaunchpadLaunchCreate(req, res) {
    try {
      const nowIso = toIso(getNow());
      const adminId = req.currentUser?.userId || "admin";
      const payload = parseLaunchInput(req.body || {});

      if (q.launchBySymbol.get(payload.coinSymbol)) {
        throw new Error("A launch for this symbol already exists.");
      }

      const status = normalizeLaunchStatus(req.body?.status || "upcoming");
      const launchRef = makeLaunchRef();

      const tx = db.transaction(() => {
        q.insertLaunch.run({
          launchRef,
          coinSymbol: payload.coinSymbol,
          coinName: payload.coinName,
          description: payload.description,
          launchPriceUsd: payload.launchPriceUsd,
          listingPriceUsd: payload.listingPriceUsd,
          totalSupply: payload.totalSupply,
          tokensForSale: payload.tokensForSale,
          minBuyUsd: payload.minBuyUsd,
          maxBuyUsd: payload.maxBuyUsd,
          perUserCapUsd: payload.perUserCapUsd,
          maxSlots: payload.maxSlots,
          vipStartAt: payload.vipStartAt,
          publicStartAt: payload.publicStartAt,
          endAt: payload.endAt,
          tradingOpenAt: payload.tradingOpenAt,
          status,
          soldTokens: 0,
          soldUsd: 0,
          watchlistCount: 0,
          hypePercent: 0,
          expectedRoiX: payload.expectedRoiX,
          lastActivityAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: adminId,
          updatedBy: adminId,
        });

        const launch = q.launchByRef.get(launchRef);
        const tiers = Array.isArray(req.body?.tiers) ? req.body.tiers : buildDefaultTiers(payload.launchPriceUsd);
        saveLaunchTiers({ launchId: launch.id, tiers, nowIso });
        ensureMarketSyncDraft(launch);

        writeAudit(adminId, "launch.create", "launch", String(launch.id), `Created ${payload.coinSymbol}`);
      });

      tx();

      const launch = q.launchByRef.get(launchRef);
      refreshLaunchLifecycle(launch);

      res.json({ message: "Launch created.", launch: getLaunchForResponse(q.launchByRef.get(launchRef)) });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not create launch." });
    }
  }

  function handleAdminLaunchpadLaunchUpdate(req, res) {
    try {
      const launchRow = getLaunchByInput(req.body || {});
      if (!launchRow) {
        res.status(404).json({ error: "Launch not found." });
        return;
      }

      const nowIso = toIso(getNow());
      const adminId = req.currentUser?.userId || "admin";
      const payload = parseLaunchInput(req.body || {}, launchRow);
      const status = normalizeLaunchStatus(req.body?.status || launchRow.status);

      q.updateLaunch.run({
        id: launchRow.id,
        coinName: payload.coinName,
        description: payload.description,
        launchPriceUsd: payload.launchPriceUsd,
        listingPriceUsd: payload.listingPriceUsd,
        totalSupply: payload.totalSupply,
        tokensForSale: payload.tokensForSale,
        minBuyUsd: payload.minBuyUsd,
        maxBuyUsd: payload.maxBuyUsd,
        perUserCapUsd: payload.perUserCapUsd,
        maxSlots: payload.maxSlots,
        vipStartAt: payload.vipStartAt,
        publicStartAt: payload.publicStartAt,
        endAt: payload.endAt,
        tradingOpenAt: payload.tradingOpenAt,
        status,
        expectedRoiX: payload.expectedRoiX,
        updatedAt: nowIso,
        updatedBy: adminId,
      });

      if (Array.isArray(req.body?.tiers)) {
        saveLaunchTiers({ launchId: launchRow.id, tiers: req.body.tiers, nowIso });
      }

      ensureMarketSyncDraft(q.launchById.get(launchRow.id));
      refreshLaunchLifecycle(q.launchById.get(launchRow.id));
      writeAudit(adminId, "launch.update", "launch", String(launchRow.id), `Updated ${payload.coinSymbol}`);

      res.json({ message: "Launch updated.", launch: getLaunchForResponse(q.launchById.get(launchRow.id)) });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not update launch." });
    }
  }

  function handleAdminLaunchpadLaunchStatus(req, res) {
    try {
      const launchRow = getLaunchByInput(req.body || {});
      if (!launchRow) {
        res.status(404).json({ error: "Launch not found." });
        return;
      }

      const status = normalizeLaunchStatus(req.body?.status || "draft");
      const nowIso = toIso(getNow());
      const adminId = req.currentUser?.userId || "admin";
      const previousStatus = normalizeLaunchStatus(launchRow.status || "draft");

      q.updateLaunchStatus.run({
        id: launchRow.id,
        status,
        updatedAt: nowIso,
        updatedBy: adminId,
      });

      if (status === "released") {
        releaseLaunchAllocations({ launchId: launchRow.id, releasedBy: adminId, note: "Status set to released" });
      }

      const updatedLaunch = getLaunchForResponse(q.launchById.get(launchRow.id));
      if (updatedLaunch && status !== previousStatus) {
        safeNotify("onLaunchStatusChanged", {
          launch: updatedLaunch,
          previousStatus,
          nextStatus: status,
          source: "admin_action",
        });
      }

      writeAudit(adminId, "launch.status", "launch", String(launchRow.id), `Status -> ${status}`);
      res.json({ message: "Launch status updated.", launch: updatedLaunch });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not update launch status." });
    }
  }

  function handleAdminLaunchpadTiersSave(req, res) {
    try {
      const launchRow = getLaunchByInput(req.body || {});
      if (!launchRow) {
        res.status(404).json({ error: "Launch not found." });
        return;
      }

      const nowIso = toIso(getNow());
      const tiers = saveLaunchTiers({ launchId: launchRow.id, tiers: req.body?.tiers || [], nowIso });
      writeAudit(req.currentUser?.userId || "admin", "launch.tiers.save", "launch", String(launchRow.id), "Tier ladder updated");

      res.json({
        message: "Launch tiers saved.",
        launch: getLaunchForResponse(q.launchById.get(launchRow.id)),
        tiers,
      });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not save launch tiers." });
    }
  }

  function handleAdminLaunchpadSettingsGet(req, res) {
    try {
      res.json({ settings: mapEngineSettings() });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load launchpad settings." });
    }
  }

  function handleAdminLaunchpadSettingsSave(req, res) {
    try {
      const adminId = req.currentUser?.userId || "admin";
      const settings = saveEngineSettings(req.body || {}, adminId);
      writeAudit(adminId, "settings.save", "engine_settings", "1", "Launchpad engine settings updated");
      res.json({ message: "Launchpad settings updated.", settings });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not save launchpad settings." });
    }
  }

  function handleAdminLaunchpadOrdersList(req, res) {
    try {
      const launchRow = getLaunchByInput(req.body || {});
      if (!launchRow) {
        res.status(404).json({ error: "Launch not found." });
        return;
      }

      const pagination = buildPagination(req.body?.page, req.body?.limit, 20, 200);
      const status = normalizeLower(req.body?.status || "all");
      const filter = ["all", "pending", "released", "cancelled"].includes(status) ? status : "all";

      const rows = q.participationsByLaunch.all({
        launchId: launchRow.id,
        status: filter,
        limit: pagination.limit,
        offset: pagination.offset,
      });
      const total = toInt(q.participationsCountByLaunch.get({ launchId: launchRow.id, status: filter })?.total, 0);

      res.json({
        launch: getLaunchForResponse(q.launchById.get(launchRow.id)),
        page: pagination.page,
        limit: pagination.limit,
        total,
        orders: rows.map(mapParticipation),
      });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not list launch orders." });
    }
  }

  function handleAdminLaunchpadOrdersRelease(req, res) {
    try {
      const launchRow = getLaunchByInput(req.body || {});
      if (!launchRow) {
        res.status(404).json({ error: "Launch not found." });
        return;
      }

      const adminId = req.currentUser?.userId || "admin";
      const launch = releaseLaunchAllocations({
        launchId: launchRow.id,
        releasedBy: adminId,
        note: req.body?.note || "Manual release from admin desk",
      });

      writeAudit(adminId, "orders.release", "launch", String(launchRow.id), "Pending allocations released");
      res.json({ message: "Allocations released.", launch: getLaunchForResponse(q.launchById.get(launch.launchId)) });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not release launch allocations." });
    }
  }

  function handleAdminLaunchpadMarketSyncRun(req, res) {
    try {
      const launchRow = getLaunchByInput(req.body || {});
      if (!launchRow) {
        res.status(404).json({ error: "Launch not found." });
        return;
      }

      const adminId = req.currentUser?.userId || "admin";
      const syncResult = ensureMarketSyncDraft(launchRow);
      const enableSpot = normalizeBooleanNumber(req.body?.enableSpot, 0) === 1;
      const enableConvert = normalizeBooleanNumber(req.body?.enableConvert, 0) === 1;
      const enableBinary = normalizeBooleanNumber(req.body?.enableBinary, 0) === 1;
      const nowIso = toIso(getNow());

      if (enableSpot && syncResult.spotPair?.id) {
        q.spotPairToggle.run({ id: syncResult.spotPair.id, isEnabled: 1, updatedAt: nowIso, updatedBy: adminId });
      }
      if (enableConvert && syncResult.convertPairForward?.id) {
        q.convertPairToggle.run({ id: syncResult.convertPairForward.id, isEnabled: 1, updatedAt: nowIso, updatedBy: adminId });
        if (syncResult.convertPairReverse?.id) {
          q.convertPairToggle.run({ id: syncResult.convertPairReverse.id, isEnabled: 1, updatedAt: nowIso, updatedBy: adminId });
        }
      }
      if (enableBinary && syncResult.binaryPair?.id) {
        q.binaryPairToggle.run({ id: syncResult.binaryPair.id, isEnabled: 1, updatedAt: nowIso, updatedBy: adminId });
      }

      writeAudit(
        adminId,
        "market.sync.run",
        "launch",
        String(launchRow.id),
        `Sync complete (spot:${enableSpot ? "on" : "off"}, convert:${enableConvert ? "on" : "off"}, binary:${enableBinary ? "on" : "off"})`,
      );

      res.json({
        message: "Market sync completed.",
        launch: getLaunchForResponse(q.launchById.get(launchRow.id)),
        sync: q.marketSyncByLaunch.get(launchRow.id),
      });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not run market sync." });
    }
  }

  function handleAdminLaunchpadAuditList(req, res) {
    try {
      const pagination = buildPagination(req.body?.page, req.body?.limit, 30, 200);
      const rows = q.auditList.all({ limit: pagination.limit, offset: pagination.offset });
      const total = toInt(q.auditCount.get()?.total, 0);

      res.json({
        page: pagination.page,
        limit: pagination.limit,
        total,
        logs: rows.map((row) => ({
          auditId: toInt(row.id, 0),
          adminUserId: String(row.admin_user_id || ""),
          actionType: String(row.action_type || ""),
          targetType: String(row.target_type || ""),
          targetId: String(row.target_id || ""),
          note: String(row.note || ""),
          createdAt: String(row.created_at || ""),
        })),
      });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not load audit logs." });
    }
  }

  return {
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
  };
}
