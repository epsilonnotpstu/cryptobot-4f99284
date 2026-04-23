import { useEffect, useMemo, useState } from "react";
import { ADMIN_SECTION_META } from "../constants";
import { formatCompactNumber } from "../utils/format";
import AdminSectionIntro from "./AdminSectionIntro";

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

const TX_TABS = [
  { key: "overview", label: "Overview" },
  { key: "control", label: "Control Center" },
  { key: "convert", label: "Convert Desk" },
  { key: "spotPairs", label: "Spot Pairs" },
  { key: "orders", label: "Order Desk" },
  { key: "audit", label: "Audit Logs" },
];

const DEFAULT_ENGINE_FORM = {
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
  kycRequiredAboveAmountUsd: "",
};

const DEFAULT_CONVERT_FORM = {
  pairId: 0,
  pairCode: "",
  displayName: "",
  fromAsset: "",
  toAsset: "",
  rateSourceType: "internal_feed",
  sourceSymbol: "",
  minAmountUsd: 1,
  maxAmountUsd: 100000,
  feePercent: 0.1,
  spreadPercent: 0.1,
  fixedFeeUsd: 0,
  manualRate: "",
  isEnabled: true,
  displaySortOrder: 0,
};

const DEFAULT_SPOT_FORM = {
  pairId: 0,
  pairCode: "",
  displayName: "",
  baseAsset: "",
  quoteAsset: "USDT",
  priceSourceType: "internal_feed",
  sourceSymbol: "",
  currentPrice: "",
  pricePrecision: 4,
  quantityPrecision: 6,
  minOrderSize: 0.0001,
  maxOrderSize: 100000,
  makerFeePercent: 0.1,
  takerFeePercent: 0.15,
  isEnabled: true,
  isFeatured: false,
  displaySortOrder: 0,
};

function MetricCard({ label, value, hint = "" }) {
  return (
    <article className="adminx-kpi-card adminx-tx-kpi-card">
      <strong>{value}</strong>
      <p>{label}</p>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

export default function TransactionManagementPage({
  summary,
  settings,
  convertPairs,
  convertOrders,
  spotPairs,
  spotOrders,
  auditLogs,
  loading,
  searchValue,
  onSearchChange,
  onRefresh,
  onSaveEngineSettings,
  onCreateConvertPair,
  onUpdateConvertPair,
  onDeleteConvertPair,
  onToggleConvertPairStatus,
  onPushConvertManualRate,
  onCreateSpotPair,
  onUpdateSpotPair,
  onDeleteSpotPair,
  onToggleSpotPairStatus,
  onCancelSpotOrder,
  onForceFillSpotOrder,
  onPushSpotManualTick,
  onSaveSpotFeedSettings,
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const [engineForm, setEngineForm] = useState(DEFAULT_ENGINE_FORM);
  const [convertForm, setConvertForm] = useState(DEFAULT_CONVERT_FORM);
  const [spotForm, setSpotForm] = useState(DEFAULT_SPOT_FORM);

  const [convertStatusFilter, setConvertStatusFilter] = useState("all");
  const [spotStatusFilter, setSpotStatusFilter] = useState("all");

  useEffect(() => {
    setEngineForm({
      ...DEFAULT_ENGINE_FORM,
      ...(settings || {}),
      kycRequiredAboveAmountUsd:
        settings?.kycRequiredAboveAmountUsd === null || settings?.kycRequiredAboveAmountUsd === undefined
          ? ""
          : String(settings.kycRequiredAboveAmountUsd),
    });
  }, [settings]);

  const filteredConvertOrders = useMemo(() => {
    const keyword = normalizeText(searchValue || "");
    return (convertOrders || []).filter((row) => {
      const statusMatched = convertStatusFilter === "all" || normalizeText(row.status) === convertStatusFilter;
      if (!statusMatched) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const bucket = `${row.convertRef} ${row.userId} ${row.accountEmail} ${row.pairCode} ${row.displayName}`.toLowerCase();
      return bucket.includes(keyword);
    });
  }, [convertOrders, convertStatusFilter, searchValue]);

  const filteredSpotOrders = useMemo(() => {
    const keyword = normalizeText(searchValue || "");
    return (spotOrders || []).filter((row) => {
      const statusMatched = spotStatusFilter === "all" || normalizeText(row.status) === spotStatusFilter;
      if (!statusMatched) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const bucket = `${row.orderRef} ${row.userId} ${row.accountEmail} ${row.pairCode} ${row.pairDisplayName} ${row.side} ${row.orderType}`.toLowerCase();
      return bucket.includes(keyword);
    });
  }, [spotOrders, spotStatusFilter, searchValue]);

  const filteredAuditLogs = useMemo(() => {
    const keyword = normalizeText(searchValue || "");
    return (auditLogs || []).filter((row) => {
      if (!keyword) {
        return true;
      }
      const bucket = `${row.adminUserId} ${row.actionType} ${row.targetType} ${row.targetId} ${row.note}`.toLowerCase();
      return bucket.includes(keyword);
    });
  }, [auditLogs, searchValue]);

  const handleAsyncAction = async (label, action) => {
    setError("");
    setNotice("");
    setBusyAction(label);
    try {
      await action();
      setNotice("Saved successfully.");
      await onRefresh?.();
    } catch (actionError) {
      setError(actionError.message || "Action failed.");
    } finally {
      setBusyAction("");
    }
  };

  const submitEngineSettings = async () => {
    await handleAsyncAction("engine.save", async () => {
      if (!onSaveEngineSettings) {
        return;
      }
      await onSaveEngineSettings({
        ...engineForm,
        kycRequiredAboveAmountUsd:
          engineForm.kycRequiredAboveAmountUsd === "" ? null : Number(engineForm.kycRequiredAboveAmountUsd),
      });
    });
  };

  const submitConvertForm = async () => {
    await handleAsyncAction("convert.save", async () => {
      if (convertForm.pairId > 0) {
        await onUpdateConvertPair?.({ ...convertForm, pairId: convertForm.pairId });
      } else {
        await onCreateConvertPair?.(convertForm);
      }
      setConvertForm(DEFAULT_CONVERT_FORM);
    });
  };

  const submitSpotForm = async () => {
    await handleAsyncAction("spot.save", async () => {
      if (spotForm.pairId > 0) {
        await onUpdateSpotPair?.({ ...spotForm, pairId: spotForm.pairId });
      } else {
        await onCreateSpotPair?.(spotForm);
      }
      setSpotForm(DEFAULT_SPOT_FORM);
    });
  };

  const overviewSection = (
    <section className="adminx-panel adminx-tx-panel">
      <div className="adminx-kpi-grid adminx-tx-kpi-grid">
        <MetricCard label="Convert Pairs" value={summary?.totalConvertPairs ?? 0} hint={`Enabled ${summary?.enabledConvertPairs ?? 0}`} />
        <MetricCard label="Spot Pairs" value={summary?.totalSpotPairs ?? 0} hint={`Enabled ${summary?.enabledSpotPairs ?? 0}`} />
        <MetricCard label="Convert Orders" value={summary?.totalConvertOrders ?? 0} hint={`Completed ${summary?.completedConvertOrders ?? 0}`} />
        <MetricCard label="Spot Orders" value={summary?.totalSpotOrders ?? 0} hint={`Open ${summary?.openSpotOrders ?? 0}`} />
        <MetricCard label="Convert Volume" value={`$${formatMoney(summary?.totalConvertVolume, 2)}`} hint={`Fee $${formatMoney(summary?.totalConvertFee, 2)}`} />
        <MetricCard label="Spot Volume" value={`$${formatMoney(summary?.totalSpotVolume, 2)}`} hint={`Fee $${formatMoney(summary?.totalSpotFee, 2)}`} />
      </div>

      <div className="adminx-row adminx-row-two">
        <article className="adminx-panel">
          <div className="adminx-panel-head">
            <h2>Top Pairs</h2>
          </div>
          <div className="adminx-simple-list">
            {(summary?.topPairs || []).length ? (
              summary.topPairs.map((item) => (
                <p key={item.pairCode}>
                  <span>{item.pairCode}</span>
                  <strong>${formatMoney(item.volume, 2)}</strong>
                </p>
              ))
            ) : (
              <p className="adminx-muted">No pair volume yet.</p>
            )}
          </div>
        </article>

        <article className="adminx-panel">
          <div className="adminx-panel-head">
            <h2>Top Users</h2>
          </div>
          <div className="adminx-simple-list">
            {(summary?.topUsers || []).length ? (
              summary.topUsers.map((item) => (
                <p key={item.userId}>
                  <span>{item.userId}</span>
                  <strong>${formatMoney(item.volume, 2)}</strong>
                </p>
              ))
            ) : (
              <p className="adminx-muted">No user volume yet.</p>
            )}
          </div>
        </article>
      </div>
    </section>
  );

  const controlSection = (
    <section className="adminx-panel adminx-tx-panel">
      <div className="adminx-panel-head">
        <h2>Global Control Center</h2>
      </div>

      <div className="adminx-tx-form-grid">
        <label><input type="checkbox" checked={Boolean(engineForm.transactionModuleEnabled)} onChange={(e) => setEngineForm((p) => ({ ...p, transactionModuleEnabled: e.target.checked }))} /> Transaction Enabled</label>
        <label><input type="checkbox" checked={Boolean(engineForm.convertEnabled)} onChange={(e) => setEngineForm((p) => ({ ...p, convertEnabled: e.target.checked }))} /> Convert Enabled</label>
        <label><input type="checkbox" checked={Boolean(engineForm.spotEnabled)} onChange={(e) => setEngineForm((p) => ({ ...p, spotEnabled: e.target.checked }))} /> Spot Enabled</label>
        <label><input type="checkbox" checked={Boolean(engineForm.maintenanceModeEnabled)} onChange={(e) => setEngineForm((p) => ({ ...p, maintenanceModeEnabled: e.target.checked }))} /> Maintenance Mode</label>
        <label><input type="checkbox" checked={Boolean(engineForm.emergencyFreezeEnabled)} onChange={(e) => setEngineForm((p) => ({ ...p, emergencyFreezeEnabled: e.target.checked }))} /> Emergency Freeze</label>
        <label><input type="checkbox" checked={Boolean(engineForm.manualRateModeEnabled)} onChange={(e) => setEngineForm((p) => ({ ...p, manualRateModeEnabled: e.target.checked }))} /> Manual Rate Mode</label>
        <label><input type="checkbox" checked={Boolean(engineForm.manualPriceModeEnabled)} onChange={(e) => setEngineForm((p) => ({ ...p, manualPriceModeEnabled: e.target.checked }))} /> Manual Price Mode</label>
        <label><input type="checkbox" checked={Boolean(engineForm.requireActiveAccountOnly)} onChange={(e) => setEngineForm((p) => ({ ...p, requireActiveAccountOnly: e.target.checked }))} /> Active Account Only</label>
        <label><input type="checkbox" checked={Boolean(engineForm.blockSuspendedUsers)} onChange={(e) => setEngineForm((p) => ({ ...p, blockSuspendedUsers: e.target.checked }))} /> Block Suspended Users</label>
        <label><input type="checkbox" checked={Boolean(engineForm.blockBannedUsers)} onChange={(e) => setEngineForm((p) => ({ ...p, blockBannedUsers: e.target.checked }))} /> Block Banned Users</label>
      </div>

      <div className="adminx-tx-form-grid adminx-tx-form-grid-compact">
        <label>Maintenance Message<input type="text" value={engineForm.maintenanceMessage || ""} onChange={(e) => setEngineForm((p) => ({ ...p, maintenanceMessage: e.target.value }))} /></label>
        <label>Default Convert Fee %<input type="number" step="0.0001" value={engineForm.defaultConvertFeePercent} onChange={(e) => setEngineForm((p) => ({ ...p, defaultConvertFeePercent: Number(e.target.value) }))} /></label>
        <label>Default Convert Spread %<input type="number" step="0.0001" value={engineForm.defaultConvertSpreadPercent} onChange={(e) => setEngineForm((p) => ({ ...p, defaultConvertSpreadPercent: Number(e.target.value) }))} /></label>
        <label>Default Fixed Convert Fee<input type="number" step="0.0001" value={engineForm.defaultFixedConvertFeeUsd} onChange={(e) => setEngineForm((p) => ({ ...p, defaultFixedConvertFeeUsd: Number(e.target.value) }))} /></label>
        <label>Default Maker Fee %<input type="number" step="0.0001" value={engineForm.defaultMakerFeePercent} onChange={(e) => setEngineForm((p) => ({ ...p, defaultMakerFeePercent: Number(e.target.value) }))} /></label>
        <label>Default Taker Fee %<input type="number" step="0.0001" value={engineForm.defaultTakerFeePercent} onChange={(e) => setEngineForm((p) => ({ ...p, defaultTakerFeePercent: Number(e.target.value) }))} /></label>
        <label>Default Min Order Size<input type="number" step="0.0001" value={engineForm.defaultMinOrderSize} onChange={(e) => setEngineForm((p) => ({ ...p, defaultMinOrderSize: Number(e.target.value) }))} /></label>
        <label>Default Max Order Size<input type="number" step="0.0001" value={engineForm.defaultMaxOrderSize} onChange={(e) => setEngineForm((p) => ({ ...p, defaultMaxOrderSize: Number(e.target.value) }))} /></label>
        <label>KYC Required Above USD<input type="number" step="0.01" value={engineForm.kycRequiredAboveAmountUsd} onChange={(e) => setEngineForm((p) => ({ ...p, kycRequiredAboveAmountUsd: e.target.value }))} /></label>
      </div>

      <div className="adminx-profile-actions">
        <button type="button" className="btn btn-primary" onClick={submitEngineSettings} disabled={busyAction === "engine.save"}>
          {busyAction === "engine.save" ? "Saving..." : "Save Control Center"}
        </button>
      </div>
    </section>
  );

  const convertSection = (
    <section className="adminx-panel adminx-tx-panel">
      <div className="adminx-panel-head"><h2>Convert Pair Editor</h2></div>
      <div className="adminx-tx-form-grid adminx-tx-form-grid-compact">
        <label>Pair Code<input type="text" value={convertForm.pairCode} onChange={(e) => setConvertForm((p) => ({ ...p, pairCode: e.target.value.toUpperCase() }))} /></label>
        <label>Display Name<input type="text" value={convertForm.displayName} onChange={(e) => setConvertForm((p) => ({ ...p, displayName: e.target.value }))} /></label>
        <label>From Asset<input type="text" value={convertForm.fromAsset} onChange={(e) => setConvertForm((p) => ({ ...p, fromAsset: e.target.value.toUpperCase() }))} /></label>
        <label>To Asset<input type="text" value={convertForm.toAsset} onChange={(e) => setConvertForm((p) => ({ ...p, toAsset: e.target.value.toUpperCase() }))} /></label>
        <label>Rate Source<select value={convertForm.rateSourceType} onChange={(e) => setConvertForm((p) => ({ ...p, rateSourceType: e.target.value }))}><option value="internal_feed">internal_feed</option><option value="external_api">external_api</option><option value="manual_admin_feed">manual_admin_feed</option></select></label>
        <label>Source Symbol<input type="text" value={convertForm.sourceSymbol} onChange={(e) => setConvertForm((p) => ({ ...p, sourceSymbol: e.target.value.toUpperCase() }))} /></label>
        <label>Min Amount USD<input type="number" step="0.0001" value={convertForm.minAmountUsd} onChange={(e) => setConvertForm((p) => ({ ...p, minAmountUsd: Number(e.target.value) }))} /></label>
        <label>Max Amount USD<input type="number" step="0.0001" value={convertForm.maxAmountUsd} onChange={(e) => setConvertForm((p) => ({ ...p, maxAmountUsd: Number(e.target.value) }))} /></label>
        <label>Fee %<input type="number" step="0.0001" value={convertForm.feePercent} onChange={(e) => setConvertForm((p) => ({ ...p, feePercent: Number(e.target.value) }))} /></label>
        <label>Spread %<input type="number" step="0.0001" value={convertForm.spreadPercent} onChange={(e) => setConvertForm((p) => ({ ...p, spreadPercent: Number(e.target.value) }))} /></label>
        <label>Fixed Fee<input type="number" step="0.0001" value={convertForm.fixedFeeUsd} onChange={(e) => setConvertForm((p) => ({ ...p, fixedFeeUsd: Number(e.target.value) }))} /></label>
        <label>Manual Rate<input type="number" step="0.00000001" value={convertForm.manualRate} onChange={(e) => setConvertForm((p) => ({ ...p, manualRate: e.target.value }))} /></label>
        <label>Sort Order<input type="number" step="1" value={convertForm.displaySortOrder} onChange={(e) => setConvertForm((p) => ({ ...p, displaySortOrder: Number(e.target.value) }))} /></label>
        <label><input type="checkbox" checked={Boolean(convertForm.isEnabled)} onChange={(e) => setConvertForm((p) => ({ ...p, isEnabled: e.target.checked }))} /> Enabled</label>
      </div>
      <div className="adminx-profile-actions">
        <button type="button" className="btn btn-primary" onClick={submitConvertForm} disabled={busyAction === "convert.save"}>{busyAction === "convert.save" ? "Saving..." : convertForm.pairId ? "Update Convert Pair" : "Create Convert Pair"}</button>
        {convertForm.pairId ? <button type="button" className="btn btn-ghost" onClick={() => setConvertForm(DEFAULT_CONVERT_FORM)}>Clear</button> : null}
      </div>

      <div className="adminx-table-wrap">
        <table>
          <thead><tr><th>Pair</th><th>Assets</th><th>Rate Source</th><th>Fee/Spread</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {(convertPairs || []).map((pair) => (
              <tr key={pair.pairId}>
                <td>{pair.displayName}</td>
                <td>{pair.fromAsset} → {pair.toAsset}</td>
                <td>{pair.rateSourceType}</td>
                <td>{pair.feePercent}% / {pair.spreadPercent}%</td>
                <td>{pair.isEnabled ? "Enabled" : "Disabled"}</td>
                <td>
                  <div className="adminx-table-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => setConvertForm({ ...DEFAULT_CONVERT_FORM, ...pair, pairId: pair.pairId, manualRate: pair.manualRate ?? "" })}>Edit</button>
                    <button type="button" className="btn btn-ghost" onClick={() => handleAsyncAction(`convert.toggle.${pair.pairId}`, () => onToggleConvertPairStatus?.({ pairId: pair.pairId, isEnabled: !pair.isEnabled }))}>{pair.isEnabled ? "Disable" : "Enable"}</button>
                    <button type="button" className="btn btn-ghost" onClick={async () => {
                      const rate = window.prompt("Enter manual rate", String(pair.manualRate ?? ""));
                      if (!rate) return;
                      await handleAsyncAction(`convert.rate.${pair.pairId}`, () => onPushConvertManualRate?.({ pairId: pair.pairId, manualRate: Number(rate) }));
                    }}>Manual Rate</button>
                    <button type="button" className="btn btn-ghost danger" onClick={() => handleAsyncAction(`convert.delete.${pair.pairId}`, () => onDeleteConvertPair?.({ pairId: pair.pairId, note: "Admin delete" }))}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="adminx-panel-head"><h2>Convert Orders</h2></div>
      <div className="adminx-filter-row">
        <select value={convertStatusFilter} onChange={(e) => setConvertStatusFilter(e.target.value)}>
          <option value="all">All</option><option value="completed">Completed</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option>
        </select>
      </div>
      <div className="adminx-table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Ref</th><th>User</th><th>Pair</th><th>From</th><th>Receive</th><th>Status</th></tr></thead>
          <tbody>
            {filteredConvertOrders.map((row) => (
              <tr key={row.convertId}>
                <td>{formatDateTime(row.createdAt)}</td>
                <td>{row.convertRef}</td>
                <td>{row.accountEmail || row.userId}</td>
                <td>{row.pairCode}</td>
                <td>{formatMoney(row.fromAmount, 6)} {row.fromAsset}</td>
                <td>{formatMoney(row.receiveAmount, 6)} {row.toAsset}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const spotPairSection = (
    <section className="adminx-panel adminx-tx-panel">
      <div className="adminx-panel-head"><h2>Spot Pair Editor</h2></div>
      <div className="adminx-tx-form-grid adminx-tx-form-grid-compact">
        <label>Pair Code<input type="text" value={spotForm.pairCode} onChange={(e) => setSpotForm((p) => ({ ...p, pairCode: e.target.value.toUpperCase() }))} /></label>
        <label>Display Name<input type="text" value={spotForm.displayName} onChange={(e) => setSpotForm((p) => ({ ...p, displayName: e.target.value }))} /></label>
        <label>Base Asset<input type="text" value={spotForm.baseAsset} onChange={(e) => setSpotForm((p) => ({ ...p, baseAsset: e.target.value.toUpperCase() }))} /></label>
        <label>Quote Asset<input type="text" value={spotForm.quoteAsset} onChange={(e) => setSpotForm((p) => ({ ...p, quoteAsset: e.target.value.toUpperCase() }))} /></label>
        <label>Price Source<select value={spotForm.priceSourceType} onChange={(e) => setSpotForm((p) => ({ ...p, priceSourceType: e.target.value }))}><option value="internal_feed">internal_feed</option><option value="external_api">external_api</option><option value="manual_admin_feed">manual_admin_feed</option></select></label>
        <label>Source Symbol<input type="text" value={spotForm.sourceSymbol} onChange={(e) => setSpotForm((p) => ({ ...p, sourceSymbol: e.target.value.toUpperCase() }))} /></label>
        <label>Current Price<input type="number" step="0.00000001" value={spotForm.currentPrice} onChange={(e) => setSpotForm((p) => ({ ...p, currentPrice: e.target.value }))} /></label>
        <label>Price Precision<input type="number" step="1" value={spotForm.pricePrecision} onChange={(e) => setSpotForm((p) => ({ ...p, pricePrecision: Number(e.target.value) }))} /></label>
        <label>Qty Precision<input type="number" step="1" value={spotForm.quantityPrecision} onChange={(e) => setSpotForm((p) => ({ ...p, quantityPrecision: Number(e.target.value) }))} /></label>
        <label>Min Order Size<input type="number" step="0.00000001" value={spotForm.minOrderSize} onChange={(e) => setSpotForm((p) => ({ ...p, minOrderSize: Number(e.target.value) }))} /></label>
        <label>Max Order Size<input type="number" step="0.00000001" value={spotForm.maxOrderSize} onChange={(e) => setSpotForm((p) => ({ ...p, maxOrderSize: Number(e.target.value) }))} /></label>
        <label>Maker Fee %<input type="number" step="0.0001" value={spotForm.makerFeePercent} onChange={(e) => setSpotForm((p) => ({ ...p, makerFeePercent: Number(e.target.value) }))} /></label>
        <label>Taker Fee %<input type="number" step="0.0001" value={spotForm.takerFeePercent} onChange={(e) => setSpotForm((p) => ({ ...p, takerFeePercent: Number(e.target.value) }))} /></label>
        <label>Sort Order<input type="number" step="1" value={spotForm.displaySortOrder} onChange={(e) => setSpotForm((p) => ({ ...p, displaySortOrder: Number(e.target.value) }))} /></label>
        <label><input type="checkbox" checked={Boolean(spotForm.isEnabled)} onChange={(e) => setSpotForm((p) => ({ ...p, isEnabled: e.target.checked }))} /> Enabled</label>
        <label><input type="checkbox" checked={Boolean(spotForm.isFeatured)} onChange={(e) => setSpotForm((p) => ({ ...p, isFeatured: e.target.checked }))} /> Featured</label>
      </div>
      <div className="adminx-profile-actions">
        <button type="button" className="btn btn-primary" onClick={submitSpotForm} disabled={busyAction === "spot.save"}>{busyAction === "spot.save" ? "Saving..." : spotForm.pairId ? "Update Spot Pair" : "Create Spot Pair"}</button>
        {spotForm.pairId ? <button type="button" className="btn btn-ghost" onClick={() => setSpotForm(DEFAULT_SPOT_FORM)}>Clear</button> : null}
      </div>

      <div className="adminx-table-wrap">
        <table>
          <thead><tr><th>Pair</th><th>Price</th><th>Source</th><th>Fee</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {(spotPairs || []).map((pair) => (
              <tr key={pair.pairId}>
                <td>{pair.displayName}</td>
                <td>{formatMoney(pair.currentPrice, pair.pricePrecision || 4)}</td>
                <td>{pair.priceSourceType}</td>
                <td>M {pair.makerFeePercent}% / T {pair.takerFeePercent}%</td>
                <td>{pair.isEnabled ? "Enabled" : "Disabled"}</td>
                <td>
                  <div className="adminx-table-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => setSpotForm({ ...DEFAULT_SPOT_FORM, ...pair, pairId: pair.pairId })}>Edit</button>
                    <button type="button" className="btn btn-ghost" onClick={() => handleAsyncAction(`spot.toggle.${pair.pairId}`, () => onToggleSpotPairStatus?.({ pairId: pair.pairId, isEnabled: !pair.isEnabled }))}>{pair.isEnabled ? "Disable" : "Enable"}</button>
                    <button type="button" className="btn btn-ghost" onClick={async () => {
                      const price = window.prompt("Enter manual tick price", String(pair.currentPrice || ""));
                      if (!price) return;
                      await handleAsyncAction(`spot.tick.${pair.pairId}`, () => onPushSpotManualTick?.({ pairId: pair.pairId, price: Number(price) }));
                    }}>Push Tick</button>
                    <button type="button" className="btn btn-ghost" onClick={() => handleAsyncAction(`spot.feed.${pair.pairId}`, () => onSaveSpotFeedSettings?.({ pairId: pair.pairId, priceSourceType: pair.priceSourceType, sourceSymbol: pair.sourceSymbol }))}>Save Feed</button>
                    <button type="button" className="btn btn-ghost danger" onClick={() => handleAsyncAction(`spot.delete.${pair.pairId}`, () => onDeleteSpotPair?.({ pairId: pair.pairId, note: "Admin delete" }))}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const orderDeskSection = (
    <section className="adminx-panel adminx-tx-panel">
      <div className="adminx-panel-head"><h2>Spot Order Desk</h2></div>
      <div className="adminx-filter-row">
        <select value={spotStatusFilter} onChange={(e) => setSpotStatusFilter(e.target.value)}>
          <option value="all">All</option><option value="open">Open</option><option value="filled">Filled</option><option value="cancelled">Cancelled</option><option value="rejected">Rejected</option><option value="error">Error</option>
        </select>
      </div>
      <div className="adminx-table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Ref</th><th>User</th><th>Pair</th><th>Side</th><th>Type</th><th>Qty</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {filteredSpotOrders.map((row) => (
              <tr key={row.orderId}>
                <td>{formatDateTime(row.createdAt)}</td>
                <td>{row.orderRef}</td>
                <td>{row.accountEmail || row.userId}</td>
                <td>{row.pairCode}</td>
                <td>{row.side}</td>
                <td>{row.orderType}</td>
                <td>{formatMoney(row.quantity, 6)}</td>
                <td>{row.status}</td>
                <td>
                  <div className="adminx-table-actions">
                    {(row.status === "open" || row.status === "partially_filled") ? (
                      <button type="button" className="btn btn-ghost" onClick={() => handleAsyncAction(`spot.cancel.${row.orderId}`, () => onCancelSpotOrder?.({ orderId: row.orderId, note: "Admin cancel" }))}>Cancel</button>
                    ) : null}
                    {(row.status === "open" || row.status === "partially_filled") ? (
                      <button type="button" className="btn btn-ghost" onClick={async () => {
                        const price = window.prompt("Execution price (optional)", "");
                        await handleAsyncAction(`spot.forcefill.${row.orderId}`, () => onForceFillSpotOrder?.({ orderId: row.orderId, executionPrice: price ? Number(price) : undefined, note: "Admin force fill" }));
                      }}>Force Fill</button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const auditSection = (
    <section className="adminx-panel adminx-tx-panel">
      <div className="adminx-panel-head"><h2>Transaction Audit Logs</h2></div>
      <div className="adminx-table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Scope</th><th>Admin</th><th>Action</th><th>Target</th><th>Note</th></tr></thead>
          <tbody>
            {filteredAuditLogs.map((row) => (
              <tr key={row.logId}>
                <td>{formatDateTime(row.createdAt)}</td>
                <td>{row.scope}</td>
                <td>{row.adminUserId}</td>
                <td>{row.actionType}</td>
                <td>{row.targetType}:{row.targetId}</td>
                <td>{row.note || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <section className="adminx-panel adminx-tx-root">
      <AdminSectionIntro
        icon={ADMIN_SECTION_META.transactionCenter.icon}
        title={ADMIN_SECTION_META.transactionCenter.title}
        description={ADMIN_SECTION_META.transactionCenter.description}
        stats={[
          { label: "Convert Orders", value: formatCompactNumber(summary?.totalConvertOrders || 0) },
          { label: "Spot Orders", value: formatCompactNumber(summary?.totalSpotOrders || 0) },
          { label: "Open Spot", value: formatCompactNumber(summary?.openSpotOrders || 0) },
        ]}
      />

      <div className="adminx-panel-head adminx-tx-head">
        <h2>Transaction Management</h2>
        <div className="adminx-profile-actions">
          <button type="button" className="btn btn-ghost" onClick={onRefresh}>
            <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-rotate"}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="adminx-tab-row">
        {TX_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeTab === tab.key ? "active" : ""}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? <p className="adminx-error">{error}</p> : null}
      {notice ? <p className="adminx-auth-notice">{notice}</p> : null}

      {activeTab === "overview" ? overviewSection : null}
      {activeTab === "control" ? controlSection : null}
      {activeTab === "convert" ? convertSection : null}
      {activeTab === "spotPairs" ? spotPairSection : null}
      {activeTab === "orders" ? orderDeskSection : null}
      {activeTab === "audit" ? auditSection : null}
    </section>
  );
}
