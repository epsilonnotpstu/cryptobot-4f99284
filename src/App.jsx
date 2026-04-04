import { useEffect, useRef, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import PremiumDashboardPage from "./features/dashboard/PremiumDashboardPage";

const ROUTES = {
  home: "/",
  login: "/login",
  signup: "/signup",
  admin: "/admin",
  app: "/app",
};

const AUTH_CONFIG = {
  useRemote: true,
  apiBase: (import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:4000" : "")).trim(),
};
const ALLOW_EXTERNAL_API_FALLBACK = import.meta.env.VITE_ALLOW_EXTERNAL_API_FALLBACK === "true";

const AUTH_STORAGE_KEYS = {
  user: "cryptobot2_auth_user",
  session: "cryptobot2_auth_session",
  apiBase: "cryptobot2_api_base",
  nativeGoogleState: "cryptobot2_native_google_state",
  transientError: "cryptobot2_auth_transient_error",
  transientNotice: "cryptobot2_auth_transient_notice",
};

const AUTH_REQUEST_TIMEOUT_MS = 5000;
const PUBLIC_AUTH_BASE_URL = (import.meta.env.VITE_PUBLIC_AUTH_BASE_URL || "").trim().replace(/\/+$/, "");
const NATIVE_AUTH_CALLBACK_URL = (
  import.meta.env.VITE_NATIVE_AUTH_CALLBACK_URL || "cryptobotprime://auth-callback"
)
  .trim()
  .replace(/\/+$/, "");

const initialAssets = [
  { name: "Bitcoin", symbol: "BTC", price: 67234.56, change: 2.34, iconClass: "btc" },
  { name: "Ethereum", symbol: "ETH", price: 3456.78, change: 1.87, iconClass: "eth" },
  { name: "Cardano", symbol: "ADA", price: 0.4567, change: -0.23, iconClass: "ada" },
];

const features = [
  {
    icon: "fa-shield-alt",
    title: "Bank-Level Security",
    description:
      "Multi-layer security with cold storage, 2FA, and insurance coverage for your digital assets.",
  },
  {
    icon: "fa-chart-line",
    title: "Advanced Analytics",
    description:
      "Real-time market data, technical indicators, and AI-powered insights for better trading decisions.",
  },
  {
    icon: "fa-bolt",
    title: "Lightning Fast",
    description:
      "Execute trades in milliseconds with our high-performance trading engine and global infrastructure.",
  },
  {
    icon: "fa-coins",
    title: "300+ Cryptocurrencies",
    description:
      "Trade Bitcoin, Ethereum, and 300+ other cryptocurrencies with competitive fees and deep liquidity.",
  },
  {
    icon: "fa-mobile-alt",
    title: "Mobile Trading",
    description: "Secure mobile trading with verified access and instant account recovery.",
  },
  {
    icon: "fa-headset",
    title: "24/7 Support",
    description:
      "Get help anytime with our dedicated support team and comprehensive knowledge base.",
  },
];

const steps = [
  {
    icon: "fa-user-plus",
    title: "Create Your Account",
    description: "Sign up with your name, email, OTP verification, and secure password.",
  },
  {
    icon: "fa-credit-card",
    title: "Fund Your Wallet",
    description: "Deposit funds securely and track your verified account from any device.",
  },
  {
    icon: "fa-exchange-alt",
    title: "Start Trading",
    description: "Trade with pro tools, live pricing, and a protected crypto dashboard.",
  },
];

const faqs = [
  {
    question: "Is CryptoByte Pro safe and secure?",
    answer:
      "Yes, we use bank-level security, email verification, encrypted password storage, and protected account recovery.",
  },
  {
    question: "What cryptocurrencies can I trade?",
    answer:
      "You can trade over 300 cryptocurrencies including Bitcoin, Ethereum, Cardano, Solana, and more.",
  },
  {
    question: "How do I get started?",
    answer:
      "Create your account, verify your email OTP, set your password, and your 6-digit user ID will be assigned instantly.",
  },
  {
    question: "Can I reset my password?",
    answer:
      "Yes. Use forgot password, enter your email or user ID, verify OTP from your signup email, and create a new password.",
  },
  {
    question: "Can I use the platform on mobile?",
    answer:
      "Yes. The mobile app and the web login now share the same backend account system and recovery flow.",
  },
];

const footerSections = [
  { title: "Products", links: ["Spot Trading", "Futures Trading", "Margin Trading", "Staking"] },
  { title: "Company", links: ["About Us", "Careers", "Press", "Legal"] },
  { title: "Resources", links: ["Help Center", "API Documentation", "Trading Guide", "Blog"] },
  { title: "Support", links: ["Contact Us", "Submit a Request", "System Status", "Bug Bounty"] },
];

function formatPrice(price, symbol) {
  if (symbol === "ADA") {
    return `$${price.toFixed(4)}`;
  }

  return `$${price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isNativeAppRuntime() {
  if (typeof window === "undefined") {
    return false;
  }
  const hasCapacitorBridge = Boolean(window.Capacitor);
  const isNativePlatform = window.Capacitor?.isNativePlatform?.() ?? false;
  return hasCapacitorBridge && isNativePlatform;
}

function parseHashRouteState() {
  if (typeof window === "undefined") {
    return { route: ROUTES.app, query: new URLSearchParams() };
  }

  const defaultRoute = isNativeAppRuntime() ? ROUTES.app : ROUTES.home;
  const hashContent = window.location.hash.replace(/^#/, "") || defaultRoute;
  const [rawRoute, rawQuery = ""] = hashContent.split("?");
  const route = Object.values(ROUTES).includes(rawRoute) ? rawRoute : defaultRoute;
  return { route, query: new URLSearchParams(rawQuery) };
}

function getRouteFromHash() {
  return parseHashRouteState().route;
}

function goToRoute(route) {
  if (typeof window === "undefined") {
    return;
  }
  window.location.hash = route;
}

function readAuthSnapshot() {
  if (typeof window === "undefined") {
    return {
      hasAccount: false,
      isLoggedIn: false,
      name: "",
      firstName: "",
      lastName: "",
      mobile: "",
      avatarUrl: "",
      kycStatus: "pending",
      authTag: "kyc-pending",
      isKycAuthenticated: false,
      kycUpdatedAt: "",
      email: "",
      userId: "",
      sessionToken: "",
    };
  }

  let parsedUser = null;
  try {
    const rawUser = window.localStorage.getItem(AUTH_STORAGE_KEYS.user);
    parsedUser = rawUser ? JSON.parse(rawUser) : null;
  } catch {
    parsedUser = null;
  }

  const sessionToken = window.localStorage.getItem(AUTH_STORAGE_KEYS.session);
  const normalizedName = parsedUser?.name ?? "";
  const fallbackNameParts = normalizedName.trim().split(/\s+/).filter(Boolean);
  const fallbackFirstName = fallbackNameParts[0] || "";
  const fallbackLastName = fallbackNameParts.slice(1).join(" ");
  const normalizedKycStatus = (() => {
    const value = String(parsedUser?.kycStatus || "pending").toLowerCase();
    if (value === "authenticated" || value === "approved") {
      return "authenticated";
    }
    if (value === "rejected" || value === "reject") {
      return "rejected";
    }
    return "pending";
  })();
  const authTag =
    parsedUser?.authTag ||
    (normalizedKycStatus === "authenticated"
      ? "kyc-authenticated"
      : normalizedKycStatus === "rejected"
        ? "kyc-rejected"
        : "kyc-pending");

  return {
    hasAccount: Boolean(parsedUser?.email || parsedUser?.userId),
    isLoggedIn: Boolean(sessionToken),
    name: normalizedName,
    firstName: parsedUser?.firstName ?? fallbackFirstName,
    lastName: parsedUser?.lastName ?? fallbackLastName,
    mobile: parsedUser?.mobile ?? "",
    avatarUrl: parsedUser?.avatarUrl ?? "",
    kycStatus: normalizedKycStatus,
    authTag,
    isKycAuthenticated: normalizedKycStatus === "authenticated",
    kycUpdatedAt: parsedUser?.kycUpdatedAt ?? "",
    email: parsedUser?.email ?? "",
    userId: parsedUser?.userId ?? "",
    sessionToken: sessionToken ?? "",
  };
}

function storeAuthUser(user) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(user));
}

function storeSessionToken(sessionToken) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(AUTH_STORAGE_KEYS.session, sessionToken);
}

function storeApiBase(apiBase) {
  if (typeof window === "undefined" || !apiBase) {
    return;
  }
  window.localStorage.setItem(AUTH_STORAGE_KEYS.apiBase, apiBase);
}

function clearSessionToken() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(AUTH_STORAGE_KEYS.session);
}

function storeAuthenticatedUser({ user, sessionToken }) {
  storeAuthUser(user);
  storeSessionToken(sessionToken);
}

function isPrivateOrLoopbackHost(hostname = "") {
  if (!hostname) {
    return false;
  }

  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1") {
    return true;
  }

  if (/^10\./.test(hostname)) {
    return true;
  }

  if (/^192\.168\./.test(hostname)) {
    return true;
  }

  const match = hostname.match(/^172\.(\d{1,3})\./);
  if (match) {
    const secondOctet = Number(match[1]);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }

  return false;
}

function isDevOrLocalBrowserContext() {
  return import.meta.env.DEV || isLocalBrowserHost();
}

function buildFetchErrorMessage() {
  if (isNativeAppRuntime()) {
    return "API reach করা যাচ্ছে না. Mobile app-এর জন্য backend server চালু রাখো, .env-এ VITE_API_BASE_URL-এ PC/LAN IP দাও, AndroidManifest.xml-এ usesCleartextTraffic=true রাখো, তারপর npm run cap:sync করে app rebuild করো.";
  }

  if (typeof window !== "undefined" && !isDevOrLocalBrowserContext()) {
    return "Backend reach করা যাচ্ছে না. Vercel deploy হলে একই project-এর `/api` function live আছে কিনা check করো. যদি external backend ব্যবহার করো, `VITE_API_BASE_URL`-এ public HTTPS URL দিয়ে frontend redeploy করো.";
  }

  return "Backend server reach করা যাচ্ছে না. npm run server:start বা npm run dev:all চালু আছে কিনা check করো.";
}

function isLocalBrowserHost() {
  if (typeof window === "undefined") {
    return false;
  }

  const hostname = window.location.hostname;
  return isPrivateOrLoopbackHost(hostname) || hostname.endsWith(".local");
}

function isLoopbackApiBase(apiBase = "") {
  const normalized = (apiBase || "").trim().replace(/\/+$/, "");
  return (
    /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/i.test(normalized) ||
    /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?\//i.test(normalized)
  );
}

function readStoredApiBase() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(AUTH_STORAGE_KEYS.apiBase) || "";
}

function persistTransientAuthFeedback({ error = "", notice = "" }) {
  if (typeof window === "undefined") {
    return;
  }
  if (error) {
    window.localStorage.setItem(AUTH_STORAGE_KEYS.transientError, error);
  }
  if (notice) {
    window.localStorage.setItem(AUTH_STORAGE_KEYS.transientNotice, notice);
  }
}

function consumeTransientAuthFeedback() {
  if (typeof window === "undefined") {
    return { error: "", notice: "" };
  }

  const error = window.localStorage.getItem(AUTH_STORAGE_KEYS.transientError) || "";
  const notice = window.localStorage.getItem(AUTH_STORAGE_KEYS.transientNotice) || "";
  window.localStorage.removeItem(AUTH_STORAGE_KEYS.transientError);
  window.localStorage.removeItem(AUTH_STORAGE_KEYS.transientNotice);
  return { error, notice };
}

function createNativeGoogleState(view) {
  const payload = `${view}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(AUTH_STORAGE_KEYS.nativeGoogleState, payload);
  }
  return payload;
}

function consumeNativeGoogleState() {
  if (typeof window === "undefined") {
    return "";
  }
  const value = window.localStorage.getItem(AUTH_STORAGE_KEYS.nativeGoogleState) || "";
  window.localStorage.removeItem(AUTH_STORAGE_KEYS.nativeGoogleState);
  return value;
}

function pushCandidate(list, value, options = {}) {
  const allowEmpty = Boolean(options.allowEmpty);
  const normalized = (value || "").trim().replace(/\/+$/, "");
  if (!normalized && !allowEmpty) {
    return;
  }

  if (!normalized && allowEmpty) {
    if (!list.includes("")) {
      list.push("");
    }
    return;
  }

  if (list.includes(normalized)) {
    return;
  }
  list.push(normalized);
}

function getApiBaseCandidates() {
  const configuredBase = (AUTH_CONFIG.apiBase || "").trim().replace(/\/+$/, "");
  const storedBase = readStoredApiBase();
  const candidates = [];
  const localContext = isDevOrLocalBrowserContext();

  if (typeof window !== "undefined") {
    if (!isNativeAppRuntime()) {
      pushCandidate(candidates, "", { allowEmpty: true });

      if (localContext) {
        pushCandidate(candidates, "http://localhost:4000");
        pushCandidate(candidates, "http://127.0.0.1:4000");
        pushCandidate(candidates, storedBase);
        pushCandidate(candidates, configuredBase);
      } else {
        if (ALLOW_EXTERNAL_API_FALLBACK) {
          if (!isLoopbackApiBase(storedBase)) {
            pushCandidate(candidates, storedBase);
          }
          if (!isLoopbackApiBase(configuredBase)) {
            pushCandidate(candidates, configuredBase);
          }
        }
      }
    } else {
      // Prefer fresh env config on native so stale localStorage values do not shadow LAN API base.
      pushCandidate(candidates, configuredBase);
      pushCandidate(candidates, storedBase);
      pushCandidate(candidates, "http://10.0.2.2:4000");
      pushCandidate(candidates, "http://localhost:4000");
    }
  } else {
    pushCandidate(candidates, storedBase);
    pushCandidate(candidates, configuredBase || "http://localhost:4000");
  }

  return candidates;
}

function buildAuthUrl(apiBase, endpoint) {
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return apiBase ? `${apiBase}${normalizedEndpoint}` : normalizedEndpoint;
}

function getPublicAuthRoute(view) {
  const route = view === "signup" ? ROUTES.signup : ROUTES.login;
  return `${route}?provider=google`;
}

function getPublicGoogleAuthUrl(view, { callbackUrl, state } = {}) {
  if (!PUBLIC_AUTH_BASE_URL) {
    return "";
  }

  const params = new URLSearchParams();
  params.set("provider", "google");
  if (callbackUrl) {
    params.set("native", "1");
    params.set("native_callback", callbackUrl);
  }
  if (state) {
    params.set("state", state);
  }

  const route = view === "signup" ? ROUTES.signup : ROUTES.login;
  return `${PUBLIC_AUTH_BASE_URL}/#${route}?${params.toString()}`;
}

function hasValidHttpsPublicAuthBase() {
  return /^https:\/\//i.test(PUBLIC_AUTH_BASE_URL);
}

function hasValidNativeCallbackUrl() {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(NATIVE_AUTH_CALLBACK_URL) && !/^https?:\/\//i.test(NATIVE_AUTH_CALLBACK_URL);
}

function isExpectedNativeCallbackUrl(url) {
  if (!url || !hasValidNativeCallbackUrl()) {
    return false;
  }

  try {
    const expected = new URL(NATIVE_AUTH_CALLBACK_URL);
    const received = new URL(url);
    const expectedPath = (expected.pathname || "").replace(/\/+$/, "");
    const receivedPath = (received.pathname || "").replace(/\/+$/, "");
    return (
      expected.protocol === received.protocol &&
      expected.host === received.host &&
      expectedPath === receivedPath
    );
  } catch {
    return false;
  }
}

async function openExternalAuthUrl(url) {
  if (!url) {
    return false;
  }

  try {
    if (isNativeAppRuntime()) {
      await Browser.open({ url, presentationStyle: "fullscreen" });
      return true;
    }
  } catch {
    // Fall back to the browser API below if the native browser plugin is unavailable.
  }

  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }

  return false;
}

function normalizeAuthErrorMessage(message = "") {
  if (/the page could not be found|not_found/i.test(message)) {
    return "Auth API route পাওয়া যায়নি. Vercel deploy-এ `api/auth/...` files include হয়েছে কিনা check করে redeploy করো.";
  }
  if (/smtp|invalid login|535|sender/i.test(message)) {
    return "OTP email service configured হয়নি. SMTP login/key বা verified sender ঠিক করতে হবে, তারপর আবার চেষ্টা করো.";
  }
  return message || "Request failed.";
}

function buildOtpNotice(data, defaultMessage) {
  if (data?.delivery === "dev-fallback" && data?.devOtp) {
    const emailIssue = data.emailError ? ` Email issue: ${data.emailError}` : "";
    return `Email delivery failed, so dev OTP auto-filled করা হয়েছে: ${data.devOtp}.${emailIssue}`;
  }
  return data?.message || defaultMessage;
}

function isRetryableFetchError(error) {
  return error instanceof TypeError || error?.name === "AbortError";
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function parseErrorPayload(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const json = await response.json().catch(() => ({}));
    return {
      message: json?.error || json?.message || "",
      rawText: "",
    };
  }

  const text = await response.text().catch(() => "");
  return {
    message: text.trim(),
    rawText: text,
  };
}
async function requestAuth(endpoint, { method = "GET", body, sessionToken } = {}) {
  const candidates = getApiBaseCandidates();
  let lastNetworkError = null;
  let lastMissingBackendError = "";

  for (const apiBase of candidates) {
    try {
      const response = await fetchWithTimeout(buildAuthUrl(apiBase, endpoint), {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      if (!response.ok && !apiBase && (response.status === 404 || response.status === 405)) {
        if (!isDevOrLocalBrowserContext()) {
          lastMissingBackendError =
            "This deployed frontend could not find an API backend at `/api`. Make sure your Vercel deployment includes the `api/auth/...` function files and `api/health.js`, then redeploy.";
        }
        continue;
      }

      if (!response.ok) {
        const errorPayload = await parseErrorPayload(response);
        const statusLine = `HTTP ${response.status}`;
        const fallbackMessage =
          errorPayload.message || `${statusLine} ${response.statusText || "Request failed"}`;
        throw new Error(normalizeAuthErrorMessage(fallbackMessage));
      }

      const isJson = (response.headers.get("content-type") || "").includes("application/json");
      const data = isJson ? await response.json().catch(() => ({})) : {};
      storeApiBase(apiBase);
      return data;
    } catch (error) {
      if (isRetryableFetchError(error)) {
        lastNetworkError = error;
        continue;
      }
      throw new Error(normalizeAuthErrorMessage(error.message));
    }
  }

  if (lastNetworkError) {
    if (lastNetworkError?.name === "AbortError") {
      throw new Error(
        "OTP request timeout হয়েছে. Backend server URL check করো. Browser এ হলে `npm run dev:all` চালিয়ে `/api` proxy use করাই best.",
      );
    }
    throw new Error(buildFetchErrorMessage());
  }

  if (lastMissingBackendError) {
    throw new Error(lastMissingBackendError);
  }

  throw new Error("Request failed.");
}

const remoteAuthService = {
  async requestGatewayAction({ action, payload = {}, sessionToken }) {
    return requestAuth("/api/auth/gateway", {
      method: "POST",
      sessionToken,
      body: { action, ...payload },
    });
  },
  async sendSignupOtp({ name, email }) {
    return this.requestGatewayAction({
      action: "signup.send-otp",
      payload: { name, email },
    });
  },
  async signup({ name, email, otp, password }) {
    const data = await this.requestGatewayAction({
      action: "signup.complete",
      payload: { name, email, otp, password },
    });
    storeAuthenticatedUser({ user: data.user, sessionToken: data.sessionToken });
    return data;
  },
  async login({ identifier, password }) {
    const data = await this.requestGatewayAction({
      action: "login",
      payload: { identifier, password },
    });
    storeAuthenticatedUser({ user: data.user, sessionToken: data.sessionToken });
    return data;
  },
  async googleAuth({ token }) {
    const data = await this.requestGatewayAction({
      action: "google",
      payload: { token },
    });
    storeAuthenticatedUser({ user: data.user, sessionToken: data.sessionToken });
    return data;
  },
  async getSession(sessionToken) {
    const data = await this.requestGatewayAction({
      action: "session",
      sessionToken,
    });
    storeAuthUser(data.user);
    return data;
  },
  async logout({ sessionToken }) {
    if (sessionToken) {
      try {
        await this.requestGatewayAction({
          action: "logout",
          sessionToken,
        });
      } catch {
        // Ignore remote logout failures while clearing the local session.
      }
    }
    clearSessionToken();
  },
  async requestPasswordReset({ identifier }) {
    return this.requestGatewayAction({
      action: "password.lookup",
      payload: { identifier },
    });
  },
  async verifyPasswordResetOtp({ identifier, otp }) {
    return this.requestGatewayAction({
      action: "password.verify-otp",
      payload: { identifier, otp },
    });
  },
  async resetPassword({ resetToken, password, confirmPassword }) {
    return this.requestGatewayAction({
      action: "password.reset",
      payload: { resetToken, password, confirmPassword },
    });
  },
  async updateProfile({ sessionToken, firstName, lastName, mobile, avatarUrl }) {
    const data = await this.requestGatewayAction({
      action: "profile.update",
      sessionToken,
      payload: { firstName, lastName, mobile, avatarUrl },
    });
    if (data?.user) {
      storeAuthUser(data.user);
    }
    return data;
  },
  async changePassword({ sessionToken, currentPassword, newPassword, confirmPassword }) {
    return this.requestGatewayAction({
      action: "password.change",
      sessionToken,
      payload: { currentPassword, newPassword, confirmPassword },
    });
  },
  async submitKyc({
    sessionToken,
    fullName,
    certification,
    ssn,
    frontFileName,
    frontFileData,
    backFileName,
    backFileData,
  }) {
    const data = await this.requestGatewayAction({
      action: "kyc.submit",
      sessionToken,
      payload: {
        fullName,
        certification,
        ssn,
        frontFileName,
        frontFileData,
        backFileName,
        backFileData,
      },
    });
    if (data?.user) {
      storeAuthUser(data.user);
    }
    return data;
  },
  async getKycStatus({ sessionToken }) {
    const data = await this.requestGatewayAction({
      action: "kyc.status",
      sessionToken,
    });
    if (data?.user) {
      storeAuthUser(data.user);
    }
    return data;
  },
  async getDashboardSnapshot({ sessionToken }) {
    const data = await this.requestGatewayAction({
      action: "dashboard.snapshot",
      sessionToken,
    });
    if (data?.user) {
      storeAuthUser(data.user);
    }
    return data;
  },
  async createDepositRequest({ sessionToken, assetId, amountUsd, screenshotFileName, screenshotFileData }) {
    return this.requestGatewayAction({
      action: "deposit.create",
      sessionToken,
      payload: {
        assetId,
        amountUsd,
        screenshotFileName,
        screenshotFileData,
      },
    });
  },
  async getDepositRecords({ sessionToken }) {
    return this.requestGatewayAction({
      action: "deposit.records",
      sessionToken,
    });
  },
  async adminGetNotice() {
    return this.requestGatewayAction({
      action: "admin.notice.get",
    });
  },
  async adminUpdateNotice({ message }) {
    return this.requestGatewayAction({
      action: "admin.notice.update",
      payload: { message },
    });
  },
  async adminListDepositAssets() {
    return this.requestGatewayAction({
      action: "admin.deposit.assets.list",
    });
  },
  async adminUpsertDepositAsset({
    assetId,
    symbol,
    name,
    chainName,
    rechargeAddress,
    qrCodeData,
    minAmountUsd,
    maxAmountUsd,
    sortOrder,
    isEnabled,
  }) {
    return this.requestGatewayAction({
      action: "admin.deposit.asset.upsert",
      payload: {
        assetId,
        symbol,
        name,
        chainName,
        rechargeAddress,
        qrCodeData,
        minAmountUsd,
        maxAmountUsd,
        sortOrder,
        isEnabled,
      },
    });
  },
  async adminListDepositRequests() {
    return this.requestGatewayAction({
      action: "admin.deposit.requests.list",
    });
  },
  async adminReviewDepositRequest({ requestId, decision, note }) {
    return this.requestGatewayAction({
      action: "admin.deposit.request.review",
      payload: { requestId, decision, note },
    });
  },
  async adminListKycRequests() {
    return this.requestGatewayAction({
      action: "admin.kyc.list",
    });
  },
  async adminListUsers({ kycStatus } = {}) {
    return this.requestGatewayAction({
      action: "admin.users.list",
      payload: { kycStatus },
    });
  },
  async adminGetUserDetail({ userId }) {
    return this.requestGatewayAction({
      action: "admin.user.detail",
      payload: { userId },
    });
  },
  async adminUpdateUser({ userId, name, firstName, lastName, email, mobile, avatarUrl, kycStatus, walletBalances }) {
    return this.requestGatewayAction({
      action: "admin.user.update",
      payload: {
        userId,
        name,
        firstName,
        lastName,
        email,
        mobile,
        avatarUrl,
        kycStatus,
        walletBalances,
      },
    });
  },
  async adminReviewKycRequest({ requestId, decision, note }) {
    return this.requestGatewayAction({
      action: "admin.kyc.review",
      payload: {
        requestId,
        decision,
        note,
      },
    });
  },
};

function getAuthService() {
  return remoteAuthService;
}

function useAuthFlow({ initialView, authSnapshot, onAuthenticated }) {
  const [view, setView] = useState(initialView);
  const [name, setName] = useState(authSnapshot.name || "");
  const [email, setEmail] = useState(authSnapshot.email || "");
  const [identifier, setIdentifier] = useState(authSnapshot.userId || authSnapshot.email || "");
  const [lookupIdentifier, setLookupIdentifier] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [matchedAccount, setMatchedAccount] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    setName(authSnapshot.name || "");
    setEmail(authSnapshot.email || "");
    setIdentifier(authSnapshot.userId || authSnapshot.email || "");
  }, [authSnapshot.email, authSnapshot.name, authSnapshot.userId]);

  useEffect(() => {
    const feedback = consumeTransientAuthFeedback();
    if (feedback.error) {
      setError(feedback.error);
    }
    if (feedback.notice) {
      setNotice(feedback.notice);
    }
  }, []);

  const authService = getAuthService();

  const clearFeedback = () => {
    setError("");
    setNotice("");
  };

  const switchView = (nextView) => {
    clearFeedback();
    setView(nextView);
    if (nextView === "login") {
      setOtp("");
      setPassword("");
      setConfirmPassword("");
      setResetToken("");
      setMatchedAccount(null);
    }
  };

  const finishAuth = async () => {
    setPassword("");
    setConfirmPassword("");
    setOtp("");
    await onAuthenticated();
  };

  const handleGetSignupOtp = async () => {
    clearFeedback();
    setSubmitting(true);
    try {
      const data = await authService.sendSignupOtp({ name, email });
      if (data?.devOtp) {
        setOtp(data.devOtp);
      }
      setNotice(buildOtpNotice(data, "OTP sent to your email. Enter it below to complete signup."));
    } catch (requestError) {
      setError(requestError.message || "Could not send OTP.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    clearFeedback();
    setSubmitting(true);
    try {
      await authService.login({ identifier, password });
      await finishAuth();
    } catch (submitError) {
      setError(submitError.message || "Login failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    clearFeedback();
    setSubmitting(true);
    try {
      await authService.signup({ name, email, otp, password });
      switchView("login");
      setNotice("Account created successfully! Please login with your new credentials.");
    } catch (submitError) {
      setError(submitError.message || "Signup failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotLookup = async (event) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    clearFeedback();
    setSubmitting(true);
    try {
      const data = await authService.requestPasswordReset({ identifier: lookupIdentifier });
      setMatchedAccount(data);
      if (data?.devOtp) {
        setOtp(data.devOtp);
      }
      setNotice(buildOtpNotice(data, "Account found. OTP sent to the signup email."));
      setView("forgotOtp");
    } catch (lookupError) {
      setError(lookupError.message || "Could not find the account.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotOtp = async (event) => {
    event.preventDefault();
    clearFeedback();
    setSubmitting(true);
    try {
      const data = await authService.verifyPasswordResetOtp({
        identifier: lookupIdentifier,
        otp,
      });
      setResetToken(data.resetToken);
      setMatchedAccount(data.user);
      setNotice("OTP verified. Create your new password.");
      setView("forgotReset");
    } catch (verifyError) {
      setError(verifyError.message || "OTP verification failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    clearFeedback();
    setSubmitting(true);
    try {
      await authService.resetPassword({
        resetToken,
        password,
        confirmPassword,
      });
      setIdentifier(matchedAccount?.userId || matchedAccount?.email || lookupIdentifier);
      setPassword("");
      setConfirmPassword("");
      setOtp("");
      setResetToken("");
      setMatchedAccount(null);
      setView("login");
      setNotice("Password updated. Please login with the new password.");
    } catch (resetError) {
      setError(resetError.message || "Could not reset password.");
    } finally {
      setSubmitting(false);
    }
  };

  const heading =
    view === "signup"
      ? "Create your trading account"
      : view === "forgotLookup"
        ? "Find your account"
        : view === "forgotOtp"
          ? "Verify reset OTP"
          : view === "forgotReset"
            ? "Create a new password"
            : "Welcome back";

  const subtitle =
    view === "signup"
      ? "Enter your name, get an email OTP, and create your password."
      : view === "forgotLookup"
        ? "Enter your signup email or 6-digit user ID to continue."
        : view === "forgotOtp"
          ? "Use the OTP that was sent to your signup email."
          : view === "forgotReset"
            ? "Choose a strong new password, then login again."
            : "Login with your email or 6-digit user ID.";

  const handleGoogleAuth = async (token) => {
    clearFeedback();
    setSubmitting(true);
    try {
      await authService.googleAuth({ token });
      await finishAuth();
    } catch (submitError) {
      setError(submitError.message || "Google authentication failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMobileGoogleAuth = async (targetView) => {
    clearFeedback();

    if (!PUBLIC_AUTH_BASE_URL) {
      setError(
        "Mobile Google sign-in-এর জন্য .env-এ VITE_PUBLIC_AUTH_BASE_URL এ public HTTPS tunnel/domain দাও, তারপর app rebuild করো.",
      );
      return;
    }

    if (!hasValidHttpsPublicAuthBase()) {
      setError("VITE_PUBLIC_AUTH_BASE_URL অবশ্যই https:// URL হতে হবে (Google secure browser flow). ");
      return;
    }

    if (!hasValidNativeCallbackUrl()) {
      setError("VITE_NATIVE_AUTH_CALLBACK_URL invalid. Example: cryptobotprime://auth-callback");
      return;
    }

    const state = createNativeGoogleState(targetView);
    const publicUrl = getPublicGoogleAuthUrl(targetView, {
      callbackUrl: NATIVE_AUTH_CALLBACK_URL,
      state,
    });

    const opened = await openExternalAuthUrl(publicUrl);
    if (!opened) {
      setError("Secure browser open করা যায়নি. Public auth URL manually browser-এ খুলো.");
      return;
    }

    setNotice(
      "Google sign-in secure browser-এ open হয়েছে. সেখানে sign-in complete করো. Native WebView-এ Google login supported না.",
    );
  };

  return {
    view,
    setView: switchView,
    name,
    setName,
    email,
    setEmail,
    identifier,
    setIdentifier,
    lookupIdentifier,
    setLookupIdentifier,
    otp,
    setOtp,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    matchedAccount,
    notice,
    error,
    submitting,
    showPassword,
    setShowPassword,
    showConfirmPassword,
    setShowConfirmPassword,
    heading,
    subtitle,
    handleGetSignupOtp,
    handleLogin,
    handleSignup,
    handleForgotLookup,
    handleForgotOtp,
    handleResetPassword,
    handleGoogleAuth,
    handleMobileGoogleAuth,
    setNotice,
    setError,
  };
}

const webAuthClasses = {
  form: "auth-form",
  otpRow: "otp-row",
  passwordRow: "password-field-row",
  toggle: "password-toggle-btn",
  submit: "btn btn-primary auth-submit",
  linkRow: "auth-link-row",
  inline: "auth-inline-btn",
  chip: "auth-account-chip",
};

const mobileAuthClasses = {
  form: "mobile-auth-form",
  otpRow: "mobile-otp-row",
  passwordRow: "mobile-password-row",
  toggle: "mobile-show-btn",
  submit: "btn btn-primary mobile-auth-submit",
  linkRow: "mobile-auth-link-row",
  inline: "mobile-inline-btn",
  chip: "mobile-auth-account-chip",
};

function AuthForms({ flow, classes }) {
  const isSignup = flow.view === "signup";
  const isForgotLookup = flow.view === "forgotLookup";
  const isForgotOtp = flow.view === "forgotOtp";
  const isForgotReset = flow.view === "forgotReset";
  const isNativeRuntime = isNativeAppRuntime();
  const hashState = parseHashRouteState();
  const query = hashState.query;
  const hasNativeGoogleUrl = hasValidHttpsPublicAuthBase();
  const nativeBridgeCallback = query.get("native_callback") || "";
  const nativeBridgeState = query.get("state") || "";
  const isNativeBridgeRequest =
    !isNativeRuntime && query.get("provider") === "google" && query.get("native") === "1" && Boolean(nativeBridgeCallback);
  const googleButtonText = isSignup ? "Sign up with Google" : "Continue with Google";
  const googleErrorText = isSignup ? "Google signup failed." : "Google login failed.";

  const returnNativeGoogleResult = (payload) => {
    if (!isNativeBridgeRequest) {
      return false;
    }
    try {
      const callbackUrl = new URL(nativeBridgeCallback);
      if (/^https?:$/i.test(callbackUrl.protocol)) {
        return false;
      }
      Object.entries(payload).forEach(([key, value]) => {
        if (value) {
          callbackUrl.searchParams.set(key, value);
        }
      });
      if (nativeBridgeState) {
        callbackUrl.searchParams.set("state", nativeBridgeState);
      }
      window.location.href = callbackUrl.toString();
      return true;
    } catch {
      flow.setError("Native callback URL invalid. App config check করে আবার চেষ্টা করো.");
      return false;
    }
  };

  const renderGoogleAction = () => (
    <div className="auth-social">
      <div className="auth-divider">
        <span>or</span>
      </div>
      <div className="auth-social-card">
        <p className="auth-social-label">{googleButtonText}</p>
        <p className="auth-social-copy">
          {isNativeRuntime
            ? hasNativeGoogleUrl
              ? "Native app-এ Google sign-in secure browser-এ open হবে."
              : "Native app-এ Google sign-in secure browser-এ চলবে. Public HTTPS tunnel/domain লাগবে."
            : "Use your verified Google account for instant access."}
        </p>
        {isNativeRuntime ? (
          <button
            type="button"
            className="btn btn-ghost auth-mobile-google-btn"
            onClick={() => flow.handleMobileGoogleAuth(flow.view)}
          >
            Open Secure Google Sign-In
          </button>
        ) : (
          <div className="auth-google-button">
            <GoogleLogin
              theme="outline"
              size="large"
              shape="pill"
              text={isSignup ? "signup_with" : "continue_with"}
              width="320"
              logo_alignment="left"
              onSuccess={(credentialResponse) => {
                const token = credentialResponse?.credential;
                if (!token) {
                  flow.setError(`${googleErrorText} Missing token from Google response.`);
                  return;
                }
                if (returnNativeGoogleResult({ provider: "google", token })) {
                  return;
                }
                flow.handleGoogleAuth(token);
              }}
              onError={() => {
                if (returnNativeGoogleResult({ provider: "google", error: "Google authentication failed." })) {
                  return;
                }
                flow.setError(`${googleErrorText} Check Google client origin setup and try again.`);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {flow.matchedAccount ? (
        <div className={classes.chip}>
          <span>{flow.matchedAccount.name || "Account found"}</span>
          <strong>ID {flow.matchedAccount.userId}</strong>
        </div>
      ) : null}

      {flow.view === "login" ? (
        <form className={classes.form} onSubmit={flow.handleLogin}>
          <label htmlFor="auth-login-identifier">Email or User ID</label>
          <input
            id="auth-login-identifier"
            type="text"
            value={flow.identifier}
            onChange={(event) => flow.setIdentifier(event.target.value)}
            placeholder="email@example.com or 123456"
            required
          />

          <label htmlFor="auth-login-password">Password</label>
          <div className={classes.passwordRow}>
            <input
              id="auth-login-password"
              type={flow.showPassword ? "text" : "password"}
              value={flow.password}
              onChange={(event) => flow.setPassword(event.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className={classes.toggle}
              onClick={() => flow.setShowPassword((current) => !current)}
            >
              {flow.showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <div className={classes.linkRow}>
            <button type="button" className={classes.inline} onClick={() => flow.setView("forgotLookup")}>
              Forgot password?
            </button>
          </div>

          {flow.notice ? <p className="mobile-auth-notice">{flow.notice}</p> : null}
          {flow.error ? <p className="mobile-auth-error">{flow.error}</p> : null}

          <button type="submit" className={classes.submit} disabled={flow.submitting}>
            {flow.submitting ? "Please wait..." : "Login"}
          </button>

          {renderGoogleAction()}
        </form>
      ) : null}

      {isSignup ? (
        <form className={classes.form} onSubmit={flow.handleSignup}>
          <label htmlFor="auth-signup-name">Full Name</label>
          <input
            id="auth-signup-name"
            type="text"
            value={flow.name}
            onChange={(event) => flow.setName(event.target.value)}
            placeholder="Your name"
            required
          />

          <label htmlFor="auth-signup-email">Email</label>
          <input
            id="auth-signup-email"
            type="email"
            value={flow.email}
            onChange={(event) => flow.setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />

          <label htmlFor="auth-signup-otp">Verification Code</label>
          <div className={classes.otpRow}>
            <input
              id="auth-signup-otp"
              type="text"
              value={flow.otp}
              onChange={(event) => flow.setOtp(event.target.value)}
              placeholder="Enter OTP"
              inputMode="numeric"
              required
            />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={flow.handleGetSignupOtp}
              disabled={flow.submitting}
            >
              {flow.submitting ? "Sending..." : "Get OTP"}
            </button>
          </div>

          <label htmlFor="auth-signup-password">Password</label>
          <div className={classes.passwordRow}>
            <input
              id="auth-signup-password"
              type={flow.showPassword ? "text" : "password"}
              value={flow.password}
              onChange={(event) => flow.setPassword(event.target.value)}
              placeholder="Create password"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              className={classes.toggle}
              onClick={() => flow.setShowPassword((current) => !current)}
            >
              {flow.showPassword ? "Hide" : "Show"}
            </button>
          </div>

          {flow.notice ? <p className="mobile-auth-notice">{flow.notice}</p> : null}
          {flow.error ? <p className="mobile-auth-error">{flow.error}</p> : null}

          <button type="submit" className={classes.submit} disabled={flow.submitting}>
            {flow.submitting ? "Please wait..." : "Create Account"}
          </button>

          {renderGoogleAction()}
        </form>
      ) : null}

      {isForgotLookup ? (
        <form className={classes.form} onSubmit={flow.handleForgotLookup}>
          <label htmlFor="auth-forgot-identifier">Email or User ID</label>
          <input
            id="auth-forgot-identifier"
            type="text"
            value={flow.lookupIdentifier}
            onChange={(event) => flow.setLookupIdentifier(event.target.value)}
            placeholder="email@example.com or 123456"
            required
          />

          {flow.notice ? <p className="mobile-auth-notice">{flow.notice}</p> : null}
          {flow.error ? <p className="mobile-auth-error">{flow.error}</p> : null}

          <button type="submit" className={classes.submit} disabled={flow.submitting}>
            {flow.submitting ? "Searching..." : "Find Account"}
          </button>

          <div className={classes.linkRow}>
            <button type="button" className={classes.inline} onClick={() => flow.setView("login")}>
              Back to login
            </button>
          </div>
        </form>
      ) : null}

      {isForgotOtp ? (
        <form className={classes.form} onSubmit={flow.handleForgotOtp}>
          <label htmlFor="auth-reset-otp">Reset OTP</label>
          <input
            id="auth-reset-otp"
            type="text"
            value={flow.otp}
            onChange={(event) => flow.setOtp(event.target.value)}
            placeholder="Enter email OTP"
            inputMode="numeric"
            required
          />

          {flow.notice ? <p className="mobile-auth-notice">{flow.notice}</p> : null}
          {flow.error ? <p className="mobile-auth-error">{flow.error}</p> : null}

          <button type="submit" className={classes.submit} disabled={flow.submitting}>
            {flow.submitting ? "Verifying..." : "Verify OTP"}
          </button>

          <div className={classes.linkRow}>
            <button type="button" className={classes.inline} onClick={flow.handleForgotLookup} disabled={flow.submitting}>
              Resend OTP
            </button>
            <button type="button" className={classes.inline} onClick={() => flow.setView("forgotLookup")}>
              Change account
            </button>
          </div>
        </form>
      ) : null}

      {isForgotReset ? (
        <form className={classes.form} onSubmit={flow.handleResetPassword}>
          <label htmlFor="auth-reset-password">New Password</label>
          <div className={classes.passwordRow}>
            <input
              id="auth-reset-password"
              type={flow.showPassword ? "text" : "password"}
              value={flow.password}
              onChange={(event) => flow.setPassword(event.target.value)}
              placeholder="Create new password"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              className={classes.toggle}
              onClick={() => flow.setShowPassword((current) => !current)}
            >
              {flow.showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <label htmlFor="auth-reset-confirm">Retype Password</label>
          <div className={classes.passwordRow}>
            <input
              id="auth-reset-confirm"
              type={flow.showConfirmPassword ? "text" : "password"}
              value={flow.confirmPassword}
              onChange={(event) => flow.setConfirmPassword(event.target.value)}
              placeholder="Retype password"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              className={classes.toggle}
              onClick={() => flow.setShowConfirmPassword((current) => !current)}
            >
              {flow.showConfirmPassword ? "Hide" : "Show"}
            </button>
          </div>

          {flow.notice ? <p className="mobile-auth-notice">{flow.notice}</p> : null}
          {flow.error ? <p className="mobile-auth-error">{flow.error}</p> : null}

          <button type="submit" className={classes.submit} disabled={flow.submitting}>
            {flow.submitting ? "Updating..." : "Submit New Password"}
          </button>
        </form>
      ) : null}
    </>
  );
}

function AuthPage({ mode, authSnapshot, onAuthenticated, onBackHome, onGoAdmin }) {
  const initialView = mode === ROUTES.signup ? "signup" : "login";
  const flow = useAuthFlow({
    initialView,
    authSnapshot,
    onAuthenticated: async () => {
      await onAuthenticated();
      goToRoute(ROUTES.app);
    },
  });

  return (
    <main className="auth-shell">
      <div className="auth-glow auth-glow-left" />
      <div className="auth-glow auth-glow-right" />

      <header className="auth-topbar">
        <button type="button" className="auth-brand" onClick={onBackHome}>
          <i className="fas fa-cube" />
          <span>CryptoByte Pro</span>
        </button>

        <div className="auth-topbar-actions">
          <button type="button" className="btn btn-ghost" onClick={onGoAdmin}>
            Admin URL
          </button>
          <button type="button" className="btn btn-ghost" onClick={onBackHome}>
            Back to Home
          </button>
        </div>
      </header>

      <section className="auth-main">
        <div className="auth-showcase">
          <p className="auth-badge">Secure Crypto Access</p>
          <h1>Web and mobile now share one verified account system.</h1>
          <p>
            Name-based signup, email OTP verification, 6-digit user IDs, encrypted password
            storage, and full forgot-password recovery are all connected to the backend.
          </p>

          <div className="auth-metrics">
            <div>
              <strong>Email OTP</strong>
              <span>Signup Verification</span>
            </div>
            <div>
              <strong>6-Digit ID</strong>
              <span>Permanent User ID</span>
            </div>
            <div>
              <strong>Bcrypt</strong>
              <span>Encrypted Passwords</span>
            </div>
          </div>
        </div>

        <div className="auth-card-wrap">
          <article className="auth-card">
            <div className="auth-switch">
              <button
                type="button"
                className={flow.view === "login" ? "active" : ""}
                onClick={() => flow.setView("login")}
              >
                Login
              </button>
              <button
                type="button"
                className={flow.view === "signup" ? "active" : ""}
                onClick={() => flow.setView("signup")}
              >
                Sign Up
              </button>
            </div>

            <h2>{flow.heading}</h2>
            <p className="auth-subtitle">{flow.subtitle}</p>

            <AuthForms flow={flow} classes={webAuthClasses} />
          </article>
        </div>
      </section>
    </main>
  );
}

function formatAdminTime(isoString) {
  if (!isoString) {
    return "-";
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getAdminKycBadgeLabel(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "authenticated" || normalized === "approved") {
    return { text: "Authenticated", className: "is-authenticated" };
  }
  if (normalized === "rejected" || normalized === "reject") {
    return { text: "Rejected", className: "is-rejected" };
  }
  return { text: "Pending", className: "is-pending" };
}

function getAdminDepositBadgeLabel(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "approved") {
    return { text: "Approved", className: "is-authenticated" };
  }
  if (normalized === "rejected") {
    return { text: "Rejected", className: "is-rejected" };
  }
  return { text: "Pending", className: "is-pending" };
}

function formatUsdAmount(value) {
  const numeric = Number(value || 0);
  return numeric.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function isImageDataUri(value) {
  return /^data:image\//i.test(String(value || "").trim());
}

function AdminPanelPage({ onBackHome, onGoAuth }) {
  const authService = getAuthService();
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");
  const [depositMenuOpen, setDepositMenuOpen] = useState(true);
  const [activeDepositSubsection, setActiveDepositSubsection] = useState("assets");
  const [overviewFilter, setOverviewFilter] = useState("all");

  const [adminUsers, setAdminUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUserDetail, setSelectedUserDetail] = useState(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [userDetailError, setUserDetailError] = useState("");
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userSaveLoading, setUserSaveLoading] = useState(false);
  const [userSaveError, setUserSaveError] = useState("");
  const [userSaveNotice, setUserSaveNotice] = useState("");
  const [userForm, setUserForm] = useState({
    userId: "",
    name: "",
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    avatarUrl: "",
    kycStatus: "pending",
    walletBalances: [],
  });

  const [kycRequests, setKycRequests] = useState([]);
  const [kycStats, setKycStats] = useState({
    totalUsers: 0,
    pendingVerifications: 0,
    authenticatedUsers: 0,
    rejectedUsers: 0,
  });
  const [loadingKyc, setLoadingKyc] = useState(true);
  const [kycError, setKycError] = useState("");
  const [kycNotice, setKycNotice] = useState("");
  const [reviewingRequestId, setReviewingRequestId] = useState(null);

  const [noticeInput, setNoticeInput] = useState("");
  const [noticeUpdatedAt, setNoticeUpdatedAt] = useState("");
  const [noticeSubmitting, setNoticeSubmitting] = useState(false);
  const [noticeError, setNoticeError] = useState("");
  const [noticeSuccess, setNoticeSuccess] = useState("");

  const [assetForm, setAssetForm] = useState({
    assetId: null,
    symbol: "",
    name: "",
    chainName: "",
    rechargeAddress: "",
    qrCodeData: "",
    minAmountUsd: "10",
    maxAmountUsd: "1000000",
    sortOrder: "0",
    isEnabled: true,
  });
  const [assetStats, setAssetStats] = useState({ totalAssets: 0, enabledAssets: 0 });
  const [depositAssets, setDepositAssets] = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState("");
  const [assetsNotice, setAssetsNotice] = useState("");
  const [assetSaving, setAssetSaving] = useState(false);

  const [depositRequests, setDepositRequests] = useState([]);
  const [depositStats, setDepositStats] = useState({
    totalRequests: 0,
    pendingRequests: 0,
    approvedRequests: 0,
    rejectedRequests: 0,
  });
  const [depositLoading, setDepositLoading] = useState(true);
  const [depositError, setDepositError] = useState("");
  const [depositNotice, setDepositNotice] = useState("");
  const [reviewingDepositId, setReviewingDepositId] = useState(null);
  const [selectedDepositRequestId, setSelectedDepositRequestId] = useState(null);
  const [selectedKycRequestId, setSelectedKycRequestId] = useState(null);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [kycModalOpen, setKycModalOpen] = useState(false);
  const [depositRejectReason, setDepositRejectReason] = useState("");
  const [kycRejectReason, setKycRejectReason] = useState("");

  const selectedDepositRequest = depositRequests.find((item) => item.requestId === selectedDepositRequestId) || null;
  const selectedKycRequest = kycRequests.find((item) => item.requestId === selectedKycRequestId) || null;

  const loadKycRequests = async ({ withLoading = true } = {}) => {
    if (withLoading) {
      setLoadingKyc(true);
    }
    setKycError("");

    try {
      const data = await authService.adminListKycRequests();
      const nextRequests = Array.isArray(data?.requests) ? data.requests : [];
      setKycRequests(nextRequests);
      setSelectedKycRequestId((previousId) => {
        if (previousId && nextRequests.some((item) => item.requestId === previousId)) {
          return previousId;
        }
        return nextRequests[0]?.requestId || null;
      });
      setKycStats({
        totalUsers: data?.stats?.totalUsers || 0,
        pendingVerifications: data?.stats?.pendingVerifications || 0,
        authenticatedUsers: data?.stats?.authenticatedUsers || 0,
        rejectedUsers: data?.stats?.rejectedUsers || 0,
      });
    } catch (loadError) {
      setKycError(loadError.message || "Could not load KYC requests.");
    } finally {
      if (withLoading) {
        setLoadingKyc(false);
      }
    }
  };

  const loadAdminUsers = async ({ withLoading = true, statusFilter = overviewFilter } = {}) => {
    if (withLoading) {
      setUsersLoading(true);
    }
    setUsersError("");

    try {
      const data = await authService.adminListUsers({
        kycStatus: statusFilter === "all" ? "" : statusFilter,
      });

      const users = Array.isArray(data?.users) ? data.users : [];
      setAdminUsers(users);
      setKycStats({
        totalUsers: data?.stats?.totalUsers || 0,
        pendingVerifications: data?.stats?.pendingVerifications || 0,
        authenticatedUsers: data?.stats?.authenticatedUsers || 0,
        rejectedUsers: data?.stats?.rejectedUsers || 0,
      });

      setSelectedUserId((previousId) => {
        if (previousId && users.some((item) => item.userId === previousId)) {
          return previousId;
        }
        return users[0]?.userId || "";
      });
    } catch (loadError) {
      setUsersError(loadError.message || "Could not load users.");
    } finally {
      if (withLoading) {
        setUsersLoading(false);
      }
    }
  };

  const loadAdminUserDetail = async (userId) => {
    if (!userId) {
      setSelectedUserDetail(null);
      return;
    }

    setUserDetailLoading(true);
    setUserDetailError("");
    setSelectedUserId(userId);
    try {
      const detail = await authService.adminGetUserDetail({ userId });
      setSelectedUserDetail(detail || null);
      setUserForm({
        userId: detail?.user?.userId || "",
        name: detail?.user?.name || "",
        firstName: detail?.user?.firstName || "",
        lastName: detail?.user?.lastName || "",
        email: detail?.user?.email || "",
        mobile: detail?.user?.mobile || "",
        avatarUrl: detail?.user?.avatarUrl || "",
        kycStatus: detail?.user?.kycStatus || "pending",
        walletBalances: Array.isArray(detail?.wallet?.balances)
          ? detail.wallet.balances.map((item) => ({
              symbol: item.symbol || "",
              name: item.name || "",
              totalUsd: String(item.totalUsd ?? 0),
            }))
          : [],
      });
    } catch (detailError) {
      setSelectedUserDetail(null);
      setUserDetailError(detailError.message || "Could not load user details.");
    } finally {
      setUserDetailLoading(false);
    }
  };

  const loadNotice = async () => {
    setNoticeError("");
    try {
      const data = await authService.adminGetNotice();
      setNoticeInput(data?.notice?.message || "");
      setNoticeUpdatedAt(data?.notice?.updatedAt || "");
    } catch (loadError) {
      setNoticeError(loadError.message || "Could not load notice.");
    }
  };

  const loadDepositAssets = async ({ withLoading = true } = {}) => {
    if (withLoading) {
      setAssetsLoading(true);
    }
    setAssetsError("");
    try {
      const data = await authService.adminListDepositAssets();
      setDepositAssets(Array.isArray(data?.assets) ? data.assets : []);
      setAssetStats({
        totalAssets: data?.stats?.totalAssets || 0,
        enabledAssets: data?.stats?.enabledAssets || 0,
      });
    } catch (loadError) {
      setAssetsError(loadError.message || "Could not load deposit assets.");
    } finally {
      if (withLoading) {
        setAssetsLoading(false);
      }
    }
  };

  const loadDepositRequests = async ({ withLoading = true } = {}) => {
    if (withLoading) {
      setDepositLoading(true);
    }
    setDepositError("");
    try {
      const data = await authService.adminListDepositRequests();
      const nextRequests = Array.isArray(data?.requests) ? data.requests : [];
      setDepositRequests(nextRequests);
      setSelectedDepositRequestId((previousId) => {
        if (previousId && nextRequests.some((item) => item.requestId === previousId)) {
          return previousId;
        }
        return nextRequests[0]?.requestId || null;
      });
      setDepositStats({
        totalRequests: data?.stats?.totalRequests || 0,
        pendingRequests: data?.stats?.pendingRequests || 0,
        approvedRequests: data?.stats?.approvedRequests || 0,
        rejectedRequests: data?.stats?.rejectedRequests || 0,
      });
    } catch (loadError) {
      setDepositError(loadError.message || "Could not load deposit requests.");
    } finally {
      if (withLoading) {
        setDepositLoading(false);
      }
    }
  };

  useEffect(() => {
    loadKycRequests();
    loadNotice();
    loadDepositAssets();
    loadDepositRequests();
  }, []);

  useEffect(() => {
    loadAdminUsers();
  }, [overviewFilter]);

  useEffect(() => {
    if (selectedUserId) {
      loadAdminUserDetail(selectedUserId);
    } else {
      setSelectedUserDetail(null);
    }
  }, [selectedUserId]);

  const handleReview = async (requestId, decision) => {
    setKycNotice("");
    setKycError("");
    setReviewingRequestId(requestId);
    try {
      const reason = decision === "rejected" ? kycRejectReason.trim() : "";
      const data = await authService.adminReviewKycRequest({ requestId, decision, note: reason });
      setKycNotice(data?.message || "KYC status updated.");
      await loadKycRequests({ withLoading: false });
      await loadAdminUsers({ withLoading: false, statusFilter: overviewFilter });
      if (selectedUserId) {
        await loadAdminUserDetail(selectedUserId);
      }
      if (decision === "rejected") {
        setKycRejectReason("");
      }
    } catch (reviewError) {
      setKycError(reviewError.message || "Could not update KYC status.");
    } finally {
      setReviewingRequestId(null);
    }
  };

  const handlePublishNotice = async (event) => {
    event.preventDefault();
    setNoticeError("");
    setNoticeSuccess("");

    if (noticeInput.trim().length < 6) {
      setNoticeError("Notice must contain at least 6 characters.");
      return;
    }

    setNoticeSubmitting(true);
    try {
      const data = await authService.adminUpdateNotice({ message: noticeInput.trim() });
      setNoticeSuccess(data?.message || "Notice published.");
      setNoticeInput(data?.notice?.message || noticeInput.trim());
      setNoticeUpdatedAt(data?.notice?.updatedAt || "");
    } catch (submitError) {
      setNoticeError(submitError.message || "Could not publish notice.");
    } finally {
      setNoticeSubmitting(false);
    }
  };

  const resetAssetForm = () => {
    setAssetForm({
      assetId: null,
      symbol: "",
      name: "",
      chainName: "",
      rechargeAddress: "",
      qrCodeData: "",
      minAmountUsd: "10",
      maxAmountUsd: "1000000",
      sortOrder: "0",
      isEnabled: true,
    });
  };

  const editAsset = (asset) => {
    setAssetForm({
      assetId: asset.assetId,
      symbol: asset.symbol || "",
      name: asset.name || "",
      chainName: asset.chainName || "",
      rechargeAddress: asset.rechargeAddress || "",
      qrCodeData: asset.qrCodeData || "",
      minAmountUsd: String(asset.minAmountUsd ?? 10),
      maxAmountUsd: String(asset.maxAmountUsd ?? 1000000),
      sortOrder: String(asset.sortOrder ?? 0),
      isEnabled: Boolean(asset.isEnabled),
    });
  };

  const submitAsset = async (event) => {
    event.preventDefault();
    setAssetsError("");
    setAssetsNotice("");

    if (!assetForm.symbol.trim()) {
      setAssetsError("Symbol is required.");
      return;
    }
    if (!assetForm.name.trim()) {
      setAssetsError("Asset name is required.");
      return;
    }
    if (!assetForm.chainName.trim()) {
      setAssetsError("Chain name is required.");
      return;
    }
    if (!assetForm.rechargeAddress.trim()) {
      setAssetsError("Recharge address is required.");
      return;
    }
    if (!assetForm.qrCodeData.trim()) {
      setAssetsError("QR code value is required.");
      return;
    }

    setAssetSaving(true);
    try {
      const data = await authService.adminUpsertDepositAsset({
        assetId: assetForm.assetId,
        symbol: assetForm.symbol,
        name: assetForm.name,
        chainName: assetForm.chainName,
        rechargeAddress: assetForm.rechargeAddress,
        qrCodeData: assetForm.qrCodeData,
        minAmountUsd: Number(assetForm.minAmountUsd),
        maxAmountUsd: Number(assetForm.maxAmountUsd),
        sortOrder: Number(assetForm.sortOrder),
        isEnabled: assetForm.isEnabled,
      });
      setAssetsNotice(data?.message || "Asset saved.");
      await loadDepositAssets({ withLoading: false });
      resetAssetForm();
    } catch (submitError) {
      setAssetsError(submitError.message || "Could not save asset.");
    } finally {
      setAssetSaving(false);
    }
  };

  const handleReviewDeposit = async (requestId, decision) => {
    setDepositError("");
    setDepositNotice("");
    setReviewingDepositId(requestId);
    try {
      const reason = decision === "rejected" ? depositRejectReason.trim() : "";
      const data = await authService.adminReviewDepositRequest({ requestId, decision, note: reason });
      setDepositNotice(data?.message || "Deposit request updated.");
      await loadDepositRequests({ withLoading: false });
      if (selectedUserId) {
        await loadAdminUserDetail(selectedUserId);
      }
      if (decision === "rejected") {
        setDepositRejectReason("");
      }
    } catch (reviewError) {
      setDepositError(reviewError.message || "Could not update deposit request.");
    } finally {
      setReviewingDepositId(null);
    }
  };

  const handleUserFormChange = (field, value) => {
    setUserForm((previous) => ({ ...previous, [field]: value }));
  };

  const handleWalletItemChange = (index, field, value) => {
    setUserForm((previous) => {
      const nextItems = [...previous.walletBalances];
      nextItems[index] = {
        ...nextItems[index],
        [field]: value,
      };
      return {
        ...previous,
        walletBalances: nextItems,
      };
    });
  };

  const addWalletItem = () => {
    setUserForm((previous) => ({
      ...previous,
      walletBalances: [...previous.walletBalances, { symbol: "", name: "", totalUsd: "0" }],
    }));
  };

  const removeWalletItem = (index) => {
    setUserForm((previous) => {
      const nextItems = previous.walletBalances.filter((_, itemIndex) => itemIndex !== index);
      return {
        ...previous,
        walletBalances: nextItems,
      };
    });
  };

  const handleSaveUser = async () => {
    setUserSaveError("");
    setUserSaveNotice("");
    setUserSaveLoading(true);
    try {
      const data = await authService.adminUpdateUser({
        userId: userForm.userId,
        name: userForm.name,
        firstName: userForm.firstName,
        lastName: userForm.lastName,
        email: userForm.email,
        mobile: userForm.mobile,
        avatarUrl: userForm.avatarUrl,
        kycStatus: userForm.kycStatus,
        walletBalances: userForm.walletBalances.map((item) => ({
          symbol: item.symbol,
          name: item.name,
          totalUsd: Number(item.totalUsd || 0),
        })),
      });
      setUserSaveNotice(data?.message || "User updated successfully.");
      setSelectedUserDetail(data || null);
      await loadAdminUsers({ withLoading: false, statusFilter: overviewFilter });
      await loadKycRequests({ withLoading: false });
      await loadDepositRequests({ withLoading: false });
    } catch (saveError) {
      setUserSaveError(saveError.message || "Could not save user.");
    } finally {
      setUserSaveLoading(false);
    }
  };

  const openSection = (sectionKey) => {
    setActiveSection(sectionKey);
    setConsoleOpen(false);
  };

  const openDepositSubsection = (subsection) => {
    setActiveSection("deposit");
    setActiveDepositSubsection(subsection);
    setDepositMenuOpen(true);
    setConsoleOpen(false);
  };

  const statsCards = [
    {
      key: "all",
      title: "Total Users",
      value: kycStats.totalUsers,
      subtitle: "Registered accounts",
    },
    {
      key: "pending",
      title: "Pending Verifications",
      value: kycStats.pendingVerifications,
      subtitle: "Needs review",
    },
    {
      key: "authenticated",
      title: "Authenticated",
      value: kycStats.authenticatedUsers,
      subtitle: "KYC approved users",
    },
    {
      key: "rejected",
      title: "Rejected",
      value: kycStats.rejectedUsers,
      subtitle: "Review failed",
    },
  ];

  return (
    <main className={`admin-shell ${consoleOpen ? "console-open" : ""}`}>
      <button type="button" className="admin-sidebar-toggle" onClick={() => setConsoleOpen((open) => !open)}>
        <i className={`fas ${consoleOpen ? "fa-times" : "fa-bars"}`} />
      </button>

      {consoleOpen ? <button type="button" className="admin-sidebar-overlay" onClick={() => setConsoleOpen(false)} /> : null}

      <aside className="admin-sidebar">
        <div className="admin-logo">
          <i className="fas fa-user-shield" />
          <span>Admin Console</span>
        </div>

        <nav className="admin-nav">
          <button type="button" className={activeSection === "overview" ? "active" : ""} onClick={() => openSection("overview")}>
            <i className="fas fa-chart-pie" />
            Overview
          </button>

          <button type="button" className={activeSection === "notice" ? "active" : ""} onClick={() => openSection("notice")}>
            <i className="fas fa-bullhorn" />
            Notice Section
          </button>

          <button
            type="button"
            className={activeSection === "deposit" ? "active" : ""}
            onClick={() => {
              setActiveSection("deposit");
              setDepositMenuOpen((value) => !value);
            }}
          >
            <i className="fas fa-wallet" />
            Deposit Section
            <i className={`fas admin-nav-caret ${depositMenuOpen ? "fa-chevron-up" : "fa-chevron-down"}`} />
          </button>

          {depositMenuOpen ? (
            <div className="admin-submenu">
              <button
                type="button"
                className={activeSection === "deposit" && activeDepositSubsection === "assets" ? "active" : ""}
                onClick={() => openDepositSubsection("assets")}
              >
                Deposit Asset Configuration
              </button>
              <button
                type="button"
                className={activeSection === "deposit" && activeDepositSubsection === "verification" ? "active" : ""}
                onClick={() => openDepositSubsection("verification")}
              >
                Deposit Verification
              </button>
            </div>
          ) : null}

          <button type="button" className={activeSection === "kyc" ? "active" : ""} onClick={() => openSection("kyc")}>
            <i className="fas fa-id-card" />
            KYC Requests
          </button>
        </nav>
      </aside>

      <section className="admin-main">
        <header className="admin-header">
          <div>
            <p className="admin-eyebrow">Separate Admin URL</p>
            <h1>CryptoByte Pro Admin Panel</h1>
          </div>

          <div className="admin-actions">
            <button type="button" className="btn btn-ghost" onClick={onGoAuth}>
              Open Auth Page
            </button>
            <button type="button" className="btn btn-primary" onClick={onBackHome}>
              Back to Website
            </button>
          </div>
        </header>

        {activeSection === "overview" ? (
          <>
            <div className="admin-grid admin-grid-clickable">
              {statsCards.map((card) => (
                <button
                  type="button"
                  key={card.key}
                  className={`admin-stat-card ${overviewFilter === card.key ? "active" : ""}`}
                  onClick={() => {
                    setOverviewFilter(card.key);
                    setSelectedUserDetail(null);
                  }}
                >
                  <h3>{card.title}</h3>
                  <p>{card.value}</p>
                  <span>{card.subtitle}</span>
                </button>
              ))}
            </div>

            <section className="admin-kyc-board">
              <div className="admin-kyc-board-header">
                <h2>User Directory</h2>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => loadAdminUsers({ statusFilter: overviewFilter })}
                  disabled={usersLoading}
                >
                  {usersLoading ? "Refreshing..." : "Refresh Users"}
                </button>
              </div>

              {usersError ? <p className="admin-kyc-error">{usersError}</p> : null}
              {usersLoading ? <p className="admin-kyc-empty">Loading users...</p> : null}

              {!usersLoading && adminUsers.length ? (
                <div className="admin-directory-layout">
                  <div className="admin-directory-list">
                    {adminUsers.map((user) => {
                      const badge = getAdminKycBadgeLabel(user.kycStatus);
                      return (
                        <button
                          type="button"
                          key={user.userId}
                          className={`admin-user-item ${selectedUserId === user.userId ? "active" : ""}`}
                          onClick={async () => {
                            setSelectedUserId(user.userId);
                            await loadAdminUserDetail(user.userId);
                            setUserModalOpen(true);
                          }}
                        >
                          <span className="admin-user-avatar">
                            {user.avatarUrl ? (
                              <img src={user.avatarUrl} alt={`${user.name || "User"} avatar`} />
                            ) : (
                              <strong>{String(user.name || "U").charAt(0).toUpperCase()}</strong>
                            )}
                          </span>
                          <span className="admin-user-meta">
                            <strong>{user.name || "User"}</strong>
                            <small>User ID: {user.userId || "-"}</small>
                            <small>{user.email || "-"}</small>
                            <span className={`admin-kyc-badge ${badge.className}`}>{badge.text}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="admin-directory-detail">
                    <div className="admin-user-detail-card">
                      <h3>Floating User Form</h3>
                      <p className="admin-kyc-empty">User list থেকে profile click করলে full editable popup form open হবে.</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {!usersLoading && !adminUsers.length ? <p className="admin-kyc-empty">No user found for this filter.</p> : null}
            </section>

          </>
        ) : null}

        {activeSection === "notice" ? (
          <section className="admin-kyc-board">
            <div className="admin-kyc-board-header">
              <h2>Notice Section</h2>
            </div>

            <form className="prodash-form" onSubmit={handlePublishNotice}>
              <label>
                Notice Text
                <textarea
                  rows={3}
                  value={noticeInput}
                  onChange={(event) => setNoticeInput(event.target.value)}
                  placeholder="Enter notice text shown on top of user dashboard"
                />
              </label>

              {noticeUpdatedAt ? <p className="admin-kyc-empty">Last update: {formatAdminTime(noticeUpdatedAt)}</p> : null}
              {noticeError ? <p className="admin-kyc-error">{noticeError}</p> : null}
              {noticeSuccess ? <p className="admin-kyc-notice">{noticeSuccess}</p> : null}

              <button type="submit" className="btn btn-primary" disabled={noticeSubmitting}>
                {noticeSubmitting ? "Publishing..." : "Publish Notice"}
              </button>
            </form>
          </section>
        ) : null}

        {activeSection === "deposit" && activeDepositSubsection === "assets" ? (
          <section className="admin-kyc-board">
            <div className="admin-kyc-board-header">
              <h2>Deposit Asset Configuration</h2>
              <button type="button" className="btn btn-ghost" onClick={() => loadDepositAssets()} disabled={assetsLoading}>
                {assetsLoading ? "Refreshing..." : "Refresh Assets"}
              </button>
            </div>

            <div className="admin-grid" style={{ marginTop: "0" }}>
              <article>
                <h3>Total Assets</h3>
                <p>{assetStats.totalAssets}</p>
                <span>Configured assets</span>
              </article>
              <article>
                <h3>Enabled Assets</h3>
                <p>{assetStats.enabledAssets}</p>
                <span>Visible to users</span>
              </article>
            </div>

            <form className="prodash-form" onSubmit={submitAsset}>
              <label>
                Symbol
                <input
                  type="text"
                  value={assetForm.symbol}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, symbol: event.target.value.toUpperCase() }))}
                  placeholder="BTC"
                />
              </label>

              <label>
                Name
                <input
                  type="text"
                  value={assetForm.name}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Bitcoin"
                />
              </label>

              <label>
                Chain Name
                <input
                  type="text"
                  value={assetForm.chainName}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, chainName: event.target.value }))}
                  placeholder="Bitcoin / ERC20 / TRC20"
                />
              </label>

              <label>
                Recharge Address
                <input
                  type="text"
                  value={assetForm.rechargeAddress}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, rechargeAddress: event.target.value }))}
                  placeholder="Wallet address"
                />
              </label>

              <label>
                QR Code Value
                <input
                  type="text"
                  value={assetForm.qrCodeData}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, qrCodeData: event.target.value }))}
                  placeholder="QR image URL or data URI"
                />
              </label>

              <label>
                Min Amount (USD)
                <input
                  type="number"
                  step="0.01"
                  value={assetForm.minAmountUsd}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, minAmountUsd: event.target.value }))}
                />
              </label>

              <label>
                Max Amount (USD)
                <input
                  type="number"
                  step="0.01"
                  value={assetForm.maxAmountUsd}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, maxAmountUsd: event.target.value }))}
                />
              </label>

              <label>
                Sort Order
                <input
                  type="number"
                  value={assetForm.sortOrder}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                />
              </label>

              <label className="prodash-checkbox-label">
                <input
                  type="checkbox"
                  checked={assetForm.isEnabled}
                  onChange={(event) => setAssetForm((prev) => ({ ...prev, isEnabled: event.target.checked }))}
                />
                Enabled for user deposits
              </label>

              <div className="admin-actions" style={{ paddingTop: "0.25rem" }}>
                <button type="submit" className="btn btn-primary" disabled={assetSaving}>
                  {assetSaving ? "Saving..." : assetForm.assetId ? "Update Asset" : "Add Asset"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={resetAssetForm}>
                  Reset
                </button>
              </div>

              {assetsError ? <p className="admin-kyc-error">{assetsError}</p> : null}
              {assetsNotice ? <p className="admin-kyc-notice">{assetsNotice}</p> : null}
            </form>

            {!assetsLoading && depositAssets.length ? (
              <div className="admin-kyc-table-wrap">
                <table className="admin-kyc-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Chain</th>
                      <th>Min / Max</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depositAssets.map((asset) => (
                      <tr key={asset.assetId}>
                        <td>
                          <strong>{asset.symbol}</strong>
                          <span>{asset.name}</span>
                        </td>
                        <td>{asset.chainName}</td>
                        <td>
                          <strong>${formatUsdAmount(asset.minAmountUsd)}</strong>
                          <span>to ${formatUsdAmount(asset.maxAmountUsd)}</span>
                        </td>
                        <td>
                          <span className={`admin-kyc-badge ${asset.isEnabled ? "is-authenticated" : "is-rejected"}`}>
                            {asset.isEnabled ? "Enabled" : "Disabled"}
                          </span>
                        </td>
                        <td>
                          <button type="button" className="admin-approve-btn" onClick={() => editAsset(asset)}>
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {!assetsLoading && !depositAssets.length ? <p className="admin-kyc-empty">No deposit asset configured yet.</p> : null}
          </section>
        ) : null}

        {activeSection === "deposit" && activeDepositSubsection === "verification" ? (
          <>
            <section className="admin-kyc-board">
              <div className="admin-kyc-board-header">
                <h2>Deposit Verification Queue</h2>
                <button type="button" className="btn btn-ghost" onClick={() => loadDepositRequests()} disabled={depositLoading}>
                  {depositLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              <div className="admin-grid" style={{ marginTop: "0" }}>
                <article>
                  <h3>Total</h3>
                  <p>{depositStats.totalRequests}</p>
                  <span>All requests</span>
                </article>
                <article>
                  <h3>Pending</h3>
                  <p>{depositStats.pendingRequests}</p>
                  <span>Awaiting verification</span>
                </article>
                <article>
                  <h3>Approved</h3>
                  <p>{depositStats.approvedRequests}</p>
                  <span>Credited to wallets</span>
                </article>
                <article>
                  <h3>Rejected</h3>
                  <p>{depositStats.rejectedRequests}</p>
                  <span>Declined requests</span>
                </article>
              </div>

              {depositNotice ? <p className="admin-kyc-notice">{depositNotice}</p> : null}
              {depositError ? <p className="admin-kyc-error">{depositError}</p> : null}
              {depositLoading ? <p className="admin-kyc-empty">Loading deposit requests...</p> : null}

              {!depositLoading && !depositRequests.length ? <p className="admin-kyc-empty">No deposit requests yet.</p> : null}

              {!depositLoading && depositRequests.length ? (
                <div className="admin-kyc-table-wrap">
                  <table className="admin-kyc-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Asset</th>
                        <th>Amount (USD)</th>
                        <th>Status</th>
                        <th>Submitted</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {depositRequests.map((item) => {
                        const badge = getAdminDepositBadgeLabel(item.status);
                        const isPending = badge.className === "is-pending";
                        const isReviewing = reviewingDepositId === item.requestId;

                        return (
                          <tr key={item.requestId}>
                            <td>
                              <strong>{item.accountName || "User"}</strong>
                              <span>{item.accountEmail || "-"}</span>
                              <small>ID {item.userId}</small>
                            </td>
                            <td>
                              <strong>{item.assetSymbol}</strong>
                              <span>{item.chainName}</span>
                            </td>
                            <td>${formatUsdAmount(item.amountUsd)}</td>
                            <td>
                              <span className={`admin-kyc-badge ${badge.className}`}>{badge.text}</span>
                            </td>
                            <td>{formatAdminTime(item.submittedAt)}</td>
                            <td>
                              <div className="admin-kyc-actions">
                                <button
                                  type="button"
                                  className="admin-approve-btn"
                                  onClick={() => {
                                    setSelectedDepositRequestId(item.requestId);
                                    setDepositRejectReason("");
                                    setDepositModalOpen(true);
                                  }}
                                >
                                  Open Form
                                </button>
                                <button
                                  type="button"
                                  className="admin-approve-btn"
                                  disabled={!isPending || isReviewing}
                                  onClick={() => handleReviewDeposit(item.requestId, "approved")}
                                >
                                  Approve
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>

          </>
        ) : null}

        {activeSection === "kyc" ? (
          <>
            <section className="admin-kyc-board">
              <div className="admin-kyc-board-header">
                <h2>KYC Request Section</h2>
                <button type="button" className="btn btn-ghost" onClick={() => loadKycRequests()} disabled={loadingKyc}>
                  {loadingKyc ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              {kycNotice ? <p className="admin-kyc-notice">{kycNotice}</p> : null}
              {kycError ? <p className="admin-kyc-error">{kycError}</p> : null}
              {loadingKyc ? <p className="admin-kyc-empty">Loading KYC requests...</p> : null}

              {!loadingKyc && !kycRequests.length ? (
                <p className="admin-kyc-empty">No KYC submissions yet. User submit করলে এখানে auto show করবে.</p>
              ) : null}

              {!loadingKyc && kycRequests.length ? (
                <div className="admin-kyc-table-wrap">
                  <table className="admin-kyc-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Certification</th>
                        <th>SSN</th>
                        <th>Status</th>
                        <th>Submitted</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kycRequests.map((item) => {
                        const badge = getAdminKycBadgeLabel(item.status);
                        const isPending = badge.className === "is-pending";
                        const isReviewing = reviewingRequestId === item.requestId;

                        return (
                          <tr key={item.requestId}>
                            <td>
                              <strong>{item.accountName || item.fullName || "User"}</strong>
                              <span>{item.accountEmail || "-"}</span>
                              <small>ID {item.userId}</small>
                            </td>
                            <td>{String(item.certification || "-").replaceAll("_", " ")}</td>
                            <td>{item.ssn || "-"}</td>
                            <td>
                              <span className={`admin-kyc-badge ${badge.className}`}>{badge.text}</span>
                            </td>
                            <td>{formatAdminTime(item.submittedAt)}</td>
                            <td>
                              <div className="admin-kyc-actions">
                                <button
                                  type="button"
                                  className="admin-approve-btn"
                                  onClick={() => {
                                    setSelectedKycRequestId(item.requestId);
                                    setKycRejectReason("");
                                    setKycModalOpen(true);
                                  }}
                                >
                                  Open Form
                                </button>
                                <button
                                  type="button"
                                  className="admin-approve-btn"
                                  disabled={!isPending || isReviewing}
                                  onClick={() => handleReview(item.requestId, "authenticated")}
                                >
                                  Approve
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>

          </>
        ) : null}

        {userModalOpen && selectedUserDetail?.user ? (
          <div className="admin-modal-root" role="dialog" aria-modal="true" aria-label="User Details Form">
            <button type="button" className="admin-modal-overlay" onClick={() => setUserModalOpen(false)} />
            <article className="admin-modal-card admin-modal-wide">
              <header className="admin-modal-header">
                <div>
                  <p className="admin-eyebrow">User Directory</p>
                  <h2>User Details Form</h2>
                </div>
                <button type="button" className="admin-modal-close" onClick={() => setUserModalOpen(false)}>
                  <i className="fas fa-times" />
                </button>
              </header>

              <div className="admin-modal-body">
                <div className="admin-user-info-grid">
                  <div>
                    <label>User ID</label>
                    <strong>{userForm.userId || "-"}</strong>
                  </div>
                  <label>
                    Name
                    <input value={userForm.name} onChange={(event) => handleUserFormChange("name", event.target.value)} />
                  </label>
                  <label>
                    First Name
                    <input value={userForm.firstName} onChange={(event) => handleUserFormChange("firstName", event.target.value)} />
                  </label>
                  <label>
                    Last Name
                    <input value={userForm.lastName} onChange={(event) => handleUserFormChange("lastName", event.target.value)} />
                  </label>
                  <label>
                    Email
                    <input value={userForm.email} onChange={(event) => handleUserFormChange("email", event.target.value)} />
                  </label>
                  <label>
                    Mobile
                    <input value={userForm.mobile} onChange={(event) => handleUserFormChange("mobile", event.target.value)} />
                  </label>
                  <label>
                    Avatar URL
                    <input value={userForm.avatarUrl} onChange={(event) => handleUserFormChange("avatarUrl", event.target.value)} />
                  </label>
                  <label>
                    KYC Status
                    <select value={userForm.kycStatus} onChange={(event) => handleUserFormChange("kycStatus", event.target.value)}>
                      <option value="pending">Pending</option>
                      <option value="authenticated">Authenticated</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </label>
                </div>

                <div className="admin-wallet-editor">
                  <div className="admin-kyc-board-header" style={{ marginBottom: "0.35rem" }}>
                    <h3>Wallet Balances (Editable)</h3>
                    <button type="button" className="btn btn-ghost" onClick={addWalletItem}>
                      Add Asset
                    </button>
                  </div>

                  {userForm.walletBalances.length ? (
                    <div className="admin-wallet-editor-list">
                      {userForm.walletBalances.map((item, index) => (
                        <article key={`wallet-${index}`} className="admin-wallet-editor-row">
                          <input
                            placeholder="Symbol"
                            value={item.symbol}
                            onChange={(event) => handleWalletItemChange(index, "symbol", event.target.value.toUpperCase())}
                          />
                          <input
                            placeholder="Name"
                            value={item.name}
                            onChange={(event) => handleWalletItemChange(index, "name", event.target.value)}
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="USD"
                            value={item.totalUsd}
                            onChange={(event) => handleWalletItemChange(index, "totalUsd", event.target.value)}
                          />
                          <button type="button" className="admin-reject-btn" onClick={() => removeWalletItem(index)}>
                            Remove
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-kyc-empty">No wallet assets in this account.</p>
                  )}
                </div>

                {userSaveError ? <p className="admin-kyc-error">{userSaveError}</p> : null}
                {userSaveNotice ? <p className="admin-kyc-notice">{userSaveNotice}</p> : null}

                <div className="admin-actions">
                  <button type="button" className="btn btn-primary" disabled={userSaveLoading} onClick={handleSaveUser}>
                    {userSaveLoading ? "Saving..." : "Save All Changes"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setUserModalOpen(false)}>
                    Close
                  </button>
                </div>

                <div className="admin-history-grid">
                  <section>
                    <h4>Deposit History</h4>
                    {selectedUserDetail.history?.deposit?.length ? (
                      selectedUserDetail.history.deposit.map((item) => {
                        const badge = getAdminDepositBadgeLabel(item.status);
                        return (
                          <article key={item.requestId} className="admin-history-card">
                            <div>
                              <strong>{item.assetSymbol}</strong>
                              <span>${formatUsdAmount(item.amountUsd)}</span>
                            </div>
                            <span className={`admin-kyc-badge ${badge.className}`}>{badge.text}</span>
                            <small>{formatAdminTime(item.submittedAt)}</small>
                            {isImageDataUri(item.screenshotFileData) ? (
                              <img className="admin-proof-image" src={item.screenshotFileData} alt={item.screenshotFileName || "deposit screenshot"} />
                            ) : (
                              <p className="admin-kyc-empty">Screenshot: {item.screenshotFileName || "Not available"}</p>
                            )}
                          </article>
                        );
                      })
                    ) : (
                      <p className="admin-kyc-empty">No deposit history.</p>
                    )}
                  </section>

                  <section>
                    <h4>KYC History</h4>
                    {selectedUserDetail.history?.kyc?.length ? (
                      selectedUserDetail.history.kyc.map((item) => {
                        const badge = getAdminKycBadgeLabel(item.status);
                        return (
                          <article key={item.requestId} className="admin-history-card">
                            <div>
                              <strong>{String(item.certification || "-").replaceAll("_", " ")}</strong>
                              <span>SSN: {item.ssn || "-"}</span>
                            </div>
                            <span className={`admin-kyc-badge ${badge.className}`}>{badge.text}</span>
                            <small>{formatAdminTime(item.submittedAt)}</small>
                            <div className="admin-proof-grid">
                              {isImageDataUri(item.frontFileData) ? (
                                <img className="admin-proof-image" src={item.frontFileData} alt={item.frontFileName || "front proof"} />
                              ) : (
                                <p className="admin-kyc-empty">Front: {item.frontFileName || "N/A"}</p>
                              )}
                              {isImageDataUri(item.backFileData) ? (
                                <img className="admin-proof-image" src={item.backFileData} alt={item.backFileName || "back proof"} />
                              ) : (
                                <p className="admin-kyc-empty">Back: {item.backFileName || "N/A"}</p>
                              )}
                            </div>
                          </article>
                        );
                      })
                    ) : (
                      <p className="admin-kyc-empty">No KYC history.</p>
                    )}
                  </section>
                </div>
              </div>
            </article>
          </div>
        ) : null}

        {depositModalOpen && selectedDepositRequest ? (
          <div className="admin-modal-root" role="dialog" aria-modal="true" aria-label="Deposit Verification Form">
            <button type="button" className="admin-modal-overlay" onClick={() => setDepositModalOpen(false)} />
            <article className="admin-modal-card">
              <header className="admin-modal-header">
                <div>
                  <p className="admin-eyebrow">Deposit Review</p>
                  <h2>Deposit Verification Form</h2>
                </div>
                <button type="button" className="admin-modal-close" onClick={() => setDepositModalOpen(false)}>
                  <i className="fas fa-times" />
                </button>
              </header>

              <div className="admin-modal-body">
                <div className="admin-user-info-grid">
                  <div>
                    <label>User</label>
                    <strong>{selectedDepositRequest.accountName || "User"}</strong>
                    <span>{selectedDepositRequest.accountEmail || "-"}</span>
                  </div>
                  <div>
                    <label>User ID</label>
                    <strong>{selectedDepositRequest.userId}</strong>
                  </div>
                  <div>
                    <label>Asset</label>
                    <strong>{selectedDepositRequest.assetSymbol}</strong>
                    <span>{selectedDepositRequest.chainName || "-"}</span>
                  </div>
                  <div>
                    <label>Amount (USD)</label>
                    <strong>${formatUsdAmount(selectedDepositRequest.amountUsd)}</strong>
                  </div>
                  <div>
                    <label>Current Status</label>
                    <span className={`admin-kyc-badge ${getAdminDepositBadgeLabel(selectedDepositRequest.status).className}`}>
                      {getAdminDepositBadgeLabel(selectedDepositRequest.status).text}
                    </span>
                  </div>
                  <div>
                    <label>Submitted</label>
                    <strong>{formatAdminTime(selectedDepositRequest.submittedAt)}</strong>
                  </div>
                </div>

                {isImageDataUri(selectedDepositRequest.screenshotFileData) ? (
                  <img className="admin-proof-image" src={selectedDepositRequest.screenshotFileData} alt={selectedDepositRequest.screenshotFileName || "transaction screenshot"} />
                ) : (
                  <p className="admin-kyc-empty">Screenshot file: {selectedDepositRequest.screenshotFileName || "N/A"}</p>
                )}

                <label>
                  Reject Reason (required when reject)
                  <textarea
                    rows={3}
                    value={depositRejectReason}
                    onChange={(event) => setDepositRejectReason(event.target.value)}
                    placeholder="Why are you rejecting this deposit?"
                  />
                </label>

                <div className="admin-kyc-actions admin-modal-actions">
                  <button
                    type="button"
                    className="admin-approve-btn"
                    disabled={reviewingDepositId === selectedDepositRequest.requestId}
                    onClick={() => handleReviewDeposit(selectedDepositRequest.requestId, "approved")}
                  >
                    Approve Deposit
                  </button>
                  <button
                    type="button"
                    className="admin-approve-btn"
                    disabled={reviewingDepositId === selectedDepositRequest.requestId}
                    onClick={() => handleReviewDeposit(selectedDepositRequest.requestId, "pending")}
                  >
                    Move To Pending
                  </button>
                  <button
                    type="button"
                    className="admin-reject-btn"
                    disabled={reviewingDepositId === selectedDepositRequest.requestId}
                    onClick={() => handleReviewDeposit(selectedDepositRequest.requestId, "rejected")}
                  >
                    Reject Deposit
                  </button>
                </div>
              </div>
            </article>
          </div>
        ) : null}

        {kycModalOpen && selectedKycRequest ? (
          <div className="admin-modal-root" role="dialog" aria-modal="true" aria-label="KYC Verification Form">
            <button type="button" className="admin-modal-overlay" onClick={() => setKycModalOpen(false)} />
            <article className="admin-modal-card">
              <header className="admin-modal-header">
                <div>
                  <p className="admin-eyebrow">KYC Review</p>
                  <h2>KYC Verification Form</h2>
                </div>
                <button type="button" className="admin-modal-close" onClick={() => setKycModalOpen(false)}>
                  <i className="fas fa-times" />
                </button>
              </header>

              <div className="admin-modal-body">
                <div className="admin-user-info-grid">
                  <div>
                    <label>User</label>
                    <strong>{selectedKycRequest.accountName || selectedKycRequest.fullName || "User"}</strong>
                    <span>{selectedKycRequest.accountEmail || "-"}</span>
                  </div>
                  <div>
                    <label>User ID</label>
                    <strong>{selectedKycRequest.userId}</strong>
                  </div>
                  <div>
                    <label>Certification</label>
                    <strong>{String(selectedKycRequest.certification || "-").replaceAll("_", " ")}</strong>
                  </div>
                  <div>
                    <label>SSN</label>
                    <strong>{selectedKycRequest.ssn || "-"}</strong>
                  </div>
                  <div>
                    <label>Current Status</label>
                    <span className={`admin-kyc-badge ${getAdminKycBadgeLabel(selectedKycRequest.status).className}`}>
                      {getAdminKycBadgeLabel(selectedKycRequest.status).text}
                    </span>
                  </div>
                  <div>
                    <label>Submitted</label>
                    <strong>{formatAdminTime(selectedKycRequest.submittedAt)}</strong>
                  </div>
                </div>

                <div className="admin-proof-grid">
                  {isImageDataUri(selectedKycRequest.frontFileData) ? (
                    <img className="admin-proof-image" src={selectedKycRequest.frontFileData} alt={selectedKycRequest.frontFileName || "front side"} />
                  ) : (
                    <p className="admin-kyc-empty">Front side file: {selectedKycRequest.frontFileName || "N/A"}</p>
                  )}

                  {isImageDataUri(selectedKycRequest.backFileData) ? (
                    <img className="admin-proof-image" src={selectedKycRequest.backFileData} alt={selectedKycRequest.backFileName || "back side"} />
                  ) : (
                    <p className="admin-kyc-empty">Back side file: {selectedKycRequest.backFileName || "N/A"}</p>
                  )}
                </div>

                <label>
                  Reject Reason (required when reject)
                  <textarea
                    rows={3}
                    value={kycRejectReason}
                    onChange={(event) => setKycRejectReason(event.target.value)}
                    placeholder="Why are you rejecting this KYC request?"
                  />
                </label>

                <div className="admin-kyc-actions admin-modal-actions">
                  <button
                    type="button"
                    className="admin-approve-btn"
                    disabled={reviewingRequestId === selectedKycRequest.requestId}
                    onClick={() => handleReview(selectedKycRequest.requestId, "authenticated")}
                  >
                    Approve KYC
                  </button>
                  <button
                    type="button"
                    className="admin-approve-btn"
                    disabled={reviewingRequestId === selectedKycRequest.requestId}
                    onClick={() => handleReview(selectedKycRequest.requestId, "pending")}
                  >
                    Move To Pending
                  </button>
                  <button
                    type="button"
                    className="admin-reject-btn"
                    disabled={reviewingRequestId === selectedKycRequest.requestId}
                    onClick={() => handleReview(selectedKycRequest.requestId, "rejected")}
                  >
                    Reject KYC
                  </button>
                </div>
              </div>
            </article>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function MobileAuthPage({ authSnapshot, onAuthenticated }) {
  const flow = useAuthFlow({
    initialView: "login",
    authSnapshot,
    onAuthenticated,
  });

  return (
    <main className="mobile-auth-shell">
      <div className="mobile-crypto-bg" />
      <div className="mobile-grid-overlay" />

      <section className="mobile-auth-card">
        <div className="mobile-auth-brand">
          <i className="fas fa-coins" />
          <span>CryptoByte</span>
        </div>

        <div className="mobile-auth-copy">
          <p className="mobile-auth-kicker">Secure Mobile Access</p>
          <h1>{flow.heading}</h1>
          <p>{flow.subtitle}</p>
        </div>

        <div className="mobile-auth-tabs">
          <button type="button" className={flow.view === "login" ? "active" : ""} onClick={() => flow.setView("login")}>
            Login
          </button>
          <button type="button" className={flow.view === "signup" ? "active" : ""} onClick={() => flow.setView("signup")}>
            Sign Up
          </button>
        </div>

        <AuthForms flow={flow} classes={mobileAuthClasses} />

        <div className="mobile-auth-footer">
          <span>Database + email OTP active</span>
          <span>Passwords are stored as encrypted hashes on the backend</span>
        </div>
      </section>
    </main>
  );
}

function MobileLoadingPage() {
  return (
    <main className="mobile-auth-shell">
      <div className="mobile-crypto-bg" />
      <div className="mobile-grid-overlay" />
      <section className="mobile-auth-card mobile-auth-loading">
        <div className="mobile-auth-brand">
          <i className="fas fa-coins" />
          <span>CryptoByte</span>
        </div>
        <div className="mobile-auth-copy">
          <p className="mobile-auth-kicker">Secure Session</p>
          <h1>Checking your account</h1>
          <p>Please wait while we verify your saved login session.</p>
        </div>
      </section>
    </main>
  );
}

function MobileAppFlowPage({ authSnapshot, onAuthChanged, authReady }) {
  const authService = getAuthService();

  const handleLogout = async () => {
    await authService.logout({ sessionToken: authSnapshot.sessionToken });
    await onAuthChanged();
  };

  const handleProfileUpdate = async ({ firstName, lastName, mobile, avatarUrl }) => {
    const data = await authService.updateProfile({
      sessionToken: authSnapshot.sessionToken,
      firstName,
      lastName,
      mobile,
      avatarUrl,
    });
    await onAuthChanged();
    return data;
  };

  const handlePasswordChange = async ({ currentPassword, newPassword, confirmPassword }) => {
    return authService.changePassword({
      sessionToken: authSnapshot.sessionToken,
      currentPassword,
      newPassword,
      confirmPassword,
    });
  };

  const handleKycSubmit = async ({
    fullName,
    certification,
    ssn,
    frontFileName,
    frontFileData,
    backFileName,
    backFileData,
  }) => {
    const data = await authService.submitKyc({
      sessionToken: authSnapshot.sessionToken,
      fullName,
      certification,
      ssn,
      frontFileName,
      frontFileData,
      backFileName,
      backFileData,
    });
    await onAuthChanged();
    return data;
  };

  const handleKycRefresh = async () => {
    return authService.getKycStatus({
      sessionToken: authSnapshot.sessionToken,
    });
  };

  const handleDashboardSnapshot = async () => {
    return authService.getDashboardSnapshot({
      sessionToken: authSnapshot.sessionToken,
    });
  };

  const handleCreateDepositRequest = async ({ assetId, amountUsd, screenshotFileName, screenshotFileData }) => {
    return authService.createDepositRequest({
      sessionToken: authSnapshot.sessionToken,
      assetId,
      amountUsd,
      screenshotFileName,
      screenshotFileData,
    });
  };

  const handleDepositRecords = async () => {
    return authService.getDepositRecords({
      sessionToken: authSnapshot.sessionToken,
    });
  };

  if (!authReady) {
    return <MobileLoadingPage />;
  }

  if (authSnapshot.hasAccount && authSnapshot.isLoggedIn) {
    return (
      <PremiumDashboardPage
        user={authSnapshot}
        onLogout={handleLogout}
        onProfileUpdate={handleProfileUpdate}
        onPasswordChange={handlePasswordChange}
        onKycSubmit={handleKycSubmit}
        onKycRefresh={handleKycRefresh}
        onDashboardSnapshot={handleDashboardSnapshot}
        onCreateDepositRequest={handleCreateDepositRequest}
        onDepositRecords={handleDepositRecords}
      />
    );
  }

  return <MobileAuthPage authSnapshot={authSnapshot} onAuthenticated={onAuthChanged} />;
}

function HomePage({ assets, stats, activeFaq, onFaqToggle, mobileMenuOpen, setMobileMenuOpen, canvasRef }) {
  return (
    <div>
      <nav className="navbar">
        <div className="container">
          <div className="nav-brand">
            <div className="logo">
              <i className="fas fa-cube" />
              <span>CryptoByte Pro</span>
            </div>
          </div>

          <div className={`nav-links ${mobileMenuOpen ? "active" : ""}`}>
            <a href="#features" onClick={() => setMobileMenuOpen(false)}>
              Features
            </a>
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>
              How it Works
            </a>
            <a href="#download" onClick={() => setMobileMenuOpen(false)}>
              Download
            </a>
            <a href="#faq" onClick={() => setMobileMenuOpen(false)}>
              FAQ
            </a>
          </div>

          <div className="nav-actions">
            <button type="button" className="btn btn-ghost" onClick={() => goToRoute(ROUTES.login)}>
              Login
            </button>
            <button type="button" className="btn btn-primary" onClick={() => goToRoute(ROUTES.signup)}>
              Start Trading
            </button>
          </div>

          <button
            type="button"
            className={`mobile-menu-toggle ${mobileMenuOpen ? "active" : ""}`}
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label="Open menu"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-background">
          <div className="gradient-orb orb-1" />
          <div className="gradient-orb orb-2" />
          <div className="gradient-orb orb-3" />
        </div>

        <div className="container">
          <div className="hero-content">
            <div className="hero-text">
              <h1 className="hero-title">
                <span className="gradient-text">Advanced Crypto Trading</span>
                <br />
                Made Simple &amp; Secure
              </h1>

              <p className="hero-description">
                Trade cryptocurrencies with institutional-grade tools, real-time analytics, and
                bank-level security. Join thousands of traders who trust our platform.
              </p>

              <div className="hero-actions">
                <button type="button" className="btn btn-primary btn-large" onClick={() => goToRoute(ROUTES.signup)}>
                  <i className="fas fa-rocket" />
                  Start Trading Now
                </button>
                <button type="button" className="btn btn-ghost btn-large" onClick={() => goToRoute(ROUTES.login)}>
                  <i className="fas fa-play" />
                  Login
                </button>
              </div>

              <div className="hero-stats">
                <div className="stat">
                  <div className="stat-number">${stats.volume.toFixed(1)}B+</div>
                  <div className="stat-label">Trading Volume</div>
                </div>
                <div className="stat">
                  <div className="stat-number">{stats.users}K+</div>
                  <div className="stat-label">Active Users</div>
                </div>
                <div className="stat">
                  <div className="stat-number">{stats.uptime.toFixed(1)}%</div>
                  <div className="stat-label">Uptime</div>
                </div>
              </div>
            </div>

            <div className="hero-visual">
              <div className="crypto-card">
                <div className="card-header">
                  <div className="card-title">Live Portfolio</div>
                  <div className="card-balance">$124,567.89</div>
                </div>

                <div className="crypto-list">
                  {assets.map((asset) => (
                    <div className="crypto-item" key={asset.symbol}>
                      <div className={`crypto-icon ${asset.iconClass}`} />
                      <div className="crypto-info">
                        <div className="crypto-name">{asset.name}</div>
                        <div className="crypto-symbol">{asset.symbol}</div>
                      </div>
                      <div className="crypto-price">
                        <div className="price">{formatPrice(asset.price, asset.symbol)}</div>
                        <div className={`change ${asset.change >= 0 ? "positive" : "negative"}`}>
                          {asset.change >= 0 ? "+" : ""}
                          {asset.change.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="card-chart">
                  <canvas id="portfolioChart" ref={canvasRef} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="features">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Why Choose CryptoByte Pro?</h2>
            <p className="section-description">
              Advanced features designed for both beginners and professional traders
            </p>
          </div>

          <div className="features-grid">
            {features.map((feature) => (
              <div className="feature-card" key={feature.title}>
                <div className="feature-icon">
                  <i className={`fas ${feature.icon}`} />
                </div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-description">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="how-it-works">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">How It Works</h2>
            <p className="section-description">Get started with crypto trading in just 3 simple steps</p>
          </div>

          <div className="steps-container">
            {steps.map((step, index) => (
              <div className="step-group" key={step.title}>
                <div className="step">
                  <div className="step-number">{index + 1}</div>
                  <div className="step-content">
                    <div className="step-icon">
                      <i className={`fas ${step.icon}`} />
                    </div>
                    <h3 className="step-title">{step.title}</h3>
                    <p className="step-description">{step.description}</p>
                  </div>
                </div>
                {index < steps.length - 1 ? <div className="step-connector" /> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="download" className="download">
        <div className="container">
          <div className="download-content">
            <div className="download-text-block">
              <h2 className="section-title">Trade Anywhere, Anytime</h2>
              <p className="section-description">
                Download our mobile app and desktop application for seamless trading experience across all your devices.
              </p>

              <div className="download-buttons">
                <a href="#download" className="download-btn ios">
                  <i className="fab fa-apple" />
                  <div className="download-text">
                    <span className="download-label">Download for</span>
                    <span className="download-platform">iOS</span>
                  </div>
                </a>
                <a href="#download" className="download-btn android">
                  <i className="fab fa-google-play" />
                  <div className="download-text">
                    <span className="download-label">Get it on</span>
                    <span className="download-platform">Google Play</span>
                  </div>
                </a>
                <a href="#download" className="download-btn desktop">
                  <i className="fas fa-desktop" />
                  <div className="download-text">
                    <span className="download-label">Download for</span>
                    <span className="download-platform">Desktop</span>
                  </div>
                </a>
              </div>
            </div>

            <div className="download-visual">
              <div className="phone-mockup">
                <div className="phone-screen">
                  <div className="app-interface">
                    <div className="app-header">
                      <div className="app-title">CryptoByte Pro</div>
                      <div className="app-balance">$45,678.90</div>
                    </div>
                    <div className="app-chart" />
                    <div className="app-actions">
                      <button type="button" className="app-btn buy">Buy</button>
                      <button type="button" className="app-btn sell">Sell</button>
                      <button type="button" className="app-btn swap">Swap</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="faq">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Frequently Asked Questions</h2>
            <p className="section-description">Get answers to the most common questions about our platform</p>
          </div>

          <div className="faq-list">
            {faqs.map((faq, index) => (
              <div className={`faq-item ${activeFaq === index ? "active" : ""}`} key={faq.question}>
                <button type="button" className="faq-question" onClick={() => onFaqToggle(index)}>
                  <span>{faq.question}</span>
                  <i className="fas fa-chevron-down" />
                </button>
                <div className="faq-answer">
                  <p>{faq.answer}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <div className="logo">
                <i className="fas fa-cube" />
                <span>CryptoByte Pro</span>
              </div>
              <p className="footer-description">
                The world&apos;s most trusted cryptocurrency trading platform with advanced security
                and professional tools.
              </p>
              <div className="social-links">
                <a href="#home"><i className="fab fa-twitter" /></a>
                <a href="#home"><i className="fab fa-facebook" /></a>
                <a href="#home"><i className="fab fa-linkedin" /></a>
                <a href="#home"><i className="fab fa-telegram" /></a>
              </div>
            </div>

            <div className="footer-links">
              {footerSections.map((section) => (
                <div className="footer-section" key={section.title}>
                  <h4 className="footer-title">{section.title}</h4>
                  {section.links.map((link) => (
                    <a href="#home" key={link}>{link}</a>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="footer-bottom">
            <div className="footer-copyright">
              <p>&copy; 2024 CryptoByte Pro. All rights reserved.</p>
            </div>
            <div className="footer-legal">
              <a href="#home">Privacy Policy</a>
              <a href="#home">Terms of Service</a>
              <a href="#home">Cookie Policy</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function App() {
  const [route, setRoute] = useState(getRouteFromHash);
  const [authSnapshot, setAuthSnapshot] = useState(readAuthSnapshot);
  const [authReady, setAuthReady] = useState(() => !readAuthSnapshot().sessionToken);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [assets, setAssets] = useState(initialAssets);
  const [activeFaq, setActiveFaq] = useState(0);
  const [stats, setStats] = useState({ volume: 0, users: 0, uptime: 0 });
  const canvasRef = useRef(null);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(getRouteFromHash());
      setMobileMenuOpen(false);
      setAuthSnapshot(readAuthSnapshot());
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const refreshAuthSnapshot = async () => {
    const snapshot = readAuthSnapshot();
    if (!snapshot.sessionToken) {
      setAuthSnapshot(snapshot);
      setAuthReady(true);
      return;
    }

    setAuthReady(false);
    try {
      const data = await getAuthService().getSession(snapshot.sessionToken);
      storeAuthUser(data.user);
      setAuthSnapshot(readAuthSnapshot());
    } catch {
      clearSessionToken();
      setAuthSnapshot(readAuthSnapshot());
    } finally {
      setAuthReady(true);
    }
  };

  useEffect(() => {
    refreshAuthSnapshot();
  }, []);

  useEffect(() => {
    if (!isNativeAppRuntime()) {
      return undefined;
    }

    let active = true;
    const listenerPromise = CapacitorApp.addListener("appUrlOpen", async ({ url }) => {
      if (!active || !isExpectedNativeCallbackUrl(url)) {
        return;
      }

      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch {
        return;
      }

      if (parsedUrl.searchParams.get("provider") !== "google") {
        return;
      }

      const expectedState = consumeNativeGoogleState();
      const receivedState = parsedUrl.searchParams.get("state") || "";
      if (expectedState && receivedState !== expectedState) {
        persistTransientAuthFeedback({ error: "Google sign-in state mismatch হয়েছে. আবার চেষ্টা করো." });
        goToRoute(ROUTES.login);
        setRoute(ROUTES.login);
        return;
      }

      const callbackError = parsedUrl.searchParams.get("error") || "";
      if (callbackError) {
        persistTransientAuthFeedback({ error: callbackError });
        goToRoute(ROUTES.login);
        setRoute(ROUTES.login);
        return;
      }

      const token = parsedUrl.searchParams.get("token") || "";
      if (!token) {
        persistTransientAuthFeedback({ error: "Google token পাওয়া যায়নি. আবার চেষ্টা করো." });
        goToRoute(ROUTES.login);
        setRoute(ROUTES.login);
        return;
      }

      setAuthReady(false);
      try {
        await getAuthService().googleAuth({ token });
        await refreshAuthSnapshot();
        goToRoute(ROUTES.app);
        setRoute(ROUTES.app);
      } catch (error) {
        persistTransientAuthFeedback({ error: error?.message || "Google authentication failed." });
        clearSessionToken();
        await refreshAuthSnapshot();
        goToRoute(ROUTES.login);
        setRoute(ROUTES.login);
      } finally {
        try {
          await Browser.close();
        } catch {
          // Ignore browser close errors.
        }
        setAuthReady(true);
      }
    });

    return () => {
      active = false;
      listenerPromise.then((listener) => listener.remove());
    };
  }, []);

  useEffect(() => {
    if (route !== ROUTES.home) {
      return undefined;
    }

    const sections = document.querySelectorAll("section, .feature-card");
    sections.forEach((section, index) => {
      section.classList.add("fade-in");
      section.style.transitionDelay = `${index * 0.06}s`;
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [route]);

  useEffect(() => {
    if (route !== ROUTES.home) {
      return undefined;
    }

    const targets = { volume: 2.4, users: 500, uptime: 99.9 };
    const startedAt = performance.now();
    let frameId = 0;

    const animate = (time) => {
      const progress = Math.min((time - startedAt) / 1800, 1);
      setStats({
        volume: Number((targets.volume * progress).toFixed(1)),
        users: Math.round(targets.users * progress),
        uptime: Number((targets.uptime * progress).toFixed(1)),
      });

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [route]);

  useEffect(() => {
    if (route !== ROUTES.home) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setAssets((current) =>
        current.map((asset) => {
          const changePercent = (Math.random() - 0.5) * 4;
          return {
            ...asset,
            price: asset.price * (1 + changePercent / 100),
            change: Number(changePercent.toFixed(2)),
          };
        }),
      );
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [route]);

  useEffect(() => {
    if (route !== ROUTES.home) {
      return undefined;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const context = canvas.getContext("2d");
    const points = Array.from({ length: 50 }, (_, index) => ({
      x: (index / 49) * 100,
      y: 50 + Math.sin(index * 0.3) * 20 + Math.random() * 10 - 5,
    }));

    const resizeAndDraw = () => {
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      canvas.width = width;
      canvas.height = height;

      context.clearRect(0, 0, width, height);
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "rgba(103, 126, 234, 0.8)");
      gradient.addColorStop(1, "rgba(103, 126, 234, 0.1)");

      context.beginPath();
      context.moveTo(0, height);
      points.forEach((point) => {
        context.lineTo((point.x / 100) * width, (point.y / 100) * height);
      });
      context.lineTo(width, height);
      context.closePath();
      context.fillStyle = gradient;
      context.fill();

      context.beginPath();
      points.forEach((point, index) => {
        const x = (point.x / 100) * width;
        const y = (point.y / 100) * height;
        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      });
      context.strokeStyle = "#667eea";
      context.lineWidth = 2;
      context.stroke();
    };

    resizeAndDraw();
    const chartInterval = window.setInterval(() => {
      points.forEach((point) => {
        point.y += (Math.random() - 0.5) * 3;
        point.y = Math.max(15, Math.min(85, point.y));
      });
      resizeAndDraw();
    }, 2000);

    window.addEventListener("resize", resizeAndDraw);
    return () => {
      window.clearInterval(chartInterval);
      window.removeEventListener("resize", resizeAndDraw);
    };
  }, [route]);

  if (route === ROUTES.admin) {
    return (
      <AdminPanelPage
        onBackHome={() => goToRoute(ROUTES.home)}
        onGoAuth={() => goToRoute(ROUTES.login)}
      />
    );
  }

  if (route === ROUTES.app) {
    return (
      <MobileAppFlowPage
        authSnapshot={authSnapshot}
        onAuthChanged={refreshAuthSnapshot}
        authReady={authReady}
      />
    );
  }

  if (route === ROUTES.login || route === ROUTES.signup) {
    return (
      <AuthPage
        mode={route}
        authSnapshot={authSnapshot}
        onAuthenticated={refreshAuthSnapshot}
        onBackHome={() => goToRoute(ROUTES.home)}
        onGoAdmin={() => goToRoute(ROUTES.admin)}
      />
    );
  }

  return (
    <HomePage
      assets={assets}
      stats={stats}
      activeFaq={activeFaq}
      onFaqToggle={(index) => setActiveFaq(activeFaq === index ? -1 : index)}
      mobileMenuOpen={mobileMenuOpen}
      setMobileMenuOpen={setMobileMenuOpen}
      canvasRef={canvasRef}
    />
  );
}

export default App;
