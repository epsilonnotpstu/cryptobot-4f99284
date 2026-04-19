import { percentLabel } from "./transaction-utils";

export default function TransactionHeader({
  activeTab,
  onTabChange,
  onRefresh,
  onBack,
  loading,
  pairLabel,
  pairChange,
}) {
  return (
    <header className="txpage-header">
      <div className="txpage-topline">
        <button type="button" className="txpage-icon-btn" onClick={onBack} aria-label="Back to dashboard">
          <i className="fas fa-arrow-left" />
        </button>
        <h1>Transaction</h1>
        <button
          type="button"
          className="txpage-icon-btn"
          onClick={onRefresh}
          aria-label="Refresh transaction data"
          disabled={loading}
        >
          <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-rotate"}`} />
        </button>
      </div>

      <div className="txpage-tab-pill" role="tablist" aria-label="Transaction Tabs">
        <button
          type="button"
          className={activeTab === "convert" ? "active" : ""}
          onClick={() => onTabChange("convert")}
        >
          Convert
        </button>
        <button
          type="button"
          className={activeTab === "trades" ? "active" : ""}
          onClick={() => onTabChange("trades")}
        >
          Trades
        </button>
      </div>

      <div className="txpage-pair-strip">
        <strong>{pairLabel || "Market Pair"}</strong>
        <span className={Number(pairChange) >= 0 ? "tx-positive" : "tx-negative"}>{percentLabel(pairChange || 0)}</span>
      </div>
    </header>
  );
}
