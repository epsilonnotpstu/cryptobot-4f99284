import { useEffect, useMemo, useRef, useState } from "react";
import "./support.css";

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

function statusClass(status = "") {
  const normalized = normalizeText(status);
  if (["resolved", "closed"].includes(normalized)) {
    return "is-positive";
  }
  if (["pending_admin", "open"].includes(normalized)) {
    return "is-warning";
  }
  if (["pending_user"].includes(normalized)) {
    return "is-neutral";
  }
  return "is-negative";
}

function statusLabel(status = "") {
  const normalized = normalizeText(status);
  if (!normalized) {
    return "open";
  }
  return normalized.replace(/_/g, " ");
}

export default function SupportChatModal({
  open,
  onClose,
  onLoadTickets,
  onLoadTicketDetail,
  onCreateTicket,
  onSendTicketMessage,
  onUpdateTicketStatus,
  onLoadLiveThread,
  onSendLiveMessage,
}) {
  const [activeMode, setActiveMode] = useState("live");
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [summary, setSummary] = useState({});
  const [tickets, setTickets] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTicketRef, setSelectedTicketRef] = useState("");

  const [ticketDetail, setTicketDetail] = useState({});
  const [messageInput, setMessageInput] = useState("");

  const [composerOpen, setComposerOpen] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [newMessage, setNewMessage] = useState("");

  const [liveChatEnabled, setLiveChatEnabled] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [liveThreadDetail, setLiveThreadDetail] = useState({});
  const [liveMessageInput, setLiveMessageInput] = useState("");

  const ticketMessagesRef = useRef(null);
  const liveMessagesRef = useRef(null);

  const selectedTicket = ticketDetail?.ticket || null;
  const ticketMessages = Array.isArray(ticketDetail?.messages) ? ticketDetail.messages : [];
  const liveThread = liveThreadDetail?.thread || null;
  const liveMessages = Array.isArray(liveThreadDetail?.messages) ? liveThreadDetail.messages : [];

  const refreshTickets = async (nextStatus = statusFilter, options = {}) => {
    const silent = Boolean(options?.silent);
    if (!onLoadTickets) {
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    try {
      const payload = await onLoadTickets({ status: nextStatus, page: 1, limit: 120 });
      setSummary(payload?.summary || {});
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      setTickets(rows);
      setLastSyncAt(new Date().toISOString());

      if (!selectedTicketRef && rows[0]?.ticketRef) {
        setSelectedTicketRef(rows[0].ticketRef);
      }
    } catch (loadError) {
      if (!silent) {
        setError(loadError.message || "Could not load support tickets.");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const openTicket = async (ticketRef, options = {}) => {
    const silent = Boolean(options?.silent);
    if (!ticketRef || !onLoadTicketDetail) {
      return;
    }

    if (!silent) {
      setBusyAction(`open-${ticketRef}`);
      setError("");
    }
    try {
      const payload = await onLoadTicketDetail({ ticketRef });
      setSelectedTicketRef(ticketRef);
      setTicketDetail(payload || {});
      setLastSyncAt(new Date().toISOString());
    } catch (loadError) {
      if (!silent) {
        setError(loadError.message || "Could not load support thread.");
      }
    } finally {
      if (!silent) {
        setBusyAction("");
      }
    }
  };

  const loadLiveThread = async (options = {}) => {
    const silent = Boolean(options?.silent);
    if (!onLoadLiveThread) {
      return;
    }

    if (!silent) {
      setBusyAction("live-load");
      setError("");
    }
    try {
      const payload = await onLoadLiveThread();
      setLiveThreadDetail(payload || {});
      setLastSyncAt(new Date().toISOString());
    } catch (loadError) {
      if (!silent) {
        setError(loadError.message || "Could not load live chat.");
      }
    } finally {
      if (!silent) {
        setBusyAction("");
      }
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    setError("");
    setNotice("");
    if (activeMode === "tickets") {
      refreshTickets(statusFilter, { silent: false });
    } else {
      loadLiveThread({ silent: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeMode]);

  useEffect(() => {
    if (!open || activeMode !== "tickets") {
      return;
    }
    refreshTickets(statusFilter, { silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, activeMode, open]);

  useEffect(() => {
    if (!open || activeMode !== "tickets" || !selectedTicketRef) {
      return;
    }
    openTicket(selectedTicketRef, { silent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicketRef, activeMode, open]);

  useEffect(() => {
    if (!open || !liveChatEnabled) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      if (activeMode === "live") {
        loadLiveThread({ silent: true });
        return;
      }

      refreshTickets(statusFilter, { silent: true });
      if (selectedTicketRef) {
        openTicket(selectedTicketRef, { silent: true });
      }
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, liveChatEnabled, activeMode, statusFilter, selectedTicketRef]);

  useEffect(() => {
    const node = ticketMessagesRef.current;
    if (!node || activeMode !== "tickets") {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [ticketMessages.length, selectedTicketRef, activeMode]);

  useEffect(() => {
    const node = liveMessagesRef.current;
    if (!node || activeMode !== "live") {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [liveMessages.length, activeMode]);

  const submitNewTicket = async () => {
    if (!onCreateTicket) {
      return;
    }
    if (!newSubject.trim()) {
      setError("Ticket subject is required.");
      return;
    }
    if (!newMessage.trim()) {
      setError("Message is required.");
      return;
    }

    setBusyAction("create-ticket");
    setError("");
    setNotice("");
    try {
      const payload = await onCreateTicket({
        subject: newSubject,
        message: newMessage,
        category: newCategory,
      });
      const createdTicketRef = payload?.ticket?.ticketRef || "";
      setComposerOpen(false);
      setNewSubject("");
      setNewMessage("");
      setNewCategory("general");
      setNotice(payload?.message || "Support ticket created.");
      await refreshTickets(statusFilter, { silent: true });
      if (createdTicketRef) {
        await openTicket(createdTicketRef, { silent: true });
      }
    } catch (submitError) {
      setError(submitError.message || "Could not create support ticket.");
    } finally {
      setBusyAction("");
    }
  };

  const sendTicketMessage = async () => {
    if (!selectedTicketRef) {
      setError("Select a ticket first.");
      return;
    }
    if (!messageInput.trim()) {
      setError("Message is required.");
      return;
    }
    if (!onSendTicketMessage) {
      return;
    }

    setBusyAction("send-message");
    setError("");
    setNotice("");
    try {
      const payload = await onSendTicketMessage({
        ticketRef: selectedTicketRef,
        message: messageInput,
      });
      setMessageInput("");
      setNotice(payload?.message || "Message sent.");
      await openTicket(selectedTicketRef, { silent: true });
      await refreshTickets(statusFilter, { silent: true });
    } catch (sendError) {
      setError(sendError.message || "Could not send support message.");
    } finally {
      setBusyAction("");
    }
  };

  const sendLiveChatMessage = async () => {
    if (!onSendLiveMessage) {
      return;
    }
    if (!liveMessageInput.trim()) {
      setError("Message is required.");
      return;
    }

    setBusyAction("live-send");
    setError("");
    setNotice("");
    try {
      const payload = await onSendLiveMessage({ message: liveMessageInput });
      setLiveMessageInput("");
      setNotice(payload?.message || "Message sent.");
      await loadLiveThread({ silent: true });
    } catch (sendError) {
      setError(sendError.message || "Could not send live chat message.");
    } finally {
      setBusyAction("");
    }
  };

  const updateTicketStatus = async (nextStatus) => {
    if (!selectedTicketRef || !onUpdateTicketStatus) {
      return;
    }

    setBusyAction(`status-${nextStatus}`);
    setError("");
    setNotice("");
    try {
      const payload = await onUpdateTicketStatus({ ticketRef: selectedTicketRef, status: nextStatus });
      setNotice(payload?.message || "Ticket status updated.");
      await openTicket(selectedTicketRef, { silent: true });
      await refreshTickets(statusFilter, { silent: true });
    } catch (statusError) {
      setError(statusError.message || "Could not update ticket status.");
    } finally {
      setBusyAction("");
    }
  };

  const visibleTickets = useMemo(() => {
    return [...tickets].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [tickets]);

  if (!open) {
    return null;
  }

  return (
    <div className="prodash-chat-overlay supportchat-overlay" onClick={onClose}>
      <section className="supportchat-modal" onClick={(event) => event.stopPropagation()}>
        <header className="supportchat-header">
          <div className="supportchat-title-wrap">
            <div className="supportchat-avatar">S</div>
            <div>
              <strong>Customer Support</strong>
              <p>
                <span className="supportchat-live-dot" /> Live one-to-one assistance
              </p>
            </div>
          </div>

          <div className="supportchat-header-actions">
            <button
              type="button"
              className="supportchat-icon-btn"
              onClick={() => {
                if (activeMode === "live") {
                  loadLiveThread({ silent: false });
                } else {
                  refreshTickets(statusFilter, { silent: false });
                }
              }}
              title="Refresh"
            >
              <i className={`fas ${loading || busyAction === "live-load" ? "fa-spinner fa-spin" : "fa-rotate"}`} />
            </button>
            <button type="button" className="supportchat-icon-btn" onClick={onClose} aria-label="Close support modal">
              <i className="fas fa-xmark" />
            </button>
          </div>
        </header>

        <div className="supportchat-mode-tabs">
          <button
            type="button"
            className={activeMode === "live" ? "active" : ""}
            onClick={() => setActiveMode("live")}
          >
            <i className="fas fa-comments" /> Live Chat
          </button>
          <button
            type="button"
            className={activeMode === "tickets" ? "active" : ""}
            onClick={() => setActiveMode("tickets")}
          >
            <i className="fas fa-ticket" /> Ticket Support
          </button>
        </div>

        <div className="supportchat-feedback" aria-live="polite">
          {error ? <p className="supportchat-error">{error}</p> : null}
          {notice ? <p className="supportchat-notice">{notice}</p> : null}
        </div>

        {activeMode === "live" ? (
          <div className="supportchat-live-shell">
            <section className="supportchat-thread supportchat-live-thread supportchat-telegram-thread">
              <div className="supportchat-thread-head">
                <div>
                  <strong>Live Chat with Support Team</strong>
                  <p>
                    {/* {liveThread?.threadRef || "Loading thread..."}  */}
                    • Synced {lastSyncAt ? formatDateTime(lastSyncAt) : "-"}</p>
                </div>
                <div className="supportchat-thread-actions">
                  {/* <span className={`supportchat-chip ${statusClass(liveThread?.status)}`}>{statusLabel(liveThread?.status || "open")}</span> */}
                  <button type="button" className="supportchat-ghost-btn" onClick={() => setLiveChatEnabled((prev) => !prev)}>
                    <i className={`fas ${liveChatEnabled ? "fa-wave-square" : "fa-pause"}`} /> {liveChatEnabled ? "Live ON" : "Live OFF"}
                  </button>
                </div>
              </div>

              <div className="supportchat-messages" ref={liveMessagesRef}>
                {liveMessages.map((message) => (
                  <article
                    key={`${message.messageId}-${message.createdAt}`}
                    className={`supportchat-message ${message.senderRole === "admin" ? "is-admin" : "is-user"}`}
                  >
                    <header>
                      <strong>{message.senderRole === "admin" ? (message.senderName || "Support Admin") : "You"}</strong>
                      <small>{formatDateTime(message.createdAt)}</small>
                    </header>
                    <p>{message.messageText}</p>
                  </article>
                ))}
                {!liveMessages.length ? <p className="supportchat-muted">Start the conversation with the support team.</p> : null}
              </div>

              <footer className="supportchat-thread-footer">
                <input
                  type="text"
                  value={liveMessageInput}
                  onChange={(event) => setLiveMessageInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      sendLiveChatMessage();
                    }
                  }}
                  placeholder="Write your live message..."
                />
                <button
                  type="button"
                  className="supportchat-primary-btn"
                  onClick={sendLiveChatMessage}
                  disabled={busyAction === "live-send"}
                >
                  {busyAction === "live-send" ? "Sending..." : "Send"}
                </button>
              </footer>
            </section>
          </div>
        ) : (
          <div className="supportchat-layout">
            <aside className="supportchat-ticket-list">
              <div className="supportchat-ticket-tools">
                <div className="supportchat-ticket-tools-head">
                  <strong>Ticket Threads</strong>
                  <small>{toNumber(summary?.totalTickets, 0)} total</small>
                </div>
                <div className="supportchat-ticket-tools-actions">
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="all">All</option>
                    <option value="open">Open</option>
                    <option value="pending_admin">Pending Admin</option>
                    <option value="pending_user">Pending User</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                  <button type="button" className="supportchat-primary-btn" onClick={() => setComposerOpen((prev) => !prev)}>
                    <i className="fas fa-plus" /> New Ticket
                  </button>
                </div>
              </div>

              {composerOpen ? (
                <section className="supportchat-composer supportchat-inline-composer">
                  <h3>Create New Ticket</h3>
                  <div className="supportchat-composer-grid">
                    <label>
                      Subject
                      <input
                        type="text"
                        value={newSubject}
                        onChange={(event) => setNewSubject(event.target.value)}
                        placeholder="Briefly describe your issue"
                      />
                    </label>
                    <label>
                      Category
                      <select value={newCategory} onChange={(event) => setNewCategory(event.target.value)}>
                        <option value="general">General</option>
                        <option value="deposit">Deposit</option>
                        <option value="withdraw">Withdraw</option>
                        <option value="assets">Assets</option>
                        <option value="trading">Trading</option>
                        <option value="security">Security</option>
                      </select>
                    </label>
                    <label className="supportchat-field-span-2">
                      Message
                      <textarea
                        rows={3}
                        value={newMessage}
                        onChange={(event) => setNewMessage(event.target.value)}
                        placeholder="Explain details so support can help faster"
                      />
                    </label>
                  </div>
                  <div className="supportchat-composer-actions">
                    <button type="button" className="supportchat-ghost-btn" onClick={() => setComposerOpen(false)}>
                      Cancel
                    </button>
                    <button type="button" className="supportchat-primary-btn" onClick={submitNewTicket} disabled={busyAction === "create-ticket"}>
                      {busyAction === "create-ticket" ? "Creating..." : "Create Ticket"}
                    </button>
                  </div>
                </section>
              ) : null}

              {visibleTickets.map((ticket) => (
                <button
                  key={ticket.ticketRef}
                  type="button"
                  className={`supportchat-ticket-item ${ticket.ticketRef === selectedTicketRef ? "active" : ""}`}
                  onClick={() => setSelectedTicketRef(ticket.ticketRef)}
                >
                  <div className="supportchat-ticket-head">
                    <strong>{ticket.ticketRef}</strong>
                    <span className={`supportchat-chip ${statusClass(ticket.status)}`}>{statusLabel(ticket.status)}</span>
                  </div>
                  <p>{ticket.subject}</p>
                  <small>{formatDateTime(ticket.updatedAt)}</small>
                  <div className="supportchat-ticket-foot">
                    <span className={`supportchat-chip ${statusClass(ticket.priority)}`}>{ticket.priority}</span>
                    <span>{toNumber(ticket.userUnreadCount, 0)} unread</span>
                  </div>
                </button>
              ))}
              {!visibleTickets.length ? <p className="supportchat-muted">No support tickets found.</p> : null}
            </aside>

            <section className="supportchat-thread">
              {selectedTicket ? (
                <>
                  <div className="supportchat-thread-head">
                    <div>
                      <strong>{selectedTicket.subject}</strong>
                      <p>{selectedTicket.ticketRef} • {selectedTicket.category}</p>
                    </div>
                    <div className="supportchat-thread-actions">
                      {normalizeText(selectedTicket.status) === "closed" ? (
                        <button
                          type="button"
                          className="supportchat-ghost-btn"
                          onClick={() => updateTicketStatus("open")}
                          disabled={busyAction === "status-open"}
                        >
                          Reopen
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="supportchat-ghost-btn"
                          onClick={() => updateTicketStatus("closed")}
                          disabled={busyAction === "status-closed"}
                        >
                          Close Ticket
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="supportchat-messages" ref={ticketMessagesRef}>
                    {ticketMessages.map((message) => (
                      <article
                        key={`${message.messageId}-${message.createdAt}`}
                        className={`supportchat-message ${message.senderRole === "admin" ? "is-admin" : "is-user"}`}
                      >
                        <header>
                          <strong>{message.senderRole === "admin" ? (message.senderName || "Support Admin") : "You"}</strong>
                          <small>{formatDateTime(message.createdAt)}</small>
                        </header>
                        <p>{message.messageText}</p>
                      </article>
                    ))}
                    {!ticketMessages.length ? <p className="supportchat-muted">No messages yet.</p> : null}
                  </div>

                  <footer className="supportchat-thread-footer">
                    <input
                      type="text"
                      value={messageInput}
                      onChange={(event) => setMessageInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          sendTicketMessage();
                        }
                      }}
                      placeholder={normalizeText(selectedTicket.status) === "closed" ? "Reopen ticket to send message" : "Write your message..."}
                      disabled={normalizeText(selectedTicket.status) === "closed"}
                    />
                    <button
                      type="button"
                      className="supportchat-primary-btn"
                      onClick={sendTicketMessage}
                      disabled={busyAction === "send-message" || normalizeText(selectedTicket.status) === "closed"}
                    >
                      {busyAction === "send-message" ? "Sending..." : "Send"}
                    </button>
                  </footer>
                </>
              ) : (
                <div className="supportchat-thread-empty">
                  <h3>Select a ticket</h3>
                  <p>Open a ticket from the left list or create a new one.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
