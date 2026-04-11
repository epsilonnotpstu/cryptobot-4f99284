import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BinaryHeader from "./BinaryHeader";
import BinaryChartCard from "./BinaryChartCard";
import BinaryDirectionToggle from "./BinaryDirectionToggle";
import BinaryPeriodSelector from "./BinaryPeriodSelector";
import BinaryAmountCard from "./BinaryAmountCard";
import BinaryActiveTradeModal from "./BinaryActiveTradeModal";
import BinaryResultModal from "./BinaryResultModal";
import BinaryRecordsSection from "./BinaryRecordsSection";
import { calculateProjection, formatMoney, normalizeDirection, remainingSeconds, toNumber } from "./binary-utils";
import "./binary.css";

const BOTTOM_NAV_ITEMS = [
  { id: "home", label: "Home", icon: "fa-house" },
  { id: "transaction", label: "Transaction", icon: "fa-arrow-right-arrow-left" },
  { id: "binary", label: "Binary Options", icon: "fa-chart-simple" },
  { id: "assets", label: "Assets", icon: "fa-wallet" },
];

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
  const [config, setConfig] = useState(null);

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

    const nextConfig = configPayload?.data || configPayload || null;
    setPairs(nextPairs);
    setConfig(nextConfig);

    const preferredPairId =
      Number(selectedPairId) ||
      Number(nextConfig?.defaultPair?.pairId) ||
      Number(nextPairs[0]?.pairId || 0);

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
  }, [onLoadConfig, onLoadPairs, selectedPairId, selectedPeriod]);

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
      if (remainingSeconds(topTrade.expiresAt) <= 0) {
        await settleTrade(topTrade.tradeId, { silentNotice: true });
      }
      return;
    }

    if (existingTrade && remainingSeconds(existingTrade.expiresAt) <= 0) {
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

  return (
    <main className="binary-page">
      <div className="binary-background-orb binary-background-orb-left" />
      <div className="binary-background-orb binary-background-orb-right" />
      <div className="binary-shell">
        <BinaryHeader
          selectedPair={selectedPair}
          pairs={pairs}
          selectedPairId={selectedPairId}
          onPairChange={setSelectedPairId}
          onBack={onBack}
          onRefresh={refreshPage}
          onOpenHistory={() => recordsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          loading={pageLoading}
        />

        <div className="binary-user-strip">
          <div>
            <strong>{user?.name || "Trader"}</strong>
            <p>{user?.email || ""}</p>
          </div>
          <span>{formatMoney(autoTransferFromSpot ? tradableBalance : binaryWallet, walletAsset)}</span>
        </div>

        <section className="binary-summary-grid">
          {summaryCards.map((card) => (
            <article key={card.label}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              {card.hint ? <small>{card.hint}</small> : null}
            </article>
          ))}
        </section>

        {pageError ? <p className="binary-error">{pageError}</p> : null}
        {notice ? <p className="binary-notice">{notice}</p> : null}

        <BinaryChartCard pair={selectedPair} ticks={ticks} engineMode={config?.settings?.engineMode} />

        <BinaryDirectionToggle value={direction} onChange={setDirection} />

        <BinaryPeriodSelector periods={periods} selectedPeriod={selectedPeriod} onSelect={setSelectedPeriod} />

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
