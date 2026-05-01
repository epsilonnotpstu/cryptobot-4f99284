export function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

const TOKEN_ICON_CODE_MAP = {
  BTC: "btc",
  ETH: "eth",
  SOL: "sol",
  BNB: "bnb",
  XRP: "xrp",
  DOGE: "doge",
  ADA: "ada",
  DOT: "dot",
  LTC: "ltc",
  AVAX: "avax",
  MATIC: "matic",
  TRX: "trx",
  TON: "ton",
  USDT: "usdt",
  USDC: "usdc",
  DAI: "dai",
};

export function walletAssetFromSymbol(walletSymbol = "") {
  const normalized = String(walletSymbol || "").toUpperCase();
  const asset = normalized.includes("_") ? normalized.split("_").slice(1).join("_") : normalized;
  const clean = String(asset || "USDT").replace(/[^A-Z0-9]/g, "");
  return clean || "USDT";
}

export function tokenIconUrl(assetCode = "") {
  const normalized = String(assetCode || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const iconCode = TOKEN_ICON_CODE_MAP[normalized];
  if (!iconCode) {
    return "";
  }
  return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${iconCode}.png`;
}

export function toMoney(value = 0) {
  return Number(toNumber(value, 0).toFixed(8));
}

export function moneyLabel(value = 0, digits = 2, suffix = "") {
  const numeric = toNumber(value, 0);
  const safeDigits = Math.max(2, Math.min(8, toNumber(digits, 2)));
  return `${numeric.toLocaleString("en-US", {
    minimumFractionDigits: Math.min(2, safeDigits),
    maximumFractionDigits: safeDigits,
  })}${suffix ? ` ${suffix}` : ""}`;
}

export function percentLabel(value = 0, digits = 2) {
  const numeric = toNumber(value, 0);
  return `${numeric.toFixed(Math.max(0, Math.min(4, toNumber(digits, 2))))}%`;
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
  return normalized || "pending";
}

export function statusTone(value = "") {
  const normalized = normalizeStatus(value);
  if (["completed", "approved", "won", "authenticated"].includes(normalized)) {
    return "is-positive";
  }
  if (["failed", "rejected", "cancelled", "lost", "error"].includes(normalized)) {
    return "is-negative";
  }
  if (["pending", "processing", "open", "active"].includes(normalized)) {
    return "is-warning";
  }
  return "is-neutral";
}

export function walletColor(walletSymbol = "") {
  const normalized = String(walletSymbol || "").toUpperCase();
  if (normalized.startsWith("MAIN_")) {
    return "#2dd4bf";
  }
  if (normalized.startsWith("BINARY_")) {
    return "#fb7185";
  }
  return "#38bdf8";
}

export function walletShortLabel(walletSymbol = "") {
  const normalized = String(walletSymbol || "").toUpperCase();
  if (normalized.startsWith("MAIN_")) {
    return "Main";
  }
  if (normalized.startsWith("BINARY_")) {
    return "Binary";
  }
  return "Spot";
}

export function buildDonutGradient(chartData = []) {
  const rows = Array.isArray(chartData) ? chartData : [];
  let cursor = 0;
  const segments = [];

  for (const row of rows) {
    const value = Math.max(0, toNumber(row?.percentage, 0));
    const start = cursor;
    const end = Math.min(100, start + value);
    const color = walletColor(row?.key || row?.walletSymbol || "");
    segments.push(`${color} ${start}% ${end}%`);
    cursor = end;
  }

  if (!segments.length) {
    return "conic-gradient(#1f2d44 0% 100%)";
  }

  if (cursor < 100) {
    segments.push(`#1f2d44 ${cursor}% 100%`);
  }

  return `conic-gradient(${segments.join(", ")})`;
}

export function historyTypeLabel(type = "") {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "deposit") return "Deposit";
  if (normalized === "withdraw") return "Withdraw";
  if (normalized === "transfer") return "Transfer";
  if (normalized === "convert") return "Convert";
  if (normalized === "binary") return "Binary";
  if (normalized === "lum") return "LUM";
  return "Activity";
}
