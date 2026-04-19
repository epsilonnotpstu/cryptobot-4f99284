import { useCallback, useEffect, useMemo, useState } from "react";
import TransactionHeader from "./TransactionHeader";
import ConvertTab from "./ConvertTab";
import TradesTab from "./TradesTab";
import { walletDetailsToMap } from "./transaction-utils";
import "./transaction.css";

const BOTTOM_NAV_ITEMS = [
  { id: "home", label: "Home", icon: "fa-house" },
  { id: "transaction", label: "Transaction", icon: "fa-arrow-right-arrow-left" },
  { id: "binary", label: "Binary Options", icon: "fa-chart-simple" },
  { id: "assets", label: "Assets", icon: "fa-wallet" },
];

export default function TransactionPage({
  onBack,
  onLoadConvertPairs,
  onConvertQuote,
  onConvertSubmit,
  onLoadConvertHistory,
  onLoadSpotPairs,
  onLoadMarketSummary,
  onLoadRecentTrades,
  onPlaceOrder,
  onLoadOpenOrders,
  onLoadOrderHistory,
  onCancelOrder,
  onNavigateTab,
}) {
  const [activeTab, setActiveTab] = useState("convert");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [convertPairs, setConvertPairs] = useState([]);
  const [spotPairs, setSpotPairs] = useState([]);
  const [walletSnapshot, setWalletSnapshot] = useState({ balances: [], details: [] });

  const walletMap = useMemo(() => walletDetailsToMap(walletSnapshot?.details || []), [walletSnapshot?.details]);
  const overview = useMemo(() => {
    const details = Array.isArray(walletSnapshot?.details) ? walletSnapshot.details : [];
    const latestUpdatedAt = details.reduce((latest, row) => {
      const nextValue = row?.updatedAt ? new Date(row.updatedAt).getTime() : 0;
      return nextValue > latest ? nextValue : latest;
    }, 0);

    const trackedSymbols = new Set(details.map((row) => String(row?.symbol || "").trim()).filter(Boolean));
    const availableUsd = details.reduce((sum, row) => sum + Number(row?.availableUsd || 0), 0);
    const lockedUsd = details.reduce((sum, row) => sum + Number(row?.lockedUsd || 0), 0);

    return {
      trackedSymbols: trackedSymbols.size,
      availableUsd,
      lockedUsd,
      latestUpdatedAt: latestUpdatedAt ? new Date(latestUpdatedAt).toLocaleString() : "--",
    };
  }, [walletSnapshot?.balances, walletSnapshot?.details]);

  const formatUsd = (value) =>
    Number(value || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const syncWallet = (wallet) => {
    if (!wallet || typeof wallet !== "object") {
      return;
    }
    setWalletSnapshot({
      balances: Array.isArray(wallet.balances) ? wallet.balances : [],
      details: Array.isArray(wallet.details) ? wallet.details : [],
    });
  };

  const refreshPage = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [convertPayload, spotPayload] = await Promise.all([onLoadConvertPairs?.(), onLoadSpotPairs?.()]);

      setConvertPairs(Array.isArray(convertPayload?.pairs) ? convertPayload.pairs : []);
      setSpotPairs(Array.isArray(spotPayload?.pairs) ? spotPayload.pairs : []);

      if (convertPayload?.wallet) {
        syncWallet(convertPayload.wallet);
      } else if (spotPayload?.wallet) {
        syncWallet(spotPayload.wallet);
      }
    } catch (loadError) {
      setError(loadError.message || "Could not load transaction page.");
    } finally {
      setLoading(false);
    }
  }, [onLoadConvertPairs, onLoadSpotPairs]);

  useEffect(() => {
    refreshPage();
  }, [refreshPage]);

  const activeSpotPair = spotPairs[0] || null;

  return (
    <main className="txpage-root">
      <div className="txpage-bg-orb txpage-bg-left" />
      <div className="txpage-bg-orb txpage-bg-right" />

      <section className="txpage-shell">
        <TransactionHeader
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onRefresh={refreshPage}
          onBack={onBack}
          loading={loading}
          pairLabel={activeSpotPair?.displayName || "Market Pair"}
          pairChange={activeSpotPair?.changePercent || 0}
        />

        <section className="txpage-overview-strip">
          <article className="txpage-overview-main">
            <p>Trading Overview</p>
            <h2>${formatUsd(overview.availableUsd + overview.lockedUsd)}</h2>
            <span>Combined trading wallet value</span>
          </article>

          <div className="txpage-overview-grid">
            <article>
              <span>Available</span>
              <strong>${formatUsd(overview.availableUsd)}</strong>
            </article>
            <article>
              <span>Locked</span>
              <strong>${formatUsd(overview.lockedUsd)}</strong>
            </article>
            <article>
              <span>Wallet Symbols</span>
              <strong>{overview.trackedSymbols}</strong>
            </article>
            <article>
              <span>Last Sync</span>
              <strong>{overview.latestUpdatedAt}</strong>
            </article>
          </div>
        </section>

        {error ? <p className="tx-alert tx-alert-error">{error}</p> : null}
        {notice ? <p className="tx-alert tx-alert-notice">{notice}</p> : null}

        {activeTab === "convert" ? (
          <ConvertTab
            pairs={convertPairs}
            walletMap={walletMap}
            onQuote={onConvertQuote}
            onSubmit={onConvertSubmit}
            onLoadHistory={onLoadConvertHistory}
            onWalletSync={syncWallet}
            onNotice={(message) => {
              setNotice(message || "");
              setError("");
            }}
            onError={(message) => {
              setError(message || "");
              setNotice("");
            }}
          />
        ) : (
          <TradesTab
            pairs={spotPairs}
            walletMap={walletMap}
            onLoadMarketSummary={onLoadMarketSummary}
            onLoadRecentTrades={onLoadRecentTrades}
            onPlaceOrder={onPlaceOrder}
            onLoadOpenOrders={onLoadOpenOrders}
            onLoadOrderHistory={onLoadOrderHistory}
            onCancelOrder={onCancelOrder}
            onWalletSync={syncWallet}
            onNotice={(message) => {
              setNotice(message || "");
              setError("");
            }}
            onError={(message) => {
              setError(message || "");
              setNotice("");
            }}
          />
        )}
      </section>

      <nav className="txpage-floating-nav" aria-label="Primary">
        {BOTTOM_NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === "transaction" ? "active" : ""}
            onClick={() => onNavigateTab?.(item.id)}
          >
            <i className={`fas ${item.icon}`} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
