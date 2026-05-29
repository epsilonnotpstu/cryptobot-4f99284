import { useEffect, useMemo, useState } from "react";
import { ADMIN_SECTION_META } from "../constants";
import { formatCompactNumber } from "../utils/format";
import AdminSectionIntro from "./AdminSectionIntro";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "studio", label: "Launch Studio" },
  { key: "tiers", label: "Tier Builder" },
  { key: "orders", label: "Orders Desk" },
  { key: "hype", label: "Hype Control" },
  { key: "sync", label: "Market Sync" },
  { key: "audit", label: "Audit" },
];

const DEFAULT_LAUNCH_FORM = {
  launchId: 0,
  launchRef: "",
  coinSymbol: "",
  coinName: "",
  description: "",
  launchPriceUsd: "0.01",
  listingPriceUsd: "0.05",
  totalSupply: "1000000",
  tokensForSale: "1000000",
  minBuyUsd: "10",
  maxBuyUsd: "10000",
  perUserCapUsd: "5000",
  maxSlots: "500",
  vipStartAt: "",
  publicStartAt: "",
  endAt: "",
  tradingOpenAt: "",
  status: "upcoming",
};

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toDateTimeInput(value = "") {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeInput(value = "") {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString();
}

function formatMoney(value = 0, digits = 2) {
  return toNumber(value, 0).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: Math.min(8, Math.max(2, digits)),
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

function normalizeLaunchFormFromLaunch(launch = null) {
  if (!launch) {
    return DEFAULT_LAUNCH_FORM;
  }

  return {
    launchId: toNumber(launch.launchId, 0),
    launchRef: String(launch.launchRef || ""),
    coinSymbol: String(launch.coinSymbol || ""),
    coinName: String(launch.coinName || ""),
    description: String(launch.description || ""),
    launchPriceUsd: String(launch.launchPriceUsd ?? "0.01"),
    listingPriceUsd: String(launch.listingPriceUsd ?? "0.05"),
    totalSupply: String(launch.totalSupply ?? "0"),
    tokensForSale: String(launch.tokensForSale ?? "0"),
    minBuyUsd: String(launch.minBuyUsd ?? "10"),
    maxBuyUsd: String(launch.maxBuyUsd ?? "10000"),
    perUserCapUsd: String(launch.perUserCapUsd ?? "5000"),
    maxSlots: String(launch.maxSlots ?? "500"),
    vipStartAt: toDateTimeInput(launch.vipStartAt || ""),
    publicStartAt: toDateTimeInput(launch.publicStartAt || ""),
    endAt: toDateTimeInput(launch.endAt || ""),
    tradingOpenAt: toDateTimeInput(launch.tradingOpenAt || ""),
    status: String(launch.status || "upcoming"),
  };
}

function buildLaunchPayload(form) {
  return {
    launchId: toNumber(form.launchId, 0),
    launchRef: form.launchRef,
    coinSymbol: form.coinSymbol,
    coinName: form.coinName,
    description: form.description,
    launchPriceUsd: toNumber(form.launchPriceUsd, 0.01),
    listingPriceUsd: toNumber(form.listingPriceUsd, 0.05),
    totalSupply: toNumber(form.totalSupply, 0),
    tokensForSale: toNumber(form.tokensForSale, 0),
    minBuyUsd: toNumber(form.minBuyUsd, 10),
    maxBuyUsd: toNumber(form.maxBuyUsd, 10000),
    perUserCapUsd: toNumber(form.perUserCapUsd, 5000),
    maxSlots: Math.max(1, Math.floor(toNumber(form.maxSlots, 500))),
    vipStartAt: fromDateTimeInput(form.vipStartAt),
    publicStartAt: fromDateTimeInput(form.publicStartAt),
    endAt: fromDateTimeInput(form.endAt),
    tradingOpenAt: fromDateTimeInput(form.tradingOpenAt),
    status: form.status || "upcoming",
  };
}

function cloneTiers(tiers = []) {
  return (Array.isArray(tiers) ? tiers : []).map((tier) => ({
    tierId: toNumber(tier.tierId, 0),
    minSoldPercent: String(tier.minSoldPercent ?? "0"),
    maxSoldPercent: String(tier.maxSoldPercent ?? "0"),
    priceUsd: String(tier.priceUsd ?? "0.01"),
    displaySortOrder: String(tier.displaySortOrder ?? "0"),
    isActive: tier.isActive !== false,
  }));
}

export default function LaunchpadManagementPage({
  summary,
  launches,
  settings,
  audit,
  loading,
  searchValue,
  onSearchChange,
  onRefresh,
  onCreateLaunch,
  onUpdateLaunch,
  onUpdateLaunchStatus,
  onSaveTiers,
  onSaveSettings,
  onListOrders,
  onReleaseOrders,
  onRunMarketSync,
}) {
  const [tab, setTab] = useState("overview");
  const [selectedLaunchId, setSelectedLaunchId] = useState(0);
  const [launchForm, setLaunchForm] = useState(DEFAULT_LAUNCH_FORM);
  const [tierRows, setTierRows] = useState([]);
  const [settingsForm, setSettingsForm] = useState({});
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderStatus, setOrderStatus] = useState("all");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [syncOptions, setSyncOptions] = useState({
    enableSpot: false,
    enableConvert: false,
    enableBinary: false,
  });

  const launchList = useMemo(() => (Array.isArray(launches) ? launches : []), [launches]);
  const selectedLaunch = useMemo(
    () => launchList.find((launch) => Number(launch.launchId) === Number(selectedLaunchId)) || launchList[0] || null,
    [launchList, selectedLaunchId],
  );

  const filteredAudit = useMemo(() => {
    const keyword = normalizeText(searchValue);
    const rows = Array.isArray(audit?.logs) ? audit.logs : [];
    if (!keyword) {
      return rows;
    }
    return rows.filter((row) => {
      const bucket = `${row.actionType} ${row.targetType} ${row.targetId} ${row.note} ${row.adminUserId}`.toLowerCase();
      return bucket.includes(keyword);
    });
  }, [audit?.logs, searchValue]);

  useEffect(() => {
    if (!selectedLaunchId && launchList.length) {
      setSelectedLaunchId(Number(launchList[0].launchId));
    }
  }, [launchList, selectedLaunchId]);

  useEffect(() => {
    if (!selectedLaunch) {
      setLaunchForm(DEFAULT_LAUNCH_FORM);
      setTierRows([]);
      return;
    }
    setLaunchForm(normalizeLaunchFormFromLaunch(selectedLaunch));
    setTierRows(cloneTiers(selectedLaunch.tiers || []));
  }, [selectedLaunch?.launchId]);

  useEffect(() => {
    setSettingsForm({
      launchpadEnabled: settings?.launchpadEnabled !== false,
      maintenanceModeEnabled: Boolean(settings?.maintenanceModeEnabled),
      maintenanceMessage: String(settings?.maintenanceMessage || ""),
      simulatedFeedEnabled: settings?.simulatedFeedEnabled !== false,
      simulatedIdleSeconds: String(settings?.simulatedIdleSeconds ?? 45),
      simulatedMinAmountUsd: String(settings?.simulatedMinAmountUsd ?? 50),
      simulatedMaxAmountUsd: String(settings?.simulatedMaxAmountUsd ?? 2500),
      whaleThresholdUsd: String(settings?.whaleThresholdUsd ?? 1000),
      autoReleaseEnabled: settings?.autoReleaseEnabled !== false,
      defaultTradingDelaySeconds: String(settings?.defaultTradingDelaySeconds ?? 900),
      allowLabelledSimulatedFeed: settings?.allowLabelledSimulatedFeed !== false,
    });
  }, [settings]);

  useEffect(() => {
    if (tab !== "orders" || !selectedLaunch || !onListOrders) {
      return;
    }

    let mounted = true;
    setOrdersLoading(true);
    onListOrders({ launchId: selectedLaunch.launchId, status: orderStatus, page: 1, limit: 120 })
      .then((data) => {
        if (!mounted) {
          return;
        }
        setOrders(Array.isArray(data?.orders) ? data.orders : []);
      })
      .catch((loadError) => {
        if (mounted) {
          setError(loadError.message || "Could not load launch orders.");
        }
      })
      .finally(() => {
        if (mounted) {
          setOrdersLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [tab, selectedLaunch?.launchId, orderStatus, onListOrders]);

  const runAction = async (key, fn, successMessage = "Saved successfully.") => {
    setError("");
    setNotice("");
    setBusy(key);
    try {
      await fn();
      setNotice(successMessage);
      await onRefresh?.({ force: true });
    } catch (actionError) {
      setError(actionError.message || "Action failed.");
    } finally {
      setBusy("");
    }
  };

  const saveLaunch = async () => {
    const payload = buildLaunchPayload(launchForm);
    if (!payload.coinSymbol || !payload.coinName || !payload.publicStartAt || !payload.endAt) {
      setError("Coin symbol, name, public start, and end time are required.");
      return;
    }

    await runAction(
      "launch.save",
      async () => {
        if (payload.launchId > 0) {
          await onUpdateLaunch?.(payload);
        } else {
          await onCreateLaunch?.(payload);
          setLaunchForm(DEFAULT_LAUNCH_FORM);
        }
      },
      payload.launchId > 0 ? "Launch updated." : "Launch created.",
    );
  };

  const changeLaunchStatus = async (status) => {
    if (!selectedLaunch) {
      setError("Select a launch first.");
      return;
    }
    await runAction(
      `launch.status.${status}`,
      async () => {
        await onUpdateLaunchStatus?.({ launchId: selectedLaunch.launchId, status });
      },
      `Launch status changed to ${status}.`,
    );
  };

  const saveTiers = async () => {
    if (!selectedLaunch) {
      setError("Select a launch first.");
      return;
    }

    const tiersPayload = tierRows.map((tier, index) => ({
      tierId: toNumber(tier.tierId, 0),
      minSoldPercent: toNumber(tier.minSoldPercent, 0),
      maxSoldPercent: toNumber(tier.maxSoldPercent, 0),
      priceUsd: toNumber(tier.priceUsd, 0),
      displaySortOrder: Math.floor(toNumber(tier.displaySortOrder, index)),
      isActive: Boolean(tier.isActive),
    }));

    await runAction(
      "tiers.save",
      async () => {
        await onSaveTiers?.({ launchId: selectedLaunch.launchId, tiers: tiersPayload });
      },
      "Launch tier ladder saved.",
    );
  };

  const saveHypeSettings = async () => {
    await runAction(
      "settings.save",
      async () => {
        await onSaveSettings?.({
          ...settingsForm,
          simulatedIdleSeconds: toNumber(settingsForm.simulatedIdleSeconds, 45),
          simulatedMinAmountUsd: toNumber(settingsForm.simulatedMinAmountUsd, 50),
          simulatedMaxAmountUsd: toNumber(settingsForm.simulatedMaxAmountUsd, 2500),
          whaleThresholdUsd: toNumber(settingsForm.whaleThresholdUsd, 1000),
          defaultTradingDelaySeconds: toNumber(settingsForm.defaultTradingDelaySeconds, 900),
        });
      },
      "Launchpad settings updated.",
    );
  };

  const releaseOrders = async () => {
    if (!selectedLaunch) {
      setError("Select a launch first.");
      return;
    }

    await runAction(
      "orders.release",
      async () => {
        await onReleaseOrders?.({ launchId: selectedLaunch.launchId, note: "Released from orders desk" });
      },
      "Pending allocations released.",
    );
  };

  const runSync = async () => {
    if (!selectedLaunch) {
      setError("Select a launch first.");
      return;
    }

    await runAction(
      "market.sync",
      async () => {
        await onRunMarketSync?.({ launchId: selectedLaunch.launchId, ...syncOptions });
      },
      "Market sync completed.",
    );
  };

  const sectionMeta = ADMIN_SECTION_META.launchpadCenter;

  return (
    <section className="adminx-launchpad-wrap">
      <AdminSectionIntro
        icon={sectionMeta?.icon || "fa-rocket"}
        title={sectionMeta?.title || "Launchpad Management"}
        description={sectionMeta?.description || "Manage launch lifecycle and market sync."}
        stats={[
          { label: "Total Launches", value: formatCompactNumber(summary?.stats?.totalLaunches || launchList.length || 0) },
          { label: "Live", value: formatCompactNumber(summary?.stats?.live || 0) },
          { label: "Pending Allocations", value: formatCompactNumber(summary?.stats?.totalPendingOrders || 0) },
        ]}
      />

      {notice ? <p className="adminx-notice">{notice}</p> : null}
      {error ? <p className="adminx-error">{error}</p> : null}

      <div className="adminx-panel adminx-lp-panel">
        <div className="adminx-lp-tabs">
          {TABS.map((item) => (
            <button key={item.key} type="button" className={tab === item.key ? "active" : ""} onClick={() => setTab(item.key)}>
              {item.label}
            </button>
          ))}
        </div>

        <div className="adminx-lp-layout">
          <aside className="adminx-lp-side">
            <div className="adminx-panel-head">
              <h2>Launches</h2>
              <small>{launchList.length} total</small>
            </div>
            <div className="adminx-lp-launch-list">
              {launchList.length ? (
                launchList.map((launch) => (
                  <button
                    key={launch.launchId}
                    type="button"
                    className={`adminx-lp-launch-btn ${Number(selectedLaunch?.launchId) === Number(launch.launchId) ? "active" : ""}`}
                    onClick={() => setSelectedLaunchId(Number(launch.launchId))}
                  >
                    <strong>{launch.coinSymbol}</strong>
                    <span>{launch.coinName}</span>
                    <small>
                      {launch.phase} • sold {Number(launch.soldPercent || 0).toFixed(2)}%
                    </small>
                  </button>
                ))
              ) : (
                <p className="adminx-muted">No launches yet.</p>
              )}
            </div>
          </aside>

          <div className="adminx-lp-main">
            {tab === "overview" ? (
              <div className="adminx-lp-overview-grid">
                <article>
                  <small>Total Raised</small>
                  <strong>${formatMoney(summary?.stats?.totalRaisedUsd || 0, 2)}</strong>
                  <p>Across all launches</p>
                </article>
                <article>
                  <small>Upcoming</small>
                  <strong>{formatCompactNumber(summary?.stats?.upcoming || 0)}</strong>
                  <p>Queued launches</p>
                </article>
                <article>
                  <small>Ended</small>
                  <strong>{formatCompactNumber(summary?.stats?.ended || 0)}</strong>
                  <p>Waiting release / released</p>
                </article>
                <article>
                  <small>Launchpad Mode</small>
                  <strong>{settings?.launchpadEnabled ? "Enabled" : "Disabled"}</strong>
                  <p>{settings?.maintenanceModeEnabled ? "Maintenance active" : "Service normal"}</p>
                </article>

                {summary?.featured ? (
                  <article className="adminx-lp-featured">
                    <small>Featured</small>
                    <h3>{summary.featured.coinSymbol} • {summary.featured.coinName}</h3>
                    <p>
                      Hype {summary.featured.hypePercent}% • ROI {Number(summary.featured.expectedRoiX || 0).toFixed(2)}x • Sold {Number(summary.featured.soldPercent || 0).toFixed(2)}%
                    </p>
                    <span>{formatDateTime(summary.featured.publicStartAt)} - {formatDateTime(summary.featured.endAt)}</span>
                  </article>
                ) : null}
              </div>
            ) : null}

            {tab === "studio" ? (
              <div className="adminx-lp-form-grid">
                <label>Coin Symbol<input value={launchForm.coinSymbol} onChange={(e) => setLaunchForm((p) => ({ ...p, coinSymbol: e.target.value.toUpperCase() }))} /></label>
                <label>Coin Name<input value={launchForm.coinName} onChange={(e) => setLaunchForm((p) => ({ ...p, coinName: e.target.value }))} /></label>
                <label>Launch Price USD<input type="number" step="0.00000001" value={launchForm.launchPriceUsd} onChange={(e) => setLaunchForm((p) => ({ ...p, launchPriceUsd: e.target.value }))} /></label>
                <label>Listing Price USD<input type="number" step="0.00000001" value={launchForm.listingPriceUsd} onChange={(e) => setLaunchForm((p) => ({ ...p, listingPriceUsd: e.target.value }))} /></label>
                <label>Total Supply<input type="number" step="0.000001" value={launchForm.totalSupply} onChange={(e) => setLaunchForm((p) => ({ ...p, totalSupply: e.target.value }))} /></label>
                <label>Tokens for Sale<input type="number" step="0.000001" value={launchForm.tokensForSale} onChange={(e) => setLaunchForm((p) => ({ ...p, tokensForSale: e.target.value }))} /></label>
                <label>Min Buy USD<input type="number" step="0.01" value={launchForm.minBuyUsd} onChange={(e) => setLaunchForm((p) => ({ ...p, minBuyUsd: e.target.value }))} /></label>
                <label>Max Buy USD<input type="number" step="0.01" value={launchForm.maxBuyUsd} onChange={(e) => setLaunchForm((p) => ({ ...p, maxBuyUsd: e.target.value }))} /></label>
                <label>Per User Cap USD<input type="number" step="0.01" value={launchForm.perUserCapUsd} onChange={(e) => setLaunchForm((p) => ({ ...p, perUserCapUsd: e.target.value }))} /></label>
                <label>Max Slots<input type="number" step="1" value={launchForm.maxSlots} onChange={(e) => setLaunchForm((p) => ({ ...p, maxSlots: e.target.value }))} /></label>
                <label>VIP Start<input type="datetime-local" value={launchForm.vipStartAt} onChange={(e) => setLaunchForm((p) => ({ ...p, vipStartAt: e.target.value }))} /></label>
                <label>Public Start<input type="datetime-local" value={launchForm.publicStartAt} onChange={(e) => setLaunchForm((p) => ({ ...p, publicStartAt: e.target.value }))} /></label>
                <label>End At<input type="datetime-local" value={launchForm.endAt} onChange={(e) => setLaunchForm((p) => ({ ...p, endAt: e.target.value }))} /></label>
                <label>Trading Open<input type="datetime-local" value={launchForm.tradingOpenAt} onChange={(e) => setLaunchForm((p) => ({ ...p, tradingOpenAt: e.target.value }))} /></label>
                <label>
                  Status
                  <select value={launchForm.status} onChange={(e) => setLaunchForm((p) => ({ ...p, status: e.target.value }))}>
                    <option value="draft">Draft</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="live">Live</option>
                    <option value="paused">Paused</option>
                    <option value="ended">Ended</option>
                  </select>
                </label>
                <label className="adminx-lp-form-col2">Description<textarea rows={3} value={launchForm.description} onChange={(e) => setLaunchForm((p) => ({ ...p, description: e.target.value }))} /></label>

                <div className="adminx-lp-actions adminx-lp-form-col2">
                  <button type="button" className="btn btn-ghost" onClick={() => setLaunchForm(DEFAULT_LAUNCH_FORM)}>New Form</button>
                  <button type="button" className="btn btn-primary" onClick={saveLaunch} disabled={busy === "launch.save"}>{busy === "launch.save" ? "Saving..." : launchForm.launchId ? "Update Launch" : "Create Launch"}</button>
                </div>

                {selectedLaunch ? (
                  <div className="adminx-lp-actions adminx-lp-form-col2">
                    <button type="button" className="btn btn-ghost" onClick={() => changeLaunchStatus("upcoming")}>Set Upcoming</button>
                    <button type="button" className="btn btn-ghost" onClick={() => changeLaunchStatus("live")}>Set Live</button>
                    <button type="button" className="btn btn-ghost" onClick={() => changeLaunchStatus("paused")}>Pause</button>
                    <button type="button" className="btn btn-ghost" onClick={() => changeLaunchStatus("ended")}>End</button>
                    <button type="button" className="btn btn-primary" onClick={() => changeLaunchStatus("released")}>Release</button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {tab === "tiers" ? (
              <>
                <div className="adminx-lp-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() =>
                      setTierRows((rows) => [
                        ...rows,
                        {
                          tierId: 0,
                          minSoldPercent: "0",
                          maxSoldPercent: "100",
                          priceUsd: String(selectedLaunch?.launchPriceUsd || 0.01),
                          displaySortOrder: String(rows.length),
                          isActive: true,
                        },
                      ])
                    }
                  >
                    Add Tier
                  </button>
                  <button type="button" className="btn btn-primary" onClick={saveTiers} disabled={busy === "tiers.save" || !selectedLaunch}>
                    {busy === "tiers.save" ? "Saving..." : "Save Tiers"}
                  </button>
                </div>

                <div className="adminx-lp-table-wrap">
                  <table className="adminx-table">
                    <thead>
                      <tr>
                        <th>Min %</th>
                        <th>Max %</th>
                        <th>Price USD</th>
                        <th>Order</th>
                        <th>Active</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tierRows.length ? (
                        tierRows.map((tier, index) => (
                          <tr key={`${tier.tierId || "new"}-${index}`}>
                            <td><input type="number" value={tier.minSoldPercent} onChange={(e) => setTierRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, minSoldPercent: e.target.value } : row)))} /></td>
                            <td><input type="number" value={tier.maxSoldPercent} onChange={(e) => setTierRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, maxSoldPercent: e.target.value } : row)))} /></td>
                            <td><input type="number" step="0.00000001" value={tier.priceUsd} onChange={(e) => setTierRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, priceUsd: e.target.value } : row)))} /></td>
                            <td><input type="number" value={tier.displaySortOrder} onChange={(e) => setTierRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, displaySortOrder: e.target.value } : row)))} /></td>
                            <td><input type="checkbox" checked={Boolean(tier.isActive)} onChange={(e) => setTierRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, isActive: e.target.checked } : row)))} /></td>
                            <td><button type="button" className="btn btn-ghost" onClick={() => setTierRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Remove</button></td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6}><p className="adminx-muted">No tiers yet. Add tier rows and save.</p></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {tab === "orders" ? (
              <>
                <div className="adminx-lp-actions">
                  <select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)}>
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="released">Released</option>
                  </select>
                  <button type="button" className="btn btn-primary" onClick={releaseOrders} disabled={busy === "orders.release" || !selectedLaunch}>
                    {busy === "orders.release" ? "Releasing..." : "Release Pending"}
                  </button>
                </div>

                {ordersLoading ? <p className="adminx-muted">Loading orders...</p> : null}

                <div className="adminx-lp-table-wrap">
                  <table className="adminx-table">
                    <thead>
                      <tr>
                        <th>Ref</th>
                        <th>User</th>
                        <th>Buy USD</th>
                        <th>Allocation</th>
                        <th>Status</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.length ? (
                        orders.map((order) => (
                          <tr key={order.participationRef}>
                            <td>{order.participationRef}</td>
                            <td>{order.accountEmail || order.userId}</td>
                            <td>${formatMoney(order.buyUsd, 2)}</td>
                            <td>{formatMoney(order.allocationTokens, 6)}</td>
                            <td><span className={`adminx-status-badge ${order.status === "released" ? "is-authenticated" : "is-pending"}`}>{order.status}</span></td>
                            <td>{formatDateTime(order.createdAt)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6}><p className="adminx-muted">No orders found for this launch.</p></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {tab === "hype" ? (
              <div className="adminx-lp-form-grid">
                <label><input type="checkbox" checked={Boolean(settingsForm.launchpadEnabled)} onChange={(e) => setSettingsForm((p) => ({ ...p, launchpadEnabled: e.target.checked }))} /> Launchpad Enabled</label>
                <label><input type="checkbox" checked={Boolean(settingsForm.maintenanceModeEnabled)} onChange={(e) => setSettingsForm((p) => ({ ...p, maintenanceModeEnabled: e.target.checked }))} /> Maintenance Mode</label>
                <label><input type="checkbox" checked={Boolean(settingsForm.simulatedFeedEnabled)} onChange={(e) => setSettingsForm((p) => ({ ...p, simulatedFeedEnabled: e.target.checked }))} /> Simulated Feed Enabled</label>
                <label><input type="checkbox" checked={Boolean(settingsForm.allowLabelledSimulatedFeed)} onChange={(e) => setSettingsForm((p) => ({ ...p, allowLabelledSimulatedFeed: e.target.checked }))} /> Labelled Hybrid Feed</label>
                <label><input type="checkbox" checked={Boolean(settingsForm.autoReleaseEnabled)} onChange={(e) => setSettingsForm((p) => ({ ...p, autoReleaseEnabled: e.target.checked }))} /> Auto Release Enabled</label>

                <label>Idle Seconds<input type="number" value={settingsForm.simulatedIdleSeconds || ""} onChange={(e) => setSettingsForm((p) => ({ ...p, simulatedIdleSeconds: e.target.value }))} /></label>
                <label>Sim Min USD<input type="number" value={settingsForm.simulatedMinAmountUsd || ""} onChange={(e) => setSettingsForm((p) => ({ ...p, simulatedMinAmountUsd: e.target.value }))} /></label>
                <label>Sim Max USD<input type="number" value={settingsForm.simulatedMaxAmountUsd || ""} onChange={(e) => setSettingsForm((p) => ({ ...p, simulatedMaxAmountUsd: e.target.value }))} /></label>
                <label>Whale Threshold USD<input type="number" value={settingsForm.whaleThresholdUsd || ""} onChange={(e) => setSettingsForm((p) => ({ ...p, whaleThresholdUsd: e.target.value }))} /></label>
                <label>Trading Delay (sec)<input type="number" value={settingsForm.defaultTradingDelaySeconds || ""} onChange={(e) => setSettingsForm((p) => ({ ...p, defaultTradingDelaySeconds: e.target.value }))} /></label>
                <label className="adminx-lp-form-col2">Maintenance Message<textarea rows={3} value={settingsForm.maintenanceMessage || ""} onChange={(e) => setSettingsForm((p) => ({ ...p, maintenanceMessage: e.target.value }))} /></label>

                <div className="adminx-lp-actions adminx-lp-form-col2">
                  <button type="button" className="btn btn-primary" onClick={saveHypeSettings} disabled={busy === "settings.save"}>{busy === "settings.save" ? "Saving..." : "Save Settings"}</button>
                </div>
              </div>
            ) : null}

            {tab === "sync" ? (
              <div className="adminx-lp-form-grid">
                <label><input type="checkbox" checked={syncOptions.enableSpot} onChange={(e) => setSyncOptions((p) => ({ ...p, enableSpot: e.target.checked }))} /> Enable Spot Pair After Sync</label>
                <label><input type="checkbox" checked={syncOptions.enableConvert} onChange={(e) => setSyncOptions((p) => ({ ...p, enableConvert: e.target.checked }))} /> Enable Convert Pairs After Sync</label>
                <label><input type="checkbox" checked={syncOptions.enableBinary} onChange={(e) => setSyncOptions((p) => ({ ...p, enableBinary: e.target.checked }))} /> Enable Binary Pair After Sync</label>

                <div className="adminx-lp-form-col2 adminx-lp-sync-card">
                  <h3>Current Selection</h3>
                  <p>{selectedLaunch ? `${selectedLaunch.coinSymbol} • ${selectedLaunch.coinName}` : "No launch selected"}</p>
                  <small>Run sync will auto-create draft pairs in spot/convert/binary, and selected toggles can make them tradable immediately.</small>
                </div>

                <div className="adminx-lp-actions adminx-lp-form-col2">
                  <button type="button" className="btn btn-primary" onClick={runSync} disabled={busy === "market.sync" || !selectedLaunch}>
                    {busy === "market.sync" ? "Syncing..." : "Run Market Sync"}
                  </button>
                </div>
              </div>
            ) : null}

            {tab === "audit" ? (
              <div className="adminx-lp-table-wrap">
                <table className="adminx-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Admin</th>
                      <th>Action</th>
                      <th>Target</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAudit.length ? (
                      filteredAudit.map((row) => (
                        <tr key={`${row.auditId}-${row.createdAt}`}>
                          <td>{formatDateTime(row.createdAt)}</td>
                          <td>{row.adminUserId || "system"}</td>
                          <td>{row.actionType}</td>
                          <td>{row.targetType}:{row.targetId}</td>
                          <td>{row.note || "-"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5}><p className="adminx-muted">No audit logs found.</p></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="adminx-lp-footer-tools">
        <button type="button" className="btn btn-ghost" onClick={() => onSearchChange?.("")}>Clear Search</button>
        <button type="button" className="btn btn-ghost" onClick={() => setTab("overview")}>Go Overview</button>
        <button type="button" className="btn btn-primary" onClick={onRefresh} disabled={loading}>Refresh Section</button>
      </div>
    </section>
  );
}
