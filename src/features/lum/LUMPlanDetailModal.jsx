import { useEffect } from "react";
import { categoryLabel, formatMoney } from "./lum-utils";

export default function LUMPlanDetailModal({ open, plan, loading, onClose, onContinue }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const activeContents = (Array.isArray(plan?.contents) ? plan.contents : []).filter((block) => block?.isActive !== false);

  return (
    <div className="lum-modal-backdrop" role="dialog" aria-modal="true" aria-label="LUM plan details" onClick={onClose}>
      <div className="lum-modal-card lum-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lum-sheet-handle" aria-hidden="true" />
        <header>
          <h3>{loading ? "Loading plan..." : plan?.title || "Plan Detail"}</h3>
          <button type="button" className="lum-close-btn" onClick={onClose}>
            <i className="fas fa-xmark" />
          </button>
        </header>

        {loading ? <p className="lum-modal-loading">Fetching plan information...</p> : null}

        {!loading && plan ? (
          <>
            <div className="lum-detail-meta">
              <p>Category: {categoryLabel(plan.category)}</p>
              <p>Cycle: {plan.cycleDays} days</p>
              <p>
                Minimum: {formatMoney(plan.minimumAmountUsd || 0, plan.currency || "USDT")}
              </p>
              <p>Return Type: {plan.returnType}</p>
              <p>Payout Type: {plan.payoutType}</p>
            </div>

            {plan.shortDescription ? <p className="lum-detail-description">{plan.shortDescription}</p> : null}

            {activeContents.length ? (
              <div className="lum-content-list">
                {activeContents.map((block) => (
                  <article key={block.contentId}>
                    <h4>{block.title || block.contentType}</h4>
                    <p>{block.bodyText}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="lum-content-list">
                <article>
                  <h4>Pledge Information</h4>
                  <p>
                    Funds remain locked for the configured cycle. Rewards are settled as plan rules define. Review terms and
                    risk before investing.
                  </p>
                </article>
              </div>
            )}

            <footer className="lum-modal-actions">
              <button type="button" className="lum-secondary-btn" onClick={onClose}>
                Close
              </button>
              <button type="button" className="lum-primary-btn" onClick={onContinue}>
                Continue
              </button>
            </footer>
          </>
        ) : null}
      </div>
    </div>
  );
}
