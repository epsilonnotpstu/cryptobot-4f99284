export function formatMoney(value = 0, currency = "USD") {
  const numeric = Number(value || 0);
  return `${numeric.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
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

export function formatDate(value = "") {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleDateString();
}

export function normalizeStatus(value = "") {
  const normalized = String(value || "pending").trim().toLowerCase();
  if (["active", "completed", "pending", "rejected", "redeemed_early", "cancelled"].includes(normalized)) {
    return normalized;
  }
  return "pending";
}

export function statusLabel(value = "") {
  const normalized = normalizeStatus(value);
  if (normalized === "redeemed_early") {
    return "Redeemed Early";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function statusClass(value = "") {
  const normalized = normalizeStatus(value);
  return `lum-status lum-status-${normalized.replace(/_/g, "-")}`;
}

export function normalizeCategory(value = "") {
  const normalized = String(value || "lum").trim().toLowerCase();
  return normalized === "mining" ? "mining" : "lum";
}

export function categoryLabel(value = "") {
  return normalizeCategory(value) === "mining" ? "Mining" : "LUM";
}

export function calculateProjection(plan, amountUsd) {
  const amount = Number(amountUsd || 0);
  const rate = Number(plan?.returnRate || 0);
  const cycleDays = Math.max(1, Number(plan?.cycleDays || 1));
  const returnType = String(plan?.returnType || "daily_percent").toLowerCase();

  let totalProfit = 0;
  let dailyProfit = 0;

  if (returnType === "daily_percent") {
    dailyProfit = amount * (rate / 100);
    totalProfit = dailyProfit * cycleDays;
  } else if (returnType === "cycle_percent") {
    totalProfit = amount * (rate / 100);
    dailyProfit = totalProfit / cycleDays;
  } else if (returnType === "fixed_amount") {
    totalProfit = rate;
    dailyProfit = totalProfit / cycleDays;
  } else if (returnType === "apr_percent") {
    dailyProfit = amount * ((rate / 100) / 365);
    totalProfit = dailyProfit * cycleDays;
  }

  const expectedProfitUsd = Number(totalProfit.toFixed(8));
  const expectedTotalReturnUsd = Number((amount + expectedProfitUsd).toFixed(8));

  return {
    expectedProfitUsd,
    expectedTotalReturnUsd,
    dailyProfitUsd: Number(dailyProfit.toFixed(8)),
  };
}
