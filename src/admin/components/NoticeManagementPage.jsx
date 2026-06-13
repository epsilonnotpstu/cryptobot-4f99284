import { useMemo, useState } from "react";
import { ADMIN_SECTION_META } from "../constants";
import { formatCompactNumber } from "../utils/format";
import AdminSectionIntro from "./AdminSectionIntro";

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
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

function toDateTimeLocalValue(value = "") {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getStatusClass(value = "") {
  const normalized = normalizeText(value);
  if (normalized === "active") {
    return "authenticated";
  }
  if (normalized === "critical") {
    return "rejected";
  }
  return "pending";
}

function formatModeLabel(mode = "all") {
  const normalized = normalizeText(mode);
  if (normalized === "kyc") {
    return "KYC Segment";
  }
  if (normalized === "users") {
    return "Specific Users";
  }
  if (normalized === "mixed") {
    return "Mixed";
  }
  return "All Users";
}

function formatSeverityLabel(severity = "info") {
  const normalized = normalizeText(severity);
  if (normalized === "critical") {
    return "Critical";
  }
  if (normalized === "warning") {
    return "Warning";
  }
  return "Info";
}

function buildEmptyForm() {
  return {
    noticeId: "",
    title: "",
    message: "",
    severity: "info",
    priority: "50",
    startsAt: "",
    expiresAt: "",
    isActive: true,
    isDismissible: true,
    targetMode: "all",
    targetKycStatus: "pending",
    targetUserIds: [],
  };
}

export default function NoticeManagementPage({
  notices,
  stats,
  loading,
  searchValue,
  onSearchChange,
  onRefresh,
  onCreateNotice,
  onUpdateNotice,
  onUpdateNoticeStatus,
  onQuickPublish,
  onDeleteNotice,
  userOptions,
}) {
  const [form, setForm] = useState(buildEmptyForm);
  const [noticeMessage, setNoticeMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [quickNoticeMessage, setQuickNoticeMessage] = useState("");
  const [quickPublishing, setQuickPublishing] = useState(false);
  const [userFilter, setUserFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

  const rows = Array.isArray(notices) ? notices : [];
  const users = Array.isArray(userOptions) ? userOptions : [];
  const keyword = normalizeText(searchValue);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const candidate = `${row.title || ""} ${row.message || ""} ${row.targetSummary || ""} ${row.updatedBy || ""}`.toLowerCase();
      if (keyword && !candidate.includes(keyword)) {
        return false;
      }
      if (statusFilter === "active" && !row.isActive) {
        return false;
      }
      if (statusFilter === "inactive" && row.isActive) {
        return false;
      }
      if (severityFilter !== "all" && normalizeText(row.severity) !== severityFilter) {
        return false;
      }
      return true;
    });
  }, [keyword, rows, severityFilter, statusFilter]);

  const filteredUsers = useMemo(() => {
    const key = normalizeText(userFilter);
    if (!key) {
      return users.slice(0, 80);
    }
    return users
      .filter((user) => {
        const candidate = `${user.userId || ""} ${user.email || ""} ${user.name || ""}`.toLowerCase();
        return candidate.includes(key);
      })
      .slice(0, 80);
  }, [userFilter, users]);

  const handleFormField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm(buildEmptyForm());
    setUserFilter("");
  };

  const toggleTargetUser = (userId) => {
    setForm((prev) => {
      const exists = prev.targetUserIds.includes(userId);
      const next = exists ? prev.targetUserIds.filter((value) => value !== userId) : [...prev.targetUserIds, userId];
      return {
        ...prev,
        targetUserIds: next,
      };
    });
  };

  const startEdit = (row) => {
    setError("");
    setNoticeMessage("");
    setForm({
      noticeId: String(row.noticeId || ""),
      title: String(row.title || ""),
      message: String(row.message || ""),
      severity: String(row.severity || "info"),
      priority: String(row.priority ?? "50"),
      startsAt: toDateTimeLocalValue(row.startsAt || ""),
      expiresAt: toDateTimeLocalValue(row.expiresAt || ""),
      isActive: Boolean(row.isActive),
      isDismissible: row.isDismissible !== false,
      targetMode: String(row.targetMode || "all"),
      targetKycStatus: String(row.targetKycStatus || "pending"),
      targetUserIds: Array.isArray(row.targetUserIds) ? row.targetUserIds : [],
    });
  };

  const submitNotice = async (event) => {
    event.preventDefault();
    setError("");
    setNoticeMessage("");

    if (!form.message.trim()) {
      setError("Notice message is required.");
      return;
    }

    if (form.targetMode === "users" && !form.targetUserIds.length) {
      setError("Select at least one target user.");
      return;
    }

    if (form.targetMode === "mixed" && !form.targetKycStatus && !form.targetUserIds.length) {
      setError("Mixed mode requires KYC segment or specific users.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title,
        message: form.message,
        severity: form.severity,
        priority: Number(form.priority || 50),
        startsAt: form.startsAt || "",
        expiresAt: form.expiresAt || "",
        isActive: Boolean(form.isActive),
        isDismissible: Boolean(form.isDismissible),
        targetMode: form.targetMode,
        targetKycStatus: form.targetMode === "all" || form.targetMode === "users" ? "" : form.targetKycStatus,
        targetUserIds: form.targetMode === "all" || form.targetMode === "kyc" ? [] : form.targetUserIds,
      };

      const response = form.noticeId
        ? await onUpdateNotice({
            noticeId: Number(form.noticeId),
            ...payload,
          })
        : await onCreateNotice(payload);

      setNoticeMessage(response?.message || (form.noticeId ? "Notice updated." : "Notice created."));
      resetForm();
    } catch (requestError) {
      setError(requestError.message || "Could not save notice.");
    } finally {
      setSaving(false);
    }
  };

  const deleteNotice = async (row) => {
    setError("");
    setNoticeMessage("");
    try {
      const response = await onDeleteNotice({ noticeId: row.noticeId });
      setNoticeMessage(response?.message || "Notice deleted.");
    } catch (requestError) {
      setError(requestError.message || "Could not delete notice.");
    }
  };

  const toggleStatus = async (row, nextStatus) => {
    setError("");
    setNoticeMessage("");
    try {
      const response = await onUpdateNoticeStatus({
        noticeId: row.noticeId,
        status: nextStatus,
      });
      setNoticeMessage(response?.message || "Notice status updated.");
    } catch (requestError) {
      setError(requestError.message || "Could not update notice status.");
    }
  };

  const publishQuickNotice = async () => {
    setError("");
    setNoticeMessage("");
    if (!quickNoticeMessage.trim()) {
      setError("Quick publish message is required.");
      return;
    }

    setQuickPublishing(true);
    try {
      const response = await onQuickPublish(quickNoticeMessage.trim());
      setQuickNoticeMessage("");
      setNoticeMessage(response?.message || "Quick notice published.");
    } catch (requestError) {
      setError(requestError.message || "Could not publish quick notice.");
    } finally {
      setQuickPublishing(false);
    }
  };

  return (
    <section className="adminx-users-shell adminx-notice-center">
      <AdminSectionIntro
        icon={ADMIN_SECTION_META.notifications.icon}
        title={ADMIN_SECTION_META.notifications.title}
        description={ADMIN_SECTION_META.notifications.description}
        stats={[
          { label: "Total", value: formatCompactNumber(stats?.total || rows.length) },
          { label: "Active", value: formatCompactNumber(stats?.active || rows.filter((row) => row.isActive).length) },
          { label: "Critical", value: formatCompactNumber(stats?.critical || rows.filter((row) => row.severity === "critical").length) },
        ]}
      />

      <section className="adminx-user-table-card adminx-notice-workspace">
        <div className="adminx-user-toolbar adminx-notice-toolbar">
          <label className="adminx-user-search">
            <i className="fas fa-search" />
            <input
              type="text"
              placeholder="Search notices..."
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </label>

          <div className="adminx-user-toolbar-actions">
            <button type="button" className="adminx-filter-btn" onClick={onRefresh}>
              <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} /> Refresh
            </button>
          </div>

          <span className="adminx-user-count">{filteredRows.length} notices</span>
        </div>

        <div className="adminx-notice-composer-grid">
          <form className="adminx-deposit-asset-form adminx-notice-editor" onSubmit={submitNotice}>
            <h3>{form.noticeId ? "Edit Notice" : "Create Notice"}</h3>

            <div className="adminx-deposit-grid-two">
              <label>
                Title
                <input
                  type="text"
                  value={form.title}
                  onChange={(event) => handleFormField("title", event.target.value)}
                  placeholder="System Maintenance"
                />
              </label>

              <label>
                Severity
                <select
                  value={form.severity}
                  onChange={(event) => handleFormField("severity", event.target.value)}
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
            </div>

            <label>
              Message
              <textarea
                className="adminx-notice-textarea"
                rows={4}
                value={form.message}
                onChange={(event) => handleFormField("message", event.target.value)}
                placeholder="Write the notice message shown on user dashboards..."
              />
            </label>

            <div className="adminx-deposit-grid-two">
              <label>
                Priority
                <input
                  type="number"
                  min="0"
                  max="9999"
                  value={form.priority}
                  onChange={(event) => handleFormField("priority", event.target.value)}
                />
              </label>

              <label>
                Target Mode
                <select
                  value={form.targetMode}
                  onChange={(event) => handleFormField("targetMode", event.target.value)}
                >
                  <option value="all">All Users</option>
                  <option value="kyc">KYC Segment</option>
                  <option value="users">Specific Users</option>
                  <option value="mixed">Mixed</option>
                </select>
              </label>
            </div>

            <div className="adminx-deposit-grid-two">
              <label>
                Starts At
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => handleFormField("startsAt", event.target.value)}
                />
              </label>

              <label>
                Expires At
                <input
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(event) => handleFormField("expiresAt", event.target.value)}
                />
              </label>
            </div>

            {form.targetMode === "kyc" || form.targetMode === "mixed" ? (
              <label>
                Target KYC Status
                <select
                  value={form.targetKycStatus}
                  onChange={(event) => handleFormField("targetKycStatus", event.target.value)}
                >
                  <option value="pending">Pending</option>
                  <option value="authenticated">Authenticated</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
            ) : null}

            {form.targetMode === "users" || form.targetMode === "mixed" ? (
              <div className="adminx-notice-target-users">
                <label>
                  Target Users Filter
                  <input
                    type="text"
                    value={userFilter}
                    onChange={(event) => setUserFilter(event.target.value)}
                    placeholder="Search by user ID, email, or name"
                  />
                </label>

                <div className="adminx-table-wrap adminx-notice-target-table">
                  <table className="adminx-user-table">
                    <thead>
                      <tr>
                        <th className="adminx-notice-pick-col">Pick</th>
                        <th>User</th>
                        <th>Email</th>
                        <th>ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user) => (
                        <tr key={user.userId}>
                          <td>
                            <input
                              type="checkbox"
                              checked={form.targetUserIds.includes(user.userId)}
                              onChange={() => toggleTargetUser(user.userId)}
                            />
                          </td>
                          <td>{user.name || "-"}</td>
                          <td>{user.email || "-"}</td>
                          <td>{user.userId || "-"}</td>
                        </tr>
                      ))}
                      {!filteredUsers.length ? (
                        <tr>
                          <td colSpan={4}>No matching users.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <small className="adminx-inline-note">Selected users: {form.targetUserIds.length}</small>
              </div>
            ) : null}

            <div className="adminx-deposit-grid-two">
              <label className="adminx-checkbox-row">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => handleFormField("isActive", event.target.checked)}
                />
                Active
              </label>

              <label className="adminx-checkbox-row">
                <input
                  type="checkbox"
                  checked={form.isDismissible}
                  onChange={(event) => handleFormField("isDismissible", event.target.checked)}
                />
                Dismissible
              </label>
            </div>

            <div className="adminx-user-toolbar-actions adminx-notice-editor-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving..." : form.noticeId ? "Update Notice" : "Publish Notice"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={resetForm}
                disabled={saving}
              >
                Reset
              </button>
            </div>

            {error ? <p className="adminx-error">{error}</p> : null}
            {noticeMessage ? <p className="adminx-notice">{noticeMessage}</p> : null}
          </form>

          <section className="adminx-deposit-request-panel adminx-notice-quick">
            <h3>Quick Global Publish (Legacy)</h3>
            <p className="adminx-inline-note">Publishes an immediate global notice and deactivates previous active notices.</p>
            <textarea
              className="adminx-notice-quick-textarea"
              rows={4}
              value={quickNoticeMessage}
              onChange={(event) => setQuickNoticeMessage(event.target.value)}
              placeholder="System notice message..."
            />
            <div className="adminx-user-toolbar-actions adminx-notice-quick-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={quickPublishing}
                onClick={publishQuickNotice}
              >
                {quickPublishing ? "Publishing..." : "Publish Global Notice"}
              </button>
            </div>
          </section>
        </div>
      </section>

      <section className="adminx-user-table-card adminx-notice-history">
        <div className="adminx-user-toolbar adminx-notice-history-toolbar">
          <div className="adminx-user-toolbar-actions adminx-notice-history-filters">
            <label>
              Status
              <select className="adminx-filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label>
              Severity
              <select className="adminx-filter-select" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
                <option value="all">All</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </label>
          </div>
        </div>

        <div className="adminx-table-wrap">
          <table className="adminx-user-table">
            <thead>
              <tr>
                <th>Notice</th>
                <th>Severity</th>
                <th>Priority</th>
                <th>Target</th>
                <th>Schedule</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.noticeId || `${row.message}-${row.updatedAt}`}>
                  <td>
                    <strong>{row.title || "System Notice"}</strong>
                    <small>{row.message}</small>
                  </td>
                  <td>
                    <span className={`adminx-tag adminx-tag-kyc-${getStatusClass(row.severity)}`}>{formatSeverityLabel(row.severity)}</span>
                  </td>
                  <td>{row.priority ?? "-"}</td>
                  <td>
                    <strong>{formatModeLabel(row.targetMode)}</strong>
                    <small>{row.targetSummary || "-"}</small>
                  </td>
                  <td>
                    <small>Start: {formatTime(row.startsAt)}</small>
                    <small>End: {formatTime(row.expiresAt)}</small>
                  </td>
                  <td>
                    <span className={`adminx-tag adminx-tag-kyc-${row.isActive ? "authenticated" : "pending"}`}>
                      {row.isActive ? "Active" : "Inactive"}
                    </span>
                    <small>Updated: {formatTime(row.updatedAt)}</small>
                  </td>
                  <td>
                    <div className="adminx-table-actions">
                      <button type="button" className="adminx-filter-btn" onClick={() => startEdit(row)}>
                        Edit
                      </button>
                      {row.isActive ? (
                        <button type="button" className="adminx-filter-btn" onClick={() => toggleStatus(row, "deactivate")}>
                          Deactivate
                        </button>
                      ) : (
                        <button type="button" className="adminx-filter-btn" onClick={() => toggleStatus(row, "activate")}>
                          Activate
                        </button>
                      )}
                      <button
                        type="button"
                        className="adminx-filter-btn"
                        onClick={() => deleteNotice(row)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredRows.length ? (
                <tr>
                  <td colSpan={7}>No notices found for the selected filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
