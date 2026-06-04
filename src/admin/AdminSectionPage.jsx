import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    const status = String(item.status || "pending").toLowerCase();
    const amountSource =
      status === "approved"
        ? item.creditedAmountUsd ?? item.submittedAmountUsd ?? item.amountUsd
        : item.submittedAmountUsd ?? item.amountUsd;
    const amountUsd = toNumber(amountSource, 0).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

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

function buildApprovalSpotlight(depositPayload, kycPayload, supportSummary = {}, withdrawPayload = {}) {
  const depositRows = Array.isArray(depositPayload?.requests) ? depositPayload.requests : [];
  const kycRows = Array.isArray(kycPayload?.requests) ? kycPayload.requests : [];

  const pendingDepositRows = depositRows
    .filter((item) => String(item?.status || "").toLowerCase() === "pending")
    .slice(0, 4)
    .map((item) => ({
      id: `deposit-${item.requestId}`,
      type: "Deposit Approval",
      title: `${item.accountEmail || item.userId} • ${item.assetSymbol}`,
      subtitle: `$${toNumber(item.submittedAmountUsd ?? item.amountUsd, 0).toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })} pending review`,
      route: "depositCenter",
    }));

  const pendingKycRows = kycRows
    .filter((item) => String(item?.status || "").toLowerCase() === "pending")
    .slice(0, 4)
    .map((item) => ({
      id: `kyc-${item.requestId}`,
      type: "KYC Review",
      title: `${item.accountEmail || item.userId}`,
      subtitle: `${item.certification || "ID"} document submitted`,
      route: "kycReview",
    }));

  const pendingSupportTickets = toNumber(supportSummary?.pendingAdminTickets, 0);
  const unreadSupport = toNumber(supportSummary?.unreadForAdmin, 0);
  const supportItems =
    pendingSupportTickets > 0 || unreadSupport > 0
      ? [
          {
            id: "support-backlog",
            type: "Support Inbox",
            title: `${pendingSupportTickets} pending admin tickets`,
            subtitle: `${unreadSupport} unread messages need response`,
            route: "supportCenter",
          },
        ]
      : [];

  const items = [...pendingDepositRows, ...pendingKycRows, ...supportItems].slice(0, 8);
  const pendingWithdrawalRequests = toNumber(
    withdrawPayload?.stats?.pending,
    toNumber(withdrawPayload?.stats?.pendingRequests, toNumber(withdrawPayload?.stats?.pendingWithdrawals, 0)),
  );

  return {
    pendingDepositRequests: toNumber(depositPayload?.stats?.pendingRequests, pendingDepositRows.length),
    pendingWithdrawalRequests,
    pendingKycRequests: toNumber(kycPayload?.stats?.pendingKycRequests, pendingKycRows.length),
    pendingSupportTickets,
    unreadSupport,
    totalPendingApprovals:
      toNumber(depositPayload?.stats?.pendingRequests, pendingDepositRows.length) +
      toNumber(kycPayload?.stats?.pendingKycRequests, pendingKycRows.length) +
      pendingWithdrawalRequests +
      toNumber(supportSummary?.pendingAdminTickets, 0),
    items,
  };
}

function buildDashboardModel(usersPayload, depositPayload, kycPayload, supportSummary = {}, withdrawPayload = {}) {
  const userStats = usersPayload?.stats || {};
  const depositStats = depositPayload?.stats || {};
  const kycStats = kycPayload?.stats || {};
  const withdrawStats = withdrawPayload?.stats || {};

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
    approvals: buildApprovalSpotlight(depositPayload, kycPayload, supportSummary, withdrawPayload),
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
  const allUsers = (Array.isArray(usersPayload?.users) ? usersPayload.users : [])
    .map((user) => ({
      ...user,
      totalBalanceUsd: toNumber(user.totalBalanceUsd, 0),
      isActiveSession: Boolean(user.isActiveSession),
    }));
  const admins = allUsers.filter((user) => {
    const role = String(user?.accountRole || "").toLowerCase();
    return role === "admin" || role === "super_admin";
  });
  const users = allUsers.filter((user) => {
    const role = String(user?.accountRole || "").toLowerCase();
    return role !== "admin" && role !== "super_admin";
  });

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
    admins,
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
      submittedAmountUsd: toNumber(request.submittedAmountUsd ?? request.amountUsd, 0),
      creditedAmountUsd: toNumber(request.creditedAmountUsd, 0),
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

function buildBinaryCenterModel(summaryPayload, categoriesPayload, pairsPayload, rulesPayload, tradesPayload, settingsPayload) {
  const summaryRaw = summaryPayload?.summary || summaryPayload?.data || {};
  const categoriesRaw = Array.isArray(categoriesPayload?.categories)
    ? categoriesPayload.categories
    : Array.isArray(categoriesPayload?.data)
      ? categoriesPayload.data
      : Array.isArray(pairsPayload?.categories)
        ? pairsPayload.categories
        : [];
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
    categories: categoriesRaw.map((item) => ({
      ...item,
      categoryId: toNumber(item.categoryId, 0),
      displaySortOrder: toNumber(item.displaySortOrder, 0),
      isEnabled: Boolean(item.isEnabled),
    })),
    pairs: pairsRaw.map((item) => ({
      ...item,
      pairId: toNumber(item.pairId, 0),
      currentPrice: toNumber(item.currentPrice, 0),
      previousPrice: toNumber(item.previousPrice, 0),
      pricePrecision: toNumber(item.pricePrecision, 2),
      isEnabled: Boolean(item.isEnabled),
      isFeatured: Boolean(item.isFeatured),
      categoryId: item.categoryId === null || item.categoryId === undefined ? null : toNumber(item.categoryId, 0),
      categoryName: String(item.categoryName || ""),
      categorySlug: String(item.categorySlug || ""),
      marketSymbol: String(item.marketSymbol || ""),
      iconImageUrl: String(item.iconImageUrl || ""),
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

function buildTransactionCenterModel(
  summaryPayload,
  settingsPayload,
  convertPairsPayload,
  convertOrdersPayload,
  spotPairsPayload,
  spotOrdersPayload,
  auditPayload,
) {
  return {
    summary: summaryPayload?.summary || {},
    settings: settingsPayload?.settings || {},
    convertPairs: Array.isArray(convertPairsPayload?.pairs) ? convertPairsPayload.pairs : [],
    convertOrders: Array.isArray(convertOrdersPayload?.orders) ? convertOrdersPayload.orders : [],
    spotPairs: Array.isArray(spotPairsPayload?.pairs) ? spotPairsPayload.pairs : [],
    spotOrders: Array.isArray(spotOrdersPayload?.orders) ? spotOrdersPayload.orders : [],
    auditLogs: Array.isArray(auditPayload?.logs) ? auditPayload.logs : [],
  };
}

function buildAssetCenterModel(
  dashboardPayload,
  walletsPayload,
  withdrawalsPayload,
  transfersPayload,
  conversionsPayload,
  settingsPayload,
  auditPayload,
) {
  return {
    dashboardSummary: dashboardPayload || {},
    walletDesk: walletsPayload || { rows: [], pagination: { page: 1, limit: 30, total: 0, hasMore: false } },
    walletDetail: {},
    withdrawals: withdrawalsPayload || { rows: [], pagination: { page: 1, limit: 40, total: 0, hasMore: false } },
    transfers: transfersPayload || { rows: [], pagination: { page: 1, limit: 50, total: 0, hasMore: false } },
    conversions: conversionsPayload || { rows: [], pagination: { page: 1, limit: 50, total: 0, hasMore: false } },
    settings: settingsPayload?.settings || {},
    auditLogs: auditPayload || { rows: [], pagination: { page: 1, limit: 50, total: 0, hasMore: false } },
  };
}

function buildSupportCenterModel(summaryPayload, ticketsPayload, auditPayload, livePayload) {
  return {
    summary: summaryPayload?.summary || {},
    tickets: ticketsPayload || { rows: [], pagination: { page: 1, limit: 30, total: 0, hasMore: false } },
    ticketDetail: {},
    auditLogs: auditPayload || { rows: [], pagination: { page: 1, limit: 50, total: 0, hasMore: false } },
    live: livePayload || {
      summary: {},
      rows: [],
      pagination: { page: 1, limit: 80, total: 0, hasMore: false },
    },
    liveDetail: {},
  };
}

function buildWebContentModel(payload) {
  const content = payload?.content || {};
  return {
    content,
    updatedAt: String(payload?.updatedAt || ""),
    updatedBy: String(payload?.updatedBy || ""),
    summary: {
      features: Array.isArray(content?.sections?.features?.items) ? content.sections.features.items.length : 0,
      faqs: Array.isArray(content?.sections?.faq?.items) ? content.sections.faq.items.length : 0,
      assets: Array.isArray(content?.market?.assets) ? content.market.assets.length : 0,
    },
  };
}

function buildLoanCenterModel(pagePayload = {}, settingsPayload = {}) {
  const page = pagePayload || {};
  const settings = settingsPayload && Object.keys(settingsPayload).length ? settingsPayload : page?.feature || {};
  return {
    page: {
      config: page.config || {},
      isActive: page.isActive !== false,
      updatedAt: String(page.updatedAt || ""),
      updatedBy: String(page.updatedBy || ""),
      feature: page.feature || settings || {},
    },
    settings: settings || {},
  };
}

function buildNoticeCenterModel(payload) {
  const items = Array.isArray(payload?.items)
    ? payload.items.map((item) => ({
        noticeId: toNumber(item.noticeId, 0),
        title: String(item.title || ""),
        message: String(item.message || ""),
        severity: String(item.severity || "info"),
        priority: toNumber(item.priority, 50),
        startsAt: String(item.startsAt || ""),
        expiresAt: String(item.expiresAt || ""),
        isActive: Boolean(item.isActive),
        isDismissible: item.isDismissible !== false,
        targetMode: String(item.targetMode || "all"),
        targetKycStatus: String(item.targetKycStatus || ""),
        targetUserIds: Array.isArray(item.targetUserIds) ? item.targetUserIds : [],
        targetSummary: String(item.targetSummary || ""),
        createdBy: String(item.createdBy || ""),
        updatedBy: String(item.updatedBy || ""),
        createdAt: String(item.createdAt || ""),
        updatedAt: String(item.updatedAt || ""),
      }))
    : [];

  const active = items.filter((item) => item.isActive).length;
  const critical = items.filter((item) => String(item.severity || "").toLowerCase() === "critical").length;
  const pagination = payload?.pagination || {};
  const total = toNumber(pagination.total, items.length);

  return {
    items,
    pagination: {
      page: toNumber(pagination.page, 1),
      limit: toNumber(pagination.limit, Math.max(items.length, 1)),
      total,
      totalPages: toNumber(pagination.totalPages, 1),
      hasMore: Boolean(pagination.hasMore),
    },
    stats: {
      total,
      active,
      critical,
    },
    filters: payload?.filters || {},
  };
}

function buildLaunchpadCenterModel(summaryPayload, launchesPayload, settingsPayload, auditPayload) {
  return {
    summary: summaryPayload || {},
    launches: Array.isArray(launchesPayload?.launches) ? launchesPayload.launches : [],
    settings: settingsPayload?.settings || {},
    audit: auditPayload || { logs: [], page: 1, limit: 50, total: 0 },
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
  approvals: {
    pendingDepositRequests: 0,
    pendingKycRequests: 0,
    pendingSupportTickets: 0,
    unreadSupport: 0,
    totalPendingApprovals: 0,
    items: [],
  },
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
  categories: [],
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

const DEFAULT_TRANSACTION_CENTER = {
  summary: {
    totalConvertPairs: 0,
    enabledConvertPairs: 0,
    totalSpotPairs: 0,
    enabledSpotPairs: 0,
    totalConvertOrders: 0,
    completedConvertOrders: 0,
    failedConvertOrders: 0,
    cancelledConvertOrders: 0,
    totalConvertVolume: 0,
    totalConvertFee: 0,
    totalSpotOrders: 0,
    openSpotOrders: 0,
    filledSpotOrders: 0,
    cancelledSpotOrders: 0,
    failedSpotOrders: 0,
    totalSpotVolume: 0,
    totalSpotFee: 0,
    topPairs: [],
    topUsers: [],
  },
  settings: {},
  convertPairs: [],
  convertOrders: [],
  spotPairs: [],
  spotOrders: [],
  auditLogs: [],
};

const DEFAULT_ASSET_CENTER = {
  dashboardSummary: {},
  walletDesk: { rows: [], pagination: { page: 1, limit: 30, total: 0, hasMore: false } },
  walletDetail: {},
  withdrawals: { rows: [], pagination: { page: 1, limit: 40, total: 0, hasMore: false } },
  transfers: { rows: [], pagination: { page: 1, limit: 50, total: 0, hasMore: false } },
  conversions: { rows: [], pagination: { page: 1, limit: 50, total: 0, hasMore: false } },
  settings: {},
  auditLogs: { rows: [], pagination: { page: 1, limit: 50, total: 0, hasMore: false } },
};

const DEFAULT_SUPPORT_CENTER = {
  summary: {},
  tickets: { rows: [], pagination: { page: 1, limit: 30, total: 0, hasMore: false } },
  ticketDetail: {},
  auditLogs: { rows: [], pagination: { page: 1, limit: 50, total: 0, hasMore: false } },
  live: { summary: {}, rows: [], pagination: { page: 1, limit: 80, total: 0, hasMore: false } },
  liveDetail: {},
};

const DEFAULT_WEB_CONTENT = {
  content: {},
  updatedAt: "",
  updatedBy: "",
  summary: {
    features: 0,
    faqs: 0,
    assets: 0,
  },
};

const DEFAULT_LOAN_CENTER = {
  page: {
    config: {},
    isActive: true,
    updatedAt: "",
    updatedBy: "",
    feature: {},
  },
  settings: {},
};

const DEFAULT_NOTICE_CENTER = {
  items: [],
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    hasMore: false,
  },
  stats: {
    total: 0,
    active: 0,
    critical: 0,
  },
  filters: {
    status: "all",
    targetMode: "all",
    severity: "all",
    keyword: "",
  },
};

const DEFAULT_LAUNCHPAD_CENTER = {
  summary: {},
  launches: [],
  settings: {},
  audit: { logs: [], page: 1, limit: 50, total: 0 },
};

const ADMIN_AUTO_REFRESH_MS = 120000;

export default function AdminSectionPage({ authService, onBackHome, onOpenUserAuth, requireFreshLogin = false }) {
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
  const [transactionCenter, setTransactionCenter] = useState(DEFAULT_TRANSACTION_CENTER);
  const [assetCenter, setAssetCenter] = useState(DEFAULT_ASSET_CENTER);
  const [supportCenter, setSupportCenter] = useState(DEFAULT_SUPPORT_CENTER);
  const [webContent, setWebContent] = useState(DEFAULT_WEB_CONTENT);
  const [loanCenter, setLoanCenter] = useState(DEFAULT_LOAN_CENTER);
  const [noticeCenter, setNoticeCenter] = useState(DEFAULT_NOTICE_CENTER);
  const [launchpadCenter, setLaunchpadCenter] = useState(DEFAULT_LAUNCHPAD_CENTER);
  const loadInFlightRef = useRef(false);

  const clearAuthFeedback = () => {
    setAuthError("");
    setAuthNotice("");
  };

  useEffect(() => {
    if (!requireFreshLogin) {
      return;
    }

    clearAdminSession();
    setAdminSnapshot(readAdminSnapshot());
    setAuthReady(true);
    setMode("login");
    setActiveSection("dashboard");
  }, [requireFreshLogin]);

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

  const loadAdminData = useCallback(async ({ force = false } = {}) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      return;
    }
    if (loadInFlightRef.current && !force) {
      return;
    }

    loadInFlightRef.current = true;
    setDashboardLoading(true);
    setDashboardError("");
    try {
      const [usersPayload, assetsPayload, depositPayload, kycPayload, baseSupportSummaryPayload, assetsWithdrawalsPayload] = await Promise.all([
        authService.adminListUsers({ sessionToken: snapshot.sessionToken, kycStatus: "", includeAdmins: true }),
        authService.adminListDepositAssets({ sessionToken: snapshot.sessionToken }),
        authService.adminListDepositRequests({ sessionToken: snapshot.sessionToken, includeSensitiveMedia: false }),
        authService.adminListKycRequests({ sessionToken: snapshot.sessionToken, includeSensitiveMedia: false }),
        authService.adminGetSupportDashboardSummary({ sessionToken: snapshot.sessionToken }),
        authService.adminListAssetsWithdrawals({ sessionToken: snapshot.sessionToken, status: "all",
          page: 1,
          limit: 1,
        }),
      ]);
      setDashboard(
        buildDashboardModel(
          usersPayload,
          depositPayload,
          kycPayload,
          baseSupportSummaryPayload?.summary || baseSupportSummaryPayload || {},
          assetsWithdrawalsPayload
        ),
      );
      setUserDirectory(buildUserDirectoryModel(usersPayload));
      setKycQueue(buildKycQueueModel(kycPayload));
      setDepositCenter(buildDepositCenterModel(assetsPayload, depositPayload));
      setSupportCenter((prev) => ({
        ...prev,
        summary: baseSupportSummaryPayload?.summary || baseSupportSummaryPayload || {},
      }));

      if (activeSection === "kycReview") {
        try {
          const kycDetailPayload = await authService.adminListKycRequests({
            sessionToken: snapshot.sessionToken,
            includeSensitiveMedia: true,
          });
          setKycQueue(buildKycQueueModel(kycDetailPayload));
        } catch {
          // Keep lightweight queue payload.
        }
      }

      if (activeSection === "depositCenter") {
        try {
          const depositDetailPayload = await authService.adminListDepositRequests({
            sessionToken: snapshot.sessionToken,
            includeSensitiveMedia: true,
          });
          setDepositCenter(buildDepositCenterModel(assetsPayload, depositDetailPayload));
        } catch {
          // Keep lightweight request payload.
        }
      }

      if (activeSection === "lumCenter") {
        try {
        const [lumSummaryPayload, lumPlansPayload, lumInvestmentsPayload] = await Promise.all([
          authService.adminGetLumDashboardSummary({ sessionToken: snapshot.sessionToken }),
          authService.adminListLumPlans({ sessionToken: snapshot.sessionToken, category: "all", status: "all" }),
          authService.adminListLumInvestments({
            sessionToken: snapshot.sessionToken,
            status: "all",
            category: "all",
            page: 1,
            limit: 120,
            keyword: "",
          }),
        ]);
        setLumCenter(buildLumCenterModel(lumSummaryPayload, lumPlansPayload, lumInvestmentsPayload));
      } catch {
        setLumCenter(DEFAULT_LUM_CENTER);
      }
      }

      if (activeSection === "binaryCenter") {
        try {
        const [binarySummaryPayload, binaryCategoriesPayload, binaryPairsPayload, binaryRulesPayload, binaryTradesPayload, binarySettingsPayload] = await Promise.all([
          authService.adminGetBinaryDashboardSummary({ sessionToken: snapshot.sessionToken }),
          authService.adminListBinaryCategories({ sessionToken: snapshot.sessionToken }),
          authService.adminListBinaryPairs({ sessionToken: snapshot.sessionToken }),
          authService.adminListBinaryPeriodRules({ sessionToken: snapshot.sessionToken }),
          authService.adminListBinaryTrades({
            sessionToken: snapshot.sessionToken,
            status: "all",
            pairId: 0,
            keyword: "",
            page: 1,
            limit: 150,
          }),
          authService.adminGetBinaryEngineSettings({ sessionToken: snapshot.sessionToken }),
        ]);
        setBinaryCenter(
          buildBinaryCenterModel(
            binarySummaryPayload,
            binaryCategoriesPayload,
            binaryPairsPayload,
            binaryRulesPayload,
            binaryTradesPayload,
            binarySettingsPayload,
          ),
        );
      } catch {
        setBinaryCenter(DEFAULT_BINARY_CENTER);
      }
      }

      if (activeSection === "transactionCenter") {
        try {
        const [
          transactionSummaryPayload,
          transactionSettingsPayload,
          transactionConvertPairsPayload,
          transactionConvertOrdersPayload,
          transactionSpotPairsPayload,
          transactionSpotOrdersPayload,
          transactionAuditPayload,
        ] = await Promise.all([
          authService.adminGetTransactionDashboardSummary({ sessionToken: snapshot.sessionToken }),
          authService.adminGetTransactionEngineSettings({ sessionToken: snapshot.sessionToken }),
          authService.adminListTransactionConvertPairs({ sessionToken: snapshot.sessionToken }),
          authService.adminListTransactionConvertOrders({
            sessionToken: snapshot.sessionToken,
            status: "all",
            pairCode: "",
            userKeyword: "",
            fromDate: "",
            toDate: "",
            page: 1,
            limit: 150,
          }),
          authService.adminListTransactionSpotPairs({ sessionToken: snapshot.sessionToken }),
          authService.adminListTransactionSpotOrders({
            sessionToken: snapshot.sessionToken,
            status: "all",
            pairId: 0,
            orderType: "all",
            side: "all",
            userKeyword: "",
            fromDate: "",
            toDate: "",
            page: 1,
            limit: 200,
          }),
          authService.adminListTransactionAuditLogs({ sessionToken: snapshot.sessionToken, page: 1, limit: 200 }),
        ]);

        setTransactionCenter(
          buildTransactionCenterModel(
            transactionSummaryPayload,
            transactionSettingsPayload,
            transactionConvertPairsPayload,
            transactionConvertOrdersPayload,
            transactionSpotPairsPayload,
            transactionSpotOrdersPayload,
            transactionAuditPayload,
          ),
        );
      } catch {
        setTransactionCenter(DEFAULT_TRANSACTION_CENTER);
      }
      }

      if (activeSection === "assetCenter") {
        try {
        const [
          assetDashboardPayload,
          assetWalletsPayload,
          assetWithdrawalsPayload,
          assetTransfersPayload,
          assetConversionsPayload,
          assetSettingsPayload,
          assetAuditPayload,
        ] = await Promise.all([
          authService.adminGetAssetsDashboardSummary({ sessionToken: snapshot.sessionToken }),
          authService.adminListAssetsWallets({
            sessionToken: snapshot.sessionToken,
            wallet: "all",
            userKeyword: "",
            page: 1,
            limit: 120,
          }),
          authService.adminListAssetsWithdrawals({
            sessionToken: snapshot.sessionToken,
            status: "all",
            asset: "all",
            network: "all",
            wallet: "all",
            userKeyword: "",
            page: 1,
            limit: 150,
          }),
          authService.adminListAssetsTransfers({
            sessionToken: snapshot.sessionToken,
            status: "all",
            route: "all",
            wallet: "all",
            userKeyword: "",
            page: 1,
            limit: 150,
          }),
          authService.adminListAssetsConversions({
            sessionToken: snapshot.sessionToken,
            status: "all",
            wallet: "all",
            fromAsset: "all",
            toAsset: "all",
            userKeyword: "",
            page: 1,
            limit: 150,
          }),
          authService.adminGetAssetsSettings({ sessionToken: snapshot.sessionToken }),
          authService.adminListAssetsAuditLogs({
            sessionToken: snapshot.sessionToken,
            actionType: "all",
            keyword: "",
            page: 1,
            limit: 150,
          }),
        ]);

        setAssetCenter(
          buildAssetCenterModel(
            assetDashboardPayload,
            assetWalletsPayload,
            assetWithdrawalsPayload,
            assetTransfersPayload,
            assetConversionsPayload,
            assetSettingsPayload,
            assetAuditPayload,
          ),
        );
      } catch {
        setAssetCenter(DEFAULT_ASSET_CENTER);
      }
      }

      if (activeSection === "supportCenter") {
        try {
        const [supportSummaryPayload, supportTicketsPayload, supportAuditPayload, supportLivePayload] = await Promise.all([
          Promise.resolve(baseSupportSummaryPayload),
          authService.adminListSupportTickets({
            sessionToken: snapshot.sessionToken,
            status: "all",
            priority: "all",
            assigned: "all",
            keyword: "",
            page: 1,
            limit: 120,
          }),
          authService.adminListSupportAuditLogs({
            sessionToken: snapshot.sessionToken,
            keyword: "",
            page: 1,
            limit: 120,
          }),
          authService.adminListSupportLiveThreads({
            sessionToken: snapshot.sessionToken,
            status: "all",
            keyword: "",
            page: 1,
            limit: 120,
          }),
        ]);

        setSupportCenter((prev) => ({
          ...buildSupportCenterModel(supportSummaryPayload, supportTicketsPayload, supportAuditPayload, supportLivePayload),
          ticketDetail: prev?.ticketDetail || {},
          liveDetail: prev?.liveDetail || {},
        }));
        setDashboard(
          buildDashboardModel(
            usersPayload,
            depositPayload,
            kycPayload,
            supportSummaryPayload?.summary || supportSummaryPayload || {},
            assetsWithdrawalsPayload,
          ),
        );
      } catch {
        setSupportCenter(DEFAULT_SUPPORT_CENTER);
      }
      }

      if (activeSection === "webContent") {
        try {
        const webContentPayload = await authService.adminGetHomeContent({ sessionToken: snapshot.sessionToken });
        setWebContent(buildWebContentModel(webContentPayload));
      } catch {
        setWebContent(DEFAULT_WEB_CONTENT);
      }
      }

      if (activeSection === "loanCenter") {
        try {
          const [loanPagePayload, loanSettingsPayload] = await Promise.all([
            authService.adminGetLoanPage({ sessionToken: snapshot.sessionToken }),
            authService.adminGetLoanSettings({ sessionToken: snapshot.sessionToken }),
          ]);
          setLoanCenter(buildLoanCenterModel(loanPagePayload, loanSettingsPayload));
        } catch {
          setLoanCenter(DEFAULT_LOAN_CENTER);
        }
      }

      if (activeSection === "notifications") {
        try {
          const noticePayload = await authService.adminListNotices({
            sessionToken: snapshot.sessionToken,
            page: 1,
            limit: 120,
            status: "all",
            targetMode: "all",
            severity: "all",
            keyword: "",
          });
          setNoticeCenter(buildNoticeCenterModel(noticePayload));
        } catch {
          setNoticeCenter(DEFAULT_NOTICE_CENTER);
        }
      }

      if (activeSection === "launchpadCenter") {
        try {
          const [launchpadSummaryPayload, launchpadLaunchesPayload, launchpadSettingsPayload, launchpadAuditPayload] = await Promise.all([
            authService.adminGetLaunchpadDashboardSummary({ sessionToken: snapshot.sessionToken }),
            authService.adminListLaunchpadLaunches({
              sessionToken: snapshot.sessionToken,
              page: 1,
              limit: 120,
              status: "all",
            }),
            authService.adminGetLaunchpadSettings({ sessionToken: snapshot.sessionToken }),
            authService.adminListLaunchpadAudit({ sessionToken: snapshot.sessionToken, page: 1, limit: 200 }),
          ]);
          setLaunchpadCenter(
            buildLaunchpadCenterModel(
              launchpadSummaryPayload,
              launchpadLaunchesPayload,
              launchpadSettingsPayload,
              launchpadAuditPayload,
            ),
          );
        } catch {
          setLaunchpadCenter(DEFAULT_LAUNCHPAD_CENTER);
        }
      }
    } catch (error) {
      setDashboardError(error.message || "Could not load admin dashboard data.");
    } finally {
      loadInFlightRef.current = false;
      setDashboardLoading(false);
    }
  }, [activeSection, authService]);

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

  const updateUserById = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminUpdateUser({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
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

  const fetchKycRequestDetail = useCallback(async (requestId) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    return authService.adminGetKycRequestDetail({ sessionToken: snapshot.sessionToken, requestId });
  }, [authService]);

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

  const reviewDepositRequest = useCallback(async ({ requestId, decision, note, approvedAmountUsd }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminReviewDepositRequest({
      sessionToken: snapshot.sessionToken,
      requestId,
      decision,
      note,
      approvedAmountUsd,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const fetchDepositRequestDetail = useCallback(async (requestId) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    return authService.adminGetDepositRequestDetail({ sessionToken: snapshot.sessionToken, requestId });
  }, [authService]);

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

  const createBinaryCategory = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminCreateBinaryCategory({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data?.data || data;
  }, [authService, loadAdminData]);

  const updateBinaryCategory = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminUpdateBinaryCategory({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data?.data || data;
  }, [authService, loadAdminData]);

  const deleteBinaryCategory = useCallback(async (categoryId) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminDeleteBinaryCategory({
      sessionToken: snapshot.sessionToken,
      categoryId,
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

  const saveTransactionEngineSettings = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminSaveTransactionEngineSettings({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const createTransactionConvertPair = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminCreateTransactionConvertPair({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const updateTransactionConvertPair = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminUpdateTransactionConvertPair({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const deleteTransactionConvertPair = useCallback(async ({ pairId, note }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminDeleteTransactionConvertPair({
      sessionToken: snapshot.sessionToken,
      pairId,
      note,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const toggleTransactionConvertPairStatus = useCallback(async ({ pairId, isEnabled }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminToggleTransactionConvertPairStatus({
      sessionToken: snapshot.sessionToken,
      pairId,
      isEnabled,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const pushTransactionConvertManualRate = useCallback(async ({ pairId, manualRate }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminPushTransactionConvertManualRate({
      sessionToken: snapshot.sessionToken,
      pairId,
      manualRate,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const createTransactionSpotPair = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminCreateTransactionSpotPair({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const updateTransactionSpotPair = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminUpdateTransactionSpotPair({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const deleteTransactionSpotPair = useCallback(async ({ pairId, note }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminDeleteTransactionSpotPair({
      sessionToken: snapshot.sessionToken,
      pairId,
      note,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const toggleTransactionSpotPairStatus = useCallback(async ({ pairId, isEnabled }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminToggleTransactionSpotPairStatus({
      sessionToken: snapshot.sessionToken,
      pairId,
      isEnabled,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const cancelTransactionSpotOrder = useCallback(async ({ orderId, note }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminCancelTransactionSpotOrder({
      sessionToken: snapshot.sessionToken,
      orderId,
      note,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const forceFillTransactionSpotOrder = useCallback(async ({ orderId, executionPrice, note }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminForceFillTransactionSpotOrder({
      sessionToken: snapshot.sessionToken,
      orderId,
      executionPrice,
      note,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const pushTransactionSpotManualTick = useCallback(async ({ pairId, price }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminPushTransactionSpotManualTick({
      sessionToken: snapshot.sessionToken,
      pairId,
      price,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const saveTransactionSpotFeedSettings = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminSaveTransactionSpotFeedSettings({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const loadAssetWalletDetail = useCallback(async ({ userId, wallet = "all", type = "all", page = 1, limit = 40 }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminGetAssetsWalletDetail({
      sessionToken: snapshot.sessionToken,
      userId,
      wallet,
      type,
      page,
      limit,
    });
    setAssetCenter((prev) => ({
      ...prev,
      walletDetail: data || {},
    }));
    return data;
  }, [authService]);

  const adjustAssetWallet = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminAdjustAssetsWallet({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const freezeAssetWallet = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminFreezeAssetsWallet({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const reviewAssetWithdrawal = useCallback(async ({ withdrawalId, withdrawalRef, decision, note, approvedAmountUsd }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminReviewAssetsWithdrawal({
      sessionToken: snapshot.sessionToken,
      withdrawalId,
      withdrawalRef,
      decision,
      note,
      approvedAmountUsd,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const completeAssetWithdrawal = useCallback(async ({ withdrawalId, withdrawalRef, note, approvedAmountUsd }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminCompleteAssetsWithdrawal({
      sessionToken: snapshot.sessionToken,
      withdrawalId,
      withdrawalRef,
      note,
      approvedAmountUsd,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const saveAssetSettings = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminSaveAssetsSettings({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const loadSupportTicketDetail = useCallback(async ({ ticketRef }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminGetSupportTicketDetail({
      sessionToken: snapshot.sessionToken,
      ticketRef,
    });
    setSupportCenter((prev) => ({
      ...prev,
      ticketDetail: data || {},
    }));
    return data;
  }, [authService]);

  const loadSupportLiveThreadDetail = useCallback(async ({ threadRef }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminGetSupportLiveThreadDetail({
      sessionToken: snapshot.sessionToken,
      threadRef,
    });
    setSupportCenter((prev) => ({
      ...prev,
      liveDetail: data || {},
    }));
    return data;
  }, [authService]);

  const replySupportTicket = useCallback(async ({
    ticketRef,
    message,
    isInternalNote = false,
    attachmentFileName,
    attachmentFileData,
    attachmentMimeType,
    attachmentSizeBytes,
  }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminReplySupportTicket({
      sessionToken: snapshot.sessionToken,
      ticketRef,
      message,
      isInternalNote,
      attachmentFileName,
      attachmentFileData,
      attachmentMimeType,
      attachmentSizeBytes,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const replySupportLiveThread = useCallback(async ({
    threadRef,
    message,
    attachmentFileName,
    attachmentFileData,
    attachmentMimeType,
    attachmentSizeBytes,
  }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminReplySupportLiveThread({
      sessionToken: snapshot.sessionToken,
      threadRef,
      message,
      attachmentFileName,
      attachmentFileData,
      attachmentMimeType,
      attachmentSizeBytes,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const updateSupportTicket = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminUpdateSupportTicket({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const updateSupportLiveThread = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminUpdateSupportLiveThread({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const saveHomeContent = useCallback(async (content) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminSaveHomeContent({
      sessionToken: snapshot.sessionToken,
      content,
    });
    await loadAdminData();
    return data;
  }, [authService, loadAdminData]);

  const saveLoanPage = useCallback(async ({ config, isActive }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminUpdateLoanPage({
      sessionToken: snapshot.sessionToken,
      config,
      isActive,
    });
    const settingsPayload = await authService.adminGetLoanSettings({ sessionToken: snapshot.sessionToken });
    setLoanCenter(buildLoanCenterModel(data, settingsPayload));
    return data;
  }, [authService]);

  const saveLoanSettings = useCallback(async ({ fullFeatureEnabledAdmin, note }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminUpdateLoanSettings({
      sessionToken: snapshot.sessionToken,
      fullFeatureEnabledAdmin,
      note,
    });
    setLoanCenter((prev) => buildLoanCenterModel(prev.page, data));
    return data;
  }, [authService]);

  const createNotice = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminCreateNotice({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData({ force: true });
    return data;
  }, [authService, loadAdminData]);

  const updateNotice = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminUpdateNoticeV2({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData({ force: true });
    return data;
  }, [authService, loadAdminData]);

  const updateNoticeStatus = useCallback(async ({ noticeId, status, isActive }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminUpdateNoticeStatus({
      sessionToken: snapshot.sessionToken,
      noticeId,
      status,
      isActive,
    });
    await loadAdminData({ force: true });
    return data;
  }, [authService, loadAdminData]);

  const quickPublishNotice = useCallback(async (message) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminUpdateNotice({
      sessionToken: snapshot.sessionToken,
      message,
    });
    await loadAdminData({ force: true });
    return data;
  }, [authService, loadAdminData]);

  const createLaunchpadLaunch = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminCreateLaunchpadLaunch({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData({ force: true });
    return data;
  }, [authService, loadAdminData]);

  const updateLaunchpadLaunch = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminUpdateLaunchpadLaunch({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData({ force: true });
    return data;
  }, [authService, loadAdminData]);

  const updateLaunchpadLaunchStatus = useCallback(async ({ launchId, launchRef, status }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminUpdateLaunchpadLaunchStatus({
      sessionToken: snapshot.sessionToken,
      launchId,
      launchRef,
      status,
    });
    await loadAdminData({ force: true });
    return data;
  }, [authService, loadAdminData]);

  const saveLaunchpadTiers = useCallback(async ({ launchId, launchRef, tiers }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminSaveLaunchpadTiers({
      sessionToken: snapshot.sessionToken,
      launchId,
      launchRef,
      tiers,
    });
    await loadAdminData({ force: true });
    return data;
  }, [authService, loadAdminData]);

  const saveLaunchpadSettings = useCallback(async (payload) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminSaveLaunchpadSettings({
      sessionToken: snapshot.sessionToken,
      ...payload,
    });
    await loadAdminData({ force: true });
    return data;
  }, [authService, loadAdminData]);

  const listLaunchpadOrders = useCallback(async ({ launchId, launchRef, status = "all", page = 1, limit = 120 }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    return authService.adminListLaunchpadOrders({
      sessionToken: snapshot.sessionToken,
      launchId,
      launchRef,
      status,
      page,
      limit,
    });
  }, [authService]);

  const releaseLaunchpadOrders = useCallback(async ({ launchId, launchRef, note = "" }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminReleaseLaunchpadOrders({
      sessionToken: snapshot.sessionToken,
      launchId,
      launchRef,
      note,
    });
    await loadAdminData({ force: true });
    return data;
  }, [authService, loadAdminData]);

  const runLaunchpadMarketSync = useCallback(async ({ launchId, launchRef, enableSpot = false, enableConvert = false, enableBinary = false }) => {
    const snapshot = readAdminSnapshot();
    if (!snapshot.sessionToken) {
      throw new Error("Admin session expired. Please login again.");
    }
    const data = await authService.adminRunLaunchpadMarketSync({
      sessionToken: snapshot.sessionToken,
      launchId,
      launchRef,
      enableSpot,
      enableConvert,
      enableBinary,
    });
    await loadAdminData({ force: true });
    return data;
  }, [authService, loadAdminData]);

  useEffect(() => {
    refreshAdminSession();
  }, [refreshAdminSession]);

  useEffect(() => {
    if (adminSnapshot.isLoggedIn && adminSnapshot.sessionToken) {
      loadAdminData();
    }
  }, [adminSnapshot.isLoggedIn, adminSnapshot.sessionToken, loadAdminData]);

  useEffect(() => {
    if (!authReady || !adminSnapshot.isLoggedIn || !adminSnapshot.sessionToken) {
      return undefined;
    }

    if (activeSection !== "dashboard") {
      return undefined;
    }

    const refreshInterval = window.setInterval(() => {
      loadAdminData();
    }, ADMIN_AUTO_REFRESH_MS);

    return () => {
      window.clearInterval(refreshInterval);
    };
  }, [activeSection, adminSnapshot.isLoggedIn, adminSnapshot.sessionToken, authReady, loadAdminData]);

  const handleSignup = async ({ name, email, phone, password, adminSignupKey }) => {
    clearAuthFeedback();
    setAuthSubmitting(true);
    try {
      const data = await authService.adminSignup({ name, email, phone, password, adminSignupKey });
      storeAdminSession({ user: data?.user, sessionToken: data?.sessionToken });
      setAdminSnapshot(readAdminSnapshot());
      setActiveSection("dashboard");
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
      setActiveSection("dashboard");
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
      setTransactionCenter(DEFAULT_TRANSACTION_CENTER);
      setAssetCenter(DEFAULT_ASSET_CENTER);
      setSupportCenter(DEFAULT_SUPPORT_CENTER);
      setWebContent(DEFAULT_WEB_CONTENT);
      setNoticeCenter(DEFAULT_NOTICE_CENTER);
      setLaunchpadCenter(DEFAULT_LAUNCHPAD_CENTER);
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
      transactionCenter={transactionCenter}
      assetCenter={assetCenter}
      supportCenter={supportCenter}
      webContent={webContent}
      loanCenter={loanCenter}
      noticeCenter={noticeCenter}
      launchpadCenter={launchpadCenter}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      onRefresh={loadAdminData}
      onLogout={handleLogout}
      onBackHome={onBackHome}
      onOpenUserAuth={onOpenUserAuth}
      onFetchUserDetail={fetchUserDetail}
      onUpdateUser={updateUserById}
      onDeleteUser={deleteUserById}
      onReviewKycRequest={reviewKycRequest}
      onFetchKycRequestDetail={fetchKycRequestDetail}
      onUpsertDepositAsset={upsertDepositAsset}
      onDeleteDepositAsset={deleteDepositAsset}
      onReviewDepositRequest={reviewDepositRequest}
      onFetchDepositRequestDetail={fetchDepositRequestDetail}
      onCreateLumPlan={createLumPlan}
      onUpdateLumPlan={updateLumPlan}
      onDeleteLumPlan={deleteLumPlan}
      onToggleLumPlanStatus={toggleLumPlanStatus}
      onSaveLumPlanContent={saveLumPlanContent}
      onReviewLumInvestment={reviewLumInvestment}
      onForceSettleLumInvestment={forceSettleLumInvestment}
      onCreateBinaryCategory={createBinaryCategory}
      onUpdateBinaryCategory={updateBinaryCategory}
      onDeleteBinaryCategory={deleteBinaryCategory}
      onCreateBinaryPair={createBinaryPair}
      onUpdateBinaryPair={updateBinaryPair}
      onDeleteBinaryPair={deleteBinaryPair}
      onToggleBinaryPairStatus={toggleBinaryPairStatus}
      onSaveBinaryPeriodRule={saveBinaryPeriodRule}
      onSettleBinaryTrade={settleBinaryTrade}
      onCancelBinaryTrade={cancelBinaryTrade}
      onSaveBinaryEngineSettings={saveBinaryEngineSettings}
      onPushBinaryManualTick={pushBinaryManualTick}
      onSaveTransactionEngineSettings={saveTransactionEngineSettings}
      onCreateTransactionConvertPair={createTransactionConvertPair}
      onUpdateTransactionConvertPair={updateTransactionConvertPair}
      onDeleteTransactionConvertPair={deleteTransactionConvertPair}
      onToggleTransactionConvertPairStatus={toggleTransactionConvertPairStatus}
      onPushTransactionConvertManualRate={pushTransactionConvertManualRate}
      onCreateTransactionSpotPair={createTransactionSpotPair}
      onUpdateTransactionSpotPair={updateTransactionSpotPair}
      onDeleteTransactionSpotPair={deleteTransactionSpotPair}
      onToggleTransactionSpotPairStatus={toggleTransactionSpotPairStatus}
      onCancelTransactionSpotOrder={cancelTransactionSpotOrder}
      onForceFillTransactionSpotOrder={forceFillTransactionSpotOrder}
      onPushTransactionSpotManualTick={pushTransactionSpotManualTick}
      onSaveTransactionSpotFeedSettings={saveTransactionSpotFeedSettings}
      onLoadAssetWalletDetail={loadAssetWalletDetail}
      onAdjustAssetWallet={adjustAssetWallet}
      onFreezeAssetWallet={freezeAssetWallet}
      onReviewAssetWithdrawal={reviewAssetWithdrawal}
      onCompleteAssetWithdrawal={completeAssetWithdrawal}
      onSaveAssetSettings={saveAssetSettings}
      onLoadSupportTicketDetail={loadSupportTicketDetail}
      onReplySupportTicket={replySupportTicket}
      onUpdateSupportTicket={updateSupportTicket}
      onLoadSupportLiveThreadDetail={loadSupportLiveThreadDetail}
      onReplySupportLiveThread={replySupportLiveThread}
      onUpdateSupportLiveThread={updateSupportLiveThread}
      onSaveHomeContent={saveHomeContent}
      onSaveLoanPage={saveLoanPage}
      onSaveLoanSettings={saveLoanSettings}
      onCreateNotice={createNotice}
      onUpdateNotice={updateNotice}
      onUpdateNoticeStatus={updateNoticeStatus}
      onQuickPublishNotice={quickPublishNotice}
      onCreateLaunchpadLaunch={createLaunchpadLaunch}
      onUpdateLaunchpadLaunch={updateLaunchpadLaunch}
      onUpdateLaunchpadLaunchStatus={updateLaunchpadLaunchStatus}
      onSaveLaunchpadTiers={saveLaunchpadTiers}
      onSaveLaunchpadSettings={saveLaunchpadSettings}
      onListLaunchpadOrders={listLaunchpadOrders}
      onReleaseLaunchpadOrders={releaseLaunchpadOrders}
      onRunLaunchpadMarketSync={runLaunchpadMarketSync}
    />
  );
}
//solved
