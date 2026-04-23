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

function formatUsd(value = 0) {
  return `$${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatStatus(value = "") {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "Pending";
  }
  return normalized[0].toUpperCase() + normalized.slice(1);
}

function getStatusClass(value = "") {
  const normalized = normalizeText(value);
  if (normalized === "approved" || normalized === "authenticated") {
    return "authenticated";
  }
  if (normalized === "rejected") {
    return "rejected";
  }
  if (normalized === "suspended") {
    return "suspended";
  }
  return "pending";
}

function shortenAddress(value = "") {
  const text = String(value || "").trim();
  if (text.length <= 28) {
    return text;
  }
  return `${text.slice(0, 14)}...${text.slice(-10)}`;
}

function isImageData(value = "") {
  return normalizeText(value).startsWith("data:image/");
}

function isPdfData(value = "") {
  return normalizeText(value).startsWith("data:application/pdf");
}

export default function DepositManagementPage({
  assets,
  requests,
  stats,
  loading,
  searchValue,
  onSearchChange,
  onRefresh,
  onUpsertAsset,
  onDeleteAsset,
  onReviewRequest,
}) {
  const [sectionTab, setSectionTab] = useState("assets");
  const [requestStatusFilter, setRequestStatusFilter] = useState("all");

  const [assetForm, setAssetForm] = useState({
    assetId: "",
    symbol: "",
    name: "",
    chainName: "",
    rechargeAddress: "",
    qrCodeData: "",
    minAmountUsd: "10",
    maxAmountUsd: "250000",
    sortOrder: "0",
    isEnabled: true,
  });

  const [actionNotice, setActionNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [savingAsset, setSavingAsset] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingAsset, setDeletingAsset] = useState(false);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailRequest, setDetailRequest] = useState(null);

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewDecision, setReviewDecision] = useState("approved");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const assetsList = Array.isArray(assets) ? assets : [];
  const requestList = Array.isArray(requests) ? requests : [];
  const keyword = normalizeText(searchValue);

  const filteredAssets = useMemo(() => {
    if (!keyword) {
      return assetsList;
    }
    return assetsList.filter((asset) => {
      const candidate = `${asset.symbol} ${asset.name} ${asset.chainName} ${asset.rechargeAddress}`.toLowerCase();
      return candidate.includes(keyword);
    });
  }, [assetsList, keyword]);

  const filteredRequests = useMemo(() => {
    return requestList.filter((request) => {
      const status = normalizeText(request.status);
      if (requestStatusFilter !== "all" && status !== requestStatusFilter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const candidate = `${request.requestId} ${request.userId} ${request.accountEmail} ${request.accountName} ${request.assetSymbol} ${request.chainName}`.toLowerCase();
      return candidate.includes(keyword);
    });
  }, [keyword, requestList, requestStatusFilter]);

  const resetAssetForm = () => {
    setAssetForm({
      assetId: "",
      symbol: "",
      name: "",
      chainName: "",
      rechargeAddress: "",
      qrCodeData: "",
      minAmountUsd: "10",
      maxAmountUsd: "250000",
      sortOrder: "0",
      isEnabled: true,
    });
  };

  const handleAssetField = (key, value) => {
    setAssetForm((prev) => ({ ...prev, [key]: value }));
  };

  const submitAsset = async (event) => {
    event.preventDefault();
    setActionError("");
    setActionNotice("");

    if (!assetForm.symbol.trim()) {
      setActionError("Symbol is required.");
      return;
    }
    if (!assetForm.name.trim()) {
      setActionError("Asset name is required.");
      return;
    }
    if (!assetForm.chainName.trim()) {
      setActionError("Chain name is required.");
      return;
    }
    if (!assetForm.rechargeAddress.trim()) {
      setActionError("Recharge address is required.");
      return;
    }
    if (!assetForm.qrCodeData.trim()) {
      setActionError("QR code data is required.");
      return;
    }

    setSavingAsset(true);
    try {
      const response = await onUpsertAsset({
        assetId: assetForm.assetId ? Number(assetForm.assetId) : undefined,
        symbol: assetForm.symbol,
        name: assetForm.name,
        chainName: assetForm.chainName,
        rechargeAddress: assetForm.rechargeAddress,
        qrCodeData: assetForm.qrCodeData,
        minAmountUsd: Number(assetForm.minAmountUsd || 0),
        maxAmountUsd: Number(assetForm.maxAmountUsd || 0),
        sortOrder: Number(assetForm.sortOrder || 0),
        isEnabled: Boolean(assetForm.isEnabled),
      });

      setActionNotice(response?.message || "Deposit asset saved.");
      resetAssetForm();
    } catch (error) {
      setActionError(error.message || "Could not save deposit asset.");
    } finally {
      setSavingAsset(false);
    }
  };

  const startAssetEdit = (asset) => {
    setActionError("");
    setActionNotice("");
    setAssetForm({
      assetId: String(asset.assetId || ""),
      symbol: String(asset.symbol || ""),
      name: String(asset.name || ""),
      chainName: String(asset.chainName || ""),
      rechargeAddress: String(asset.rechargeAddress || ""),
      qrCodeData: String(asset.qrCodeData || ""),
      minAmountUsd: String(asset.minAmountUsd ?? "0"),
      maxAmountUsd: String(asset.maxAmountUsd ?? "0"),
      sortOrder: String(asset.sortOrder ?? "0"),
      isEnabled: Boolean(asset.isEnabled),
    });
  };

  const requestAssetDelete = (asset) => {
    setActionError("");
    setActionNotice("");
    setDeleteTarget(asset || null);
    setDeleteModalOpen(true);
  };

  const confirmAssetDelete = async () => {
    const assetId = Number(deleteTarget?.assetId || 0);
    if (!assetId) {
      return;
    }

    setDeletingAsset(true);
    setActionError("");
    setActionNotice("");
    try {
      const response = await onDeleteAsset(assetId);
      setDeleteModalOpen(false);
      setDeleteTarget(null);
      setActionNotice(response?.message || "Deposit asset deleted.");
      if (String(assetForm.assetId) === String(assetId)) {
        resetAssetForm();
      }
    } catch (error) {
      setActionError(error.message || "Could not delete asset.");
    } finally {
      setDeletingAsset(false);
    }
  };

  const openRequestDetail = (request) => {
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

    setReviewSubmitting(true);
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
      setActionNotice(response?.message || "Deposit request updated.");

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
      setActionError(error.message || "Could not update deposit request.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  return (
    <section className="adminx-users-shell">
      <AdminSectionIntro
        icon={ADMIN_SECTION_META.depositCenter.icon}
        title={ADMIN_SECTION_META.depositCenter.title}
        description={ADMIN_SECTION_META.depositCenter.description}
        stats={[
          { label: "Assets", value: formatCompactNumber(stats?.totalAssets || 0) },
          { label: "Pending", value: formatCompactNumber(stats?.pendingRequests || 0) },
          { label: "Approved", value: formatCompactNumber(stats?.approvedRequests || 0) },
        ]}
      />

      <div className="adminx-user-tabs" role="tablist" aria-label="Deposit management tabs">
        <button
          type="button"
          role="tab"
          aria-selected={sectionTab === "assets"}
          className={sectionTab === "assets" ? "active" : ""}
          onClick={() => setSectionTab("assets")}
        >
          Add Deposit Crypto
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sectionTab === "requests"}
          className={sectionTab === "requests" ? "active" : ""}
          onClick={() => setSectionTab("requests")}
        >
          Deposit Request Desk
        </button>
      </div>

      {sectionTab === "assets" ? (
        <section className="adminx-user-table-card">
          <div className="adminx-user-toolbar">
            <label className="adminx-user-search">
              <i className="fas fa-search" />
              <input
                type="text"
                placeholder="Search asset by symbol, chain, or address..."
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </label>

            <div className="adminx-user-toolbar-actions">
              <button type="button" className="adminx-filter-btn" onClick={onRefresh}>
                <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} /> Refresh
              </button>
            </div>

            <span className="adminx-user-count">{filteredAssets.length} assets</span>
          </div>

          <div className="adminx-deposit-layout">
            <form className="adminx-deposit-asset-form" onSubmit={submitAsset}>
              <h3>{assetForm.assetId ? "Update Deposit Crypto" : "Add New Deposit Crypto"}</h3>

              <div className="adminx-deposit-grid-two">
                <label>
                  Symbol
                  <input
                    type="text"
                    value={assetForm.symbol}
                    onChange={(event) => handleAssetField("symbol", event.target.value.toUpperCase())}
                    placeholder="BTC"
                  />
                </label>

                <label>
                  Asset Name
                  <input
                    type="text"
                    value={assetForm.name}
                    onChange={(event) => handleAssetField("name", event.target.value)}
                    placeholder="Bitcoin"
                  />
                </label>
              </div>

              <div className="adminx-deposit-grid-two">
                <label>
                  Chain Name
                  <input
                    type="text"
                    value={assetForm.chainName}
                    onChange={(event) => handleAssetField("chainName", event.target.value)}
                    placeholder="Bitcoin Mainnet"
                  />
                </label>

                <label>
                  Sort Order
                  <input
                    type="number"
                    value={assetForm.sortOrder}
                    onChange={(event) => handleAssetField("sortOrder", event.target.value)}
                    placeholder="0"
                  />
                </label>
              </div>

              <label>
                Recharge Address
                <input
                  type="text"
                  value={assetForm.rechargeAddress}
                  onChange={(event) => handleAssetField("rechargeAddress", event.target.value)}
                  placeholder="Wallet address"
                />
              </label>

              <label>
                QR Code Data URL / Image URL
                <textarea
                  rows={3}
                  value={assetForm.qrCodeData}
                  onChange={(event) => handleAssetField("qrCodeData", event.target.value)}
                  placeholder="https://... or data:image/png;base64,..."
                />
              </label>

              <div className="adminx-deposit-grid-two">
                <label>
                  Min Amount (USD)
                  <input
                    type="number"
                    step="0.01"
                    value={assetForm.minAmountUsd}
                    onChange={(event) => handleAssetField("minAmountUsd", event.target.value)}
                  />
                </label>

                <label>
                  Max Amount (USD)
                  <input
                    type="number"
                    step="0.01"
                    value={assetForm.maxAmountUsd}
                    onChange={(event) => handleAssetField("maxAmountUsd", event.target.value)}
                  />
                </label>
              </div>

              <label className="adminx-checkbox-row">
                <input
                  type="checkbox"
                  checked={Boolean(assetForm.isEnabled)}
                  onChange={(event) => handleAssetField("isEnabled", event.target.checked)}
                />
                <span>Asset is enabled for user deposit</span>
              </label>

              {actionNotice ? <p className="adminx-auth-notice">{actionNotice}</p> : null}
              {actionError ? <p className="adminx-auth-error">{actionError}</p> : null}

              <div className="adminx-profile-actions">
                <button type="button" className="btn btn-ghost" onClick={resetAssetForm} disabled={savingAsset}>
                  Reset
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingAsset}>
                  {savingAsset ? "Saving..." : assetForm.assetId ? "Update Crypto" : "Add Crypto"}
                </button>
              </div>
            </form>

            <div className="adminx-deposit-asset-table-wrap">
              <table className="adminx-user-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th>Chain</th>
                    <th>Address</th>
                    <th>Limit</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map((asset) => (
                    <tr key={asset.assetId}>
                      <td>{asset.symbol}</td>
                      <td>{asset.name}</td>
                      <td>{asset.chainName}</td>
                      <td>{shortenAddress(asset.rechargeAddress)}</td>
                      <td>
                        {asset.minAmountUsd} - {asset.maxAmountUsd}
                      </td>
                      <td>
                        <span className={`adminx-tag adminx-tag-status-${asset.isEnabled ? "active" : "suspended"}`}>
                          {asset.isEnabled ? "Enabled" : "Disabled"}
                        </span>
                      </td>
                      <td>
                        <div className="adminx-row-actions">
                          <button type="button" title="Edit crypto" onClick={() => startAssetEdit(asset)}>
                            <i className="fas fa-pen" />
                          </button>
                          <button type="button" title="Delete crypto" onClick={() => requestAssetDelete(asset)}>
                            <i className="fas fa-trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!filteredAssets.length ? (
                <div className="adminx-users-empty">
                  <p>No deposit assets found.</p>
                </div>
              ) : null}
            </div>
          </div>

          <footer className="adminx-user-footer">
            <span>Total assets: {formatCompactNumber(stats?.totalAssets || assetsList.length)}</span>
            <span>Enabled assets: {formatCompactNumber(stats?.enabledAssets || 0)}</span>
            <span>Total requests: {formatCompactNumber(stats?.totalRequests || 0)}</span>
            <span>Pending requests: {formatCompactNumber(stats?.pendingRequests || 0)}</span>
          </footer>
        </section>
      ) : null}

      {sectionTab === "requests" ? (
        <section className="adminx-user-table-card">
          <div className="adminx-user-toolbar">
            <label className="adminx-user-search">
              <i className="fas fa-search" />
              <input
                type="text"
                placeholder="Search request, user, email, or asset..."
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </label>

            <div className="adminx-user-toolbar-actions">
              <select
                className="adminx-filter-btn adminx-filter-select"
                value={requestStatusFilter}
                onChange={(event) => setRequestStatusFilter(event.target.value)}
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>

              <button type="button" className="adminx-filter-btn" onClick={onRefresh}>
                <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} /> Refresh
              </button>
            </div>

            <span className="adminx-user-count">{filteredRequests.length} requests</span>
          </div>

          {actionNotice ? <p className="adminx-auth-notice adminx-inline-feedback">{actionNotice}</p> : null}
          {actionError ? <p className="adminx-auth-error adminx-inline-feedback">{actionError}</p> : null}

          <div className="adminx-user-table-wrap">
            <table className="adminx-user-table">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>User</th>
                  <th>Asset</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Reviewed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => (
                  <tr key={request.requestId}>
                    <td>#{request.requestId}</td>
                    <td>
                      <div className="adminx-user-cell-name">
                        <span className="adminx-user-avatar">{String(request.assetSymbol || "U").slice(0, 1)}</span>
                        <span>
                          <strong>{request.accountName || "Unknown User"}</strong>
                          <small className="adminx-table-subtext">{request.accountEmail || request.userId || "-"}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <strong>{request.assetSymbol}</strong>
                      <small className="adminx-table-subtext">{request.chainName}</small>
                    </td>
                    <td>{formatUsd(request.amountUsd)}</td>
                    <td>
                      <span className={`adminx-tag adminx-tag-kyc-${getStatusClass(request.status)}`}>
                        {formatStatus(request.status)}
                      </span>
                    </td>
                    <td>{formatTime(request.submittedAt)}</td>
                    <td>{formatTime(request.reviewedAt)}</td>
                    <td>
                      <div className="adminx-row-actions">
                        <button type="button" title="View request" onClick={() => openRequestDetail(request)}>
                          <i className="fas fa-eye" />
                        </button>
                        <button type="button" title="Approve" onClick={() => openReviewModal(request, "approved")}>
                          <i className="fas fa-check" />
                        </button>
                        <button type="button" title="Reject" onClick={() => openReviewModal(request, "rejected")}>
                          <i className="fas fa-xmark" />
                        </button>
                        <button type="button" title="Mark pending" onClick={() => openReviewModal(request, "pending")}>
                          <i className="fas fa-rotate-left" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!filteredRequests.length ? (
              <div className="adminx-users-empty">
                <p>No deposit requests found for this filter.</p>
              </div>
            ) : null}
          </div>

          <footer className="adminx-user-footer">
            <span>Total requests: {formatCompactNumber(stats?.totalRequests || requestList.length)}</span>
            <span>Pending: {formatCompactNumber(stats?.pendingRequests || 0)}</span>
            <span>Approved: {formatCompactNumber(stats?.approvedRequests || 0)}</span>
            <span>Rejected: {formatCompactNumber(stats?.rejectedRequests || 0)}</span>
          </footer>
        </section>
      ) : null}

      {deleteModalOpen && deleteTarget ? (
        <div className="adminx-modal-backdrop" onClick={() => setDeleteModalOpen(false)}>
          <section className="adminx-profile-modal adminx-delete-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Delete Deposit Crypto</h2>
              <button type="button" className="adminx-icon-btn" onClick={() => setDeleteModalOpen(false)}>
                <i className="fas fa-xmark" />
              </button>
            </header>

            <p className="adminx-page-note">
              Delete <strong>{deleteTarget.symbol}</strong> ({deleteTarget.chainName}) from deposit assets?
            </p>

            <div className="adminx-profile-actions">
              <button type="button" className="btn btn-ghost" disabled={deletingAsset} onClick={() => setDeleteModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" disabled={deletingAsset} onClick={confirmAssetDelete}>
                {deletingAsset ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {detailModalOpen && detailRequest ? (
        <div className="adminx-modal-backdrop" onClick={() => setDetailModalOpen(false)}>
          <section className="adminx-profile-modal adminx-deposit-detail-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>Deposit Request Details</h2>
              <button type="button" className="adminx-icon-btn" onClick={() => setDetailModalOpen(false)}>
                <i className="fas fa-xmark" />
              </button>
            </header>

            <div className="adminx-profile-grid adminx-kyc-detail-grid">
              <p><span>Request ID</span><strong>#{detailRequest.requestId}</strong></p>
              <p><span>User ID</span><strong>{detailRequest.userId || "-"}</strong></p>
              <p><span>Account Name</span><strong>{detailRequest.accountName || "-"}</strong></p>
              <p><span>Account Email</span><strong>{detailRequest.accountEmail || "-"}</strong></p>
              <p><span>Asset</span><strong>{detailRequest.assetSymbol}</strong></p>
              <p><span>Chain</span><strong>{detailRequest.chainName || "-"}</strong></p>
              <p><span>Amount</span><strong>{formatUsd(detailRequest.amountUsd)}</strong></p>
              <p><span>Status</span><strong>{formatStatus(detailRequest.status)}</strong></p>
              <p><span>Recharge Address</span><strong>{detailRequest.rechargeAddress || "-"}</strong></p>
              <p><span>Submitted At</span><strong>{formatTime(detailRequest.submittedAt)}</strong></p>
              <p><span>Reviewed At</span><strong>{formatTime(detailRequest.reviewedAt)}</strong></p>
              <p><span>Admin Note</span><strong>{detailRequest.note || "-"}</strong></p>
            </div>

            <section className="adminx-detail-section">
              <h3>Transaction Screenshot</h3>

              {isImageData(detailRequest.screenshotFileData) ? (
                <div className="adminx-kyc-media-viewport">
                  <img src={detailRequest.screenshotFileData} alt="Transaction screenshot" />
                </div>
              ) : null}

              {isPdfData(detailRequest.screenshotFileData) ? (
                <div className="adminx-kyc-media-viewport adminx-kyc-media-viewport-pdf">
                  <iframe src={detailRequest.screenshotFileData} title="Deposit screenshot PDF" />
                </div>
              ) : null}

              {!isImageData(detailRequest.screenshotFileData) && !isPdfData(detailRequest.screenshotFileData) ? (
                <div className="adminx-kyc-media-empty">This file type is not previewable. Download it below.</div>
              ) : null}

              {detailRequest.screenshotFileData ? (
                <a
                  className="btn btn-ghost"
                  href={detailRequest.screenshotFileData}
                  target="_blank"
                  rel="noreferrer"
                  download={detailRequest.screenshotFileName || undefined}
                >
                  <i className="fas fa-download" /> Download Screenshot
                </a>
              ) : null}
            </section>

            <div className="adminx-profile-actions">
              <button type="button" className="btn btn-success" onClick={() => openReviewModal(detailRequest, "approved")}>
                Approve
              </button>
              <button type="button" className="btn btn-danger" onClick={() => openReviewModal(detailRequest, "rejected")}>
                Reject
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
                {reviewDecision === "approved"
                  ? "Approve Deposit Request"
                  : reviewDecision === "rejected"
                    ? "Reject Deposit Request"
                    : "Move Request To Pending"}
              </h2>
              <button type="button" className="adminx-icon-btn" onClick={() => setReviewModalOpen(false)}>
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
                rows={4}
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder={
                  reviewDecision === "approved"
                    ? "Optional approval note"
                    : reviewDecision === "rejected"
                      ? "Explain reject reason"
                      : "Optional note for pending reset"
                }
              />
            </label>

            <div className="adminx-profile-actions">
              <button type="button" className="btn btn-ghost" disabled={reviewSubmitting} onClick={() => setReviewModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={reviewSubmitting} onClick={submitReview}>
                {reviewSubmitting ? "Saving..." : "Confirm"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
