import { moneyLabel, percentLabel, walletShortLabel } from "./assets-utils";

export default function WalletRowCard({ wallet, restriction, expanded, onToggle }) {
  return (
    <article className="assetspage-wallet-row">
      <button type="button" className="assetspage-wallet-main" onClick={onToggle}>
        <div className="assetspage-wallet-title">
          <span>{walletShortLabel(wallet.walletSymbol)}</span>
          <strong>{wallet.walletName}</strong>
          <small>{wallet.walletSymbol}</small>
        </div>

        <div className="assetspage-wallet-balance">
          <p>${moneyLabel(wallet.availableUsd)}</p>
          <small>Available • {percentLabel(wallet.percentage || 0)}</small>
        </div>

        <i className={`fas ${expanded ? "fa-chevron-up" : "fa-chevron-down"}`} />
      </button>

      {expanded ? (
        <div className="assetspage-wallet-details">
          <p>
            <span>Available</span>
            <strong>${moneyLabel(wallet.availableUsd)}</strong>
          </p>
          <p>
            <span>Locked</span>
            <strong>${moneyLabel(wallet.lockedUsd)}</strong>
          </p>
          <p>
            <span>Total</span>
            <strong>${moneyLabel(wallet.totalUsd)}</strong>
          </p>
          <p>
            <span>Coin Count</span>
            <strong>{wallet.coinCount || 0}</strong>
          </p>
          {restriction && !restriction.canWithdraw ? (
            <p className="assetspage-wallet-restriction">{restriction.reason || "Withdrawal restricted."}</p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
