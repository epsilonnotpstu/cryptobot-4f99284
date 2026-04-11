import { formatMoney } from "./lum-utils";

export default function LUMSummaryCard({ summary, loading, onOpenEntrust }) {
  return (
    <section className="lum-summary-card">
      <div className="lum-summary-head">
        <div>
          <p>Custodial Funds</p>
          <h2>{loading ? "..." : formatMoney(summary?.custodialFunds || 0, "USDT")}</h2>
        </div>
        <button type="button" className="lum-entrust-btn" onClick={onOpenEntrust}>
          Entrust
        </button>
      </div>

      <div className="lum-summary-grid">
        <article>
          <span>Today Expected</span>
          <strong>{loading ? "..." : formatMoney(summary?.todayExpected || 0, "USDT")}</strong>
        </article>
        <article>
          <span>Total Return</span>
          <strong>{loading ? "..." : formatMoney(summary?.totalReturnEstimated || 0, "USDT")}</strong>
        </article>
        <article>
          <span>Order Escrow</span>
          <strong>{loading ? "..." : formatMoney(summary?.orderEscrow || 0, "USDT")}</strong>
        </article>
      </div>
    </section>
  );
}
