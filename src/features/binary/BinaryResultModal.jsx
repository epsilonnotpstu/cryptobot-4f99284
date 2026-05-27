import { useEffect, useRef, useState } from "react";
import { directionLabel, formatMoney, formatPrice, statusLabel, statusClassName } from "./binary-utils";

function outcomeHeading(status) {
  if (status === "won") {
    return "Trade Won";
  }
  if (status === "lost") {
    return "Trade Lost";
  }
  if (status === "draw") {
    return "Draw Settled";
  }
  if (status === "cancelled") {
    return "Trade Cancelled";
  }
  return "Trade Result";
}

export default function BinaryResultModal({ open, trade, summary, onClose, onTradeAgain, autoCloseSeconds = 10 }) {
  const [secondsLeft, setSecondsLeft] = useState(Math.max(1, Number(autoCloseSeconds || 10)));
  const closeRef = useRef(onClose);
  const timerRef = useRef(null);
  const lastSessionKeyRef = useRef("");
  const tradeSessionKey = String(trade?.tradeId || trade?.createdAt || "result");

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || !trade) {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      lastSessionKeyRef.current = "";
      return undefined;
    }

    const safeAutoCloseSeconds = Math.max(1, Number(autoCloseSeconds || 10));
    const sessionKey = `${tradeSessionKey}:${safeAutoCloseSeconds}`;

    if (lastSessionKeyRef.current !== sessionKey) {
      lastSessionKeyRef.current = sessionKey;
      setSecondsLeft(safeAutoCloseSeconds);
    }

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    timerRef.current = window.setTimeout(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          closeRef.current?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoCloseSeconds, open, secondsLeft, tradeSessionKey]);

  if (!open || !trade) {
    return null;
  }

  const status = String(trade.resultStatus || "").toLowerCase();
  const pnl = Number(trade.pnlUsd || 0);
  const isWon = status === "won";
  const bannerTitle = isWon ? "Congratulations" : outcomeHeading(status);

  return (
    <div className="binary-modal-backdrop" onClick={onClose}>
      <section className="binary-modal-card binary-result-modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <h3>{trade.pairDisplayName || "Pair"}</h3>
          <button type="button" className="binary-icon-btn" onClick={onClose}>
            <i className="fas fa-xmark" />
          </button>
        </header>

        <div className="binary-result-banner">
          <p className={statusClassName(status)}>{statusLabel(status)}</p>
          <strong>{bannerTitle}</strong>
          <span>
            {pnl >= 0 ? "+" : ""}
            {formatMoney(pnl, trade.walletAssetSymbol || "USDT")}
          </span>
          <small className="binary-result-timer">Auto close in {secondsLeft}s</small>
        </div>

        <div className="binary-detail-grid">
          <p><span>Direction</span><strong>{directionLabel(trade.direction)}</strong></p>
          <p><span>Period</span><strong>{trade.periodSeconds}s</strong></p>
          <p><span>Stake</span><strong>{formatMoney(trade.stakeAmountUsd, trade.walletAssetSymbol || "USDT")}</strong></p>
          <p><span>Expected</span><strong>{formatMoney(trade.expectedProfitUsd, trade.walletAssetSymbol || "USDT")}</strong></p>
          <p><span>Entry Price</span><strong>{formatPrice(trade.entryPrice)}</strong></p>
          <p><span>Settlement Price</span><strong>{trade.settlementPrice === null ? "-" : formatPrice(trade.settlementPrice)}</strong></p>
        </div>

        <div className="binary-result-footer">
          <small>
            Wallet after settlement: {formatMoney(summary?.availableBalance ?? summary?.binaryWallet ?? 0, summary?.walletAssetSymbol || "USDT")}
          </small>
          <div className="binary-result-footer-actions">
            <button type="button" className="binary-icon-btn" onClick={onClose}>
              Close
            </button>
            <button type="button" className="binary-primary-btn" onClick={onTradeAgain}>
              Trade Again
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
