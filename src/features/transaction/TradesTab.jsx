import { useEffect, useMemo, useState } from "react";
import SpotOrderForm from "./SpotOrderForm";
import SpotOpenOrders from "./SpotOpenOrders";
import SpotOrderHistory from "./SpotOrderHistory";
import SpotRecentTrades from "./SpotRecentTrades";
import SpotMarketSummary from "./SpotMarketSummary";
import { calcOrderPreview, getAvailableBalance, toNumber } from "./transaction-utils";

export default function TradesTab({
  pairs,
  walletMap,
  onLoadMarketSummary,
  onLoadRecentTrades,
  onPlaceOrder,
  onLoadOpenOrders,
  onLoadOrderHistory,
  onCancelOrder,
  onWalletSync,
  onNotice,
  onError,
}) {
  const [selectedPairId, setSelectedPairId] = useState(0);
  const [side, setSide] = useState("buy");
  const [orderType, setOrderType] = useState("market");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [recentTrades, setRecentTrades] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);

  const [openOrders, setOpenOrders] = useState([]);
  const [openOrdersLoading, setOpenOrdersLoading] = useState(false);

  const [orderHistory, setOrderHistory] = useState([]);
  const [orderHistoryLoading, setOrderHistoryLoading] = useState(false);
  const [historyStatus, setHistoryStatus] = useState("all");

  const [orderSubmitting, setOrderSubmitting] = useState(false);

  const selectedPair = useMemo(
    () => (pairs || []).find((item) => Number(item.pairId) === Number(selectedPairId)) || null,
    [pairs, selectedPairId],
  );

  useEffect(() => {
    if (!(pairs || []).length) {
      setSelectedPairId(0);
      return;
    }

    if (!selectedPairId || !(pairs || []).some((item) => Number(item.pairId) === Number(selectedPairId))) {
      setSelectedPairId(Number(pairs[0].pairId));
    }
  }, [pairs, selectedPairId]);

  const loadSummary = async () => {
    if (!selectedPairId || !onLoadMarketSummary) {
      return;
    }

    setSummaryLoading(true);
    try {
      const payload = await onLoadMarketSummary({ pairId: selectedPairId });
      setSummary(payload?.summary || null);
    } catch (error) {
      onError?.(error.message || "Could not load market summary.");
    } finally {
      setSummaryLoading(false);
    }
  };

  const loadRecentTrades = async () => {
    if (!selectedPairId || !onLoadRecentTrades) {
      return;
    }

    setRecentLoading(true);
    try {
      const payload = await onLoadRecentTrades({ pairId: selectedPairId, limit: 50 });
      setRecentTrades(Array.isArray(payload?.trades) ? payload.trades : []);
    } catch (error) {
      onError?.(error.message || "Could not load recent trades.");
    } finally {
      setRecentLoading(false);
    }
  };

  const loadOpenOrders = async () => {
    if (!selectedPairId || !onLoadOpenOrders) {
      return;
    }

    setOpenOrdersLoading(true);
    try {
      const payload = await onLoadOpenOrders({ pairId: selectedPairId, page: 1, limit: 40 });
      setOpenOrders(Array.isArray(payload?.orders) ? payload.orders : []);
    } catch (error) {
      onError?.(error.message || "Could not load open orders.");
    } finally {
      setOpenOrdersLoading(false);
    }
  };

  const loadOrderHistory = async (nextStatus = historyStatus) => {
    if (!selectedPairId || !onLoadOrderHistory) {
      return;
    }

    setOrderHistoryLoading(true);
    try {
      const payload = await onLoadOrderHistory({ pairId: selectedPairId, status: nextStatus, page: 1, limit: 60 });
      setOrderHistory(Array.isArray(payload?.orders) ? payload.orders : []);
    } catch (error) {
      onError?.(error.message || "Could not load order history.");
    } finally {
      setOrderHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
    loadRecentTrades();
    loadOpenOrders();
    loadOrderHistory(historyStatus);
    setQuantity("");
    setPrice("");
  }, [selectedPairId]);

  useEffect(() => {
    loadOrderHistory(historyStatus);
  }, [historyStatus]);

  const fundingAsset = side === "buy" ? selectedPair?.quoteAsset || "USDT" : selectedPair?.baseAsset || "BASE";
  const availableBalance = getAvailableBalance(walletMap, fundingAsset);

  const preview = useMemo(
    () =>
      calcOrderPreview({
        side,
        orderType,
        quantity,
        price,
        marketPrice: summary?.currentPrice || selectedPair?.currentPrice || 0,
        makerFeePercent: selectedPair?.makerFeePercent || 0,
        takerFeePercent: selectedPair?.takerFeePercent || 0,
      }),
    [side, orderType, quantity, price, summary?.currentPrice, selectedPair?.currentPrice, selectedPair?.makerFeePercent, selectedPair?.takerFeePercent],
  );

  const handleQuickPercent = (percent) => {
    const pct = Math.max(0, Math.min(100, toNumber(percent, 0)));
    if (!selectedPair || availableBalance <= 0) {
      setQuantity("");
      return;
    }

    if (side === "buy") {
      const usedPrice = orderType === "market" ? toNumber(summary?.currentPrice || selectedPair.currentPrice, 0) : toNumber(price, 0);
      if (usedPrice <= 0) {
        setQuantity("");
        return;
      }

      const qty = (availableBalance * (pct / 100)) / usedPrice;
      setQuantity(Number(qty.toFixed(Math.max(2, Number(selectedPair.quantityPrecision || 6)))).toString());
      return;
    }

    const qty = availableBalance * (pct / 100);
    setQuantity(Number(qty.toFixed(Math.max(2, Number(selectedPair.quantityPrecision || 6)))).toString());
  };

  const handleSubmitOrder = async () => {
    if (!selectedPairId || !onPlaceOrder) {
      return;
    }

    if (!quantity || Number(quantity) <= 0) {
      onError?.("Quantity must be greater than zero.");
      return;
    }

    if (orderType === "limit" && (!price || Number(price) <= 0)) {
      onError?.("Limit price must be greater than zero.");
      return;
    }

    setOrderSubmitting(true);
    try {
      const payload = await onPlaceOrder({
        pairId: selectedPairId,
        side,
        orderType,
        quantity: Number(quantity),
        price: orderType === "limit" ? Number(price) : undefined,
        note: "",
      });
      onNotice?.(payload?.message || "Order placed successfully.");
      if (payload?.wallet) {
        onWalletSync?.(payload.wallet);
      }
      setQuantity("");
      if (orderType === "market") {
        setPrice("");
      }
      await Promise.all([loadSummary(), loadRecentTrades(), loadOpenOrders(), loadOrderHistory(historyStatus)]);
    } catch (error) {
      onError?.(error.message || "Could not place order.");
    } finally {
      setOrderSubmitting(false);
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (!orderId || !onCancelOrder) {
      return;
    }

    try {
      const payload = await onCancelOrder({ orderId, note: "User cancelled" });
      onNotice?.(payload?.message || "Order cancelled.");
      if (payload?.wallet) {
        onWalletSync?.(payload.wallet);
      }
      await Promise.all([loadOpenOrders(), loadOrderHistory(historyStatus)]);
    } catch (error) {
      onError?.(error.message || "Could not cancel order.");
    }
  };

  return (
    <div className="tx-stack">
      <section className="tx-card">
        <div className="tx-card-head tx-space-between">
          <h2>Spot Pairs</h2>
          <select value={selectedPairId || ""} onChange={(event) => setSelectedPairId(Number(event.target.value))}>
            {(pairs || []).map((pair) => (
              <option key={pair.pairId} value={pair.pairId}>
                {pair.displayName}
              </option>
            ))}
          </select>
        </div>
      </section>

      <SpotMarketSummary summary={summary || selectedPair} pairLabel={selectedPair?.displayName} onRefresh={loadSummary} loading={summaryLoading} />

      <SpotOrderForm
        pair={selectedPair}
        side={side}
        onSideChange={setSide}
        orderType={orderType}
        onOrderTypeChange={setOrderType}
        quantity={quantity}
        onQuantityChange={setQuantity}
        price={price}
        onPriceChange={setPrice}
        fundingAsset={fundingAsset}
        availableBalance={availableBalance}
        preview={preview}
        submitting={orderSubmitting}
        onSubmit={handleSubmitOrder}
        onQuickPercent={handleQuickPercent}
      />

      <SpotOpenOrders rows={openOrders} loading={openOrdersLoading} onRefresh={loadOpenOrders} onCancel={handleCancelOrder} />

      <SpotOrderHistory
        rows={orderHistory}
        loading={orderHistoryLoading}
        statusFilter={historyStatus}
        onStatusFilterChange={setHistoryStatus}
        onRefresh={() => loadOrderHistory(historyStatus)}
      />

      <SpotRecentTrades rows={recentTrades} loading={recentLoading} onRefresh={loadRecentTrades} />
    </div>
  );
}
