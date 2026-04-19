export function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function toMoney(value = 0) {
  const numeric = toNumber(value, 0);
  return Number(numeric.toFixed(8));
}

export function moneyLabel(value = 0, symbol = "USDT", digits = 4) {
  const numeric = toNumber(value, 0);
  const maxDigits = Math.max(2, Math.min(8, toNumber(digits, 4)));
  const minDigits = maxDigits > 4 ? 2 : maxDigits;
  return `${numeric.toLocaleString("en-US", {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  })} ${symbol}`;
}

export function percentLabel(value = 0, digits = 2) {
  const numeric = toNumber(value, 0);
  const prefix = numeric > 0 ? "+" : "";
  return `${prefix}${numeric.toFixed(Math.max(0, Math.min(6, toNumber(digits, 2))))}%`;
}

export function formatTime(value = "") {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function normalizeStatus(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "unknown";
  }
  return normalized;
}

export function statusTone(value = "") {
  const normalized = normalizeStatus(value);
  if (["filled", "completed", "approved", "won", "success"].includes(normalized)) {
    return "is-positive";
  }
  if (["cancelled", "rejected", "failed", "error", "lost"].includes(normalized)) {
    return "is-negative";
  }
  if (["open", "pending", "partially_filled", "processing"].includes(normalized)) {
    return "is-warning";
  }
  return "is-neutral";
}

export function walletDetailsToMap(details = []) {
  const rows = Array.isArray(details) ? details : [];
  return rows.reduce((acc, row) => {
    const symbol = String(row?.symbol || "").trim().toUpperCase();
    if (!symbol) {
      return acc;
    }
    const existing = acc[symbol] || {
      availableUsd: 0,
      lockedUsd: 0,
      rewardEarnedUsd: 0,
      updatedAt: "",
    };
    const nextUpdatedAt = row?.updatedAt || "";

    acc[symbol] = {
      availableUsd: toMoney(existing.availableUsd + toNumber(row?.availableUsd, 0)),
      lockedUsd: toMoney(existing.lockedUsd + toNumber(row?.lockedUsd, 0)),
      rewardEarnedUsd: toMoney(existing.rewardEarnedUsd + toNumber(row?.rewardEarnedUsd, 0)),
      updatedAt:
        new Date(nextUpdatedAt || 0).getTime() > new Date(existing.updatedAt || 0).getTime()
          ? nextUpdatedAt
          : existing.updatedAt,
    };
    return acc;
  }, {});
}

export function getAvailableBalance(walletMap, assetCode = "USDT") {
  const asset = String(assetCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "USDT";
  const candidates = [`SPOT_${asset}`, `SPOT${asset}`, asset];
  if (asset === "USDT") {
    candidates.push("SPOT_USD", "SPOTUSD", "USD");
  }

  for (const symbol of candidates) {
    const direct = walletMap?.[symbol];
    if (direct) {
      return toNumber(direct.availableUsd, 0);
    }
  }

  const collapsedCandidates = new Set(candidates.map((symbol) => String(symbol || "").replace(/_/g, "")));
  for (const [symbol, row] of Object.entries(walletMap || {})) {
    const collapsed = String(symbol || "").toUpperCase().replace(/_/g, "");
    if (collapsedCandidates.has(collapsed)) {
      return toNumber(row?.availableUsd, 0);
    }
  }

  return 0;
}

export function getPairCodeLabel(pair) {
  if (!pair) {
    return "-";
  }
  return pair.displayName || pair.pairCode || "-";
}

export function clampPercent(value) {
  return Math.max(0, Math.min(100, toNumber(value, 0)));
}

export function calcOrderPreview({ side, orderType, quantity, price, marketPrice, makerFeePercent, takerFeePercent }) {
  const qty = Math.max(0, toNumber(quantity, 0));
  const resolvedPrice = orderType === "market" ? toNumber(marketPrice, 0) : toNumber(price, 0);
  const quoteAmount = toMoney(resolvedPrice * qty);
  const feePercent = orderType === "market" ? toNumber(takerFeePercent, 0) : toNumber(makerFeePercent, 0);
  const feeAmount = toMoney(quoteAmount * (feePercent / 100));

  if (side === "buy") {
    return {
      quoteAmount,
      feeAmount,
      lockAmount: toMoney(quoteAmount + feeAmount),
      receiveBase: qty,
      receiveQuote: 0,
    };
  }

  return {
    quoteAmount,
    feeAmount,
    lockAmount: qty,
    receiveBase: 0,
    receiveQuote: toMoney(quoteAmount - feeAmount),
  };
}
