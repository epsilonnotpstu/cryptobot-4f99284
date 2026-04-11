import { categoryLabel, formatMoney } from "./lum-utils";

function returnTypeLabel(value = "") {
  const normalized = String(value || "daily_percent").toLowerCase();
  if (normalized === "cycle_percent") {
    return "Cycle %";
  }
  if (normalized === "fixed_amount") {
    return "Fixed Amount";
  }
  if (normalized === "apr_percent") {
    return "APR %";
  }
  return "Daily %";
}

function payoutLabel(value = "") {
  const normalized = String(value || "on_maturity").toLowerCase();
  if (normalized === "daily_credit") {
    return "Daily Credit";
  }
  if (normalized === "manual_settlement") {
    return "Manual Settlement";
  }
  return "On Maturity";
}

export default function LUMPlanCard({ plan, onBuy, onInfo }) {
  return (
    <article className="lum-plan-card">
      <header>
        <div>
          <h3>{plan.title}</h3>
          <p>
            {categoryLabel(plan.category)} · {payoutLabel(plan.payoutType)}
          </p>
        </div>
        <div className="lum-plan-actions">
          {plan.badgeLabel ? <span className="lum-plan-badge">{plan.badgeLabel}</span> : null}
          <button type="button" className="lum-info-btn" onClick={() => onInfo(plan)}>
            Info
          </button>
          <button type="button" className="lum-buy-btn" onClick={() => onBuy(plan)}>
            Buy
          </button>
        </div>
      </header>

      <div className="lum-plan-grid">
        <div>
          <span>Minimum</span>
          <strong>{formatMoney(plan.minimumAmountUsd || 0, plan.currency || "USDT")}</strong>
        </div>
        <div>
          <span>Return Rate</span>
          <strong>
            {Number(plan.returnRate || 0).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            %
          </strong>
        </div>
        <div>
          <span>Cycle Days</span>
          <strong>{Number(plan.cycleDays || 0)} d</strong>
        </div>
      </div>

      <footer>
        <small>Return Type: {returnTypeLabel(plan.returnType)}</small>
        <small>Currency: {plan.currency || "USDT"}</small>
      </footer>
    </article>
  );
}
