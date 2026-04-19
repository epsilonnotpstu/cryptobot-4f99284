import { formatTime, moneyLabel, statusTone } from "./transaction-utils";

export default function SpotOrderHistory({ rows, loading, statusFilter, onStatusFilterChange, onRefresh }) {
  return (
    <section className="tx-card">
      <div className="tx-card-head tx-space-between">
        <h2>Order History</h2>
        <div className="tx-filter-row">
          <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}>
            <option value="all">All</option>
            <option value="filled">Filled</option>
            <option value="open">Open</option>
            <option value="cancelled">Cancelled</option>
            <option value="rejected">Rejected</option>
            <option value="error">Error</option>
          </select>
          <button type="button" className="tx-mini-btn" onClick={onRefresh}>
            <i className="fas fa-rotate" />
          </button>
        </div>
      </div>

      {loading ? <p className="tx-muted">Loading order history...</p> : null}
      {!loading && !(rows || []).length ? <p className="tx-muted">No order history found.</p> : null}

      {!loading && (rows || []).length ? (
        <div className="tx-table-wrap">
          <table className="tx-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Pair</th>
                <th>Side</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Avg Price</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(rows || []).map((row) => (
                <tr key={row.orderId || row.orderRef}>
                  <td>{formatTime(row.createdAt)}</td>
                  <td>{row.pairDisplayName || row.pairCode}</td>
                  <td className={row.side === "buy" ? "tx-positive" : "tx-negative"}>{row.side}</td>
                  <td>{row.orderType}</td>
                  <td>{moneyLabel(row.quantity, row.baseAsset, 8)}</td>
                  <td>{row.avgFillPrice ? moneyLabel(row.avgFillPrice, row.quoteAsset, 8) : "-"}</td>
                  <td>{row.quoteAmount ? moneyLabel(row.quoteAmount, row.quoteAsset, 8) : "-"}</td>
                  <td>
                    <span className={`tx-status ${statusTone(row.status)}`}>{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
