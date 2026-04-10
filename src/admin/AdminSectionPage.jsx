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
    />
  );
}
