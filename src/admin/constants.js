export const ADMIN_STORAGE_KEYS = {
  user: "cryptobot2_admin_user",
  session: "cryptobot2_admin_session",
};

export const ADMIN_SIDEBAR_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: "fa-chart-line" },
  { key: "users", label: "User Management", icon: "fa-users" },
  { key: "kycReview", label: "KYC Review & Approvals", icon: "fa-id-card" },
  { key: "depositCenter", label: "Deposit Management", icon: "fa-coins" },
  { key: "lumCenter", label: "LUM Management", icon: "fa-layer-group" },
  { key: "binaryCenter", label: "Binary Management", icon: "fa-chart-simple" },
  { key: "transactionCenter", label: "Transaction Management", icon: "fa-right-left" },
  { key: "assetCenter", label: "Asset Management", icon: "fa-wallet" },
  { key: "bots", label: "Bot Management", icon: "fa-robot" },
  { key: "trades", label: "Trades & Orders", icon: "fa-arrow-trend-up" },
  { key: "strategies", label: "Strategies", icon: "fa-brain" },
  { key: "wallet", label: "Wallet & Finance", icon: "fa-wallet" },
  { key: "exchange", label: "Exchange Integrations", icon: "fa-link" },
  { key: "notifications", label: "Notifications", icon: "fa-bell" },
  { key: "logs", label: "Logs & Monitoring", icon: "fa-clipboard-list" },
  { key: "settings", label: "Security & Settings", icon: "fa-shield-halved" },
];

export const STATIC_BOT_PERFORMANCE = [
  { bot: "BTC-001", profit: 18200, loss: 2900 },
  { bot: "ETH-002", profit: 13800, loss: 2600 },
  { bot: "SOL-003", profit: 22100, loss: 3800 },
  { bot: "ADA-004", profit: 9500, loss: 1800 },
  { bot: "BNB-005", profit: 16400, loss: 3200 },
];

export const STATIC_STRATEGY_DISTRIBUTION = [
  { name: "Scalping", value: 31, color: "#3b82f6" },
  { name: "Grid Trading", value: 24, color: "#8b5cf6" },
  { name: "DCA", value: 19, color: "#22c55e" },
  { name: "Arbitrage", value: 14, color: "#f59e0b" },
  { name: "Momentum", value: 12, color: "#ef4444" },
];

export const USER_MANAGEMENT_TABS = [
  { key: "all", label: "All Users" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
  { key: "pendingKyc", label: "Pending KYC" },
];

export const KYC_REVIEW_TABS = [
  { key: "all", label: "All Requests" },
  { key: "pending", label: "Pending" },
  { key: "authenticated", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

export const DEFAULT_ACTIVITY_FEED = [
  { id: "fallback-1", text: "BTC/USDT long closed at $67,420", tone: "success", at: "2m ago" },
  { id: "fallback-2", text: "Bot ETH-002 restarted successfully", tone: "info", at: "5m ago" },
  { id: "fallback-3", text: "High volatility detected on SOL/USDT", tone: "warn", at: "9m ago" },
  { id: "fallback-4", text: "ADA/USDT short stopped at loss", tone: "danger", at: "13m ago" },
  { id: "fallback-5", text: "New user registration completed", tone: "info", at: "16m ago" },
];
