import { useCallback, useEffect, useMemo, useState } from "react";
import WalletDistributionCard from "./WalletDistributionCard";
import WalletRowCard from "./WalletRowCard";
import AssetsQuickActions from "./AssetsQuickActions";
import WithdrawModal from "./WithdrawModal";
import TransferModal from "./TransferModal";
import ConvertModal from "./ConvertModal";
import AssetsHistorySection from "./AssetsHistorySection";
import { toNumber } from "./assets-utils";
import "./assets.css";

const BOTTOM_NAV_ITEMS = [
  { id: "home", label: "Home", icon: "fa-house" },
  { id: "transaction", label: "Transaction", icon: "fa-arrow-right-arrow-left" },
  { id: "binary", label: "Binary Options", icon: "fa-chart-simple" },
  { id: "assets", label: "Assets", icon: "fa-wallet" },
];

const DEFAULT_SUMMARY = {
  wallets: [],
  totalAssets: 0,
  chartData: [],
  distributionPercentages: {},
  walletDetails: [],
};

function detailsToMap(details = []) {
  return (Array.isArray(details) ? details : []).reduce((acc, row) => {
    const symbol = String(row?.symbol || "").toUpperCase();
    if (!symbol) {
      return acc;
    }
    acc[symbol] = {
      availableUsd: Number(row?.availableUsd || 0),
      lockedUsd: Number(row?.lockedUsd || 0),
      rewardEarnedUsd: Number(row?.rewardEarnedUsd || 0),
      updatedAt: row?.updatedAt || "",
    };
    return acc;
  }, {});
}

function getScope(walletSymbol = "SPOT_USDT") {
  const normalized = String(walletSymbol || "").toUpperCase();
  if (normalized.startsWith("MAIN_")) {
    return "MAIN";
  }
  if (normalized.startsWith("BINARY_")) {
    return "BINARY";
  }
  return "SPOT";
}

export default function AssetsPage({
  user,
  onBack,
  onOpenDepositPage,
  onLoadSummary,
  onLoadWallets,
  onLoadHistory,
  onTransfer,
  onConvertQuote,
  onConvert,
  onLoadWithdrawConfig,
  onWithdraw,
  onLoadWithdrawals,
  onLoadTransfers,
  onLoadConversions,
  onNavigateTab,
}) {
  const [summary, setSummary] = useState(DEFAULT_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyType, setHistoryType] = useState("all");
  const [historyWallet, setHistoryWallet] = useState("all");
  const [historyPagination, setHistoryPagination] = useState({ page: 1, limit: 20, total: 0, hasMore: false });

  const [withdrawConfig, setWithdrawConfig] = useState({ assets: [], walletRestrictions: {} });

  const [expandedWallets, setExpandedWallets] = useState({ SPOT_USDT: true, MAIN_USDT: false, BINARY_USDT: false });

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [convertSubmitting, setConvertSubmitting] = useState(false);

  const walletDetailMap = useMemo(() => detailsToMap(summary.walletDetails || []), [summary.walletDetails]);

  const applyWalletSnapshot = useCallback((wallet) => {
    if (!wallet || typeof wallet !== "object") {
      return;
    }

    setSummary((prev) => ({
      ...prev,
      wallets: Array.isArray(wallet.wallets) ? wallet.wallets : prev.wallets,
      totalAssets: Number(wallet.totalAssets ?? prev.totalAssets ?? 0) || 0,
      chartData: Array.isArray(wallet.chartData) ? wallet.chartData : prev.chartData,
      distributionPercentages:
        wallet.distributionPercentages && typeof wallet.distributionPercentages === "object"
          ? wallet.distributionPercentages
          : prev.distributionPercentages,
      walletDetails: Array.isArray(wallet.walletDetails) ? wallet.walletDetails : prev.walletDetails,
    }));
  }, []);

  const refreshOverview = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [summaryPayload, walletsPayload, withdrawConfigPayload] = await Promise.all([
        onLoadSummary?.(),
        onLoadWallets?.(),
        onLoadWithdrawConfig?.(),
      ]);

      const resolvedSummary = {
        wallets:
          (Array.isArray(summaryPayload?.wallets) ? summaryPayload.wallets : null) ||
          (Array.isArray(walletsPayload?.wallets) ? walletsPayload.wallets : []),
        totalAssets:
          Number(summaryPayload?.totalAssets ?? walletsPayload?.totalAssets ?? 0) || 0,
        chartData: Array.isArray(summaryPayload?.chartData) ? summaryPayload.chartData : [],
        distributionPercentages:
          summaryPayload?.distributionPercentages && typeof summaryPayload.distributionPercentages === "object"
            ? summaryPayload.distributionPercentages
            : {},
        walletDetails:
          (Array.isArray(summaryPayload?.walletDetails) ? summaryPayload.walletDetails : null) ||
          (Array.isArray(walletsPayload?.walletDetails) ? walletsPayload.walletDetails : []),
      };

      setSummary(resolvedSummary);
      setWithdrawConfig(withdrawConfigPayload || { assets: [], walletRestrictions: {} });
    } catch (loadError) {
      setError(loadError.message || "Could not load assets overview.");
    } finally {
      setLoading(false);
    }
  }, [onLoadSummary, onLoadWallets, onLoadWithdrawConfig]);

  const refreshHistory = useCallback(
    async ({ page = 1, append = false } = {}) => {
      setHistoryLoading(true);
      if (!append) {
        setHistoryError("");
      }

      try {
        const payload = await onLoadHistory?.({
          type: historyType,
          wallet: historyWallet,
          page,
          limit: 20,
        });

        const nextRows = Array.isArray(payload?.rows) ? payload.rows : [];
        const nextPagination = payload?.pagination || { page, limit: 20, total: nextRows.length, hasMore: false };

        setHistoryRows((prev) => (append ? [...prev, ...nextRows] : nextRows));
        setHistoryPagination({
          page: Number(nextPagination.page || page),
          limit: Number(nextPagination.limit || 20),
          total: Number(nextPagination.total || 0),
          hasMore: Boolean(nextPagination.hasMore),
        });
      } catch (loadError) {
        setHistoryError(loadError.message || "Could not load history.");
      } finally {
        setHistoryLoading(false);
      }
    },
    [historyType, historyWallet, onLoadHistory],
  );

  useEffect(() => {
    refreshOverview();
  }, [refreshOverview]);

  useEffect(() => {
    refreshHistory({ page: 1, append: false });
  }, [refreshHistory]);

  const handleQuickAction = (actionId) => {
    setNotice("");
    if (actionId === "deposit") {
      onOpenDepositPage?.();
      return;
    }
    if (actionId === "withdraw") {
      setWithdrawOpen(true);
      return;
    }
    if (actionId === "transfer") {
      setTransferOpen(true);
      return;
    }
    if (actionId === "convert") {
      setConvertOpen(true);
    }
  };

  const getWalletAvailable = (walletSymbol) => {
    const normalized = String(walletSymbol || "").toUpperCase();
    if (walletDetailMap[normalized]) {
      return toNumber(walletDetailMap[normalized].availableUsd, 0);
    }

    const normalizedCollapsed = normalized.replace(/_/g, "");
    const matchedDetailKey = Object.keys(walletDetailMap).find(
      (symbol) => String(symbol || "").toUpperCase().replace(/_/g, "") === normalizedCollapsed,
    );
    if (matchedDetailKey && walletDetailMap[matchedDetailKey]) {
      return toNumber(walletDetailMap[matchedDetailKey].availableUsd, 0);
    }

    const target = (summary.wallets || []).find((item) => String(item?.walletSymbol || "").toUpperCase() === normalized);
    return toNumber(target?.availableUsd, 0);
  };

  const getAvailableForAsset = (walletSymbol, assetSymbol) => {
    const scope = getScope(walletSymbol);
    const asset = String(assetSymbol || "USDT").toUpperCase();
    const symbol = `${scope}_${asset}`;
    if (walletDetailMap[symbol]) {
      return toNumber(walletDetailMap[symbol].availableUsd, 0);
    }
    return getWalletAvailable(`${scope}_USDT`);
  };

  const handleSubmitTransfer = async (payload) => {
    setTransferSubmitting(true);
    setError("");
    setNotice("");

    try {
      const result = await onTransfer?.(payload);
      setNotice(result?.message || "Transfer completed successfully.");
      applyWalletSnapshot(result?.wallet);
      await Promise.all([
        refreshHistory({ page: 1, append: false }),
        onLoadTransfers?.({ page: 1, limit: 10 }),
      ]);
    } finally {
      setTransferSubmitting(false);
    }
  };

  const handleConvertQuote = async (payload) => {
    return onConvertQuote?.(payload);
  };

  const handleSubmitConvert = async (payload) => {
    setConvertSubmitting(true);
    setError("");
    setNotice("");

    try {
      const result = await onConvert?.(payload);
      setNotice(result?.message || "Conversion completed successfully.");
      applyWalletSnapshot(result?.wallet);
      await Promise.all([
        refreshHistory({ page: 1, append: false }),
        onLoadConversions?.({ page: 1, limit: 10 }),
      ]);
    } finally {
      setConvertSubmitting(false);
    }
  };

  const handleSubmitWithdraw = async (payload) => {
    setWithdrawSubmitting(true);
    setError("");
    setNotice("");

    try {
      const result = await onWithdraw?.(payload);
      setNotice(result?.message || "Withdrawal request submitted.");
      applyWalletSnapshot(result?.wallet);
      await Promise.all([
        refreshHistory({ page: 1, append: false }),
        onLoadWithdrawals?.({ page: 1, limit: 10 }),
      ]);
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  const convertAssets = useMemo(() => {
    const fromConfig = Array.isArray(withdrawConfig?.supportedAssets)
      ? withdrawConfig.supportedAssets
      : Array.isArray(withdrawConfig?.assets)
        ? withdrawConfig.assets.map((item) => item.assetSymbol)
        : [];

    const fromDetails = Object.keys(walletDetailMap)
      .map((symbol) => String(symbol || "").split("_").slice(1).join("_"))
      .filter(Boolean);

    const merged = new Set(["USDT", ...fromConfig, ...fromDetails]);
    return [...merged].sort((a, b) => a.localeCompare(b));
  }, [walletDetailMap, withdrawConfig?.assets, withdrawConfig?.supportedAssets]);

  const assetsInsights = useMemo(() => {
    const wallets = Array.isArray(summary.wallets) ? summary.wallets : [];
    const activeWallets = wallets.filter((wallet) => Number(wallet?.availableUsd || 0) > 0).length;
    const topWallet = [...wallets].sort((a, b) => Number(b?.availableUsd || 0) - Number(a?.availableUsd || 0))[0] || null;

    return {
      walletCount: wallets.length,
      activeWallets,
      topWalletLabel: topWallet ? String(topWallet.walletSymbol || "--") : "--",
      topWalletUsd: topWallet ? toNumber(topWallet.availableUsd, 0) : 0,
      historyTotal: toNumber(historyPagination?.total, 0),
    };
  }, [historyPagination?.total, summary.wallets]);

  return (
    <main className="assetspage-root">
      <div className="assetspage-bg-orb assetspage-bg-left" />
      <div className="assetspage-bg-orb assetspage-bg-right" />

      <section className="assetspage-shell">
        <header className="assetspage-header">
          <button type="button" className="assetspage-icon-btn" onClick={onBack} aria-label="Back to dashboard">
            <i className="fas fa-arrow-left" />
          </button>

          <div className="assetspage-header-copy">
            <p>{user?.name || "Trader"}</p>
            <h1>Assets</h1>
          </div>

          <button type="button" className="assetspage-icon-btn" onClick={refreshOverview} disabled={loading} aria-label="Refresh assets">
            <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-rotate"}`} />
          </button>
        </header>

        {error ? <p className="assetspage-alert-error">{error}</p> : null}
        {notice ? <p className="assetspage-alert-notice">{notice}</p> : null}

        <div className="assetspage-content-stack">
          <section className="assetspage-overview-strip">
            <article className="assetspage-overview-main">
              <p>Portfolio Overview</p>
              <h2>${toNumber(summary.totalAssets, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h2>
              <span>Total assets across your tracked wallets</span>
            </article>

            <div className="assetspage-overview-grid">
              <article>
                <span>Total Wallets</span>
                <strong>{assetsInsights.walletCount}</strong>
              </article>
              <article>
                <span>Active Wallets</span>
                <strong>{assetsInsights.activeWallets}</strong>
              </article>
              <article>
                <span>Top Wallet</span>
                <strong>
                  {assetsInsights.topWalletLabel} • ${assetsInsights.topWalletUsd.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </strong>
              </article>
              <article>
                <span>History Rows</span>
                <strong>{assetsInsights.historyTotal}</strong>
              </article>
            </div>
          </section>

          <WalletDistributionCard totalAssets={summary.totalAssets} chartData={summary.chartData} loading={loading} />

          <AssetsQuickActions disabled={loading} onAction={handleQuickAction} />

          <section className="assetspage-card assetspage-wallets-card">
            <div className="assetspage-card-head">
              <h2>Wallets</h2>
            </div>

            <div className="assetspage-wallet-list">
              {(summary.wallets || []).map((wallet) => (
                <WalletRowCard
                  key={wallet.walletSymbol}
                  wallet={wallet}
                  restriction={withdrawConfig?.walletRestrictions?.[wallet.walletSymbol]}
                  expanded={Boolean(expandedWallets[wallet.walletSymbol])}
                  onToggle={() =>
                    setExpandedWallets((prev) => ({
                      ...prev,
                      [wallet.walletSymbol]: !prev[wallet.walletSymbol],
                    }))
                  }
                />
              ))}
            </div>
          </section>

          <AssetsHistorySection
            rows={historyRows}
            loading={historyLoading}
            error={historyError}
            typeFilter={historyType}
            walletFilter={historyWallet}
            onTypeFilterChange={(value) => {
              setHistoryType(value);
            }}
            onWalletFilterChange={(value) => {
              setHistoryWallet(value);
            }}
            onRefresh={() => refreshHistory({ page: 1, append: false })}
            pagination={historyPagination}
            onLoadMore={() => refreshHistory({ page: historyPagination.page + 1, append: true })}
          />
        </div>
      </section>

      <WithdrawModal
        open={withdrawOpen}
        config={withdrawConfig}
        getAvailableForAsset={getAvailableForAsset}
        onSubmit={handleSubmitWithdraw}
        onClose={() => setWithdrawOpen(false)}
        submitting={withdrawSubmitting}
      />

      <TransferModal
        open={transferOpen}
        getWalletAvailable={getWalletAvailable}
        allowMainBinaryTransfer={Boolean(withdrawConfig?.allowMainBinaryTransfer)}
        onSubmit={handleSubmitTransfer}
        onClose={() => setTransferOpen(false)}
        submitting={transferSubmitting}
      />

      <ConvertModal
        open={convertOpen}
        assets={convertAssets}
        onQuote={handleConvertQuote}
        onSubmit={handleSubmitConvert}
        onClose={() => setConvertOpen(false)}
        submitting={convertSubmitting}
      />

      <nav className="assetspage-floating-nav" aria-label="Primary">
        {BOTTOM_NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === "assets" ? "active" : ""}
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
