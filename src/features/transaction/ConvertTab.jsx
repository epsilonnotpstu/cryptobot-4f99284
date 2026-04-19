import { useEffect, useMemo, useState } from "react";
import ConvertForm from "./ConvertForm";
import ConvertHistoryTable from "./ConvertHistoryTable";

export default function ConvertTab({
  pairs,
  walletMap,
  onQuote,
  onSubmit,
  onLoadHistory,
  onWalletSync,
  onNotice,
  onError,
}) {
  const [selectedPairId, setSelectedPairId] = useState(0);
  const [amount, setAmount] = useState("");
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quote, setQuote] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

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
      return;
    }
  }, [pairs, selectedPairId]);

  const loadHistory = async (nextStatus = statusFilter) => {
    if (!onLoadHistory) {
      return;
    }

    setHistoryLoading(true);
    try {
      const payload = await onLoadHistory({
        status: nextStatus,
        pairCode: selectedPair?.pairCode || "",
        page: 1,
        limit: 20,
      });
      setHistoryRows(Array.isArray(payload?.orders) ? payload.orders : []);
    } catch (error) {
      onError?.(error.message || "Could not load convert history.");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadHistory(statusFilter);
  }, [selectedPair?.pairCode, statusFilter]);

  useEffect(() => {
    if (!selectedPairId || !amount || Number(amount) <= 0) {
      setQuote(null);
      return undefined;
    }

    if (!onQuote) {
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const payload = await onQuote({ pairId: selectedPairId, amount });
        if (!active) {
          return;
        }
        setQuote(payload?.quote || null);
      } catch (error) {
        if (active) {
          setQuote(null);
          onError?.(error.message || "Could not fetch convert quote.");
        }
      } finally {
        if (active) {
          setQuoteLoading(false);
        }
      }
    }, 320);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [selectedPairId, amount, onQuote]);

  const handleReverse = () => {
    if (!selectedPair) {
      return;
    }

    const reverse = (pairs || []).find(
      (item) => item.fromAsset === selectedPair.toAsset && item.toAsset === selectedPair.fromAsset,
    );

    if (reverse) {
      setSelectedPairId(Number(reverse.pairId));
      setAmount("");
      setQuote(null);
      return;
    }

    onNotice?.("Reverse pair is not available for selected assets.");
  };

  const handleMax = () => {
    if (!selectedPair) {
      return;
    }
    const symbol = `SPOT_${selectedPair.fromAsset}`;
    const available = Number(walletMap?.[symbol]?.availableUsd || 0);
    if (available <= 0) {
      setAmount("");
      return;
    }
    setAmount(available.toFixed(8));
  };

  const handleSubmit = async () => {
    if (!selectedPairId || !amount || Number(amount) <= 0 || !onSubmit) {
      return;
    }

    setSubmitting(true);
    try {
      const payload = await onSubmit({ pairId: selectedPairId, amount: Number(amount), note: "" });
      onNotice?.(payload?.message || "Conversion completed.");
      if (payload?.wallet) {
        onWalletSync?.(payload.wallet);
      }
      setAmount("");
      setQuote(null);
      await loadHistory(statusFilter);
    } catch (error) {
      onError?.(error.message || "Could not submit conversion.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tx-stack">
      <ConvertForm
        pairs={pairs}
        selectedPairId={selectedPairId}
        onPairChange={setSelectedPairId}
        onReverse={handleReverse}
        amount={amount}
        onAmountChange={setAmount}
        onMax={handleMax}
        quote={quote}
        quoteLoading={quoteLoading}
        onSubmit={handleSubmit}
        walletMap={walletMap}
        submitting={submitting}
      />

      <ConvertHistoryTable
        rows={historyRows}
        loading={historyLoading}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onRefresh={() => loadHistory(statusFilter)}
      />
    </div>
  );
}
