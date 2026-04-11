import { useMemo, useState } from "react";
import { formatCompactNumber } from "../utils/format";

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

function formatUsd(value = 0) {
  return `$${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
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
  if (normalized === "active" || normalized === "completed" || normalized === "approved") {
    return "authenticated";
  }
  if (normalized === "rejected" || normalized === "archived") {
    return "rejected";
  }
  if (normalized === "disabled" || normalized === "cancelled") {
    return "suspended";
  }
  return "pending";
}

function formatLabel(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "-";
  }
  return normalized
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const DEFAULT_PLAN_FORM = {
  planId: "",
  planCode: "",
  category: "lum",
  title: "",
  shortDescription: "",
  detailsHtml: "",
  currency: "USDT",
  minimumAmountUsd: "100",
  maximumAmountUsd: "",
  returnRate: "0.5",
  returnType: "daily_percent",
  cycleDays: "14",
  payoutType: "on_maturity",
  lockPrincipal: true,
  allowEarlyRedeem: false,
  earlyRedeemPenaltyPercent: "0",
  requiresAdminReview: false,
  quotaLimit: "",
  isFeatured: false,
  badgeLabel: "",
  displaySortOrder: "0",
  status: "active",
};

const DEFAULT_CONTENT_FORM = {
  contentId: "",
  planId: "",
  contentType: "pledge_info",
  title: "",
  bodyText: "",
  sortOrder: "0",
  isActive: true,
};

export default function LUMManagementPage({
  summary,
  plans,
  investments,
  loading,
  searchValue,
  onSearchChange,
  onRefresh,
  onCreatePlan,
  onUpdatePlan,
  onDeletePlan,
  onTogglePlanStatus,
  onSaveContent,
  onReviewInvestment,
  onForceSettleInvestment,
}) {
  const [tab, setTab] = useState("plans");
  const [planStatusFilter, setPlanStatusFilter] = useState("all");
  const [planCategoryFilter, setPlanCategoryFilter] = useState("all");
  const [investmentStatusFilter, setInvestmentStatusFilter] = useState("all");
  const [investmentCategoryFilter, setInvestmentCategoryFilter] = useState("all");

  const [planForm, setPlanForm] = useState(DEFAULT_PLAN_FORM);
  const [contentForm, setContentForm] = useState(DEFAULT_CONTENT_FORM);
  const [selectedPlanIdForContent, setSelectedPlanIdForContent] = useState(0);

  const [submittingPlan, setSubmittingPlan] = useState(false);
  const [submittingContent, setSubmittingContent] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const keyword = normalizeText(searchValue);
  const planList = Array.isArray(plans) ? plans : [];
  const investmentList = Array.isArray(investments) ? investments : [];

  const filteredPlans = useMemo(() => {
    return planList.filter((plan) => {
      const status = normalizeText(plan.status);
      const category = normalizeText(plan.category);

      if (planStatusFilter !== "all" && status !== planStatusFilter) {
        return false;
      }
      if (planCategoryFilter !== "all" && category !== planCategoryFilter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const candidate = `${plan.planCode} ${plan.title} ${plan.category} ${plan.returnType} ${plan.payoutType}`.toLowerCase();
      return candidate.includes(keyword);
    });
  }, [keyword, planCategoryFilter, planList, planStatusFilter]);

  const filteredInvestments = useMemo(() => {
    return investmentList.filter((item) => {
      const status = normalizeText(item.status);
      const category = normalizeText(item.category);

      if (investmentStatusFilter !== "all" && status !== investmentStatusFilter) {
        return false;
      }
      if (investmentCategoryFilter !== "all" && category !== investmentCategoryFilter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const candidate = `${item.investmentRef} ${item.userId} ${item.accountEmail} ${item.accountName} ${item.planTitle} ${item.category}`.toLowerCase();
      return candidate.includes(keyword);
    });
  }, [investmentCategoryFilter, investmentList, investmentStatusFilter, keyword]);

  const selectedPlan = useMemo(
    () => planList.find((plan) => Number(plan.planId || 0) === Number(selectedPlanIdForContent || 0)) || null,
    [planList, selectedPlanIdForContent],
  );

  const activePlanContents = useMemo(() => {
    return Array.isArray(selectedPlan?.contents) ? selectedPlan.contents : [];
  }, [selectedPlan]);

  const updatePlanField = (key, value) => {
    setPlanForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateContentField = (key, value) => {
    setContentForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetPlanForm = () => {
    setPlanForm(DEFAULT_PLAN_FORM);
  };

  const startPlanEdit = (plan) => {
    setError("");
    setNotice("");
    setPlanForm({
      planId: String(plan.planId || ""),
      planCode: String(plan.planCode || ""),
      category: String(plan.category || "lum"),
      title: String(plan.title || ""),
      shortDescription: String(plan.shortDescription || ""),
      detailsHtml: String(plan.detailsHtml || ""),
      currency: String(plan.currency || "USDT"),
      minimumAmountUsd: String(plan.minimumAmountUsd ?? "0"),
      maximumAmountUsd: plan.maximumAmountUsd === null ? "" : String(plan.maximumAmountUsd ?? ""),
      returnRate: String(plan.returnRate ?? "0"),
      returnType: String(plan.returnType || "daily_percent"),
      cycleDays: String(plan.cycleDays ?? "1"),
      payoutType: String(plan.payoutType || "on_maturity"),
      lockPrincipal: Boolean(plan.lockPrincipal),
      allowEarlyRedeem: Boolean(plan.allowEarlyRedeem),
      earlyRedeemPenaltyPercent: String(plan.earlyRedeemPenaltyPercent ?? "0"),
      requiresAdminReview: Boolean(plan.requiresAdminReview),
      quotaLimit: plan.quotaLimit === null ? "" : String(plan.quotaLimit ?? ""),
      isFeatured: Boolean(plan.isFeatured),
      badgeLabel: String(plan.badgeLabel || ""),
      displaySortOrder: String(plan.displaySortOrder ?? "0"),
      status: String(plan.status || "active"),
    });
  };

  const submitPlan = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!planForm.planCode.trim() && !planForm.planId) {
      setError("Plan code is required.");
      return;
    }
    if (!planForm.title.trim()) {
      setError("Plan title is required.");
      return;
    }

    const payload = {
      planId: planForm.planId ? Number(planForm.planId) : undefined,
      planCode: planForm.planCode,
      category: planForm.category,
      title: planForm.title,
      shortDescription: planForm.shortDescription,
      detailsHtml: planForm.detailsHtml,
      currency: planForm.currency,
      minimumAmountUsd: Number(planForm.minimumAmountUsd || 0),
      maximumAmountUsd: planForm.maximumAmountUsd === "" ? null : Number(planForm.maximumAmountUsd),
      returnRate: Number(planForm.returnRate || 0),
      returnType: planForm.returnType,
      cycleDays: Number(planForm.cycleDays || 0),
      payoutType: planForm.payoutType,
      lockPrincipal: Boolean(planForm.lockPrincipal),
      allowEarlyRedeem: Boolean(planForm.allowEarlyRedeem),
      earlyRedeemPenaltyPercent: Number(planForm.earlyRedeemPenaltyPercent || 0),
      requiresAdminReview: Boolean(planForm.requiresAdminReview),
      quotaLimit: planForm.quotaLimit === "" ? null : Number(planForm.quotaLimit),
      isFeatured: Boolean(planForm.isFeatured),
      badgeLabel: planForm.badgeLabel,
      displaySortOrder: Number(planForm.displaySortOrder || 0),
      status: planForm.status,
    };

    setSubmittingPlan(true);
    try {
      const response = planForm.planId ? await onUpdatePlan(payload) : await onCreatePlan(payload);
      setNotice(response?.message || (planForm.planId ? "Plan updated." : "Plan created."));
      if (!planForm.planId) {
        resetPlanForm();
      }
    } catch (requestError) {
      setError(requestError.message || "Could not save plan.");
    } finally {
      setSubmittingPlan(false);
    }
  };

  const archivePlan = async (planId) => {
    setError("");
    setNotice("");
    try {
      const response = await onDeletePlan(planId);
      setNotice(response?.message || "Plan archived.");
      if (String(planForm.planId) === String(planId)) {
        resetPlanForm();
      }
    } catch (requestError) {
      setError(requestError.message || "Could not archive plan.");
    }
  };

  const togglePlanStatus = async (plan) => {
    const nextStatus = String(plan.status || "active").toLowerCase() === "active" ? "disabled" : "active";
    setError("");
    setNotice("");

    try {
      const response = await onTogglePlanStatus({ planId: plan.planId, status: nextStatus });
      setNotice(response?.message || `Plan marked ${nextStatus}.`);
    } catch (requestError) {
      setError(requestError.message || "Could not update plan status.");
    }
  };

  const openContentEditor = (plan) => {
    setSelectedPlanIdForContent(Number(plan?.planId || 0));
    setContentForm({
      ...DEFAULT_CONTENT_FORM,
      planId: String(plan?.planId || ""),
    });
    setTab("content");
    setError("");
    setNotice("");
  };

  const startEditContent = (content) => {
    setContentForm({
      contentId: String(content.contentId || ""),
      planId: String(content.planId || selectedPlanIdForContent || ""),
      contentType: String(content.contentType || "pledge_info"),
      title: String(content.title || ""),
      bodyText: String(content.bodyText || ""),
      sortOrder: String(content.sortOrder ?? "0"),
      isActive: Boolean(content.isActive),
    });
  };

  const submitContent = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!contentForm.planId) {
      setError("Select a plan first.");
      return;
    }
    if (!contentForm.title.trim()) {
      setError("Content title is required.");
      return;
    }
    if (!contentForm.bodyText.trim()) {
      setError("Content body is required.");
      return;
    }

    setSubmittingContent(true);
    try {
      const response = await onSaveContent({
        contentId: contentForm.contentId ? Number(contentForm.contentId) : undefined,
        planId: Number(contentForm.planId),
        contentType: contentForm.contentType,
        title: contentForm.title,
        bodyText: contentForm.bodyText,
        sortOrder: Number(contentForm.sortOrder || 0),
        isActive: Boolean(contentForm.isActive),
      });
      setNotice(response?.message || "Content saved.");
      setContentForm((prev) => ({
        ...DEFAULT_CONTENT_FORM,
        planId: prev.planId,
      }));
    } catch (requestError) {
      setError(requestError.message || "Could not save content.");
    } finally {
      setSubmittingContent(false);
    }
  };

  const submitInvestmentReview = async ({ investmentId, decision }) => {
    setError("");
    setNotice("");

    setReviewSubmitting(true);
    try {
      const response = await onReviewInvestment({
        investmentId,
        decision,
        note: decision === "rejected" ? "Rejected by admin." : "Reviewed by admin.",
      });
      setNotice(response?.message || "Investment updated.");
    } catch (requestError) {
      setError(requestError.message || "Could not review investment.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const forceSettleInvestment = async (investmentId) => {
    setError("");
    setNotice("");

    setReviewSubmitting(true);
    try {
      const response = await onForceSettleInvestment({
        investmentId,
        note: "Force settled by admin.",
      });
      setNotice(response?.message || "Investment settled.");
    } catch (requestError) {
      setError(requestError.message || "Could not settle investment.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  return (
    <section className="adminx-users-shell">
      <section className="adminx-kpi-grid adminx-lum-kpi-grid">
        <article className="adminx-kpi-card">
          <div className="adminx-kpi-top">
            <span className="adminx-kpi-icon gold">
              <i className="fas fa-layer-group" />
            </span>
            <span className="adminx-kpi-growth">Live</span>
          </div>
          <strong>{formatCompactNumber(summary?.totalPlans || 0)}</strong>
          <p>Total Plans</p>
        </article>

        <article className="adminx-kpi-card">
          <div className="adminx-kpi-top">
            <span className="adminx-kpi-icon blue">
              <i className="fas fa-lock" />
            </span>
            <span className="adminx-kpi-growth">Locked</span>
          </div>
          <strong>{formatUsd(summary?.activeLocked || 0)}</strong>
          <p>Active Locked Fund</p>
        </article>

        <article className="adminx-kpi-card">
          <div className="adminx-kpi-top">
            <span className="adminx-kpi-icon green">
              <i className="fas fa-file-invoice-dollar" />
            </span>
            <span className="adminx-kpi-growth">Yield</span>
          </div>
          <strong>{formatUsd(summary?.completedReturn || 0)}</strong>
          <p>Completed Profit</p>
        </article>

        <article className="adminx-kpi-card">
          <div className="adminx-kpi-top">
            <span className="adminx-kpi-icon emerald">
              <i className="fas fa-hourglass-half" />
            </span>
            <span className="adminx-kpi-growth">Pending</span>
          </div>
          <strong>{formatCompactNumber(summary?.pendingCount || 0)}</strong>
          <p>Pending Orders</p>
        </article>
      </section>

      <div className="adminx-user-tabs" role="tablist" aria-label="LUM management tabs">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "plans"}
          className={tab === "plans" ? "active" : ""}
          onClick={() => setTab("plans")}
        >
          Plan Studio
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "investments"}
          className={tab === "investments" ? "active" : ""}
          onClick={() => setTab("investments")}
        >
          Investment Desk
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "content"}
          className={tab === "content" ? "active" : ""}
          onClick={() => setTab("content")}
        >
          Content Editor
        </button>
      </div>

      {notice ? <p className="adminx-auth-notice adminx-inline-feedback">{notice}</p> : null}
      {error ? <p className="adminx-auth-error adminx-inline-feedback">{error}</p> : null}

      {tab === "plans" ? (
        <section className="adminx-user-table-card">
          <div className="adminx-user-toolbar">
            <label className="adminx-user-search">
              <i className="fas fa-search" />
              <input
                type="text"
                placeholder="Search plan by code/title/type..."
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </label>

            <div className="adminx-user-toolbar-actions">
              <select
                className="adminx-filter-btn adminx-filter-select"
                value={planCategoryFilter}
                onChange={(event) => setPlanCategoryFilter(event.target.value)}
              >
                <option value="all">All Category</option>
                <option value="lum">LUM</option>
                <option value="mining">Mining</option>
              </select>

              <select
                className="adminx-filter-btn adminx-filter-select"
                value={planStatusFilter}
                onChange={(event) => setPlanStatusFilter(event.target.value)}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="disabled">Disabled</option>
                <option value="archived">Archived</option>
              </select>

              <button type="button" className="adminx-filter-btn" onClick={onRefresh}>
                <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} /> Refresh
              </button>
            </div>

            <span className="adminx-user-count">{filteredPlans.length} plans</span>
          </div>

          <div className="adminx-deposit-layout">
            <form className="adminx-deposit-asset-form" onSubmit={submitPlan}>
              <h3>{planForm.planId ? "Update LUM Plan" : "Create LUM Plan"}</h3>

              <div className="adminx-deposit-grid-two">
                <label>
                  Plan Code
                  <input
                    type="text"
                    value={planForm.planCode}
                    onChange={(event) => updatePlanField("planCode", event.target.value.toUpperCase())}
                    placeholder="LUM-CORE-14"
                    disabled={Boolean(planForm.planId)}
                  />
                </label>
                <label>
                  Category
                  <select
                    className="adminx-filter-btn adminx-filter-select"
                    value={planForm.category}
                    onChange={(event) => updatePlanField("category", event.target.value)}
                  >
                    <option value="lum">LUM</option>
                    <option value="mining">Mining</option>
                  </select>
                </label>
              </div>

              <label>
                Plan Title
                <input type="text" value={planForm.title} onChange={(event) => updatePlanField("title", event.target.value)} />
              </label>

              <label>
                Short Description
                <textarea rows={2} value={planForm.shortDescription} onChange={(event) => updatePlanField("shortDescription", event.target.value)} />
              </label>

              <label>
                Details HTML / Long Note
                <textarea rows={3} value={planForm.detailsHtml} onChange={(event) => updatePlanField("detailsHtml", event.target.value)} />
              </label>

              <div className="adminx-deposit-grid-two">
                <label>
                  Minimum (USD)
                  <input type="number" step="0.01" value={planForm.minimumAmountUsd} onChange={(event) => updatePlanField("minimumAmountUsd", event.target.value)} />
                </label>
                <label>
                  Maximum (USD)
                  <input type="number" step="0.01" value={planForm.maximumAmountUsd} onChange={(event) => updatePlanField("maximumAmountUsd", event.target.value)} />
                </label>
              </div>

              <div className="adminx-deposit-grid-two">
                <label>
                  Return Rate
                  <input type="number" step="0.01" value={planForm.returnRate} onChange={(event) => updatePlanField("returnRate", event.target.value)} />
                </label>
                <label>
                  Cycle Days
                  <input type="number" value={planForm.cycleDays} onChange={(event) => updatePlanField("cycleDays", event.target.value)} />
                </label>
              </div>

              <div className="adminx-deposit-grid-two">
                <label>
                  Return Type
                  <select
                    className="adminx-filter-btn adminx-filter-select"
                    value={planForm.returnType}
                    onChange={(event) => updatePlanField("returnType", event.target.value)}
                  >
                    <option value="daily_percent">Daily Percent</option>
                    <option value="cycle_percent">Cycle Percent</option>
                    <option value="fixed_amount">Fixed Amount</option>
                    <option value="apr_percent">APR Percent</option>
                  </select>
                </label>
                <label>
                  Payout Type
                  <select
                    className="adminx-filter-btn adminx-filter-select"
                    value={planForm.payoutType}
                    onChange={(event) => updatePlanField("payoutType", event.target.value)}
                  >
                    <option value="on_maturity">On Maturity</option>
                    <option value="daily_credit">Daily Credit</option>
                    <option value="manual_settlement">Manual Settlement</option>
                  </select>
                </label>
              </div>

              <div className="adminx-deposit-grid-two">
                <label>
                  Status
                  <select
                    className="adminx-filter-btn adminx-filter-select"
                    value={planForm.status}
                    onChange={(event) => updatePlanField("status", event.target.value)}
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <label>
                  Badge Label
                  <input type="text" value={planForm.badgeLabel} onChange={(event) => updatePlanField("badgeLabel", event.target.value)} />
                </label>
              </div>

              <div className="adminx-deposit-grid-two">
                <label>
                  Quota Limit
                  <input type="number" value={planForm.quotaLimit} onChange={(event) => updatePlanField("quotaLimit", event.target.value)} />
                </label>
                <label>
                  Sort Order
                  <input type="number" value={planForm.displaySortOrder} onChange={(event) => updatePlanField("displaySortOrder", event.target.value)} />
                </label>
              </div>

              <label className="adminx-checkbox-row">
                <input
                  type="checkbox"
                  checked={Boolean(planForm.requiresAdminReview)}
                  onChange={(event) => updatePlanField("requiresAdminReview", event.target.checked)}
                />
                <span>Requires admin review before activation</span>
              </label>

              <label className="adminx-checkbox-row">
                <input
                  type="checkbox"
                  checked={Boolean(planForm.allowEarlyRedeem)}
                  onChange={(event) => updatePlanField("allowEarlyRedeem", event.target.checked)}
                />
                <span>Allow early redeem</span>
              </label>

              <label className="adminx-checkbox-row">
                <input
                  type="checkbox"
                  checked={Boolean(planForm.isFeatured)}
                  onChange={(event) => updatePlanField("isFeatured", event.target.checked)}
                />
                <span>Mark as featured</span>
              </label>

              <div className="adminx-profile-actions">
                <button type="button" className="btn btn-ghost" onClick={resetPlanForm} disabled={submittingPlan}>
                  Reset
                </button>
                <button type="submit" className="btn btn-primary" disabled={submittingPlan}>
                  {submittingPlan ? "Saving..." : planForm.planId ? "Update Plan" : "Create Plan"}
                </button>
              </div>
            </form>

            <div className="adminx-deposit-asset-table-wrap">
              <table className="adminx-user-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Plan</th>
                    <th>Category</th>
                    <th>Min - Max</th>
                    <th>Return</th>
                    <th>Status</th>
                    <th>Quota</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlans.map((plan) => (
                    <tr key={plan.planId}>
                      <td>{plan.planCode}</td>
                      <td>
                        <strong>{plan.title}</strong>
                        <small className="adminx-table-subtext">{plan.payoutType}</small>
                      </td>
                      <td>{formatLabel(plan.category)}</td>
                      <td>
                        {formatUsd(plan.minimumAmountUsd)} - {plan.maximumAmountUsd === null ? "No Max" : formatUsd(plan.maximumAmountUsd)}
                      </td>
                      <td>
                        {plan.returnRate}% / {plan.cycleDays}d
                      </td>
                      <td>
                        <span className={`adminx-tag adminx-tag-kyc-${statusClass(plan.status)}`}>{formatLabel(plan.status)}</span>
                      </td>
                      <td>
                        {plan.quotaLimit === null ? "Unlimited" : `${plan.quotaUsed}/${plan.quotaLimit}`}
                      </td>
                      <td>
                        <div className="adminx-row-actions">
                          <button type="button" title="Edit plan" onClick={() => startPlanEdit(plan)}>
                            <i className="fas fa-pen" />
                          </button>
                          <button type="button" title="Content editor" onClick={() => openContentEditor(plan)}>
                            <i className="fas fa-file-lines" />
                          </button>
                          <button type="button" title="Toggle status" onClick={() => togglePlanStatus(plan)}>
                            <i className="fas fa-power-off" />
                          </button>
                          <button type="button" title="Archive" onClick={() => archivePlan(plan.planId)}>
                            <i className="fas fa-box-archive" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!filteredPlans.length ? (
                <div className="adminx-users-empty">
                  <p>No LUM plans found for this filter.</p>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {tab === "investments" ? (
        <section className="adminx-user-table-card">
          <div className="adminx-user-toolbar">
            <label className="adminx-user-search">
              <i className="fas fa-search" />
              <input
                type="text"
                placeholder="Search by reference, user, email, or plan..."
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </label>

            <div className="adminx-user-toolbar-actions">
              <select
                className="adminx-filter-btn adminx-filter-select"
                value={investmentCategoryFilter}
                onChange={(event) => setInvestmentCategoryFilter(event.target.value)}
              >
                <option value="all">All Category</option>
                <option value="lum">LUM</option>
                <option value="mining">Mining</option>
              </select>

              <select
                className="adminx-filter-btn adminx-filter-select"
                value={investmentStatusFilter}
                onChange={(event) => setInvestmentStatusFilter(event.target.value)}
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
                <option value="redeemed_early">Redeemed Early</option>
              </select>

              <button type="button" className="adminx-filter-btn" onClick={onRefresh}>
                <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} /> Refresh
              </button>
            </div>

            <span className="adminx-user-count">{filteredInvestments.length} investments</span>
          </div>

          <div className="adminx-user-table-wrap">
            <table className="adminx-user-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>User</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Expected Profit</th>
                  <th>Status</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvestments.map((item) => (
                  <tr key={item.investmentId}>
                    <td>{item.investmentRef}</td>
                    <td>
                      <strong>{item.accountName || item.userId}</strong>
                      <small className="adminx-table-subtext">{item.accountEmail || item.userId}</small>
                    </td>
                    <td>
                      <strong>{item.planTitle}</strong>
                      <small className="adminx-table-subtext">{formatLabel(item.category)}</small>
                    </td>
                    <td>{formatUsd(item.investedAmountUsd)}</td>
                    <td>{formatUsd(item.expectedProfitUsd)}</td>
                    <td>
                      <span className={`adminx-tag adminx-tag-kyc-${statusClass(item.status)}`}>{formatLabel(item.status)}</span>
                    </td>
                    <td>{formatDateTime(item.startedAt)}</td>
                    <td>{formatDateTime(item.endsAt)}</td>
                    <td>
                      <div className="adminx-row-actions">
                        {normalizeText(item.status) === "pending" ? (
                          <>
                            <button
                              type="button"
                              title="Approve"
                              onClick={() => submitInvestmentReview({ investmentId: item.investmentId, decision: "approved" })}
                              disabled={reviewSubmitting}
                            >
                              <i className="fas fa-check" />
                            </button>
                            <button
                              type="button"
                              title="Reject"
                              onClick={() => submitInvestmentReview({ investmentId: item.investmentId, decision: "rejected" })}
                              disabled={reviewSubmitting}
                            >
                              <i className="fas fa-xmark" />
                            </button>
                          </>
                        ) : null}

                        {normalizeText(item.status) === "active" ? (
                          <button
                            type="button"
                            title="Force settle"
                            onClick={() => forceSettleInvestment(item.investmentId)}
                            disabled={reviewSubmitting}
                          >
                            <i className="fas fa-bolt" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!filteredInvestments.length ? (
              <div className="adminx-users-empty">
                <p>No investment records found for selected filters.</p>
              </div>
            ) : null}
          </div>

          <footer className="adminx-user-footer">
            <span>Total investments: {formatCompactNumber(summary?.totalInvestments || investmentList.length)}</span>
            <span>Pending: {formatCompactNumber(summary?.pendingCount || 0)}</span>
            <span>Active now: {formatCompactNumber(summary?.activeInvestments || 0)}</span>
            <span>Completed: {formatCompactNumber(summary?.completedInvestments || 0)}</span>
          </footer>
        </section>
      ) : null}

      {tab === "content" ? (
        <section className="adminx-user-table-card">
          <div className="adminx-user-toolbar">
            <label className="adminx-user-search">
              <i className="fas fa-search" />
              <input
                type="text"
                placeholder="Search plan then open content editor..."
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </label>

            <div className="adminx-user-toolbar-actions">
              <select
                className="adminx-filter-btn adminx-filter-select"
                value={selectedPlanIdForContent ? String(selectedPlanIdForContent) : ""}
                onChange={(event) => setSelectedPlanIdForContent(Number(event.target.value || 0))}
              >
                <option value="">Select Plan</option>
                {planList.map((plan) => (
                  <option key={plan.planId} value={plan.planId}>
                    {plan.planCode} · {plan.title}
                  </option>
                ))}
              </select>

              <button type="button" className="adminx-filter-btn" onClick={onRefresh}>
                <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} /> Refresh
              </button>
            </div>

            <span className="adminx-user-count">{activePlanContents.length} blocks</span>
          </div>

          <div className="adminx-deposit-layout">
            <form className="adminx-deposit-asset-form" onSubmit={submitContent}>
              <h3>{contentForm.contentId ? "Update Content Block" : "Add Content Block"}</h3>

              <div className="adminx-deposit-grid-two">
                <label>
                  Plan ID
                  <input
                    type="number"
                    value={contentForm.planId}
                    onChange={(event) => updateContentField("planId", event.target.value)}
                    placeholder="Plan id"
                  />
                </label>
                <label>
                  Content Type
                  <select
                    className="adminx-filter-btn adminx-filter-select"
                    value={contentForm.contentType}
                    onChange={(event) => updateContentField("contentType", event.target.value)}
                  >
                    <option value="pledge_info">Pledge Info</option>
                    <option value="risk_notice">Risk Notice</option>
                    <option value="faq">FAQ</option>
                    <option value="terms">Terms</option>
                  </select>
                </label>
              </div>

              <label>
                Title
                <input type="text" value={contentForm.title} onChange={(event) => updateContentField("title", event.target.value)} />
              </label>

              <label>
                Body Text
                <textarea rows={5} value={contentForm.bodyText} onChange={(event) => updateContentField("bodyText", event.target.value)} />
              </label>

              <div className="adminx-deposit-grid-two">
                <label>
                  Sort Order
                  <input
                    type="number"
                    value={contentForm.sortOrder}
                    onChange={(event) => updateContentField("sortOrder", event.target.value)}
                  />
                </label>
                <label className="adminx-checkbox-row">
                  <input
                    type="checkbox"
                    checked={Boolean(contentForm.isActive)}
                    onChange={(event) => updateContentField("isActive", event.target.checked)}
                  />
                  <span>Block is active</span>
                </label>
              </div>

              <div className="adminx-profile-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setContentForm((prev) => ({ ...DEFAULT_CONTENT_FORM, planId: prev.planId }))}
                  disabled={submittingContent}
                >
                  Reset
                </button>
                <button type="submit" className="btn btn-primary" disabled={submittingContent}>
                  {submittingContent ? "Saving..." : "Save Content"}
                </button>
              </div>
            </form>

            <div className="adminx-deposit-asset-table-wrap">
              <table className="adminx-user-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Title</th>
                    <th>Body</th>
                    <th>Sort</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activePlanContents.map((block) => (
                    <tr key={block.contentId}>
                      <td>{formatLabel(block.contentType)}</td>
                      <td>{block.title}</td>
                      <td>{String(block.bodyText || "").slice(0, 120)}...</td>
                      <td>{block.sortOrder}</td>
                      <td>
                        <span className={`adminx-tag adminx-tag-kyc-${block.isActive ? "authenticated" : "pending"}`}>
                          {block.isActive ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td>
                        <div className="adminx-row-actions">
                          <button type="button" title="Edit block" onClick={() => startEditContent(block)}>
                            <i className="fas fa-pen" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!activePlanContents.length ? (
                <div className="adminx-users-empty">
                  <p>Select a plan to view/edit content blocks.</p>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}
