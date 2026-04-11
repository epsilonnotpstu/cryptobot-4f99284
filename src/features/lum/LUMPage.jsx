import { useCallback, useEffect, useMemo, useState } from "react";
import LUMSummaryCard from "./LUMSummaryCard";
import LUMPlanTabs from "./LUMPlanTabs";
import LUMPlanCard from "./LUMPlanCard";
import LUMPlanDetailModal from "./LUMPlanDetailModal";
import LUMInvestModal from "./LUMInvestModal";
import LUMEntrustModal from "./LUMEntrustModal";
import LUMInfoModal from "./LUMInfoModal";
import { formatMoney } from "./lum-utils";
import "./lum.css";

function extractWalletAvailable(snapshot) {
  const balances = Array.isArray(snapshot?.wallet?.balances) ? snapshot.wallet.balances : [];
  const usdt = balances.find((item) => String(item.symbol || "").toUpperCase() === "USDT");
  if (usdt) {
    return Number(usdt.totalUsd || 0);
  }
  return 0;
}

export default function LUMPage({
  user,
  onBack,
  onDashboardSnapshot,
  onLoadSummary,
  onLoadPlans,
  onLoadPlanDetail,
  onLoadEntrust,
  onLoadInfo,
  onCreateInvestment,
  onAfterInvestmentSuccess,
}) {
  const [activeTab, setActiveTab] = useState("lum");
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");

  const [walletAvailableUsd, setWalletAvailableUsd] = useState(0);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  const [investOpen, setInvestOpen] = useState(false);
  const [investSubmitting, setInvestSubmitting] = useState(false);
  const [investError, setInvestError] = useState("");

  const [entrustOpen, setEntrustOpen] = useState(false);
  const [entrustLoading, setEntrustLoading] = useState(false);
  const [entrustData, setEntrustData] = useState(null);

  const [infoOpen, setInfoOpen] = useState(false);
  const [infoTitle, setInfoTitle] = useState("");
  const [infoBlocks, setInfoBlocks] = useState([]);

  const [toast, setToast] = useState("");

  const loadWalletSnapshot = useCallback(async () => {
    if (!onDashboardSnapshot) {
      return;
    }
    const snapshot = await onDashboardSnapshot();
    setWalletAvailableUsd(extractWalletAvailable(snapshot));
  }, [onDashboardSnapshot]);

  const loadSummary = useCallback(async () => {
    if (!onLoadSummary) {
      return;
    }
    const payload = await onLoadSummary();
    setSummary(payload?.summary || null);
  }, [onLoadSummary]);

  const loadPlans = useCallback(
    async (category) => {
      if (!onLoadPlans) {
        return;
      }
      const payload = await onLoadPlans({ category });
      setPlans(Array.isArray(payload?.plans) ? payload.plans : []);
    },
    [onLoadPlans],
  );

  const refreshAll = useCallback(async () => {
    setPageError("");
    setSummaryLoading(true);
    setPlansLoading(true);

    try {
      await Promise.all([loadWalletSnapshot(), loadSummary(), loadPlans(activeTab)]);
    } catch (error) {
      setPageError(error.message || "Could not sync LUM page.");
    } finally {
      setSummaryLoading(false);
      setPlansLoading(false);
    }
  }, [activeTab, loadPlans, loadSummary, loadWalletSnapshot]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        await refreshAll();
      } catch {
        if (!active) {
          return;
        }
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [refreshAll]);

  useEffect(() => {
    setPlansLoading(true);
    setPageError("");

    const run = async () => {
      try {
        await loadPlans(activeTab);
      } catch (error) {
        setPageError(error.message || "Could not load plans.");
      } finally {
        setPlansLoading(false);
      }
    };

    run();
  }, [activeTab, loadPlans]);

  const openEntrust = async () => {
    setEntrustOpen(true);
    setEntrustLoading(true);
    setPageError("");
    try {
      const payload = await onLoadEntrust?.();
      setEntrustData(payload || null);
    } catch (error) {
      setPageError(error.message || "Could not load entrust data.");
    } finally {
      setEntrustLoading(false);
    }
  };

  const openPlanDetail = async (plan) => {
    setSelectedPlan(plan);
    setDetailOpen(true);
    setDetailLoading(true);
    setPageError("");

    try {
      const payload = await onLoadPlanDetail?.({ planId: plan.planId });
      setSelectedPlan(payload?.plan || plan);
    } catch (error) {
      setPageError(error.message || "Could not load plan detail.");
      setSelectedPlan(plan);
    } finally {
      setDetailLoading(false);
    }
  };

  const openInfoModal = async (plan) => {
    setInfoOpen(true);
    setInfoTitle(`${plan.title} Information`);
    setInfoBlocks(Array.isArray(plan.contents) ? plan.contents : []);

    try {
      const payload = await onLoadInfo?.({ planId: plan.planId });
      const infoPayload = payload?.info;

      if (Array.isArray(infoPayload)) {
        const matched = infoPayload.find((item) => Number(item.planId) === Number(plan.planId));
        if (matched) {
          setInfoTitle(matched.title || `${plan.title} Information`);
          setInfoBlocks(Array.isArray(matched.blocks) ? matched.blocks : []);
        }
      } else if (infoPayload && typeof infoPayload === "object") {
        setInfoTitle(infoPayload.title || `${plan.title} Information`);
        setInfoBlocks(Array.isArray(infoPayload.blocks) ? infoPayload.blocks : []);
      }
    } catch {
      // fall back to current plan content
    }
  };

  const handleConfirmInvest = async ({ planId, amountUsd }) => {
    if (!onCreateInvestment) {
      return;
    }

    setInvestSubmitting(true);
    setInvestError("");
    setNotice("");

    try {
      const payload = await onCreateInvestment({ planId, amountUsd });
      setNotice(payload?.message || "Investment created successfully.");
      setToast(payload?.message || "Submitted successfully.");
      setDetailOpen(false);
      setInvestOpen(false);

      if (payload?.summary) {
        setSummary(payload.summary);
      } else {
        await loadSummary();
      }

      await loadWalletSnapshot();
      await loadPlans(activeTab);
      if (entrustOpen) {
        const entrustPayload = await onLoadEntrust?.();
        setEntrustData(entrustPayload || null);
      }

      await onAfterInvestmentSuccess?.();

      window.setTimeout(() => setToast(""), 1800);
    } catch (error) {
      setInvestError(error.message || "Could not submit investment.");
    } finally {
      setInvestSubmitting(false);
    }
  };

  const hasPlans = plans.length > 0;

  const headerDate = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, []);

  return (
    <main className="lum-page">
      <div className="lum-shell">
        <header className="lum-topbar">
          <button type="button" className="lum-icon-btn" onClick={onBack}>
            <i className="fas fa-arrow-left" />
          </button>

          <div className="lum-title">
            <h1>LUM Center</h1>
            <p>{headerDate}</p>
          </div>

          <button type="button" className="lum-icon-btn" onClick={refreshAll}>
            <i className="fas fa-rotate" />
          </button>
        </header>

        <div className="lum-user-strip">
          <div>
            <strong>{user?.name || "Trader"}</strong>
            <p>{user?.email || ""}</p>
          </div>
          <span>Available: {formatMoney(walletAvailableUsd || 0, "USDT")}</span>
        </div>

        <LUMSummaryCard summary={summary} loading={summaryLoading} onOpenEntrust={openEntrust} />

        <LUMPlanTabs activeTab={activeTab} onChange={setActiveTab} />

        {notice ? <p className="lum-notice">{notice}</p> : null}
        {pageError ? <p className="lum-error">{pageError}</p> : null}

        <section className="lum-plan-list">
          {plansLoading ? <p className="lum-empty">Loading plans...</p> : null}
          {!plansLoading && !hasPlans ? <p className="lum-empty">No active {activeTab} plans available.</p> : null}

          {!plansLoading &&
            hasPlans &&
            plans.map((plan) => (
              <LUMPlanCard key={plan.planId} plan={plan} onBuy={openPlanDetail} onInfo={openInfoModal} />
            ))}
        </section>
      </div>

      <LUMPlanDetailModal
        open={detailOpen}
        plan={selectedPlan}
        loading={detailLoading}
        onClose={() => setDetailOpen(false)}
        onContinue={() => {
          setDetailOpen(false);
          setInvestOpen(true);
          setInvestError("");
        }}
      />

      <LUMInvestModal
        open={investOpen}
        plan={selectedPlan}
        availableBalanceUsd={walletAvailableUsd}
        onClose={() => setInvestOpen(false)}
        onConfirm={handleConfirmInvest}
        submitting={investSubmitting}
        submitError={investError}
      />

      <LUMEntrustModal open={entrustOpen} loading={entrustLoading} data={entrustData} onClose={() => setEntrustOpen(false)} />

      <LUMInfoModal open={infoOpen} title={infoTitle} blocks={infoBlocks} onClose={() => setInfoOpen(false)} />

      {toast ? <div className="lum-toast">{toast}</div> : null}
    </main>
  );
}
