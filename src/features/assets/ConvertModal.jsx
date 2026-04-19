import { useEffect, useState } from "react";
import { moneyLabel } from "./assets-utils";

const CONVERT_WALLETS = ["SPOT_USDT", "MAIN_USDT", "BINARY_USDT"];

export default function ConvertModal({
  open,
  assets,
  onQuote,
  onSubmit,
  onClose,
  submitting = false,
}) {
  const [walletSymbol, setWalletSymbol] = useState("SPOT_USDT");
  const [fromAssetSymbol, setFromAssetSymbol] = useState("USDT");
  const [toAssetSymbol, setToAssetSymbol] = useState("BTC");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    const allAssets = Array.isArray(assets) ? assets : ["USDT", "BTC", "ETH"];
    const fallbackTo = allAssets.find((item) => item !== "USDT") || "BTC";

    setWalletSymbol("SPOT_USDT");
    setFromAssetSymbol("USDT");
    setToAssetSymbol(fallbackTo);
    setAmount("");
    setQuote(null);
    setQuoteLoading(false);
    setError("");
  }, [assets, open]);

  const requestQuote = async () => {
    setError("");
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Enter a valid amount for quote.");
      return;
    }

    try {
      setQuoteLoading(true);
      const payload = await onQuote?.({
        walletSymbol,
        fromAssetSymbol,
        toAssetSymbol,
        amount: numericAmount,
      });
      setQuote(payload?.quote || null);
    } catch (quoteError) {
      setQuote(null);
      setError(quoteError?.message || "Could not fetch conversion quote.");
    } finally {
      setQuoteLoading(false);
    }
  };

  const submitConversion = async () => {
    setError("");

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Enter a valid amount.");
      return;
    }

    try {
      await onSubmit?.({
        walletSymbol,
        fromAssetSymbol,
        toAssetSymbol,
        amount: numericAmount,
      });
      onClose?.();
    } catch (submitError) {
      setError(submitError?.message || "Could not complete conversion.");
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="assetspage-modal-overlay" onClick={onClose}>
      <section className="assetspage-modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <h3>Convert</h3>
          <button type="button" onClick={onClose} aria-label="Close convert modal">
            <i className="fas fa-xmark" />
          </button>
        </header>

        <div className="assetspage-modal-body">
          <label>
            Wallet
            <select value={walletSymbol} onChange={(event) => setWalletSymbol(event.target.value)}>
              {CONVERT_WALLETS.map((wallet) => (
                <option key={wallet} value={wallet}>
                  {wallet}
                </option>
              ))}
            </select>
          </label>

          <label>
            From Asset
            <select value={fromAssetSymbol} onChange={(event) => setFromAssetSymbol(event.target.value)}>
              {(assets || []).map((asset) => (
                <option key={asset} value={asset}>
                  {asset}
                </option>
              ))}
            </select>
          </label>

          <label>
            To Asset
            <select value={toAssetSymbol} onChange={(event) => setToAssetSymbol(event.target.value)}>
              {(assets || []).map((asset) => (
                <option key={asset} value={asset}>
                  {asset}
                </option>
              ))}
            </select>
          </label>

          <label>
            Amount
            <input
              type="number"
              min="0"
              step="0.00000001"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
            />
          </label>

          <div className="assetspage-modal-actions">
            <button type="button" className="assetspage-ghost-btn" onClick={requestQuote} disabled={quoteLoading || submitting}>
              {quoteLoading ? "Previewing..." : "Preview"}
            </button>
            <button type="button" className="assetspage-primary-btn" onClick={submitConversion} disabled={submitting}>
              {submitting ? "Converting..." : "Confirm Convert"}
            </button>
          </div>

          {quote ? (
            <div className="assetspage-quote-box">
              <p>
                <span>Rate</span>
                <strong>1 {quote.fromAsset} = {moneyLabel(quote.rateSnapshot, 8)} {quote.toAsset}</strong>
              </p>
              <p>
                <span>Estimated Receive</span>
                <strong>{moneyLabel(quote.convertedAmount, 8)} {quote.toAsset}</strong>
              </p>
              <p>
                <span>Fee</span>
                <strong>{moneyLabel(quote.feeAmount, 8)} {quote.toAsset}</strong>
              </p>
            </div>
          ) : null}

          {error ? <p className="assetspage-alert-error">{error}</p> : null}
        </div>
      </section>
    </div>
  );
}
