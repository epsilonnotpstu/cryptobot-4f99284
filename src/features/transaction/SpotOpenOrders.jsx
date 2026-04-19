import { formatTime, moneyLabel, statusTone } from "./transaction-utils";

export default function SpotOpenOrders({ rows, loading, onRefresh, onCancel }) {
  return (
    <section className="tx-card">
      <div className="tx-card-head tx-space-between">
        <h2>Open Orders</h2>
        <button type="button" className="tx-mini-btn" onClick={onRefresh}>
          <i className="fas fa-rotate" />
        </button>
      </div>

      {loading ? <p className="tx-muted">Loading open orders...</p> : null}
      {!loading && !(rows || []).length ? <p className="tx-muted">No open orders.</p> : null}

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
                <th>Price</th>
                <th>Status</th>
                <th>Action</th>
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
                  <td>{row.price ? moneyLabel(row.price, row.quoteAsset, 8) : "Market"}</td>
                  <td>
                    <span className={`tx-status ${statusTone(row.status)}`}>{row.status}</span>
                  </td>
                  <td>
                    <button type="button" className="tx-mini-btn is-danger" onClick={() => onCancel(row.orderId)}>
                      Cancel
                    </button>
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
