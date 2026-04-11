import BinaryPairSelector from "./BinaryPairSelector";
import { formatPrice } from "./binary-utils";

export default function BinaryHeader({
  selectedPair,
  pairs,
  selectedPairId,
  onPairChange,
  onBack,
  onRefresh,
  onOpenHistory,
  loading,
}) {
  return (
    <header className="binary-header">
      <button type="button" className="binary-icon-btn" onClick={onBack}>
        <i className="fas fa-arrow-left" />
      </button>

      <div className="binary-header-main">
        <BinaryPairSelector pairs={pairs} value={selectedPairId} onChange={onPairChange} disabled={loading || !pairs.length} />
        <div className="binary-live-price">
          <span>Live Price</span>
          <strong>{selectedPair ? formatPrice(selectedPair.currentPrice, selectedPair.pricePrecision) : "0.00"}</strong>
        </div>
      </div>

      <div className="binary-header-actions">
        <button type="button" className="binary-icon-btn" onClick={onRefresh} title="Refresh">
          <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} />
        </button>
        <button type="button" className="binary-icon-btn" onClick={onOpenHistory} title="Trade history">
          <i className="fas fa-clock-rotate-left" />
        </button>
      </div>
    </header>
  );
}
