import { formatTime, moneyLabel } from "./transaction-utils";

export default function SpotRecentTrades({ rows, loading, onRefresh }) {
  return (
    <section className="tx-card">
      <div className="tx-card-head tx-space-between">
        <h2>Recent Trades</h2>
        <button type="button" className="tx-mini-btn" onClick={onRefresh}>
          <i className="fas fa-rotate" />
        </button>
      </div>

      {loading ? <p className="tx-muted">Loading recent trades...</p> : null}
      {!loading && !(rows || []).length ? <p className="tx-muted">No recent trades yet.</p> : null}

      {!loading && (rows || []).length ? (
        <div className="tx-table-wrap">
          <table className="tx-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Side</th>
                <th>Price</th>
                <th>Amount</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {(rows || []).map((trade) => (
                <tr key={trade.tradeId || trade.tradeRef}>
                  <td>{formatTime(trade.createdAt)}</td>
                  <td className={trade.side === "buy" ? "tx-positive" : "tx-negative"}>{trade.side}</td>
                  <td>{moneyLabel(trade.executionPrice, trade.feeAsset || "USDT", 8)}</td>
                  <td>{moneyLabel(trade.executionQuantity, trade.pairCode?.replace(/USDT$/i, "") || "BASE", 8)}</td>
                  <td>{moneyLabel(trade.quoteTotal, trade.feeAsset || "USDT", 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
