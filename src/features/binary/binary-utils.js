export function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function formatMoney(value = 0, currency = "USDT") {
  const numeric = toNumber(value, 0);
  return `${numeric.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function formatPrice(value = 0, precision = 2) {
  const numeric = toNumber(value, 0);
  const safePrecision = Math.max(2, Math.min(10, Number(precision) || 2));
  return numeric.toLocaleString("en-US", {
    minimumFractionDigits: safePrecision,
    maximumFractionDigits: safePrecision,
  });
}

export function formatDateTime(value = "") {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

export function normalizeDirection(value = "long") {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "short" ? "short" : "long";
}

export function directionLabel(value = "long") {
  return normalizeDirection(value) === "short" ? "Short" : "Long";
}

export function normalizeStatus(value = "active") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["active", "won", "lost", "draw", "cancelled", "error"].includes(normalized)) {
    return normalized;
  }
  return "active";
}

export function statusLabel(value = "") {
  const status = normalizeStatus(value);
  if (status === "won") return "Won";
  if (status === "lost") return "Lost";
  if (status === "draw") return "Draw";
  if (status === "cancelled") return "Cancelled";
  if (status === "error") return "Error";
  return "Active";
}

export function statusClassName(value = "") {
  return `binary-status binary-status-${normalizeStatus(value)}`;
}

export function calculateProjection(stakeAmountUsd = 0, payoutPercent = 0) {
  const stake = toNumber(stakeAmountUsd, 0);
  const payout = toNumber(payoutPercent, 0);
  const expectedProfitUsd = Number((stake * (payout / 100)).toFixed(8));
  const expectedTotalPayoutUsd = Number((stake + expectedProfitUsd).toFixed(8));

  return {
    expectedProfitUsd,
    expectedTotalPayoutUsd,
  };
}

export function remainingSeconds(expireAt = "") {
  const expires = new Date(expireAt).getTime();
  if (!Number.isFinite(expires)) {
    return 0;
  }
  return Math.max(0, Math.ceil((expires - Date.now()) / 1000));
}

export function buildSparklinePath(ticks = [], width = 100, height = 32) {
  if (!Array.isArray(ticks) || ticks.length === 0) {
    return "";
  }

  const prices = ticks.map((tick) => toNumber(tick.price, 0));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const flatLine = Math.abs(max - min) < 1e-10;
  const range = Math.max(1e-10, max - min);

  return ticks
    .map((tick, index) => {
      const x = (index / Math.max(1, ticks.length - 1)) * width;
      const y = flatLine ? height * 0.5 : height - ((toNumber(tick.price, 0) - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function buildSparklinePoints(ticks = [], width = 100, height = 32, verticalPadding = 1.25) {
  if (!Array.isArray(ticks) || ticks.length === 0) {
    return [];
  }

  const prices = ticks.map((tick) => toNumber(tick.price, 0));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(1e-10, max - min);
  const chartHeight = Math.max(2, height - verticalPadding * 2);
  const flatLine = Math.abs(max - min) < 1e-10;

  return ticks.map((tick, index) => {
    const x = (index / Math.max(1, ticks.length - 1)) * width;
    const normalized = flatLine ? 0.5 : (toNumber(tick.price, 0) - min) / range;
    const y = verticalPadding + (1 - normalized) * chartHeight;
    return {
      x,
      y,
      price: toNumber(tick.price, 0),
      tickTime: String(tick?.tickTime || ""),
      sourceType: String(tick?.sourceType || "internal_feed"),
    };
  });
}

export function buildSmoothSparklinePath(points = []) {
  if (!Array.isArray(points) || points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    const only = points[0];
    return `M${only.x.toFixed(2)},${only.y.toFixed(2)}`;
  }

  if (points.length === 2) {
    const [first, second] = points;
    return `M${first.x.toFixed(2)},${first.y.toFixed(2)} L${second.x.toFixed(2)},${second.y.toFixed(2)}`;
  }

  let path = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] || points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }

  return path;
}
