import { useState } from "react";
import { directionLabel, formatDateTime, formatMoney, formatPrice, statusClassName, statusLabel } from "./binary-utils";

const FILTERS = ["all", "active", "won", "lost", "draw", "cancelled"];

export default function BinaryRecordsSection({
  trades,
  loading,
  error,
  filter,
  onFilterChange,
  onRefresh,
}) {
  const [expandedTradeId, setExpandedTradeId] = useState(null);

  const toggleExpanded = (tradeId) => {
    setExpandedTradeId((current) => (current === tradeId ? null : tradeId));
  };

  return (
    <section className="binary-records" id="binary-records">
      <header className="binary-records-head">
        <h3>Records</h3>
        <div className="binary-records-actions">
          <button type="button" className="binary-icon-btn" onClick={onRefresh} title="Refresh records">
            <i className="fas fa-rotate" />
          </button>
        </div>
      </header>

      <div className="binary-records-filters">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            className={filter === item ? "active" : ""}
            onClick={() => onFilterChange(item)}
          >
            {item === "all" ? "All" : item.charAt(0).toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      {loading ? <p className="binary-empty">Loading records...</p> : null}
      {error ? <p className="binary-error">{error}</p> : null}
      {!loading && !error && !trades.length ? <p className="binary-empty">No records found.</p> : null}

      {!loading && !error && trades.length ? (
        <div className="binary-record-list">
          {trades.map((trade) => (
            <article key={trade.tradeId} className="binary-record-item">
              <header className="binary-record-header" onClick={() => toggleExpanded(trade.tradeId)}>
                <div>
                  <strong>{trade.pairDisplayName}</strong>
                  <p className="binary-record-subtext">
                    {directionLabel(trade.direction)} • {trade.periodSeconds}s • {formatMoney(trade.stakeAmountUsd, trade.walletAssetSymbol || "USDT")}
                  </p>
                </div>
                <div className="binary-record-header-right">
                  <span className={statusClassName(trade.resultStatus)}>{statusLabel(trade.resultStatus)}</span>
                  <button
                    type="button"
                    className="binary-record-toggle"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleExpanded(trade.tradeId);
                    }}
                    aria-expanded={expandedTradeId === trade.tradeId}
                  >
                    <i className={`fas ${expandedTradeId === trade.tradeId ? "fa-chevron-up" : "fa-chevron-down"}`} />
                  </button>
                </div>
              </header>

              {expandedTradeId === trade.tradeId ? (
                <div className="binary-record-grid">
                  <p><span>Direction</span><strong>{directionLabel(trade.direction)}</strong></p>
                  <p><span>Period</span><strong>{trade.periodSeconds}s</strong></p>
                  <p><span>Stake</span><strong>{formatMoney(trade.stakeAmountUsd, trade.walletAssetSymbol || "USDT")}</strong></p>
                  <p><span>Payout</span><strong>{Number(trade.payoutPercent || 0).toFixed(2)}%</strong></p>
                  <p><span>Expected Profit</span><strong>{formatMoney(trade.expectedProfitUsd, trade.walletAssetSymbol || "USDT")}</strong></p>
                  <p><span>Realized PnL</span><strong>{formatMoney(trade.pnlUsd, trade.walletAssetSymbol || "USDT")}</strong></p>
                  <p><span>Entry Price</span><strong>{formatPrice(trade.entryPrice)}</strong></p>
                  <p><span>Settlement Price</span><strong>{trade.settlementPrice === null ? "-" : formatPrice(trade.settlementPrice)}</strong></p>
                  <p><span>Opened</span><strong>{formatDateTime(trade.openedAt)}</strong></p>
                  <p><span>Settled</span><strong>{trade.settledAt ? formatDateTime(trade.settledAt) : "-"}</strong></p>
                  <p><span>Order Ref</span><strong>{trade.tradeRef}</strong></p>
                  <p><span>Total Return</span><strong>{formatMoney((Number(trade.stakeAmountUsd || 0) + Number(trade.pnlUsd || 0)), trade.walletAssetSymbol || "USDT")}</strong></p>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
