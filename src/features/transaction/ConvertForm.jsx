import { getAvailableBalance, moneyLabel, toNumber } from "./transaction-utils";

export default function ConvertForm({
  pairs,
  selectedPairId,
  onPairChange,
  onReverse,
  amount,
  onAmountChange,
  onMax,
  quote,
  quoteLoading,
  onSubmit,
  walletMap,
  submitting,
}) {
  const selectedPair = (pairs || []).find((item) => Number(item.pairId) === Number(selectedPairId)) || null;
  const fromAsset = selectedPair?.fromAsset || "USDT";
  const toAsset = selectedPair?.toAsset || "USDT";
  const available = getAvailableBalance(walletMap, fromAsset);

  return (
    <section className="tx-card">
      <div className="tx-card-head">
        <h2>Convert</h2>
        <button type="button" className="tx-mini-btn" onClick={onReverse} disabled={!selectedPair}>
          <i className="fas fa-arrows-rotate" /> Reverse
        </button>
      </div>

      <div className="tx-field-grid">
        <label>
          Pair
          <select value={selectedPairId || ""} onChange={(event) => onPairChange(Number(event.target.value))}>
            {(pairs || []).map((pair) => (
              <option key={pair.pairId} value={pair.pairId}>
                {pair.displayName}
              </option>
            ))}
          </select>
        </label>

        <label>
          Amount ({fromAsset})
          <div className="tx-input-inline">
            <input
              type="number"
              min="0"
              step="0.00000001"
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
              placeholder="0.00"
            />
            <button type="button" onClick={onMax} className="tx-mini-btn">
              MAX
            </button>
          </div>
          <small>Available: {moneyLabel(available, fromAsset, 6)}</small>
        </label>
      </div>

      <div className="tx-quote-box">
        {quoteLoading ? <p>Fetching quote...</p> : null}
        {!quoteLoading && quote ? (
          <>
            <p>
              <span>Exchange Rate</span>
              <strong>
                1 {fromAsset} = {toNumber(quote.appliedRate, 0).toLocaleString("en-US", { maximumFractionDigits: 8 })} {toAsset}
              </strong>
            </p>
            <p>
              <span>Fee</span>
              <strong>{moneyLabel(quote.feeAmount || 0, toAsset, 8)}</strong>
            </p>
            <p>
              <span>You Receive</span>
              <strong>{moneyLabel(quote.receiveAmount || 0, toAsset, 8)}</strong>
            </p>
          </>
        ) : null}
      </div>

      <button
        type="button"
        className="tx-primary-btn"
        onClick={onSubmit}
        disabled={submitting || !selectedPair || !Number(amount) || Number(amount) <= 0}
      >
        {submitting ? "Converting..." : `Convert ${fromAsset} to ${toAsset}`}
      </button>
    </section>
  );
}
