export function createLumModule({ db, getNow, toIso, normalizeAssetSymbol, normalizeUsdAmount, sanitizeShortText }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lum_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_code TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      short_description TEXT NOT NULL DEFAULT '',
      details_html TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'USDT',
      minimum_amount_usd REAL NOT NULL DEFAULT 0,
      maximum_amount_usd REAL,
      return_rate REAL NOT NULL,
      return_type TEXT NOT NULL,
      cycle_days INTEGER NOT NULL,
      payout_type TEXT NOT NULL,
      lock_principal INTEGER NOT NULL DEFAULT 1,
      allow_early_redeem INTEGER NOT NULL DEFAULT 0,
      early_redeem_penalty_percent REAL NOT NULL DEFAULT 0,
      requires_admin_review INTEGER NOT NULL DEFAULT 0,
      quota_limit INTEGER,
      quota_used INTEGER NOT NULL DEFAULT 0,
      is_featured INTEGER NOT NULL DEFAULT 0,
      badge_label TEXT,
      display_sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT,
      updated_by TEXT
    );

    CREATE TABLE IF NOT EXISTS lum_plan_contents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      content_type TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      body_text TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lum_investments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      investment_ref TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      plan_id INTEGER NOT NULL,
      plan_code_snapshot TEXT NOT NULL,
      plan_title_snapshot TEXT NOT NULL,
      category_snapshot TEXT NOT NULL,
      currency_snapshot TEXT NOT NULL DEFAULT 'USDT',
      invested_amount_usd REAL NOT NULL,
      return_rate_snapshot REAL NOT NULL,
      return_type_snapshot TEXT NOT NULL,
      payout_type_snapshot TEXT NOT NULL,
      cycle_days_snapshot INTEGER NOT NULL,
      expected_profit_usd REAL NOT NULL DEFAULT 0,
      expected_total_return_usd REAL NOT NULL DEFAULT 0,
      accrued_profit_usd REAL NOT NULL DEFAULT 0,
      settled_profit_usd REAL NOT NULL DEFAULT 0,
      settled_total_return_usd REAL NOT NULL DEFAULT 0,
      locked_principal_usd REAL NOT NULL DEFAULT 0,
      wallet_asset_symbol TEXT NOT NULL DEFAULT 'USDT',
      status TEXT NOT NULL,
      review_note TEXT,
      started_at TEXT,
      ends_at TEXT,
      settled_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by TEXT
    );

    CREATE TABLE IF NOT EXISTS lum_investment_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      investment_id INTEGER NOT NULL,
      reward_date TEXT NOT NULL,
      reward_amount_usd REAL NOT NULL,
      reward_type TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      credited_at TEXT,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS lum_wallet_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      investment_id INTEGER,
      ledger_type TEXT NOT NULL,
      asset_symbol TEXT NOT NULL DEFAULT 'USDT',
      amount_usd REAL NOT NULL,
      balance_before_usd REAL,
      balance_after_usd REAL,
      note TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT
    );

    CREATE TABLE IF NOT EXISTS user_wallet_balance_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      asset_symbol TEXT NOT NULL DEFAULT 'USDT',
      available_usd REAL NOT NULL DEFAULT 0,
      locked_usd REAL NOT NULL DEFAULT 0,
      reward_earned_usd REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, asset_symbol)
    );

    CREATE TABLE IF NOT EXISTS lum_admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_user_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );
  `);

  const RETURN_TYPES = new Set(["daily_percent", "cycle_percent", "fixed_amount", "apr_percent"]);
  const PAYOUT_TYPES = new Set(["on_maturity", "daily_credit", "manual_settlement"]);
  const PLAN_CATEGORIES = new Set(["lum", "mining"]);
  const PLAN_STATUSES = new Set(["draft", "active", "disabled", "archived"]);
  const INVESTMENT_STATUSES = new Set(["pending", "active", "completed", "rejected", "cancelled", "redeemed_early"]);

  const listPlansStatement = db.prepare(`
    SELECT * FROM lum_plans
    WHERE (@category = 'all' OR category = @category)
      AND (@status = 'all' OR status = @status)
    ORDER BY display_sort_order ASC, id DESC
  `);
  const listVisiblePlansStatement = db.prepare(`
    SELECT * FROM lum_plans
    WHERE status = 'active'
      AND (@category = 'all' OR category = @category)
    ORDER BY display_sort_order ASC, id DESC
  `);
  const findPlanByIdStatement = db.prepare(`
    SELECT * FROM lum_plans WHERE id = ? LIMIT 1
  `);
  const findPlanByCodeStatement = db.prepare(`
    SELECT * FROM lum_plans WHERE plan_code = ? LIMIT 1
  `);
  const findUserAccountStatement = db.prepare(`
    SELECT user_id, account_status, kyc_status
    FROM users
    WHERE user_id = ?
    LIMIT 1
  `);
  const insertPlanStatement = db.prepare(`
    INSERT INTO lum_plans (
      plan_code, category, title, short_description, details_html, currency,
      minimum_amount_usd, maximum_amount_usd, return_rate, return_type, cycle_days, payout_type,
      lock_principal, allow_early_redeem, early_redeem_penalty_percent, requires_admin_review,
      quota_limit, quota_used, is_featured, badge_label, display_sort_order, status,
      created_at, updated_at, created_by, updated_by
    )
    VALUES (
      @planCode, @category, @title, @shortDescription, @detailsHtml, @currency,
      @minimumAmountUsd, @maximumAmountUsd, @returnRate, @returnType, @cycleDays, @payoutType,
      @lockPrincipal, @allowEarlyRedeem, @earlyRedeemPenaltyPercent, @requiresAdminReview,
      @quotaLimit, @quotaUsed, @isFeatured, @badgeLabel, @displaySortOrder, @status,
      @createdAt, @updatedAt, @createdBy, @updatedBy
    )
  `);
  const updatePlanStatement = db.prepare(`
    UPDATE lum_plans
    SET category = @category,
        title = @title,
        short_description = @shortDescription,
        details_html = @detailsHtml,
        currency = @currency,
        minimum_amount_usd = @minimumAmountUsd,
        maximum_amount_usd = @maximumAmountUsd,
        return_rate = @returnRate,
        return_type = @returnType,
        cycle_days = @cycleDays,
        payout_type = @payoutType,
        lock_principal = @lockPrincipal,
        allow_early_redeem = @allowEarlyRedeem,
        early_redeem_penalty_percent = @earlyRedeemPenaltyPercent,
        requires_admin_review = @requiresAdminReview,
        quota_limit = @quotaLimit,
        is_featured = @isFeatured,
        badge_label = @badgeLabel,
        display_sort_order = @displaySortOrder,
        status = @status,
        updated_at = @updatedAt,
        updated_by = @updatedBy
    WHERE id = @id
  `);
  const setPlanStatusStatement = db.prepare(`
    UPDATE lum_plans
    SET status = @status,
        updated_at = @updatedAt,
        updated_by = @updatedBy
    WHERE id = @id
  `);

  const listPlanContentsStatement = db.prepare(`
    SELECT * FROM lum_plan_contents
    WHERE plan_id = @planId
      AND (@activeOnly = 0 OR is_active = 1)
    ORDER BY sort_order ASC, id ASC
  `);
  const insertPlanContentStatement = db.prepare(`
    INSERT INTO lum_plan_contents (
      plan_id, content_type, title, body_text, sort_order, is_active, created_at, updated_at
    )
    VALUES (
      @planId, @contentType, @title, @bodyText, @sortOrder, @isActive, @createdAt, @updatedAt
    )
  `);
  const updatePlanContentStatement = db.prepare(`
    UPDATE lum_plan_contents
    SET content_type = @contentType,
        title = @title,
        body_text = @bodyText,
        sort_order = @sortOrder,
        is_active = @isActive,
        updated_at = @updatedAt
    WHERE id = @id
  `);

  const listInvestmentsStatement = db.prepare(`
    SELECT * FROM lum_investments
    WHERE user_id = @userId
      AND (@status = 'all' OR status = @status)
      AND (@category = 'all' OR category_snapshot = @category)
    ORDER BY created_at DESC, id DESC
    LIMIT @limit OFFSET @offset
  `);
  const listAllInvestmentsForAdminStatement = db.prepare(`
    SELECT i.*, u.name AS account_name, u.email AS account_email
    FROM lum_investments i
    LEFT JOIN users u ON u.user_id = i.user_id
    WHERE (@status = 'all' OR i.status = @status)
      AND (@category = 'all' OR i.category_snapshot = @category)
      AND (@keyword = '' OR i.investment_ref LIKE @likeKeyword OR i.user_id LIKE @likeKeyword OR u.email LIKE @likeKeyword OR u.name LIKE @likeKeyword)
    ORDER BY i.created_at DESC, i.id DESC
    LIMIT @limit OFFSET @offset
  `);
  const findInvestmentByIdStatement = db.prepare(`
    SELECT * FROM lum_investments WHERE id = ? LIMIT 1
  `);
  const findInvestmentByRefStatement = db.prepare(`
    SELECT * FROM lum_investments WHERE investment_ref = ? LIMIT 1
  `);
  const listMaturedActiveInvestmentsByUserStatement = db.prepare(`
    SELECT * FROM lum_investments
    WHERE user_id = @userId
      AND status = 'active'
      AND ends_at IS NOT NULL
      AND ends_at <= @nowIso
    ORDER BY ends_at ASC, id ASC
  `);
  const listMaturedActiveInvestmentsGlobalStatement = db.prepare(`
    SELECT * FROM lum_investments
    WHERE status = 'active'
      AND ends_at IS NOT NULL
      AND ends_at <= @nowIso
    ORDER BY ends_at ASC, id ASC
    LIMIT 200
  `);
  const listActiveInvestmentsByUserStatement = db.prepare(`
    SELECT * FROM lum_investments
    WHERE user_id = @userId
      AND status = 'active'
    ORDER BY created_at DESC
  `);
  const insertInvestmentStatement = db.prepare(`
    INSERT INTO lum_investments (
      investment_ref, user_id, plan_id, plan_code_snapshot, plan_title_snapshot,
      category_snapshot, currency_snapshot, invested_amount_usd,
      return_rate_snapshot, return_type_snapshot, payout_type_snapshot, cycle_days_snapshot,
      expected_profit_usd, expected_total_return_usd, accrued_profit_usd,
      settled_profit_usd, settled_total_return_usd, locked_principal_usd,
      wallet_asset_symbol, status, review_note,
      started_at, ends_at, settled_at,
      created_at, updated_at, reviewed_at, reviewed_by
    )
    VALUES (
      @investmentRef, @userId, @planId, @planCodeSnapshot, @planTitleSnapshot,
      @categorySnapshot, @currencySnapshot, @investedAmountUsd,
      @returnRateSnapshot, @returnTypeSnapshot, @payoutTypeSnapshot, @cycleDaysSnapshot,
      @expectedProfitUsd, @expectedTotalReturnUsd, @accruedProfitUsd,
      @settledProfitUsd, @settledTotalReturnUsd, @lockedPrincipalUsd,
      @walletAssetSymbol, @status, @reviewNote,
      @startedAt, @endsAt, @settledAt,
      @createdAt, @updatedAt, @reviewedAt, @reviewedBy
    )
  `);
  const updateInvestmentStatusStatement = db.prepare(`
    UPDATE lum_investments
    SET status = @status,
        review_note = @reviewNote,
        started_at = @startedAt,
        ends_at = @endsAt,
        settled_at = @settledAt,
        reviewed_at = @reviewedAt,
        reviewed_by = @reviewedBy,
        accrued_profit_usd = @accruedProfitUsd,
        settled_profit_usd = @settledProfitUsd,
        settled_total_return_usd = @settledTotalReturnUsd,
        locked_principal_usd = @lockedPrincipalUsd,
        updated_at = @updatedAt
    WHERE id = @id
  `);
  const updateInvestmentAccruedStatement = db.prepare(`
    UPDATE lum_investments
    SET accrued_profit_usd = @accruedProfitUsd,
        updated_at = @updatedAt
    WHERE id = @id
  `);

  const findWalletDetailStatement = db.prepare(`
    SELECT * FROM user_wallet_balance_details
    WHERE user_id = ? AND asset_symbol = ?
    LIMIT 1
  `);
  const insertWalletDetailStatement = db.prepare(`
    INSERT INTO user_wallet_balance_details (
      user_id, asset_symbol, available_usd, locked_usd, reward_earned_usd, updated_at
    )
    VALUES (@userId, @assetSymbol, @availableUsd, @lockedUsd, @rewardEarnedUsd, @updatedAt)
  `);
  const updateWalletDetailStatement = db.prepare(`
    UPDATE user_wallet_balance_details
    SET available_usd = @availableUsd,
        locked_usd = @lockedUsd,
        reward_earned_usd = @rewardEarnedUsd,
        updated_at = @updatedAt
    WHERE user_id = @userId AND asset_symbol = @assetSymbol
  `);
  const listWalletDetailsByUserStatement = db.prepare(`
    SELECT * FROM user_wallet_balance_details
    WHERE user_id = ?
    ORDER BY updated_at DESC, id DESC
  `);

  const findWalletSummaryByAssetStatement = db.prepare(`
    SELECT * FROM user_wallet_balances
    WHERE user_id = ? AND asset_symbol = ?
    LIMIT 1
  `);
  const setWalletSummaryStatement = db.prepare(`
    INSERT INTO user_wallet_balances (
      user_id, asset_symbol, asset_name, total_usd, updated_at
    )
    VALUES (@userId, @assetSymbol, @assetName, @totalUsd, @updatedAt)
    ON CONFLICT(user_id, asset_symbol)
    DO UPDATE SET
      asset_name = excluded.asset_name,
      total_usd = excluded.total_usd,
      updated_at = excluded.updated_at
  `);

  const insertRewardStatement = db.prepare(`
    INSERT INTO lum_investment_rewards (
      investment_id, reward_date, reward_amount_usd, reward_type, status, created_at, credited_at, note
    )
    VALUES (
      @investmentId, @rewardDate, @rewardAmountUsd, @rewardType, @status, @createdAt, @creditedAt, @note
    )
  `);

  const insertWalletLedgerStatement = db.prepare(`
    INSERT INTO lum_wallet_ledger (
      user_id, investment_id, ledger_type, asset_symbol, amount_usd,
      balance_before_usd, balance_after_usd, note, created_at, created_by
    )
    VALUES (
      @userId, @investmentId, @ledgerType, @assetSymbol, @amountUsd,
      @balanceBeforeUsd, @balanceAfterUsd, @note, @createdAt, @createdBy
    )
  `);

  const insertAuditStatement = db.prepare(`
    INSERT INTO lum_admin_audit_logs (
      admin_user_id, action_type, target_type, target_id, note, created_at
    )
    VALUES (
      @adminUserId, @actionType, @targetType, @targetId, @note, @createdAt
    )
  `);

  const countPlansStatement = db.prepare(`SELECT COUNT(*) AS total FROM lum_plans WHERE (@category='all' OR category=@category)`);
  const countInvestmentsStatement = db.prepare(`SELECT COUNT(*) AS total FROM lum_investments WHERE (@status='all' OR status=@status)`);

  function normalizeCategory(value = "all") {
    const normalized = String(value || "all").trim().toLowerCase();
    if (normalized === "all") {
      return "all";
    }
    return PLAN_CATEGORIES.has(normalized) ? normalized : "lum";
  }

  function normalizePlanStatus(value = "active") {
    const normalized = String(value || "active").trim().toLowerCase();
    return PLAN_STATUSES.has(normalized) ? normalized : "active";
  }

  function normalizePlanStatusFilter(value = "all") {
    const normalized = String(value || "all").trim().toLowerCase();
    if (normalized === "all") {
      return "all";
    }
    return PLAN_STATUSES.has(normalized) ? normalized : "all";
  }

  function normalizeReturnType(value = "daily_percent") {
    const normalized = String(value || "daily_percent").trim().toLowerCase();
    if (!RETURN_TYPES.has(normalized)) {
      throw new Error("Invalid return type.");
    }
    return normalized;
  }

  function normalizePayoutType(value = "on_maturity") {
    const normalized = String(value || "on_maturity").trim().toLowerCase();
    if (!PAYOUT_TYPES.has(normalized)) {
      throw new Error("Invalid payout type.");
    }
    return normalized;
  }

  function normalizeInvestmentStatus(value = "all") {
    const normalized = String(value || "all").trim().toLowerCase();
    if (normalized === "all") {
      return "all";
    }
    return INVESTMENT_STATUSES.has(normalized) ? normalized : "all";
  }

  function toFixedMoney(value = 0) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    return Number(numeric.toFixed(8));
  }

  function createInvestmentRef() {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `LUM-${stamp}-${rand}`;
  }

  function parseIso(value = "") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function addDaysIso(baseIso, days) {
    const baseDate = parseIso(baseIso) || getNow();
    const next = new Date(baseDate);
    next.setDate(next.getDate() + Number(days || 0));
    return toIso(next);
  }

  function daysBetween(fromIso, toIsoValue) {
    const from = parseIso(fromIso);
    const to = parseIso(toIsoValue);
    if (!from || !to) {
      return 0;
    }
    const diffMs = to.getTime() - from.getTime();
    if (diffMs <= 0) {
      return 0;
    }
    return Math.floor(diffMs / (24 * 60 * 60 * 1000));
  }

  function calculateInvestmentProjection({ investedAmountUsd, returnRate, returnType, cycleDays }) {
    const amount = Number(investedAmountUsd || 0);
    const rate = Number(returnRate || 0);
    const cycle = Math.max(1, Number(cycleDays || 1));

    let totalProfit = 0;
    let dailyProfit = 0;

    if (returnType === "daily_percent") {
      dailyProfit = amount * (rate / 100);
      totalProfit = dailyProfit * cycle;
    } else if (returnType === "cycle_percent") {
      totalProfit = amount * (rate / 100);
      dailyProfit = totalProfit / cycle;
    } else if (returnType === "fixed_amount") {
      totalProfit = rate;
      dailyProfit = totalProfit / cycle;
    } else if (returnType === "apr_percent") {
      dailyProfit = amount * ((rate / 100) / 365);
      totalProfit = dailyProfit * cycle;
    }

    const expectedProfitUsd = toFixedMoney(totalProfit);
    const expectedTotalReturnUsd = toFixedMoney(amount + expectedProfitUsd);

    return {
      expectedProfitUsd,
      expectedTotalReturnUsd,
      dailyProfitUsd: toFixedMoney(dailyProfit),
    };
  }

  function calculateAccruedProfit(investment, nowIso) {
    const status = String(investment.status || "").toLowerCase();
    if (status !== "active") {
      return toFixedMoney(investment.accrued_profit_usd || 0);
    }

    const cycleDays = Math.max(1, Number(investment.cycle_days_snapshot || 1));
    const elapsedDays = Math.min(cycleDays, daysBetween(investment.started_at, nowIso));
    if (elapsedDays <= 0) {
      return 0;
    }

    const projection = calculateInvestmentProjection({
      investedAmountUsd: Number(investment.invested_amount_usd || 0),
      returnRate: Number(investment.return_rate_snapshot || 0),
      returnType: String(investment.return_type_snapshot || "daily_percent"),
      cycleDays,
    });

    const prorated = projection.expectedProfitUsd * (elapsedDays / cycleDays);
    return toFixedMoney(Math.min(projection.expectedProfitUsd, prorated));
  }

  function mapPlan(row) {
    if (!row) {
      return null;
    }
    return {
      planId: row.id,
      planCode: row.plan_code,
      category: row.category,
      title: row.title,
      shortDescription: row.short_description,
      detailsHtml: row.details_html,
      currency: row.currency,
      minimumAmountUsd: Number(row.minimum_amount_usd || 0),
      maximumAmountUsd: row.maximum_amount_usd === null ? null : Number(row.maximum_amount_usd || 0),
      returnRate: Number(row.return_rate || 0),
      returnType: row.return_type,
      cycleDays: Number(row.cycle_days || 0),
      payoutType: row.payout_type,
      lockPrincipal: Number(row.lock_principal || 0) === 1,
      allowEarlyRedeem: Number(row.allow_early_redeem || 0) === 1,
      earlyRedeemPenaltyPercent: Number(row.early_redeem_penalty_percent || 0),
      requiresAdminReview: Number(row.requires_admin_review || 0) === 1,
      quotaLimit: row.quota_limit === null ? null : Number(row.quota_limit || 0),
      quotaUsed: Number(row.quota_used || 0),
      isFeatured: Number(row.is_featured || 0) === 1,
      badgeLabel: row.badge_label || "",
      displaySortOrder: Number(row.display_sort_order || 0),
      status: row.status,
      updatedAt: row.updated_at || "",
    };
  }

  function mapContent(row) {
    if (!row) {
      return null;
    }
    return {
      contentId: row.id,
      planId: row.plan_id,
      contentType: row.content_type,
      title: row.title,
      bodyText: row.body_text,
      sortOrder: Number(row.sort_order || 0),
      isActive: Number(row.is_active || 0) === 1,
      updatedAt: row.updated_at || "",
    };
  }

  function mapInvestment(row, { includeAccount = false, nowIso = toIso(getNow()) } = {}) {
    if (!row) {
      return null;
    }

    const accruedProfitUsd = calculateAccruedProfit(row, nowIso);
    const expectedTotalReturnUsd = Number(row.expected_total_return_usd || 0);
    const status = String(row.status || "pending").toLowerCase();
    const endAt = row.ends_at || "";
    const remainingDays = status === "active" && endAt ? Math.max(0, daysBetween(nowIso, endAt)) : 0;

    const payload = {
      investmentId: row.id,
      investmentRef: row.investment_ref,
      userId: row.user_id,
      planId: row.plan_id,
      planCode: row.plan_code_snapshot,
      planTitle: row.plan_title_snapshot,
      category: row.category_snapshot,
      currency: row.currency_snapshot,
      investedAmountUsd: Number(row.invested_amount_usd || 0),
      returnRate: Number(row.return_rate_snapshot || 0),
      returnType: row.return_type_snapshot,
      payoutType: row.payout_type_snapshot,
      cycleDays: Number(row.cycle_days_snapshot || 0),
      expectedProfitUsd: Number(row.expected_profit_usd || 0),
      expectedTotalReturnUsd,
      accruedProfitUsd,
      settledProfitUsd: Number(row.settled_profit_usd || 0),
      settledTotalReturnUsd: Number(row.settled_total_return_usd || 0),
      lockedPrincipalUsd: Number(row.locked_principal_usd || 0),
      walletAssetSymbol: row.wallet_asset_symbol,
      status,
      reviewNote: row.review_note || "",
      startedAt: row.started_at || "",
      endsAt: endAt,
      settledAt: row.settled_at || "",
      createdAt: row.created_at || "",
      reviewedAt: row.reviewed_at || "",
      reviewedBy: row.reviewed_by || "",
      remainingDays,
    };

    if (includeAccount) {
      payload.accountName = row.account_name || "";
      payload.accountEmail = row.account_email || "";
    }

    return payload;
  }

  function syncWalletSummaryFromDetail({ userId, assetSymbol, assetName, detail, updatedAt }) {
    const totalUsd = toFixedMoney(Number(detail.available_usd || 0) + Number(detail.locked_usd || 0));
    setWalletSummaryStatement.run({
      userId,
      assetSymbol,
      assetName,
      totalUsd,
      updatedAt,
    });
  }

  function ensureWalletDetailRow(userId, assetSymbol, nowIso) {
    const symbol = normalizeAssetSymbol(assetSymbol || "USDT") || "USDT";
    const existing = findWalletDetailStatement.get(userId, symbol);
    if (existing) {
      return existing;
    }

    const summary = findWalletSummaryByAssetStatement.get(userId, symbol);
    const availableUsd = Number(summary?.total_usd || 0);
    const insertPayload = {
      userId,
      assetSymbol: symbol,
      availableUsd: toFixedMoney(availableUsd),
      lockedUsd: 0,
      rewardEarnedUsd: 0,
      updatedAt: nowIso,
    };
    insertWalletDetailStatement.run(insertPayload);
    const created = findWalletDetailStatement.get(userId, symbol);

    if (!summary) {
      syncWalletSummaryFromDetail({
        userId,
        assetSymbol: symbol,
        assetName: symbol,
        detail: created,
        updatedAt: nowIso,
      });
    }

    return created;
  }

  function saveWalletDetail({ userId, assetSymbol, availableUsd, lockedUsd, rewardEarnedUsd, updatedAt }) {
    updateWalletDetailStatement.run({
      userId,
      assetSymbol,
      availableUsd: toFixedMoney(availableUsd),
      lockedUsd: toFixedMoney(lockedUsd),
      rewardEarnedUsd: toFixedMoney(rewardEarnedUsd),
      updatedAt,
    });
    return findWalletDetailStatement.get(userId, assetSymbol);
  }

  function writeWalletLedger({ userId, investmentId, ledgerType, assetSymbol, amountUsd, balanceBeforeUsd, balanceAfterUsd, note, createdBy }) {
    insertWalletLedgerStatement.run({
      userId,
      investmentId: investmentId || null,
      ledgerType,
      assetSymbol,
      amountUsd: toFixedMoney(amountUsd),
      balanceBeforeUsd: toFixedMoney(balanceBeforeUsd),
      balanceAfterUsd: toFixedMoney(balanceAfterUsd),
      note: sanitizeShortText(note || "", 280),
      createdAt: toIso(getNow()),
      createdBy: createdBy || null,
    });
  }

  function writeAudit(adminUserId, actionType, targetType, targetId, note = "") {
    insertAuditStatement.run({
      adminUserId,
      actionType,
      targetType,
      targetId: String(targetId),
      note: sanitizeShortText(note, 320),
      createdAt: toIso(getNow()),
    });
  }

  function settleInvestmentByRow(investmentRow, actor = "system") {
    if (!investmentRow || String(investmentRow.status || "") !== "active") {
      return null;
    }

    const nowIso = toIso(getNow());
    const projection = calculateInvestmentProjection({
      investedAmountUsd: Number(investmentRow.invested_amount_usd || 0),
      returnRate: Number(investmentRow.return_rate_snapshot || 0),
      returnType: String(investmentRow.return_type_snapshot || "daily_percent"),
      cycleDays: Number(investmentRow.cycle_days_snapshot || 1),
    });

    const existingSettledProfit = Number(investmentRow.settled_profit_usd || 0);
    const additionalProfit = Math.max(0, toFixedMoney(projection.expectedProfitUsd - existingSettledProfit));
    const principal = Number(investmentRow.locked_principal_usd || investmentRow.invested_amount_usd || 0);
    const userId = investmentRow.user_id;
    const assetSymbol = normalizeAssetSymbol(investmentRow.wallet_asset_symbol || "USDT") || "USDT";

    const settleTx = db.transaction(() => {
      let detail = ensureWalletDetailRow(userId, assetSymbol, nowIso);
      const beforeAvailable = Number(detail.available_usd || 0);
      const beforeLocked = Number(detail.locked_usd || 0);

      const nextLocked = Math.max(0, beforeLocked - principal);
      const nextAvailable = beforeAvailable + principal + additionalProfit;
      const nextReward = Number(detail.reward_earned_usd || 0) + additionalProfit;

      detail = saveWalletDetail({
        userId,
        assetSymbol,
        availableUsd: nextAvailable,
        lockedUsd: nextLocked,
        rewardEarnedUsd: nextReward,
        updatedAt: nowIso,
      });

      syncWalletSummaryFromDetail({
        userId,
        assetSymbol,
        assetName: assetSymbol,
        detail,
        updatedAt: nowIso,
      });

      writeWalletLedger({
        userId,
        investmentId: investmentRow.id,
        ledgerType: "principal_return",
        assetSymbol,
        amountUsd: principal,
        balanceBeforeUsd: beforeAvailable,
        balanceAfterUsd: nextAvailable,
        note: `Principal returned at maturity (${investmentRow.investment_ref}).`,
        createdBy: actor,
      });

      if (additionalProfit > 0) {
        writeWalletLedger({
          userId,
          investmentId: investmentRow.id,
          ledgerType: "reward_credit",
          assetSymbol,
          amountUsd: additionalProfit,
          balanceBeforeUsd: nextAvailable - additionalProfit,
          balanceAfterUsd: nextAvailable,
          note: `Maturity reward credited (${investmentRow.investment_ref}).`,
          createdBy: actor,
        });

        insertRewardStatement.run({
          investmentId: investmentRow.id,
          rewardDate: nowIso,
          rewardAmountUsd: additionalProfit,
          rewardType: "maturity",
          status: "credited",
          createdAt: nowIso,
          creditedAt: nowIso,
          note: "Auto-settled at maturity",
        });
      }

      updateInvestmentStatusStatement.run({
        id: investmentRow.id,
        status: "completed",
        reviewNote: investmentRow.review_note || "",
        startedAt: investmentRow.started_at || nowIso,
        endsAt: investmentRow.ends_at || nowIso,
        settledAt: nowIso,
        reviewedAt: investmentRow.reviewed_at || null,
        reviewedBy: investmentRow.reviewed_by || null,
        accruedProfitUsd: projection.expectedProfitUsd,
        settledProfitUsd: toFixedMoney(existingSettledProfit + additionalProfit),
        settledTotalReturnUsd: toFixedMoney(Number(investmentRow.invested_amount_usd || 0) + Number(existingSettledProfit || 0) + additionalProfit),
        lockedPrincipalUsd: 0,
        updatedAt: nowIso,
      });
    });

    settleTx();
    return findInvestmentByIdStatement.get(investmentRow.id);
  }

  function settleMaturedInvestmentsForUser(userId, actor = "system") {
    const nowIso = toIso(getNow());
    const rows = listMaturedActiveInvestmentsByUserStatement.all({ userId, nowIso });
    for (const row of rows) {
      settleInvestmentByRow(row, actor);
    }
  }

  function settleMaturedInvestmentsGlobal(actor = "system") {
    const nowIso = toIso(getNow());
    const rows = listMaturedActiveInvestmentsGlobalStatement.all({ nowIso });
    for (const row of rows) {
      settleInvestmentByRow(row, actor);
    }
  }

  function refreshAccruedForUser(userId) {
    const nowIso = toIso(getNow());
    const rows = listActiveInvestmentsByUserStatement.all({ userId });
    for (const row of rows) {
      const accrued = calculateAccruedProfit(row, nowIso);
      updateInvestmentAccruedStatement.run({
        id: row.id,
        accruedProfitUsd: accrued,
        updatedAt: nowIso,
      });
    }
  }

  function loadSummaryForUser(userId) {
    settleMaturedInvestmentsForUser(userId);
    refreshAccruedForUser(userId);

    const investments = db
      .prepare(`SELECT * FROM lum_investments WHERE user_id = ? ORDER BY created_at DESC`)
      .all(userId);

    let custodialFunds = 0;
    let todayExpected = 0;
    let totalReturnRealized = 0;
    let totalReturnEstimated = 0;
    let orderEscrow = 0;
    let activeCount = 0;
    let completedCount = 0;
    let pendingCount = 0;

    for (const row of investments) {
      const status = String(row.status || "pending").toLowerCase();
      const projection = calculateInvestmentProjection({
        investedAmountUsd: Number(row.invested_amount_usd || 0),
        returnRate: Number(row.return_rate_snapshot || 0),
        returnType: String(row.return_type_snapshot || "daily_percent"),
        cycleDays: Number(row.cycle_days_snapshot || 1),
      });

      if (status === "pending") {
        orderEscrow += Number(row.invested_amount_usd || 0);
        custodialFunds += Number(row.locked_principal_usd || 0);
        pendingCount += 1;
      }

      if (status === "active") {
        activeCount += 1;
        custodialFunds += Number(row.locked_principal_usd || 0);

        if (row.return_type_snapshot === "daily_percent" || row.return_type_snapshot === "apr_percent") {
          todayExpected += projection.dailyProfitUsd;
        } else {
          todayExpected += projection.expectedProfitUsd / Math.max(1, Number(row.cycle_days_snapshot || 1));
        }
      }

      if (status === "completed" || status === "redeemed_early") {
        completedCount += 1;
      }

      totalReturnRealized += Number(row.settled_profit_usd || 0);
      totalReturnEstimated += Number(row.settled_profit_usd || 0) + Number(row.accrued_profit_usd || 0);
    }

    return {
      custodialFunds: toFixedMoney(custodialFunds),
      todayExpected: toFixedMoney(todayExpected),
      totalReturnRealized: toFixedMoney(totalReturnRealized),
      totalReturnEstimated: toFixedMoney(totalReturnEstimated),
      orderEscrow: toFixedMoney(orderEscrow),
      activeCount,
      completedCount,
      pendingCount,
    };
  }

  function ensureDefaultSeedData() {
    const total = Number(countPlansStatement.get({ category: "all" })?.total || 0);
    if (total > 0) {
      return;
    }

    const nowIso = toIso(getNow());
    const seeds = [
      {
        planCode: "LUM-ULT-MINING-91",
        category: "mining",
        title: "Ultimate Mining",
        shortDescription: "Premium long-cycle mining product.",
        detailsHtml: "Expected return based on configured cycle and rate.",
        currency: "USDT",
        minimumAmountUsd: 100000,
        maximumAmountUsd: 1000000,
        returnRate: 0.9,
        returnType: "daily_percent",
        cycleDays: 91,
        payoutType: "on_maturity",
        lockPrincipal: 1,
        allowEarlyRedeem: 0,
        earlyRedeemPenaltyPercent: 0,
        requiresAdminReview: 0,
        quotaLimit: null,
        quotaUsed: 0,
        isFeatured: 1,
        badgeLabel: "Popular",
        displaySortOrder: 1,
        status: "active",
      },
      {
        planCode: "LUM-VIP-MINING-36",
        category: "mining",
        title: "VIP Mining",
        shortDescription: "Mid-cycle locked mining plan.",
        detailsHtml: "Principal remains locked until maturity.",
        currency: "USDT",
        minimumAmountUsd: 50000,
        maximumAmountUsd: 500000,
        returnRate: 0.7,
        returnType: "daily_percent",
        cycleDays: 36,
        payoutType: "on_maturity",
        lockPrincipal: 1,
        allowEarlyRedeem: 0,
        earlyRedeemPenaltyPercent: 0,
        requiresAdminReview: 0,
        quotaLimit: null,
        quotaUsed: 0,
        isFeatured: 0,
        badgeLabel: "",
        displaySortOrder: 2,
        status: "active",
      },
      {
        planCode: "LUM-ADV-MINING-28",
        category: "mining",
        title: "Advanced Mining",
        shortDescription: "Shorter high-frequency mining lock.",
        detailsHtml: "Returns are estimated and settled as configured.",
        currency: "USDT",
        minimumAmountUsd: 30000,
        maximumAmountUsd: 300000,
        returnRate: 0.6,
        returnType: "daily_percent",
        cycleDays: 28,
        payoutType: "on_maturity",
        lockPrincipal: 1,
        allowEarlyRedeem: 0,
        earlyRedeemPenaltyPercent: 0,
        requiresAdminReview: 0,
        quotaLimit: null,
        quotaUsed: 0,
        isFeatured: 0,
        badgeLabel: "",
        displaySortOrder: 3,
        status: "active",
      },
      {
        planCode: "LUM-CORE-14",
        category: "lum",
        title: "Core LUM",
        shortDescription: "Entry-level LUM lock plan.",
        detailsHtml: "Estimated daily return and full settlement at maturity.",
        currency: "USDT",
        minimumAmountUsd: 100,
        maximumAmountUsd: 20000,
        returnRate: 0.5,
        returnType: "daily_percent",
        cycleDays: 14,
        payoutType: "on_maturity",
        lockPrincipal: 1,
        allowEarlyRedeem: 0,
        earlyRedeemPenaltyPercent: 0,
        requiresAdminReview: 0,
        quotaLimit: null,
        quotaUsed: 0,
        isFeatured: 1,
        badgeLabel: "Hot",
        displaySortOrder: 10,
        status: "active",
      },
      {
        planCode: "LUM-CYCLE-2P",
        category: "lum",
        title: "Cycle Booster",
        shortDescription: "Fixed cycle return percentage.",
        detailsHtml: "2% cycle return model.",
        currency: "USDT",
        minimumAmountUsd: 100,
        maximumAmountUsd: 5000,
        returnRate: 2,
        returnType: "cycle_percent",
        cycleDays: 7,
        payoutType: "on_maturity",
        lockPrincipal: 1,
        allowEarlyRedeem: 0,
        earlyRedeemPenaltyPercent: 0,
        requiresAdminReview: 0,
        quotaLimit: null,
        quotaUsed: 0,
        isFeatured: 0,
        badgeLabel: "",
        displaySortOrder: 11,
        status: "active",
      },
    ];

    const tx = db.transaction(() => {
      for (const seed of seeds) {
        insertPlanStatement.run({
          ...seed,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdBy: "system",
          updatedBy: "system",
        });
      }

      const plans = listPlansStatement.all({ category: "all", status: "all" });
      for (const plan of plans) {
        insertPlanContentStatement.run({
          planId: plan.id,
          contentType: "pledge_info",
          title: `${plan.title} Pledge Information`,
          bodyText:
            "Pledge currency: USDT. Funds are locked during cycle and settled automatically at maturity based on configured payout rules. Midway redeem is restricted unless the plan explicitly allows early redeem.",
          sortOrder: 1,
          isActive: 1,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        insertPlanContentStatement.run({
          planId: plan.id,
          contentType: "risk_notice",
          title: "Risk Notice",
          bodyText:
            "Returns are estimates based on configured product rules. Capital lock duration and payout behavior depend on selected plan. Review all terms before confirming investment.",
          sortOrder: 2,
          isActive: 1,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
    });

    tx();
  }

  ensureDefaultSeedData();

  function parsePlanFormPayload(raw = {}, actorUserId = "system") {
    const category = normalizeCategory(raw.category || "lum");
    if (category === "all") {
      throw new Error("Category must be lum or mining.");
    }

    const planCode = sanitizeShortText(raw.planCode || raw.plan_code || "", 40).toUpperCase();
    const title = sanitizeShortText(raw.title || "", 120);
    const shortDescription = sanitizeShortText(raw.shortDescription || raw.short_description || "", 240);
    const detailsHtml = String(raw.detailsHtml || raw.details_html || "").trim();
    const currency = normalizeAssetSymbol(raw.currency || "USDT") || "USDT";
    const minimumAmountUsd = normalizeUsdAmount(raw.minimumAmountUsd ?? raw.minimum_amount_usd ?? 0.01);
    const maximumAmountRaw = raw.maximumAmountUsd ?? raw.maximum_amount_usd;
    const maximumAmountUsd =
      maximumAmountRaw === undefined || maximumAmountRaw === null || maximumAmountRaw === ""
        ? null
        : normalizeUsdAmount(maximumAmountRaw);

    if (maximumAmountUsd !== null && minimumAmountUsd > maximumAmountUsd) {
      throw new Error("Minimum amount cannot be greater than maximum amount.");
    }

    const returnRate = Number(raw.returnRate ?? raw.return_rate ?? 0);
    if (!Number.isFinite(returnRate) || returnRate < 0) {
      throw new Error("Return rate must be a valid positive number.");
    }

    const returnType = normalizeReturnType(raw.returnType || raw.return_type || "daily_percent");
    const payoutType = normalizePayoutType(raw.payoutType || raw.payout_type || "on_maturity");

    const cycleDays = Number(raw.cycleDays ?? raw.cycle_days ?? 0);
    if (!Number.isFinite(cycleDays) || cycleDays <= 0) {
      throw new Error("Cycle days must be greater than zero.");
    }

    const lockPrincipal = String(raw.lockPrincipal ?? raw.lock_principal ?? 1) === "0" ? 0 : 1;
    const allowEarlyRedeem = String(raw.allowEarlyRedeem ?? raw.allow_early_redeem ?? 0) === "1" ? 1 : 0;
    const earlyRedeemPenaltyPercent = Number(raw.earlyRedeemPenaltyPercent ?? raw.early_redeem_penalty_percent ?? 0);
    const requiresAdminReview = String(raw.requiresAdminReview ?? raw.requires_admin_review ?? 0) === "1" ? 1 : 0;

    const quotaLimitRaw = raw.quotaLimit ?? raw.quota_limit;
    const quotaLimit =
      quotaLimitRaw === undefined || quotaLimitRaw === null || quotaLimitRaw === ""
        ? null
        : Math.max(0, Number(quotaLimitRaw));

    const isFeatured = String(raw.isFeatured ?? raw.is_featured ?? 0) === "1" ? 1 : 0;
    const badgeLabel = sanitizeShortText(raw.badgeLabel || raw.badge_label || "", 40);
    const displaySortOrder = Number(raw.displaySortOrder ?? raw.display_sort_order ?? 0);
    const status = normalizePlanStatus(raw.status || "active");

    if (!title) {
      throw new Error("Plan title is required.");
    }

    return {
      planCode,
      category,
      title,
      shortDescription,
      detailsHtml,
      currency,
      minimumAmountUsd,
      maximumAmountUsd,
      returnRate: toFixedMoney(returnRate),
      returnType,
      cycleDays: Math.max(1, Math.floor(cycleDays)),
      payoutType,
      lockPrincipal,
      allowEarlyRedeem,
      earlyRedeemPenaltyPercent: toFixedMoney(earlyRedeemPenaltyPercent),
      requiresAdminReview,
      quotaLimit,
      quotaUsed: 0,
      isFeatured,
      badgeLabel,
      displaySortOrder: Number.isFinite(displaySortOrder) ? Math.floor(displaySortOrder) : 0,
      status,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    };
  }

  function getPlanWithContents(planId, { activeOnly = false } = {}) {
    const plan = mapPlan(findPlanByIdStatement.get(planId));
    if (!plan) {
      return null;
    }
    const contents = listPlanContentsStatement
      .all({ planId, activeOnly: activeOnly ? 1 : 0 })
      .map((row) => mapContent(row))
      .filter(Boolean);
    return {
      ...plan,
      contents,
    };
  }

  function listUserInvestments(userId, { status = "all", category = "all", page = 1, limit = 30 } = {}) {
    const safePage = Math.max(1, Number(page || 1));
    const safeLimit = Math.max(1, Math.min(100, Number(limit || 30)));
    const offset = (safePage - 1) * safeLimit;
    const nowIso = toIso(getNow());

    return listInvestmentsStatement
      .all({
        userId,
        status: normalizeInvestmentStatus(status),
        category: normalizeCategory(category),
        limit: safeLimit,
        offset,
      })
      .map((row) => mapInvestment(row, { nowIso }))
      .filter(Boolean);
  }

  function createInvestmentForUser(userId, { planId, amountUsd }) {
    const nowIso = toIso(getNow());

    const account = findUserAccountStatement.get(userId);
    if (!account) {
      throw new Error("User account not found.");
    }
    if (String(account.account_status || "active").toLowerCase() !== "active") {
      throw new Error("Your account is not eligible for new investments right now.");
    }
    if (String(account.kyc_status || "pending").toLowerCase() !== "authenticated") {
      throw new Error("Complete KYC authentication before creating a LUM investment.");
    }

    settleMaturedInvestmentsForUser(userId, userId);
    refreshAccruedForUser(userId);

    const plan = findPlanByIdStatement.get(Number(planId || 0));
    if (!plan) {
      throw new Error("Plan not found.");
    }
    if (String(plan.status || "") !== "active") {
      throw new Error("Selected plan is not available right now.");
    }

    const normalizedAmount = normalizeUsdAmount(amountUsd);
    const minAmount = Number(plan.minimum_amount_usd || 0);
    const maxAmount = plan.maximum_amount_usd === null ? null : Number(plan.maximum_amount_usd || 0);

    if (normalizedAmount < minAmount) {
      throw new Error(`Minimum amount is ${minAmount}.`);
    }
    if (maxAmount !== null && normalizedAmount > maxAmount) {
      throw new Error(`Maximum amount is ${maxAmount}.`);
    }

    const quotaLimit = plan.quota_limit === null ? null : Number(plan.quota_limit || 0);
    const quotaUsed = Number(plan.quota_used || 0);
    if (quotaLimit !== null && quotaLimit > 0 && quotaUsed >= quotaLimit) {
      throw new Error("Plan quota is full right now.");
    }

    const projection = calculateInvestmentProjection({
      investedAmountUsd: normalizedAmount,
      returnRate: Number(plan.return_rate || 0),
      returnType: String(plan.return_type || "daily_percent"),
      cycleDays: Number(plan.cycle_days || 1),
    });

    const walletSymbol = normalizeAssetSymbol(plan.currency || "USDT") || "USDT";
    const investmentRef = createInvestmentRef();
    const requiresReview = Number(plan.requires_admin_review || 0) === 1;

    const createTx = db.transaction(() => {
      const detail = ensureWalletDetailRow(userId, walletSymbol, nowIso);
      const available = Number(detail.available_usd || 0);
      if (available < normalizedAmount) {
        throw new Error(`Insufficient ${walletSymbol} available balance.`);
      }

      const nextAvailable = available - normalizedAmount;
      const nextLocked = Number(detail.locked_usd || 0) + normalizedAmount;
      const nextReward = Number(detail.reward_earned_usd || 0);

      const savedDetail = saveWalletDetail({
        userId,
        assetSymbol: walletSymbol,
        availableUsd: nextAvailable,
        lockedUsd: nextLocked,
        rewardEarnedUsd: nextReward,
        updatedAt: nowIso,
      });

      syncWalletSummaryFromDetail({
        userId,
        assetSymbol: walletSymbol,
        assetName: walletSymbol,
        detail: savedDetail,
        updatedAt: nowIso,
      });

      const insertResult = insertInvestmentStatement.run({
        investmentRef,
        userId,
        planId: plan.id,
        planCodeSnapshot: plan.plan_code,
        planTitleSnapshot: plan.title,
        categorySnapshot: plan.category,
        currencySnapshot: walletSymbol,
        investedAmountUsd: normalizedAmount,
        returnRateSnapshot: Number(plan.return_rate || 0),
        returnTypeSnapshot: plan.return_type,
        payoutTypeSnapshot: plan.payout_type,
        cycleDaysSnapshot: Number(plan.cycle_days || 1),
        expectedProfitUsd: projection.expectedProfitUsd,
        expectedTotalReturnUsd: projection.expectedTotalReturnUsd,
        accruedProfitUsd: 0,
        settledProfitUsd: 0,
        settledTotalReturnUsd: 0,
        lockedPrincipalUsd: normalizedAmount,
        walletAssetSymbol: walletSymbol,
        status: requiresReview ? "pending" : "active",
        reviewNote: "",
        startedAt: requiresReview ? null : nowIso,
        endsAt: requiresReview ? null : addDaysIso(nowIso, Number(plan.cycle_days || 1)),
        settledAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        reviewedAt: null,
        reviewedBy: null,
      });

      writeWalletLedger({
        userId,
        investmentId: Number(insertResult.lastInsertRowid || 0) || null,
        ledgerType: "lock",
        assetSymbol: walletSymbol,
        amountUsd: normalizedAmount,
        balanceBeforeUsd: available,
        balanceAfterUsd: nextAvailable,
        note: `Locked for ${plan.title}`,
        createdBy: userId,
      });

      if (quotaLimit !== null && quotaLimit > 0) {
        db.prepare("UPDATE lum_plans SET quota_used = quota_used + 1 WHERE id = ?").run(plan.id);
      }
    });

    createTx();
    const created = findInvestmentByRefStatement.get(investmentRef);

    if (!created) {
      throw new Error("Could not create investment order.");
    }

    const mapped = mapInvestment(created, { nowIso });
    return {
      message: requiresReview
        ? "Investment order submitted and waiting for admin review."
        : "Investment activated successfully.",
      investment: mapped,
      summary: loadSummaryForUser(userId),
      walletDetails: listWalletDetailsByUserStatement.all(userId),
    };
  }

  function adminReviewPendingInvestment({ adminUserId, investmentId, decision, note }) {
    const nowIso = toIso(getNow());
    const target = findInvestmentByIdStatement.get(Number(investmentId || 0));
    if (!target) {
      throw new Error("Investment not found.");
    }

    const normalizedDecision = String(decision || "").trim().toLowerCase();
    if (!["approved", "rejected", "pending"].includes(normalizedDecision)) {
      throw new Error("Decision must be approved, rejected, or pending.");
    }

    const currentStatus = String(target.status || "pending").toLowerCase();
    if (currentStatus !== "pending" && normalizedDecision !== "pending") {
      throw new Error("Only pending investments can be approved/rejected.");
    }

    const tx = db.transaction(() => {
      if (normalizedDecision === "approved") {
        updateInvestmentStatusStatement.run({
          id: target.id,
          status: "active",
          reviewNote: sanitizeShortText(note || "", 300),
          startedAt: nowIso,
          endsAt: addDaysIso(nowIso, Number(target.cycle_days_snapshot || 1)),
          settledAt: null,
          reviewedAt: nowIso,
          reviewedBy: adminUserId,
          accruedProfitUsd: Number(target.accrued_profit_usd || 0),
          settledProfitUsd: Number(target.settled_profit_usd || 0),
          settledTotalReturnUsd: Number(target.settled_total_return_usd || 0),
          lockedPrincipalUsd: Number(target.locked_principal_usd || 0),
          updatedAt: nowIso,
        });

        writeAudit(adminUserId, "investment_review_approve", "investment", target.investment_ref, note || "");
        return;
      }

      if (normalizedDecision === "rejected") {
        const walletSymbol = normalizeAssetSymbol(target.wallet_asset_symbol || "USDT") || "USDT";
        const detail = ensureWalletDetailRow(target.user_id, walletSymbol, nowIso);
        const beforeAvailable = Number(detail.available_usd || 0);
        const beforeLocked = Number(detail.locked_usd || 0);
        const principal = Number(target.locked_principal_usd || target.invested_amount_usd || 0);

        const nextLocked = Math.max(0, beforeLocked - principal);
        const nextAvailable = beforeAvailable + principal;

        const savedDetail = saveWalletDetail({
          userId: target.user_id,
          assetSymbol: walletSymbol,
          availableUsd: nextAvailable,
          lockedUsd: nextLocked,
          rewardEarnedUsd: Number(detail.reward_earned_usd || 0),
          updatedAt: nowIso,
        });

        syncWalletSummaryFromDetail({
          userId: target.user_id,
          assetSymbol: walletSymbol,
          assetName: walletSymbol,
          detail: savedDetail,
          updatedAt: nowIso,
        });

        writeWalletLedger({
          userId: target.user_id,
          investmentId: target.id,
          ledgerType: "unlock",
          assetSymbol: walletSymbol,
          amountUsd: principal,
          balanceBeforeUsd: beforeAvailable,
          balanceAfterUsd: nextAvailable,
          note: `Pending investment rejected: ${target.investment_ref}`,
          createdBy: adminUserId,
        });

        updateInvestmentStatusStatement.run({
          id: target.id,
          status: "rejected",
          reviewNote: sanitizeShortText(note || "", 300),
          startedAt: null,
          endsAt: null,
          settledAt: nowIso,
          reviewedAt: nowIso,
          reviewedBy: adminUserId,
          accruedProfitUsd: 0,
          settledProfitUsd: 0,
          settledTotalReturnUsd: 0,
          lockedPrincipalUsd: 0,
          updatedAt: nowIso,
        });

        writeAudit(adminUserId, "investment_review_reject", "investment", target.investment_ref, note || "");
        return;
      }

      updateInvestmentStatusStatement.run({
        id: target.id,
        status: "pending",
        reviewNote: sanitizeShortText(note || "", 300),
        startedAt: null,
        endsAt: null,
        settledAt: null,
        reviewedAt: null,
        reviewedBy: null,
        accruedProfitUsd: Number(target.accrued_profit_usd || 0),
        settledProfitUsd: Number(target.settled_profit_usd || 0),
        settledTotalReturnUsd: Number(target.settled_total_return_usd || 0),
        lockedPrincipalUsd: Number(target.locked_principal_usd || target.invested_amount_usd || 0),
        updatedAt: nowIso,
      });
      writeAudit(adminUserId, "investment_review_pending", "investment", target.investment_ref, note || "");
    });

    tx();

    return {
      message:
        normalizedDecision === "approved"
          ? "Investment approved and activated."
          : normalizedDecision === "rejected"
            ? "Investment rejected and funds unlocked."
            : "Investment moved back to pending.",
      investment: mapInvestment(findInvestmentByIdStatement.get(target.id), { includeAccount: true }),
    };
  }

  function handleLumSummary(req, res) {
    try {
      const summary = loadSummaryForUser(req.currentUser.userId);
      res.json({ summary });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load LUM summary." });
    }
  }

  function handleLumPlans(req, res) {
    try {
      settleMaturedInvestmentsForUser(req.currentUser.userId);
      refreshAccruedForUser(req.currentUser.userId);

      const category = normalizeCategory(req.query?.category || req.body?.category || "all");
      const rows = listVisiblePlansStatement.all({ category });
      const plans = rows.map((row) => mapPlan(row)).filter(Boolean);
      res.json({ plans });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load LUM plans." });
    }
  }

  function handleLumPlanDetail(req, res) {
    try {
      const planId = Number(req.params?.id || req.body?.planId || req.query?.planId || 0);
      if (!Number.isInteger(planId) || planId <= 0) {
        throw new Error("Valid plan id is required.");
      }
      const plan = getPlanWithContents(planId, { activeOnly: true });
      if (!plan || plan.status !== "active") {
        res.status(404).json({ error: "Plan not found." });
        return;
      }
      const calculator = calculateInvestmentProjection({
        investedAmountUsd: plan.minimumAmountUsd,
        returnRate: plan.returnRate,
        returnType: plan.returnType,
        cycleDays: plan.cycleDays,
      });
      res.json({ plan, calculator });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load plan detail." });
    }
  }

  function handleLumInvest(req, res) {
    try {
      const data = createInvestmentForUser(req.currentUser.userId, {
        planId: req.body.planId,
        amountUsd: req.body.amountUsd,
      });
      res.json(data);
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not create investment." });
    }
  }

  function handleLumInvestments(req, res) {
    try {
      settleMaturedInvestmentsForUser(req.currentUser.userId);
      refreshAccruedForUser(req.currentUser.userId);

      const status = normalizeInvestmentStatus(req.query?.status || req.body?.status || "all");
      const category = normalizeCategory(req.query?.category || req.body?.category || "all");
      const page = Number(req.query?.page || req.body?.page || 1);
      const limit = Number(req.query?.limit || req.body?.limit || 30);

      const items = listUserInvestments(req.currentUser.userId, { status, category, page, limit });
      res.json({ investments: items });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load investments." });
    }
  }

  function handleLumInvestmentDetail(req, res) {
    try {
      settleMaturedInvestmentsForUser(req.currentUser.userId);
      refreshAccruedForUser(req.currentUser.userId);

      const investmentId = Number(req.params?.id || req.query?.investmentId || req.body?.investmentId || 0);
      if (!Number.isInteger(investmentId) || investmentId <= 0) {
        throw new Error("Valid investment id is required.");
      }

      const row = findInvestmentByIdStatement.get(investmentId);
      if (!row || row.user_id !== req.currentUser.userId) {
        res.status(404).json({ error: "Investment not found." });
        return;
      }

      res.json({ investment: mapInvestment(row) });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load investment detail." });
    }
  }

  function handleLumEntrust(req, res) {
    try {
      settleMaturedInvestmentsForUser(req.currentUser.userId);
      refreshAccruedForUser(req.currentUser.userId);

      const all = listUserInvestments(req.currentUser.userId, { status: "all", category: "all", page: 1, limit: 500 });
      const activeInvestments = all.filter((item) => item.status === "active");
      const completedInvestments = all.filter((item) => item.status === "completed" || item.status === "redeemed_early");
      const pendingInvestments = all.filter((item) => item.status === "pending");
      const rejectedInvestments = all.filter((item) => item.status === "rejected");

      res.json({
        summary: loadSummaryForUser(req.currentUser.userId),
        activeInvestments,
        completedInvestments,
        pendingInvestments,
        rejectedInvestments,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load entrust data." });
    }
  }

  function handleLumInfo(req, res) {
    try {
      const planId = Number(req.query?.planId || req.body?.planId || 0);
      if (planId > 0) {
        const plan = getPlanWithContents(planId, { activeOnly: true });
        if (!plan) {
          res.status(404).json({ error: "Plan not found." });
          return;
        }
        res.json({
          info: {
            planId: plan.planId,
            title: `${plan.title} Information`,
            blocks: plan.contents,
          },
        });
        return;
      }

      const plans = listVisiblePlansStatement.all({ category: "all" }).map((row) => mapPlan(row));
      const info = plans.slice(0, 5).map((plan) => ({
        planId: plan.planId,
        title: `${plan.title} Information`,
        blocks: listPlanContentsStatement
          .all({ planId: plan.planId, activeOnly: 1 })
          .map((row) => mapContent(row))
          .filter(Boolean),
      }));
      res.json({ info });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load LUM info." });
    }
  }

  function handleAdminLumPlansList(_req, res) {
    try {
      settleMaturedInvestmentsGlobal();
      const category = normalizeCategory(_req.query?.category || _req.body?.category || "all");
      const status = normalizePlanStatusFilter(_req.query?.status || _req.body?.status || "all");
      const plans = listPlansStatement
        .all({ category, status })
        .map((row) => getPlanWithContents(row.id, { activeOnly: false }))
        .filter(Boolean);
      res.json({
        stats: {
          totalPlans: Number(countPlansStatement.get({ category: "all" })?.total || 0),
        },
        plans,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load admin LUM plans." });
    }
  }

  function handleAdminLumPlanCreate(req, res) {
    try {
      const payload = parsePlanFormPayload(req.body || {}, req.currentUser.userId);
      if (!payload.planCode) {
        throw new Error("Plan code is required.");
      }
      if (findPlanByCodeStatement.get(payload.planCode)) {
        throw new Error("Plan code already exists.");
      }

      const nowIso = toIso(getNow());
      const result = insertPlanStatement.run({
        ...payload,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      writeAudit(req.currentUser.userId, "plan_create", "plan", result.lastInsertRowid, payload.title);

      res.json({
        message: "LUM plan created successfully.",
        plan: getPlanWithContents(result.lastInsertRowid, { activeOnly: false }),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not create LUM plan." });
    }
  }

  function handleAdminLumPlanUpdate(req, res) {
    try {
      const planId = Number(req.body.planId || 0);
      if (!Number.isInteger(planId) || planId <= 0) {
        throw new Error("Valid planId is required.");
      }
      const existing = findPlanByIdStatement.get(planId);
      if (!existing) {
        res.status(404).json({ error: "Plan not found." });
        return;
      }

      const payload = parsePlanFormPayload({ ...existing, ...req.body }, req.currentUser.userId);

      if (payload.planCode && payload.planCode !== existing.plan_code) {
        const duplicate = findPlanByCodeStatement.get(payload.planCode);
        if (duplicate && duplicate.id !== planId) {
          throw new Error("Plan code already exists.");
        }
      }

      updatePlanStatement.run({
        ...payload,
        id: planId,
        updatedAt: toIso(getNow()),
      });

      writeAudit(req.currentUser.userId, "plan_update", "plan", planId, payload.title);

      res.json({
        message: "LUM plan updated.",
        plan: getPlanWithContents(planId, { activeOnly: false }),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not update LUM plan." });
    }
  }

  function handleAdminLumPlanDelete(req, res) {
    try {
      const planId = Number(req.body.planId || 0);
      if (!Number.isInteger(planId) || planId <= 0) {
        throw new Error("Valid planId is required.");
      }
      const existing = findPlanByIdStatement.get(planId);
      if (!existing) {
        res.status(404).json({ error: "Plan not found." });
        return;
      }

      setPlanStatusStatement.run({
        id: planId,
        status: "archived",
        updatedAt: toIso(getNow()),
        updatedBy: req.currentUser.userId,
      });

      writeAudit(req.currentUser.userId, "plan_archive", "plan", planId, existing.title || "");

      res.json({ message: "Plan archived successfully." });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not archive plan." });
    }
  }

  function handleAdminLumPlanToggleStatus(req, res) {
    try {
      const planId = Number(req.body.planId || 0);
      const status = normalizePlanStatus(req.body.status || "active");
      if (!Number.isInteger(planId) || planId <= 0) {
        throw new Error("Valid planId is required.");
      }
      const existing = findPlanByIdStatement.get(planId);
      if (!existing) {
        res.status(404).json({ error: "Plan not found." });
        return;
      }

      setPlanStatusStatement.run({
        id: planId,
        status,
        updatedAt: toIso(getNow()),
        updatedBy: req.currentUser.userId,
      });
      writeAudit(req.currentUser.userId, "plan_toggle_status", "plan", planId, `status=${status}`);
      res.json({ message: "Plan status updated.", plan: getPlanWithContents(planId, { activeOnly: false }) });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not update plan status." });
    }
  }

  function handleAdminLumInvestments(req, res) {
    try {
      settleMaturedInvestmentsGlobal(req.currentUser.userId);

      const status = normalizeInvestmentStatus(req.query?.status || req.body?.status || "all");
      const category = normalizeCategory(req.query?.category || req.body?.category || "all");
      const page = Math.max(1, Number(req.query?.page || req.body?.page || 1));
      const limit = Math.max(1, Math.min(100, Number(req.query?.limit || req.body?.limit || 50)));
      const offset = (page - 1) * limit;
      const keyword = sanitizeShortText(req.query?.keyword || req.body?.keyword || "", 120);
      const likeKeyword = `%${keyword}%`;
      const nowIso = toIso(getNow());

      const rows = listAllInvestmentsForAdminStatement.all({
        status,
        category,
        keyword,
        likeKeyword,
        limit,
        offset,
      });

      const items = rows.map((row) => mapInvestment(row, { includeAccount: true, nowIso })).filter(Boolean);

      res.json({
        stats: {
          totalInvestments: Number(countInvestmentsStatement.get({ status: "all" })?.total || 0),
        },
        investments: items,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load admin investments." });
    }
  }

  function handleAdminLumInvestmentReview(req, res) {
    try {
      const data = adminReviewPendingInvestment({
        adminUserId: req.currentUser.userId,
        investmentId: req.body.investmentId,
        decision: req.body.decision,
        note: req.body.note,
      });
      res.json(data);
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not review investment." });
    }
  }

  function handleAdminLumForceSettle(req, res) {
    try {
      const investmentId = Number(req.body.investmentId || 0);
      if (!Number.isInteger(investmentId) || investmentId <= 0) {
        throw new Error("Valid investmentId is required.");
      }
      const target = findInvestmentByIdStatement.get(investmentId);
      if (!target) {
        res.status(404).json({ error: "Investment not found." });
        return;
      }
      if (String(target.status || "") !== "active") {
        throw new Error("Only active investments can be force settled.");
      }

      const settled = settleInvestmentByRow(target, req.currentUser.userId);
      writeAudit(req.currentUser.userId, "force_settle", "investment", target.investment_ref, req.body.note || "");

      res.json({ message: "Investment settled successfully.", investment: mapInvestment(settled, { includeAccount: true }) });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not force settle investment." });
    }
  }

  function handleAdminLumDashboardSummary(_req, res) {
    try {
      settleMaturedInvestmentsGlobal();

      const rows = db.prepare("SELECT * FROM lum_investments ORDER BY created_at DESC").all();
      let activeLocked = 0;
      let completedReturn = 0;
      let pendingCount = 0;
      let todayEstimatedPayout = 0;

      for (const row of rows) {
        const status = String(row.status || "pending").toLowerCase();
        if (status === "active") {
          activeLocked += Number(row.locked_principal_usd || 0);
          const projection = calculateInvestmentProjection({
            investedAmountUsd: Number(row.invested_amount_usd || 0),
            returnRate: Number(row.return_rate_snapshot || 0),
            returnType: String(row.return_type_snapshot || "daily_percent"),
            cycleDays: Number(row.cycle_days_snapshot || 1),
          });
          todayEstimatedPayout += projection.dailyProfitUsd;
        }
        if (status === "pending") {
          pendingCount += 1;
        }
        if (status === "completed" || status === "redeemed_early") {
          completedReturn += Number(row.settled_profit_usd || 0);
        }
      }

      res.json({
        summary: {
          totalPlans: Number(countPlansStatement.get({ category: "all" })?.total || 0),
          totalInvestments: Number(countInvestmentsStatement.get({ status: "all" })?.total || 0),
          activeLocked: toFixedMoney(activeLocked),
          completedReturn: toFixedMoney(completedReturn),
          pendingCount,
          todayEstimatedPayout: toFixedMoney(todayEstimatedPayout),
        },
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load LUM dashboard summary." });
    }
  }

  function handleAdminLumContentSave(req, res) {
    try {
      const planId = Number(req.body.planId || 0);
      const contentId = Number(req.body.contentId || 0);
      const contentType = sanitizeShortText(req.body.contentType || "pledge_info", 40);
      const title = sanitizeShortText(req.body.title || "", 140);
      const bodyText = String(req.body.bodyText || "").trim();
      const sortOrder = Number(req.body.sortOrder || 0);
      const isActive = String(req.body.isActive ?? 1) === "0" ? 0 : 1;

      if (!Number.isInteger(planId) || planId <= 0) {
        throw new Error("Valid planId is required.");
      }

      const existingPlan = findPlanByIdStatement.get(planId);
      if (!existingPlan) {
        res.status(404).json({ error: "Plan not found." });
        return;
      }

      const nowIso = toIso(getNow());
      if (contentId > 0) {
        updatePlanContentStatement.run({
          id: contentId,
          contentType,
          title,
          bodyText,
          sortOrder: Number.isFinite(sortOrder) ? Math.floor(sortOrder) : 0,
          isActive,
          updatedAt: nowIso,
        });
      } else {
        insertPlanContentStatement.run({
          planId,
          contentType,
          title,
          bodyText,
          sortOrder: Number.isFinite(sortOrder) ? Math.floor(sortOrder) : 0,
          isActive,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }

      writeAudit(req.currentUser.userId, "plan_content_save", "plan", planId, `${contentType}:${title}`);

      res.json({
        message: "Plan content saved.",
        plan: getPlanWithContents(planId, { activeOnly: false }),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not save plan content." });
    }
  }

  return {
    settleMaturedInvestmentsForUser,
    settleMaturedInvestmentsGlobal,

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
  };
}
