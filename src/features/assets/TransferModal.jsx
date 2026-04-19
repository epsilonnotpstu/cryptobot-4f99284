import { useEffect, useMemo, useState } from "react";
import { moneyLabel } from "./assets-utils";

const TRANSFER_WALLETS = ["SPOT_USDT", "MAIN_USDT", "BINARY_USDT"];

export default function TransferModal({
  open,
  getWalletAvailable,
  allowMainBinaryTransfer = false,
  onClose,
  onSubmit,
  submitting = false,
}) {
  const [fromWalletSymbol, setFromWalletSymbol] = useState("SPOT_USDT");
  const [toWalletSymbol, setToWalletSymbol] = useState("BINARY_USDT");
  const [amountUsd, setAmountUsd] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setFromWalletSymbol("SPOT_USDT");
    setToWalletSymbol("BINARY_USDT");
    setAmountUsd("");
    setError("");
  }, [open]);

  const available = Number(getWalletAvailable?.(fromWalletSymbol) || 0);

  const isFlowAllowed = useMemo(() => {
    if (fromWalletSymbol === toWalletSymbol) {
      return false;
    }

    const pair = `${fromWalletSymbol}->${toWalletSymbol}`;
    if (pair.includes("SPOT_USDT") || pair.includes("->SPOT_USDT")) {
      return true;
    }

    return allowMainBinaryTransfer;
  }, [allowMainBinaryTransfer, fromWalletSymbol, toWalletSymbol]);

  const submitTransfer = async () => {
    setError("");
    if (!isFlowAllowed) {
      setError("This transfer route is disabled by current wallet rules.");
      return;
    }

    const amount = Number(amountUsd);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid transfer amount.");
      return;
    }
    if (amount > available) {
      setError("Amount exceeds source available balance.");
      return;
    }

    try {
      await onSubmit?.({
        fromWalletSymbol,
        toWalletSymbol,
        amountUsd: amount,
      });
      onClose?.();
    } catch (submitError) {
      setError(submitError?.message || "Could not submit transfer.");
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="assetspage-modal-overlay" onClick={onClose}>
      <section className="assetspage-modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <h3>Transfer</h3>
          <button type="button" onClick={onClose} aria-label="Close transfer modal">
            <i className="fas fa-xmark" />
          </button>
        </header>

        <div className="assetspage-modal-body">
          <label>
            From Wallet
            <select value={fromWalletSymbol} onChange={(event) => setFromWalletSymbol(event.target.value)}>
              {TRANSFER_WALLETS.map((wallet) => (
                <option key={wallet} value={wallet}>
                  {wallet}
                </option>
              ))}
            </select>
          </label>

          <label>
            To Wallet
            <select value={toWalletSymbol} onChange={(event) => setToWalletSymbol(event.target.value)}>
              {TRANSFER_WALLETS.map((wallet) => (
                <option key={wallet} value={wallet}>
                  {wallet}
                </option>
              ))}
            </select>
          </label>

          <label>
            Amount (USDT)
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
            <small>Source available: {moneyLabel(available, 6)} USDT</small>
          </label>

          {!isFlowAllowed ? <p className="assetspage-alert-error">Main/Binary transfer route is currently disabled.</p> : null}
          {error ? <p className="assetspage-alert-error">{error}</p> : null}

          <button type="button" className="assetspage-primary-btn" onClick={submitTransfer} disabled={submitting || !isFlowAllowed}>
            {submitting ? "Transferring..." : "Confirm Transfer"}
          </button>
        </div>
      </section>
    </div>
  );
}
