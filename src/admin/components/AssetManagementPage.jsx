import { useEffect, useMemo, useState } from "react";

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function formatMoney(value = 0, digits = 2) {
  return toNumber(value, 0).toLocaleString("en-US", {
    minimumFractionDigits: Math.max(0, digits),
    maximumFractionDigits: Math.max(0, Math.min(8, digits)),
  });
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

function statusChipClass(status = "") {
  const normalized = normalizeText(status);
  if (["completed", "approved", "active", "enabled"].includes(normalized)) {
    return "adminx-tag adminx-tag-kyc-authenticated";
  }
  if (["rejected", "failed", "cancelled", "disabled"].includes(normalized)) {
    return "adminx-tag adminx-tag-kyc-rejected";
  }
  if (["processing", "pending"].includes(normalized)) {
    return "adminx-tag adminx-tag-kyc-submitted_pending";
  }
  return "adminx-tag adminx-tag-role";
}

const ASSET_TABS = [
  { key: "overview", label: "Overview" },
  { key: "walletDesk", label: "Wallet Desk" },
  { key: "withdrawals", label: "Withdrawal Desk" },
  { key: "transfers", label: "Transfer Desk" },
  { key: "conversions", label: "Conversion Desk" },
  { key: "controls", label: "Controls / Settings" },
  { key: "audit", label: "Audit Log" },
];

const DEFAULT_ADJUST_FORM = {
  userId: "",
  walletSymbol: "SPOT_USDT",
  amountUsd: "",
  movementType: "credit",
  note: "",
};

const DEFAULT_FREEZE_FORM = {
  userId: "",
  walletSymbol: "SPOT_USDT",
  freezeDeposit: false,
  freezeWithdraw: false,
  freezeTransfer: false,
  freezeConvert: false,
  note: "",
};

const DEFAULT_SETTINGS_FORM = {
  depositsCreditWalletSymbol: "SPOT_USDT",
  withdrawalsEnabled: true,
  withdrawAllowedFromSpot: true,
  withdrawAllowedFromMain: false,
  withdrawAllowedFromBinary: false,
  minWithdrawUsd: "10",
  maxWithdrawUsd: "",
  withdrawFeePercent: "0.2",
  supportedWithdrawAssetsText: "USDT,BTC,ETH",
  withdrawNetworkMapText: "{}",
  transfersEnabled: true,
  convertEnabled: true,
  convertFeePercent: "0.1",
  conversionPairsText: "",
  allowSpotToBinary: true,
  allowBinaryToSpot: true,
  allowSpotToMain: true,
  allowMainToSpot: true,
  allowMainToBinary: false,
  allowBinaryToMain: false,
  autoCreateWalletDetails: true,
  walletFreezeEnabled: true,
  note: "",
};

function MetricCard({ label, value, hint = "" }) {
  return (
    <article className="adminx-kpi-card adminx-asset-kpi-card">
      <strong>{value}</strong>
      <p>{label}</p>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

export default function AssetManagementPage({
  dashboardSummary,
  walletDesk,
  walletDetail,
  withdrawals,
  transfers,
  conversions,
  settings,
  auditLogs,
  loading,
  searchValue,
  onSearchChange,
  onRefresh,
  onLoadWalletDetail,
  onAdjustWallet,
  onFreezeWallet,
  onReviewWithdrawal,
  onCompleteWithdrawal,
  onSaveSettings,
}) {
  const [tab, setTab] = useState("overview");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const [walletFilter, setWalletFilter] = useState("all");
  const [withdrawStatusFilter, setWithdrawStatusFilter] = useState("all");
  const [withdrawWalletFilter, setWithdrawWalletFilter] = useState("all");
  const [transferStatusFilter, setTransferStatusFilter] = useState("all");
  const [transferRouteFilter, setTransferRouteFilter] = useState("all");
  const [conversionStatusFilter, setConversionStatusFilter] = useState("all");
  const [conversionWalletFilter, setConversionWalletFilter] = useState("all");

  const [adjustForm, setAdjustForm] = useState(DEFAULT_ADJUST_FORM);
  const [freezeForm, setFreezeForm] = useState(DEFAULT_FREEZE_FORM);
  const [settingsForm, setSettingsForm] = useState(DEFAULT_SETTINGS_FORM);

  useEffect(() => {
    const normalizedSettings = settings || {};
    setSettingsForm({
      depositsCreditWalletSymbol: normalizedSettings.depositsCreditWalletSymbol || "SPOT_USDT",
      withdrawalsEnabled: Boolean(normalizedSettings.withdrawalsEnabled),
      withdrawAllowedFromSpot: normalizedSettings.withdrawAllowedFromSpot !== false,
      withdrawAllowedFromMain: Boolean(normalizedSettings.withdrawAllowedFromMain),
      withdrawAllowedFromBinary: Boolean(normalizedSettings.withdrawAllowedFromBinary),
      minWithdrawUsd: String(normalizedSettings.minWithdrawUsd ?? 10),
      maxWithdrawUsd:
        normalizedSettings.maxWithdrawUsd === null || normalizedSettings.maxWithdrawUsd === undefined
          ? ""
          : String(normalizedSettings.maxWithdrawUsd),
      withdrawFeePercent: String(normalizedSettings.withdrawFeePercent ?? 0.2),
      supportedWithdrawAssetsText: Array.isArray(normalizedSettings.supportedWithdrawAssets)
        ? normalizedSettings.supportedWithdrawAssets.join(",")
        : "USDT,BTC,ETH",
      withdrawNetworkMapText: JSON.stringify(normalizedSettings.withdrawNetworkMap || {}, null, 2),
      transfersEnabled: normalizedSettings.transfersEnabled !== false,
      convertEnabled: normalizedSettings.convertEnabled !== false,
      convertFeePercent: String(normalizedSettings.convertFeePercent ?? 0.1),
      conversionPairsText: Array.isArray(normalizedSettings.conversionPairs)
        ? normalizedSettings.conversionPairs.join(",")
        : "",
      allowSpotToBinary: normalizedSettings.allowSpotToBinary !== false,
      allowBinaryToSpot: normalizedSettings.allowBinaryToSpot !== false,
      allowSpotToMain: normalizedSettings.allowSpotToMain !== false,
      allowMainToSpot: normalizedSettings.allowMainToSpot !== false,
      allowMainToBinary: Boolean(normalizedSettings.allowMainToBinary),
      allowBinaryToMain: Boolean(normalizedSettings.allowBinaryToMain),
      autoCreateWalletDetails: normalizedSettings.autoCreateWalletDetails !== false,
      walletFreezeEnabled: normalizedSettings.walletFreezeEnabled !== false,
      note: "",
    });
  }, [settings]);

  const summary = dashboardSummary?.summary || {};
  const distribution = Array.isArray(dashboardSummary?.walletDistribution) ? dashboardSummary.walletDistribution : [];
  const movementTrend = Array.isArray(dashboardSummary?.movementTrend) ? dashboardSummary.movementTrend : [];
  const topExposureUsers = Array.isArray(dashboardSummary?.topExposureUsers) ? dashboardSummary.topExposureUsers : [];
  const mostActiveActions = Array.isArray(dashboardSummary?.mostActiveActions) ? dashboardSummary.mostActiveActions : [];

  const walletRows = Array.isArray(walletDesk?.rows) ? walletDesk.rows : [];
  const withdrawalRows = Array.isArray(withdrawals?.rows) ? withdrawals.rows : [];
  const transferRows = Array.isArray(transfers?.rows) ? transfers.rows : [];
  const conversionRows = Array.isArray(conversions?.rows) ? conversions.rows : [];
  const auditRows = Array.isArray(auditLogs?.rows) ? auditLogs.rows : [];

  const keyword = normalizeText(searchValue || "");

  const filteredWalletRows = useMemo(() => {
    return walletRows.filter((row) => {
      if (walletFilter !== "all") {
        if (walletFilter === "SPOT_USDT" && toNumber(row.spotAvailableUsd, 0) + toNumber(row.spotLockedUsd, 0) <= 0) {
          return false;
        }
        if (walletFilter === "MAIN_USDT" && toNumber(row.mainAvailableUsd, 0) + toNumber(row.mainLockedUsd, 0) <= 0) {
          return false;
        }
        if (walletFilter === "BINARY_USDT" && toNumber(row.binaryAvailableUsd, 0) + toNumber(row.binaryLockedUsd, 0) <= 0) {
          return false;
        }
      }

      if (!keyword) {
        return true;
      }

      const bucket = `${row.userId} ${row.accountName} ${row.accountEmail} ${row.latestActivityType}`.toLowerCase();
      return bucket.includes(keyword);
    });
  }, [keyword, walletFilter, walletRows]);

  const filteredWithdrawals = useMemo(() => {
    return withdrawalRows.filter((row) => {
      if (withdrawStatusFilter !== "all" && normalizeText(row.status) !== withdrawStatusFilter) {
        return false;
      }
      if (withdrawWalletFilter !== "all" && row.walletSymbol !== withdrawWalletFilter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const bucket = `${row.withdrawalRef} ${row.userId} ${row.accountEmail} ${row.accountName} ${row.assetSymbol} ${row.networkType}`.toLowerCase();
      return bucket.includes(keyword);
    });
  }, [keyword, withdrawalRows, withdrawStatusFilter, withdrawWalletFilter]);

  const filteredTransfers = useMemo(() => {
    return transferRows.filter((row) => {
      if (transferStatusFilter !== "all" && normalizeText(row.status) !== transferStatusFilter) {
        return false;
      }
      if (transferRouteFilter !== "all" && normalizeText(row.route) !== normalizeText(transferRouteFilter)) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const bucket = `${row.transferRef} ${row.userId} ${row.accountEmail} ${row.accountName} ${row.route}`.toLowerCase();
      return bucket.includes(keyword);
    });
  }, [keyword, transferRows, transferStatusFilter, transferRouteFilter]);

  const filteredConversions = useMemo(() => {
    return conversionRows.filter((row) => {
      if (conversionStatusFilter !== "all" && normalizeText(row.status) !== conversionStatusFilter) {
        return false;
      }
      if (conversionWalletFilter !== "all" && row.walletSymbol !== conversionWalletFilter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const bucket = `${row.conversionRef} ${row.userId} ${row.accountEmail} ${row.accountName} ${row.fromAssetSymbol} ${row.toAssetSymbol}`.toLowerCase();
      return bucket.includes(keyword);
    });
  }, [keyword, conversionRows, conversionStatusFilter, conversionWalletFilter]);

  const filteredAuditLogs = useMemo(() => {
    return auditRows.filter((row) => {
      if (!keyword) {
        return true;
      }
      const bucket = `${row.adminUserId} ${row.adminEmail} ${row.actionType} ${row.targetType} ${row.targetId} ${row.note}`.toLowerCase();
      return bucket.includes(keyword);
    });
  }, [auditRows, keyword]);

  const runAction = async (actionKey, executor) => {
    setError("");
    setNotice("");
    setBusyAction(actionKey);
    try {
      const data = await executor();
      if (data?.message) {
        setNotice(data.message);
      } else {
        setNotice("Action completed successfully.");
      }
      return data;
    } catch (actionError) {
      setError(actionError.message || "Action failed.");
      throw actionError;
    } finally {
      setBusyAction("");
    }
  };

  const handleInspectWallet = async (userId) => {
    await runAction(`wallet.inspect.${userId}`, async () => {
      const detail = await onLoadWalletDetail?.({ userId });
      setAdjustForm((prev) => ({ ...prev, userId }));
      setFreezeForm((prev) => ({ ...prev, userId }));
      return detail || { message: "Wallet detail loaded." };
    });
  };

  const handleSubmitAdjust = async () => {
    if (!adjustForm.userId.trim()) {
      setError("Select userId for adjustment.");
      return;
    }
    if (!adjustForm.amountUsd || toNumber(adjustForm.amountUsd, 0) <= 0) {
      setError("Adjustment amount must be greater than zero.");
      return;
    }

    await runAction("wallet.adjust", async () => {
      const data = await onAdjustWallet?.({
        userId: adjustForm.userId,
        walletSymbol: adjustForm.walletSymbol,
        amountUsd: Number(adjustForm.amountUsd),
        movementType: adjustForm.movementType,
        note: adjustForm.note,
      });
      await onLoadWalletDetail?.({ userId: adjustForm.userId });
      return data;
    });
  };

  const handleSubmitFreeze = async () => {
    if (!freezeForm.userId.trim()) {
      setError("Select userId for freeze rules.");
      return;
    }

    await runAction("wallet.freeze", async () => {
      const data = await onFreezeWallet?.({ ...freezeForm });
      await onLoadWalletDetail?.({ userId: freezeForm.userId });
      return data;
    });
  };

  const handleReviewWithdrawal = async (row, decision) => {
    await runAction(`withdraw.review.${row.withdrawalId}.${decision}`, async () => {
      const data = await onReviewWithdrawal?.({
        withdrawalId: row.withdrawalId,
        decision,
        note: row.note || "",
      });
      await onRefresh?.();
      return data;
    });
  };

  const handleCompleteWithdrawal = async (row) => {
    await runAction(`withdraw.complete.${row.withdrawalId}`, async () => {
      const data = await onCompleteWithdrawal?.({
        withdrawalId: row.withdrawalId,
      });
      await onRefresh?.();
      return data;
    });
  };

  const handleSubmitSettings = async () => {
    let parsedNetworkMap = {};
    try {
      parsedNetworkMap = settingsForm.withdrawNetworkMapText.trim()
        ? JSON.parse(settingsForm.withdrawNetworkMapText)
        : {};
    } catch {
      setError("Withdraw network map JSON is invalid.");
      return;
    }

    await runAction("settings.save", async () => {
      const data = await onSaveSettings?.({
        depositsCreditWalletSymbol: settingsForm.depositsCreditWalletSymbol,
        withdrawalsEnabled: settingsForm.withdrawalsEnabled,
        withdrawAllowedFromSpot: settingsForm.withdrawAllowedFromSpot,
        withdrawAllowedFromMain: settingsForm.withdrawAllowedFromMain,
        withdrawAllowedFromBinary: settingsForm.withdrawAllowedFromBinary,
        minWithdrawUsd: Number(settingsForm.minWithdrawUsd || 0),
        maxWithdrawUsd: settingsForm.maxWithdrawUsd === "" ? null : Number(settingsForm.maxWithdrawUsd),
        withdrawFeePercent: Number(settingsForm.withdrawFeePercent || 0),
        supportedWithdrawAssets: settingsForm.supportedWithdrawAssetsText
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        withdrawNetworkMap: parsedNetworkMap,
        transfersEnabled: settingsForm.transfersEnabled,
        convertEnabled: settingsForm.convertEnabled,
        convertFeePercent: Number(settingsForm.convertFeePercent || 0),
        conversionPairs: settingsForm.conversionPairsText
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        allowSpotToBinary: settingsForm.allowSpotToBinary,
        allowBinaryToSpot: settingsForm.allowBinaryToSpot,
        allowSpotToMain: settingsForm.allowSpotToMain,
        allowMainToSpot: settingsForm.allowMainToSpot,
        allowMainToBinary: settingsForm.allowMainToBinary,
        allowBinaryToMain: settingsForm.allowBinaryToMain,
        autoCreateWalletDetails: settingsForm.autoCreateWalletDetails,
        walletFreezeEnabled: settingsForm.walletFreezeEnabled,
        note: settingsForm.note,
      });
      await onRefresh?.();
      return data;
    });
  };

  const overviewSection = (
    <section className="adminx-panel adminx-tx-panel">
      <div className="adminx-kpi-grid adminx-asset-kpi-grid">
        <MetricCard label="Total Spot Assets" value={`$${formatMoney(summary.totalSpotAssets, 2)}`} />
        <MetricCard label="Total Main Assets" value={`$${formatMoney(summary.totalMainAssets, 2)}`} />
        <MetricCard label="Total Binary Assets" value={`$${formatMoney(summary.totalBinaryAssets, 2)}`} />
        <MetricCard label="Total User Assets" value={`$${formatMoney(summary.totalUserAssets, 2)}`} />
        <MetricCard label="Total Locked" value={`$${formatMoney(summary.totalLockedAssets, 2)}`} />
        <MetricCard
          label="Pending Withdrawals"
          value={String(toNumber(summary.pendingWithdrawals, 0))}
          hint={`Today transfer ${toNumber(summary.todayTransfers, 0)} • convert ${toNumber(summary.todayConversions, 0)}`}
        />
      </div>

      <div className="adminx-row adminx-row-two adminx-asset-overview-grid">
        <article className="adminx-panel">
          <div className="adminx-panel-head">
            <h2>Wallet Distribution</h2>
            <span>Across all users</span>
          </div>
          <div className="adminx-asset-distribution-list">
            {distribution.length ? (
              distribution.map((item) => (
                <article key={item.walletSymbol}>
                  <div>
                    <strong>{item.walletName}</strong>
                    <small>{item.walletSymbol}</small>
                  </div>
                  <p>${formatMoney(item.valueUsd, 2)}</p>
                  <span>{toNumber(item.percentage, 0).toFixed(2)}%</span>
                </article>
              ))
            ) : (
              <p className="adminx-muted">Distribution data unavailable.</p>
            )}
          </div>
        </article>

        <article className="adminx-panel">
          <div className="adminx-panel-head">
            <h2>Wallet Movement Trend</h2>
            <span>Last {movementTrend.length || 0} days</span>
          </div>
          <div className="adminx-simple-list">
            {movementTrend.length ? (
              movementTrend.slice(-8).map((item) => (
                <p key={item.day}>
                  <span>{item.day}</span>
                  <strong>
                    ${formatMoney(item.spotAmountUsd + item.mainAmountUsd + item.binaryAmountUsd, 2)}
                  </strong>
                </p>
              ))
            ) : (
              <p className="adminx-muted">No movement trend available.</p>
            )}
          </div>
        </article>
      </div>

      <div className="adminx-row adminx-row-two adminx-asset-overview-grid">
        <article className="adminx-panel">
          <div className="adminx-panel-head">
            <h2>Top Exposure Users</h2>
          </div>
          <div className="adminx-simple-list">
            {topExposureUsers.length ? (
              topExposureUsers.map((item) => (
                <p key={item.userId}>
                  <span>{item.accountEmail || item.userId}</span>
                  <strong>${formatMoney(item.totalAssetsUsd, 2)}</strong>
                </p>
              ))
            ) : (
              <p className="adminx-muted">No exposure data yet.</p>
            )}
          </div>
        </article>

        <article className="adminx-panel">
          <div className="adminx-panel-head">
            <h2>Most Active Actions</h2>
          </div>
          <div className="adminx-simple-list">
            {mostActiveActions.length ? (
              mostActiveActions.map((item) => (
                <p key={item.ledgerRefType}>
                  <span>{item.ledgerRefType}</span>
                  <strong>{toNumber(item.actionCount, 0)} events</strong>
                </p>
              ))
            ) : (
              <p className="adminx-muted">No action trend yet.</p>
            )}
          </div>
        </article>
      </div>
    </section>
  );

  const walletDeskSection = (
    <section className="adminx-panel adminx-tx-panel">
      <div className="adminx-filter-row">
        <select value={walletFilter} onChange={(e) => setWalletFilter(e.target.value)}>
          <option value="all">All Wallets</option>
          <option value="SPOT_USDT">Spot Wallet</option>
          <option value="MAIN_USDT">Main Wallet</option>
          <option value="BINARY_USDT">Binary Wallet</option>
        </select>
      </div>

      <div className="adminx-table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Spot</th>
              <th>Main</th>
              <th>Binary</th>
              <th>Locked</th>
              <th>Total</th>
              <th>Recent</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredWalletRows.length ? (
              filteredWalletRows.map((row) => (
                <tr key={row.userId}>
                  <td>
                    <strong>{row.accountName || row.userId}</strong>
                    <div className="adminx-table-subtext">{row.accountEmail || row.userId}</div>
                  </td>
                  <td>${formatMoney(toNumber(row.spotAvailableUsd, 0) + toNumber(row.spotLockedUsd, 0), 2)}</td>
                  <td>${formatMoney(toNumber(row.mainAvailableUsd, 0) + toNumber(row.mainLockedUsd, 0), 2)}</td>
                  <td>${formatMoney(toNumber(row.binaryAvailableUsd, 0) + toNumber(row.binaryLockedUsd, 0), 2)}</td>
                  <td>${formatMoney(row.totalLockedUsd, 2)}</td>
                  <td>${formatMoney(row.totalAssetsUsd, 2)}</td>
                  <td>
                    <span className={statusChipClass(row.latestActivityType || "pending")}>{row.latestActivityType || "-"}</span>
                    <div className="adminx-table-subtext">{formatDateTime(row.latestActivityAt)}</div>
                  </td>
                  <td>
                    <div className="adminx-table-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => handleInspectWallet(row.userId)}>
                        Inspect
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          setAdjustForm((prev) => ({ ...prev, userId: row.userId }));
                          setFreezeForm((prev) => ({ ...prev, userId: row.userId }));
                        }}
                      >
                        Select
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="adminx-muted">No wallet rows found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="adminx-row adminx-row-two adminx-asset-form-row">
        <article className="adminx-panel adminx-asset-form-panel">
          <div className="adminx-panel-head">
            <h2>Manual Balance Adjustment</h2>
          </div>
          <div className="adminx-tx-form-grid adminx-tx-form-grid-compact">
            <label>User ID<input type="text" value={adjustForm.userId} onChange={(e) => setAdjustForm((p) => ({ ...p, userId: e.target.value }))} /></label>
            <label>
              Wallet
              <select value={adjustForm.walletSymbol} onChange={(e) => setAdjustForm((p) => ({ ...p, walletSymbol: e.target.value }))}>
                <option value="SPOT_USDT">SPOT_USDT</option>
                <option value="MAIN_USDT">MAIN_USDT</option>
                <option value="BINARY_USDT">BINARY_USDT</option>
              </select>
            </label>
            <label>
              Movement
              <select value={adjustForm.movementType} onChange={(e) => setAdjustForm((p) => ({ ...p, movementType: e.target.value }))}>
                <option value="credit">Credit</option>
                <option value="debit">Debit</option>
                <option value="lock">Lock</option>
                <option value="unlock">Unlock</option>
              </select>
            </label>
            <label>Amount USD<input type="number" step="0.0001" value={adjustForm.amountUsd} onChange={(e) => setAdjustForm((p) => ({ ...p, amountUsd: e.target.value }))} /></label>
            <label className="adminx-asset-form-span-2">Note<input type="text" value={adjustForm.note} onChange={(e) => setAdjustForm((p) => ({ ...p, note: e.target.value }))} /></label>
          </div>
          <div className="adminx-profile-actions">
            <button type="button" className="btn btn-primary" onClick={handleSubmitAdjust} disabled={busyAction === "wallet.adjust"}>
              {busyAction === "wallet.adjust" ? "Saving..." : "Apply Adjustment"}
            </button>
          </div>
        </article>

        <article className="adminx-panel adminx-asset-form-panel">
          <div className="adminx-panel-head">
            <h2>Wallet Freeze Controls</h2>
          </div>
          <div className="adminx-tx-form-grid adminx-tx-form-grid-compact">
            <label>User ID<input type="text" value={freezeForm.userId} onChange={(e) => setFreezeForm((p) => ({ ...p, userId: e.target.value }))} /></label>
            <label>
              Wallet
              <select value={freezeForm.walletSymbol} onChange={(e) => setFreezeForm((p) => ({ ...p, walletSymbol: e.target.value }))}>
                <option value="SPOT_USDT">SPOT_USDT</option>
                <option value="MAIN_USDT">MAIN_USDT</option>
                <option value="BINARY_USDT">BINARY_USDT</option>
              </select>
            </label>
            <label className="adminx-checkbox-row"><input type="checkbox" checked={freezeForm.freezeDeposit} onChange={(e) => setFreezeForm((p) => ({ ...p, freezeDeposit: e.target.checked }))} /> Freeze Deposit</label>
            <label className="adminx-checkbox-row"><input type="checkbox" checked={freezeForm.freezeWithdraw} onChange={(e) => setFreezeForm((p) => ({ ...p, freezeWithdraw: e.target.checked }))} /> Freeze Withdraw</label>
            <label className="adminx-checkbox-row"><input type="checkbox" checked={freezeForm.freezeTransfer} onChange={(e) => setFreezeForm((p) => ({ ...p, freezeTransfer: e.target.checked }))} /> Freeze Transfer</label>
            <label className="adminx-checkbox-row"><input type="checkbox" checked={freezeForm.freezeConvert} onChange={(e) => setFreezeForm((p) => ({ ...p, freezeConvert: e.target.checked }))} /> Freeze Convert</label>
            <label className="adminx-asset-form-span-2">Note<input type="text" value={freezeForm.note} onChange={(e) => setFreezeForm((p) => ({ ...p, note: e.target.value }))} /></label>
          </div>
          <div className="adminx-profile-actions">
            <button type="button" className="btn btn-primary" onClick={handleSubmitFreeze} disabled={busyAction === "wallet.freeze"}>
              {busyAction === "wallet.freeze" ? "Saving..." : "Save Freeze Rule"}
            </button>
          </div>
        </article>
      </div>

      {walletDetail?.user?.userId ? (
        <article className="adminx-panel adminx-asset-detail-panel">
          <div className="adminx-panel-head">
            <h2>Wallet Inspection: {walletDetail.user.accountEmail || walletDetail.user.userId}</h2>
            <span>{walletDetail.user.userId}</span>
          </div>

          <div className="adminx-kpi-grid adminx-asset-user-kpi-grid">
            {(walletDetail?.wallet?.wallets || []).map((item) => (
              <MetricCard
                key={item.walletSymbol}
                label={item.walletName}
                value={`$${formatMoney(item.totalUsd, 2)}`}
                hint={`Available $${formatMoney(item.availableUsd, 2)} • Locked $${formatMoney(item.lockedUsd, 2)}`}
              />
            ))}
          </div>

          <div className="adminx-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Wallet</th>
                  <th>Asset</th>
                  <th>Move</th>
                  <th>Amount</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {(walletDetail?.recentLedger?.rows || []).length ? (
                  walletDetail.recentLedger.rows.slice(0, 20).map((row) => (
                    <tr key={`${row.ledgerId}-${row.createdAt}`}>
                      <td>{formatDateTime(row.createdAt)}</td>
                      <td><span className={statusChipClass(row.ledgerRefType)}>{row.ledgerRefType}</span></td>
                      <td>{row.walletSymbol}</td>
                      <td>{row.assetSymbol}</td>
                      <td>{row.movementType}</td>
                      <td>${formatMoney(row.amountUsd, 4)}</td>
                      <td>{row.note || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="adminx-muted">No recent ledger rows.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </section>
  );

  const withdrawalsSection = (
    <section className="adminx-panel adminx-tx-panel">
      <div className="adminx-filter-row">
        <select value={withdrawStatusFilter} onChange={(e) => setWithdrawStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={withdrawWalletFilter} onChange={(e) => setWithdrawWalletFilter(e.target.value)}>
          <option value="all">All Wallets</option>
          <option value="SPOT_USDT">SPOT_USDT</option>
          <option value="MAIN_USDT">MAIN_USDT</option>
          <option value="BINARY_USDT">BINARY_USDT</option>
        </select>
      </div>

      <div className="adminx-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ref</th>
              <th>User</th>
              <th>Wallet</th>
              <th>Asset/Network</th>
              <th>Amount</th>
              <th>Fee</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredWithdrawals.length ? (
              filteredWithdrawals.map((row) => (
                <tr key={row.withdrawalId}>
                  <td>
                    <strong>{row.withdrawalRef}</strong>
                    <div className="adminx-table-subtext">{formatDateTime(row.createdAt)}</div>
                  </td>
                  <td>
                    <strong>{row.accountName || row.userId}</strong>
                    <div className="adminx-table-subtext">{row.accountEmail || row.userId}</div>
                  </td>
                  <td>{row.walletSymbol}</td>
                  <td>
                    {row.assetSymbol}
                    <div className="adminx-table-subtext">{row.networkType || "-"}</div>
                  </td>
                  <td>${formatMoney(row.amountUsd, 2)}</td>
                  <td>
                    ${formatMoney(row.feeAmountUsd, 2)}
                    <div className="adminx-table-subtext">Net ${formatMoney(row.netAmountUsd, 2)}</div>
                  </td>
                  <td><span className={statusChipClass(row.status)}>{row.status}</span></td>
                  <td>
                    <div className="adminx-table-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => handleReviewWithdrawal(row, "processing")}>Processing</button>
                      <button type="button" className="btn btn-ghost" onClick={() => handleReviewWithdrawal(row, "approved")}>Approve</button>
                      <button type="button" className="btn btn-ghost danger" onClick={() => handleReviewWithdrawal(row, "rejected")}>Reject</button>
                      <button type="button" className="btn btn-primary" onClick={() => handleCompleteWithdrawal(row)}>Complete</button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="adminx-muted">No withdrawal rows found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  const transfersSection = (
    <section className="adminx-panel adminx-tx-panel">
      <div className="adminx-filter-row">
        <select value={transferStatusFilter} onChange={(e) => setTransferStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="failed">Failed</option>
        </select>
        <select value={transferRouteFilter} onChange={(e) => setTransferRouteFilter(e.target.value)}>
          <option value="all">All Routes</option>
          <option value="SPOT_USDT->BINARY_USDT">Spot → Binary</option>
          <option value="BINARY_USDT->SPOT_USDT">Binary → Spot</option>
          <option value="SPOT_USDT->MAIN_USDT">Spot → Main</option>
          <option value="MAIN_USDT->SPOT_USDT">Main → Spot</option>
          <option value="MAIN_USDT->BINARY_USDT">Main → Binary</option>
          <option value="BINARY_USDT->MAIN_USDT">Binary → Main</option>
        </select>
      </div>

      <div className="adminx-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ref</th>
              <th>User</th>
              <th>Route</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransfers.length ? (
              filteredTransfers.map((row) => (
                <tr key={row.transferId}>
                  <td>{row.transferRef}</td>
                  <td>
                    <strong>{row.accountName || row.userId}</strong>
                    <div className="adminx-table-subtext">{row.accountEmail || row.userId}</div>
                  </td>
                  <td>{row.route}</td>
                  <td>${formatMoney(row.amountUsd, 2)}</td>
                  <td><span className={statusChipClass(row.status)}>{row.status}</span></td>
                  <td>{formatDateTime(row.createdAt)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="adminx-muted">No transfer rows found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  const conversionsSection = (
    <section className="adminx-panel adminx-tx-panel">
      <div className="adminx-filter-row">
        <select value={conversionStatusFilter} onChange={(e) => setConversionStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="failed">Failed</option>
        </select>
        <select value={conversionWalletFilter} onChange={(e) => setConversionWalletFilter(e.target.value)}>
          <option value="all">All Wallets</option>
          <option value="SPOT_USDT">SPOT_USDT</option>
          <option value="MAIN_USDT">MAIN_USDT</option>
          <option value="BINARY_USDT">BINARY_USDT</option>
        </select>
      </div>

      <div className="adminx-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ref</th>
              <th>User</th>
              <th>Wallet</th>
              <th>Pair</th>
              <th>Source</th>
              <th>Rate</th>
              <th>Received</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredConversions.length ? (
              filteredConversions.map((row) => (
                <tr key={row.conversionId}>
                  <td>{row.conversionRef}</td>
                  <td>
                    <strong>{row.accountName || row.userId}</strong>
                    <div className="adminx-table-subtext">{row.accountEmail || row.userId}</div>
                  </td>
                  <td>{row.walletSymbol}</td>
                  <td>{row.pairKey}</td>
                  <td>${formatMoney(row.sourceAmount, 6)}</td>
                  <td>{formatMoney(row.rateSnapshot, 8)}</td>
                  <td>
                    ${formatMoney(row.convertedAmount, 6)}
                    <div className="adminx-table-subtext">Fee ${formatMoney(row.feeAmount, 6)}</div>
                  </td>
                  <td><span className={statusChipClass(row.status)}>{row.status}</span></td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="adminx-muted">No conversion rows found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  const controlsSection = (
    <section className="adminx-panel adminx-tx-panel">
      <div className="adminx-panel-head">
        <h2>Asset Module Controls</h2>
      </div>

      <div className="adminx-tx-form-grid adminx-asset-settings-grid">
        <label>
          Deposit Credit Wallet
          <select
            value={settingsForm.depositsCreditWalletSymbol}
            onChange={(e) => setSettingsForm((p) => ({ ...p, depositsCreditWalletSymbol: e.target.value }))}
          >
            <option value="SPOT_USDT">SPOT_USDT</option>
            <option value="MAIN_USDT">MAIN_USDT</option>
            <option value="BINARY_USDT">BINARY_USDT</option>
          </select>
        </label>
        <label>Min Withdraw USD<input type="number" step="0.0001" value={settingsForm.minWithdrawUsd} onChange={(e) => setSettingsForm((p) => ({ ...p, minWithdrawUsd: e.target.value }))} /></label>
        <label>Max Withdraw USD<input type="number" step="0.0001" value={settingsForm.maxWithdrawUsd} onChange={(e) => setSettingsForm((p) => ({ ...p, maxWithdrawUsd: e.target.value }))} /></label>
        <label>Withdraw Fee %<input type="number" step="0.0001" value={settingsForm.withdrawFeePercent} onChange={(e) => setSettingsForm((p) => ({ ...p, withdrawFeePercent: e.target.value }))} /></label>
        <label>Convert Fee %<input type="number" step="0.0001" value={settingsForm.convertFeePercent} onChange={(e) => setSettingsForm((p) => ({ ...p, convertFeePercent: e.target.value }))} /></label>

        <label className="adminx-checkbox-row"><input type="checkbox" checked={settingsForm.withdrawalsEnabled} onChange={(e) => setSettingsForm((p) => ({ ...p, withdrawalsEnabled: e.target.checked }))} /> Withdrawals Enabled</label>
        <label className="adminx-checkbox-row"><input type="checkbox" checked={settingsForm.withdrawAllowedFromSpot} onChange={(e) => setSettingsForm((p) => ({ ...p, withdrawAllowedFromSpot: e.target.checked }))} /> Withdraw from Spot</label>
        <label className="adminx-checkbox-row"><input type="checkbox" checked={settingsForm.withdrawAllowedFromMain} onChange={(e) => setSettingsForm((p) => ({ ...p, withdrawAllowedFromMain: e.target.checked }))} /> Withdraw from Main</label>
        <label className="adminx-checkbox-row"><input type="checkbox" checked={settingsForm.withdrawAllowedFromBinary} onChange={(e) => setSettingsForm((p) => ({ ...p, withdrawAllowedFromBinary: e.target.checked }))} /> Withdraw from Binary</label>

        <label className="adminx-checkbox-row"><input type="checkbox" checked={settingsForm.transfersEnabled} onChange={(e) => setSettingsForm((p) => ({ ...p, transfersEnabled: e.target.checked }))} /> Transfers Enabled</label>
        <label className="adminx-checkbox-row"><input type="checkbox" checked={settingsForm.allowSpotToBinary} onChange={(e) => setSettingsForm((p) => ({ ...p, allowSpotToBinary: e.target.checked }))} /> Spot → Binary</label>
        <label className="adminx-checkbox-row"><input type="checkbox" checked={settingsForm.allowBinaryToSpot} onChange={(e) => setSettingsForm((p) => ({ ...p, allowBinaryToSpot: e.target.checked }))} /> Binary → Spot</label>
        <label className="adminx-checkbox-row"><input type="checkbox" checked={settingsForm.allowSpotToMain} onChange={(e) => setSettingsForm((p) => ({ ...p, allowSpotToMain: e.target.checked }))} /> Spot → Main</label>
        <label className="adminx-checkbox-row"><input type="checkbox" checked={settingsForm.allowMainToSpot} onChange={(e) => setSettingsForm((p) => ({ ...p, allowMainToSpot: e.target.checked }))} /> Main → Spot</label>
        <label className="adminx-checkbox-row"><input type="checkbox" checked={settingsForm.allowMainToBinary} onChange={(e) => setSettingsForm((p) => ({ ...p, allowMainToBinary: e.target.checked }))} /> Main → Binary</label>
        <label className="adminx-checkbox-row"><input type="checkbox" checked={settingsForm.allowBinaryToMain} onChange={(e) => setSettingsForm((p) => ({ ...p, allowBinaryToMain: e.target.checked }))} /> Binary → Main</label>

        <label className="adminx-checkbox-row"><input type="checkbox" checked={settingsForm.convertEnabled} onChange={(e) => setSettingsForm((p) => ({ ...p, convertEnabled: e.target.checked }))} /> Convert Enabled</label>
        <label className="adminx-checkbox-row"><input type="checkbox" checked={settingsForm.autoCreateWalletDetails} onChange={(e) => setSettingsForm((p) => ({ ...p, autoCreateWalletDetails: e.target.checked }))} /> Auto Create Wallet Rows</label>
        <label className="adminx-checkbox-row"><input type="checkbox" checked={settingsForm.walletFreezeEnabled} onChange={(e) => setSettingsForm((p) => ({ ...p, walletFreezeEnabled: e.target.checked }))} /> Wallet Freeze Enabled</label>

        <label className="adminx-asset-form-span-2">
          Supported Withdraw Assets (comma separated)
          <input
            type="text"
            value={settingsForm.supportedWithdrawAssetsText}
            onChange={(e) => setSettingsForm((p) => ({ ...p, supportedWithdrawAssetsText: e.target.value }))}
          />
        </label>
        <label className="adminx-asset-form-span-2">
          Conversion Pairs (comma separated, e.g. BTC-&gt;USDT)
          <input
            type="text"
            value={settingsForm.conversionPairsText}
            onChange={(e) => setSettingsForm((p) => ({ ...p, conversionPairsText: e.target.value }))}
          />
        </label>
        <label className="adminx-asset-form-span-2">
          Withdraw Network Map (JSON)
          <textarea
            rows={7}
            value={settingsForm.withdrawNetworkMapText}
            onChange={(e) => setSettingsForm((p) => ({ ...p, withdrawNetworkMapText: e.target.value }))}
          />
        </label>
        <label className="adminx-asset-form-span-2">
          Audit Note
          <input type="text" value={settingsForm.note} onChange={(e) => setSettingsForm((p) => ({ ...p, note: e.target.value }))} />
        </label>
      </div>

      <div className="adminx-profile-actions">
        <button type="button" className="btn btn-primary" onClick={handleSubmitSettings} disabled={busyAction === "settings.save"}>
          {busyAction === "settings.save" ? "Saving..." : "Save Asset Settings"}
        </button>
      </div>
    </section>
  );

  const auditSection = (
    <section className="adminx-panel adminx-tx-panel">
      <div className="adminx-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Admin</th>
              <th>Action</th>
              <th>Target</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {filteredAuditLogs.length ? (
              filteredAuditLogs.map((row) => (
                <tr key={row.auditLogId}>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>
                    <strong>{row.adminName || row.adminUserId}</strong>
                    <div className="adminx-table-subtext">{row.adminEmail || row.adminUserId}</div>
                  </td>
                  <td><span className={statusChipClass(row.actionType)}>{row.actionType}</span></td>
                  <td>
                    {row.targetType}
                    <div className="adminx-table-subtext">{row.targetId}</div>
                  </td>
                  <td>{row.note || "-"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="adminx-muted">No audit logs found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <section className="adminx-tx-root adminx-asset-root">
      <div className="adminx-tx-head">
        <div className="adminx-tab-row">
          {ASSET_TABS.map((item) => (
            <button key={item.key} type="button" className={tab === item.key ? "active" : ""} onClick={() => setTab(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="adminx-user-toolbar adminx-asset-inline-toolbar">
        <label className="adminx-user-search">
          <i className="fas fa-search" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder="Search user, ref, wallet, asset..."
          />
        </label>
        <div className="adminx-user-toolbar-actions">
          <button type="button" className="adminx-filter-btn" onClick={onRefresh}>
            <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-rotate"}`} /> Refresh
          </button>
        </div>
      </div>

      {notice ? <p className="adminx-notice">{notice}</p> : null}
      {error ? <p className="adminx-error">{error}</p> : null}

      {tab === "overview" ? overviewSection : null}
      {tab === "walletDesk" ? walletDeskSection : null}
      {tab === "withdrawals" ? withdrawalsSection : null}
      {tab === "transfers" ? transfersSection : null}
      {tab === "conversions" ? conversionsSection : null}
      {tab === "controls" ? controlsSection : null}
      {tab === "audit" ? auditSection : null}
    </section>
  );
}
