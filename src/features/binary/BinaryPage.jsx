import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BinaryHeader from "./BinaryHeader";
import BinaryChartCard from "./BinaryChartCard";
import BinaryDirectionToggle from "./BinaryDirectionToggle";
import BinaryPeriodSelector from "./BinaryPeriodSelector";
import BinaryAmountCard from "./BinaryAmountCard";
import BinaryActiveTradeModal from "./BinaryActiveTradeModal";
import BinaryResultModal from "./BinaryResultModal";
import BinaryRecordsSection from "./BinaryRecordsSection";
import { calculateProjection, formatMoney, formatPrice, getTokenIconUrl, getTradeRemainingSeconds, normalizeDirection, toNumber } from "./binary-utils";
import "./binary.css";

const BOTTOM_NAV_ITEMS = [
  { id: "home", label: "Home", icon: "fa-house" },
  { id: "transaction", label: "Transaction", icon: "fa-arrow-right-arrow-left" },
  { id: "binary", label: "Binary Options", icon: "fa-chart-simple" },
  { id: "assets", label: "Assets", icon: "fa-wallet" },
];

const BINANCE_MULTI_PRICE_URL = "https://api.binance.com/api/v3/ticker/price";

function normalizeBinanceSymbol(value = "") {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function clampAmount(value, maxAmount) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  let next = Math.max(0, numeric);
  if (maxAmount !== null && Number.isFinite(maxAmount)) {
    next = Math.min(next, maxAmount);
  }
  return Number(next.toFixed(8));
}

export default function BinaryPage({
  user,
  onBack,
  onLoadSummary,
  onLoadPairs,
  onLoadConfig,
  onLoadPairChart,
  onOpenTrade,
  onLoadActiveTrades,
  onLoadHistory,
  onSettleTrade,
  onNavigateTab,
}) {
  const recordsRef = useRef(null);
  const settleInProgressRef = useRef(false);
  const amountTouchedRef = useRef(false);
  const activeTradeRef = useRef(null);

  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");

  const [summary, setSummary] = useState(null);
  const [pairs, setPairs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [config, setConfig] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [marketMode, setMarketMode] = useState("browse");

  const [selectedPairId, setSelectedPairId] = useState(0);
  const [selectedPair, setSelectedPair] = useState(null);
  const [ticks, setTicks] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(30);

  const [direction, setDirection] = useState("long");
  const [stakeInput, setStakeInput] = useState("");
  const [stakePercent, setStakePercent] = useState(0);

  const [activeTrade, setActiveTrade] = useState(null);
  const [activeModalOpen, setActiveModalOpen] = useState(false);

  const [historyFilter, setHistoryFilter] = useState("all");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyTrades, setHistoryTrades] = useState([]);

  const [marketLivePrices, setMarketLivePrices] = useState({});
  const [marketLiveChanges, setMarketLiveChanges] = useState({});

  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [resultTrade, setResultTrade] = useState(null);

  useEffect(() => {
    activeTradeRef.current = activeTrade;
  }, [activeTrade]);

  const walletAsset = summary?.walletAssetSymbol || config?.settings?.binaryWalletAssetSymbol || "USDT";
  const binaryWallet = toNumber(summary?.availableBalance ?? summary?.binaryWallet, 0);
  const spotWallet = toNumber(summary?.spotWallet, 0);
  const autoTransferFromSpot = Boolean(config?.settings?.autoTransferFromSpot);
  const minStake = Math.max(0.01, toNumber(config?.minStakeUsd ?? config?.settings?.globalMinStakeUsd, 10));
  const configuredMaxStake = config?.maxStakeUsd ?? config?.settings?.globalMaxStakeUsd ?? null;
  const tradableBalance = useMemo(() => {
    if (!autoTransferFromSpot) {
      return binaryWallet;
    }
    return toNumber(binaryWallet, 0) + toNumber(spotWallet, 0);
  }, [autoTransferFromSpot, binaryWallet, spotWallet]);
  const effectiveMaxStake = useMemo(() => {
    if (configuredMaxStake === null || configuredMaxStake === undefined) {
      return tradableBalance;
    }
    return Math.max(0, Math.min(tradableBalance, toNumber(configuredMaxStake, tradableBalance)));
  }, [configuredMaxStake, tradableBalance]);

  const activeRule = useMemo(() => {
    const fromSelected = periods.find((item) => Number(item.periodSeconds) === Number(selectedPeriod));
    return fromSelected || periods[0] || null;
  }, [periods, selectedPeriod]);

  const currentStakeAmount = useMemo(() => clampAmount(stakeInput, effectiveMaxStake), [stakeInput, effectiveMaxStake]);

  const projection = useMemo(() => {
    const payoutPercent = Number(activeRule?.payoutPercent || 0);
    return calculateProjection(currentStakeAmount, payoutPercent);
  }, [activeRule, currentStakeAmount]);

  const syncChart = useCallback(
    async (pairId) => {
      if (!pairId || !onLoadPairChart) {
        return;
      }

      const payload = await onLoadPairChart({ pairId });
      const chart = payload?.pair ? payload : payload?.data || payload;
      setSelectedPair(chart?.pair || null);
      setTicks(Array.isArray(chart?.ticks) ? chart.ticks : []);

      const resolvedPeriods = Array.isArray(chart?.activePeriodRules) ? chart.activePeriodRules : [];
      if (resolvedPeriods.length) {
        setPeriods(resolvedPeriods);
        const hasSelected = resolvedPeriods.some((item) => Number(item.periodSeconds) === Number(selectedPeriod));
        if (!hasSelected) {
          setSelectedPeriod(Number(resolvedPeriods[0].periodSeconds || 30));
        }
      }
    },
    [onLoadPairChart, selectedPeriod],
  );

  const syncSummary = useCallback(async () => {
    if (!onLoadSummary) {
      return;
    }
    const payload = await onLoadSummary();
    setSummary(payload?.summary || payload?.data || payload || null);
  }, [onLoadSummary]);

  const syncPairsAndConfig = useCallback(async () => {
    const [pairsPayload, configPayload] = await Promise.all([
      onLoadPairs?.(),
      onLoadConfig?.(),
    ]);

    const nextPairs = Array.isArray(pairsPayload?.pairs)
      ? pairsPayload.pairs
      : Array.isArray(pairsPayload?.data)
        ? pairsPayload.data
        : [];
    const nextCategories = Array.isArray(pairsPayload?.categories)
      ? pairsPayload.categories
      : Array.isArray(configPayload?.data?.categories)
        ? configPayload.data.categories
        : [];

    const nextConfig = configPayload?.data || configPayload || null;
    setPairs(nextPairs);
    setCategories(nextCategories);
    setConfig(nextConfig);

    const preferredPairId =
      Number(selectedPairId) ||
      Number(nextConfig?.defaultPair?.pairId) ||
      Number(nextPairs[0]?.pairId || 0);

    const preferredCategoryIdFromPair =
      Number(nextPairs.find((item) => Number(item.pairId) === Number(preferredPairId))?.categoryId || 0) || null;
    const preferredCategoryId =
      Number(selectedCategoryId || 0) ||
      preferredCategoryIdFromPair ||
      Number(nextCategories[0]?.categoryId || 0) ||
      null;

    if (preferredCategoryId) {
      setSelectedCategoryId(preferredCategoryId);
    }

    if (preferredPairId > 0) {
      setSelectedPairId(preferredPairId);
    }

    const configPeriods = Array.isArray(nextConfig?.availablePeriods) ? nextConfig.availablePeriods : [];
    if (configPeriods.length) {
      setPeriods(configPeriods);
      const preferredPeriod = Number(configPeriods[0].periodSeconds || 30);
      if (!selectedPeriod || !configPeriods.some((item) => Number(item.periodSeconds) === Number(selectedPeriod))) {
        setSelectedPeriod(preferredPeriod);
      }
    }

    return preferredPairId;
  }, [onLoadConfig, onLoadPairs, selectedCategoryId, selectedPairId, selectedPeriod]);

  const syncHistory = useCallback(
    async (resultFilter = historyFilter) => {
      if (!onLoadHistory) {
        return;
      }
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const payload = await onLoadHistory({ result: resultFilter, pairId: selectedPairId || 0, page: 1, limit: 40 });
        const list = Array.isArray(payload?.trades)
          ? payload.trades
          : Array.isArray(payload?.data?.trades)
            ? payload.data.trades
            : [];
        setHistoryTrades(list);
      } catch (error) {
        setHistoryError(error.message || "Could not load trade records.");
      } finally {
        setHistoryLoading(false);
      }
    },
    [historyFilter, onLoadHistory, selectedPairId],
  );

  const settleTrade = useCallback(
    async (tradeId, options = {}) => {
      if (!tradeId || !onSettleTrade || settleInProgressRef.current) {
        return;
      }

      settleInProgressRef.current = true;
      try {
        const payload = await onSettleTrade({ tradeId });
        const data = payload?.data || payload || {};
        const trade = data.trade || payload?.trade || null;
        const nextSummary = data.summary || payload?.summary || null;

        if (nextSummary) {
          setSummary(nextSummary);
        } else {
          await syncSummary();
        }

        setActiveTrade(null);
        setActiveModalOpen(false);

        if (trade) {
          setResultTrade(trade);
          setResultModalOpen(true);
        }

        await syncHistory(historyFilter);

        if (!options.silentNotice && trade) {
          setNotice(`Trade ${String(trade.resultStatus || "settled").toUpperCase()} successfully.`);
        }
      } catch (error) {
        if (!options.silentNotice) {
          setPageError(error.message || "Could not settle trade.");
        }
      } finally {
        settleInProgressRef.current = false;
      }
    },
    [historyFilter, onSettleTrade, syncHistory, syncSummary],
  );

  const syncActiveTrades = useCallback(async () => {
    if (!onLoadActiveTrades) {
      return;
    }

    const payload = await onLoadActiveTrades();
    const trades = Array.isArray(payload?.trades)
      ? payload.trades
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

    const topTrade = trades[0] || null;
    const existingTrade = activeTradeRef.current;

    if (topTrade) {
      setActiveTrade(topTrade);
      if (getTradeRemainingSeconds(topTrade) <= 0) {
        await settleTrade(topTrade.tradeId, { silentNotice: true });
      }
      return;
    }

    if (existingTrade && Number(existingTrade.tradeId || 0) > 0) {
      await settleTrade(existingTrade.tradeId, { silentNotice: true });
      return;
    }

    setActiveTrade(null);
  }, [onLoadActiveTrades, settleTrade]);

  const refreshPage = useCallback(async () => {
    setPageLoading(true);
    setPageError("");
    setNotice("");

    try {
      const [, preferredPairId] = await Promise.all([syncSummary(), syncPairsAndConfig()]);
      if (preferredPairId > 0) {
        await syncChart(preferredPairId);
      }
      await Promise.all([syncActiveTrades(), syncHistory(historyFilter)]);
    } catch (error) {
      setPageError(error.message || "Could not load binary page.");
    } finally {
      setPageLoading(false);
    }
  }, [historyFilter, syncActiveTrades, syncChart, syncHistory, syncPairsAndConfig, syncSummary]);

  useEffect(() => {
    void refreshPage();
  }, []);

  useEffect(() => {
    if (!selectedPairId) {
      return;
    }

    let isActive = true;
    const run = async () => {
      try {
        await syncChart(selectedPairId);
      } catch (error) {
        if (isActive) {
          setPageError(error.message || "Could not load chart data.");
        }
      }
    };

    run();
    const timer = window.setInterval(run, 1300);

    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [selectedPairId, syncChart]);

  useEffect(() => {
    if (!selectedPair?.categoryId) {
      return;
    }
    setSelectedCategoryId((prev) => (Number(prev || 0) === Number(selectedPair.categoryId) ? prev : Number(selectedPair.categoryId)));
  }, [selectedPair?.categoryId]);

  useEffect(() => {
    let isActive = true;
    const run = async () => {
      try {
        await syncActiveTrades();
      } catch {
        if (!isActive) {
          return;
        }
      }
    };

    run();
    const timer = window.setInterval(run, 1000);

    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [syncActiveTrades]);

  useEffect(() => {
    if (!onLoadPairs) {
      return;
    }

    let isActive = true;
    const run = async () => {
      try {
        const payload = await onLoadPairs();
        if (!isActive) {
          return;
        }
        const nextPairs = Array.isArray(payload?.pairs)
          ? payload.pairs
          : Array.isArray(payload?.data)
            ? payload.data
            : [];
        const nextCategories = Array.isArray(payload?.categories) ? payload.categories : [];
        if (nextPairs.length) {
          setPairs(nextPairs);
        }
        if (nextCategories.length) {
          setCategories(nextCategories);
        }
      } catch {
        // Ignore background refresh errors.
      }
    };

    const timer = window.setInterval(run, 2500);
    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [onLoadPairs]);

  useEffect(() => {
    syncHistory(historyFilter);
  }, [historyFilter, syncHistory]);

  useEffect(() => {
    if (!tradableBalance || tradableBalance <= 0) {
      setStakeInput("");
      setStakePercent(0);
      amountTouchedRef.current = false;
      return;
    }

    if (stakeInput) {
      const numeric = toNumber(stakeInput, 0);
      const computedPercent = Math.max(0, Math.min(100, (numeric / Math.max(tradableBalance, 1e-8)) * 100));
      setStakePercent(Number(computedPercent.toFixed(2)));
      return;
    }

    if (amountTouchedRef.current) {
      return;
    }

    const defaultAmount = Math.min(tradableBalance, Math.max(minStake, minStake));
    if (defaultAmount > 0 && tradableBalance >= minStake) {
      setStakeInput(defaultAmount.toFixed(2));
      setStakePercent(Number(((defaultAmount / tradableBalance) * 100).toFixed(2)));
    }
  }, [minStake, stakeInput, tradableBalance]);

  const handlePercentChange = (percentValue) => {
    amountTouchedRef.current = true;
    const normalizedPercent = Math.max(0, Math.min(100, toNumber(percentValue, 0)));
    setStakePercent(normalizedPercent);

    const nextRawAmount = (tradableBalance * normalizedPercent) / 100;
    const nextAmount = clampAmount(nextRawAmount, effectiveMaxStake);
    setStakeInput(nextAmount > 0 ? nextAmount.toFixed(2) : "");
  };

  const handleQuickPercent = (quickPercent) => {
    handlePercentChange(quickPercent);
  };

  const handleAmountChange = (value) => {
    amountTouchedRef.current = true;
    setStakeInput(value);
    const numeric = value === "" ? 0 : toNumber(value, 0);
    const nextPercent = tradableBalance > 0 ? Math.max(0, Math.min(100, (numeric / tradableBalance) * 100)) : 0;
    setStakePercent(Number(nextPercent.toFixed(2)));
  };

  const handleAmountBlur = () => {
    if (!stakeInput) {
      return;
    }
    const numeric = toNumber(stakeInput, 0);
    const clamped = clampAmount(numeric, effectiveMaxStake);
    if (clamped > 0) {
      setStakeInput(clamped.toFixed(2));
    }
  };

  const navigateTab = (tabId) => {
    if (tabId === "binary") {
      return;
    }
    if (onNavigateTab) {
      onNavigateTab(tabId);
      return;
    }
    if (tabId === "home" && onBack) {
      onBack();
      return;
    }
    setNotice(`${tabId.charAt(0).toUpperCase()}${tabId.slice(1)} section will open from dashboard.`);
  };

  const openTrade = async () => {
    setPageError("");
    setNotice("");

    if (!onOpenTrade) {
      setPageError("Trade open API is not connected.");
      return;
    }
    if (!selectedPairId) {
      setPageError("Please select a trading pair.");
      return;
    }
    if (!activeRule?.periodSeconds) {
      setPageError("Please select a valid period.");
      return;
    }
    if (!currentStakeAmount || currentStakeAmount <= 0) {
      setPageError("Please enter a stake amount.");
      return;
    }
    if (currentStakeAmount < minStake) {
      setPageError(`Minimum stake is ${minStake}.`);
      return;
    }
    if (configuredMaxStake !== null && configuredMaxStake !== undefined && currentStakeAmount > Number(configuredMaxStake)) {
      setPageError(`Maximum stake is ${configuredMaxStake}.`);
      return;
    }
    if (currentStakeAmount > tradableBalance) {
      setPageError(`Insufficient ${walletAsset} balance.`);
      return;
    }

    try {
      const payload = await onOpenTrade({
        pairId: selectedPairId,
        direction: normalizeDirection(direction),
        periodSeconds: Number(activeRule.periodSeconds),
        stakeAmountUsd: currentStakeAmount,
      });

      const openedTrade = payload?.trade || payload?.data?.trade;
      const nextSummary = payload?.summary || payload?.data?.summary;

      if (nextSummary) {
        setSummary(nextSummary);
      } else {
        await syncSummary();
      }

      if (openedTrade) {
        setActiveTrade(openedTrade);
        setActiveModalOpen(true);
      }

      await syncHistory(historyFilter);
      setNotice(payload?.message || "Trade opened successfully.");
    } catch (error) {
      setPageError(error.message || "Could not open trade.");
    }
  };

  const summaryCards = useMemo(() => {
    const totalTrades = toNumber(summary?.totalTrades, 0);
    const winCount = toNumber(summary?.winCount, 0);
    const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;

    return [
      { label: "Binary Wallet", value: formatMoney(binaryWallet, walletAsset) },
      ...(autoTransferFromSpot ? [{ label: "Tradable Balance", value: formatMoney(tradableBalance, walletAsset), hint: `Spot ${formatMoney(spotWallet, "SPOT_USDT")}` }] : []),
      { label: "Locked Stake", value: formatMoney(summary?.lockedBalance || 0, walletAsset) },
      { label: "Active Trades", value: String(toNumber(summary?.activeTradeCount, 0)) },
      { label: "Net PnL", value: formatMoney(summary?.netPnl || 0, walletAsset), hint: `Win rate ${winRate.toFixed(1)}%` },
    ];
  }, [autoTransferFromSpot, binaryWallet, spotWallet, summary, tradableBalance, walletAsset]);

  const binaryOverview = useMemo(() => {
    const selectedPeriodRule = periods.find((item) => Number(item.periodSeconds) === Number(selectedPeriod)) || null;
    return {
      pairName: selectedPair?.displayName || selectedPair?.symbol || "--",
      periodLabel: selectedPeriodRule ? `${toNumber(selectedPeriodRule.periodSeconds, selectedPeriod)}s` : `${selectedPeriod}s`,
      payoutLabel: `${toNumber(selectedPeriodRule?.payoutPercent, 0)}%`,
      activeTradeCount: toNumber(summary?.activeTradeCount, 0),
    };
  }, [periods, selectedPair, selectedPeriod, summary?.activeTradeCount]);

  const mobileOverviewCards = useMemo(
    () => [
      { label: "Selected Pair", value: binaryOverview.pairName, hint: "Live chart synced" },
      { label: "Period / Payout", value: `${binaryOverview.periodLabel} • ${binaryOverview.payoutLabel}`, hint: "Current rule view" },
      { label: "Open Positions", value: String(binaryOverview.activeTradeCount), hint: "Active trades right now" },
      ...summaryCards,
    ],
    [binaryOverview, summaryCards],
  );

  const selectedCategory = useMemo(
    () => categories.find((item) => Number(item.categoryId) === Number(selectedCategoryId)) || null,
    [categories, selectedCategoryId],
  );

  const marketSymbols = useMemo(() => {
    if (!pairs.length) {
      return [];
    }
    const symbols = pairs
      .map((pair) => normalizeBinanceSymbol(pair?.sourceSymbol || pair?.pairCode || ""))
      .filter((symbol) => symbol.length >= 6 && /USDT$/.test(symbol));
    return [...new Set(symbols)];
  }, [pairs]);

  const categoryPairs = useMemo(() => {
    if (!pairs.length) {
      return [];
    }
    if (!selectedCategoryId) {
      return pairs;
    }
    return pairs.filter((item) => Number(item.categoryId) === Number(selectedCategoryId));
  }, [pairs, selectedCategoryId]);

  useEffect(() => {
    if (!marketSymbols.length || typeof fetch !== "function") {
      return undefined;
    }

    let isActive = true;

    const run = async () => {
      try {
        const query = encodeURIComponent(JSON.stringify(marketSymbols));
        const response = await fetch(`${BINANCE_MULTI_PRICE_URL}?symbols=${query}`);
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        if (!Array.isArray(payload) || !isActive) {
          return;
        }

        setMarketLivePrices((prevPrices) => {
          const nextPrices = { ...prevPrices };
          const nextChanges = {};

          for (const row of payload) {
            const symbol = normalizeBinanceSymbol(row?.symbol || "");
            const price = Number(row?.price || 0);
            if (!symbol || !Number.isFinite(price) || price <= 0) {
              continue;
            }
            const previousPrice = Number(prevPrices[symbol] || 0);
            if (previousPrice > 0) {
              nextChanges[symbol] = ((price - previousPrice) / previousPrice) * 100;
            }
            nextPrices[symbol] = price;
          }

          setMarketLiveChanges(nextChanges);
          return nextPrices;
        });
      } catch {
        // Keep backend price as fallback if Binance request fails.
      }
    };

    run();
    const timer = window.setInterval(run, 3500);
    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [marketSymbols]);

  const openPairFromMarket = (pairId) => {
    setSelectedPairId(Number(pairId || 0));
    setMarketMode("trade");
    setPageError("");
    setNotice("");
  };

  const handleCategorySelect = (categoryId) => {
    setSelectedCategoryId(Number(categoryId || 0));
    setMarketMode("browse");
  };

  const handleHeaderBack = () => {
    if (marketMode === "trade") {
      setMarketMode("browse");
      return;
    }
    if (onBack) {
      onBack();
    }
  };

  return (
    <main className="binary-page">
      <div className="binary-background-orb binary-background-orb-left" />
      <div className="binary-background-orb binary-background-orb-right" />
      <div className="binary-shell">
        <BinaryHeader
          categories={categories}
          selectedCategoryId={selectedCategoryId}
          onCategorySelect={handleCategorySelect}
          mode={marketMode}
          selectedPair={selectedPair}
          selectedCategory={selectedCategory}
          onBack={handleHeaderBack}
          onBrowseMarkets={() => setMarketMode("browse")}
          onRefresh={refreshPage}
          onOpenHistory={() => recordsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          loading={pageLoading}
        />

        <div className="binary-user-strip">
          <div>
            <strong>{user?.name || "Trader"}</strong>
            {/* <p>{user?.email || ""}</p> */}
          </div>
          <span>{formatMoney(autoTransferFromSpot ? tradableBalance : binaryWallet, walletAsset)}</span>
        </div>

        {pageError ? <p className="binary-error">{pageError}</p> : null}
        {notice ? <p className="binary-notice">{notice}</p> : null}

        {marketMode === "browse" ? (
          <section className="binary-market-list-card">
            <header>
              <div>
                <h3>{selectedCategory?.categoryName || "Markets"}</h3>
                <p>Choose an item to open binary trading.</p>
              </div>
              <span>{categoryPairs.length} assets</span>
            </header>

            <div className="binary-market-list">
              {categoryPairs.map((pair) => {
                const sourceSymbol = normalizeBinanceSymbol(pair?.sourceSymbol || pair?.pairCode || "");
                const livePrice = toNumber(marketLivePrices[sourceSymbol], 0);
                const currentPrice = livePrice > 0 ? livePrice : toNumber(pair.currentPrice, 0);
                const previousPrice = toNumber(pair.previousPrice, currentPrice);
                const backendDeltaPercent = previousPrice > 0 ? ((currentPrice - previousPrice) / previousPrice) * 100 : 0;
                const liveDeltaPercent = Number(marketLiveChanges[sourceSymbol]);
                const deltaPercent = Number.isFinite(liveDeltaPercent) ? liveDeltaPercent : backendDeltaPercent;
                const isPositive = deltaPercent >= 0;
                const iconUrl = pair.iconImageUrl || getTokenIconUrl(pair.baseAsset);

                return (
                  <button key={pair.pairId} type="button" className="binary-market-item" onClick={() => openPairFromMarket(pair.pairId)}>
                    <div className="binary-market-item-left">
                      <span className="binary-market-item-icon">{iconUrl ? <img src={iconUrl} alt="" loading="lazy" /> : pair.baseAsset?.slice(0, 2) || "AS"}</span>
                      <span>
                        <strong>{pair.displayName}</strong>
                        <small>{pair.marketSymbol || pair.baseAsset}</small>
                      </span>
                    </div>
                    <div className="binary-market-item-right">
                      <strong>{formatPrice(pair.currentPrice, pair.pricePrecision)}</strong>
                      <em className={isPositive ? "is-up" : "is-down"}>{isPositive ? "+" : ""}{deltaPercent.toFixed(2)}%</em>
                    </div>
                  </button>
                );
              })}
            </div>

            {!categoryPairs.length ? (
              <p className="binary-empty">No market item found in this category.</p>
            ) : null}
          </section>
        ) : (
          <>
            <div className="binary-summary-desktop">
              <section className="binary-summary-grid">
                <article className="binary-summary-highlight">
                  <span>Trade Desk Overview</span>
                  <strong>{formatMoney(autoTransferFromSpot ? tradableBalance : binaryWallet, walletAsset)}</strong>
                  <small>Ready balance for new trade positions</small>
                </article>
                <article>
                  <span>Selected Pair</span>
                  <strong>{binaryOverview.pairName}</strong>
                  <small>Live chart synced</small>
                </article>
                <article>
                  <span>Period / Payout</span>
                  <strong>
                    {binaryOverview.periodLabel} • {binaryOverview.payoutLabel}
                  </strong>
                  <small>Current rule view</small>
                </article>
                <article>
                  <span>Open Positions</span>
                  <strong>{binaryOverview.activeTradeCount}</strong>
                  <small>Active trades right now</small>
                </article>

                {summaryCards.map((card) => (
                  <article key={card.label}>
                    <span>{card.label}</span>
                    <strong>{card.value}</strong>
                    {card.hint ? <small>{card.hint}</small> : null}
                  </article>
                ))}
              </section>
            </div>

            <details className="binary-summary-dropdown" open>
              <summary>
                <span>Trade Desk Overview</span>
                <strong>{formatMoney(autoTransferFromSpot ? tradableBalance : binaryWallet, walletAsset)}</strong>
              </summary>
              <div className="binary-summary-dropdown-grid">
                {mobileOverviewCards.map((card) => (
                  <article key={`mobile-${card.label}`}>
                    <span>{card.label}</span>
                    <strong>{card.value}</strong>
                    {card.hint ? <small>{card.hint}</small> : null}
                  </article>
                ))}
              </div>
            </details>

            <BinaryChartCard pair={selectedPair} ticks={ticks} engineMode={config?.settings?.engineMode} />

            <BinaryDirectionToggle value={direction} onChange={setDirection} />

            <BinaryPeriodSelector
              periods={periods}
              selectedPeriod={selectedPeriod}
              onSelect={setSelectedPeriod}
              directionMode={direction}
            />

            <BinaryAmountCard
              currency={walletAsset}
              minStake={minStake}
              maxStake={effectiveMaxStake}
              binaryWallet={binaryWallet}
              spotWallet={spotWallet}
              tradableBalance={tradableBalance}
              autoTransferFromSpot={autoTransferFromSpot}
              amount={stakeInput}
              percent={stakePercent}
              expectedProfit={projection.expectedProfitUsd}
              expectedTotal={projection.expectedTotalPayoutUsd}
              onAmountChange={handleAmountChange}
              onAmountBlur={handleAmountBlur}
              onPercentChange={handlePercentChange}
              onQuickPercent={handleQuickPercent}
              directionMode={direction}
            />

            <button
              type="button"
              className={`binary-trade-btn ${direction === "short" ? "is-short" : "is-long"}`}
              onClick={openTrade}
              disabled={pageLoading || !selectedPairId}
            >
              Open {normalizeDirection(direction) === "short" ? "Short" : "Long"} Trade
            </button>

            <div ref={recordsRef}>
              <BinaryRecordsSection
                trades={historyTrades}
                loading={historyLoading}
                error={historyError}
                filter={historyFilter}
                onFilterChange={setHistoryFilter}
                onRefresh={() => syncHistory(historyFilter)}
              />
            </div>
          </>
        )}
      </div>

      <BinaryActiveTradeModal
        open={activeModalOpen && Boolean(activeTrade)}
        trade={activeTrade}
        onClose={() => setActiveModalOpen(false)}
        onReopenSettle={() => activeTrade?.tradeId && settleTrade(activeTrade.tradeId)}
      />

      <BinaryResultModal
        open={resultModalOpen}
        trade={resultTrade}
        summary={summary}
        onClose={() => setResultModalOpen(false)}
        onTradeAgain={() => {
          setResultModalOpen(false);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />

      <nav className="binary-floating-nav" aria-label="Primary">
        {BOTTOM_NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === "binary" ? "active" : ""}
            onClick={() => navigateTab(item.id)}
          >
            <i className={`fas ${item.icon}`} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
