import { formatTime, moneyLabel, statusTone } from "./transaction-utils";

export default function ConvertHistoryTable({ rows, loading, statusFilter, onStatusFilterChange, onRefresh }) {
  return (
    <section className="tx-card">
      <div className="tx-card-head tx-space-between">
        <h2>Convert History</h2>
        <div className="tx-filter-row">
          <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}>
            <option value="all">All</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button type="button" className="tx-mini-btn" onClick={onRefresh}>
            <i className="fas fa-rotate" />
          </button>
        </div>
      </div>

      {loading ? <p className="tx-muted">Loading history...</p> : null}
      {!loading && !(rows || []).length ? <p className="tx-muted">No convert history yet.</p> : null}

      {!loading && (rows || []).length ? (
        <div className="tx-table-wrap">
          <table className="tx-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Pair</th>
                <th>From</th>
                <th>Receive</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(rows || []).map((row) => (
                <tr key={row.convertId || row.convertRef}>
                  <td>{formatTime(row.createdAt)}</td>
                  <td>{row.displayName || row.pairCode}</td>
                  <td>{moneyLabel(row.fromAmount, row.fromAsset, 8)}</td>
                  <td>{moneyLabel(row.receiveAmount, row.toAsset, 8)}</td>
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
