import { useEffect, useMemo, useState } from "react";
import { moneyLabel } from "./assets-utils";

const WITHDRAW_WALLETS = ["SPOT_USDT", "MAIN_USDT", "BINARY_USDT"];

export default function WithdrawModal({
  open,
  config,
  getAvailableForAsset,
  onClose,
  onSubmit,
  submitting = false,
}) {
  const [walletSymbol, setWalletSymbol] = useState("SPOT_USDT");
  const [assetSymbol, setAssetSymbol] = useState("USDT");
  const [networkType, setNetworkType] = useState("");
  const [amountUsd, setAmountUsd] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [destinationLabel, setDestinationLabel] = useState("");
  const [step, setStep] = useState("form");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setWalletSymbol("SPOT_USDT");
    setAssetSymbol(config?.defaultAssetSymbol || "USDT");
    setNetworkType("");
    setAmountUsd("");
    setDestinationAddress("");
    setDestinationLabel("");
    setError("");
    setStep("form");
  }, [open, config?.defaultAssetSymbol]);

  const selectedAsset = useMemo(() => {
    const assets = Array.isArray(config?.assets) ? config.assets : [];
    return assets.find((item) => item.assetSymbol === assetSymbol) || null;
  }, [assetSymbol, config?.assets]);

  const available = Number(getAvailableForAsset?.(walletSymbol, assetSymbol) || 0);
  const restriction = config?.walletRestrictions?.[walletSymbol] || { canWithdraw: walletSymbol === "SPOT_USDT" };

  const continueToConfirm = () => {
    setError("");

    if (!restriction.canWithdraw) {
      setError(restriction.reason || "Withdrawal is disabled for this wallet.");
      return;
    }

    const numericAmount = Number(amountUsd);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Enter a valid amount.");
      return;
    }

    if (numericAmount > available) {
      setError("Amount exceeds available balance.");
      return;
    }

    const minAmount = Number(config?.minWithdrawUsd || 0);
    const maxAmount = Number(config?.maxWithdrawUsd || 0);

    if (minAmount > 0 && numericAmount < minAmount) {
      setError(`Minimum withdrawal is ${minAmount}.`);
      return;
    }
    if (maxAmount > 0 && numericAmount > maxAmount) {
      setError(`Maximum withdrawal is ${maxAmount}.`);
      return;
    }

    if (!destinationAddress.trim() || destinationAddress.trim().length < 10) {
      setError("Enter a valid destination address.");
      return;
    }

    if (selectedAsset?.networks?.length && !networkType) {
      setError("Select a network.");
      return;
    }

    setStep("confirm");
  };

  const submitRequest = async () => {
    setError("");
    try {
      await onSubmit?.({
        walletSymbol,
        assetSymbol,
        networkType,
        amountUsd: Number(amountUsd),
        destinationAddress: destinationAddress.trim(),
        destinationLabel: destinationLabel.trim(),
      });
      onClose?.();
    } catch (submitError) {
      setError(submitError?.message || "Could not submit withdrawal.");
      setStep("form");
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="assetspage-modal-overlay" onClick={onClose}>
      <section className="assetspage-modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <h3>{step === "confirm" ? "Confirm Withdrawal" : "Withdraw"}</h3>
          <button type="button" onClick={onClose} aria-label="Close withdraw modal">
            <i className="fas fa-xmark" />
          </button>
        </header>

        {step === "form" ? (
          <div className="assetspage-modal-body">
            <label>
              Source Wallet
              <select value={walletSymbol} onChange={(event) => setWalletSymbol(event.target.value)}>
                {WITHDRAW_WALLETS.map((symbol) => (
                  <option key={symbol} value={symbol}>
                    {symbol}
                  </option>
                ))}
              </select>
            </label>

            {!restriction.canWithdraw ? <p className="assetspage-alert-error">{restriction.reason}</p> : null}

            <label>
              Coin
              <select value={assetSymbol} onChange={(event) => setAssetSymbol(event.target.value)}>
                {(config?.assets || []).map((asset) => (
                  <option key={asset.assetSymbol} value={asset.assetSymbol}>
                    {asset.assetSymbol}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Amount
              <div className="assetspage-input-inline">
                <input
                  type="number"
                  min="0"
                  step="0.00000001"
                  value={amountUsd}
                  onChange={(event) => setAmountUsd(event.target.value)}
                  placeholder="0.00"
                />
                <button type="button" className="assetspage-mini-btn" onClick={() => setAmountUsd(String(available || 0))}>
                  Max
                </button>
              </div>
              <small>Available: {moneyLabel(available, 6)} {assetSymbol}</small>
            </label>

            <label>
              Network
              <select value={networkType} onChange={(event) => setNetworkType(event.target.value)}>
                <option value="">Select network</option>
                {(selectedAsset?.networks || []).map((network) => (
                  <option key={network} value={network}>
                    {network}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Destination Address
              <input
                type="text"
                value={destinationAddress}
                onChange={(event) => setDestinationAddress(event.target.value)}
                placeholder="Enter wallet address"
              />
            </label>

            <label>
              Address Label (Optional)
              <input
                type="text"
                value={destinationLabel}
                onChange={(event) => setDestinationLabel(event.target.value)}
                placeholder="Personal wallet"
              />
            </label>

            <div className="assetspage-info-box">
              <p>Withdrawals are submitted as pending requests for manual review.</p>
              <p>Binary wallet direct withdrawal is disabled by default.</p>
            </div>

            {error ? <p className="assetspage-alert-error">{error}</p> : null}

            <button type="button" className="assetspage-primary-btn" onClick={continueToConfirm} disabled={!restriction.canWithdraw}>
              Continue
            </button>
          </div>
        ) : null}

        {step === "confirm" ? (
          <div className="assetspage-modal-body">
            <div className="assetspage-confirm-grid">
              <p>
                <span>Wallet</span>
                <strong>{walletSymbol}</strong>
              </p>
              <p>
                <span>Asset</span>
                <strong>{assetSymbol}</strong>
              </p>
              <p>
                <span>Amount</span>
                <strong>{moneyLabel(amountUsd || 0, 6)} {assetSymbol}</strong>
              </p>
              <p>
                <span>Network</span>
                <strong>{networkType || "-"}</strong>
              </p>
              <p>
                <span>Address</span>
                <strong>{destinationAddress}</strong>
              </p>
            </div>

            {error ? <p className="assetspage-alert-error">{error}</p> : null}

            <div className="assetspage-modal-actions">
              <button type="button" className="assetspage-ghost-btn" onClick={() => setStep("form")} disabled={submitting}>
                Back
              </button>
              <button type="button" className="assetspage-primary-btn" onClick={submitRequest} disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
