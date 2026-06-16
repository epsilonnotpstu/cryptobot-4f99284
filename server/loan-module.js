const LOAN_LOCKED_RESPONSE = {
  success: false,
  code: "LOAN_FEATURE_LOCKED",
  message: "Full loan operations are currently disabled.",
};

const DEFAULT_LOAN_PAGE_CONFIG = {
  heroTitle: "RampX Lending Center",
  introTitle: "Lending Center",
  introParagraph:
    "Provide safe and reliable digital asset borrowing guidance for eligible users who need liquidity without selling existing cryptocurrency assets.",
  stepsTitle: "Just a few steps to get started",
  steps: [
    {
      title: "Contact and consultation",
      body: "Click the \"Loan consultation\" button below to connect with online customer service for consultation.",
    },
    {
      title: "Obtain the loan limit",
      body: "According to customer service instructions, complete the digital asset loan application form and wait for the review result.",
    },
    {
      title: "Issuance of loans",
      body: "After approval, the approved digital currency loan will be released to your wallet account.",
    },
  ],
  notesTitle: "Things to note",
  notes: [
    "Borrowing digital currency is a voluntary user action.",
    "This digital currency loan is for your own use only.",
    "The borrowed digital currency cannot be transferred to others unless the platform permits it.",
    "If you have any questions about this loan service, please contact online customer service in time.",
    "Click \"Loan consultation\" below to request assistance from customer service.",
  ],
  consultationButtonText: "Loan consultation",
  bannerGradient: "linear-gradient(135deg, #5b5ff8 0%, #2563eb 48%, #06b6d4 100%)",
  bannerImageUrl: "",
};

const FUTURE_LOAN_ACTIONS = new Set([
  "loan.application.create",
  "loan.application.list",
  "loan.application.detail",
  "loan.application.cancel",
  "admin.loan.applications.list",
  "admin.loan.application.detail",
  "admin.loan.application.approve",
  "admin.loan.application.reject",
  "admin.loan.application.disburse",
  "admin.loan.application.close",
  "admin.loan.products.list",
  "admin.loan.product.create",
  "admin.loan.product.update",
  "admin.loan.product.delete",
  "admin.loan.collateral-rules.list",
  "admin.loan.collateral-rule.create",
  "admin.loan.collateral-rule.update",
  "admin.loan.repayments.list",
  "admin.loan.repayment.mark-paid",
  "admin.loan.reports.summary",
]);

function normalizeLower(value = "") {
  return String(value || "").trim().toLowerCase();
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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

function safeJsonParse(value, fallback) {
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeList(value, fallback = []) {
  const rows = Array.isArray(value) ? value : fallback;
  return rows
    .map((item) => {
      if (item && typeof item === "object") {
        return {
          title: String(item.title || "").trim(),
          body: String(item.body || "").trim(),
        };
      }
      return String(item || "").trim();
    })
    .filter((item) => (typeof item === "string" ? item : item.title || item.body));
}

function normalizeLoanPageConfig(input = {}, sanitizeShortText) {
  const base = DEFAULT_LOAN_PAGE_CONFIG;
  return {
    heroTitle: sanitizeShortText(input.heroTitle || base.heroTitle, 120) || base.heroTitle,
    introTitle: sanitizeShortText(input.introTitle || base.introTitle, 120) || base.introTitle,
    introParagraph: sanitizeShortText(input.introParagraph || base.introParagraph, 900) || base.introParagraph,
    stepsTitle: sanitizeShortText(input.stepsTitle || base.stepsTitle, 120) || base.stepsTitle,
    steps: normalizeList(input.steps, base.steps).slice(0, 12).map((item, index) => {
      const row = item && typeof item === "object" ? item : { title: `Step ${index + 1}`, body: String(item || "") };
      return {
        title: sanitizeShortText(row.title || `Step ${index + 1}`, 120),
        body: sanitizeShortText(row.body || "", 600),
      };
    }),
    notesTitle: sanitizeShortText(input.notesTitle || base.notesTitle, 120) || base.notesTitle,
    notes: normalizeList(input.notes, base.notes)
      .slice(0, 16)
      .map((item) => sanitizeShortText(typeof item === "string" ? item : item.body || item.title || "", 500))
      .filter(Boolean),
    consultationButtonText:
      sanitizeShortText(input.consultationButtonText || base.consultationButtonText, 80) ||
      base.consultationButtonText,
    bannerGradient: sanitizeShortText(input.bannerGradient || base.bannerGradient, 260) || base.bannerGradient,
    bannerImageUrl: sanitizeShortText(input.bannerImageUrl || "", 500),
  };
}

export function createLoanModule({
  db,
  getNow,
  toIso,
  sanitizeShortText,
  persistDbToBlobSafe = async () => {},
  startLoanConsultationForUser,
}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS loan_page_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS loan_feature_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      settings_json TEXT NOT NULL,
      full_feature_enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS loan_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_ref TEXT UNIQUE,
      name TEXT NOT NULL,
      min_amount_usd REAL NOT NULL DEFAULT 0,
      max_amount_usd REAL NOT NULL DEFAULT 0,
      duration_days INTEGER NOT NULL DEFAULT 0,
      service_fee_rate REAL NOT NULL DEFAULT 0,
      interest_rate REAL NOT NULL DEFAULT 0,
      collateral_ratio REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS loan_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_ref TEXT UNIQUE,
      user_id TEXT NOT NULL,
      product_id INTEGER,
      requested_amount_usd REAL NOT NULL DEFAULT 0,
      approved_amount_usd REAL NOT NULL DEFAULT 0,
      currency_symbol TEXT NOT NULL DEFAULT 'USDT',
      status TEXT NOT NULL DEFAULT 'draft',
      user_note TEXT NOT NULL DEFAULT '',
      admin_note TEXT NOT NULL DEFAULT '',
      reviewed_by TEXT NOT NULL DEFAULT '',
      submitted_at TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS loan_collateral_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_symbol TEXT NOT NULL,
      ltv_rate REAL NOT NULL DEFAULT 0,
      liquidation_ltv REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS loan_repayment_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      principal_due_usd REAL NOT NULL DEFAULT 0,
      fee_due_usd REAL NOT NULL DEFAULT 0,
      paid_amount_usd REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS loan_wallet_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledger_ref TEXT UNIQUE,
      user_id TEXT NOT NULL,
      application_id INTEGER,
      entry_type TEXT NOT NULL,
      amount_usd REAL NOT NULL DEFAULT 0,
      asset_symbol TEXT NOT NULL DEFAULT 'USDT',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS loan_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id TEXT NOT NULL DEFAULT '',
      actor_email TEXT NOT NULL DEFAULT '',
      target_user_id TEXT NOT NULL DEFAULT '',
      action_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL DEFAULT '',
      previous_json TEXT NOT NULL DEFAULT '{}',
      next_json TEXT NOT NULL DEFAULT '{}',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_loan_applications_user_status
      ON loan_applications(user_id, status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_loan_audit_logs_created
      ON loan_audit_logs(created_at DESC, id DESC);
  `);

  const findActivePageConfigStatement = db.prepare(`
    SELECT *
    FROM loan_page_configs
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `);
  const insertPageConfigStatement = db.prepare(`
    INSERT INTO loan_page_configs (config_json, is_active, created_at, updated_at, updated_by)
    VALUES (@configJson, @isActive, @createdAt, @updatedAt, @updatedBy)
  `);
  const countPageConfigsStatement = db.prepare(`SELECT COUNT(*) AS total FROM loan_page_configs`);

  const findFeatureSettingsStatement = db.prepare(`
    SELECT *
    FROM loan_feature_settings
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `);
  const insertFeatureSettingsStatement = db.prepare(`
    INSERT INTO loan_feature_settings (settings_json, full_feature_enabled, updated_at, updated_by)
    VALUES (@settingsJson, @fullFeatureEnabled, @updatedAt, @updatedBy)
  `);
  const countFeatureSettingsStatement = db.prepare(`SELECT COUNT(*) AS total FROM loan_feature_settings`);

  function isEnvFullFeatureEnabled() {
    return normalizeBoolean(process.env.LOAN_FULL_FEATURE_ENABLED, false);
  }

  function ensureDefaults() {
    const nowIso = toIso(getNow());
    if (toNumber(countPageConfigsStatement.get()?.total, 0) === 0) {
      insertPageConfigStatement.run({
        configJson: JSON.stringify(DEFAULT_LOAN_PAGE_CONFIG),
        isActive: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedBy: "system",
      });
    }
    if (toNumber(countFeatureSettingsStatement.get()?.total, 0) === 0) {
      insertFeatureSettingsStatement.run({
        settingsJson: JSON.stringify({ note: "Full loan operations are locked by default." }),
        fullFeatureEnabled: 0,
        updatedAt: nowIso,
        updatedBy: "system",
      });
    }
  }

  ensureDefaults();

  function buildSettingsPayload() {
    const row = findFeatureSettingsStatement.get();
    const envEnabled = isEnvFullFeatureEnabled();
    const adminEnabled = Number(row?.full_feature_enabled || 0) === 1;
    const effectiveEnabled = envEnabled && adminEnabled;
    return {
      settings: safeJsonParse(row?.settings_json, {}),
      fullFeatureEnabledAdmin: adminEnabled,
      fullFeatureEnabledEnv: envEnabled,
      effectiveFullFeatureEnabled: effectiveEnabled,
      statusLabel: effectiveEnabled ? "Unlocked" : envEnabled ? "Locked" : "Locked by server configuration",
      updatedAt: String(row?.updated_at || ""),
      updatedBy: String(row?.updated_by || ""),
    };
  }

  function buildPagePayload() {
    const row = findActivePageConfigStatement.get();
    const config = normalizeLoanPageConfig(safeJsonParse(row?.config_json, DEFAULT_LOAN_PAGE_CONFIG), sanitizeShortText);
    return {
      config,
      isActive: Number(row?.is_active ?? 1) === 1,
      updatedAt: String(row?.updated_at || ""),
      updatedBy: String(row?.updated_by || ""),
      feature: buildSettingsPayload(),
    };
  }

  function handleLoanPageGet(req, res) {
    try {
      res.json(buildPagePayload());
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load loan page." });
    }
  }

  function handleAdminLoanPageGet(req, res) {
    handleLoanPageGet(req, res);
  }

  async function handleAdminLoanPageUpdate(req, res) {
    try {
      const nowIso = toIso(getNow());
      const actor = sanitizeShortText(req.currentUser?.userId || "admin", 40) || "admin";
      const config = normalizeLoanPageConfig(req.body?.config || req.body || {}, sanitizeShortText);
      const isActive = normalizeBoolean(req.body?.isActive, true) ? 1 : 0;
      insertPageConfigStatement.run({
        configJson: JSON.stringify(config),
        isActive,
        createdAt: nowIso,
        updatedAt: nowIso,
        updatedBy: actor,
      });
      await persistDbToBlobSafe("admin.loan.page.update");
      res.json({
        message: "Loan page content saved.",
        ...buildPagePayload(),
      });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not save loan page." });
    }
  }

  function handleAdminLoanSettingsGet(req, res) {
    try {
      res.json(buildSettingsPayload());
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load loan settings." });
    }
  }

  async function handleAdminLoanSettingsUpdate(req, res) {
    try {
      const nowIso = toIso(getNow());
      const actor = sanitizeShortText(req.currentUser?.userId || "admin", 40) || "admin";
      const previous = buildSettingsPayload();
      const adminEnabled = normalizeBoolean(req.body?.fullFeatureEnabledAdmin, previous.fullFeatureEnabledAdmin);
      insertFeatureSettingsStatement.run({
        settingsJson: JSON.stringify({
          note: sanitizeShortText(req.body?.note || previous.settings?.note || "", 500),
        }),
        fullFeatureEnabled: adminEnabled ? 1 : 0,
        updatedAt: nowIso,
        updatedBy: actor,
      });
      await persistDbToBlobSafe("admin.loan.settings.update");
      res.json({
        message: "Loan settings saved.",
        ...buildSettingsPayload(),
      });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not save loan settings." });
    }
  }

  async function handleLoanConsultationStart(req, res) {
    try {
      if (typeof startLoanConsultationForUser !== "function") {
        throw new Error("Support consultation is not available right now.");
      }
      const consultation = startLoanConsultationForUser({ userId: req.currentUser.userId });
      await persistDbToBlobSafe("loan.consultation.start");
      res.json({
        message: consultation.created ? "Loan consultation ticket created." : "Loan consultation ticket opened.",
        ...consultation,
        navigation: {
          screen: "support",
          mode: "tickets",
          ticketRef: consultation.ticket?.ticketRef || "",
        },
      });
    } catch (error) {
      res.status(error?.statusCode || 400).json({ error: error.message || "Could not start loan consultation." });
    }
  }

  function handleLockedLoanAction(req, res) {
    const settings = buildSettingsPayload();
    if (!settings.effectiveFullFeatureEnabled) {
      res.status(423).json(LOAN_LOCKED_RESPONSE);
      return;
    }
    res.status(501).json({
      success: false,
      code: "LOAN_FEATURE_NOT_IMPLEMENTED",
      message: "This loan operation is reserved for a future release.",
    });
  }

  return {
    FUTURE_LOAN_ACTIONS,
    handleLoanPageGet,
    handleAdminLoanPageGet,
    handleAdminLoanPageUpdate,
    handleAdminLoanSettingsGet,
    handleAdminLoanSettingsUpdate,
    handleLoanConsultationStart,
    handleLockedLoanAction,
  };
}


// test