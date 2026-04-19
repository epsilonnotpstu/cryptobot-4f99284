import { moneyLabel, percentLabel } from "./transaction-utils";

export default function SpotMarketSummary({ summary, pairLabel, onRefresh }) {
  const currentPrice = Number(summary?.currentPrice || 0);
  const changePercent = Number(summary?.changePercent || 0);

  return (
    <section className="tx-card">
      <div className="tx-card-head tx-space-between">
        <h2>{pairLabel || "Market Summary"}</h2>
        <button type="button" className="tx-mini-btn" onClick={onRefresh}>
          <i className="fas fa-rotate" />
        </button>
      </div>

      <div className="tx-summary-grid">
        <article>
          <span>Last Price</span>
          <strong>{moneyLabel(currentPrice, summary?.quoteAsset || "USDT", 6)}</strong>
        </article>
        <article>
          <span>24h Change</span>
          <strong className={changePercent >= 0 ? "tx-positive" : "tx-negative"}>{percentLabel(changePercent, 2)}</strong>
        </article>
        <article>
          <span>24h Base Vol</span>
          <strong>{moneyLabel(summary?.volumeBase || 0, summary?.baseAsset || "BASE", 6)}</strong>
        </article>
        <article>
          <span>24h Quote Vol</span>
          <strong>{moneyLabel(summary?.volumeQuote || 0, summary?.quoteAsset || "USDT", 4)}</strong>
        </article>
      </div>
    </section>
  );
}
