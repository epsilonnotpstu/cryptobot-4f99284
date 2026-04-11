import { directionLabel, formatMoney, formatPrice, remainingSeconds } from "./binary-utils";

function progressPercent(trade) {
  const total = Math.max(1, Number(trade?.periodSeconds || 1));
  const left = remainingSeconds(trade?.expiresAt || "");
  return Math.max(0, Math.min(100, ((total - left) / total) * 100));
}

export default function BinaryActiveTradeModal({ open, trade, onClose, onReopenSettle }) {
  if (!open || !trade) {
    return null;
  }

  const left = remainingSeconds(trade.expiresAt);
  const progress = progressPercent(trade);
  const walletSymbol = trade.walletAssetSymbol || "USDT";

  return (
    <div className="binary-modal-backdrop" onClick={onClose}>
      <section className="binary-modal-card" onClick={(event) => event.stopPropagation()}>
        <header>
          <h3>Active Trade</h3>
          <button type="button" className="binary-icon-btn" onClick={onClose}>
            <i className="fas fa-xmark" />
          </button>
        </header>

        <div className="binary-countdown-wrap">
          <div className="binary-countdown-ring" style={{ "--progress": `${progress}%` }}>
            <strong>{left}</strong>
            <span>seconds</span>
          </div>
        </div>

        <div className="binary-detail-grid">
          <p><span>Pair</span><strong>{trade.pairDisplayName}</strong></p>
          <p><span>Direction</span><strong>{directionLabel(trade.direction)}</strong></p>
          <p><span>Amount</span><strong>{formatMoney(trade.stakeAmountUsd, walletSymbol)}</strong></p>
          <p><span>Period</span><strong>{trade.periodSeconds}s</strong></p>
          <p><span>Entry Price</span><strong>{formatPrice(trade.entryPrice)}</strong></p>
          <p><span>Expected</span><strong>{formatMoney(trade.expectedProfitUsd, walletSymbol)}</strong></p>
        </div>

        {left <= 0 ? (
          <button type="button" className="binary-primary-btn" onClick={onReopenSettle}>
            Settle Now
          </button>
        ) : null}
      </section>
    </div>
  );
}
