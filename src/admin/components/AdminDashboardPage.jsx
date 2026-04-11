import { useMemo, useState } from "react";
import {
  ADMIN_SIDEBAR_ITEMS,
  DEFAULT_ACTIVITY_FEED,
  STATIC_BOT_PERFORMANCE,
  STATIC_STRATEGY_DISTRIBUTION,
} from "../constants";
import { formatCompactNumber, formatDateHeading, formatRelativeTime } from "../utils/format";
import UserManagementPage from "./UserManagementPage";
import KycReviewPage from "./KycReviewPage";
import DepositManagementPage from "./DepositManagementPage";
import LUMManagementPage from "./LUMManagementPage";
import BinaryManagementPage from "./BinaryManagementPage";

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
  activeSection,
  onSectionChange,
  onRefresh,
  onLogout,
  onBackHome,
  onOpenUserAuth,
  onFetchUserDetail,
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
}) {
  const [showProfile, setShowProfile] = useState(false);
  const [adminSearch, setAdminSearch] = useState("");

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

  const pageTitle =
    activeSection === "users"
      ? "User Management"
      : activeSection === "kycReview"
        ? "KYC Review & Approvals"
      : activeSection === "depositCenter"
        ? "Deposit Management"
      : activeSection === "lumCenter"
        ? "LUM Management"
      : activeSection === "binaryCenter"
        ? "Binary Management"
      : activeSection === "dashboard"
        ? "Dashboard Overview"
        : "Admin Workspace";

  const renderDashboard = () => (
    <>
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
      <aside className="adminx-sidebar">
        <div className="adminx-logo">
          <span className="adminx-logo-icon">
            <i className="fas fa-bolt" />
          </span>
          <div>
            <strong>CryptoBot</strong>
            <small>Admin Platform</small>
          </div>
        </div>

        <nav className="adminx-nav">
          {ADMIN_SIDEBAR_ITEMS.map((item) => (
            <button
              type="button"
              key={item.key}
              className={activeSection === item.key ? "active" : ""}
              onClick={() => onSectionChange(item.key)}
            >
              <i className={`fas ${item.icon}`} />
              <span>{item.label}</span>
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
            <h1>{pageTitle}</h1>
            <p>{formatDateHeading()}</p>
          </div>

          <div className="adminx-header-right">
            <label className="adminx-search">
              <i className="fas fa-search" />
              <input
                type="text"
                placeholder={
                  activeSection === "users"
                    ? "Search users..."
                    : activeSection === "kycReview"
                      ? "Search KYC requests..."
                    : activeSection === "depositCenter"
                      ? "Search assets, requests, users..."
                    : activeSection === "lumCenter"
                        ? "Search LUM plans or investments..."
                      : activeSection === "binaryCenter"
                        ? "Search binary pairs, rules, trades..."
                      : "Search users, bots, trades..."
                }
                value={
                  activeSection === "users" ||
                  activeSection === "kycReview" ||
                  activeSection === "depositCenter" ||
                  activeSection === "lumCenter" ||
                  activeSection === "binaryCenter"
                    ? adminSearch
                    : ""
                }
                onChange={(event) => {
                  if (
                    activeSection === "users" ||
                    activeSection === "kycReview" ||
                    activeSection === "depositCenter" ||
                    activeSection === "lumCenter" ||
                    activeSection === "binaryCenter"
                  ) {
                    setAdminSearch(event.target.value);
                  }
                }}
                readOnly={
                  activeSection !== "users" &&
                  activeSection !== "kycReview" &&
                  activeSection !== "depositCenter" &&
                  activeSection !== "lumCenter" &&
                  activeSection !== "binaryCenter"
                }
              />
            </label>

            <button type="button" className="adminx-icon-btn" onClick={onRefresh} title="Refresh page data">
              <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} />
            </button>
            <button type="button" className="adminx-icon-btn" onClick={() => setShowProfile(true)} title="Admin profile">
              <i className="fas fa-user" />
            </button>
            <button type="button" className="adminx-icon-btn" onClick={onLogout} title="Logout">
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
        {activeSection !== "dashboard" &&
        activeSection !== "users" &&
        activeSection !== "kycReview" &&
        activeSection !== "depositCenter" &&
        activeSection !== "lumCenter" &&
        activeSection !== "binaryCenter"
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
