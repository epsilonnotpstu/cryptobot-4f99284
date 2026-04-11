import { formatMoney } from "./binary-utils";

const QUICK_PERCENTS = [10, 25, 50, 75, 100];

export default function BinaryAmountCard({
  currency,
  minStake,
  maxStake,
  binaryWallet,
  spotWallet,
  tradableBalance,
  autoTransferFromSpot,
  amount,
  percent,
  expectedProfit,
  expectedTotal,
  onAmountChange,
  onAmountBlur,
  onPercentChange,
  onQuickPercent,
}) {
  const maxLabel = maxStake === null || maxStake === undefined ? "No max" : Number(maxStake).toFixed(2);

  return (
    <section className="binary-amount-card">
      <div className="binary-amount-head">
        <p>
          Min {Number(minStake).toFixed(2)} / Max {maxLabel}
        </p>
        <span>{currency}</span>
      </div>

      <div className="binary-wallet-row">
        <strong>Binary Wallet: {formatMoney(binaryWallet, currency)}</strong>
        <span>Expected: {formatMoney(expectedProfit, currency)}</span>
      </div>
      {autoTransferFromSpot ? (
        <div className="binary-wallet-note">
          <span>Spot Wallet: {formatMoney(spotWallet, "SPOT_USDT")}</span>
          <strong>Tradable: {formatMoney(tradableBalance, currency)}</strong>
        </div>
      ) : null}

      <label className="binary-amount-input">
        Stake Amount
        <input
          type="number"
          step="0.01"
          min={minStake}
          max={maxStake || undefined}
          value={amount}
          onChange={(event) => onAmountChange(event.target.value)}
          onBlur={onAmountBlur}
          placeholder="Enter stake"
        />
      </label>

      <input
        type="range"
        min="0"
        max="100"
        value={percent}
        onChange={(event) => onPercentChange(Number(event.target.value || 0))}
      />
      <div className="binary-range-labels">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>

      <div className="binary-quick-grid">
        {QUICK_PERCENTS.map((quick) => (
          <button type="button" key={quick} onClick={() => onQuickPercent(quick)}>
            {quick === 100 ? "Max" : `${quick}%`}
          </button>
        ))}
      </div>

      <div className="binary-projection-row">
        <p>
          <span>Expected Profit</span>
          <strong>{formatMoney(expectedProfit, currency)}</strong>
        </p>
        <p>
          <span>Total Payout</span>
          <strong>{formatMoney(expectedTotal, currency)}</strong>
        </p>
      </div>
    </section>
  );
}
