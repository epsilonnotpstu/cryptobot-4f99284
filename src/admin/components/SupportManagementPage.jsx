import { useEffect, useMemo, useState } from "react";
import { ADMIN_SECTION_META } from "../constants";
import { formatCompactNumber } from "../utils/format";
import AdminSectionIntro from "./AdminSectionIntro";

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
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
  if (["resolved", "closed"].includes(normalized)) {
    return "adminx-tag adminx-tag-kyc-authenticated";
  }
  if (["pending_admin", "open"].includes(normalized)) {
    return "adminx-tag adminx-tag-kyc-submitted_pending";
  }
  if (["pending_user"].includes(normalized)) {
    return "adminx-tag adminx-tag-role";
  }
  return "adminx-tag adminx-tag-kyc-rejected";
}

function priorityChipClass(priority = "") {
  const normalized = normalizeText(priority);
  if (normalized === "urgent") {
    return "adminx-tag adminx-tag-kyc-rejected";
  }
  if (normalized === "high") {
    return "adminx-tag adminx-tag-kyc-submitted_pending";
  }
  if (normalized === "normal") {
    return "adminx-tag adminx-tag-role";
  }
  return "adminx-tag adminx-tag-kyc-authenticated";
}

const SUPPORT_TABS = [
  { key: "overview", label: "Overview" },
  { key: "inbox", label: "Inbox" },
  { key: "audit", label: "Audit" },
];

function MetricCard({ label, value, hint = "" }) {
  return (
    <article className="adminx-kpi-card adminx-support-kpi-card">
      <strong>{value}</strong>
      <p>{label}</p>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

export default function SupportManagementPage({
  summary,
  tickets,
  ticketDetail,
  auditLogs,
  loading,
  searchValue,
  onSearchChange,
  onRefresh,
  onLoadTicketDetail,
  onReplyTicket,
  onUpdateTicket,
  adminUser,
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [showInternalNotes, setShowInternalNotes] = useState(false);
  const [selectedTicketRef, setSelectedTicketRef] = useState("");

  const [replyText, setReplyText] = useState("");
  const [internalNoteText, setInternalNoteText] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [ticketForm, setTicketForm] = useState({
    status: "open",
    priority: "normal",
    assignedAdminUserId: "",
    assignedAdminEmail: "",
    note: "",
  });

  const ticketRows = Array.isArray(tickets?.rows) ? tickets.rows : [];
  const auditRows = Array.isArray(auditLogs?.rows) ? auditLogs.rows : [];

  const keyword = normalizeText(searchValue || "");

  const filteredTickets = useMemo(() => {
    return ticketRows.filter((row) => {
      const statusMatched = statusFilter === "all" || normalizeText(row.status) === statusFilter;
      const priorityMatched = priorityFilter === "all" || normalizeText(row.priority) === priorityFilter;
      if (!statusMatched || !priorityMatched) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const bucket = `${row.ticketRef} ${row.userId} ${row.accountName} ${row.accountEmail} ${row.subject}`.toLowerCase();
      return bucket.includes(keyword);
    });
  }, [keyword, priorityFilter, statusFilter, ticketRows]);

  const filteredAuditLogs = useMemo(() => {
    if (!keyword) {
      return auditRows;
    }
    return auditRows.filter((row) => {
      const bucket = `${row.adminUserId} ${row.adminEmail} ${row.actionType} ${row.targetId} ${row.note}`.toLowerCase();
      return bucket.includes(keyword);
    });
  }, [auditRows, keyword]);

  useEffect(() => {
    if (!selectedTicketRef) {
      return;
    }
    if (!ticketRows.some((row) => row.ticketRef === selectedTicketRef)) {
      setSelectedTicketRef("");
    }
  }, [selectedTicketRef, ticketRows]);

  useEffect(() => {
    if (!ticketDetail?.ticket?.ticketRef) {
      return;
    }
    setTicketForm({
      status: String(ticketDetail.ticket.status || "open"),
      priority: String(ticketDetail.ticket.priority || "normal"),
      assignedAdminUserId: String(ticketDetail.ticket.assignedAdminUserId || ""),
      assignedAdminEmail: String(ticketDetail.ticket.assignedAdminEmail || ""),
      note: "",
    });
  }, [ticketDetail?.ticket?.ticketRef, ticketDetail?.ticket?.status, ticketDetail?.ticket?.priority, ticketDetail?.ticket?.assignedAdminUserId, ticketDetail?.ticket?.assignedAdminEmail]);

  const detailMessages = useMemo(() => {
    const rows = Array.isArray(ticketDetail?.messages) ? ticketDetail.messages : [];
    if (showInternalNotes) {
      return rows;
    }
    return rows.filter((item) => !item.isInternalNote);
  }, [showInternalNotes, ticketDetail?.messages]);

  const runAction = async (actionKey, executor) => {
    setError("");
    setNotice("");
    setBusyAction(actionKey);
    try {
      const data = await executor();
      setNotice(data?.message || "Action completed successfully.");
      return data;
    } catch (actionError) {
      setError(actionError.message || "Action failed.");
      throw actionError;
    } finally {
      setBusyAction("");
    }
  };

  const openTicket = async (ticketRef) => {
    setSelectedTicketRef(ticketRef);
    await runAction(`support.open.${ticketRef}`, async () => {
      const payload = await onLoadTicketDetail?.({ ticketRef });
      return payload || { message: "Ticket loaded." };
    });
  };

  const sendReply = async () => {
    if (!selectedTicketRef) {
      setError("Select a ticket before replying.");
      return;
    }
    if (!replyText.trim()) {
      setError("Reply message is required.");
      return;
    }

    await runAction("support.reply", async () => {
      const data = await onReplyTicket?.({
        ticketRef: selectedTicketRef,
        message: replyText,
        isInternalNote: false,
      });
      setReplyText("");
      await onLoadTicketDetail?.({ ticketRef: selectedTicketRef });
      return data;
    });
  };

  const sendInternalNote = async () => {
    if (!selectedTicketRef) {
      setError("Select a ticket before adding note.");
      return;
    }
    if (!internalNoteText.trim()) {
      setError("Internal note is required.");
      return;
    }

    await runAction("support.note", async () => {
      const data = await onReplyTicket?.({
        ticketRef: selectedTicketRef,
        message: internalNoteText,
        isInternalNote: true,
      });
      setInternalNoteText("");
      await onLoadTicketDetail?.({ ticketRef: selectedTicketRef });
      return data;
    });
  };

  const saveTicketMeta = async () => {
    if (!selectedTicketRef) {
      setError("Select a ticket before updating.");
      return;
    }

    await runAction("support.update", async () => {
      const data = await onUpdateTicket?.({
        ticketRef: selectedTicketRef,
        status: ticketForm.status,
        priority: ticketForm.priority,
        assignedAdminUserId: ticketForm.assignedAdminUserId || null,
        assignedAdminEmail: ticketForm.assignedAdminEmail || null,
        note: ticketForm.note,
      });
      await onLoadTicketDetail?.({ ticketRef: selectedTicketRef });
      await onRefresh?.();
      return data;
    });
  };

  const overviewSection = (
    <section className="adminx-panel adminx-support-panel">
      <div className="adminx-kpi-grid adminx-support-kpi-grid">
        <MetricCard label="Total Tickets" value={toNumber(summary?.totalTickets, 0)} />
        <MetricCard label="Pending Admin" value={toNumber(summary?.pendingAdminTickets, 0)} hint={`Open ${toNumber(summary?.openTickets, 0)}`} />
        <MetricCard label="Pending User" value={toNumber(summary?.pendingUserTickets, 0)} hint={`Resolved ${toNumber(summary?.resolvedTickets, 0)}`} />
        <MetricCard label="Closed" value={toNumber(summary?.closedTickets, 0)} hint={`Today ${toNumber(summary?.createdToday, 0)}`} />
        <MetricCard label="High Priority" value={toNumber(summary?.highPriorityTickets, 0)} hint={`Urgent ${toNumber(summary?.urgentPriorityTickets, 0)}`} />
        <MetricCard label="Unread (Admin)" value={toNumber(summary?.unreadForAdmin, 0)} hint={`Unread (Users) ${toNumber(summary?.unreadForUsers, 0)}`} />
      </div>

      <div className="adminx-row adminx-row-two adminx-support-overview-grid">
        <article className="adminx-panel">
          <div className="adminx-panel-head">
            <h2>Latest Queue</h2>
            <span>Top pending tickets</span>
          </div>
          <div className="adminx-simple-list">
            {filteredTickets.slice(0, 8).map((row) => (
              <p key={row.ticketRef}>
                <span>{row.ticketRef} • {row.accountEmail || row.userId}</span>
                <strong>{row.status}</strong>
              </p>
            ))}
            {!filteredTickets.length ? <p className="adminx-muted">No support tickets found.</p> : null}
          </div>
        </article>

        <article className="adminx-panel">
          <div className="adminx-panel-head">
            <h2>Priority Buckets</h2>
          </div>
          <div className="adminx-simple-list">
            <p><span>Urgent</span><strong>{toNumber(summary?.urgentPriorityTickets, 0)}</strong></p>
            <p><span>High</span><strong>{toNumber(summary?.highPriorityTickets, 0)}</strong></p>
            <p><span>Normal</span><strong>{filteredTickets.filter((item) => normalizeText(item.priority) === "normal").length}</strong></p>
            <p><span>Low</span><strong>{filteredTickets.filter((item) => normalizeText(item.priority) === "low").length}</strong></p>
          </div>
        </article>
      </div>
    </section>
  );

  const inboxSection = (
    <section className="adminx-panel adminx-support-panel">
      <div className="adminx-filter-row adminx-support-filter-row">
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="pending_admin">Pending Admin</option>
          <option value="pending_user">Pending User</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
          <option value="all">All Priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
      </div>

      <div className="adminx-support-layout">
        <article className="adminx-support-list-panel">
          <div className="adminx-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>User</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Unread</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.length ? (
                  filteredTickets.map((row) => (
                    <tr key={row.ticketRef} className={row.ticketRef === selectedTicketRef ? "adminx-support-selected-row" : ""}>
                      <td>
                        <strong>{row.ticketRef}</strong>
                        <div className="adminx-table-subtext">{row.subject}</div>
                      </td>
                      <td>
                        <strong>{row.accountName || row.userId}</strong>
                        <div className="adminx-table-subtext">{row.accountEmail || row.userId}</div>
                      </td>
                      <td><span className={statusChipClass(row.status)}>{row.status}</span></td>
                      <td><span className={priorityChipClass(row.priority)}>{row.priority}</span></td>
                      <td>{toNumber(row.adminUnreadCount, 0)}</td>
                      <td>{formatDateTime(row.updatedAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => openTicket(row.ticketRef)}
                          disabled={busyAction.startsWith("support.open.")}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="adminx-muted">No tickets found for current filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="adminx-support-thread-panel">
          {ticketDetail?.ticket?.ticketRef ? (
            <>
              <div className="adminx-panel-head">
                <h2>{ticketDetail.ticket.ticketRef}</h2>
                <span>{ticketDetail.ticket.accountEmail || ticketDetail.ticket.userId}</span>
              </div>

              <div className="adminx-support-ticket-meta">
                <p>
                  <span>Status</span>
                  <strong><span className={statusChipClass(ticketDetail.ticket.status)}>{ticketDetail.ticket.status}</span></strong>
                </p>
                <p>
                  <span>Priority</span>
                  <strong><span className={priorityChipClass(ticketDetail.ticket.priority)}>{ticketDetail.ticket.priority}</span></strong>
                </p>
                <p>
                  <span>Assigned</span>
                  <strong>{ticketDetail.ticket.assignedAdminEmail || ticketDetail.ticket.assignedAdminUserId || "Unassigned"}</strong>
                </p>
                <p>
                  <span>Last Message</span>
                  <strong>{formatDateTime(ticketDetail.ticket.lastMessageAt)}</strong>
                </p>
              </div>

              <div className="adminx-support-thread-body">
                {detailMessages.map((message) => (
                  <article
                    key={`${message.messageId}-${message.createdAt}`}
                    className={`adminx-support-message ${message.senderRole === "admin" ? "is-admin" : "is-user"} ${message.isInternalNote ? "is-note" : ""}`}
                  >
                    <header>
                      <strong>{message.senderRole === "admin" ? (message.senderName || "Support Admin") : (ticketDetail.ticket.accountName || "User")}</strong>
                      <small>{formatDateTime(message.createdAt)}</small>
                    </header>
                    <p>{message.messageText}</p>
                  </article>
                ))}
                {!detailMessages.length ? <p className="adminx-muted">No thread messages yet.</p> : null}
              </div>

              <div className="adminx-support-thread-actions">
                <label>
                  Reply Message
                  <textarea
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    placeholder="Type support reply..."
                    rows={3}
                  />
                </label>
                <div className="adminx-profile-actions">
                  <button type="button" className="btn btn-primary" onClick={sendReply} disabled={busyAction === "support.reply"}>
                    {busyAction === "support.reply" ? "Sending..." : "Send Reply"}
                  </button>
                </div>

                <label>
                  Internal Note
                  <textarea
                    value={internalNoteText}
                    onChange={(event) => setInternalNoteText(event.target.value)}
                    placeholder="Only admins can see this note"
                    rows={2}
                  />
                </label>
                <div className="adminx-support-inline-controls">
                  <label className="adminx-checkbox-row">
                    <input type="checkbox" checked={showInternalNotes} onChange={(event) => setShowInternalNotes(event.target.checked)} />
                    Show internal notes in thread
                  </label>
                  <button type="button" className="btn btn-ghost" onClick={sendInternalNote} disabled={busyAction === "support.note"}>
                    {busyAction === "support.note" ? "Saving..." : "Save Note"}
                  </button>
                </div>
              </div>

              <div className="adminx-support-ticket-controls">
                <div className="adminx-tx-form-grid adminx-tx-form-grid-compact">
                  <label>
                    Status
                    <select value={ticketForm.status} onChange={(event) => setTicketForm((prev) => ({ ...prev, status: event.target.value }))}>
                      <option value="open">open</option>
                      <option value="pending_admin">pending_admin</option>
                      <option value="pending_user">pending_user</option>
                      <option value="resolved">resolved</option>
                      <option value="closed">closed</option>
                    </select>
                  </label>
                  <label>
                    Priority
                    <select value={ticketForm.priority} onChange={(event) => setTicketForm((prev) => ({ ...prev, priority: event.target.value }))}>
                      <option value="low">low</option>
                      <option value="normal">normal</option>
                      <option value="high">high</option>
                      <option value="urgent">urgent</option>
                    </select>
                  </label>
                  <label>
                    Assigned Admin ID
                    <input
                      type="text"
                      value={ticketForm.assignedAdminUserId}
                      onChange={(event) => setTicketForm((prev) => ({ ...prev, assignedAdminUserId: event.target.value }))}
                      placeholder="admin user id"
                    />
                  </label>
                  <label>
                    Assigned Admin Email
                    <input
                      type="text"
                      value={ticketForm.assignedAdminEmail}
                      onChange={(event) => setTicketForm((prev) => ({ ...prev, assignedAdminEmail: event.target.value }))}
                      placeholder="admin@email"
                    />
                  </label>
                  <label className="adminx-support-form-span-2">
                    Note
                    <input
                      type="text"
                      value={ticketForm.note}
                      onChange={(event) => setTicketForm((prev) => ({ ...prev, note: event.target.value }))}
                      placeholder="Why this update?"
                    />
                  </label>
                </div>

                <div className="adminx-profile-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() =>
                      setTicketForm((prev) => ({
                        ...prev,
                        assignedAdminUserId: adminUser?.userId || prev.assignedAdminUserId,
                        assignedAdminEmail: adminUser?.email || prev.assignedAdminEmail,
                      }))
                    }
                  >
                    Assign To Me
                  </button>
                  <button type="button" className="btn btn-primary" onClick={saveTicketMeta} disabled={busyAction === "support.update"}>
                    {busyAction === "support.update" ? "Saving..." : "Save Ticket Meta"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="adminx-support-empty-detail">
              <h3>Select a ticket</h3>
              <p>Open a ticket from the inbox table to inspect the full conversation and reply.</p>
            </div>
          )}
        </article>
      </div>
    </section>
  );

  const auditSection = (
    <section className="adminx-panel adminx-support-panel">
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
                <tr key={`${row.logId}-${row.createdAt}`}>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>
                    <strong>{row.adminUserId}</strong>
                    <div className="adminx-table-subtext">{row.adminEmail || "-"}</div>
                  </td>
                  <td>{row.actionType}</td>
                  <td>{row.targetType}:{row.targetId}</td>
                  <td>{row.note || "-"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="adminx-muted">No support audit logs found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <section className="adminx-panel adminx-support-root">
      <AdminSectionIntro
        icon={ADMIN_SECTION_META.supportCenter.icon}
        title={ADMIN_SECTION_META.supportCenter.title}
        description={ADMIN_SECTION_META.supportCenter.description}
        stats={[
          { label: "Tickets", value: formatCompactNumber(summary?.totalTickets || 0) },
          { label: "Pending Admin", value: formatCompactNumber(summary?.pendingAdminTickets || 0) },
          { label: "Unread", value: formatCompactNumber(summary?.unreadForAdmin || 0) },
        ]}
      />

      <div className="adminx-panel-head adminx-tx-head">
        <h2>Support Management</h2>
        <div className="adminx-profile-actions">
          <button type="button" className="btn btn-ghost" onClick={onRefresh}>
            <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-rotate"}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="adminx-tab-row">
        {SUPPORT_TABS.map((tab) => (
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
      {activeTab === "inbox" ? inboxSection : null}
      {activeTab === "audit" ? auditSection : null}
    </section>
  );
}
