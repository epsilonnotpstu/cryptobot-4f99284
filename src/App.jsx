import { useEffect, useRef, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import PremiumDashboardPage from "./features/dashboard/PremiumDashboardPage";
import DepositPage from "./features/dashboard/DepositPage";
import LUMPage from "./features/lum/LUMPage";
import BinaryPage from "./features/binary/BinaryPage";
import TransactionPage from "./features/transaction/TransactionPage";
import AssetsPage from "./features/assets/AssetsPage";
import AdminSectionPage from "./admin/AdminSectionPage";

const ROUTES = {
  home: "/",
  login: "/login",
  signup: "/signup",
  admin: "/admin",
  app: "/app",
};

function sanitizeEnvValue(value = "") {
  return String(value)
    .replace(/\\[nr]/g, "")
    .trim();
}

function sanitizeEnvUrl(value = "") {
  return sanitizeEnvValue(value).replace(/\/+$/, "");
}

const AUTH_CONFIG = {
  useRemote: true,
  apiBase: sanitizeEnvUrl(
    import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:4000" : ""),
  ),
};
const ALLOW_EXTERNAL_API_FALLBACK =
  sanitizeEnvValue(import.meta.env.VITE_ALLOW_EXTERNAL_API_FALLBACK).toLowerCase() === "true";

const AUTH_STORAGE_KEYS = {
  user: "cryptobot2_auth_user",
  session: "cryptobot2_auth_session",
  apiBase: "cryptobot2_api_base",
  nativeGoogleState: "cryptobot2_native_google_state",
  transientError: "cryptobot2_auth_transient_error",
  transientNotice: "cryptobot2_auth_transient_notice",
};

const AUTH_REQUEST_TIMEOUT_MS = 5000;
const PUBLIC_AUTH_BASE_URL = sanitizeEnvUrl(import.meta.env.VITE_PUBLIC_AUTH_BASE_URL || "");
const NATIVE_AUTH_CALLBACK_URL = sanitizeEnvUrl(
  import.meta.env.VITE_NATIVE_AUTH_CALLBACK_URL || "cryptobotprime://auth-callback",
);

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
    return "API reach করা যাচ্ছে না. Mobile app-এ real device হলে `localhost/127.0.0.1` কাজ করে না. .env-এ `VITE_API_BASE_URL`-এ PC/LAN IP বা public HTTPS URL দাও; emulator হলে `10.0.2.2` ব্যবহার করা যায়. তারপর npm run cap:sync করে app rebuild করো.";
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

function getApiBaseHostname(apiBase = "") {
  if (!apiBase) {
    return "";
  }

  try {
    return new URL(apiBase).hostname;
  } catch {
    return "";
  }
}

function isLocalLikeApiBase(apiBase = "") {
  if (!apiBase) {
    return false;
  }

  if (isLoopbackApiBase(apiBase)) {
    return true;
  }

  const hostname = getApiBaseHostname(apiBase);
  if (!hostname) {
    return false;
  }

  return isPrivateOrLoopbackHost(hostname) || hostname.endsWith(".local");
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
  const configuredBase = sanitizeEnvUrl(AUTH_CONFIG.apiBase || "");
  const storedBase = sanitizeEnvUrl(readStoredApiBase());
  const publicAuthBase = sanitizeEnvUrl(PUBLIC_AUTH_BASE_URL || "");
  const candidates = [];
  const localContext = isDevOrLocalBrowserContext();

  if (typeof window !== "undefined") {
    if (!isNativeAppRuntime()) {
      pushCandidate(candidates, "", { allowEmpty: true });

      if (localContext) {
        pushCandidate(candidates, "http://localhost:4000");
        pushCandidate(candidates, "http://127.0.0.1:4000");

        if (isLocalLikeApiBase(storedBase)) {
          pushCandidate(candidates, storedBase);
        }
        if (isLocalLikeApiBase(configuredBase)) {
          pushCandidate(candidates, configuredBase);
        }

        if (ALLOW_EXTERNAL_API_FALLBACK) {
          pushCandidate(candidates, storedBase);
          pushCandidate(candidates, configuredBase);
        }
      } else {
        if (ALLOW_EXTERNAL_API_FALLBACK) {
          if (!isLocalLikeApiBase(storedBase)) {
            pushCandidate(candidates, storedBase);
          }
          if (!isLocalLikeApiBase(configuredBase)) {
            pushCandidate(candidates, configuredBase);
          }
        }
      }
    } else {
      // Prefer fresh env config on native so stale localStorage values do not shadow LAN API base.
      const priorityBases = [configuredBase, storedBase];
      const deferredLoopbackBases = [];

      for (const base of priorityBases) {
        if (!base) {
          continue;
        }
        if (isLoopbackApiBase(base)) {
          deferredLoopbackBases.push(base);
          continue;
        }
        pushCandidate(candidates, base);
      }

      // On physical devices, loopback URLs commonly fail. Keep public HTTPS fallback ahead of loopback.
      if (publicAuthBase && !isLocalLikeApiBase(publicAuthBase)) {
        pushCandidate(candidates, publicAuthBase);
      }

      for (const base of deferredLoopbackBases) {
        pushCandidate(candidates, base);
      }

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
  if (/could not find an api backend at\s*`?\/api`?/i.test(message)) {
    if (isDevOrLocalBrowserContext()) {
      return "Local frontend `/api` backend পায়নি. `npm run dev:all` চালাও (বা আলাদা করে `npm run server:start`), এবং `.env.local`-এ `VITE_API_BASE_URL` local backend URL দাও.";
    }
    return "This deployed frontend could not find an API backend at `/api`. Make sure your Vercel deployment includes the `api/auth/...` function files and `api/health.js`, then redeploy.";
  }
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
  async getLumSummary({ sessionToken }) {
    return this.requestGatewayAction({
      action: "lum.summary",
      sessionToken,
    });
  },
  async getLumPlans({ sessionToken, category = "all" }) {
    return this.requestGatewayAction({
      action: "lum.plans",
      sessionToken,
      payload: { category },
    });
  },
  async getLumPlanDetail({ sessionToken, planId }) {
    return this.requestGatewayAction({
      action: "lum.plan.detail",
      sessionToken,
      payload: { planId },
    });
  },
  async createLumInvestment({ sessionToken, planId, amountUsd }) {
    return this.requestGatewayAction({
      action: "lum.invest",
      sessionToken,
      payload: { planId, amountUsd },
    });
  },
  async getLumInvestments({ sessionToken, status = "all", category = "all", page = 1, limit = 30 }) {
    return this.requestGatewayAction({
      action: "lum.investments",
      sessionToken,
      payload: { status, category, page, limit },
    });
  },
  async getLumEntrust({ sessionToken }) {
    return this.requestGatewayAction({
      action: "lum.entrust",
      sessionToken,
    });
  },
  async getLumInfo({ sessionToken, planId }) {
    return this.requestGatewayAction({
      action: "lum.info",
      sessionToken,
      payload: { planId },
    });
  },
  async getBinarySummary({ sessionToken }) {
    return this.requestGatewayAction({
      action: "binary.summary",
      sessionToken,
    });
  },
  async getBinaryPairs({ sessionToken }) {
    return this.requestGatewayAction({
      action: "binary.pairs",
      sessionToken,
    });
  },
  async getBinaryPairChart({ sessionToken, pairId }) {
    return this.requestGatewayAction({
      action: "binary.pair.chart",
      sessionToken,
      payload: { pairId },
    });
  },
  async getBinaryConfig({ sessionToken }) {
    return this.requestGatewayAction({
      action: "binary.config",
      sessionToken,
    });
  },
  async openBinaryTrade({ sessionToken, pairId, direction, periodSeconds, stakeAmountUsd }) {
    return this.requestGatewayAction({
      action: "binary.trade.open",
      sessionToken,
      payload: { pairId, direction, periodSeconds, stakeAmountUsd },
    });
  },
  async getBinaryActiveTrades({ sessionToken }) {
    return this.requestGatewayAction({
      action: "binary.trades.active",
      sessionToken,
    });
  },
  async getBinaryTradeHistory({ sessionToken, result = "all", pairId = 0, page = 1, limit = 40 }) {
    return this.requestGatewayAction({
      action: "binary.trades.history",
      sessionToken,
      payload: { result, pairId, page, limit },
    });
  },
  async getBinaryTradeDetail({ sessionToken, tradeId }) {
    return this.requestGatewayAction({
      action: "binary.trade.detail",
      sessionToken,
      payload: { tradeId },
    });
  },
  async settleBinaryTrade({ sessionToken, tradeId }) {
    return this.requestGatewayAction({
      action: "binary.trade.settle",
      sessionToken,
      payload: { tradeId },
    });
  },
  async getTransactionConvertPairs({ sessionToken }) {
    return this.requestGatewayAction({
      action: "transaction.convert.pairs.list",
      sessionToken,
    });
  },
  async getTransactionConvertQuote({ sessionToken, pairId, amount }) {
    return this.requestGatewayAction({
      action: "transaction.convert.quote",
      sessionToken,
      payload: { pairId, amount },
    });
  },
  async submitTransactionConvert({ sessionToken, pairId, amount, note }) {
    return this.requestGatewayAction({
      action: "transaction.convert.submit",
      sessionToken,
      payload: { pairId, amount, note },
    });
  },
  async getTransactionConvertHistory({ sessionToken, status = "all", pairCode = "", page = 1, limit = 30 }) {
    return this.requestGatewayAction({
      action: "transaction.convert.history",
      sessionToken,
      payload: { status, pairCode, page, limit },
    });
  },
  async getTransactionSpotPairs({ sessionToken }) {
    return this.requestGatewayAction({
      action: "transaction.spot.pairs.list",
      sessionToken,
    });
  },
  async getTransactionSpotMarketSummary({ sessionToken, pairId }) {
    return this.requestGatewayAction({
      action: "transaction.spot.market-summary",
      sessionToken,
      payload: { pairId },
    });
  },
  async getTransactionSpotTicks({ sessionToken, pairId, limit = 120 }) {
    return this.requestGatewayAction({
      action: "transaction.spot.ticks",
      sessionToken,
      payload: { pairId, limit },
    });
  },
  async getTransactionSpotRecentTrades({ sessionToken, pairId, limit = 60 }) {
    return this.requestGatewayAction({
      action: "transaction.spot.recent-trades",
      sessionToken,
      payload: { pairId, limit },
    });
  },
  async placeTransactionSpotOrder({ sessionToken, pairId, side, orderType, price, quantity, note }) {
    return this.requestGatewayAction({
      action: "transaction.spot.order.place",
      sessionToken,
      payload: { pairId, side, orderType, price, quantity, note },
    });
  },
  async getTransactionSpotOpenOrders({ sessionToken, pairId = 0, page = 1, limit = 30 }) {
    return this.requestGatewayAction({
      action: "transaction.spot.orders.open",
      sessionToken,
      payload: { pairId, page, limit },
    });
  },
  async getTransactionSpotOrderHistory({ sessionToken, pairId = 0, status = "all", page = 1, limit = 40 }) {
    return this.requestGatewayAction({
      action: "transaction.spot.orders.history",
      sessionToken,
      payload: { pairId, status, page, limit },
    });
  },
  async cancelTransactionSpotOrder({ sessionToken, orderId, note }) {
    return this.requestGatewayAction({
      action: "transaction.spot.order.cancel",
      sessionToken,
      payload: { orderId, note },
    });
  },
  async getTransactionSpotOrderbook({ sessionToken, pairId }) {
    return this.requestGatewayAction({
      action: "transaction.spot.orderbook",
      sessionToken,
      payload: { pairId },
    });
  },
  async getAssetsSummary({ sessionToken }) {
    return this.requestGatewayAction({
      action: "assets.summary",
      sessionToken,
    });
  },
  async getAssetsWallets({ sessionToken }) {
    return this.requestGatewayAction({
      action: "assets.wallets",
      sessionToken,
    });
  },
  async getAssetsHistory({ sessionToken, type = "all", wallet = "all", page = 1, limit = 20 }) {
    return this.requestGatewayAction({
      action: "assets.history",
      sessionToken,
      payload: { type, wallet, page, limit },
    });
  },
  async createAssetsTransfer({ sessionToken, fromWalletSymbol, toWalletSymbol, amountUsd, note = "" }) {
    return this.requestGatewayAction({
      action: "assets.transfer",
      sessionToken,
      payload: { fromWalletSymbol, toWalletSymbol, amountUsd, note },
    });
  },
  async getAssetsConvertQuote({ sessionToken, walletSymbol, fromAssetSymbol, toAssetSymbol, amount }) {
    return this.requestGatewayAction({
      action: "assets.convert.quote",
      sessionToken,
      payload: { walletSymbol, fromAssetSymbol, toAssetSymbol, amount, previewOnly: true },
    });
  },
  async createAssetsConvert({ sessionToken, walletSymbol, fromAssetSymbol, toAssetSymbol, amount, note = "" }) {
    return this.requestGatewayAction({
      action: "assets.convert",
      sessionToken,
      payload: { walletSymbol, fromAssetSymbol, toAssetSymbol, amount, note },
    });
  },
  async getAssetsWithdrawConfig({ sessionToken }) {
    return this.requestGatewayAction({
      action: "assets.withdraw.config",
      sessionToken,
    });
  },
  async createAssetsWithdraw({ sessionToken, walletSymbol, assetSymbol, networkType, amountUsd, destinationAddress, destinationLabel = "", note = "" }) {
    return this.requestGatewayAction({
      action: "assets.withdraw.submit",
      sessionToken,
      payload: {
        walletSymbol,
        assetSymbol,
        networkType,
        amountUsd,
        destinationAddress,
        destinationLabel,
        note,
      },
    });
  },
  async getAssetsWithdrawals({ sessionToken, page = 1, limit = 30 }) {
    return this.requestGatewayAction({
      action: "assets.withdrawals",
      sessionToken,
      payload: { page, limit },
    });
  },
  async getAssetsTransfers({ sessionToken, page = 1, limit = 30 }) {
    return this.requestGatewayAction({
      action: "assets.transfers",
      sessionToken,
      payload: { page, limit },
    });
  },
  async getAssetsConversions({ sessionToken, page = 1, limit = 30 }) {
    return this.requestGatewayAction({
      action: "assets.conversions",
      sessionToken,
      payload: { page, limit },
    });
  },
  async adminSignup({ name, email, phone, password }) {
    const data = await this.requestGatewayAction({
      action: "admin.auth.signup",
      payload: { name, email, phone, password },
    });
    return data;
  },
  async adminLogin({ email, password }) {
    return this.requestGatewayAction({
      action: "admin.auth.login",
      payload: { email, password },
    });
  },
  async adminSession({ sessionToken }) {
    return this.requestGatewayAction({
      action: "admin.auth.session",
      sessionToken,
    });
  },
  async adminLogout({ sessionToken }) {
    return this.requestGatewayAction({
      action: "admin.auth.logout",
      sessionToken,
    });
  },
  async adminGetNotice({ sessionToken }) {
    return this.requestGatewayAction({
      action: "admin.notice.get",
      sessionToken,
    });
  },
  async adminUpdateNotice({ sessionToken, message }) {
    return this.requestGatewayAction({
      action: "admin.notice.update",
      sessionToken,
      payload: { message },
    });
  },
  async adminListDepositAssets({ sessionToken }) {
    return this.requestGatewayAction({
      action: "admin.deposit.assets.list",
      sessionToken,
    });
  },
  async adminUpsertDepositAsset({
    sessionToken,
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
      sessionToken,
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
  async adminDeleteDepositAsset({ sessionToken, assetId }) {
    return this.requestGatewayAction({
      action: "admin.deposit.asset.delete",
      sessionToken,
      payload: { assetId },
    });
  },
  async adminListDepositRequests({ sessionToken }) {
    return this.requestGatewayAction({
      action: "admin.deposit.requests.list",
      sessionToken,
    });
  },
  async adminReviewDepositRequest({ sessionToken, requestId, decision, note }) {
    return this.requestGatewayAction({
      action: "admin.deposit.request.review",
      sessionToken,
      payload: { requestId, decision, note },
    });
  },
  async adminListLumPlans({ sessionToken, category = "all", status = "all" }) {
    return this.requestGatewayAction({
      action: "admin.lum.plans.list",
      sessionToken,
      payload: { category, status },
    });
  },
  async adminCreateLumPlan({ sessionToken, ...payload }) {
    return this.requestGatewayAction({
      action: "admin.lum.plans.create",
      sessionToken,
      payload,
    });
  },
  async adminUpdateLumPlan({ sessionToken, ...payload }) {
    return this.requestGatewayAction({
      action: "admin.lum.plans.update",
      sessionToken,
      payload,
    });
  },
  async adminDeleteLumPlan({ sessionToken, planId }) {
    return this.requestGatewayAction({
      action: "admin.lum.plans.delete",
      sessionToken,
      payload: { planId },
    });
  },
  async adminToggleLumPlanStatus({ sessionToken, planId, status }) {
    return this.requestGatewayAction({
      action: "admin.lum.plans.toggle-status",
      sessionToken,
      payload: { planId, status },
    });
  },
  async adminListLumInvestments({ sessionToken, status = "all", category = "all", page = 1, limit = 50, keyword = "" }) {
    return this.requestGatewayAction({
      action: "admin.lum.investments.list",
      sessionToken,
      payload: { status, category, page, limit, keyword },
    });
  },
  async adminReviewLumInvestment({ sessionToken, investmentId, decision, note }) {
    return this.requestGatewayAction({
      action: "admin.lum.investments.review",
      sessionToken,
      payload: { investmentId, decision, note },
    });
  },
  async adminForceSettleLumInvestment({ sessionToken, investmentId, note }) {
    return this.requestGatewayAction({
      action: "admin.lum.investments.force-settle",
      sessionToken,
      payload: { investmentId, note },
    });
  },
  async adminGetLumDashboardSummary({ sessionToken }) {
    return this.requestGatewayAction({
      action: "admin.lum.dashboard-summary",
      sessionToken,
    });
  },
  async adminSaveLumContent({ sessionToken, ...payload }) {
    return this.requestGatewayAction({
      action: "admin.lum.content.save",
      sessionToken,
      payload,
    });
  },
  async adminGetBinaryDashboardSummary({ sessionToken }) {
    return this.requestGatewayAction({
      action: "admin.binary.dashboard-summary",
      sessionToken,
    });
  },
  async adminListBinaryPairs({ sessionToken }) {
    return this.requestGatewayAction({
      action: "admin.binary.pairs",
      sessionToken,
    });
  },
  async adminCreateBinaryPair({ sessionToken, ...payload }) {
    return this.requestGatewayAction({
      action: "admin.binary.pairs.create",
      sessionToken,
      payload,
    });
  },
  async adminUpdateBinaryPair({ sessionToken, ...payload }) {
    return this.requestGatewayAction({
      action: "admin.binary.pairs.update",
      sessionToken,
      payload,
    });
  },
  async adminDeleteBinaryPair({ sessionToken, pairId }) {
    return this.requestGatewayAction({
      action: "admin.binary.pairs.delete",
      sessionToken,
      payload: { pairId },
    });
  },
  async adminToggleBinaryPairStatus({ sessionToken, pairId, isEnabled }) {
    return this.requestGatewayAction({
      action: "admin.binary.pairs.toggle-status",
      sessionToken,
      payload: { pairId, isEnabled },
    });
  },
  async adminListBinaryPeriodRules({ sessionToken }) {
    return this.requestGatewayAction({
      action: "admin.binary.period-rules",
      sessionToken,
    });
  },
  async adminSaveBinaryPeriodRule({ sessionToken, ...payload }) {
    return this.requestGatewayAction({
      action: "admin.binary.period-rules.save",
      sessionToken,
      payload,
    });
  },
  async adminListBinaryTrades({ sessionToken, ...payload }) {
    return this.requestGatewayAction({
      action: "admin.binary.trades",
      sessionToken,
      payload,
    });
  },
  async adminSettleBinaryTrade({ sessionToken, tradeId, note }) {
    return this.requestGatewayAction({
      action: "admin.binary.trades.settle",
      sessionToken,
      payload: { tradeId, note },
    });
  },
  async adminCancelBinaryTrade({ sessionToken, tradeId, note }) {
    return this.requestGatewayAction({
      action: "admin.binary.trades.cancel",
      sessionToken,
      payload: { tradeId, note },
    });
  },
  async adminGetBinaryEngineSettings({ sessionToken }) {
    return this.requestGatewayAction({
      action: "admin.binary.engine-settings",
      sessionToken,
    });
  },
  async adminSaveBinaryEngineSettings({ sessionToken, ...payload }) {
    return this.requestGatewayAction({
      action: "admin.binary.engine-settings.save",
      sessionToken,
      payload,
    });
  },
  async adminPushBinaryManualTick({ sessionToken, pairId, price }) {
    return this.requestGatewayAction({
      action: "admin.binary.manual-tick.push",
      sessionToken,
      payload: { pairId, price },
    });
  },
  async adminGetTransactionDashboardSummary({ sessionToken }) {
    return this.requestGatewayAction({
      action: "admin.transaction.dashboard-summary",
      sessionToken,
    });
  },
  async adminGetTransactionEngineSettings({ sessionToken }) {
    return this.requestGatewayAction({
      action: "admin.transaction.engine-settings.get",
      sessionToken,
    });
  },
  async adminSaveTransactionEngineSettings({ sessionToken, ...payload }) {
    return this.requestGatewayAction({
      action: "admin.transaction.engine-settings.save",
      sessionToken,
      payload,
    });
  },
  async adminListTransactionConvertPairs({ sessionToken }) {
    return this.requestGatewayAction({
      action: "admin.transaction.convert.pairs.list",
      sessionToken,
    });
  },
  async adminCreateTransactionConvertPair({ sessionToken, ...payload }) {
    return this.requestGatewayAction({
      action: "admin.transaction.convert.pairs.create",
      sessionToken,
      payload,
    });
  },
  async adminUpdateTransactionConvertPair({ sessionToken, ...payload }) {
    return this.requestGatewayAction({
      action: "admin.transaction.convert.pairs.update",
      sessionToken,
      payload,
    });
  },
  async adminDeleteTransactionConvertPair({ sessionToken, pairId, note }) {
    return this.requestGatewayAction({
      action: "admin.transaction.convert.pairs.delete",
      sessionToken,
      payload: { pairId, note },
    });
  },
  async adminToggleTransactionConvertPairStatus({ sessionToken, pairId, isEnabled }) {
    return this.requestGatewayAction({
      action: "admin.transaction.convert.pairs.toggle-status",
      sessionToken,
      payload: { pairId, isEnabled },
    });
  },
  async adminListTransactionConvertOrders({
    sessionToken,
    status = "all",
    pairCode = "",
    userKeyword = "",
    fromDate = "",
    toDate = "",
    page = 1,
    limit = 60,
  }) {
    return this.requestGatewayAction({
      action: "admin.transaction.convert.orders.list",
      sessionToken,
      payload: { status, pairCode, userKeyword, fromDate, toDate, page, limit },
    });
  },
  async adminPushTransactionConvertManualRate({ sessionToken, pairId, manualRate }) {
    return this.requestGatewayAction({
      action: "admin.transaction.convert.manual-rate.push",
      sessionToken,
      payload: { pairId, manualRate },
    });
  },
  async adminListTransactionSpotPairs({ sessionToken }) {
    return this.requestGatewayAction({
      action: "admin.transaction.spot.pairs.list",
      sessionToken,
    });
  },
  async adminCreateTransactionSpotPair({ sessionToken, ...payload }) {
    return this.requestGatewayAction({
      action: "admin.transaction.spot.pairs.create",
      sessionToken,
      payload,
    });
  },
  async adminUpdateTransactionSpotPair({ sessionToken, ...payload }) {
    return this.requestGatewayAction({
      action: "admin.transaction.spot.pairs.update",
      sessionToken,
      payload,
    });
  },
  async adminDeleteTransactionSpotPair({ sessionToken, pairId, note }) {
    return this.requestGatewayAction({
      action: "admin.transaction.spot.pairs.delete",
      sessionToken,
      payload: { pairId, note },
    });
  },
  async adminToggleTransactionSpotPairStatus({ sessionToken, pairId, isEnabled }) {
    return this.requestGatewayAction({
      action: "admin.transaction.spot.pairs.toggle-status",
      sessionToken,
      payload: { pairId, isEnabled },
    });
  },
  async adminListTransactionSpotOrders({
    sessionToken,
    status = "all",
    pairId = 0,
    orderType = "all",
    side = "all",
    userKeyword = "",
    fromDate = "",
    toDate = "",
    page = 1,
    limit = 80,
  }) {
    return this.requestGatewayAction({
      action: "admin.transaction.spot.orders.list",
      sessionToken,
      payload: { status, pairId, orderType, side, userKeyword, fromDate, toDate, page, limit },
    });
  },
  async adminCancelTransactionSpotOrder({ sessionToken, orderId, note }) {
    return this.requestGatewayAction({
      action: "admin.transaction.spot.order.cancel",
      sessionToken,
      payload: { orderId, note },
    });
  },
  async adminForceFillTransactionSpotOrder({ sessionToken, orderId, executionPrice, note }) {
    return this.requestGatewayAction({
      action: "admin.transaction.spot.order.force-fill",
      sessionToken,
      payload: { orderId, executionPrice, note },
    });
  },
  async adminPushTransactionSpotManualTick({ sessionToken, pairId, price }) {
    return this.requestGatewayAction({
      action: "admin.transaction.spot.manual-tick.push",
      sessionToken,
      payload: { pairId, price },
    });
  },
  async adminSaveTransactionSpotFeedSettings({ sessionToken, ...payload }) {
    return this.requestGatewayAction({
      action: "admin.transaction.spot.feed.settings.save",
      sessionToken,
      payload,
    });
  },
  async adminListTransactionAuditLogs({ sessionToken, page = 1, limit = 100 }) {
    return this.requestGatewayAction({
      action: "admin.transaction.audit.list",
      sessionToken,
      payload: { page, limit },
    });
  },
  async adminGetAssetsDashboardSummary({ sessionToken }) {
    return this.requestGatewayAction({
      action: "admin.assets.dashboard-summary",
      sessionToken,
    });
  },
  async adminListAssetsWallets({ sessionToken, wallet = "all", userKeyword = "", page = 1, limit = 30 }) {
    return this.requestGatewayAction({
      action: "admin.assets.wallets",
      sessionToken,
      payload: { wallet, userKeyword, page, limit },
    });
  },
  async adminGetAssetsWalletDetail({ sessionToken, userId, wallet = "all", type = "all", page = 1, limit = 40 }) {
    return this.requestGatewayAction({
      action: "admin.assets.wallet.detail",
      sessionToken,
      payload: { userId, wallet, type, page, limit },
    });
  },
  async adminAdjustAssetsWallet({ sessionToken, userId, walletSymbol, amountUsd, movementType, note = "" }) {
    return this.requestGatewayAction({
      action: "admin.assets.wallet.adjust",
      sessionToken,
      payload: { userId, walletSymbol, amountUsd, movementType, note },
    });
  },
  async adminFreezeAssetsWallet({
    sessionToken,
    userId,
    walletSymbol,
    freezeDeposit = false,
    freezeWithdraw = false,
    freezeTransfer = false,
    freezeConvert = false,
    note = "",
  }) {
    return this.requestGatewayAction({
      action: "admin.assets.wallet.freeze",
      sessionToken,
      payload: {
        userId,
        walletSymbol,
        freezeDeposit,
        freezeWithdraw,
        freezeTransfer,
        freezeConvert,
        note,
      },
    });
  },
  async adminListAssetsWithdrawals({
    sessionToken,
    status = "all",
    asset = "all",
    network = "all",
    wallet = "all",
    userKeyword = "",
    page = 1,
    limit = 40,
  }) {
    return this.requestGatewayAction({
      action: "admin.assets.withdrawals",
      sessionToken,
      payload: { status, asset, network, wallet, userKeyword, page, limit },
    });
  },
  async adminReviewAssetsWithdrawal({ sessionToken, withdrawalId, withdrawalRef, decision, note = "" }) {
    return this.requestGatewayAction({
      action: "admin.assets.withdrawals.review",
      sessionToken,
      payload: { withdrawalId, withdrawalRef, decision, note },
    });
  },
  async adminCompleteAssetsWithdrawal({ sessionToken, withdrawalId, withdrawalRef, note = "" }) {
    return this.requestGatewayAction({
      action: "admin.assets.withdrawals.complete",
      sessionToken,
      payload: { withdrawalId, withdrawalRef, note },
    });
  },
  async adminListAssetsTransfers({ sessionToken, status = "all", route = "all", wallet = "all", userKeyword = "", page = 1, limit = 50 }) {
    return this.requestGatewayAction({
      action: "admin.assets.transfers",
      sessionToken,
      payload: { status, route, wallet, userKeyword, page, limit },
    });
  },
  async adminListAssetsConversions({
    sessionToken,
    status = "all",
    wallet = "all",
    fromAsset = "all",
    toAsset = "all",
    userKeyword = "",
    page = 1,
    limit = 50,
  }) {
    return this.requestGatewayAction({
      action: "admin.assets.conversions",
      sessionToken,
      payload: { status, wallet, fromAsset, toAsset, userKeyword, page, limit },
    });
  },
  async adminGetAssetsSettings({ sessionToken }) {
    return this.requestGatewayAction({
      action: "admin.assets.settings",
      sessionToken,
    });
  },
  async adminSaveAssetsSettings({ sessionToken, ...payload }) {
    return this.requestGatewayAction({
      action: "admin.assets.settings.save",
      sessionToken,
      payload,
    });
  },
  async adminListAssetsAuditLogs({ sessionToken, actionType = "all", keyword = "", page = 1, limit = 50 }) {
    return this.requestGatewayAction({
      action: "admin.assets.audit-logs",
      sessionToken,
      payload: { actionType, keyword, page, limit },
    });
  },
  async adminListKycRequests({ sessionToken }) {
    return this.requestGatewayAction({
      action: "admin.kyc.list",
      sessionToken,
    });
  },
  async adminListUsers({ sessionToken, kycStatus, includeAdmins } = {}) {
    return this.requestGatewayAction({
      action: "admin.users.list",
      sessionToken,
      payload: { kycStatus, includeAdmins },
    });
  },
  async adminGetUserDetail({ sessionToken, userId }) {
    return this.requestGatewayAction({
      action: "admin.user.detail",
      sessionToken,
      payload: { userId },
    });
  },
  async adminUpdateUser({
    sessionToken,
    userId,
    name,
    firstName,
    lastName,
    email,
    mobile,
    avatarUrl,
    kycStatus,
    walletBalances,
  }) {
    return this.requestGatewayAction({
      action: "admin.user.update",
      sessionToken,
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
  async adminDeleteUser({ sessionToken, userId }) {
    return this.requestGatewayAction({
      action: "admin.user.delete",
      sessionToken,
      payload: { userId },
    });
  },
  async adminReviewKycRequest({ sessionToken, requestId, decision, note }) {
    return this.requestGatewayAction({
      action: "admin.kyc.review",
      sessionToken,
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
  const [activeAppScreen, setActiveAppScreen] = useState("dashboard");
  const [dashboardEntryTab, setDashboardEntryTab] = useState("home");

  useEffect(() => {
    setActiveAppScreen("dashboard");
    setDashboardEntryTab("home");
  }, [authSnapshot.sessionToken, authSnapshot.userId]);

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

  const handleLumSummary = async () => {
    return authService.getLumSummary({
      sessionToken: authSnapshot.sessionToken,
    });
  };

  const handleLumPlans = async ({ category }) => {
    return authService.getLumPlans({
      sessionToken: authSnapshot.sessionToken,
      category,
    });
  };

  const handleLumPlanDetail = async ({ planId }) => {
    return authService.getLumPlanDetail({
      sessionToken: authSnapshot.sessionToken,
      planId,
    });
  };

  const handleLumInvest = async ({ planId, amountUsd }) => {
    return authService.createLumInvestment({
      sessionToken: authSnapshot.sessionToken,
      planId,
      amountUsd,
    });
  };

  const handleLumEntrust = async () => {
    return authService.getLumEntrust({
      sessionToken: authSnapshot.sessionToken,
    });
  };

  const handleLumInfo = async ({ planId }) => {
    return authService.getLumInfo({
      sessionToken: authSnapshot.sessionToken,
      planId,
    });
  };

  const handleBinarySummary = async () => {
    return authService.getBinarySummary({
      sessionToken: authSnapshot.sessionToken,
    });
  };

  const handleBinaryPairs = async () => {
    return authService.getBinaryPairs({
      sessionToken: authSnapshot.sessionToken,
    });
  };

  const handleBinaryConfig = async () => {
    return authService.getBinaryConfig({
      sessionToken: authSnapshot.sessionToken,
    });
  };

  const handleBinaryPairChart = async ({ pairId }) => {
    return authService.getBinaryPairChart({
      sessionToken: authSnapshot.sessionToken,
      pairId,
    });
  };

  const handleOpenBinaryTrade = async ({ pairId, direction, periodSeconds, stakeAmountUsd }) => {
    return authService.openBinaryTrade({
      sessionToken: authSnapshot.sessionToken,
      pairId,
      direction,
      periodSeconds,
      stakeAmountUsd,
    });
  };

  const handleBinaryActiveTrades = async () => {
    return authService.getBinaryActiveTrades({
      sessionToken: authSnapshot.sessionToken,
    });
  };

  const handleBinaryTradeHistory = async ({ result, pairId, page, limit }) => {
    return authService.getBinaryTradeHistory({
      sessionToken: authSnapshot.sessionToken,
      result,
      pairId,
      page,
      limit,
    });
  };

  const handleSettleBinaryTrade = async ({ tradeId }) => {
    return authService.settleBinaryTrade({
      sessionToken: authSnapshot.sessionToken,
      tradeId,
    });
  };

  const handleTransactionConvertPairs = async () => {
    return authService.getTransactionConvertPairs({
      sessionToken: authSnapshot.sessionToken,
    });
  };

  const handleTransactionConvertQuote = async ({ pairId, amount }) => {
    return authService.getTransactionConvertQuote({
      sessionToken: authSnapshot.sessionToken,
      pairId,
      amount,
    });
  };

  const handleTransactionConvertSubmit = async ({ pairId, amount, note }) => {
    return authService.submitTransactionConvert({
      sessionToken: authSnapshot.sessionToken,
      pairId,
      amount,
      note,
    });
  };

  const handleTransactionConvertHistory = async ({ status, pairCode, page, limit }) => {
    return authService.getTransactionConvertHistory({
      sessionToken: authSnapshot.sessionToken,
      status,
      pairCode,
      page,
      limit,
    });
  };

  const handleTransactionSpotPairs = async () => {
    return authService.getTransactionSpotPairs({
      sessionToken: authSnapshot.sessionToken,
    });
  };

  const handleTransactionSpotMarketSummary = async ({ pairId }) => {
    return authService.getTransactionSpotMarketSummary({
      sessionToken: authSnapshot.sessionToken,
      pairId,
    });
  };

  const handleTransactionSpotTicks = async ({ pairId, limit }) => {
    return authService.getTransactionSpotTicks({
      sessionToken: authSnapshot.sessionToken,
      pairId,
      limit,
    });
  };

  const handleTransactionSpotRecentTrades = async ({ pairId, limit }) => {
    return authService.getTransactionSpotRecentTrades({
      sessionToken: authSnapshot.sessionToken,
      pairId,
      limit,
    });
  };

  const handleTransactionSpotOrderPlace = async ({ pairId, side, orderType, price, quantity, note }) => {
    return authService.placeTransactionSpotOrder({
      sessionToken: authSnapshot.sessionToken,
      pairId,
      side,
      orderType,
      price,
      quantity,
      note,
    });
  };

  const handleTransactionSpotOpenOrders = async ({ pairId, page, limit }) => {
    return authService.getTransactionSpotOpenOrders({
      sessionToken: authSnapshot.sessionToken,
      pairId,
      page,
      limit,
    });
  };

  const handleTransactionSpotOrderHistory = async ({ pairId, status, page, limit }) => {
    return authService.getTransactionSpotOrderHistory({
      sessionToken: authSnapshot.sessionToken,
      pairId,
      status,
      page,
      limit,
    });
  };

  const handleTransactionSpotOrderCancel = async ({ orderId, note }) => {
    return authService.cancelTransactionSpotOrder({
      sessionToken: authSnapshot.sessionToken,
      orderId,
      note,
    });
  };

  const handleTransactionSpotOrderbook = async ({ pairId }) => {
    return authService.getTransactionSpotOrderbook({
      sessionToken: authSnapshot.sessionToken,
      pairId,
    });
  };

  const handleAssetsSummary = async () => {
    return authService.getAssetsSummary({
      sessionToken: authSnapshot.sessionToken,
    });
  };

  const handleAssetsWallets = async () => {
    return authService.getAssetsWallets({
      sessionToken: authSnapshot.sessionToken,
    });
  };

  const handleAssetsHistory = async ({ type, wallet, page, limit }) => {
    return authService.getAssetsHistory({
      sessionToken: authSnapshot.sessionToken,
      type,
      wallet,
      page,
      limit,
    });
  };

  const handleAssetsTransfer = async ({ fromWalletSymbol, toWalletSymbol, amountUsd, note }) => {
    return authService.createAssetsTransfer({
      sessionToken: authSnapshot.sessionToken,
      fromWalletSymbol,
      toWalletSymbol,
      amountUsd,
      note,
    });
  };

  const handleAssetsConvertQuote = async ({ walletSymbol, fromAssetSymbol, toAssetSymbol, amount }) => {
    return authService.getAssetsConvertQuote({
      sessionToken: authSnapshot.sessionToken,
      walletSymbol,
      fromAssetSymbol,
      toAssetSymbol,
      amount,
    });
  };

  const handleAssetsConvert = async ({ walletSymbol, fromAssetSymbol, toAssetSymbol, amount, note }) => {
    return authService.createAssetsConvert({
      sessionToken: authSnapshot.sessionToken,
      walletSymbol,
      fromAssetSymbol,
      toAssetSymbol,
      amount,
      note,
    });
  };

  const handleAssetsWithdrawConfig = async () => {
    return authService.getAssetsWithdrawConfig({
      sessionToken: authSnapshot.sessionToken,
    });
  };

  const handleAssetsWithdrawSubmit = async ({
    walletSymbol,
    assetSymbol,
    networkType,
    amountUsd,
    destinationAddress,
    destinationLabel,
    note,
  }) => {
    return authService.createAssetsWithdraw({
      sessionToken: authSnapshot.sessionToken,
      walletSymbol,
      assetSymbol,
      networkType,
      amountUsd,
      destinationAddress,
      destinationLabel,
      note,
    });
  };

  const handleAssetsWithdrawals = async ({ page, limit }) => {
    return authService.getAssetsWithdrawals({
      sessionToken: authSnapshot.sessionToken,
      page,
      limit,
    });
  };

  const handleAssetsTransfers = async ({ page, limit }) => {
    return authService.getAssetsTransfers({
      sessionToken: authSnapshot.sessionToken,
      page,
      limit,
    });
  };

  const handleAssetsConversions = async ({ page, limit }) => {
    return authService.getAssetsConversions({
      sessionToken: authSnapshot.sessionToken,
      page,
      limit,
    });
  };

  if (!authReady) {
    return <MobileLoadingPage />;
  }

  if (authSnapshot.hasAccount && authSnapshot.isLoggedIn) {
    if (activeAppScreen === "deposit") {
      return (
        <DepositPage
          user={authSnapshot}
          onBack={() => setActiveAppScreen("dashboard")}
          onDashboardSnapshot={handleDashboardSnapshot}
          onCreateDepositRequest={handleCreateDepositRequest}
          onDepositRecords={handleDepositRecords}
          onAfterDepositSuccess={async () => {
            setActiveAppScreen("dashboard");
            await onAuthChanged();
          }}
        />
      );
    }

    if (activeAppScreen === "lum") {
      return (
        <LUMPage
          user={authSnapshot}
          onBack={() => setActiveAppScreen("dashboard")}
          onDashboardSnapshot={handleDashboardSnapshot}
          onLoadSummary={handleLumSummary}
          onLoadPlans={handleLumPlans}
          onLoadPlanDetail={handleLumPlanDetail}
          onLoadEntrust={handleLumEntrust}
          onLoadInfo={handleLumInfo}
          onCreateInvestment={handleLumInvest}
          onAfterInvestmentSuccess={async () => {
            await onAuthChanged();
          }}
        />
      );
    }

    if (activeAppScreen === "binary") {
      return (
        <BinaryPage
          user={authSnapshot}
          onBack={() => setActiveAppScreen("dashboard")}
          onLoadSummary={handleBinarySummary}
          onLoadPairs={handleBinaryPairs}
          onLoadConfig={handleBinaryConfig}
          onLoadPairChart={handleBinaryPairChart}
          onOpenTrade={handleOpenBinaryTrade}
          onLoadActiveTrades={handleBinaryActiveTrades}
          onLoadHistory={handleBinaryTradeHistory}
          onSettleTrade={handleSettleBinaryTrade}
          onNavigateTab={(tabId) => {
            if (tabId === "binary") {
              setActiveAppScreen("binary");
              return;
            }
            if (tabId === "transaction") {
              setActiveAppScreen("transaction");
              return;
            }
            if (tabId === "assets") {
              setActiveAppScreen("assets");
              return;
            }
            setDashboardEntryTab(tabId);
            setActiveAppScreen("dashboard");
          }}
        />
      );
    }

    if (activeAppScreen === "transaction") {
      return (
        <TransactionPage
          user={authSnapshot}
          onBack={() => setActiveAppScreen("dashboard")}
          onLoadConvertPairs={handleTransactionConvertPairs}
          onConvertQuote={handleTransactionConvertQuote}
          onConvertSubmit={handleTransactionConvertSubmit}
          onLoadConvertHistory={handleTransactionConvertHistory}
          onLoadSpotPairs={handleTransactionSpotPairs}
          onLoadMarketSummary={handleTransactionSpotMarketSummary}
          onLoadTicks={handleTransactionSpotTicks}
          onLoadRecentTrades={handleTransactionSpotRecentTrades}
          onPlaceOrder={handleTransactionSpotOrderPlace}
          onLoadOpenOrders={handleTransactionSpotOpenOrders}
          onLoadOrderHistory={handleTransactionSpotOrderHistory}
          onCancelOrder={handleTransactionSpotOrderCancel}
          onLoadOrderbook={handleTransactionSpotOrderbook}
          onNavigateTab={(tabId) => {
            if (tabId === "transaction") {
              setActiveAppScreen("transaction");
              return;
            }
            if (tabId === "binary") {
              setActiveAppScreen("binary");
              return;
            }
            if (tabId === "assets") {
              setActiveAppScreen("assets");
              return;
            }
            setDashboardEntryTab(tabId);
            setActiveAppScreen("dashboard");
          }}
        />
      );
    }

    if (activeAppScreen === "assets") {
      return (
        <AssetsPage
          user={authSnapshot}
          onBack={() => setActiveAppScreen("dashboard")}
          onOpenDepositPage={() => setActiveAppScreen("deposit")}
          onLoadSummary={handleAssetsSummary}
          onLoadWallets={handleAssetsWallets}
          onLoadHistory={handleAssetsHistory}
          onTransfer={handleAssetsTransfer}
          onConvertQuote={handleAssetsConvertQuote}
          onConvert={handleAssetsConvert}
          onLoadWithdrawConfig={handleAssetsWithdrawConfig}
          onWithdraw={handleAssetsWithdrawSubmit}
          onLoadWithdrawals={handleAssetsWithdrawals}
          onLoadTransfers={handleAssetsTransfers}
          onLoadConversions={handleAssetsConversions}
          onNavigateTab={(tabId) => {
            if (tabId === "assets") {
              setActiveAppScreen("assets");
              return;
            }
            if (tabId === "transaction") {
              setActiveAppScreen("transaction");
              return;
            }
            if (tabId === "binary") {
              setActiveAppScreen("binary");
              return;
            }
            setDashboardEntryTab(tabId);
            setActiveAppScreen("dashboard");
          }}
        />
      );
    }

    return (
      <PremiumDashboardPage
        user={authSnapshot}
        entryMainTab={dashboardEntryTab}
        onLogout={handleLogout}
        onProfileUpdate={handleProfileUpdate}
        onPasswordChange={handlePasswordChange}
        onKycSubmit={handleKycSubmit}
        onKycRefresh={handleKycRefresh}
        onDashboardSnapshot={handleDashboardSnapshot}
        onOpenDepositPage={() => setActiveAppScreen("deposit")}
        onOpenLumPage={() => setActiveAppScreen("lum")}
        onOpenBinaryPage={() => setActiveAppScreen("binary")}
        onOpenTransactionPage={() => setActiveAppScreen("transaction")}
        onOpenAssetsPage={() => setActiveAppScreen("assets")}
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
      <AdminSectionPage
        authService={getAuthService()}
        onBackHome={() => goToRoute(ROUTES.home)}
        onOpenUserAuth={() => goToRoute(ROUTES.login)}
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
