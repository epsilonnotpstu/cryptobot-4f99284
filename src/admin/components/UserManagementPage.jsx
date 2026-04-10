import { useMemo, useState } from "react";
import { USER_MANAGEMENT_TABS } from "../constants";
import { formatCompactNumber } from "../utils/format";

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatUsd(value = 0) {
  return `$${toNumber(value, 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
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
  const normalized = normalizeText(role).replace(/_/g, " ");
  if (!normalized) {
    return "Trader";
  }
  return normalized
    .split(" ")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function formatStatusLabel(status = "") {
  const normalized = normalizeText(status);
  if (!normalized) {
    return "Active";
  }
  return normalized[0].toUpperCase() + normalized.slice(1);
}

function getKycStageMeta(stage = "") {
  const normalized = normalizeText(stage);
  if (normalized === "authenticated") {
    return {
      label: "Authenticated",
      className: "authenticated",
    };
  }
  if (normalized === "submitted_pending") {
    return {
      label: "Submitted - Pending",
      className: "submitted_pending",
    };
  }
  return {
    label: "Not Submitted",
    className: "not_submitted",
  };
}

function buildDisplayUserId(user, index) {
  const rawUserId = String(user?.userId || "").trim();
  if (rawUserId) {
    if (/^usr-/i.test(rawUserId)) {
      return rawUserId.toUpperCase();
    }
    if (/^\d+$/.test(rawUserId)) {
      return `USR-${rawUserId}`;
    }
    return rawUserId;
  }
  return `USR-${String(index + 1).padStart(3, "0")}`;
}

function formatTime(value = "") {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

export default function UserManagementPage({
  users,
  userStats,
  loading,
  searchValue,
  onSearchChange,
  onRefresh,
  onFetchUserDetail,
  onDeleteUser,
}) {
  const [userTab, setUserTab] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [kycFilter, setKycFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailPayload, setDetailPayload] = useState(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [actionNotice, setActionNotice] = useState("");
  const [actionError, setActionError] = useState("");

  const filteredUsers = useMemo(() => {
    const keyword = normalizeText(searchValue);

    return users.filter((user) => {
      const accountStatus = normalizeText(user.accountStatus);
      const kycStage = normalizeText(user.kycStage);
      const isActiveSession = Boolean(user.isActiveSession);

      const tabMatch = (() => {
        if (userTab === "active") {
          return isActiveSession;
        }
        if (userTab === "suspended") {
          return accountStatus === "suspended" || accountStatus === "banned";
        }
        if (userTab === "pendingKyc") {
          return kycStage === "submitted_pending";
        }
        return true;
      })();

      if (!tabMatch) {
        return false;
      }

      if (statusFilter !== "all") {
        if (statusFilter === "suspended") {
          if (accountStatus !== "suspended" && accountStatus !== "banned") {
            return false;
          }
        } else if (accountStatus !== statusFilter) {
          return false;
        }
      }

      if (kycFilter !== "all" && kycStage !== kycFilter) {
        return false;
      }

      if (activityFilter === "online" && !isActiveSession) {
        return false;
      }
      if (activityFilter === "offline" && isActiveSession) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [user.userId, user.name, user.email]
        .map((value) => normalizeText(value))
        .some((value) => value.includes(keyword));
    });
  }, [activityFilter, kycFilter, searchValue, statusFilter, userTab, users]);

  const openUserDetail = async (user) => {
    const userId = String(user?.userId || "").trim();
    if (!userId) {
      return;
    }

    setDetailModalOpen(true);
    setDetailLoading(true);
    setDetailError("");
    setDetailPayload(null);

    try {
      const data = await onFetchUserDetail(userId);
      setDetailPayload(data || null);
    } catch (error) {
      setDetailError(error.message || "Could not load user details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const requestDeleteUser = (user) => {
    setActionError("");
    setActionNotice("");
    setDeleteTarget(user || null);
    setDeleteModalOpen(true);
  };

  const confirmDeleteUser = async () => {
    const userId = String(deleteTarget?.userId || "").trim();
    if (!userId) {
      return;
    }

    setDeleteSubmitting(true);
    setActionError("");
    setActionNotice("");
    try {
      await onDeleteUser(userId);
      setActionNotice(`User ${deleteTarget?.email || userId} removed successfully.`);
      if (detailPayload?.user?.userId === userId) {
        setDetailModalOpen(false);
        setDetailPayload(null);
      }
      setDeleteModalOpen(false);
      setDeleteTarget(null);
    } catch (error) {
      setActionError(error.message || "Could not delete user.");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const detailUser = detailPayload?.user || null;
  const detailWallet = detailPayload?.wallet || { balances: [] };
  const detailHistory = detailPayload?.history || { kyc: [], deposit: [] };

  return (
    <section className="adminx-users-shell">
      <div className="adminx-user-tabs" role="tablist" aria-label="User filters">
        {USER_MANAGEMENT_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={userTab === tab.key}
            className={userTab === tab.key ? "active" : ""}
            onClick={() => setUserTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="adminx-user-table-card">
        <div className="adminx-user-toolbar">
          <label className="adminx-user-search">
            <i className="fas fa-search" />
            <input
              type="text"
              placeholder="Search by name, email, or user ID..."
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </label>

          <div className="adminx-user-toolbar-actions">
            <button type="button" className="adminx-filter-btn" onClick={() => setFilterOpen((prev) => !prev)}>
              <i className="fas fa-filter" /> Filter
            </button>
            <button type="button" className="adminx-filter-btn" onClick={onRefresh}>
              <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} /> Refresh
            </button>
          </div>

          <span className="adminx-user-count">{filteredUsers.length} users</span>
        </div>

        {filterOpen ? (
          <div className="adminx-filter-panel">
            <label>
              Account Status
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended/Banned</option>
                <option value="banned">Banned</option>
              </select>
            </label>

            <label>
              KYC State
              <select value={kycFilter} onChange={(event) => setKycFilter(event.target.value)}>
                <option value="all">All</option>
                <option value="not_submitted">Not Submitted</option>
                <option value="submitted_pending">Submitted - Pending</option>
                <option value="authenticated">Authenticated</option>
              </select>
            </label>

            <label>
              Activity
              <select value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)}>
                <option value="all">All</option>
                <option value="online">Active Session</option>
                <option value="offline">Offline</option>
              </select>
            </label>
          </div>
        ) : null}

        {actionNotice ? <p className="adminx-auth-notice adminx-inline-feedback">{actionNotice}</p> : null}
        {actionError ? <p className="adminx-auth-error adminx-inline-feedback">{actionError}</p> : null}

        <div className="adminx-user-table-wrap">
          <table className="adminx-user-table">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" aria-label="Select all users" />
                </th>
                <th>User ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Balance</th>
                <th>KYC</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user, index) => {
                const kycMeta = getKycStageMeta(user.kycStage);
                const statusClass = normalizeText(user.accountStatus);

                return (
                  <tr key={user.userId || `${user.email}-${index}`}>
                    <td>
                      <input type="checkbox" aria-label={`Select ${user.name || user.email}`} />
                    </td>
                    <td>{buildDisplayUserId(user, index)}</td>
                    <td>
                      <div className="adminx-user-cell-name">
                        <span className="adminx-user-avatar">{getInitials(user.name)}</span>
                        <span>{user.name || "Unknown User"}</span>
                      </div>
                    </td>
                    <td>{user.email || "-"}</td>
                    <td>{formatUsd(user.totalBalanceUsd)}</td>
                    <td>
                      <span className={`adminx-tag adminx-tag-kyc-${kycMeta.className}`}>{kycMeta.label}</span>
                    </td>
                    <td>
                      <span className="adminx-tag adminx-tag-role">{formatRoleLabel(user.accountRole)}</span>
                    </td>
                    <td>
                      <span className={`adminx-tag adminx-tag-status-${statusClass}`}>{formatStatusLabel(user.accountStatus)}</span>
                      {user.isActiveSession ? <span className="adminx-tag adminx-tag-session">Online</span> : null}
                    </td>
                    <td>
                      <div className="adminx-row-actions">
                        <button type="button" title="View user details" onClick={() => openUserDetail(user)}>
                          <i className="fas fa-eye" />
                        </button>
                        <button type="button" title="Delete user" onClick={() => requestDeleteUser(user)}>
                          <i className="fas fa-trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!filteredUsers.length ? (
            <div className="adminx-users-empty">
              <p>No users found for this search/filter.</p>
            </div>
          ) : null}
        </div>

        <footer className="adminx-user-footer">
          <span>
            Showing {filteredUsers.length} of {users.length} users
          </span>
          <span>Total platform users: {formatCompactNumber(userStats.totalUsers || users.length)}</span>
          <span>Active now: {formatCompactNumber(userStats.activeUsers || 0)}</span>
        </footer>
      </section>

      {detailModalOpen ? (
        <div className="adminx-modal-backdrop" onClick={() => setDetailModalOpen(false)}>
          <section className="adminx-profile-modal adminx-user-detail-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>User Details</h2>
              <button type="button" className="adminx-icon-btn" onClick={() => setDetailModalOpen(false)} title="Close">
                <i className="fas fa-xmark" />
              </button>
            </header>

            {detailLoading ? <p className="adminx-page-note">Loading user data...</p> : null}
            {detailError ? <p className="adminx-auth-error">{detailError}</p> : null}

            {detailUser && !detailLoading ? (
              <>
                <div className="adminx-profile-meta">
                  <span className="adminx-profile-avatar">{getInitials(detailUser.name)}</span>
                  <div>
                    <strong>{detailUser.name || "Unknown User"}</strong>
                    <small>{detailUser.email || "-"}</small>
                  </div>
                </div>

                <div className="adminx-profile-grid adminx-user-detail-grid">
                  <p><span>User ID</span><strong>{detailUser.userId || "-"}</strong></p>
                  <p><span>First Name</span><strong>{detailUser.firstName || "-"}</strong></p>
                  <p><span>Last Name</span><strong>{detailUser.lastName || "-"}</strong></p>
                  <p><span>Phone</span><strong>{detailUser.mobile || "-"}</strong></p>
                  <p><span>Role</span><strong>{formatRoleLabel(detailUser.accountRole)}</strong></p>
                  <p><span>Status</span><strong>{formatStatusLabel(detailUser.accountStatus)}</strong></p>
                  <p><span>KYC Stage</span><strong>{getKycStageMeta(detailUser.kycStage).label}</strong></p>
                  <p><span>KYC Status</span><strong>{formatStatusLabel(detailUser.kycStatus)}</strong></p>
                  <p><span>Auth Tag</span><strong>{detailUser.authTag || "-"}</strong></p>
                  <p><span>KYC Submissions</span><strong>{toNumber(detailUser.kycSubmissionCount, 0)}</strong></p>
                  <p><span>Session</span><strong>{detailUser.isActiveSession ? "Active" : "Offline"}</strong></p>
                  <p><span>Created</span><strong>{formatTime(detailUser.createdAt)}</strong></p>
                  <p><span>KYC Updated</span><strong>{formatTime(detailUser.kycUpdatedAt)}</strong></p>
                  <p><span>Total Balance</span><strong>{formatUsd(detailUser.totalBalanceUsd)}</strong></p>
                </div>

                <section className="adminx-detail-section">
                  <h3>Wallet</h3>
                  <p className="adminx-page-note">Total Spot Assets: {formatUsd(detailWallet?.totalSpotAssetsUsd || 0)}</p>
                  <div className="adminx-simple-table-wrap">
                    <table className="adminx-simple-table">
                      <thead>
                        <tr>
                          <th>Asset</th>
                          <th>Name</th>
                          <th>Amount (USD)</th>
                          <th>Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detailWallet?.balances || []).map((item) => (
                          <tr key={`${item.symbol}-${item.updatedAt}`}>
                            <td>{item.symbol}</td>
                            <td>{item.name}</td>
                            <td>{formatUsd(item.totalUsd)}</td>
                            <td>{formatTime(item.updatedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!detailWallet?.balances?.length ? <p className="adminx-page-note">No wallet balances.</p> : null}
                  </div>
                </section>

                <section className="adminx-detail-section">
                  <h3>KYC History</h3>
                  <div className="adminx-simple-table-wrap">
                    <table className="adminx-simple-table">
                      <thead>
                        <tr>
                          <th>Request</th>
                          <th>Certification</th>
                          <th>Status</th>
                          <th>Submitted</th>
                          <th>Reviewed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detailHistory?.kyc || []).map((item) => (
                          <tr key={item.requestId}>
                            <td>{item.requestId}</td>
                            <td>{item.certification || "-"}</td>
                            <td>{formatStatusLabel(item.status)}</td>
                            <td>{formatTime(item.submittedAt)}</td>
                            <td>{formatTime(item.reviewedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!detailHistory?.kyc?.length ? <p className="adminx-page-note">No KYC history.</p> : null}
                  </div>
                </section>

                <section className="adminx-detail-section">
                  <h3>Deposit History</h3>
                  <div className="adminx-simple-table-wrap">
                    <table className="adminx-simple-table">
                      <thead>
                        <tr>
                          <th>Request</th>
                          <th>Asset</th>
                          <th>Amount</th>
                          <th>Status</th>
                          <th>Submitted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detailHistory?.deposit || []).map((item) => (
                          <tr key={item.requestId}>
                            <td>{item.requestId}</td>
                            <td>{item.assetSymbol}</td>
                            <td>{formatUsd(item.amountUsd)}</td>
                            <td>{formatStatusLabel(item.status)}</td>
                            <td>{formatTime(item.submittedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!detailHistory?.deposit?.length ? <p className="adminx-page-note">No deposit history.</p> : null}
                  </div>
                </section>
              </>
            ) : null}
          </section>
        </div>
      ) : null}

      {deleteModalOpen ? (
        <div className="adminx-modal-backdrop" onClick={() => setDeleteModalOpen(false)}>
          <section className="adminx-profile-modal adminx-delete-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Delete User</h2>
              <button type="button" className="adminx-icon-btn" onClick={() => setDeleteModalOpen(false)} title="Close">
                <i className="fas fa-xmark" />
              </button>
            </header>

            <p className="adminx-page-note">
              Are you sure you want to remove <strong>{deleteTarget?.email || deleteTarget?.userId}</strong>? This action cannot be undone.
            </p>

            <div className="adminx-profile-actions">
              <button type="button" className="btn btn-ghost" disabled={deleteSubmitting} onClick={() => setDeleteModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={deleteSubmitting} onClick={confirmDeleteUser}>
                {deleteSubmitting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
