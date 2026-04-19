import { formatTime, historyTypeLabel, moneyLabel, statusTone } from "./assets-utils";

const TYPE_FILTERS = ["all", "deposit", "withdraw", "transfer", "convert", "binary", "lum"];

export default function AssetsHistorySection({
  rows,
  loading,
  error,
  typeFilter,
  walletFilter,
  onTypeFilterChange,
  onWalletFilterChange,
  onRefresh,
  pagination,
  onLoadMore,
}) {
  return (
    <section className="assetspage-card assetspage-history-card">
      <div className="assetspage-card-head assetspage-history-head">
        <h2>History</h2>
        <button type="button" className="assetspage-mini-btn" onClick={onRefresh}>
          <i className="fas fa-rotate" /> Refresh
        </button>
      </div>

      <div className="assetspage-filter-row">
        <div className="assetspage-filter-pills" role="tablist" aria-label="History filters">
          {TYPE_FILTERS.map((type) => (
            <button
              key={type}
              type="button"
              className={typeFilter === type ? "active" : ""}
              onClick={() => onTypeFilterChange?.(type)}
            >
              {historyTypeLabel(type)}
            </button>
          ))}
        </div>

        <select value={walletFilter} onChange={(event) => onWalletFilterChange?.(event.target.value)}>
          <option value="all">All Wallets</option>
          <option value="SPOT_USDT">Spot Wallet</option>
          <option value="MAIN_USDT">Main Wallet</option>
          <option value="BINARY_USDT">Binary Wallet</option>
        </select>
      </div>

      {loading ? <p className="assetspage-muted">Loading history...</p> : null}
      {error ? <p className="assetspage-alert-error">{error}</p> : null}

      {!loading && !error ? (
        <div className="assetspage-history-list">
          {(rows || []).map((row) => (
            <article key={row.historyId} className="assetspage-history-item">
              <div>
                <p>
                  <strong>{row.title || historyTypeLabel(row.type)}</strong>
                  <span>{row.subtitle || row.type}</span>
                </p>
                <small>{formatTime(row.createdAt)}</small>
              </div>

              <div className="assetspage-history-meta">
                <strong className={Number(row.signedAmountUsd || 0) < 0 ? "is-negative" : "is-positive"}>
                  {Number(row.signedAmountUsd || 0) < 0 ? "-" : "+"}${moneyLabel(Math.abs(Number(row.amountUsd || 0)), 6)}
                </strong>
                <span className={`assetspage-status ${statusTone(row.status)}`}>{row.status}</span>
              </div>
            </article>
          ))}
          {!(rows || []).length ? <p className="assetspage-muted">No activity found for this filter.</p> : null}
        </div>
      ) : null}

      {pagination?.hasMore ? (
        <button type="button" className="assetspage-ghost-btn assetspage-loadmore-btn" onClick={onLoadMore}>
          Load More
        </button>
      ) : null}
    </section>
  );
}
