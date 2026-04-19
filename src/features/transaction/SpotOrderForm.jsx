import { moneyLabel } from "./transaction-utils";

const QUICK_PERCENTAGES = [25, 50, 75, 100];

export default function SpotOrderForm({
  pair,
  side,
  onSideChange,
  orderType,
  onOrderTypeChange,
  quantity,
  onQuantityChange,
  price,
  onPriceChange,
  fundingAsset,
  availableBalance,
  preview,
  submitting,
  onSubmit,
  onQuickPercent,
}) {
  const baseAsset = pair?.baseAsset || "BASE";
  const quoteAsset = pair?.quoteAsset || "USDT";

  return (
    <section className="tx-card">
      <div className="tx-card-head">
        <h2>Spot Order</h2>
      </div>

      <div className="tx-order-switch-row">
        <div className="tx-toggle-pill">
          <button type="button" className={side === "buy" ? "active" : ""} onClick={() => onSideChange("buy")}>
            Buy
          </button>
          <button type="button" className={side === "sell" ? "active" : ""} onClick={() => onSideChange("sell")}>
            Sell
          </button>
        </div>

        <div className="tx-toggle-pill">
          <button
            type="button"
            className={orderType === "market" ? "active" : ""}
            onClick={() => onOrderTypeChange("market")}
          >
            Market
          </button>
          <button type="button" className={orderType === "limit" ? "active" : ""} onClick={() => onOrderTypeChange("limit")}>
            Limit
          </button>
        </div>
      </div>

      <div className="tx-field-grid">
        {orderType === "limit" ? (
          <label>
            Price ({quoteAsset})
            <input type="number" min="0" step="0.00000001" value={price} onChange={(event) => onPriceChange(event.target.value)} />
          </label>
        ) : null}

        <label>
          Quantity ({baseAsset})
          <input
            type="number"
            min="0"
            step="0.00000001"
            value={quantity}
            onChange={(event) => onQuantityChange(event.target.value)}
            placeholder="0.00"
          />
        </label>
      </div>

      <div className="tx-quick-row">
        {QUICK_PERCENTAGES.map((item) => (
          <button key={item} type="button" className="tx-mini-btn" onClick={() => onQuickPercent(item)}>
            {item}%
          </button>
        ))}
      </div>

      <p className="tx-muted">Available {fundingAsset}: {moneyLabel(availableBalance, fundingAsset, 6)}</p>

      <div className="tx-quote-box">
        <p>
          <span>Total</span>
          <strong>{moneyLabel(preview?.quoteAmount || 0, quoteAsset, 8)}</strong>
        </p>
        <p>
          <span>Estimated Fee</span>
          <strong>{moneyLabel(preview?.feeAmount || 0, quoteAsset, 8)}</strong>
        </p>
        {side === "buy" ? (
          <p>
            <span>Estimated Receive</span>
            <strong>{moneyLabel(preview?.receiveBase || 0, baseAsset, 8)}</strong>
          </p>
        ) : (
          <p>
            <span>Estimated Receive</span>
            <strong>{moneyLabel(preview?.receiveQuote || 0, quoteAsset, 8)}</strong>
          </p>
        )}
      </div>

      <button
        type="button"
        className={`tx-primary-btn ${side === "sell" ? "is-sell" : "is-buy"}`}
        disabled={submitting || !quantity || Number(quantity) <= 0}
        onClick={onSubmit}
      >
        {submitting ? "Submitting..." : side === "buy" ? `Buy ${baseAsset}` : `Sell ${baseAsset}`}
      </button>
    </section>
  );
}
