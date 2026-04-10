import { useMemo, useState } from "react";
import { KYC_REVIEW_TABS } from "../constants";
import { formatCompactNumber } from "../utils/format";

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

function formatStatusLabel(status = "") {
  const normalized = normalizeText(status);
  if (!normalized) {
    return "Pending";
  }
  return normalized[0].toUpperCase() + normalized.slice(1);
}

function formatCertification(value = "") {
  const normalized = normalizeText(value).replace(/_/g, " ");
  if (!normalized) {
    return "NID";
  }

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function isPdfDataUrl(value = "") {
  return normalizeText(value).startsWith("data:application/pdf");
}

function isImageDataUrl(value = "") {
  return normalizeText(value).startsWith("data:image/");
}

function getKycStatusClass(status = "") {
  const normalized = normalizeText(status);
  if (normalized === "authenticated") {
    return "authenticated";
  }
  if (normalized === "rejected") {
    return "rejected";
  }
  return "pending";
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

function MediaPreview({ title, fileName, fileData }) {
  const hasMedia = Boolean(String(fileData || "").trim());

  if (!hasMedia) {
    return (
      <article className="adminx-kyc-media-card">
        <header>
          <h4>{title}</h4>
          <small>{fileName || "-"}</small>
        </header>
        <div className="adminx-kyc-media-empty">No file uploaded.</div>
      </article>
    );
  }

  return (
    <article className="adminx-kyc-media-card">
      <header>
        <h4>{title}</h4>
        <small>{fileName || "-"}</small>
      </header>

      {isImageDataUrl(fileData) ? (
        <div className="adminx-kyc-media-viewport">
          <img src={fileData} alt={`${title} preview`} />
        </div>
      ) : null}

      {isPdfDataUrl(fileData) ? (
        <div className="adminx-kyc-media-viewport adminx-kyc-media-viewport-pdf">
          <iframe src={fileData} title={`${title} PDF`} />
        </div>
      ) : null}

      {!isImageDataUrl(fileData) && !isPdfDataUrl(fileData) ? (
        <div className="adminx-kyc-media-empty">This file type is not previewable. Download it below.</div>
      ) : null}

      <a className="btn btn-ghost" href={fileData} target="_blank" rel="noreferrer" download={fileName || undefined}>
        <i className="fas fa-download" /> Download File
      </a>
    </article>
  );
}

export default function KycReviewPage({
  requests,
  stats,
  loading,
  searchValue,
  onSearchChange,
  onRefresh,
  onReviewRequest,
}) {
  const [requestTab, setRequestTab] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [certificationFilter, setCertificationFilter] = useState("all");

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailRequest, setDetailRequest] = useState(null);

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewDecision, setReviewDecision] = useState("authenticated");
  const [reviewNote, setReviewNote] = useState("");

  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");

  const filteredRequests = useMemo(() => {
    const keyword = normalizeText(searchValue);

    return (Array.isArray(requests) ? requests : []).filter((request) => {
      const status = normalizeText(request.status);
      const certification = normalizeText(request.certification);

      if (requestTab !== "all" && status !== requestTab) {
        return false;
      }

      if (certificationFilter !== "all" && certification !== certificationFilter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [
        request.requestId,
        request.userId,
        request.accountName,
        request.accountEmail,
        request.fullName,
        request.certification,
      ]
        .map((value) => normalizeText(value))
        .some((value) => value.includes(keyword));
    });
  }, [certificationFilter, requestTab, requests, searchValue]);

  const openDetailModal = (request) => {
    setDetailRequest(request || null);
    setDetailModalOpen(true);
  };

  const openReviewModal = (request, decision) => {
    setActionError("");
    setActionNotice("");
    setReviewTarget(request || null);
    setReviewDecision(decision);
    setReviewNote("");
    setReviewModalOpen(true);
  };

  const submitReview = async () => {
    const requestId = Number(reviewTarget?.requestId || 0);
    if (!requestId) {
      return;
    }

    if (reviewDecision === "rejected" && !String(reviewNote || "").trim()) {
      setActionError("Reject reason is required.");
      return;
    }

    setActionSubmitting(true);
    setActionError("");
    setActionNotice("");

    try {
      const response = await onReviewRequest({
        requestId,
        decision: reviewDecision,
        note: reviewNote,
      });

      setReviewModalOpen(false);
      setReviewTarget(null);
      setActionNotice(response?.message || "KYC request updated.");

      if (detailRequest?.requestId === requestId) {
        setDetailRequest((prev) => {
          if (!prev) {
            return prev;
          }

          return {
            ...prev,
            status: reviewDecision,
            note: String(reviewNote || "").trim(),
            reviewedAt: new Date().toISOString(),
            reviewedBy: "admin",
          };
        });
      }
    } catch (error) {
      setActionError(error.message || "Could not update KYC request.");
    } finally {
      setActionSubmitting(false);
    }
  };

  return (
    <section className="adminx-users-shell">
      <div className="adminx-user-tabs" role="tablist" aria-label="KYC request filters">
        {KYC_REVIEW_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={requestTab === tab.key}
            className={requestTab === tab.key ? "active" : ""}
            onClick={() => setRequestTab(tab.key)}
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
              placeholder="Search by request ID, user ID, name, or email..."
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

          <span className="adminx-user-count">{filteredRequests.length} requests</span>
        </div>

        {filterOpen ? (
          <div className="adminx-filter-panel adminx-filter-panel-single">
            <label>
              Certification
              <select value={certificationFilter} onChange={(event) => setCertificationFilter(event.target.value)}>
                <option value="all">All</option>
                <option value="nid">NID</option>
                <option value="passport">Passport</option>
                <option value="driving_license">Driving License</option>
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
                <th>Request</th>
                <th>User</th>
                <th>Submitted KYC Name</th>
                <th>Certification</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Reviewed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((request) => {
                const statusClass = getKycStatusClass(request.status);
                return (
                  <tr key={`${request.requestId}-${request.userId}`}>
                    <td>#{request.requestId}</td>
                    <td>
                      <div className="adminx-user-cell-name">
                        <span className="adminx-user-avatar">{getInitials(request.accountName || request.fullName)}</span>
                        <span>
                          <strong>{request.accountName || "Unknown User"}</strong>
                          <small className="adminx-table-subtext">{request.accountEmail || request.userId || "-"}</small>
                        </span>
                      </div>
                    </td>
                    <td>{request.fullName || "-"}</td>
                    <td>{formatCertification(request.certification)}</td>
                    <td>
                      <span className={`adminx-tag adminx-tag-kyc-${statusClass}`}>{formatStatusLabel(request.status)}</span>
                    </td>
                    <td>{formatTime(request.submittedAt)}</td>
                    <td>{request.reviewedAt ? formatTime(request.reviewedAt) : "-"}</td>
                    <td>
                      <div className="adminx-row-actions">
                        <button type="button" title="View request details" onClick={() => openDetailModal(request)}>
                          <i className="fas fa-eye" />
                        </button>
                        <button
                          type="button"
                          title="Approve request"
                          onClick={() => openReviewModal(request, "authenticated")}
                          disabled={actionSubmitting}
                        >
                          <i className="fas fa-check" />
                        </button>
                        <button
                          type="button"
                          title="Reject request"
                          onClick={() => openReviewModal(request, "rejected")}
                          disabled={actionSubmitting}
                        >
                          <i className="fas fa-xmark" />
                        </button>
                        <button
                          type="button"
                          title="Move back to pending"
                          onClick={() => openReviewModal(request, "pending")}
                          disabled={actionSubmitting}
                        >
                          <i className="fas fa-rotate-left" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!filteredRequests.length ? (
            <div className="adminx-users-empty">
              <p>No KYC requests found for this filter.</p>
            </div>
          ) : null}
        </div>

        <footer className="adminx-user-footer">
          <span>Showing {filteredRequests.length} of {Array.isArray(requests) ? requests.length : 0} requests</span>
          <span>Pending: {formatCompactNumber(stats?.pendingKycRequests || 0)}</span>
          <span>Approved: {formatCompactNumber(stats?.authenticatedKycRequests || 0)}</span>
          <span>Rejected: {formatCompactNumber(stats?.rejectedKycRequests || 0)}</span>
          <span>Total requests: {formatCompactNumber(stats?.totalKycRequests || 0)}</span>
        </footer>
      </section>

      {detailModalOpen && detailRequest ? (
        <div className="adminx-modal-backdrop" onClick={() => setDetailModalOpen(false)}>
          <section className="adminx-profile-modal adminx-kyc-detail-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>KYC Request Details</h2>
              <button type="button" className="adminx-icon-btn" onClick={() => setDetailModalOpen(false)} title="Close">
                <i className="fas fa-xmark" />
              </button>
            </header>

            <div className="adminx-profile-grid adminx-kyc-detail-grid">
              <p><span>Request ID</span><strong>#{detailRequest.requestId}</strong></p>
              <p><span>User ID</span><strong>{detailRequest.userId || "-"}</strong></p>
              <p><span>Account Name</span><strong>{detailRequest.accountName || "-"}</strong></p>
              <p><span>Account Email</span><strong>{detailRequest.accountEmail || "-"}</strong></p>
              <p><span>KYC Full Name</span><strong>{detailRequest.fullName || "-"}</strong></p>
              <p><span>Certification</span><strong>{formatCertification(detailRequest.certification)}</strong></p>
              <p><span>Status</span><strong>{formatStatusLabel(detailRequest.status)}</strong></p>
              <p><span>Submitted At</span><strong>{formatTime(detailRequest.submittedAt)}</strong></p>
              <p><span>Reviewed At</span><strong>{formatTime(detailRequest.reviewedAt)}</strong></p>
              <p><span>Reviewed By</span><strong>{detailRequest.reviewedBy || "-"}</strong></p>
              <p><span>SSN</span><strong>{detailRequest.ssn || "-"}</strong></p>
              <p><span>Note</span><strong>{detailRequest.note || "-"}</strong></p>
            </div>

            <section className="adminx-detail-section">
              <h3>Submitted Documents</h3>
              <div className="adminx-kyc-media-grid">
                <MediaPreview
                  title="NID Front"
                  fileName={detailRequest.frontFileName}
                  fileData={detailRequest.frontFileData}
                />
                <MediaPreview
                  title="NID Back"
                  fileName={detailRequest.backFileName}
                  fileData={detailRequest.backFileData}
                />
              </div>
            </section>

            <div className="adminx-profile-actions">
              <button type="button" className="btn btn-success" onClick={() => openReviewModal(detailRequest, "authenticated")}>
                Approve KYC
              </button>
              <button type="button" className="btn btn-danger" onClick={() => openReviewModal(detailRequest, "rejected")}>
                Reject KYC
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => openReviewModal(detailRequest, "pending")}>
                Mark Pending
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {reviewModalOpen && reviewTarget ? (
        <div className="adminx-modal-backdrop" onClick={() => setReviewModalOpen(false)}>
          <section className="adminx-profile-modal adminx-delete-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>
                {reviewDecision === "authenticated"
                  ? "Approve KYC"
                  : reviewDecision === "rejected"
                    ? "Reject KYC"
                    : "Move Request To Pending"}
              </h2>
              <button type="button" className="adminx-icon-btn" onClick={() => setReviewModalOpen(false)} title="Close">
                <i className="fas fa-xmark" />
              </button>
            </header>

            <p className="adminx-page-note">
              Request <strong>#{reviewTarget.requestId}</strong> for <strong>{reviewTarget.accountEmail || reviewTarget.userId}</strong>
            </p>

            <label className="adminx-review-note-field">
              <span>
                Admin Note
                {reviewDecision === "rejected" ? " (required)" : " (optional)"}
              </span>
              <textarea
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder={
                  reviewDecision === "authenticated"
                    ? "Optional approval note"
                    : reviewDecision === "rejected"
                      ? "Explain reject reason"
                      : "Optional note for pending reset"
                }
                rows={4}
              />
            </label>

            <div className="adminx-profile-actions">
              <button type="button" className="btn btn-ghost" disabled={actionSubmitting} onClick={() => setReviewModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={actionSubmitting} onClick={submitReview}>
                {actionSubmitting ? "Saving..." : "Confirm"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
