function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeText(value = "") {
  return String(value ?? "").trim();
}

function normalizeLower(value = "") {
  return normalizeText(value).toLowerCase();
}

function normalizeUpper(value = "") {
  return normalizeText(value).toUpperCase();
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = normalizeLower(value);
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function buildPagination(rawPage, rawLimit, defaultLimit = 20, maxLimit = 200) {
  const page = Math.max(1, Math.floor(toNumber(rawPage, 1)));
  const limit = Math.max(1, Math.min(maxLimit, Math.floor(toNumber(rawLimit, defaultLimit))));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function buildSupportRef() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SUP-${stamp}-${rand}`;
}

function parseIsoMs(value = "") {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

const TICKET_STATUS_SET = new Set(["open", "pending_admin", "pending_user", "resolved", "closed"]);
const TICKET_PRIORITY_SET = new Set(["low", "normal", "high", "urgent"]);

function normalizeTicketStatus(value = "open", fallback = "open") {
  const normalized = normalizeLower(value);
  if (TICKET_STATUS_SET.has(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizeTicketPriority(value = "normal", fallback = "normal") {
  const normalized = normalizeLower(value);
  if (TICKET_PRIORITY_SET.has(normalized)) {
    return normalized;
  }
  return fallback;
}

function sanitizeMessageText(value = "", maxLen = 3000) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLen);
}

export function createSupportModule({ db, getNow, toIso, sanitizeShortText }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_ref TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'normal',
      assigned_admin_user_id TEXT,
      assigned_admin_email TEXT,
      last_message_preview TEXT NOT NULL DEFAULT '',
      last_message_at TEXT NOT NULL,
      user_unread_count INTEGER NOT NULL DEFAULT 0,
      admin_unread_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS support_ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      ticket_ref TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      sender_user_id TEXT NOT NULL,
      sender_name TEXT,
      sender_email TEXT,
      message_text TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      is_internal_note INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      read_by_user_at TEXT,
      read_by_admin_at TEXT
    );

    CREATE TABLE IF NOT EXISTS support_admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_user_id TEXT NOT NULL,
      admin_email TEXT,
      action_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_support_tickets_user_updated
      ON support_tickets(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_support_tickets_status_updated
      ON support_tickets(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_support_tickets_priority_updated
      ON support_tickets(priority, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created
      ON support_ticket_messages(ticket_id, created_at ASC, id ASC);
    CREATE INDEX IF NOT EXISTS idx_support_audit_created
      ON support_admin_audit_logs(created_at DESC, id DESC);
  `);

  const insertTicketStatement = db.prepare(`
    INSERT INTO support_tickets (
      ticket_ref,
      user_id,
      category,
      subject,
      status,
      priority,
      assigned_admin_user_id,
      assigned_admin_email,
      last_message_preview,
      last_message_at,
      user_unread_count,
      admin_unread_count,
      created_at,
      updated_at,
      resolved_at,
      closed_at
    ) VALUES (
      @ticketRef,
      @userId,
      @category,
      @subject,
      @status,
      @priority,
      @assignedAdminUserId,
      @assignedAdminEmail,
      @lastMessagePreview,
      @lastMessageAt,
      @userUnreadCount,
      @adminUnreadCount,
      @createdAt,
      @updatedAt,
      @resolvedAt,
      @closedAt
    )
  `);

  const findTicketByRefStatement = db.prepare(`SELECT * FROM support_tickets WHERE ticket_ref = ? LIMIT 1`);
  const findTicketByIdStatement = db.prepare(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`);

  const updateTicketStateStatement = db.prepare(`
    UPDATE support_tickets
    SET category = @category,
        subject = @subject,
        status = @status,
        priority = @priority,
        assigned_admin_user_id = @assignedAdminUserId,
        assigned_admin_email = @assignedAdminEmail,
        last_message_preview = @lastMessagePreview,
        last_message_at = @lastMessageAt,
        user_unread_count = @userUnreadCount,
        admin_unread_count = @adminUnreadCount,
        updated_at = @updatedAt,
        resolved_at = @resolvedAt,
        closed_at = @closedAt
    WHERE id = @id
  `);

  const listTicketsByUserStatement = db.prepare(`
    SELECT t.*,
           u.name AS account_name,
           u.email AS account_email
    FROM support_tickets t
    LEFT JOIN users u ON u.user_id = t.user_id
    WHERE t.user_id = @userId
      AND (@statusFilter = 'all' OR t.status = @statusFilter)
    ORDER BY t.updated_at DESC, t.id DESC
    LIMIT @limit OFFSET @offset
  `);

  const countTicketsByUserStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM support_tickets
    WHERE user_id = @userId
      AND (@statusFilter = 'all' OR status = @statusFilter)
  `);

  const countUserTicketsByStatusStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM support_tickets
    WHERE user_id = @userId
      AND status = @status
  `);

  const countUserUnreadStatement = db.prepare(`
    SELECT COALESCE(SUM(user_unread_count), 0) AS total
    FROM support_tickets
    WHERE user_id = ?
  `);

  const listTicketsForAdminStatement = db.prepare(`
    SELECT t.*,
           u.name AS account_name,
           u.email AS account_email
    FROM support_tickets t
    LEFT JOIN users u ON u.user_id = t.user_id
    WHERE (@statusFilter = 'all' OR t.status = @statusFilter)
      AND (@priorityFilter = 'all' OR t.priority = @priorityFilter)
      AND (
        @assignedFilter = 'all'
        OR (@assignedFilter = 'unassigned' AND (t.assigned_admin_user_id IS NULL OR t.assigned_admin_user_id = ''))
        OR (@assignedFilter <> 'all' AND @assignedFilter <> 'unassigned' AND t.assigned_admin_user_id = @assignedFilter)
      )
      AND (
        @keyword = ''
        OR t.ticket_ref LIKE @keywordLike
        OR t.user_id LIKE @keywordLike
        OR t.subject LIKE @keywordLike
        OR u.email LIKE @keywordLike
        OR u.name LIKE @keywordLike
      )
    ORDER BY t.updated_at DESC, t.id DESC
    LIMIT @limit OFFSET @offset
  `);

  const countTicketsForAdminStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM support_tickets t
    LEFT JOIN users u ON u.user_id = t.user_id
    WHERE (@statusFilter = 'all' OR t.status = @statusFilter)
      AND (@priorityFilter = 'all' OR t.priority = @priorityFilter)
      AND (
        @assignedFilter = 'all'
        OR (@assignedFilter = 'unassigned' AND (t.assigned_admin_user_id IS NULL OR t.assigned_admin_user_id = ''))
        OR (@assignedFilter <> 'all' AND @assignedFilter <> 'unassigned' AND t.assigned_admin_user_id = @assignedFilter)
      )
      AND (
        @keyword = ''
        OR t.ticket_ref LIKE @keywordLike
        OR t.user_id LIKE @keywordLike
        OR t.subject LIKE @keywordLike
        OR u.email LIKE @keywordLike
        OR u.name LIKE @keywordLike
      )
  `);

  const listTicketMessagesStatement = db.prepare(`
    SELECT *
    FROM support_ticket_messages
    WHERE ticket_id = @ticketId
    ORDER BY created_at ASC, id ASC
    LIMIT @limit OFFSET @offset
  `);

  const countTicketMessagesStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM support_ticket_messages
    WHERE ticket_id = ?
  `);

  const insertTicketMessageStatement = db.prepare(`
    INSERT INTO support_ticket_messages (
      ticket_id,
      ticket_ref,
      sender_role,
      sender_user_id,
      sender_name,
      sender_email,
      message_text,
      message_type,
      is_internal_note,
      created_at,
      read_by_user_at,
      read_by_admin_at
    ) VALUES (
      @ticketId,
      @ticketRef,
      @senderRole,
      @senderUserId,
      @senderName,
      @senderEmail,
      @messageText,
      @messageType,
      @isInternalNote,
      @createdAt,
      @readByUserAt,
      @readByAdminAt
    )
  `);

  const markTicketMessagesReadByUserStatement = db.prepare(`
    UPDATE support_ticket_messages
    SET read_by_user_at = @readAt
    WHERE ticket_id = @ticketId
      AND sender_role = 'admin'
      AND read_by_user_at IS NULL
  `);

  const markTicketMessagesReadByAdminStatement = db.prepare(`
    UPDATE support_ticket_messages
    SET read_by_admin_at = @readAt
    WHERE ticket_id = @ticketId
      AND sender_role = 'user'
      AND read_by_admin_at IS NULL
  `);

  const insertAdminAuditStatement = db.prepare(`
    INSERT INTO support_admin_audit_logs (
      admin_user_id,
      admin_email,
      action_type,
      target_type,
      target_id,
      note,
      created_at
    ) VALUES (
      @adminUserId,
      @adminEmail,
      @actionType,
      @targetType,
      @targetId,
      @note,
      @createdAt
    )
  `);

  const listAdminAuditLogsStatement = db.prepare(`
    SELECT *
    FROM support_admin_audit_logs
    WHERE (@keyword = '' OR admin_user_id LIKE @keywordLike OR admin_email LIKE @keywordLike OR action_type LIKE @keywordLike OR target_id LIKE @keywordLike OR note LIKE @keywordLike)
    ORDER BY created_at DESC, id DESC
    LIMIT @limit OFFSET @offset
  `);

  const countAdminAuditLogsStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM support_admin_audit_logs
    WHERE (@keyword = '' OR admin_user_id LIKE @keywordLike OR admin_email LIKE @keywordLike OR action_type LIKE @keywordLike OR target_id LIKE @keywordLike OR note LIKE @keywordLike)
  `);

  const countTicketsByStatusStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM support_tickets
    WHERE status = ?
  `);

  const countTicketsByPriorityStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM support_tickets
    WHERE priority = ?
  `);

  const countAllTicketsStatement = db.prepare(`SELECT COUNT(*) AS total FROM support_tickets`);
  const sumAdminUnreadStatement = db.prepare(`SELECT COALESCE(SUM(admin_unread_count), 0) AS total FROM support_tickets`);
  const sumUserUnreadStatement = db.prepare(`SELECT COALESCE(SUM(user_unread_count), 0) AS total FROM support_tickets`);
  const countTodayTicketsStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM support_tickets
    WHERE created_at >= ?
  `);

  function parseRequestValue(req, key, fallback = null) {
    if (req?.body && Object.prototype.hasOwnProperty.call(req.body, key)) {
      return req.body[key];
    }
    if (req?.query && Object.prototype.hasOwnProperty.call(req.query, key)) {
      return req.query[key];
    }
    return fallback;
  }

  function normalizeCategory(value = "general") {
    const cleaned = normalizeLower(value).replace(/[^a-z0-9_-]/g, "").slice(0, 30);
    return cleaned || "general";
  }

  function normalizeListStatus(value = "all") {
    const normalized = normalizeLower(value);
    if (normalized === "all") {
      return "all";
    }
    return TICKET_STATUS_SET.has(normalized) ? normalized : "all";
  }

  function normalizeListPriority(value = "all") {
    const normalized = normalizeLower(value);
    if (normalized === "all") {
      return "all";
    }
    return TICKET_PRIORITY_SET.has(normalized) ? normalized : "all";
  }

  function mapTicketRow(row) {
    if (!row) {
      return null;
    }

    return {
      ticketId: toNumber(row.id, 0),
      ticketRef: String(row.ticket_ref || ""),
      userId: String(row.user_id || ""),
      category: normalizeCategory(row.category || "general"),
      subject: String(row.subject || ""),
      status: normalizeTicketStatus(row.status || "open"),
      priority: normalizeTicketPriority(row.priority || "normal"),
      assignedAdminUserId: String(row.assigned_admin_user_id || ""),
      assignedAdminEmail: String(row.assigned_admin_email || ""),
      lastMessagePreview: String(row.last_message_preview || ""),
      lastMessageAt: String(row.last_message_at || ""),
      userUnreadCount: toNumber(row.user_unread_count, 0),
      adminUnreadCount: toNumber(row.admin_unread_count, 0),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
      resolvedAt: String(row.resolved_at || ""),
      closedAt: String(row.closed_at || ""),
      accountName: String(row.account_name || ""),
      accountEmail: String(row.account_email || ""),
    };
  }

  function mapMessageRow(row) {
    if (!row) {
      return null;
    }

    return {
      messageId: toNumber(row.id, 0),
      ticketId: toNumber(row.ticket_id, 0),
      ticketRef: String(row.ticket_ref || ""),
      senderRole: normalizeLower(row.sender_role || "user") || "user",
      senderUserId: String(row.sender_user_id || ""),
      senderName: String(row.sender_name || ""),
      senderEmail: String(row.sender_email || ""),
      messageText: String(row.message_text || ""),
      messageType: String(row.message_type || "text"),
      isInternalNote: toNumber(row.is_internal_note, 0) === 1,
      createdAt: String(row.created_at || ""),
      readByUserAt: String(row.read_by_user_at || ""),
      readByAdminAt: String(row.read_by_admin_at || ""),
    };
  }

  function writeAdminAudit({ adminUserId, adminEmail, actionType, targetType, targetId, note = "", createdAt }) {
    insertAdminAuditStatement.run({
      adminUserId: sanitizeShortText(adminUserId || "admin", 80) || "admin",
      adminEmail: sanitizeShortText(adminEmail || "", 180),
      actionType: sanitizeShortText(actionType || "unknown", 80) || "unknown",
      targetType: sanitizeShortText(targetType || "support_ticket", 80) || "support_ticket",
      targetId: sanitizeShortText(targetId || "", 120),
      note: sanitizeShortText(note || "", 400),
      createdAt,
    });
  }

  function assertTicketAccessForUser(ticket, userId) {
    if (!ticket) {
      throw new Error("Support ticket not found.");
    }
    if (String(ticket.user_id || "") !== String(userId || "")) {
      throw new Error("You do not have access to this ticket.");
    }
  }

  function touchTicketAsUserRead(ticketId, nowIso) {
    markTicketMessagesReadByUserStatement.run({ ticketId, readAt: nowIso });
    const ticket = findTicketByIdStatement.get(ticketId);
    if (!ticket) {
      return;
    }
    updateTicketStateStatement.run({
      id: ticket.id,
      category: ticket.category,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      assignedAdminUserId: ticket.assigned_admin_user_id,
      assignedAdminEmail: ticket.assigned_admin_email,
      lastMessagePreview: ticket.last_message_preview,
      lastMessageAt: ticket.last_message_at,
      userUnreadCount: 0,
      adminUnreadCount: toNumber(ticket.admin_unread_count, 0),
      updatedAt: nowIso,
      resolvedAt: ticket.resolved_at,
      closedAt: ticket.closed_at,
    });
  }

  function touchTicketAsAdminRead(ticketId, nowIso) {
    markTicketMessagesReadByAdminStatement.run({ ticketId, readAt: nowIso });
    const ticket = findTicketByIdStatement.get(ticketId);
    if (!ticket) {
      return;
    }
    updateTicketStateStatement.run({
      id: ticket.id,
      category: ticket.category,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      assignedAdminUserId: ticket.assigned_admin_user_id,
      assignedAdminEmail: ticket.assigned_admin_email,
      lastMessagePreview: ticket.last_message_preview,
      lastMessageAt: ticket.last_message_at,
      userUnreadCount: toNumber(ticket.user_unread_count, 0),
      adminUnreadCount: 0,
      updatedAt: nowIso,
      resolvedAt: ticket.resolved_at,
      closedAt: ticket.closed_at,
    });
  }

  function getTicketMessages(ticketId, page = 1, limit = 300) {
    const { offset } = buildPagination(page, limit, 300, 1000);
    return listTicketMessagesStatement.all({ ticketId, limit, offset }).map((row) => mapMessageRow(row));
  }

  function createUserTicket({ userId, subject, messageText, category }) {
    const nowIso = toIso(getNow());
    const sanitizedMessage = sanitizeMessageText(messageText, 3000);
    const sanitizedSubject = sanitizeShortText(subject || sanitizedMessage.slice(0, 80), 140);

    if (!sanitizedSubject) {
      throw new Error("Ticket subject is required.");
    }
    if (!sanitizedMessage) {
      throw new Error("Message is required.");
    }

    const ticketRef = buildSupportRef();
    const safeCategory = normalizeCategory(category || "general");

    const createTx = db.transaction(() => {
      insertTicketStatement.run({
        ticketRef,
        userId,
        category: safeCategory,
        subject: sanitizedSubject,
        status: "pending_admin",
        priority: "normal",
        assignedAdminUserId: null,
        assignedAdminEmail: null,
        lastMessagePreview: sanitizeShortText(sanitizedMessage, 180),
        lastMessageAt: nowIso,
        userUnreadCount: 0,
        adminUnreadCount: 1,
        createdAt: nowIso,
        updatedAt: nowIso,
        resolvedAt: null,
        closedAt: null,
      });

      const insertedTicket = findTicketByRefStatement.get(ticketRef);
      if (!insertedTicket) {
        throw new Error("Could not create support ticket.");
      }

      insertTicketMessageStatement.run({
        ticketId: insertedTicket.id,
        ticketRef,
        senderRole: "user",
        senderUserId: userId,
        senderName: "",
        senderEmail: "",
        messageText: sanitizedMessage,
        messageType: "text",
        isInternalNote: 0,
        createdAt: nowIso,
        readByUserAt: nowIso,
        readByAdminAt: null,
      });

      return insertedTicket;
    });

    return createTx();
  }

  function sendUserMessage({ userId, ticketRef, messageText }) {
    const ticket = findTicketByRefStatement.get(ticketRef);
    assertTicketAccessForUser(ticket, userId);

    const sanitizedMessage = sanitizeMessageText(messageText, 3000);
    if (!sanitizedMessage) {
      throw new Error("Message is required.");
    }

    const nowIso = toIso(getNow());

    const tx = db.transaction(() => {
      insertTicketMessageStatement.run({
        ticketId: ticket.id,
        ticketRef: ticket.ticket_ref,
        senderRole: "user",
        senderUserId: userId,
        senderName: "",
        senderEmail: "",
        messageText: sanitizedMessage,
        messageType: "text",
        isInternalNote: 0,
        createdAt: nowIso,
        readByUserAt: nowIso,
        readByAdminAt: null,
      });

      updateTicketStateStatement.run({
        id: ticket.id,
        category: ticket.category,
        subject: ticket.subject,
        status: "pending_admin",
        priority: normalizeTicketPriority(ticket.priority, "normal"),
        assignedAdminUserId: ticket.assigned_admin_user_id,
        assignedAdminEmail: ticket.assigned_admin_email,
        lastMessagePreview: sanitizeShortText(sanitizedMessage, 180),
        lastMessageAt: nowIso,
        userUnreadCount: 0,
        adminUnreadCount: Math.max(0, toNumber(ticket.admin_unread_count, 0)) + 1,
        updatedAt: nowIso,
        resolvedAt: null,
        closedAt: null,
      });
    });

    tx();
    return findTicketByRefStatement.get(ticketRef);
  }

  function updateUserTicketStatus({ userId, ticketRef, status }) {
    const ticket = findTicketByRefStatement.get(ticketRef);
    assertTicketAccessForUser(ticket, userId);

    const nextStatus = normalizeTicketStatus(status, ticket.status || "open");
    if (!["open", "closed"].includes(nextStatus)) {
      throw new Error("Unsupported ticket status update.");
    }

    const nowIso = toIso(getNow());

    updateTicketStateStatement.run({
      id: ticket.id,
      category: ticket.category,
      subject: ticket.subject,
      status: nextStatus,
      priority: normalizeTicketPriority(ticket.priority, "normal"),
      assignedAdminUserId: ticket.assigned_admin_user_id,
      assignedAdminEmail: ticket.assigned_admin_email,
      lastMessagePreview: ticket.last_message_preview,
      lastMessageAt: ticket.last_message_at || nowIso,
      userUnreadCount: toNumber(ticket.user_unread_count, 0),
      adminUnreadCount: toNumber(ticket.admin_unread_count, 0),
      updatedAt: nowIso,
      resolvedAt: nextStatus === "open" ? null : ticket.resolved_at,
      closedAt: nextStatus === "closed" ? nowIso : null,
    });

    return findTicketByRefStatement.get(ticketRef);
  }

  function getUserTicketOrThrow({ userId, ticketRef }) {
    const ticket = findTicketByRefStatement.get(ticketRef);
    assertTicketAccessForUser(ticket, userId);
    return ticket;
  }

  function getAdminTicketOrThrow(ticketRef) {
    const ticket = findTicketByRefStatement.get(ticketRef);
    if (!ticket) {
      throw new Error("Support ticket not found.");
    }
    return ticket;
  }

  function sendAdminMessage({ ticketRef, messageText, adminUserId, adminEmail, senderName, isInternalNote = false }) {
    const ticket = getAdminTicketOrThrow(ticketRef);
    const sanitizedMessage = sanitizeMessageText(messageText, 3000);
    if (!sanitizedMessage) {
      throw new Error("Reply message is required.");
    }

    const nowIso = toIso(getNow());
    const noteMode = normalizeBoolean(isInternalNote, false);

    const tx = db.transaction(() => {
      insertTicketMessageStatement.run({
        ticketId: ticket.id,
        ticketRef: ticket.ticket_ref,
        senderRole: "admin",
        senderUserId: adminUserId,
        senderName: sanitizeShortText(senderName || "Support Admin", 120),
        senderEmail: sanitizeShortText(adminEmail || "", 180),
        messageText: sanitizedMessage,
        messageType: noteMode ? "note" : "text",
        isInternalNote: noteMode ? 1 : 0,
        createdAt: nowIso,
        readByUserAt: noteMode ? nowIso : null,
        readByAdminAt: nowIso,
      });

      updateTicketStateStatement.run({
        id: ticket.id,
        category: ticket.category,
        subject: ticket.subject,
        status: noteMode ? normalizeTicketStatus(ticket.status || "open") : "pending_user",
        priority: normalizeTicketPriority(ticket.priority, "normal"),
        assignedAdminUserId: ticket.assigned_admin_user_id || adminUserId,
        assignedAdminEmail: ticket.assigned_admin_email || adminEmail,
        lastMessagePreview: sanitizeShortText(sanitizedMessage, 180),
        lastMessageAt: nowIso,
        userUnreadCount: noteMode ? toNumber(ticket.user_unread_count, 0) : Math.max(0, toNumber(ticket.user_unread_count, 0)) + 1,
        adminUnreadCount: 0,
        updatedAt: nowIso,
        resolvedAt: ticket.resolved_at,
        closedAt: noteMode ? ticket.closed_at : null,
      });

      writeAdminAudit({
        adminUserId,
        adminEmail,
        actionType: noteMode ? "ticket_note" : "ticket_reply",
        targetType: "support_ticket",
        targetId: ticket.ticket_ref,
        note: sanitizeShortText(sanitizedMessage, 260),
        createdAt: nowIso,
      });
    });

    tx();
    return findTicketByRefStatement.get(ticketRef);
  }

  function updateAdminTicket({
    ticketRef,
    status,
    priority,
    assignedAdminUserId,
    assignedAdminEmail,
    note,
    adminUserId,
    adminEmail,
  }) {
    const ticket = getAdminTicketOrThrow(ticketRef);
    const nowIso = toIso(getNow());

    const nextStatus = status ? normalizeTicketStatus(status, ticket.status || "open") : normalizeTicketStatus(ticket.status || "open");
    const nextPriority = priority
      ? normalizeTicketPriority(priority, normalizeTicketPriority(ticket.priority, "normal"))
      : normalizeTicketPriority(ticket.priority, "normal");

    const nextAssignedUserId =
      assignedAdminUserId === undefined
        ? ticket.assigned_admin_user_id
        : sanitizeShortText(assignedAdminUserId || "", 80) || null;

    const nextAssignedEmail =
      assignedAdminEmail === undefined
        ? ticket.assigned_admin_email
        : sanitizeShortText(assignedAdminEmail || "", 180) || null;

    let resolvedAt = ticket.resolved_at;
    let closedAt = ticket.closed_at;

    if (nextStatus === "resolved") {
      resolvedAt = nowIso;
      closedAt = null;
    }
    if (nextStatus === "closed") {
      closedAt = nowIso;
    }
    if (nextStatus === "open" || nextStatus === "pending_admin" || nextStatus === "pending_user") {
      resolvedAt = null;
      closedAt = null;
    }

    updateTicketStateStatement.run({
      id: ticket.id,
      category: ticket.category,
      subject: ticket.subject,
      status: nextStatus,
      priority: nextPriority,
      assignedAdminUserId: nextAssignedUserId,
      assignedAdminEmail: nextAssignedEmail,
      lastMessagePreview: ticket.last_message_preview,
      lastMessageAt: ticket.last_message_at,
      userUnreadCount: toNumber(ticket.user_unread_count, 0),
      adminUnreadCount: toNumber(ticket.admin_unread_count, 0),
      updatedAt: nowIso,
      resolvedAt,
      closedAt,
    });

    writeAdminAudit({
      adminUserId,
      adminEmail,
      actionType: "ticket_update",
      targetType: "support_ticket",
      targetId: ticket.ticket_ref,
      note: sanitizeShortText(note || "status/priority/assignee updated", 260),
      createdAt: nowIso,
    });

    return findTicketByRefStatement.get(ticketRef);
  }

  function buildUserTicketSummary(userId) {
    return {
      totalTickets: toNumber(countTicketsByUserStatement.get({ userId, statusFilter: "all" })?.total, 0),
      openTickets: toNumber(countUserTicketsByStatusStatement.get({ userId, status: "open" })?.total, 0),
      pendingAdminTickets: toNumber(countUserTicketsByStatusStatement.get({ userId, status: "pending_admin" })?.total, 0),
      pendingUserTickets: toNumber(countUserTicketsByStatusStatement.get({ userId, status: "pending_user" })?.total, 0),
      resolvedTickets: toNumber(countUserTicketsByStatusStatement.get({ userId, status: "resolved" })?.total, 0),
      closedTickets: toNumber(countUserTicketsByStatusStatement.get({ userId, status: "closed" })?.total, 0),
      unreadMessages: toNumber(countUserUnreadStatement.get(userId)?.total, 0),
    };
  }

  function buildAdminTicketSummary() {
    const now = getNow();
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);

    return {
      totalTickets: toNumber(countAllTicketsStatement.get()?.total, 0),
      openTickets: toNumber(countTicketsByStatusStatement.get("open")?.total, 0),
      pendingAdminTickets: toNumber(countTicketsByStatusStatement.get("pending_admin")?.total, 0),
      pendingUserTickets: toNumber(countTicketsByStatusStatement.get("pending_user")?.total, 0),
      resolvedTickets: toNumber(countTicketsByStatusStatement.get("resolved")?.total, 0),
      closedTickets: toNumber(countTicketsByStatusStatement.get("closed")?.total, 0),
      highPriorityTickets: toNumber(countTicketsByPriorityStatement.get("high")?.total, 0),
      urgentPriorityTickets: toNumber(countTicketsByPriorityStatement.get("urgent")?.total, 0),
      unreadForAdmin: toNumber(sumAdminUnreadStatement.get()?.total, 0),
      unreadForUsers: toNumber(sumUserUnreadStatement.get()?.total, 0),
      createdToday: toNumber(countTodayTicketsStatement.get(toIso(midnight))?.total, 0),
    };
  }

  function handleSupportTicketsList(req, res) {
    try {
      const statusFilter = normalizeListStatus(parseRequestValue(req, "status", "all"));
      const { page, limit, offset } = buildPagination(parseRequestValue(req, "page", 1), parseRequestValue(req, "limit", 20), 20, 200);
      const userId = req.currentUser.userId;

      const rows = listTicketsByUserStatement
        .all({ userId, statusFilter, limit, offset })
        .map((row) => mapTicketRow(row));
      const total = toNumber(countTicketsByUserStatement.get({ userId, statusFilter })?.total, 0);

      res.json({
        summary: buildUserTicketSummary(userId),
        pagination: {
          page,
          limit,
          total,
          hasMore: offset + rows.length < total,
        },
        rows,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load support tickets." });
    }
  }

  function handleSupportTicketDetail(req, res) {
    try {
      const ticketRef = sanitizeShortText(
        req?.params?.ticketRef || parseRequestValue(req, "ticketRef", ""),
        80,
      );
      if (!ticketRef) {
        throw new Error("Ticket reference is required.");
      }

      const ticket = getUserTicketOrThrow({ userId: req.currentUser.userId, ticketRef });
      const nowIso = toIso(getNow());
      touchTicketAsUserRead(ticket.id, nowIso);

      const updatedTicket = findTicketByRefStatement.get(ticketRef);
      const totalMessages = toNumber(countTicketMessagesStatement.get(ticket.id)?.total, 0);

      res.json({
        ticket: mapTicketRow(updatedTicket),
        messages: getTicketMessages(ticket.id, 1, 400),
        meta: {
          totalMessages,
        },
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load support ticket." });
    }
  }

  function handleSupportTicketCreate(req, res) {
    try {
      const ticket = createUserTicket({
        userId: req.currentUser.userId,
        subject: parseRequestValue(req, "subject", ""),
        messageText: parseRequestValue(req, "message", ""),
        category: parseRequestValue(req, "category", "general"),
      });

      res.json({
        message: "Support ticket created successfully.",
        ticket: mapTicketRow(ticket),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not create support ticket." });
    }
  }

  function handleSupportTicketMessageSend(req, res) {
    try {
      const ticketRef = sanitizeShortText(
        req?.params?.ticketRef || parseRequestValue(req, "ticketRef", ""),
        80,
      );
      if (!ticketRef) {
        throw new Error("Ticket reference is required.");
      }

      const updatedTicket = sendUserMessage({
        userId: req.currentUser.userId,
        ticketRef,
        messageText: parseRequestValue(req, "message", ""),
      });

      res.json({
        message: "Message sent to support successfully.",
        ticket: mapTicketRow(updatedTicket),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not send support message." });
    }
  }

  function handleSupportTicketStatusUpdate(req, res) {
    try {
      const ticketRef = sanitizeShortText(
        req?.params?.ticketRef || parseRequestValue(req, "ticketRef", ""),
        80,
      );
      const status = parseRequestValue(req, "status", "");
      if (!ticketRef) {
        throw new Error("Ticket reference is required.");
      }

      const updatedTicket = updateUserTicketStatus({
        userId: req.currentUser.userId,
        ticketRef,
        status,
      });

      res.json({
        message: "Support ticket status updated.",
        ticket: mapTicketRow(updatedTicket),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not update support ticket status." });
    }
  }

  function handleAdminSupportDashboardSummary(req, res) {
    try {
      res.json({ summary: buildAdminTicketSummary() });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load support dashboard summary." });
    }
  }

  function handleAdminSupportTickets(req, res) {
    try {
      const statusFilter = normalizeListStatus(parseRequestValue(req, "status", "all"));
      const priorityFilter = normalizeListPriority(parseRequestValue(req, "priority", "all"));
      const assignedFilter = sanitizeShortText(parseRequestValue(req, "assigned", "all"), 80) || "all";
      const keyword = sanitizeShortText(parseRequestValue(req, "keyword", ""), 120);
      const { page, limit, offset } = buildPagination(parseRequestValue(req, "page", 1), parseRequestValue(req, "limit", 30), 30, 300);

      const rows = listTicketsForAdminStatement
        .all({
          statusFilter,
          priorityFilter,
          assignedFilter,
          keyword,
          keywordLike: keyword ? `%${keyword}%` : "",
          limit,
          offset,
        })
        .map((row) => mapTicketRow(row));

      const total = toNumber(
        countTicketsForAdminStatement.get({
          statusFilter,
          priorityFilter,
          assignedFilter,
          keyword,
          keywordLike: keyword ? `%${keyword}%` : "",
        })?.total,
        0,
      );

      res.json({
        summary: buildAdminTicketSummary(),
        pagination: {
          page,
          limit,
          total,
          hasMore: offset + rows.length < total,
        },
        rows,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load support tickets." });
    }
  }

  function handleAdminSupportTicketDetail(req, res) {
    try {
      const ticketRef = sanitizeShortText(
        req?.params?.ticketRef || parseRequestValue(req, "ticketRef", ""),
        80,
      );
      if (!ticketRef) {
        throw new Error("Ticket reference is required.");
      }

      const ticket = getAdminTicketOrThrow(ticketRef);
      const nowIso = toIso(getNow());
      touchTicketAsAdminRead(ticket.id, nowIso);

      const updatedTicket = findTicketByRefStatement.get(ticketRef);
      const totalMessages = toNumber(countTicketMessagesStatement.get(ticket.id)?.total, 0);

      res.json({
        ticket: mapTicketRow(updatedTicket),
        messages: getTicketMessages(ticket.id, 1, 500),
        meta: {
          totalMessages,
        },
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load support ticket detail." });
    }
  }

  function handleAdminSupportReply(req, res) {
    try {
      const ticketRef = sanitizeShortText(parseRequestValue(req, "ticketRef", ""), 80);
      if (!ticketRef) {
        throw new Error("Ticket reference is required.");
      }

      const updatedTicket = sendAdminMessage({
        ticketRef,
        messageText: parseRequestValue(req, "message", ""),
        adminUserId: req.currentUser.userId,
        adminEmail: req.currentUser.email,
        senderName: req.currentUser.name,
        isInternalNote: parseRequestValue(req, "isInternalNote", false),
      });

      res.json({
        message: "Reply sent successfully.",
        ticket: mapTicketRow(updatedTicket),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not send support reply." });
    }
  }

  function handleAdminSupportTicketUpdate(req, res) {
    try {
      const ticketRef = sanitizeShortText(parseRequestValue(req, "ticketRef", ""), 80);
      if (!ticketRef) {
        throw new Error("Ticket reference is required.");
      }

      const updatedTicket = updateAdminTicket({
        ticketRef,
        status: parseRequestValue(req, "status", undefined),
        priority: parseRequestValue(req, "priority", undefined),
        assignedAdminUserId: parseRequestValue(req, "assignedAdminUserId", undefined),
        assignedAdminEmail: parseRequestValue(req, "assignedAdminEmail", undefined),
        note: parseRequestValue(req, "note", ""),
        adminUserId: req.currentUser.userId,
        adminEmail: req.currentUser.email,
      });

      res.json({
        message: "Support ticket updated successfully.",
        ticket: mapTicketRow(updatedTicket),
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not update support ticket." });
    }
  }

  function handleAdminSupportAuditLogs(req, res) {
    try {
      const keyword = sanitizeShortText(parseRequestValue(req, "keyword", ""), 120);
      const { page, limit, offset } = buildPagination(parseRequestValue(req, "page", 1), parseRequestValue(req, "limit", 50), 50, 300);

      const rows = listAdminAuditLogsStatement
        .all({
          keyword,
          keywordLike: keyword ? `%${keyword}%` : "",
          limit,
          offset,
        })
        .map((row) => ({
          logId: toNumber(row.id, 0),
          adminUserId: String(row.admin_user_id || ""),
          adminEmail: String(row.admin_email || ""),
          actionType: String(row.action_type || ""),
          targetType: String(row.target_type || ""),
          targetId: String(row.target_id || ""),
          note: String(row.note || ""),
          createdAt: String(row.created_at || ""),
        }));

      const total = toNumber(
        countAdminAuditLogsStatement.get({
          keyword,
          keywordLike: keyword ? `%${keyword}%` : "",
        })?.total,
        0,
      );

      res.json({
        pagination: {
          page,
          limit,
          total,
          hasMore: offset + rows.length < total,
        },
        rows,
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not load support audit logs." });
    }
  }

  function seedInitialSystemTicketIfEmpty() {
    const total = toNumber(countAllTicketsStatement.get()?.total, 0);
    if (total > 0) {
      return;
    }

    const adminAccount = db.prepare("SELECT user_id, email, name FROM users WHERE account_role IN ('admin','super_admin') ORDER BY created_at ASC LIMIT 1").get();
    const userAccount = db.prepare("SELECT user_id, email, name FROM users WHERE account_role NOT IN ('admin','super_admin') ORDER BY created_at ASC LIMIT 1").get();
    if (!userAccount) {
      return;
    }

    const nowIso = toIso(getNow());
    const ticketRef = buildSupportRef();

    const tx = db.transaction(() => {
      insertTicketStatement.run({
        ticketRef,
        userId: userAccount.user_id,
        category: "onboarding",
        subject: "Welcome to premium support",
        status: "pending_user",
        priority: "normal",
        assignedAdminUserId: adminAccount?.user_id || null,
        assignedAdminEmail: adminAccount?.email || null,
        lastMessagePreview: "Welcome! If you need help with deposit, assets, or trading, reply here.",
        lastMessageAt: nowIso,
        userUnreadCount: 1,
        adminUnreadCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
        resolvedAt: null,
        closedAt: null,
      });

      const inserted = findTicketByRefStatement.get(ticketRef);
      if (!inserted) {
        return;
      }

      insertTicketMessageStatement.run({
        ticketId: inserted.id,
        ticketRef,
        senderRole: "admin",
        senderUserId: adminAccount?.user_id || "system",
        senderName: adminAccount?.name || "Support Team",
        senderEmail: adminAccount?.email || "",
        messageText: "Welcome! If you need help with deposit, assets, or trading, reply here.",
        messageType: "text",
        isInternalNote: 0,
        createdAt: nowIso,
        readByUserAt: null,
        readByAdminAt: nowIso,
      });
    });

    tx();
  }

  seedInitialSystemTicketIfEmpty();

  return {
    handleSupportTicketsList,
    handleSupportTicketDetail,
    handleSupportTicketCreate,
    handleSupportTicketMessageSend,
    handleSupportTicketStatusUpdate,
    handleAdminSupportDashboardSummary,
    handleAdminSupportTickets,
    handleAdminSupportTicketDetail,
    handleAdminSupportReply,
    handleAdminSupportTicketUpdate,
    handleAdminSupportAuditLogs,
  };
}
