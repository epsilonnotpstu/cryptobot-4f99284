import { useMemo, useState } from "react";
import {
  ADMIN_SECTION_META,
  ADMIN_SIDEBAR_ITEMS,
  DEFAULT_ACTIVITY_FEED,
  STATIC_BOT_PERFORMANCE,
  STATIC_STRATEGY_DISTRIBUTION,
} from "../constants";
import { formatCompactNumber, formatDateHeading, formatRelativeTime } from "../utils/format";
import AdminSectionIntro from "./AdminSectionIntro";
import UserManagementPage from "./UserManagementPage";
import KycReviewPage from "./KycReviewPage";
import DepositManagementPage from "./DepositManagementPage";
import LUMManagementPage from "./LUMManagementPage";
import BinaryManagementPage from "./BinaryManagementPage";
import TransactionManagementPage from "./TransactionManagementPage";
import AssetManagementPage from "./AssetManagementPage";
import SupportManagementPage from "./SupportManagementPage";

function buildLinePath(points, width, height, min, max) {
  const range = Math.max(1, max - min);
  return points
    .map((value, index) => {
      const x = (index / Math.max(1, points.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function getInitials(name = "") {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) {
    return "US";
  }
  return parts.map((part) => part[0]).join("").toUpperCase();
}

function formatRoleLabel(role = "") {
  const normalized = String(role || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ");
  if (!normalized) {
    return "Admin";
  }
  return normalized
    .split(" ")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function formatStatusLabel(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) {
    return "Active";
  }
  return normalized[0].toUpperCase() + normalized.slice(1);
}

function formatKycLabel(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "authenticated") {
    return "Authenticated";
  }
  if (normalized === "rejected") {
    return "Rejected";
  }
  return "Pending";
}

export default function AdminDashboardPage({
  adminUser,
  loading,
  error,
  dashboard,
  userDirectory,
  kycQueue,
  depositCenter,
  lumCenter,
  binaryCenter,
  transactionCenter,
  assetCenter,
  supportCenter,
  activeSection,
  onSectionChange,
  onRefresh,
  onLogout,
  onBackHome,
  onOpenUserAuth,
  onFetchUserDetail,
  onUpdateUser,
  onDeleteUser,
  onReviewKycRequest,
  onUpsertDepositAsset,
  onDeleteDepositAsset,
  onReviewDepositRequest,
  onCreateLumPlan,
  onUpdateLumPlan,
  onDeleteLumPlan,
  onToggleLumPlanStatus,
  onSaveLumPlanContent,
  onReviewLumInvestment,
  onForceSettleLumInvestment,
  onCreateBinaryPair,
  onUpdateBinaryPair,
  onDeleteBinaryPair,
  onToggleBinaryPairStatus,
  onSaveBinaryPeriodRule,
  onSettleBinaryTrade,
  onCancelBinaryTrade,
  onSaveBinaryEngineSettings,
  onPushBinaryManualTick,
  onSaveTransactionEngineSettings,
  onCreateTransactionConvertPair,
  onUpdateTransactionConvertPair,
  onDeleteTransactionConvertPair,
  onToggleTransactionConvertPairStatus,
  onPushTransactionConvertManualRate,
  onCreateTransactionSpotPair,
  onUpdateTransactionSpotPair,
  onDeleteTransactionSpotPair,
  onToggleTransactionSpotPairStatus,
  onCancelTransactionSpotOrder,
  onForceFillTransactionSpotOrder,
  onPushTransactionSpotManualTick,
  onSaveTransactionSpotFeedSettings,
  onLoadAssetWalletDetail,
  onAdjustAssetWallet,
  onFreezeAssetWallet,
  onReviewAssetWithdrawal,
  onCompleteAssetWithdrawal,
  onSaveAssetSettings,
  onLoadSupportTicketDetail,
  onReplySupportTicket,
  onUpdateSupportTicket,
}) {
  const [showProfile, setShowProfile] = useState(false);
  const [adminSearch, setAdminSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const profitSeries = dashboard.profitSeries?.length
    ? dashboard.profitSeries
    : [40_000, 58_000, 45_000, 72_000, 91_000, 98_000, 113_000, 136_000, 122_000, 151_000, 164_000, 193_000];
  const costSeries = dashboard.costSeries?.length
    ? dashboard.costSeries
    : [8000, 12000, 9400, 14700, 11100, 16400, 13600, 19800, 22400, 17100, 24900, 21900];

  const chartBounds = useMemo(() => {
    const all = [...profitSeries, ...costSeries];
    return {
      min: Math.min(...all),
      max: Math.max(...all),
    };
  }, [costSeries, profitSeries]);

  const profitPath = useMemo(
    () => buildLinePath(profitSeries, 560, 220, chartBounds.min, chartBounds.max),
    [chartBounds.max, chartBounds.min, profitSeries],
  );
  const costPath = useMemo(
    () => buildLinePath(costSeries, 560, 220, chartBounds.min, chartBounds.max),
    [chartBounds.max, chartBounds.min, costSeries],
  );

  const activityFeed = dashboard.activityFeed?.length ? dashboard.activityFeed : DEFAULT_ACTIVITY_FEED;
  const strategyGradient = STATIC_STRATEGY_DISTRIBUTION.map((item, index, arr) => {
    const previous = arr.slice(0, index).reduce((sum, row) => sum + row.value, 0);
    const next = previous + item.value;
    return `${item.color} ${previous}% ${next}%`;
  }).join(", ");

  const sectionMeta = ADMIN_SECTION_META[activeSection] || {
    icon: "fa-compass",
    title: "Admin Workspace",
    description: "Selected admin section is ready for operation.",
  };
  const pageTitle = sectionMeta.title;
  const searchableSections = useMemo(
    () =>
      new Set([
        "users",
        "kycReview",
        "depositCenter",
        "lumCenter",
        "binaryCenter",
        "transactionCenter",
        "assetCenter",
        "supportCenter",
      ]),
    [],
  );
  const isSearchEnabled = searchableSections.has(activeSection);

  const navBadges = useMemo(
    () => ({
      users: formatCompactNumber(userDirectory?.stats?.totalUsers || 0),
      kycReview: formatCompactNumber(kycQueue?.stats?.pendingKycRequests || 0),
      depositCenter: formatCompactNumber(depositCenter?.stats?.pendingRequests || 0),
      lumCenter: formatCompactNumber(lumCenter?.summary?.pendingCount || 0),
      binaryCenter: formatCompactNumber(binaryCenter?.summary?.activeTradesCount || 0),
      transactionCenter: formatCompactNumber(transactionCenter?.summary?.openSpotOrders || 0),
      assetCenter: formatCompactNumber(assetCenter?.withdrawals?.pagination?.total || 0),
      supportCenter: formatCompactNumber(supportCenter?.summary?.pendingAdminTickets || 0),
    }),
    [
      assetCenter?.withdrawals?.pagination?.total,
      binaryCenter?.summary?.activeTradesCount,
      depositCenter?.stats?.pendingRequests,
      kycQueue?.stats?.pendingKycRequests,
      lumCenter?.summary?.pendingCount,
      supportCenter?.summary?.pendingAdminTickets,
      transactionCenter?.summary?.openSpotOrders,
      userDirectory?.stats?.totalUsers,
    ],
  );

  const sectionStats = useMemo(() => {
    if (activeSection === "dashboard") {
      return [
        { label: "Total Users", value: formatCompactNumber(userDirectory?.stats?.totalUsers || 0) },
        { label: "Pending KYC", value: formatCompactNumber(kycQueue?.stats?.pendingKycRequests || 0) },
        { label: "Pending Deposits", value: formatCompactNumber(depositCenter?.stats?.pendingRequests || 0) },
      ];
    }
    if (activeSection === "users") {
      return [
        { label: "Total", value: formatCompactNumber(userDirectory?.stats?.totalUsers || 0) },
        { label: "Active", value: formatCompactNumber(userDirectory?.stats?.activeUsers || 0) },
        { label: "Pending KYC", value: formatCompactNumber(userDirectory?.stats?.pendingVerifications || 0) },
      ];
    }
    if (activeSection === "kycReview") {
      return [
        { label: "Pending", value: formatCompactNumber(kycQueue?.stats?.pendingKycRequests || 0) },
        { label: "Approved", value: formatCompactNumber(kycQueue?.stats?.authenticatedKycRequests || 0) },
        { label: "Rejected", value: formatCompactNumber(kycQueue?.stats?.rejectedKycRequests || 0) },
      ];
    }
    if (activeSection === "depositCenter") {
      return [
        { label: "Assets", value: formatCompactNumber(depositCenter?.stats?.totalAssets || 0) },
        { label: "Pending", value: formatCompactNumber(depositCenter?.stats?.pendingRequests || 0) },
        { label: "Approved", value: formatCompactNumber(depositCenter?.stats?.approvedRequests || 0) },
      ];
    }
    if (activeSection === "lumCenter") {
      return [
        { label: "Plans", value: formatCompactNumber(lumCenter?.summary?.totalPlans || 0) },
        { label: "Active", value: formatCompactNumber(lumCenter?.summary?.activeInvestments || 0) },
        { label: "Pending", value: formatCompactNumber(lumCenter?.summary?.pendingInvestments || 0) },
      ];
    }
    if (activeSection === "binaryCenter") {
      return [
        { label: "Active Trades", value: formatCompactNumber(binaryCenter?.summary?.activeTradesCount || 0) },
        { label: "Today", value: formatCompactNumber(binaryCenter?.summary?.todayTradesCount || 0) },
        { label: "Total", value: formatCompactNumber(binaryCenter?.summary?.totalTrades || 0) },
      ];
    }
    if (activeSection === "transactionCenter") {
      return [
        { label: "Convert Orders", value: formatCompactNumber(transactionCenter?.summary?.totalConvertOrders || 0) },
        { label: "Spot Orders", value: formatCompactNumber(transactionCenter?.summary?.totalSpotOrders || 0) },
        { label: "Open Spot", value: formatCompactNumber(transactionCenter?.summary?.openSpotOrders || 0) },
      ];
    }
    if (activeSection === "assetCenter") {
      return [
        { label: "Wallet Rows", value: formatCompactNumber(assetCenter?.walletDesk?.pagination?.total || 0) },
        { label: "Withdrawals", value: formatCompactNumber(assetCenter?.withdrawals?.pagination?.total || 0) },
        { label: "Transfers", value: formatCompactNumber(assetCenter?.transfers?.pagination?.total || 0) },
      ];
    }
    if (activeSection === "supportCenter") {
      return [
        { label: "Tickets", value: formatCompactNumber(supportCenter?.summary?.totalTickets || 0) },
        { label: "Pending Admin", value: formatCompactNumber(supportCenter?.summary?.pendingAdminTickets || 0) },
        { label: "Unread", value: formatCompactNumber(supportCenter?.summary?.unreadForAdmin || 0) },
      ];
    }
    return [];
  }, [
    activeSection,
    assetCenter?.transfers?.pagination?.total,
    assetCenter?.walletDesk?.pagination?.total,
    assetCenter?.withdrawals?.pagination?.total,
    binaryCenter?.summary?.activeTradesCount,
    binaryCenter?.summary?.todayTradesCount,
    binaryCenter?.summary?.totalTrades,
    depositCenter?.stats?.approvedRequests,
    depositCenter?.stats?.pendingRequests,
    depositCenter?.stats?.totalAssets,
    kycQueue?.stats?.authenticatedKycRequests,
    kycQueue?.stats?.pendingKycRequests,
    kycQueue?.stats?.rejectedKycRequests,
    lumCenter?.summary?.activeInvestments,
    lumCenter?.summary?.pendingInvestments,
    lumCenter?.summary?.totalPlans,
    supportCenter?.summary?.pendingAdminTickets,
    supportCenter?.summary?.totalTickets,
    supportCenter?.summary?.unreadForAdmin,
    transactionCenter?.summary?.openSpotOrders,
    transactionCenter?.summary?.totalConvertOrders,
    transactionCenter?.summary?.totalSpotOrders,
    userDirectory?.stats?.activeUsers,
    userDirectory?.stats?.pendingVerifications,
    userDirectory?.stats?.totalUsers,
  ]);

  const renderDashboard = () => (
    <>
      <section className="adminx-approval-board">
        <article className="adminx-approval-hero">
          <div>
            <p className="adminx-approval-kicker">Approval Command Center</p>
            <h2>{formatCompactNumber(dashboard.approvals?.totalPendingApprovals || 0)} pending actions</h2>
            <span>Live queue for deposits, KYC reviews, and support approvals.</span>
          </div>
          <div className="adminx-approval-hero-actions">
            <button type="button" className="btn btn-primary" onClick={() => onSectionChange("depositCenter")}>
              Review Deposits
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onSectionChange("kycReview")}>
              Open KYC Desk
            </button>
          </div>
        </article>

        <div className="adminx-approval-summary-grid">
          <article className="adminx-approval-summary-card">
            <small>Pending Deposit Approvals</small>
            <strong>{formatCompactNumber(dashboard.approvals?.pendingDepositRequests || 0)}</strong>
            <button type="button" onClick={() => onSectionChange("depositCenter")}>Go to Deposit Desk</button>
          </article>
          <article className="adminx-approval-summary-card">
            <small>Pending KYC Reviews</small>
            <strong>{formatCompactNumber(dashboard.approvals?.pendingKycRequests || 0)}</strong>
            <button type="button" onClick={() => onSectionChange("kycReview")}>Open KYC Queue</button>
          </article>
          <article className="adminx-approval-summary-card">
            <small>Support Pending / Unread</small>
            <strong>
              {formatCompactNumber(dashboard.approvals?.pendingSupportTickets || 0)} / {formatCompactNumber(dashboard.approvals?.unreadSupport || 0)}
            </strong>
            <button type="button" onClick={() => onSectionChange("supportCenter")}>Support Inbox</button>
          </article>
        </div>

        <div className="adminx-approval-feed">
          {(Array.isArray(dashboard.approvals?.items) ? dashboard.approvals.items : []).length ? (
            (dashboard.approvals.items || []).map((item) => (
              <article key={item.id} className="adminx-approval-item">
                <div>
                  <small>{item.type}</small>
                  <strong>{item.title}</strong>
                  <p>{item.subtitle}</p>
                </div>
                <button type="button" className="adminx-filter-btn" onClick={() => onSectionChange(item.route)}>
                  Open
                </button>
              </article>
            ))
          ) : (
            <article className="adminx-approval-item adminx-approval-item-empty">
              <div>
                <small>All Clear</small>
                <strong>No pending approvals right now.</strong>
                <p>Incoming approval queues will appear here automatically.</p>
              </div>
            </article>
          )}
        </div>
      </section>

      <section className="adminx-kpi-grid">
        {dashboard.metrics.map((metric) => (
          <article key={metric.key} className="adminx-kpi-card">
            <div className="adminx-kpi-top">
              <span className={`adminx-kpi-icon ${metric.tone}`}>
                <i className={`fas ${metric.icon}`} />
              </span>
              <span className="adminx-kpi-growth">{metric.growth}</span>
            </div>
            <strong>{formatCompactNumber(metric.value)}</strong>
            <p>{metric.label}</p>
          </article>
        ))}
      </section>

      <section className="adminx-row adminx-row-two">
        <article className="adminx-panel">
          <div className="adminx-panel-head">
            <h2>Operations Trend</h2>
            <span>Activity over last 12 months</span>
          </div>

          <svg viewBox="0 0 560 230" className="adminx-line-chart" role="img" aria-label="operations trend chart">
            <defs>
              <linearGradient id="adminxLineFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(37,99,235,0.4)" />
                <stop offset="100%" stopColor="rgba(37,99,235,0.02)" />
              </linearGradient>
            </defs>
            <path d={`${profitPath} L560,230 L0,230 Z`} fill="url(#adminxLineFill)" />
            <path d={profitPath} stroke="#3b82f6" strokeWidth="3" fill="none" />
            <path d={costPath} stroke="#ef4444" strokeWidth="2" fill="none" />
          </svg>
        </article>

        <article className="adminx-panel">
          <div className="adminx-panel-head">
            <h2>Strategy Distribution</h2>
          </div>

          <div className="adminx-strategy-wrap">
            <div className="adminx-donut" style={{ background: `conic-gradient(${strategyGradient})` }}>
              <span />
            </div>
            <ul>
              {STATIC_STRATEGY_DISTRIBUTION.map((item) => (
                <li key={item.name}>
                  <b style={{ background: item.color }} />
                  <span>{item.name}</span>
                  <strong>{item.value}%</strong>
                </li>
              ))}
            </ul>
          </div>
        </article>
      </section>

      <section className="adminx-row adminx-row-three">
        <article className="adminx-panel adminx-health-panel">
          <div className="adminx-panel-head">
            <h2>Platform Health</h2>
          </div>

          <div className="adminx-health-list">
            <p><span>System Uptime</span><strong>{dashboard.health.uptime}%</strong></p>
            <p><span>Admin API Success</span><strong>{dashboard.health.apiSuccessRate}%</strong></p>
            <p><span>Avg. Latency</span><strong>{dashboard.health.latencyMs}ms</strong></p>
            <p><span>Error Rate</span><strong>{dashboard.health.errorRate}%</strong></p>
            <p><span>Authenticated Users</span><strong>{formatCompactNumber(dashboard.health.activeSessions)}</strong></p>
          </div>
        </article>

        <article className="adminx-panel">
          <div className="adminx-panel-head">
            <h2>Bot Performance</h2>
            <span>Top 5 bots by profit</span>
          </div>

          <div className="adminx-bar-chart">
            {STATIC_BOT_PERFORMANCE.map((item) => (
              <div key={item.bot} className="adminx-bar-group">
                <div className="adminx-bars">
                  <span style={{ height: `${Math.max(18, item.profit / 280)}px` }} className="profit" />
                  <span style={{ height: `${Math.max(10, item.loss / 220)}px` }} className="loss" />
                </div>
                <small>{item.bot}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="adminx-panel">
          <div className="adminx-panel-head">
            <h2>Activity Feed</h2>
            <span className="adminx-live">Live</span>
          </div>

          <div className="adminx-activity-list">
            {activityFeed.map((item) => (
              <article key={item.id}>
                <p>{item.text}</p>
                <small>{item.at || formatRelativeTime(item.timestamp)}</small>
              </article>
            ))}
          </div>
        </article>
      </section>
    </>
  );

  const renderPlaceholder = () => (
    <section className="adminx-empty-state">
      <h2>{pageTitle}</h2>
      <p>This section is ready. You can add functional controls in the next prompt.</p>
      <button type="button" className="btn btn-primary" onClick={() => onSectionChange("dashboard")}>Go to Dashboard</button>
    </section>
  );

  return (
    <main className="adminx-dashboard-shell">
      <aside className={`adminx-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="adminx-logo">
          <span className="adminx-logo-icon">
            <i className="fas fa-bolt" />
          </span>
          <div>
            <strong>CryptoBot</strong>
            <small>Admin Platform</small>
          </div>
        </div>

        <nav className="adminx-nav" aria-label="Admin sections">
          {ADMIN_SIDEBAR_ITEMS.map((item) => (
            <button
              type="button"
              key={item.key}
              className={activeSection === item.key ? "active" : ""}
              onClick={() => {
                onSectionChange(item.key);
                setSidebarOpen(false);
              }}
            >
              <i className={`fas ${item.icon}`} />
              <span>{item.label}</span>
              {navBadges[item.key] ? <small className="adminx-nav-badge">{navBadges[item.key]}</small> : null}
            </button>
          ))}
        </nav>

        <button type="button" className="adminx-collapse-btn" onClick={onBackHome}>
          <i className="fas fa-arrow-left" /> Back to Website
        </button>
      </aside>

      <section className="adminx-main">
        <header className="adminx-header">
          <div>
            <button type="button" className="adminx-mobile-nav-btn" onClick={() => setSidebarOpen((prev) => !prev)}>
              <i className={`fas ${sidebarOpen ? "fa-xmark" : "fa-bars"}`} /> Menu
            </button>
            <h1>{pageTitle}</h1>
            <p>{formatDateHeading()}</p>
          </div>

          <div className="adminx-header-right">
            <label className="adminx-search">
              <i className="fas fa-search" />
              <input
                type="text"
                aria-label={`${pageTitle} search`}
                placeholder={
                  isSearchEnabled
                    ? activeSection === "users"
                    ? "Search users..."
                    : activeSection === "kycReview"
                      ? "Search KYC requests..."
                    : activeSection === "depositCenter"
                      ? "Search assets, requests, users..."
                    : activeSection === "lumCenter"
                        ? "Search LUM plans or investments..."
                      : activeSection === "binaryCenter"
                        ? "Search binary pairs, rules, trades..."
                      : activeSection === "transactionCenter"
                        ? "Search transaction pairs, orders, logs..."
                      : activeSection === "assetCenter"
                        ? "Search wallets, withdrawals, transfers..."
                      : activeSection === "supportCenter"
                        ? "Search support tickets, user, subjects..."
                        : "Search records..."
                    : "Search is available in data sections"
                }
                value={isSearchEnabled ? adminSearch : ""}
                onChange={(event) => {
                  if (isSearchEnabled) {
                    setAdminSearch(event.target.value);
                  }
                }}
                readOnly={!isSearchEnabled}
              />
            </label>

            <button type="button" className="adminx-icon-btn" onClick={onRefresh} title="Refresh page data" aria-label="Refresh page data">
              <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} />
            </button>
            <button type="button" className="adminx-icon-btn" onClick={() => setShowProfile(true)} title="Admin profile" aria-label="Open admin profile">
              <i className="fas fa-user" />
            </button>
            <button type="button" className="adminx-icon-btn" onClick={onLogout} title="Logout" aria-label="Logout">
              <i className="fas fa-right-from-bracket" />
            </button>

            <button type="button" className="adminx-profile-pill" onClick={() => setShowProfile(true)}>
              <span>{String(adminUser?.name || "SA").trim().slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{adminUser?.name || "Super Admin"}</strong>
                <small>{adminUser?.email || "Platform Owner"}</small>
              </div>
            </button>
          </div>
        </header>

        {error ? <p className="adminx-error">{error}</p> : null}
        {activeSection === "dashboard" ? (
          <AdminSectionIntro
            icon={sectionMeta.icon}
            title={sectionMeta.title}
            description={sectionMeta.description}
            stats={sectionStats}
          />
        ) : null}

        {activeSection === "dashboard" ? renderDashboard() : null}
        {activeSection === "users" ? (
          <UserManagementPage
            users={Array.isArray(userDirectory?.users) ? userDirectory.users : []}
            userStats={userDirectory?.stats || {}}
            loading={loading}
            searchValue={adminSearch}
            onSearchChange={setAdminSearch}
            onRefresh={onRefresh}
            onFetchUserDetail={onFetchUserDetail}
            onUpdateUser={onUpdateUser}
            onDeleteUser={onDeleteUser}
          />
        ) : null}
        {activeSection === "kycReview" ? (
          <KycReviewPage
            requests={Array.isArray(kycQueue?.requests) ? kycQueue.requests : []}
            stats={kycQueue?.stats || {}}
            loading={loading}
            searchValue={adminSearch}
            onSearchChange={setAdminSearch}
            onRefresh={onRefresh}
            onReviewRequest={onReviewKycRequest}
          />
        ) : null}
        {activeSection === "depositCenter" ? (
          <DepositManagementPage
            assets={Array.isArray(depositCenter?.assets) ? depositCenter.assets : []}
            requests={Array.isArray(depositCenter?.requests) ? depositCenter.requests : []}
            stats={depositCenter?.stats || {}}
            loading={loading}
            searchValue={adminSearch}
            onSearchChange={setAdminSearch}
            onRefresh={onRefresh}
            onUpsertAsset={onUpsertDepositAsset}
            onDeleteAsset={onDeleteDepositAsset}
            onReviewRequest={onReviewDepositRequest}
          />
        ) : null}
        {activeSection === "lumCenter" ? (
          <LUMManagementPage
            summary={lumCenter?.summary || {}}
            plans={Array.isArray(lumCenter?.plans) ? lumCenter.plans : []}
            investments={Array.isArray(lumCenter?.investments) ? lumCenter.investments : []}
            loading={loading}
            searchValue={adminSearch}
            onSearchChange={setAdminSearch}
            onRefresh={onRefresh}
            onCreatePlan={onCreateLumPlan}
            onUpdatePlan={onUpdateLumPlan}
            onDeletePlan={onDeleteLumPlan}
            onTogglePlanStatus={onToggleLumPlanStatus}
            onSaveContent={onSaveLumPlanContent}
            onReviewInvestment={onReviewLumInvestment}
            onForceSettleInvestment={onForceSettleLumInvestment}
          />
        ) : null}
        {activeSection === "binaryCenter" ? (
          <BinaryManagementPage
            summary={binaryCenter?.summary || {}}
            pairs={Array.isArray(binaryCenter?.pairs) ? binaryCenter.pairs : []}
            rules={Array.isArray(binaryCenter?.rules) ? binaryCenter.rules : []}
            trades={Array.isArray(binaryCenter?.trades) ? binaryCenter.trades : []}
            settings={binaryCenter?.settings || {}}
            loading={loading}
            searchValue={adminSearch}
            onSearchChange={setAdminSearch}
            onRefresh={onRefresh}
            onCreatePair={onCreateBinaryPair}
            onUpdatePair={onUpdateBinaryPair}
            onDeletePair={onDeleteBinaryPair}
            onTogglePairStatus={onToggleBinaryPairStatus}
            onSavePeriodRule={onSaveBinaryPeriodRule}
            onSettleTrade={onSettleBinaryTrade}
            onCancelTrade={onCancelBinaryTrade}
            onSaveEngineSettings={onSaveBinaryEngineSettings}
            onPushManualTick={onPushBinaryManualTick}
          />
        ) : null}
        {activeSection === "transactionCenter" ? (
          <TransactionManagementPage
            summary={transactionCenter?.summary || {}}
            settings={transactionCenter?.settings || {}}
            convertPairs={Array.isArray(transactionCenter?.convertPairs) ? transactionCenter.convertPairs : []}
            convertOrders={Array.isArray(transactionCenter?.convertOrders) ? transactionCenter.convertOrders : []}
            spotPairs={Array.isArray(transactionCenter?.spotPairs) ? transactionCenter.spotPairs : []}
            spotOrders={Array.isArray(transactionCenter?.spotOrders) ? transactionCenter.spotOrders : []}
            auditLogs={Array.isArray(transactionCenter?.auditLogs) ? transactionCenter.auditLogs : []}
            loading={loading}
            searchValue={adminSearch}
            onSearchChange={setAdminSearch}
            onRefresh={onRefresh}
            onSaveEngineSettings={onSaveTransactionEngineSettings}
            onCreateConvertPair={onCreateTransactionConvertPair}
            onUpdateConvertPair={onUpdateTransactionConvertPair}
            onDeleteConvertPair={onDeleteTransactionConvertPair}
            onToggleConvertPairStatus={onToggleTransactionConvertPairStatus}
            onPushConvertManualRate={onPushTransactionConvertManualRate}
            onCreateSpotPair={onCreateTransactionSpotPair}
            onUpdateSpotPair={onUpdateTransactionSpotPair}
            onDeleteSpotPair={onDeleteTransactionSpotPair}
            onToggleSpotPairStatus={onToggleTransactionSpotPairStatus}
            onCancelSpotOrder={onCancelTransactionSpotOrder}
            onForceFillSpotOrder={onForceFillTransactionSpotOrder}
            onPushSpotManualTick={onPushTransactionSpotManualTick}
            onSaveSpotFeedSettings={onSaveTransactionSpotFeedSettings}
          />
        ) : null}
        {activeSection === "assetCenter" ? (
          <AssetManagementPage
            dashboardSummary={assetCenter?.dashboardSummary || {}}
            walletDesk={assetCenter?.walletDesk || {}}
            walletDetail={assetCenter?.walletDetail || {}}
            withdrawals={assetCenter?.withdrawals || {}}
            transfers={assetCenter?.transfers || {}}
            conversions={assetCenter?.conversions || {}}
            settings={assetCenter?.settings || {}}
            auditLogs={assetCenter?.auditLogs || {}}
            loading={loading}
            searchValue={adminSearch}
            onSearchChange={setAdminSearch}
            onRefresh={onRefresh}
            onLoadWalletDetail={onLoadAssetWalletDetail}
            onAdjustWallet={onAdjustAssetWallet}
            onFreezeWallet={onFreezeAssetWallet}
            onReviewWithdrawal={onReviewAssetWithdrawal}
            onCompleteWithdrawal={onCompleteAssetWithdrawal}
            onSaveSettings={onSaveAssetSettings}
          />
        ) : null}
        {activeSection === "supportCenter" ? (
          <SupportManagementPage
            summary={supportCenter?.summary || {}}
            tickets={supportCenter?.tickets || {}}
            ticketDetail={supportCenter?.ticketDetail || {}}
            auditLogs={supportCenter?.auditLogs || {}}
            loading={loading}
            searchValue={adminSearch}
            onSearchChange={setAdminSearch}
            onRefresh={onRefresh}
            onLoadTicketDetail={onLoadSupportTicketDetail}
            onReplyTicket={onReplySupportTicket}
            onUpdateTicket={onUpdateSupportTicket}
            adminUser={adminUser}
          />
        ) : null}
        {activeSection !== "dashboard" &&
        activeSection !== "users" &&
        activeSection !== "kycReview" &&
        activeSection !== "depositCenter" &&
        activeSection !== "lumCenter" &&
        activeSection !== "binaryCenter" &&
        activeSection !== "transactionCenter" &&
        activeSection !== "assetCenter" &&
        activeSection !== "supportCenter"
          ? renderPlaceholder()
          : null}
      </section>

      {showProfile ? (
        <div className="adminx-modal-backdrop" onClick={() => setShowProfile(false)}>
          <section className="adminx-profile-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Admin Profile</h2>
              <button type="button" className="adminx-icon-btn" onClick={() => setShowProfile(false)} title="Close profile">
                <i className="fas fa-xmark" />
              </button>
            </header>

            <div className="adminx-profile-meta">
              <span className="adminx-profile-avatar">{getInitials(adminUser?.name)}</span>
              <div>
                <strong>{adminUser?.name || "Super Admin"}</strong>
                <small>{adminUser?.email || "-"}</small>
              </div>
            </div>

            <div className="adminx-profile-grid">
              <p><span>User ID</span><strong>{adminUser?.userId || "-"}</strong></p>
              <p><span>Role</span><strong>{formatRoleLabel(adminUser?.accountRole || "admin")}</strong></p>
              <p><span>Status</span><strong>{formatStatusLabel(adminUser?.accountStatus || "active")}</strong></p>
              <p><span>Phone</span><strong>{adminUser?.mobile || "-"}</strong></p>
              <p><span>KYC</span><strong>{formatKycLabel(adminUser?.kycStatus || "authenticated")}</strong></p>
              <p><span>Created</span><strong>{adminUser?.createdAt ? new Date(adminUser.createdAt).toLocaleString() : "-"}</strong></p>
            </div>

            <div className="adminx-profile-actions">
              <button type="button" className="btn btn-ghost" onClick={onOpenUserAuth}>Open User Auth</button>
              <button type="button" className="btn btn-primary" onClick={() => setShowProfile(false)}>Done</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
