import { useCallback, useEffect, useMemo, useState } from "react";
import AdminAuthPage from "./components/AdminAuthPage";
import AdminDashboardPage from "./components/AdminDashboardPage";
import { clearAdminSession, readAdminSnapshot, storeAdminSession } from "./utils/storage";
import "./admin-section.css";

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function buildActivityFeed(depositRequests, kycRequests) {
  const depositEvents = (Array.isArray(depositRequests) ? depositRequests : []).map((item) => {
    const amountUsd = toNumber(item.amountUsd, 0).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

    const status = String(item.status || "pending").toLowerCase();
    const summary =
      status === "approved"
        ? `Deposit approved for ${item.accountEmail || item.userId} • ${item.assetSymbol} $${amountUsd}`
        : status === "rejected"
          ? `Deposit rejected for ${item.accountEmail || item.userId} • ${item.assetSymbol}`
          : `New deposit request from ${item.accountEmail || item.userId} • ${item.assetSymbol} $${amountUsd}`;

    return {
      id: `deposit-${item.requestId}`,
      text: summary,
      timestamp: item.reviewedAt || item.submittedAt || "",
    };
  });

  const kycEvents = (Array.isArray(kycRequests) ? kycRequests : []).map((item) => {
    const status = String(item.status || "pending").toLowerCase();
    const summary =
      status === "authenticated"
        ? `KYC approved for ${item.accountEmail || item.userId}`
        : status === "rejected"
          ? `KYC rejected for ${item.accountEmail || item.userId}`
          : `KYC submitted by ${item.accountEmail || item.userId}`;

    return {
      id: `kyc-${item.requestId}`,
      text: summary,
      timestamp: item.reviewedAt || item.submittedAt || "",
    };
  });

  return [...depositEvents, ...kycEvents]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);
}

function buildDashboardModel(usersPayload, depositPayload, kycPayload) {
  const userStats = usersPayload?.stats || {};
  const depositStats = depositPayload?.stats || {};
  const kycStats = kycPayload?.stats || {};

  const totalUsers = toNumber(userStats.totalUsers, 0);
  const pendingVerifications = toNumber(userStats.pendingVerifications, 0);
  const authenticatedUsers = toNumber(userStats.authenticatedUsers, 0);
  const activeUsers = toNumber(userStats.activeUsers, 0);
  const totalDepositRequests = toNumber(depositStats.totalRequests, 0);
  const pendingDepositRequests = toNumber(depositStats.pendingRequests, 0);
  const approvedDeposits = toNumber(depositStats.approvedRequests, 0);
  const totalKycRequests = toNumber(kycStats.totalKycRequests, Array.isArray(kycPayload?.requests) ? kycPayload.requests.length : 0);
  const pendingKycRequests = toNumber(kycStats.pendingKycRequests, pendingVerifications);

  const trendScale = Math.max(0.85, Math.min(2.6, (totalDepositRequests + totalKycRequests + authenticatedUsers + 10) / 80));
  const baseProfit = [16, 22, 19, 31, 26, 38, 33, 45, 41, 50, 57, 62];
  const baseCost = [8, 10, 9, 13, 12, 16, 15, 18, 20, 19, 22, 24];

  const metrics = [
    {
      key: "users",
      label: "Total Users",
      value: totalUsers,
      icon: "fa-users",
      growth: pendingVerifications > 0 ? `+${pendingVerifications} pending` : "No pending KYC",
      tone: "blue",
      format: "number",
    },
    {
      key: "authenticated",
      label: "Authenticated Users",
      value: authenticatedUsers,
      icon: "fa-user-check",
      growth: `${toNumber(userStats.totalAdminUsers, 0)} admin account`,
      tone: "purple",
      format: "number",
    },
    {
      key: "pendingKyc",
      label: "Pending KYC Review",
      value: pendingVerifications,
      icon: "fa-file-circle-question",
      growth: pendingKycRequests > 0 ? `${pendingKycRequests} requests pending` : "All caught up",
      tone: "green",
      format: "number",
    },
    {
      key: "kycRequests",
      label: "Total KYC Requests",
      value: totalKycRequests,
      icon: "fa-id-card",
      growth: pendingKycRequests > 0 ? `${pendingKycRequests} pending` : "No pending",
      tone: "gold",
      format: "number",
    },
    {
      key: "depositRequests",
      label: "Total Deposit Requests",
      value: totalDepositRequests,
      icon: "fa-wallet",
      growth: pendingDepositRequests > 0 ? `${pendingDepositRequests} pending` : "No pending",
      tone: "emerald",
      format: "number",
    },
  ];

  const apiSuccessRate = totalDepositRequests
    ? (((approvedDeposits + pendingDepositRequests) / totalDepositRequests) * 100).toFixed(1)
    : "100.0";

  const errorRate = (100 - Number(apiSuccessRate)) / 100;

  return {
    metrics,
    profitSeries: baseProfit.map((value) => Number((value * trendScale).toFixed(2))),
    costSeries: baseCost.map((value) => Number((value * Math.max(0.7, trendScale * 0.68)).toFixed(2))),
    health: {
      uptime: totalUsers > 0 ? "99.97" : "99.90",
      apiSuccessRate,
      latencyMs: 14,
      errorRate: errorRate.toFixed(2),
      activeSessions: activeUsers,
    },
    activityFeed: buildActivityFeed(depositPayload?.requests, kycPayload?.requests),
  };
}

function buildUserDirectoryModel(usersPayload) {
  const stats = usersPayload?.stats || {};
  const users = (Array.isArray(usersPayload?.users) ? usersPayload.users : [])
    .filter((user) => {
      const role = String(user?.accountRole || "").toLowerCase();
      return role !== "admin" && role !== "super_admin";
    })
    .map((user) => ({
      ...user,
      totalBalanceUsd: toNumber(user.totalBalanceUsd, 0),
      isActiveSession: Boolean(user.isActiveSession),
    }));

  return {
    stats: {
      totalUsers: toNumber(stats.totalUsers, users.length),
      totalPlatformUsers: toNumber(stats.totalPlatformUsers, users.length),
      totalAdminUsers: toNumber(stats.totalAdminUsers, 0),
      totalAccounts: toNumber(stats.totalAccounts, users.length),
      activeUsers: toNumber(stats.activeUsers, 0),
      pendingVerifications: toNumber(stats.pendingVerifications, 0),
      authenticatedUsers: toNumber(stats.authenticatedUsers, 0),
      rejectedUsers: toNumber(stats.rejectedUsers, 0),
    },
    users,
  };
}

function buildKycQueueModel(kycPayload) {
  const stats = kycPayload?.stats || {};
  const requests = Array.isArray(kycPayload?.requests) ? kycPayload.requests : [];

  return {
    stats: {
      totalKycRequests: toNumber(stats.totalKycRequests, requests.length),
      pendingKycRequests: toNumber(stats.pendingKycRequests, 0),
      authenticatedKycRequests: toNumber(stats.authenticatedKycRequests, 0),
      rejectedKycRequests: toNumber(stats.rejectedKycRequests, 0),
      totalUsers: toNumber(stats.totalUsers, 0),
      totalPlatformUsers: toNumber(stats.totalPlatformUsers, 0),
      totalAdminUsers: toNumber(stats.totalAdminUsers, 0),
      totalAccounts: toNumber(stats.totalAccounts, 0),
      pendingVerifications: toNumber(stats.pendingVerifications, 0),
      authenticatedUsers: toNumber(stats.authenticatedUsers, 0),
      rejectedUsers: toNumber(stats.rejectedUsers, 0),
    },
    requests: requests.map((item) => ({
      requestId: toNumber(item.requestId, 0),
      userId: String(item.userId || ""),
      fullName: String(item.fullName || ""),
      certification: String(item.certification || ""),
      ssn: String(item.ssn || ""),
      frontFileName: String(item.frontFileName || ""),
      frontFileData: String(item.frontFileData || ""),
      backFileName: String(item.backFileName || ""),
      backFileData: String(item.backFileData || ""),
      status: String(item.status || "pending"),
      note: String(item.note || ""),
      submittedAt: String(item.submittedAt || ""),
      reviewedAt: String(item.reviewedAt || ""),
      reviewedBy: String(item.reviewedBy || ""),
      accountName: String(item.accountName || ""),
      accountEmail: String(item.accountEmail || ""),
      accountAvatarUrl: String(item.accountAvatarUrl || ""),
      accountKycStatus: String(item.accountKycStatus || ""),
      accountAuthTag: String(item.accountAuthTag || ""),
    })),
  };
}

function buildDepositCenterModel(assetsPayload, depositPayload) {
  const assets = Array.isArray(assetsPayload?.assets) ? assetsPayload.assets : [];
  const requests = Array.isArray(depositPayload?.requests) ? depositPayload.requests : [];
  const assetsStats = assetsPayload?.stats || {};
  const requestsStats = depositPayload?.stats || {};

  return {
    stats: {
      totalAssets: toNumber(assetsStats.totalAssets, assets.length),
      enabledAssets: toNumber(assetsStats.enabledAssets, assets.filter((item) => item?.isEnabled).length),
      totalRequests: toNumber(requestsStats.totalRequests, requests.length),
      pendingRequests: toNumber(requestsStats.pendingRequests, 0),
      approvedRequests: toNumber(requestsStats.approvedRequests, 0),
      rejectedRequests: toNumber(requestsStats.rejectedRequests, 0),
    },
    assets: assets.map((asset) => ({
      assetId: toNumber(asset.assetId, 0),
      symbol: String(asset.symbol || ""),
      name: String(asset.name || ""),
      chainName: String(asset.chainName || ""),
      rechargeAddress: String(asset.rechargeAddress || ""),
      qrCodeData: String(asset.qrCodeData || ""),
      minAmountUsd: toNumber(asset.minAmountUsd, 0),
      maxAmountUsd: toNumber(asset.maxAmountUsd, 0),
      sortOrder: toNumber(asset.sortOrder, 0),
      isEnabled: Boolean(asset.isEnabled),
      updatedAt: String(asset.updatedAt || ""),
    })),
    requests: requests.map((request) => ({
      requestId: toNumber(request.requestId, 0),
      userId: String(request.userId || ""),
      assetId: toNumber(request.assetId, 0),
      assetSymbol: String(request.assetSymbol || ""),
      assetName: String(request.assetName || ""),
      chainName: String(request.chainName || ""),
      rechargeAddress: String(request.rechargeAddress || ""),
      amountUsd: toNumber(request.amountUsd, 0),
      screenshotFileName: String(request.screenshotFileName || ""),
      screenshotFileData: String(request.screenshotFileData || ""),
      status: String(request.status || "pending"),
      note: String(request.note || ""),
      submittedAt: String(request.submittedAt || ""),
      reviewedAt: String(request.reviewedAt || ""),
      reviewedBy: String(request.reviewedBy || ""),
      accountName: String(request.accountName || ""),
      accountEmail: String(request.accountEmail || ""),
      accountAvatarUrl: String(request.accountAvatarUrl || ""),
    })),
  };
}

function buildLumCenterModel(summaryPayload, plansPayload, investmentsPayload) {
  const summary = summaryPayload?.summary || {};
  const plans = Array.isArray(plansPayload?.plans) ? plansPayload.plans : [];
  const investments = Array.isArray(investmentsPayload?.investments) ? investmentsPayload.investments : [];
  const stats = plansPayload?.stats || {};

  const pendingInvestments = investments.filter((item) => String(item?.status || "").toLowerCase() === "pending").length;
  const activeInvestments = investments.filter((item) => String(item?.status || "").toLowerCase() === "active").length;
  const completedInvestments = investments.filter((item) => {
    const status = String(item?.status || "").toLowerCase();
    return status === "completed" || status === "redeemed_early";
  }).length;

  return {
    summary: {
      totalPlans: toNumber(summary.totalPlans, toNumber(stats.totalPlans, plans.length)),
      totalInvestments: toNumber(summary.totalInvestments, toNumber(stats.totalInvestments, investments.length)),
      activeLocked: toNumber(summary.activeLocked, 0),
      completedReturn: toNumber(summary.completedReturn, 0),
      pendingCount: toNumber(summary.pendingCount, pendingInvestments),
      todayEstimatedPayout: toNumber(summary.todayEstimatedPayout, 0),
      activeInvestments,
      completedInvestments,
      pendingInvestments,
    },
    plans: plans.map((plan) => ({
      ...plan,
      planId: toNumber(plan.planId, 0),
      minimumAmountUsd: toNumber(plan.minimumAmountUsd, 0),
      maximumAmountUsd: plan.maximumAmountUsd === null ? null : toNumber(plan.maximumAmountUsd, 0),
      returnRate: toNumber(plan.returnRate, 0),
      cycleDays: toNumber(plan.cycleDays, 0),
      quotaLimit: plan.quotaLimit === null ? null : toNumber(plan.quotaLimit, 0),
      quotaUsed: toNumber(plan.quotaUsed, 0),
      displaySortOrder: toNumber(plan.displaySortOrder, 0),
      isFeatured: Boolean(plan.isFeatured),
      lockPrincipal: Boolean(plan.lockPrincipal),
      allowEarlyRedeem: Boolean(plan.allowEarlyRedeem),
      requiresAdminReview: Boolean(plan.requiresAdminReview),
      contents: Array.isArray(plan.contents) ? plan.contents : [],
    })),
    investments: investments.map((item) => ({
      ...item,
      investmentId: toNumber(item.investmentId, 0),
      planId: toNumber(item.planId, 0),
      investedAmountUsd: toNumber(item.investedAmountUsd, 0),
      expectedProfitUsd: toNumber(item.expectedProfitUsd, 0),
      expectedTotalReturnUsd: toNumber(item.expectedTotalReturnUsd, 0),
      accruedProfitUsd: toNumber(item.accruedProfitUsd, 0),
      settledProfitUsd: toNumber(item.settledProfitUsd, 0),
      settledTotalReturnUsd: toNumber(item.settledTotalReturnUsd, 0),
      lockedPrincipalUsd: toNumber(item.lockedPrincipalUsd, 0),
      cycleDays: toNumber(item.cycleDays, 0),
      remainingDays: toNumber(item.remainingDays, 0),
    })),
  };
}

function buildBinaryCenterModel(summaryPayload, pairsPayload, rulesPayload, tradesPayload, settingsPayload) {
  const summaryRaw = summaryPayload?.summary || summaryPayload?.data || {};
  const pairsRaw = Array.isArray(pairsPayload?.pairs)
    ? pairsPayload.pairs
    : Array.isArray(pairsPayload?.data)
      ? pairsPayload.data
      : [];
  const rulesRaw = Array.isArray(rulesPayload?.rules)
    ? rulesPayload.rules
    : Array.isArray(rulesPayload?.data)
      ? rulesPayload.data
      : [];
  const tradesData = tradesPayload?.data || {};
  const tradesRaw = Array.isArray(tradesData?.trades)
    ? tradesData.trades
    : Array.isArray(tradesPayload?.trades)
      ? tradesPayload.trades
      : [];
  const settingsRaw = settingsPayload?.settings || settingsPayload?.data || {};

  return {
    summary: {
      totalActiveStakes: toNumber(summaryRaw.totalActiveStakes, 0),
      totalSettledProfitPaid: toNumber(summaryRaw.totalSettledProfitPaid, 0),
      totalLossesCollected: toNumber(summaryRaw.totalLossesCollected, 0),
      netHouseExposure: toNumber(summaryRaw.netHouseExposure, 0),
      activeTradesCount: toNumber(summaryRaw.activeTradesCount, 0),
      todayTradesCount: toNumber(summaryRaw.todayTradesCount, 0),
      totalTrades: toNumber(summaryRaw.totalTrades, tradesRaw.length),
      topTradedPairs: Array.isArray(summaryRaw.topTradedPairs) ? summaryRaw.topTradedPairs : [],
      breakdown: summaryRaw?.breakdown || {},
    },
    pairs: pairsRaw.map((item) => ({
      ...item,
      pairId: toNumber(item.pairId, 0),
      currentPrice: toNumber(item.currentPrice, 0),
      previousPrice: toNumber(item.previousPrice, 0),
      pricePrecision: toNumber(item.pricePrecision, 2),
      isEnabled: Boolean(item.isEnabled),
      isFeatured: Boolean(item.isFeatured),
      displaySortOrder: toNumber(item.displaySortOrder, 0),
    })),
    rules: rulesRaw.map((item) => ({
      ...item,
      ruleId: toNumber(item.ruleId, 0),
      pairId: item.pairId === null || item.pairId === undefined ? null : toNumber(item.pairId, 0),
      periodSeconds: toNumber(item.periodSeconds, 0),
      payoutPercent: toNumber(item.payoutPercent, 0),
      refundPercentOnDraw: toNumber(item.refundPercentOnDraw, 0),
      isActive: Boolean(item.isActive),
      displaySortOrder: toNumber(item.displaySortOrder, 0),
    })),
    trades: tradesRaw.map((item) => ({
      ...item,
      tradeId: toNumber(item.tradeId, 0),
      pairId: toNumber(item.pairId, 0),
      periodSeconds: toNumber(item.periodSeconds, 0),
      payoutPercent: toNumber(item.payoutPercent, 0),
      drawRefundPercent: toNumber(item.drawRefundPercent, 0),
      stakeAmountUsd: toNumber(item.stakeAmountUsd, 0),
      expectedProfitUsd: toNumber(item.expectedProfitUsd, 0),
      expectedTotalPayoutUsd: toNumber(item.expectedTotalPayoutUsd, 0),
      entryPrice: toNumber(item.entryPrice, 0),
      settlementPrice: item.settlementPrice === null || item.settlementPrice === undefined ? null : toNumber(item.settlementPrice, 0),
      pnlUsd: toNumber(item.pnlUsd, 0),
      remainingSeconds: toNumber(item.remainingSeconds, 0),
    })),
    pagination: tradesData?.pagination || { page: 1, limit: tradesRaw.length, total: tradesRaw.length },
    settings: {
      engineMode: String(settingsRaw.engineMode || "internal_tick"),
      settlementPriceMode: String(settingsRaw.settlementPriceMode || "latest_tick_at_or_before_expiry"),
      tickIntervalMs: toNumber(settingsRaw.tickIntervalMs, 1000),
      chartHistoryLimit: toNumber(settingsRaw.chartHistoryLimit, 180),
      binaryWalletAssetSymbol: String(settingsRaw.binaryWalletAssetSymbol || "BINARY_USDT"),
      requireKycForBinary: Boolean(settingsRaw.requireKycForBinary),
      allowDrawRefund: settingsRaw.allowDrawRefund !== false,
      maxOpenTradesPerUser: toNumber(settingsRaw.maxOpenTradesPerUser, 1),
      globalMinStakeUsd: toNumber(settingsRaw.globalMinStakeUsd, 10),
      globalMaxStakeUsd: settingsRaw.globalMaxStakeUsd === null || settingsRaw.globalMaxStakeUsd === undefined ? null : toNumber(settingsRaw.globalMaxStakeUsd, 0),
      allowSameSecondMultiTrade: Boolean(settingsRaw.allowSameSecondMultiTrade),
      tradeOutcomeMode: String(settingsRaw.tradeOutcomeMode || "auto"),
      autoTransferFromSpot: settingsRaw.autoTransferFromSpot !== false,
    },
  };
}

const DEFAULT_DASHBOARD = {
  metrics: [
    { key: "users", label: "Total Users", value: 0, icon: "fa-users", growth: "No pending KYC", tone: "blue", format: "number" },
    {
      key: "authenticated",
      label: "Authenticated Users",
      value: 0,
      icon: "fa-user-check",
      growth: "0 admin account",
      tone: "purple",
      format: "number",
    },
    {
      key: "pendingKyc",
      label: "Pending KYC Review",
      value: 0,
      icon: "fa-file-circle-question",
      growth: "No pending",
      tone: "green",
      format: "number",
    },
    {
      key: "kycRequests",
      label: "Total KYC Requests",
      value: 0,
      icon: "fa-id-card",
      growth: "No pending",
      tone: "gold",
      format: "number",
    },
    {
      key: "depositRequests",
      label: "Total Deposit Requests",
      value: 0,
      icon: "fa-wallet",
      growth: "No pending",
      tone: "emerald",
      format: "number",
    },
  ],
  profitSeries: [],
  costSeries: [],
  health: {
    uptime: "99.90",
    apiSuccessRate: "100.0",
    latencyMs: 14,
    errorRate: "0.00",
    activeSessions: 0,
  },
  activityFeed: [],
};

const DEFAULT_USER_DIRECTORY = {
  stats: {
    totalUsers: 0,
    totalPlatformUsers: 0,
    totalAdminUsers: 0,
    totalAccounts: 0,
    activeUsers: 0,
    pendingVerifications: 0,
    authenticatedUsers: 0,
    rejectedUsers: 0,
  },
  users: [],
};

const DEFAULT_KYC_QUEUE = {
  stats: {
    totalKycRequests: 0,
    pendingKycRequests: 0,
    authenticatedKycRequests: 0,
    rejectedKycRequests: 0,
    totalUsers: 0,
    totalPlatformUsers: 0,
    totalAdminUsers: 0,
    totalAccounts: 0,
    pendingVerifications: 0,
    authenticatedUsers: 0,
    rejectedUsers: 0,
  },
  requests: [],
};

const DEFAULT_DEPOSIT_CENTER = {
  stats: {
    totalAssets: 0,
    enabledAssets: 0,
    totalRequests: 0,
    pendingRequests: 0,
    approvedRequests: 0,
    rejectedRequests: 0,
  },
  assets: [],
  requests: [],
};

const DEFAULT_LUM_CENTER = {
  summary: {
    totalPlans: 0,
    totalInvestments: 0,
    activeLocked: 0,
    completedReturn: 0,
    pendingCount: 0,
    todayEstimatedPayout: 0,
    activeInvestments: 0,
    completedInvestments: 0,
    pendingInvestments: 0,
  },
  plans: [],
  investments: [],
};

const DEFAULT_BINARY_CENTER = {
  summary: {
    totalActiveStakes: 0,
    totalSettledProfitPaid: 0,
    totalLossesCollected: 0,
    netHouseExposure: 0,
    activeTradesCount: 0,
    todayTradesCount: 0,
    totalTrades: 0,
    topTradedPairs: [],
    breakdown: {},
  },
  pairs: [],
  rules: [],
  trades: [],
  pagination: { page: 1, limit: 0, total: 0 },
  settings: {
    engineMode: "internal_tick",
    settlementPriceMode: "latest_tick_at_or_before_expiry",
    tickIntervalMs: 1000,
    chartHistoryLimit: 180,
    binaryWalletAssetSymbol: "BINARY_USDT",
    requireKycForBinary: false,
    allowDrawRefund: true,
    maxOpenTradesPerUser: 1,
    globalMinStakeUsd: 10,
    globalMaxStakeUsd: null,
    allowSameSecondMultiTrade: false,
    tradeOutcomeMode: "auto",
    autoTransferFromSpot: true,
  },
};

export default function AdminSectionPage({ authService, onBackHome, onOpenUserAuth }) {
  const [mode, setMode] = useState("login");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");

  const [adminSnapshot, setAdminSnapshot] = useState(readAdminSnapshot);
  const [authReady, setAuthReady] = useState(() => !readAdminSnapshot().sessionToken);
  const [activeSection, setActiveSection] = useState("dashboard");

  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [dashboard, setDashboard] = useState(DEFAULT_DASHBOARD);
  const [userDirectory, setUserDirectory] = useState(DEFAULT_USER_DIRECTORY);
  const [kycQueue, setKycQueue] = useState(DEFAULT_KYC_QUEUE);
  const [depositCenter, setDepositCenter] = useState(DEFAULT_DEPOSIT_CENTER);
  const [lumCenter, setLumCenter] = useState(DEFAULT_LUM_CENTER);
  const [binaryCenter, setBinaryCenter] = useState(DEFAULT_BINARY_CENTER);

  const clearAuthFeedback = () => {
    setAuthError("");
    setAuthNotice("");
  };

  const refreshAdminSession = useCallback(async () => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      setAdminSnapshot(snapshot);
      setAuthReady(true);
      return;
    }

    setAuthReady(false);
    try {
      const data = await authService.adminSession({ sessionToken: snapshot.sessionToken });
      storeAdminSession({ user: data?.user, sessionToken: snapshot.sessionToken });
      setAdminSnapshot(readAdminSnapshot());
    } catch {
      clearAdminSession();
      setAdminSnapshot(readAdminSnapshot());
    } finally {
      setAuthReady(true);
    }
  }, [authService]);

  const loadAdminData = useCallback(async () => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      return;
    }

    setDashboardLoading(true);
    setDashboardError("");
    try {
      const [usersPayload, assetsPayload, depositPayload, kycPayload] = await Promise.all([
        authService.adminListUsers({ sessionToken: snapshot.sessionToken, kycStatus: "", includeAdmins: false }),
        authService.adminListDepositAssets({ sessionToken: snapshot.sessionToken }),
        authService.adminListDepositRequests({ sessionToken: snapshot.sessionToken }),
        authService.adminListKycRequests({ sessionToken: snapshot.sessionToken }),
      ]);
      setDashboard(buildDashboardModel(usersPayload, depositPayload, kycPayload));
      setUserDirectory(buildUserDirectoryModel(usersPayload));
      setKycQueue(buildKycQueueModel(kycPayload));
      setDepositCenter(buildDepositCenterModel(assetsPayload, depositPayload));

      try {
        const [lumSummaryPayload, lumPlansPayload, lumInvestmentsPayload] = await Promise.all([
          authService.adminGetLumDashboardSummary({ sessionToken: snapshot.sessionToken }),
          authService.adminListLumPlans({ sessionToken: snapshot.sessionToken, category: "all", status: "all" }),
          authService.adminListLumInvestments({
            sessionToken: snapshot.sessionToken,
            status: "all",
            category: "all",
            page: 1,
            limit: 300,
            keyword: "",
          }),
        ]);
        setLumCenter(buildLumCenterModel(lumSummaryPayload, lumPlansPayload, lumInvestmentsPayload));
      } catch {
        setLumCenter(DEFAULT_LUM_CENTER);
      }

      try {
        const [binarySummaryPayload, binaryPairsPayload, binaryRulesPayload, binaryTradesPayload, binarySettingsPayload] = await Promise.all([
          authService.adminGetBinaryDashboardSummary({ sessionToken: snapshot.sessionToken }),
          authService.adminListBinaryPairs({ sessionToken: snapshot.sessionToken }),
          authService.adminListBinaryPeriodRules({ sessionToken: snapshot.sessionToken }),
          authService.adminListBinaryTrades({
            sessionToken: snapshot.sessionToken,
            status: "all",
            pairId: 0,
            keyword: "",
            page: 1,
            limit: 500,
          }),
          authService.adminGetBinaryEngineSettings({ sessionToken: snapshot.sessionToken }),
        ]);
        setBinaryCenter(buildBinaryCenterModel(binarySummaryPayload, binaryPairsPayload, binaryRulesPayload, binaryTradesPayload, binarySettingsPayload));
      } catch {
        setBinaryCenter(DEFAULT_BINARY_CENTER);
      }
    } catch (error) {
      setDashboardError(error.message || "Could not load admin dashboard data.");
    } finally {
      setDashboardLoading(false);
    }
  }, [authService]);

  const fetchUserDetail = useCallback(async (userId) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    return authService.adminGetUserDetail({ sessionToken: snapshot.sessionToken, userId });
  }, [authService]);

  const deleteUserById = useCallback(async (userId) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminDeleteUser({ sessionToken: snapshot.sessionToken, userId });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const reviewKycRequest = useCallback(async ({ requestId, decision, note }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }

    const data = await authService.adminReviewKycRequest({
      sessionToken: snapshot.sessionToken,
      requestId,
      decision,
      note,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const upsertDepositAsset = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminUpsertDepositAsset({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const deleteDepositAsset = useCallback(async (assetId) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminDeleteDepositAsset({ sessionToken: snapshot.sessionToken, assetId });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const reviewDepositRequest = useCallback(async ({ requestId, decision, note }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminReviewDepositRequest({
      sessionToken: snapshot.sessionToken,
      requestId,
      decision,
      note,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const createLumPlan = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminCreateLumPlan({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const updateLumPlan = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminUpdateLumPlan({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const deleteLumPlan = useCallback(async (planId) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminDeleteLumPlan({ sessionToken: snapshot.sessionToken, planId });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const toggleLumPlanStatus = useCallback(async ({ planId, status }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminToggleLumPlanStatus({
      sessionToken: snapshot.sessionToken,
      planId,
      status,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const saveLumPlanContent = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminSaveLumContent({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const reviewLumInvestment = useCallback(async ({ investmentId, decision, note }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminReviewLumInvestment({
      sessionToken: snapshot.sessionToken,
      investmentId,
      decision,
      note,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const forceSettleLumInvestment = useCallback(async ({ investmentId, note }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminForceSettleLumInvestment({
      sessionToken: snapshot.sessionToken,
      investmentId,
      note,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const createBinaryPair = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminCreateBinaryPair({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data?.data || data;
  }, [authService, loadAdminData]);

  const updateBinaryPair = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminUpdateBinaryPair({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data?.data || data;
  }, [authService, loadAdminData]);

  const deleteBinaryPair = useCallback(async (pairId) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminDeleteBinaryPair({
      sessionToken: snapshot.sessionToken,
      pairId,
    });
    await loadAdminData();
    return data?.data || data;
  }, [authService, loadAdminData]);

  const toggleBinaryPairStatus = useCallback(async ({ pairId, isEnabled }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminToggleBinaryPairStatus({
      sessionToken: snapshot.sessionToken,
      pairId,
      isEnabled,
    });
    await loadAdminData();
    return data?.data || data;
  }, [authService, loadAdminData]);

  const saveBinaryPeriodRule = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminSaveBinaryPeriodRule({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data?.data || data;
  }, [authService, loadAdminData]);

  const settleBinaryTrade = useCallback(async ({ tradeId, note }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminSettleBinaryTrade({
      sessionToken: snapshot.sessionToken,
      tradeId,
      note,
    });
    await loadAdminData();
    return data?.data || data;
  }, [authService, loadAdminData]);

  const cancelBinaryTrade = useCallback(async ({ tradeId, note }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminCancelBinaryTrade({
      sessionToken: snapshot.sessionToken,
      tradeId,
      note,
    });
    await loadAdminData();
    return data?.data || data;
  }, [authService, loadAdminData]);

  const saveBinaryEngineSettings = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminSaveBinaryEngineSettings({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data?.data || data;
  }, [authService, loadAdminData]);

  const pushBinaryManualTick = useCallback(async ({ pairId, price }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminPushBinaryManualTick({
      sessionToken: snapshot.sessionToken,
      pairId,
      price,
    });
    await loadAdminData();
    return data?.data || data;
  }, [authService, loadAdminData]);

  useEffect(() => {
    refreshAdminSession();
  }, [refreshAdminSession]);

  useEffect(() => {
    if (adminSnapshot.isLoggedIn && adminSnapshot.sessionToken) {
      loadAdminData();
    }
  }, [adminSnapshot.isLoggedIn, adminSnapshot.sessionToken, loadAdminData]);

  const handleSignup = async ({ name, email, phone, password }) => {
    clearAuthFeedback();
    setAuthSubmitting(true);
    try {
      const data = await authService.adminSignup({ name, email, phone, password });
      storeAdminSession({ user: data?.user, sessionToken: data?.sessionToken });
      setAdminSnapshot(readAdminSnapshot());
      setAuthNotice(data?.message || "Admin account created successfully.");
    } catch (error) {
      setAuthError(error.message || "Admin signup failed.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogin = async ({ email, password }) => {
    clearAuthFeedback();
    setAuthSubmitting(true);
    try {
      const data = await authService.adminLogin({ email, password });
      storeAdminSession({ user: data?.user, sessionToken: data?.sessionToken });
      setAdminSnapshot(readAdminSnapshot());
      setAuthNotice(data?.message || "Admin login successful.");
    } catch (error) {
      setAuthError(error.message || "Admin login failed.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    const snapshot = readAdminSnapshot();
    try {
      if (snapshot.sessionToken) {
        await authService.adminLogout({ sessionToken: snapshot.sessionToken });
      }
    } catch {
      // Ignore remote logout error and clear local session.
    } finally {
      clearAdminSession();
      setAdminSnapshot(readAdminSnapshot());
      setMode("login");
      setActiveSection("dashboard");
      setDashboard(DEFAULT_DASHBOARD);
      setUserDirectory(DEFAULT_USER_DIRECTORY);
      setKycQueue(DEFAULT_KYC_QUEUE);
      setDepositCenter(DEFAULT_DEPOSIT_CENTER);
      setLumCenter(DEFAULT_LUM_CENTER);
      setBinaryCenter(DEFAULT_BINARY_CENTER);
      clearAuthFeedback();
    }
  };

  const canShowDashboard = useMemo(
    () => authReady && adminSnapshot.isLoggedIn && adminSnapshot.sessionToken,
    [adminSnapshot.isLoggedIn, adminSnapshot.sessionToken, authReady],
  );

  if (!canShowDashboard) {
    return (
      <AdminAuthPage
        mode={mode}
        onModeChange={(nextMode) => {
          setMode(nextMode);
          clearAuthFeedback();
        }}
        onLogin={handleLogin}
        onSignup={handleSignup}
        onBackHome={onBackHome}
        onOpenUserAuth={onOpenUserAuth}
        submitting={authSubmitting || !authReady}
        error={authError}
        notice={authNotice}
      />
    );
  }

  return (
    <AdminDashboardPage
      adminUser={adminSnapshot.user}
      loading={dashboardLoading}
      error={dashboardError}
      dashboard={dashboard}
      userDirectory={userDirectory}
      kycQueue={kycQueue}
      depositCenter={depositCenter}
      lumCenter={lumCenter}
      binaryCenter={binaryCenter}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      onRefresh={loadAdminData}
      onLogout={handleLogout}
      onBackHome={onBackHome}
      onOpenUserAuth={onOpenUserAuth}
      onFetchUserDetail={fetchUserDetail}
      onDeleteUser={deleteUserById}
      onReviewKycRequest={reviewKycRequest}
      onUpsertDepositAsset={upsertDepositAsset}
      onDeleteDepositAsset={deleteDepositAsset}
      onReviewDepositRequest={reviewDepositRequest}
      onCreateLumPlan={createLumPlan}
      onUpdateLumPlan={updateLumPlan}
      onDeleteLumPlan={deleteLumPlan}
      onToggleLumPlanStatus={toggleLumPlanStatus}
      onSaveLumPlanContent={saveLumPlanContent}
      onReviewLumInvestment={reviewLumInvestment}
      onForceSettleLumInvestment={forceSettleLumInvestment}
      onCreateBinaryPair={createBinaryPair}
      onUpdateBinaryPair={updateBinaryPair}
      onDeleteBinaryPair={deleteBinaryPair}
      onToggleBinaryPairStatus={toggleBinaryPairStatus}
      onSaveBinaryPeriodRule={saveBinaryPeriodRule}
      onSettleBinaryTrade={settleBinaryTrade}
      onCancelBinaryTrade={cancelBinaryTrade}
      onSaveBinaryEngineSettings={saveBinaryEngineSettings}
      onPushBinaryManualTick={pushBinaryManualTick}
    />
  );
}
