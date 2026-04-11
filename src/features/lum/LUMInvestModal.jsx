import { useMemo, useState } from "react";
import { calculateProjection, formatMoney } from "./lum-utils";

export default function LUMInvestModal({
  open,
  plan,
  availableBalanceUsd,
  onClose,
  onConfirm,
  submitting,
  submitError,
}) {
  const [amountUsd, setAmountUsd] = useState("");

  const projection = useMemo(() => {
    const amount = Number(amountUsd || 0);
    if (!plan || !Number.isFinite(amount) || amount <= 0) {
      return {
        expectedProfitUsd: 0,
        expectedTotalReturnUsd: 0,
        dailyProfitUsd: 0,
      };
    }
    return calculateProjection(plan, amount);
  }, [amountUsd, plan]);

  if (!open || !plan) {
    return null;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    const normalizedAmount = Number(amountUsd || 0);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return;
    }
    await onConfirm({ planId: plan.planId, amountUsd: normalizedAmount });
    setAmountUsd("");
  };

  return (
    <div className="lum-modal-backdrop" role="dialog" aria-modal="true" aria-label="Invest in plan">
      <form className="lum-modal-card" onSubmit={handleSubmit}>
        <header>
          <h3>Invest In {plan.title}</h3>
          <button type="button" className="lum-close-btn" onClick={onClose}>
            <i className="fas fa-xmark" />
          </button>
        </header>

        <div className="lum-invest-body">
          <div className="lum-invest-row">
            <span>Available Balance</span>
            <strong>{formatMoney(availableBalanceUsd || 0, plan.currency || "USDT")}</strong>
          </div>
          <div className="lum-invest-row">
            <span>Minimum</span>
            <strong>{formatMoney(plan.minimumAmountUsd || 0, plan.currency || "USDT")}</strong>
          </div>
          <div className="lum-invest-row">
            <span>Cycle</span>
            <strong>{plan.cycleDays} days</strong>
          </div>

          <label htmlFor="lum-invest-amount">Investment Amount ({plan.currency || "USDT"})</label>
          <input
            id="lum-invest-amount"
            type="number"
            min={plan.minimumAmountUsd || 0}
            step="0.01"
            placeholder="Enter amount"
            value={amountUsd}
            onChange={(event) => setAmountUsd(event.target.value)}
            required
          />

          <div className="lum-invest-projection">
            <article>
              <span>Estimated Profit</span>
              <strong>{formatMoney(projection.expectedProfitUsd || 0, plan.currency || "USDT")}</strong>
            </article>
            <article>
              <span>Maturity Amount</span>
              <strong>{formatMoney(projection.expectedTotalReturnUsd || 0, plan.currency || "USDT")}</strong>
            </article>
            <article>
              <span>Expected Daily</span>
              <strong>{formatMoney(projection.dailyProfitUsd || 0, plan.currency || "USDT")}</strong>
            </article>
          </div>

          <p className="lum-risk-note">
            Locked principal and reward settlement follow selected plan rules. Review lock-up and early redemption policy
            before confirming.
          </p>

          {submitError ? <p className="lum-error">{submitError}</p> : null}
        </div>

        <footer className="lum-modal-actions">
          <button type="button" className="lum-secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="lum-primary-btn" disabled={submitting}>
            {submitting ? "Submitting..." : "Confirm Invest"}
          </button>
        </footer>
      </form>
    </div>
  );
}
