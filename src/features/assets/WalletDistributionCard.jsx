import { buildDonutGradient, moneyLabel, percentLabel, walletColor } from "./assets-utils";

export default function WalletDistributionCard({ totalAssets = 0, chartData = [], loading = false }) {
  const donutBackground = buildDonutGradient(chartData);

  return (
    <section className="assetspage-card assetspage-distribution-card">
      <div className="assetspage-card-head">
        <h2>Wallet Distribution</h2>
      </div>

      {loading ? <p className="assetspage-muted">Loading distribution...</p> : null}

      {!loading ? (
        <div className="assetspage-distribution-grid">
          <div className="assetspage-donut-wrap">
            <div className="assetspage-donut" style={{ background: donutBackground }}>
              <div>
                <small>Total Assets</small>
                <strong>${moneyLabel(totalAssets)}</strong>
              </div>
            </div>
          </div>

          <div className="assetspage-distribution-list">
            {(chartData || []).map((row) => (
              <article key={row.key} className="assetspage-distribution-item">
                <div>
                  <span className="assetspage-color-dot" style={{ background: walletColor(row.key) }} />
                  <strong>{row.label}</strong>
                </div>
                <div>
                  <p>${moneyLabel(row.valueUsd || 0)}</p>
                  <small>{percentLabel(row.percentage || 0)}</small>
                </div>
              </article>
            ))}
            {!(chartData || []).length ? <p className="assetspage-muted">No wallet data found.</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
