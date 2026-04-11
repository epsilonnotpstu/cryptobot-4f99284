import { useEffect, useMemo, useState } from "react";
import { formatCompactNumber } from "../utils/format";

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function formatUsd(value = 0) {
  return `$${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value = "") {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function statusClass(value = "") {
  const status = normalizeText(value);
  if (status === "active" || status === "won" || status === "enabled" || status === "credited") {
    return "authenticated";
  }
  if (status === "lost" || status === "rejected" || status === "error") {
    return "rejected";
  }
  if (status === "cancelled" || status === "disabled" || status === "archived") {
    return "suspended";
  }
  return "pending";
}

function prettyLabel(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) {
    return "-";
  }
  return text
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const DEFAULT_PAIR_FORM = {
  pairId: "",
  pairCode: "",
  displayName: "",
  baseAsset: "",
  quoteAsset: "USDT",
  priceSourceType: "internal_feed",
  sourceSymbol: "",
  pricePrecision: "2",
  chartTimeframeLabel: "1s",
  isEnabled: true,
  isFeatured: false,
  displaySortOrder: "0",
};

const DEFAULT_RULE_FORM = {
  ruleId: "",
  pairId: "",
  periodSeconds: "30",
  payoutPercent: "40",
  refundPercentOnDraw: "100",
  isActive: true,
  displaySortOrder: "0",
};

const DEFAULT_TICK_FORM = {
  pairId: "",
  price: "",
};

export default function BinaryManagementPage({
  summary,
  pairs,
  rules,
  trades,
  settings,
  loading,
  searchValue,
  onSearchChange,
  onRefresh,
  onCreatePair,
  onUpdatePair,
  onDeletePair,
  onTogglePairStatus,
  onSavePeriodRule,
  onSettleTrade,
  onCancelTrade,
  onSaveEngineSettings,
  onPushManualTick,
}) {
  const [tab, setTab] = useState("control");
  const [pairStatusFilter, setPairStatusFilter] = useState("all");
  const [rulePairFilter, setRulePairFilter] = useState("all");
  const [tradeStatusFilter, setTradeStatusFilter] = useState("all");
  const [tradePairFilter, setTradePairFilter] = useState("all");

  const [pairForm, setPairForm] = useState(DEFAULT_PAIR_FORM);
  const [ruleForm, setRuleForm] = useState(DEFAULT_RULE_FORM);
  const [tickForm, setTickForm] = useState(DEFAULT_TICK_FORM);

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [pairSubmitting, setPairSubmitting] = useState(false);
  const [ruleSubmitting, setRuleSubmitting] = useState(false);
  const [tradeSubmitting, setTradeSubmitting] = useState(false);
  const [engineSubmitting, setEngineSubmitting] = useState(false);
  const [tickSubmitting, setTickSubmitting] = useState(false);

  const [engineForm, setEngineForm] = useState(() => ({
    engineMode: settings?.engineMode || "internal_tick",
    settlementPriceMode: settings?.settlementPriceMode || "latest_tick_at_or_before_expiry",
    tickIntervalMs: String(settings?.tickIntervalMs ?? 1000),
    chartHistoryLimit: String(settings?.chartHistoryLimit ?? 180),
    binaryWalletAssetSymbol: settings?.binaryWalletAssetSymbol || "BINARY_USDT",
    requireKycForBinary: Boolean(settings?.requireKycForBinary),
    allowDrawRefund: settings?.allowDrawRefund !== false,
    maxOpenTradesPerUser: String(settings?.maxOpenTradesPerUser ?? 1),
    globalMinStakeUsd: String(settings?.globalMinStakeUsd ?? 10),
    globalMaxStakeUsd: settings?.globalMaxStakeUsd === null || settings?.globalMaxStakeUsd === undefined ? "" : String(settings.globalMaxStakeUsd),
    allowSameSecondMultiTrade: Boolean(settings?.allowSameSecondMultiTrade),
    tradeOutcomeMode: settings?.tradeOutcomeMode || "auto",
    autoTransferFromSpot: settings?.autoTransferFromSpot !== false,
  }));

  useEffect(() => {
    setEngineForm({
      engineMode: settings?.engineMode || "internal_tick",
      settlementPriceMode: settings?.settlementPriceMode || "latest_tick_at_or_before_expiry",
      tickIntervalMs: String(settings?.tickIntervalMs ?? 1000),
      chartHistoryLimit: String(settings?.chartHistoryLimit ?? 180),
      binaryWalletAssetSymbol: settings?.binaryWalletAssetSymbol || "BINARY_USDT",
      requireKycForBinary: Boolean(settings?.requireKycForBinary),
      allowDrawRefund: settings?.allowDrawRefund !== false,
      maxOpenTradesPerUser: String(settings?.maxOpenTradesPerUser ?? 1),
      globalMinStakeUsd: String(settings?.globalMinStakeUsd ?? 10),
      globalMaxStakeUsd: settings?.globalMaxStakeUsd === null || settings?.globalMaxStakeUsd === undefined ? "" : String(settings.globalMaxStakeUsd),
      allowSameSecondMultiTrade: Boolean(settings?.allowSameSecondMultiTrade),
      tradeOutcomeMode: settings?.tradeOutcomeMode || "auto",
      autoTransferFromSpot: settings?.autoTransferFromSpot !== false,
    });
  }, [settings]);

  const keyword = normalizeText(searchValue);
  const pairList = Array.isArray(pairs) ? pairs : [];
  const ruleList = Array.isArray(rules) ? rules : [];
  const tradeList = Array.isArray(trades) ? trades : [];

  const filteredPairs = useMemo(() => {
    return pairList.filter((item) => {
      const enabled = item?.isEnabled ? "enabled" : "disabled";
      if (pairStatusFilter !== "all" && enabled !== pairStatusFilter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const candidate = `${item.pairCode} ${item.displayName} ${item.baseAsset} ${item.quoteAsset} ${item.priceSourceType}`.toLowerCase();
      return candidate.includes(keyword);
    });
  }, [keyword, pairList, pairStatusFilter]);

  const filteredRules = useMemo(() => {
    return ruleList.filter((item) => {
      const pairKey = item.pairId === null || item.pairId === undefined ? "global" : String(item.pairId);
      if (rulePairFilter !== "all" && pairKey !== rulePairFilter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const candidate = `${item.pairDisplayName || "global"} ${item.periodSeconds} ${item.payoutPercent} ${item.refundPercentOnDraw}`.toLowerCase();
      return candidate.includes(keyword);
    });
  }, [keyword, ruleList, rulePairFilter]);

  const filteredTrades = useMemo(() => {
    return tradeList.filter((item) => {
      const status = normalizeText(item.resultStatus);
      if (tradeStatusFilter !== "all" && status !== tradeStatusFilter) {
        return false;
      }

      if (tradePairFilter !== "all" && String(item.pairId) !== String(tradePairFilter)) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const candidate = `${item.tradeRef} ${item.userId} ${item.accountEmail} ${item.accountName} ${item.pairDisplayName} ${item.direction} ${item.resultStatus}`.toLowerCase();
      return candidate.includes(keyword);
    });
  }, [keyword, tradeList, tradeStatusFilter, tradePairFilter]);

  const outcomeTone = normalizeText(engineForm.tradeOutcomeMode);
  const outcomeLabel =
    outcomeTone === "force_win"
      ? "Forced Win Mode"
      : outcomeTone === "force_loss"
        ? "Forced Loss Mode"
        : "Auto Settlement Mode";

  const updatePairField = (key, value) => {
    setPairForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateRuleField = (key, value) => {
    setRuleForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateEngineField = (key, value) => {
    setEngineForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetPairForm = () => setPairForm(DEFAULT_PAIR_FORM);
  const resetRuleForm = () => setRuleForm(DEFAULT_RULE_FORM);

  const editPair = (pair) => {
    setError("");
    setNotice("");
    setPairForm({
      pairId: String(pair?.pairId || ""),
      pairCode: String(pair?.pairCode || ""),
      displayName: String(pair?.displayName || ""),
      baseAsset: String(pair?.baseAsset || ""),
      quoteAsset: String(pair?.quoteAsset || "USDT"),
      priceSourceType: String(pair?.priceSourceType || "internal_feed"),
      sourceSymbol: String(pair?.sourceSymbol || ""),
      pricePrecision: String(pair?.pricePrecision ?? "2"),
      chartTimeframeLabel: String(pair?.chartTimeframeLabel || "1s"),
      isEnabled: Boolean(pair?.isEnabled),
      isFeatured: Boolean(pair?.isFeatured),
      displaySortOrder: String(pair?.displaySortOrder ?? "0"),
    });
    setTab("pairs");
  };

  const editRule = (rule) => {
    setError("");
    setNotice("");
    setRuleForm({
      ruleId: String(rule?.ruleId || ""),
      pairId: rule?.pairId === null || rule?.pairId === undefined ? "" : String(rule.pairId),
      periodSeconds: String(rule?.periodSeconds ?? "30"),
      payoutPercent: String(rule?.payoutPercent ?? "40"),
      refundPercentOnDraw: String(rule?.refundPercentOnDraw ?? "100"),
      isActive: Boolean(rule?.isActive),
      displaySortOrder: String(rule?.displaySortOrder ?? "0"),
    });
    setTab("rules");
  };

  const submitPair = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!pairForm.pairCode.trim() && !pairForm.pairId) {
      setError("Pair code is required.");
      return;
    }
    if (!pairForm.displayName.trim()) {
      setError("Display name is required.");
      return;
    }

    const payload = {
      pairId: pairForm.pairId ? Number(pairForm.pairId) : undefined,
      pairCode: pairForm.pairCode,
      displayName: pairForm.displayName,
      baseAsset: pairForm.baseAsset,
      quoteAsset: pairForm.quoteAsset,
      priceSourceType: pairForm.priceSourceType,
      sourceSymbol: pairForm.sourceSymbol,
      pricePrecision: Number(pairForm.pricePrecision || 2),
      chartTimeframeLabel: pairForm.chartTimeframeLabel,
      isEnabled: Boolean(pairForm.isEnabled),
      isFeatured: Boolean(pairForm.isFeatured),
      displaySortOrder: Number(pairForm.displaySortOrder || 0),
    };

    setPairSubmitting(true);
    try {
      const response = pairForm.pairId ? await onUpdatePair(payload) : await onCreatePair(payload);
      setNotice(response?.message || (pairForm.pairId ? "Pair updated." : "Pair created."));
      if (!pairForm.pairId) {
        resetPairForm();
      }
    } catch (requestError) {
      setError(requestError.message || "Could not save pair.");
    } finally {
      setPairSubmitting(false);
    }
  };

  const submitRule = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!ruleForm.periodSeconds) {
      setError("Period is required.");
      return;
    }

    setRuleSubmitting(true);
    try {
      const response = await onSavePeriodRule({
        ruleId: ruleForm.ruleId ? Number(ruleForm.ruleId) : undefined,
        pairId: ruleForm.pairId === "" ? null : Number(ruleForm.pairId),
        periodSeconds: Number(ruleForm.periodSeconds || 0),
        payoutPercent: Number(ruleForm.payoutPercent || 0),
        refundPercentOnDraw: Number(ruleForm.refundPercentOnDraw || 100),
        isActive: Boolean(ruleForm.isActive),
        displaySortOrder: Number(ruleForm.displaySortOrder || 0),
      });
      setNotice(response?.message || "Period rule saved.");
      if (!ruleForm.ruleId) {
        resetRuleForm();
      }
    } catch (requestError) {
      setError(requestError.message || "Could not save period rule.");
    } finally {
      setRuleSubmitting(false);
    }
  };

  const togglePair = async (pair) => {
    setError("");
    setNotice("");
    try {
      const response = await onTogglePairStatus({ pairId: pair.pairId, isEnabled: !pair.isEnabled });
      setNotice(response?.message || "Pair status updated.");
    } catch (requestError) {
      setError(requestError.message || "Could not toggle pair status.");
    }
  };

  const removePair = async (pairId) => {
    setError("");
    setNotice("");
    if (typeof window !== "undefined") {
      const approved = window.confirm("Delete this pair? Existing trade history will remain, but new trades on this pair will stop.");
      if (!approved) {
        return;
      }
    }
    try {
      const response = await onDeletePair(pairId);
      setNotice(response?.message || "Pair deleted.");
      if (String(pairForm.pairId) === String(pairId)) {
        resetPairForm();
      }
    } catch (requestError) {
      setError(requestError.message || "Could not delete pair.");
    }
  };

  const runTradeAction = async (type, tradeId) => {
    setError("");
    setNotice("");
    if (typeof window !== "undefined") {
      const actionLabel = type === "settle" ? "force settle" : "cancel";
      const approved = window.confirm(`Are you sure you want to ${actionLabel} this trade?`);
      if (!approved) {
        return;
      }
    }
    setTradeSubmitting(true);
    try {
      const response =
        type === "settle"
          ? await onSettleTrade({ tradeId, note: "Force settled by admin control panel." })
          : await onCancelTrade({ tradeId, note: "Cancelled by admin control panel." });
      setNotice(response?.message || "Trade updated.");
    } catch (requestError) {
      setError(requestError.message || "Could not update trade.");
    } finally {
      setTradeSubmitting(false);
    }
  };

  const saveEngine = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (engineForm.tradeOutcomeMode !== "auto" && typeof window !== "undefined") {
      const approved = window.confirm(
        engineForm.tradeOutcomeMode === "force_win"
          ? "Always Win mode will force every trade result to WIN. Continue?"
          : "Always Loss mode will force every trade result to LOSS. Continue?",
      );
      if (!approved) {
        return;
      }
    }

    setEngineSubmitting(true);

    try {
      const response = await onSaveEngineSettings({
        engineMode: engineForm.engineMode,
        settlementPriceMode: engineForm.settlementPriceMode,
        tickIntervalMs: Number(engineForm.tickIntervalMs || 1000),
        chartHistoryLimit: Number(engineForm.chartHistoryLimit || 180),
        binaryWalletAssetSymbol: engineForm.binaryWalletAssetSymbol,
        requireKycForBinary: Boolean(engineForm.requireKycForBinary),
        allowDrawRefund: Boolean(engineForm.allowDrawRefund),
        maxOpenTradesPerUser: Number(engineForm.maxOpenTradesPerUser || 1),
        globalMinStakeUsd: Number(engineForm.globalMinStakeUsd || 0),
        globalMaxStakeUsd: engineForm.globalMaxStakeUsd === "" ? null : Number(engineForm.globalMaxStakeUsd),
        allowSameSecondMultiTrade: Boolean(engineForm.allowSameSecondMultiTrade),
        tradeOutcomeMode: engineForm.tradeOutcomeMode,
        autoTransferFromSpot: Boolean(engineForm.autoTransferFromSpot),
      });
      setNotice(response?.message || "Engine settings updated.");
    } catch (requestError) {
      setError(requestError.message || "Could not save engine settings.");
    } finally {
      setEngineSubmitting(false);
    }
  };

  const pushTick = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!tickForm.pairId) {
      setError("Select a pair for manual tick push.");
      return;
    }

    if (!tickForm.price || Number(tickForm.price) <= 0) {
      setError("Enter a valid manual price.");
      return;
    }

    setTickSubmitting(true);
    try {
      const response = await onPushManualTick({
        pairId: Number(tickForm.pairId),
        price: Number(tickForm.price),
      });
      setNotice(response?.message || "Manual tick pushed.");
      setTickForm((prev) => ({ ...prev, price: "" }));
    } catch (requestError) {
      setError(requestError.message || "Could not push manual tick.");
    } finally {
      setTickSubmitting(false);
    }
  };

  return (
    <section className="adminx-users-shell">
      <section className="adminx-kpi-grid adminx-binary-kpi-grid">
        <article className="adminx-kpi-card">
          <div className="adminx-kpi-top">
            <span className="adminx-kpi-icon blue"><i className="fas fa-wave-square" /></span>
            <span className="adminx-kpi-growth">Realtime</span>
          </div>
          <strong>{formatUsd(summary?.totalActiveStakes || 0)}</strong>
          <p>Total Active Stakes</p>
        </article>

        <article className="adminx-kpi-card">
          <div className="adminx-kpi-top">
            <span className="adminx-kpi-icon green"><i className="fas fa-arrow-trend-up" /></span>
            <span className="adminx-kpi-growth">Payout</span>
          </div>
          <strong>{formatUsd(summary?.totalSettledProfitPaid || 0)}</strong>
          <p>Total Profit Paid</p>
        </article>

        <article className="adminx-kpi-card">
          <div className="adminx-kpi-top">
            <span className="adminx-kpi-icon gold"><i className="fas fa-building-columns" /></span>
            <span className="adminx-kpi-growth">House</span>
          </div>
          <strong>{formatUsd(summary?.netHouseExposure || 0)}</strong>
          <p>Net House Exposure</p>
        </article>

        <article className="adminx-kpi-card">
          <div className="adminx-kpi-top">
            <span className="adminx-kpi-icon emerald"><i className="fas fa-bolt" /></span>
            <span className="adminx-kpi-growth">Live</span>
          </div>
          <strong>{formatCompactNumber(summary?.activeTradesCount || 0)}</strong>
          <p>Active Trades</p>
        </article>
      </section>

      <div className="adminx-user-tabs" role="tablist" aria-label="Binary management tabs">
        <button type="button" role="tab" aria-selected={tab === "control"} className={tab === "control" ? "active" : ""} onClick={() => setTab("control")}>Control Center</button>
        <button type="button" role="tab" aria-selected={tab === "pairs"} className={tab === "pairs" ? "active" : ""} onClick={() => setTab("pairs")}>Pairs Desk</button>
        <button type="button" role="tab" aria-selected={tab === "rules"} className={tab === "rules" ? "active" : ""} onClick={() => setTab("rules")}>Period Rules</button>
        <button type="button" role="tab" aria-selected={tab === "trades"} className={tab === "trades" ? "active" : ""} onClick={() => setTab("trades")}>Trade Desk</button>
      </div>

      {notice ? <p className="adminx-auth-notice adminx-inline-feedback">{notice}</p> : null}
      {error ? <p className="adminx-auth-error adminx-inline-feedback">{error}</p> : null}

      {tab === "control" ? (
        <section className="adminx-user-table-card">
          <div className="adminx-user-toolbar">
            <label className="adminx-user-search">
              <i className="fas fa-search" />
              <input
                type="text"
                placeholder="Search pair, trade ref, user..."
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </label>

            <div className="adminx-user-toolbar-actions">
              <button type="button" className="adminx-filter-btn" onClick={onRefresh}>
                <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} /> Refresh
              </button>
            </div>

            <span className="adminx-user-count">{outcomeLabel}</span>
          </div>

          <div className="adminx-deposit-layout adminx-binary-control-layout">
            <form className="adminx-deposit-asset-form" onSubmit={saveEngine}>
              <h3>Engine Settings</h3>

              <div className="adminx-deposit-grid-two">
                <label>
                  Outcome Control
                  <select className="adminx-filter-btn adminx-filter-select" value={engineForm.tradeOutcomeMode} onChange={(event) => updateEngineField("tradeOutcomeMode", event.target.value)}>
                    <option value="auto">Auto</option>
                    <option value="force_win">Always Win</option>
                    <option value="force_loss">Always Loss</option>
                  </select>
                </label>
                <label>
                  Engine Mode
                  <select className="adminx-filter-btn adminx-filter-select" value={engineForm.engineMode} onChange={(event) => updateEngineField("engineMode", event.target.value)}>
                    <option value="internal_tick">Internal Tick</option>
                    <option value="external_price_sync">External Price Sync</option>
                    <option value="manual_admin_tick">Manual Admin Tick</option>
                  </select>
                </label>
              </div>

              <div className="adminx-deposit-grid-two">
                <label>
                  Tick Interval (ms)
                  <input type="number" min="400" max="60000" value={engineForm.tickIntervalMs} onChange={(event) => updateEngineField("tickIntervalMs", event.target.value)} />
                </label>
                <label>
                  Chart History Limit
                  <input type="number" min="60" max="1000" value={engineForm.chartHistoryLimit} onChange={(event) => updateEngineField("chartHistoryLimit", event.target.value)} />
                </label>
              </div>

              <div className="adminx-deposit-grid-two">
                <label>
                  Minimum Stake (USD)
                  <input type="number" step="0.01" value={engineForm.globalMinStakeUsd} onChange={(event) => updateEngineField("globalMinStakeUsd", event.target.value)} />
                </label>
                <label>
                  Maximum Stake (USD)
                  <input type="number" step="0.01" value={engineForm.globalMaxStakeUsd} onChange={(event) => updateEngineField("globalMaxStakeUsd", event.target.value)} />
                </label>
              </div>

              <div className="adminx-deposit-grid-two">
                <label>
                  Max Open Trades / User
                  <input type="number" min="1" value={engineForm.maxOpenTradesPerUser} onChange={(event) => updateEngineField("maxOpenTradesPerUser", event.target.value)} />
                </label>
                <label>
                  Wallet Symbol
                  <input type="text" value={engineForm.binaryWalletAssetSymbol} onChange={(event) => updateEngineField("binaryWalletAssetSymbol", event.target.value.toUpperCase())} />
                </label>
              </div>

              <label className="adminx-checkbox-row">
                <input type="checkbox" checked={Boolean(engineForm.autoTransferFromSpot)} onChange={(event) => updateEngineField("autoTransferFromSpot", event.target.checked)} />
                <span>Auto transfer stake deficit from spot wallet</span>
              </label>

              <label className="adminx-checkbox-row">
                <input type="checkbox" checked={Boolean(engineForm.requireKycForBinary)} onChange={(event) => updateEngineField("requireKycForBinary", event.target.checked)} />
                <span>Require KYC for binary trading</span>
              </label>

              <label className="adminx-checkbox-row">
                <input type="checkbox" checked={Boolean(engineForm.allowDrawRefund)} onChange={(event) => updateEngineField("allowDrawRefund", event.target.checked)} />
                <span>Allow draw refund</span>
              </label>

              <label className="adminx-checkbox-row">
                <input type="checkbox" checked={Boolean(engineForm.allowSameSecondMultiTrade)} onChange={(event) => updateEngineField("allowSameSecondMultiTrade", event.target.checked)} />
                <span>Allow multiple opens in same second</span>
              </label>

              <div className="adminx-profile-actions">
                <button type="button" className="btn btn-ghost" onClick={onRefresh} disabled={engineSubmitting}>Reload</button>
                <button type="submit" className="btn btn-primary" disabled={engineSubmitting}>{engineSubmitting ? "Saving..." : "Save Engine Settings"}</button>
              </div>
            </form>

            <div className="adminx-binary-side-stack">
              <form className="adminx-deposit-asset-form" onSubmit={pushTick}>
                <h3>Manual Tick Push</h3>
                <label>
                  Pair
                  <select className="adminx-filter-btn adminx-filter-select" value={tickForm.pairId} onChange={(event) => setTickForm((prev) => ({ ...prev, pairId: event.target.value }))}>
                    <option value="">Select pair</option>
                    {pairList.map((pair) => (
                      <option key={pair.pairId} value={pair.pairId}>{pair.displayName}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Price
                  <input type="number" step="0.00000001" value={tickForm.price} onChange={(event) => setTickForm((prev) => ({ ...prev, price: event.target.value }))} />
                </label>

                <div className="adminx-profile-actions">
                  <button type="submit" className="btn btn-primary" disabled={tickSubmitting}>{tickSubmitting ? "Pushing..." : "Push Tick"}</button>
                </div>
              </form>

              <article className="adminx-panel adminx-binary-outcome-card">
                <div className="adminx-panel-head">
                  <h2>Outcome Override</h2>
                  <span className={`adminx-tag adminx-tag-kyc-${statusClass(outcomeTone === "auto" ? "pending" : outcomeTone === "force_win" ? "active" : "rejected")}`}>
                    {outcomeLabel}
                  </span>
                </div>
                <p>
                  `Always Win` forces every settled trade to win. `Always Loss` forces every settled trade to lose. `Auto`
                  follows the normal Long/Short settlement rule using entry and settlement prices.
                </p>
              </article>

              <article className="adminx-panel adminx-binary-top-pairs">
                <div className="adminx-panel-head">
                  <h2>Top Traded Pairs</h2>
                </div>
                <div className="adminx-activity-list">
                  {(summary?.topTradedPairs || []).map((item) => (
                    <article key={item.pairCode}>
                      <p>{item.pairCode}</p>
                      <small>{formatCompactNumber(item.count)} trades</small>
                    </article>
                  ))}
                  {!summary?.topTradedPairs?.length ? (
                    <article>
                      <p>No trade activity yet.</p>
                    </article>
                  ) : null}
                </div>
              </article>
            </div>
          </div>
        </section>
      ) : null}

      {tab === "pairs" ? (
        <section className="adminx-user-table-card">
          <div className="adminx-user-toolbar">
            <label className="adminx-user-search">
              <i className="fas fa-search" />
              <input
                type="text"
                placeholder="Search by code/name/source..."
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </label>

            <div className="adminx-user-toolbar-actions">
              <select className="adminx-filter-btn adminx-filter-select" value={pairStatusFilter} onChange={(event) => setPairStatusFilter(event.target.value)}>
                <option value="all">All Status</option>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
              <button type="button" className="adminx-filter-btn" onClick={onRefresh}>
                <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} /> Refresh
              </button>
            </div>

            <span className="adminx-user-count">{filteredPairs.length} pairs</span>
          </div>

          <div className="adminx-deposit-layout">
            <form className="adminx-deposit-asset-form" onSubmit={submitPair}>
              <h3>{pairForm.pairId ? "Update Pair" : "Create Pair"}</h3>

              <div className="adminx-deposit-grid-two">
                <label>
                  Pair Code
                  <input
                    type="text"
                    value={pairForm.pairCode}
                    onChange={(event) => updatePairField("pairCode", event.target.value.toUpperCase())}
                    placeholder="BTCUSDT"
                    disabled={Boolean(pairForm.pairId)}
                  />
                </label>
                <label>
                  Display Name
                  <input type="text" value={pairForm.displayName} onChange={(event) => updatePairField("displayName", event.target.value)} placeholder="BTC/USDT" />
                </label>
              </div>

              <div className="adminx-deposit-grid-two">
                <label>
                  Base Asset
                  <input type="text" value={pairForm.baseAsset} onChange={(event) => updatePairField("baseAsset", event.target.value.toUpperCase())} />
                </label>
                <label>
                  Quote Asset
                  <input type="text" value={pairForm.quoteAsset} onChange={(event) => updatePairField("quoteAsset", event.target.value.toUpperCase())} />
                </label>
              </div>

              <div className="adminx-deposit-grid-two">
                <label>
                  Price Source
                  <select className="adminx-filter-btn adminx-filter-select" value={pairForm.priceSourceType} onChange={(event) => updatePairField("priceSourceType", event.target.value)}>
                    <option value="internal_feed">Internal Feed</option>
                    <option value="external_api">External API</option>
                    <option value="manual_admin_feed">Manual Admin Feed</option>
                  </select>
                </label>
                <label>
                  Source Symbol
                  <input type="text" value={pairForm.sourceSymbol} onChange={(event) => updatePairField("sourceSymbol", event.target.value)} placeholder="BTCUSDT" />
                </label>
              </div>

              <div className="adminx-deposit-grid-two">
                <label>
                  Price Precision
                  <input type="number" min="2" max="10" value={pairForm.pricePrecision} onChange={(event) => updatePairField("pricePrecision", event.target.value)} />
                </label>
                <label>
                  Chart Timeframe Label
                  <input type="text" value={pairForm.chartTimeframeLabel} onChange={(event) => updatePairField("chartTimeframeLabel", event.target.value)} />
                </label>
              </div>

              <div className="adminx-deposit-grid-two">
                <label>
                  Sort Order
                  <input type="number" value={pairForm.displaySortOrder} onChange={(event) => updatePairField("displaySortOrder", event.target.value)} />
                </label>
                <div className="adminx-binary-switch-col">
                  <label className="adminx-checkbox-row">
                    <input type="checkbox" checked={Boolean(pairForm.isEnabled)} onChange={(event) => updatePairField("isEnabled", event.target.checked)} />
                    <span>Pair enabled</span>
                  </label>
                  <label className="adminx-checkbox-row">
                    <input type="checkbox" checked={Boolean(pairForm.isFeatured)} onChange={(event) => updatePairField("isFeatured", event.target.checked)} />
                    <span>Feature pair</span>
                  </label>
                </div>
              </div>

              <div className="adminx-profile-actions">
                <button type="button" className="btn btn-ghost" onClick={resetPairForm} disabled={pairSubmitting}>Reset</button>
                <button type="submit" className="btn btn-primary" disabled={pairSubmitting}>{pairSubmitting ? "Saving..." : pairForm.pairId ? "Update Pair" : "Create Pair"}</button>
              </div>
            </form>

            <div className="adminx-deposit-asset-table-wrap">
              <table className="adminx-user-table">
                <thead>
                  <tr>
                    <th>Pair</th>
                    <th>Source</th>
                    <th>Current Price</th>
                    <th>Precision</th>
                    <th>Status</th>
                    <th>Featured</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPairs.map((pair) => (
                    <tr key={pair.pairId}>
                      <td>
                        <strong>{pair.displayName}</strong>
                        <small className="adminx-table-subtext">{pair.pairCode}</small>
                      </td>
                      <td>{prettyLabel(pair.priceSourceType)}</td>
                      <td>{toNumber(pair.currentPrice, 0).toLocaleString("en-US", { maximumFractionDigits: 8 })}</td>
                      <td>{pair.pricePrecision}</td>
                      <td>
                        <span className={`adminx-tag adminx-tag-kyc-${statusClass(pair.isEnabled ? "active" : "disabled")}`}>
                          {pair.isEnabled ? "Enabled" : "Disabled"}
                        </span>
                      </td>
                      <td>{pair.isFeatured ? "Yes" : "No"}</td>
                      <td>
                        <div className="adminx-row-actions">
                          <button type="button" title="Edit" onClick={() => editPair(pair)}><i className="fas fa-pen" /></button>
                          <button type="button" title="Toggle" onClick={() => togglePair(pair)}><i className="fas fa-power-off" /></button>
                          <button type="button" title="Delete" onClick={() => removePair(pair.pairId)}><i className="fas fa-trash" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!filteredPairs.length ? (
                <div className="adminx-users-empty">
                  <p>No pair found.</p>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {tab === "rules" ? (
        <section className="adminx-user-table-card">
          <div className="adminx-user-toolbar">
            <label className="adminx-user-search">
              <i className="fas fa-search" />
              <input
                type="text"
                placeholder="Search period, pair or payout..."
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </label>

            <div className="adminx-user-toolbar-actions">
              <select className="adminx-filter-btn adminx-filter-select" value={rulePairFilter} onChange={(event) => setRulePairFilter(event.target.value)}>
                <option value="all">All Pair Rules</option>
                <option value="global">Global Rules</option>
                {pairList.map((pair) => (
                  <option key={pair.pairId} value={pair.pairId}>{pair.displayName}</option>
                ))}
              </select>
              <button type="button" className="adminx-filter-btn" onClick={onRefresh}>
                <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} /> Refresh
              </button>
            </div>

            <span className="adminx-user-count">{filteredRules.length} rules</span>
          </div>

          <div className="adminx-deposit-layout">
            <form className="adminx-deposit-asset-form" onSubmit={submitRule}>
              <h3>{ruleForm.ruleId ? "Update Rule" : "Create Rule"}</h3>

              <label>
                Pair Scope
                <select className="adminx-filter-btn adminx-filter-select" value={ruleForm.pairId} onChange={(event) => updateRuleField("pairId", event.target.value)}>
                  <option value="">Global (all pairs)</option>
                  {pairList.map((pair) => (
                    <option key={pair.pairId} value={pair.pairId}>{pair.displayName}</option>
                  ))}
                </select>
              </label>

              <div className="adminx-deposit-grid-two">
                <label>
                  Period (seconds)
                  <input type="number" min="1" value={ruleForm.periodSeconds} onChange={(event) => updateRuleField("periodSeconds", event.target.value)} />
                </label>
                <label>
                  Payout (%)
                  <input type="number" step="0.01" value={ruleForm.payoutPercent} onChange={(event) => updateRuleField("payoutPercent", event.target.value)} />
                </label>
              </div>

              <div className="adminx-deposit-grid-two">
                <label>
                  Draw Refund (%)
                  <input type="number" step="0.01" value={ruleForm.refundPercentOnDraw} onChange={(event) => updateRuleField("refundPercentOnDraw", event.target.value)} />
                </label>
                <label>
                  Sort Order
                  <input type="number" value={ruleForm.displaySortOrder} onChange={(event) => updateRuleField("displaySortOrder", event.target.value)} />
                </label>
              </div>

              <label className="adminx-checkbox-row">
                <input type="checkbox" checked={Boolean(ruleForm.isActive)} onChange={(event) => updateRuleField("isActive", event.target.checked)} />
                <span>Rule is active</span>
              </label>

              <div className="adminx-profile-actions">
                <button type="button" className="btn btn-ghost" onClick={resetRuleForm} disabled={ruleSubmitting}>Reset</button>
                <button type="submit" className="btn btn-primary" disabled={ruleSubmitting}>{ruleSubmitting ? "Saving..." : ruleForm.ruleId ? "Update Rule" : "Create Rule"}</button>
              </div>
            </form>

            <div className="adminx-deposit-asset-table-wrap">
              <table className="adminx-user-table">
                <thead>
                  <tr>
                    <th>Scope</th>
                    <th>Period</th>
                    <th>Payout</th>
                    <th>Draw Refund</th>
                    <th>Status</th>
                    <th>Sort</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRules.map((rule) => (
                    <tr key={rule.ruleId}>
                      <td>{rule.pairDisplayName || "Global"}</td>
                      <td>{rule.periodSeconds}s</td>
                      <td>{toNumber(rule.payoutPercent, 0)}%</td>
                      <td>{toNumber(rule.refundPercentOnDraw, 0)}%</td>
                      <td>
                        <span className={`adminx-tag adminx-tag-kyc-${statusClass(rule.isActive ? "active" : "disabled")}`}>{rule.isActive ? "Active" : "Disabled"}</span>
                      </td>
                      <td>{rule.displaySortOrder}</td>
                      <td>
                        <div className="adminx-row-actions">
                          <button type="button" title="Edit rule" onClick={() => editRule(rule)}><i className="fas fa-pen" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!filteredRules.length ? (
                <div className="adminx-users-empty">
                  <p>No period rules found.</p>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {tab === "trades" ? (
        <section className="adminx-user-table-card">
          <div className="adminx-user-toolbar">
            <label className="adminx-user-search">
              <i className="fas fa-search" />
              <input
                type="text"
                placeholder="Search by trade ref, user, email, pair..."
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </label>

            <div className="adminx-user-toolbar-actions">
              <select className="adminx-filter-btn adminx-filter-select" value={tradeStatusFilter} onChange={(event) => setTradeStatusFilter(event.target.value)}>
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
                <option value="draw">Draw</option>
                <option value="cancelled">Cancelled</option>
                <option value="error">Error</option>
              </select>
              <select className="adminx-filter-btn adminx-filter-select" value={tradePairFilter} onChange={(event) => setTradePairFilter(event.target.value)}>
                <option value="all">All Pairs</option>
                {pairList.map((pair) => (
                  <option key={pair.pairId} value={pair.pairId}>{pair.displayName}</option>
                ))}
              </select>
              <button type="button" className="adminx-filter-btn" onClick={onRefresh}>
                <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} /> Refresh
              </button>
            </div>

            <span className="adminx-user-count">{filteredTrades.length} trades</span>
          </div>

          <div className="adminx-user-table-wrap">
            <table className="adminx-user-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>User</th>
                  <th>Pair</th>
                  <th>Direction</th>
                  <th>Stake</th>
                  <th>Entry</th>
                  <th>Settlement</th>
                  <th>Status</th>
                  <th>Opened</th>
                  <th>Expires</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map((trade) => {
                  const isActive = normalizeText(trade.resultStatus) === "active";
                  return (
                    <tr key={trade.tradeId}>
                      <td>{trade.tradeRef}</td>
                      <td>
                        <strong>{trade.accountName || trade.userId}</strong>
                        <small className="adminx-table-subtext">{trade.accountEmail || trade.userId}</small>
                      </td>
                      <td>{trade.pairDisplayName}</td>
                      <td>{prettyLabel(trade.direction)}</td>
                      <td>{formatUsd(trade.stakeAmountUsd)}</td>
                      <td>{toNumber(trade.entryPrice, 0).toLocaleString("en-US", { maximumFractionDigits: 8 })}</td>
                      <td>{trade.settlementPrice === null || trade.settlementPrice === undefined ? "-" : toNumber(trade.settlementPrice, 0).toLocaleString("en-US", { maximumFractionDigits: 8 })}</td>
                      <td>
                        <span className={`adminx-tag adminx-tag-kyc-${statusClass(trade.resultStatus)}`}>{prettyLabel(trade.resultStatus)}</span>
                      </td>
                      <td>{formatDateTime(trade.openedAt)}</td>
                      <td>{formatDateTime(trade.expiresAt)}</td>
                      <td>
                        <div className="adminx-row-actions">
                          {isActive ? (
                            <>
                              <button type="button" title="Force settle" onClick={() => runTradeAction("settle", trade.tradeId)} disabled={tradeSubmitting}>
                                <i className="fas fa-bolt" />
                              </button>
                              <button type="button" title="Cancel trade" onClick={() => runTradeAction("cancel", trade.tradeId)} disabled={tradeSubmitting}>
                                <i className="fas fa-ban" />
                              </button>
                            </>
                          ) : (
                            <button type="button" title="No action" disabled>
                              <i className="fas fa-lock" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!filteredTrades.length ? (
              <div className="adminx-users-empty">
                <p>No binary trade found for this filter.</p>
              </div>
            ) : null}
          </div>

          <footer className="adminx-user-footer">
            <span>Total trades: {formatCompactNumber(summary?.totalTrades || tradeList.length)}</span>
            <span>Today: {formatCompactNumber(summary?.todayTradesCount || 0)}</span>
            <span>Won: {formatCompactNumber(summary?.breakdown?.won || 0)}</span>
            <span>Lost: {formatCompactNumber(summary?.breakdown?.lost || 0)}</span>
            <span>Draw: {formatCompactNumber(summary?.breakdown?.draw || 0)}</span>
          </footer>
        </section>
      ) : null}
    </section>
  );
}
