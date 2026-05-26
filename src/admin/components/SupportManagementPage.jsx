import { useEffect, useMemo, useRef, useState } from "react";
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
  { key: "live", label: "Live Chat" },
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
  live,
  liveDetail,
  loading,
  searchValue,
  onSearchChange,
  onRefresh,
  onLoadTicketDetail,
  onReplyTicket,
  onUpdateTicket,
  onLoadLiveThreadDetail,
  onReplyLiveThread,
  onUpdateLiveThread,
  adminUser,
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [showInternalNotes, setShowInternalNotes] = useState(false);
  const [selectedTicketRef, setSelectedTicketRef] = useState("");
  const [selectedLiveThreadRef, setSelectedLiveThreadRef] = useState("");
  const [liveModeEnabled, setLiveModeEnabled] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState("");

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
  const [liveThreadForm, setLiveThreadForm] = useState({
    status: "open",
    assignedAdminUserId: "",
    assignedAdminEmail: "",
    note: "",
  });
  const [liveReplyText, setLiveReplyText] = useState("");
  const threadBodyRef = useRef(null);
  const liveThreadBodyRef = useRef(null);
  const livePollCounterRef = useRef(0);

  const ticketRows = Array.isArray(tickets?.rows) ? tickets.rows : [];
  const auditRows = Array.isArray(auditLogs?.rows) ? auditLogs.rows : [];
  const liveRows = Array.isArray(live?.rows) ? live.rows : [];
  const liveSummary = live?.summary || {};

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

  const filteredLiveThreads = useMemo(() => {
    return liveRows.filter((row) => {
      if (statusFilter !== "all" && normalizeText(row.status) !== statusFilter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const bucket = `${row.threadRef} ${row.userId} ${row.userName} ${row.userEmail} ${row.lastMessagePreview}`.toLowerCase();
      return bucket.includes(keyword);
    });
  }, [keyword, liveRows, statusFilter]);

  const selectedLiveRow = useMemo(() => {
    if (!selectedLiveThreadRef) {
      return null;
    }
    return liveRows.find((row) => row.threadRef === selectedLiveThreadRef) || null;
  }, [liveRows, selectedLiveThreadRef]);

  const isLiveDetailSynced = useMemo(() => {
    return Boolean(
      selectedLiveThreadRef &&
      liveDetail?.thread?.threadRef &&
      liveDetail.thread.threadRef === selectedLiveThreadRef,
    );
  }, [liveDetail?.thread?.threadRef, selectedLiveThreadRef]);

  const selectedLiveThread = useMemo(() => {
    if (isLiveDetailSynced && liveDetail?.thread?.threadRef) {
      return liveDetail.thread;
    }
    return selectedLiveRow;
  }, [isLiveDetailSynced, liveDetail?.thread, selectedLiveRow]);

  const selectedLiveMessages = useMemo(() => {
    if (!isLiveDetailSynced) {
      return [];
    }
    return Array.isArray(liveDetail?.messages) ? liveDetail.messages : [];
  }, [isLiveDetailSynced, liveDetail?.messages]);

  useEffect(() => {
    if (!selectedTicketRef) {
      return;
    }
    if (!ticketRows.length) {
      return;
    }
    if (!ticketRows.some((row) => row.ticketRef === selectedTicketRef)) {
      setSelectedTicketRef("");
    }
  }, [selectedTicketRef, ticketRows]);

  useEffect(() => {
    if (!selectedLiveThreadRef) {
      return;
    }
    if (!liveRows.length) {
      return;
    }
    if (!liveRows.some((row) => row.threadRef === selectedLiveThreadRef)) {
      setSelectedLiveThreadRef("");
    }
  }, [selectedLiveThreadRef, liveRows]);

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

  useEffect(() => {
    const node = threadBodyRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [selectedTicketRef, ticketDetail?.messages]);

  useEffect(() => {
    const node = liveThreadBodyRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [selectedLiveThreadRef, liveDetail?.messages]);

  useEffect(() => {
    if (!liveDetail?.thread?.threadRef) {
      return;
    }
    setLiveThreadForm({
      status: String(liveDetail.thread.status || "open"),
      assignedAdminUserId: String(liveDetail.thread.assignedAdminUserId || ""),
      assignedAdminEmail: String(liveDetail.thread.assignedAdminEmail || ""),
      note: "",
    });
  }, [liveDetail?.thread?.threadRef, liveDetail?.thread?.status, liveDetail?.thread?.assignedAdminUserId, liveDetail?.thread?.assignedAdminEmail]);

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
      setLastSyncAt(new Date().toISOString());
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

  const openLiveThread = async (threadRef) => {
    setSelectedLiveThreadRef(threadRef);
    await runAction(`support.live.open.${threadRef}`, async () => {
      const payload = await onLoadLiveThreadDetail?.({ threadRef });
      return payload || { message: "Live chat thread loaded." };
    });
  };

  useEffect(() => {
    if ((activeTab !== "inbox" && activeTab !== "live") || !liveModeEnabled) {
      return undefined;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        if (activeTab === "inbox" && selectedTicketRef) {
          await onLoadTicketDetail?.({ ticketRef: selectedTicketRef });
        }
        if (activeTab === "live" && selectedLiveThreadRef) {
          await onLoadLiveThreadDetail?.({ threadRef: selectedLiveThreadRef });
        }
        livePollCounterRef.current += 1;
        if (livePollCounterRef.current % 3 === 0) {
          await onRefresh?.();
        }
        if (!cancelled) {
          setLastSyncAt(new Date().toISOString());
        }
      } catch {
        // Keep live polling resilient.
      }
    };

    const intervalId = window.setInterval(poll, 5000);
    poll();
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeTab, liveModeEnabled, onLoadLiveThreadDetail, onLoadTicketDetail, onRefresh, selectedLiveThreadRef, selectedTicketRef]);

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

  const sendLiveReply = async () => {
    if (!selectedLiveThreadRef) {
      setError("Select a live thread before replying.");
      return;
    }
    if (!liveReplyText.trim()) {
      setError("Live reply message is required.");
      return;
    }

    await runAction("support.live.reply", async () => {
      const data = await onReplyLiveThread?.({
        threadRef: selectedLiveThreadRef,
        message: liveReplyText,
      });
      setLiveReplyText("");
      await onLoadLiveThreadDetail?.({ threadRef: selectedLiveThreadRef });
      await onRefresh?.();
      return data;
    });
  };

  const saveLiveThreadMeta = async () => {
    if (!selectedLiveThreadRef) {
      setError("Select a live thread before updating.");
      return;
    }

    await runAction("support.live.update", async () => {
      const data = await onUpdateLiveThread?.({
        threadRef: selectedLiveThreadRef,
        status: liveThreadForm.status,
        assignedAdminUserId: liveThreadForm.assignedAdminUserId || null,
        assignedAdminEmail: liveThreadForm.assignedAdminEmail || null,
        note: liveThreadForm.note,
      });
      await onLoadLiveThreadDetail?.({ threadRef: selectedLiveThreadRef });
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

              <div className="adminx-support-thread-body" ref={threadBodyRef}>
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

  const liveSection = (
    <section className="adminx-panel adminx-support-panel">
      <div className="adminx-filter-row adminx-support-filter-row">
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <div className="adminx-support-live-indicator">
          <i className="fas fa-comments" />
          Threads {formatCompactNumber(liveSummary?.totalThreads || 0)} • Open {formatCompactNumber(liveSummary?.openThreads || 0)} • Unread {formatCompactNumber(liveSummary?.unreadForAdmin || 0)}
        </div>
      </div>

      <div className="adminx-support-layout">
        <article className="adminx-support-list-panel">
          <div className="adminx-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Thread</th>
                  <th>User</th>
                  <th>Status</th>
                  <th>Unread</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredLiveThreads.length ? (
                  filteredLiveThreads.map((row) => (
                    <tr key={row.threadRef} className={row.threadRef === selectedLiveThreadRef ? "adminx-support-selected-row" : ""}>
                      <td>
                        <strong>{row.threadRef}</strong>
                        <div className="adminx-table-subtext">{row.lastMessagePreview || "-"}</div>
                      </td>
                      <td>
                        <strong>{row.userName || row.userId}</strong>
                        <div className="adminx-table-subtext">{row.userEmail || row.userId}</div>
                      </td>
                      <td><span className={statusChipClass(row.status)}>{row.status}</span></td>
                      <td>{toNumber(row.adminUnreadCount, 0)}</td>
                      <td>{formatDateTime(row.updatedAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => openLiveThread(row.threadRef)}
                          disabled={busyAction.startsWith("support.live.open.")}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="adminx-muted">No live chat threads found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="adminx-support-thread-panel adminx-support-live-thread-panel">
          {selectedLiveThreadRef && selectedLiveThread ? (
            <>
              <div className="adminx-panel-head adminx-support-live-head">
                <h2>{selectedLiveThread.threadRef}</h2>
                <span>{selectedLiveThread.userEmail || selectedLiveThread.userId}</span>
              </div>

              <div className="adminx-support-ticket-meta adminx-support-live-meta">
                <p>
                  <span>Status</span>
                  <strong><span className={statusChipClass(selectedLiveThread.status)}>{selectedLiveThread.status}</span></strong>
                </p>
                <p>
                  <span>Assigned</span>
                  <strong>{selectedLiveThread.assignedAdminEmail || selectedLiveThread.assignedAdminUserId || "Unassigned"}</strong>
                </p>
                <p>
                  <span>Unread</span>
                  <strong>{toNumber(selectedLiveThread.adminUnreadCount, 0)}</strong>
                </p>
                <p>
                  <span>Last Message</span>
                  <strong>{formatDateTime(selectedLiveThread.lastMessageAt)}</strong>
                </p>
              </div>

              <div className="adminx-support-thread-body adminx-support-live-body" ref={liveThreadBodyRef}>
                {selectedLiveMessages.map((message) => (
                  <article
                    key={`${message.messageId}-${message.createdAt}`}
                    className={`adminx-support-message ${message.senderRole === "admin" ? "is-admin" : "is-user"}`}
                  >
                    <header>
                      <strong>{message.senderRole === "admin" ? (message.senderName || "Support Admin") : (selectedLiveThread.userName || "User")}</strong>
                      <small>{formatDateTime(message.createdAt)}</small>
                    </header>
                    <p>{message.messageText}</p>
                  </article>
                ))}
                {!selectedLiveMessages.length ? (
                  <p className="adminx-muted">
                    {isLiveDetailSynced ? "No live messages yet." : "Syncing selected live thread..."}
                  </p>
                ) : null}
              </div>

              <div className="adminx-support-thread-actions adminx-support-live-reply">
                <label>
                  Live Reply
                  <textarea
                    value={liveReplyText}
                    onChange={(event) => setLiveReplyText(event.target.value)}
                    placeholder="Type live chat reply..."
                    rows={3}
                  />
                </label>
                <div className="adminx-profile-actions">
                  <button type="button" className="btn btn-primary" onClick={sendLiveReply} disabled={busyAction === "support.live.reply"}>
                    {busyAction === "support.live.reply" ? "Sending..." : "Send Reply"}
                  </button>
                </div>
              </div>

              <div className="adminx-support-ticket-controls adminx-support-live-controls">
                <div className="adminx-tx-form-grid adminx-tx-form-grid-compact">
                  <label>
                    Status
                    <select value={liveThreadForm.status} onChange={(event) => setLiveThreadForm((prev) => ({ ...prev, status: event.target.value }))}>
                      <option value="open">open</option>
                      <option value="closed">closed</option>
                    </select>
                  </label>
                  <label>
                    Assigned Admin ID
                    <input
                      type="text"
                      value={liveThreadForm.assignedAdminUserId}
                      onChange={(event) => setLiveThreadForm((prev) => ({ ...prev, assignedAdminUserId: event.target.value }))}
                      placeholder="admin user id"
                    />
                  </label>
                  <label>
                    Assigned Admin Email
                    <input
                      type="text"
                      value={liveThreadForm.assignedAdminEmail}
                      onChange={(event) => setLiveThreadForm((prev) => ({ ...prev, assignedAdminEmail: event.target.value }))}
                      placeholder="admin@email"
                    />
                  </label>
                  <label className="adminx-support-form-span-2">
                    Note
                    <input
                      type="text"
                      value={liveThreadForm.note}
                      onChange={(event) => setLiveThreadForm((prev) => ({ ...prev, note: event.target.value }))}
                      placeholder="Why this update?"
                    />
                  </label>
                </div>

                <div className="adminx-profile-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() =>
                      setLiveThreadForm((prev) => ({
                        ...prev,
                        assignedAdminUserId: adminUser?.userId || prev.assignedAdminUserId,
                        assignedAdminEmail: adminUser?.email || prev.assignedAdminEmail,
                      }))
                    }
                  >
                    Assign To Me
                  </button>
                  <button type="button" className="btn btn-primary" onClick={saveLiveThreadMeta} disabled={busyAction === "support.live.update"}>
                    {busyAction === "support.live.update" ? "Saving..." : "Save Live Meta"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="adminx-support-empty-detail">
              <h3>Select a live thread</h3>
              <p>Open a user thread from the left side to start one-to-one live support conversation.</p>
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
          <span className="adminx-support-live-indicator">
            <i className={`fas ${liveModeEnabled ? "fa-bolt" : "fa-power-off"}`} />
            {liveModeEnabled ? "Live ON" : "Live OFF"} • Sync {lastSyncAt ? formatDateTime(lastSyncAt) : "-"}
          </span>
          <button type="button" className="btn btn-ghost" onClick={() => setLiveModeEnabled((prev) => !prev)}>
            <i className={`fas ${liveModeEnabled ? "fa-wave-square" : "fa-play"}`} /> {liveModeEnabled ? "Pause Live" : "Resume Live"}
          </button>
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
      {activeTab === "live" ? liveSection : null}
      {activeTab === "audit" ? auditSection : null}
    </section>
  );
}
