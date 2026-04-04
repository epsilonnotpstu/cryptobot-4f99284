import { useEffect, useMemo, useState } from "react";
import "./premium-dashboard.css";

const BINANCE_TICKER_24H_URL = "https://api.binance.com/api/v3/ticker/24hr";

const MARKET_TABS = [
  { id: "all", label: "All" },
  { id: "newest", label: "Newest" },
  { id: "hot", label: "Hot" },
];

const QUICK_ACTIONS = [
  { label: "LUM", icon: "fa-satellite-dish" },
  { label: "Binary", icon: "fa-chart-line" },
  { label: "Recharge", icon: "fa-bolt" },
  { label: "Transaction", icon: "fa-right-left" },
  { label: "Recovery", icon: "fa-shield-halved" },
];

const BOTTOM_NAV_ITEMS = [
  { id: "home", label: "Home", icon: "fa-house" },
  { id: "transaction", label: "Transaction", icon: "fa-arrow-right-arrow-left" },
  { id: "binary", label: "Binary Options", icon: "fa-chart-simple" },
  { id: "assets", label: "Assets", icon: "fa-wallet" },
];

const DRAWER_MENU_ITEMS = [
  { id: "profile", label: "Profile Settings", icon: "fa-user" },
  { id: "password", label: "Password Change", icon: "fa-key" },
  { id: "auth", label: "Authentication", icon: "fa-shield-halved" },
  { id: "support", label: "Customer Service", icon: "fa-headset" },
];

const KYC_CERTIFICATION_OPTIONS = [
  { value: "", label: "Select One" },
  { value: "nid", label: "NID" },
  { value: "passport", label: "Passport" },
  { value: "driving_license", label: "Driving License" },
];

const KYC_ALLOWED_FILE_TYPES = [
  "image/jpg",
  "image/jpeg",
  "image/png",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const KYC_ACCEPT_ATTR = ".jpg,.jpeg,.png,.pdf,.doc,.docx";
const KYC_TEST_FILE_MAX_BYTES = 350_000;
const DEPOSIT_SCREENSHOT_ACCEPT = ".jpg,.jpeg,.png,.heic";
const DEPOSIT_SCREENSHOT_MAX_BYTES = 15 * 1024 * 1024;

function normalizeKycStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "authenticated" || normalized === "approved") {
    return "authenticated";
  }
  if (normalized === "rejected" || normalized === "reject") {
    return "rejected";
  }
  return "pending";
}

function getKycStatusMeta(status) {
  const normalized = normalizeKycStatus(status);
  if (normalized === "authenticated") {
    return { label: "Authenticated", className: "is-authenticated" };
  }
  if (normalized === "rejected") {
    return { label: "Rejected", className: "is-rejected" };
  }
  return { label: "Pending", className: "is-pending" };
}

function deriveAuthTagFromStatus(status) {
  const normalized = normalizeKycStatus(status);
  if (normalized === "authenticated") {
    return "kyc-authenticated";
  }
  if (normalized === "rejected") {
    return "kyc-rejected";
  }
  return "kyc-pending";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read file data."));
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function formatCurrency(value) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPrice(value) {
  if (value >= 1000) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (value >= 1) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }

  if (value >= 0.01) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    });
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: 6,
    maximumFractionDigits: 8,
  });
}

function formatCompactValue(value) {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }

  return value.toFixed(2);
}

function formatPercent(value) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function shortenAddress(value = "") {
  const text = String(value || "").trim();
  if (text.length <= 24) {
    return text;
  }
  return `${text.slice(0, 12)}...${text.slice(-8)}`;
}

function getFirstNameFallback(user) {
  if (user?.firstName) {
    return user.firstName;
  }
  const parts = String(user?.name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts[0] || "";
}

function getLastNameFallback(user) {
  if (user?.lastName) {
    return user.lastName;
  }
  const parts = String(user?.name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts.slice(1).join(" ");
}

function normalizeRows(payload) {
  return payload
    .filter((item) => item.symbol.endsWith("USDT"))
    .filter((item) => !item.symbol.includes("UPUSDT") && !item.symbol.includes("DOWNUSDT"))
    .map((item) => {
      const symbol = item.symbol;
      const base = symbol.replace(/USDT$/, "");
      const lastPrice = Number(item.lastPrice);
      const changePercent = Number(item.priceChangePercent);
      const quoteVolume = Number(item.quoteVolume);
      const trades = Number(item.count);
      return {
        symbol,
        base,
        pair: `${base}/USDT`,
        lastPrice,
        changePercent,
        quoteVolume,
        trades,
      };
    })
    .filter((item) => Number.isFinite(item.lastPrice) && Number.isFinite(item.changePercent))
    .sort((a, b) => b.quoteVolume - a.quoteVolume);
}

function filterRowsByTab(rows, activeTab) {
  if (activeTab === "newest") {
    return [...rows].sort((a, b) => b.trades - a.trades || b.quoteVolume - a.quoteVolume);
  }

  if (activeTab === "hot") {
    return [...rows].sort(
      (a, b) =>
        Math.abs(b.changePercent) * Math.log10(b.quoteVolume + 1) -
        Math.abs(a.changePercent) * Math.log10(a.quoteVolume + 1),
    );
  }

  return rows;
}

function buildPlaceholderCopy(activeMainTab) {
  if (activeMainTab === "transaction") {
    return {
      title: "Transaction Center",
      subtitle: "Your transaction workflow will be integrated here.",
    };
  }
  if (activeMainTab === "binary") {
    return {
      title: "Binary Options",
      subtitle: "Binary options dashboard is ready for feature wiring.",
    };
  }
  return {
    title: "Asset Manager",
    subtitle: "Portfolio asset management module will appear in this section.",
  };
}

export default function PremiumDashboardPage({
  user,
  onLogout,
  onProfileUpdate,
  onPasswordChange,
  onKycSubmit,
  onKycRefresh,
  onDashboardSnapshot,
  onCreateDepositRequest,
  onDepositRecords,
}) {
  const [assetVisible, setAssetVisible] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState("home");
  const [activeView, setActiveView] = useState("home");
  const [profileForm, setProfileForm] = useState({
    firstName: getFirstNameFallback(user),
    lastName: getLastNameFallback(user),
    mobile: user?.mobile || "",
    avatarUrl: user?.avatarUrl || "",
  });
  const [profileError, setProfileError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [kycForm, setKycForm] = useState({
    fullName: user?.name || "",
    certification: "",
    ssn: "",
    frontFileName: "",
    frontFileData: "",
    backFileName: "",
    backFileData: "",
  });
  const [kycStatus, setKycStatus] = useState(normalizeKycStatus(user?.kycStatus));
  const [kycAuthTag, setKycAuthTag] = useState(user?.authTag || deriveAuthTagFromStatus(user?.kycStatus));
  const [kycError, setKycError] = useState("");
  const [kycNotice, setKycNotice] = useState("");
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycSuccessPopup, setKycSuccessPopup] = useState("");
  const [dashboardNotice, setDashboardNotice] = useState(
    "Deposit reminder: always confirm the correct wallet network before sending funds.",
  );
  const [dashboardNoticeUpdatedAt, setDashboardNoticeUpdatedAt] = useState("");
  const [totalSpotAssetsUsd, setTotalSpotAssetsUsd] = useState(null);
  const [walletBalances, setWalletBalances] = useState([]);
  const [depositAssets, setDepositAssets] = useState([]);
  const [dashboardSyncError, setDashboardSyncError] = useState("");

  const [depositSearch, setDepositSearch] = useState("");
  const [selectedDepositAssetId, setSelectedDepositAssetId] = useState(null);
  const [depositAmountUsd, setDepositAmountUsd] = useState("");
  const [depositAddressCopied, setDepositAddressCopied] = useState(false);
  const [depositFileName, setDepositFileName] = useState("");
  const [depositFileData, setDepositFileData] = useState("");
  const [depositNotice, setDepositNotice] = useState("");
  const [depositError, setDepositError] = useState("");
  const [depositSubmitting, setDepositSubmitting] = useState(false);
  const [depositRecords, setDepositRecords] = useState([]);
  const [depositRecordsLoading, setDepositRecordsLoading] = useState(false);

  useEffect(() => {
    setProfileForm({
      firstName: getFirstNameFallback(user),
      lastName: getLastNameFallback(user),
      mobile: user?.mobile || "",
      avatarUrl: user?.avatarUrl || "",
    });
  }, [user]);

  useEffect(() => {
    const status = normalizeKycStatus(user?.kycStatus);
    setKycStatus(status);
    setKycAuthTag(user?.authTag || deriveAuthTagFromStatus(status));
    setKycForm((prev) => ({
      ...prev,
      fullName: prev.fullName || user?.name || "",
    }));
  }, [user?.kycStatus, user?.authTag, user?.name]);

  useEffect(() => {
    if (!onKycRefresh) {
      return undefined;
    }

    let isActive = true;
    const loadStatus = async () => {
      try {
        const payload = await onKycRefresh();
        if (!isActive) {
          return;
        }
        const status = normalizeKycStatus(payload?.user?.kycStatus || user?.kycStatus);
        setKycStatus(status);
        setKycAuthTag(payload?.user?.authTag || deriveAuthTagFromStatus(status));
      } catch {
        // Keep the current local state when status sync fails.
      }
    };

    loadStatus();
    const intervalId = window.setInterval(loadStatus, 45_000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [onKycRefresh, user?.kycStatus]);

  useEffect(() => {
    if (!onDashboardSnapshot) {
      return undefined;
    }

    let isActive = true;
    const syncDashboard = async () => {
      try {
        const data = await onDashboardSnapshot();
        if (!isActive) {
          return;
        }

        setDashboardNotice(
          data?.notice?.message || "Deposit reminder: always confirm the correct wallet network before sending funds.",
        );
        setDashboardNoticeUpdatedAt(data?.notice?.updatedAt || "");
        setTotalSpotAssetsUsd(data?.wallet?.totalSpotAssetsUsd ?? null);
        setWalletBalances(Array.isArray(data?.wallet?.balances) ? data.wallet.balances : []);
        setDepositAssets(Array.isArray(data?.deposit?.assets) ? data.deposit.assets : []);
        setDashboardSyncError("");
      } catch {
        if (isActive) {
          setDashboardSyncError("Could not sync dashboard snapshot.");
        }
      }
    };

    syncDashboard();
    const intervalId = window.setInterval(syncDashboard, 30_000);
    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [onDashboardSnapshot]);

  useEffect(() => {
    let isActive = true;
    let intervalId = null;

    const loadRows = async () => {
      try {
        const response = await fetch(BINANCE_TICKER_24H_URL);
        if (!response.ok) {
          throw new Error(`Binance request failed with status ${response.status}`);
        }

        const payload = await response.json();
        if (!Array.isArray(payload)) {
          throw new Error("Unexpected Binance response format");
        }

        if (isActive) {
          setRows(normalizeRows(payload));
          setError("");
          setLoading(false);
        }
      } catch {
        if (isActive) {
          setError("Unable to load live markets right now. Please retry.");
          setLoading(false);
        }
      }
    };

    loadRows();
    intervalId = window.setInterval(loadRows, 20_000);

    return () => {
      isActive = false;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  const visibleRows = useMemo(() => {
    const filteredRows = filterRowsByTab(rows, activeTab);
    if (activeTab === "all") {
      return filteredRows;
    }
    return filteredRows.slice(0, 40);
  }, [rows, activeTab]);

  const hasUsdSpotValue = useMemo(
    () => totalSpotAssetsUsd !== null && totalSpotAssetsUsd !== undefined && Number.isFinite(Number(totalSpotAssetsUsd)),
    [totalSpotAssetsUsd],
  );
  const totalSpotValue = useMemo(() => (hasUsdSpotValue ? Number(totalSpotAssetsUsd) : null), [hasUsdSpotValue, totalSpotAssetsUsd]);

  const topVolume = rows[0];
  const hottestMover = useMemo(() => {
    if (!rows.length) {
      return null;
    }
    return [...rows].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))[0];
  }, [rows]);

  const placeholderCopy = useMemo(() => buildPlaceholderCopy(activeMainTab), [activeMainTab]);
  const selectedDepositAsset = useMemo(
    () => depositAssets.find((item) => item.assetId === selectedDepositAssetId) || null,
    [depositAssets, selectedDepositAssetId],
  );
  const filteredDepositAssets = useMemo(() => {
    const keyword = depositSearch.trim().toLowerCase();
    if (!keyword) {
      return depositAssets;
    }
    return depositAssets.filter((item) => {
      const candidate = `${item.symbol} ${item.name} ${item.chainName}`.toLowerCase();
      return candidate.includes(keyword);
    });
  }, [depositAssets, depositSearch]);

  const showHome = activeView === "home";
  const showProfile = activeView === "profile";
  const showPassword = activeView === "password";
  const showKyc = activeView === "kyc";
  const showDepositAssetSelect = activeView === "deposit.asset-select";
  const showDepositForm = activeView === "deposit.form";
  const showDepositConfirm = activeView === "deposit.confirm";
  const showDepositRecords = activeView === "deposit.records";
  const showPlaceholder =
    !showHome &&
    !showProfile &&
    !showPassword &&
    !showKyc &&
    !showDepositAssetSelect &&
    !showDepositForm &&
    !showDepositConfirm &&
    !showDepositRecords;
  const kycMeta = getKycStatusMeta(kycStatus);
  const isUserKycAuthenticated = kycStatus === "authenticated";

  const openDrawerRoute = (route) => {
    setDrawerOpen(false);
    if (route === "support") {
      setChatOpen(true);
      setActiveView("home");
      return;
    }
    if (route === "auth") {
      setKycError("");
      setKycNotice("");
      setActiveView("kyc");
      return;
    }
    setActiveView(route);
  };

  const handleMainNavClick = (nextTab) => {
    if (!isUserKycAuthenticated && nextTab !== "home") {
      setProfileNotice("KYC authentication pending. Complete authentication to unlock this section.");
      return;
    }
    setActiveMainTab(nextTab);
    setActiveView(nextTab);
    setDrawerOpen(false);
  };

  const handleProfileFieldChange = (key, value) => {
    setProfileForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleAvatarSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > 1_500_000) {
      setProfileError("Photo size must be below 1.5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setProfileError("");
        setProfileForm((prev) => ({ ...prev, avatarUrl: reader.result }));
      }
    };
    reader.readAsDataURL(file);
  };

  const submitProfile = async (event) => {
    event.preventDefault();
    setProfileError("");
    setProfileNotice("");

    if (!profileForm.firstName.trim()) {
      setProfileError("First name is required.");
      return;
    }
    if (!profileForm.lastName.trim()) {
      setProfileError("Last name is required.");
      return;
    }
    if (profileForm.mobile && !/^\+?[0-9]{6,16}$/.test(profileForm.mobile.trim())) {
      setProfileError("Please provide a valid mobile number.");
      return;
    }

    if (!onProfileUpdate) {
      setProfileNotice("Profile UI ready. Connect update handler to save.");
      return;
    }

    setProfileSubmitting(true);
    try {
      const result = await onProfileUpdate({
        firstName: profileForm.firstName.trim(),
        lastName: profileForm.lastName.trim(),
        mobile: profileForm.mobile.trim(),
        avatarUrl: profileForm.avatarUrl || "",
      });
      setProfileNotice(result?.message || "Profile updated successfully.");
    } catch (submitError) {
      setProfileError(submitError.message || "Could not update profile.");
    } finally {
      setProfileSubmitting(false);
    }
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordNotice("");

    if (!passwordForm.currentPassword) {
      setPasswordError("Current password is required.");
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New and confirm password do not match.");
      return;
    }

    if (!onPasswordChange) {
      setPasswordNotice("Password UI ready. Connect update handler to save.");
      return;
    }

    setPasswordSubmitting(true);
    try {
      const result = await onPasswordChange(passwordForm);
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setPasswordNotice(result?.message || "Password updated successfully.");
    } catch (submitError) {
      setPasswordError(submitError.message || "Could not update password.");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleKycFieldChange = (key, value) => {
    setKycForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleKycFileSelect = async (part, event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > KYC_TEST_FILE_MAX_BYTES) {
      setKycError("Testing phase: upload smaller file now. Premium backend DB হলে বড় সাইজ enable হবে.");
      return;
    }

    if (!KYC_ALLOWED_FILE_TYPES.includes(file.type)) {
      setKycError("Supported mimes: jpg, jpeg, png, pdf, doc, docx");
      return;
    }

    try {
      const fileData = await readFileAsDataUrl(file);
      setKycError("");
      setKycForm((prev) =>
        part === "front"
          ? {
              ...prev,
              frontFileName: file.name,
              frontFileData: fileData,
            }
          : {
              ...prev,
              backFileName: file.name,
              backFileData: fileData,
            },
      );
    } catch (fileError) {
      setKycError(fileError.message || "Could not read selected file.");
    }
  };

  const submitKyc = async (event) => {
    event.preventDefault();
    setKycError("");
    setKycNotice("");

    const normalizedFullName = kycForm.fullName.trim();
    const normalizedSsn = kycForm.ssn.trim();

    if (!normalizedFullName) {
      setKycError("Please enter full name exactly as your ID document.");
      return;
    }

    if (!kycForm.certification) {
      setKycError("Please select one certification type.");
      return;
    }

    if (!kycForm.frontFileData || !kycForm.backFileData) {
      setKycError("Front part and back part photo are required.");
      return;
    }

    if (!normalizedSsn) {
      setKycError("Please enter SSN serial number.");
      return;
    }

    if (!onKycSubmit) {
      setKycStatus("pending");
      setKycAuthTag("kyc-pending");
      setKycNotice("KYC UI ready. Connect submit handler to persist on backend.");
      setKycSuccessPopup("Submitted successfully.");
      return;
    }

    setKycSubmitting(true);
    try {
      const data = await onKycSubmit({
        fullName: normalizedFullName,
        certification: kycForm.certification,
        ssn: normalizedSsn,
        frontFileName: kycForm.frontFileName,
        frontFileData: kycForm.frontFileData,
        backFileName: kycForm.backFileName,
        backFileData: kycForm.backFileData,
      });

      const nextStatus = normalizeKycStatus(data?.user?.kycStatus || "pending");
      setKycStatus(nextStatus);
      setKycAuthTag(data?.user?.authTag || deriveAuthTagFromStatus(nextStatus));
      setKycNotice(data?.message || "Submitted successfully.");
      setKycSuccessPopup("Submitted successfully.");
    } catch (submitError) {
      setKycError(submitError.message || "Could not submit KYC form.");
    } finally {
      setKycSubmitting(false);
    }
  };

  const resetDepositFlow = () => {
    setDepositAmountUsd("");
    setDepositFileName("");
    setDepositFileData("");
    setDepositError("");
    setDepositNotice("");
    setDepositAddressCopied(false);
  };

  const openDepositAssetSelector = () => {
    if (!isUserKycAuthenticated) {
      setProfileNotice("KYC authentication pending. Complete authentication before depositing.");
      return;
    }
    resetDepositFlow();
    setActiveView("deposit.asset-select");
  };

  const handleSelectDepositAsset = (assetId) => {
    setSelectedDepositAssetId(assetId);
    resetDepositFlow();
    setActiveView("deposit.form");
  };

  const openDepositRecords = async () => {
    if (!onDepositRecords) {
      setDepositError("Deposit record API is not connected yet.");
      return;
    }

    setDepositRecordsLoading(true);
    setDepositError("");
    try {
      const data = await onDepositRecords();
      setDepositRecords(Array.isArray(data?.records) ? data.records : []);
      setActiveView("deposit.records");
    } catch (loadError) {
      setDepositError(loadError.message || "Could not load deposit records.");
    } finally {
      setDepositRecordsLoading(false);
    }
  };

  const copyDepositAddress = async () => {
    if (!selectedDepositAsset?.rechargeAddress) {
      return;
    }
    try {
      await navigator.clipboard.writeText(selectedDepositAsset.rechargeAddress);
      setDepositAddressCopied(true);
      setDepositNotice("Address copied.");
      window.setTimeout(() => setDepositAddressCopied(false), 1600);
    } catch {
      setDepositError("Could not copy address. Please copy manually.");
    }
  };

  const continueDepositConfirm = () => {
    setDepositError("");
    setDepositNotice("");

    const numericAmount = Number(depositAmountUsd);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setDepositError("Please enter a valid amount.");
      return;
    }
    if (selectedDepositAsset) {
      if (numericAmount < Number(selectedDepositAsset.minAmountUsd || 0)) {
        setDepositError(`Minimum amount is ${selectedDepositAsset.minAmountUsd} USD.`);
        return;
      }
      if (numericAmount > Number(selectedDepositAsset.maxAmountUsd || 0)) {
        setDepositError(`Maximum amount is ${selectedDepositAsset.maxAmountUsd} USD.`);
        return;
      }
    }
    setActiveView("deposit.confirm");
  };

  const handleDepositScreenshotSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > DEPOSIT_SCREENSHOT_MAX_BYTES) {
      setDepositError("Max screenshot size is 15MB.");
      return;
    }

    if (!["image/jpg", "image/jpeg", "image/png", "image/heic", "image/heif"].includes(file.type)) {
      setDepositError("Supported formats: JPG, JPEG, PNG, HEIC");
      return;
    }

    try {
      const data = await readFileAsDataUrl(file);
      setDepositFileName(file.name);
      setDepositFileData(data);
      setDepositError("");
    } catch (fileError) {
      setDepositError(fileError.message || "Could not read screenshot.");
    }
  };

  const submitDeposit = async (event) => {
    event.preventDefault();
    setDepositError("");
    setDepositNotice("");

    if (!selectedDepositAsset) {
      setDepositError("Please select a crypto first.");
      return;
    }
    if (!depositFileData) {
      setDepositError("Transaction screenshot is required.");
      return;
    }
    if (!onCreateDepositRequest) {
      setDepositError("Deposit submit API is not connected yet.");
      return;
    }

    setDepositSubmitting(true);
    try {
      const data = await onCreateDepositRequest({
        assetId: selectedDepositAsset.assetId,
        amountUsd: Number(depositAmountUsd),
        screenshotFileName: depositFileName || "transaction-screenshot",
        screenshotFileData: depositFileData,
      });
      setDepositNotice(data?.message || "Deposit request submitted.");
      resetDepositFlow();
      if (onDashboardSnapshot) {
        await onDashboardSnapshot();
      }
      setKycSuccessPopup("Deposit request submitted. Admin verification pending.");
      setActiveView("home");
    } catch (submitError) {
      setDepositError(submitError.message || "Could not submit deposit request.");
    } finally {
      setDepositSubmitting(false);
    }
  };

  return (
    <main className="prodash-page">
      <div className="prodash-background-orb prodash-background-orb-left" />
      <div className="prodash-background-orb prodash-background-orb-right" />

      {drawerOpen ? <button type="button" className="prodash-drawer-backdrop" onClick={() => setDrawerOpen(false)} /> : null}

      <aside className={`prodash-drawer ${drawerOpen ? "is-open" : ""}`}>
        <div className="prodash-drawer-user">
          <div className="prodash-drawer-avatar">
            {profileForm.avatarUrl ? <img src={profileForm.avatarUrl} alt="Profile avatar" /> : <i className="fas fa-user" />}
          </div>
          <div>
            <strong>{user.name || "Trader"}</strong>
            <p>{user.email}</p>
            <span>ID: {user.userId || "------"}</span>
            <div className="prodash-drawer-kyc-row">
              <span className={`prodash-kyc-chip ${kycMeta.className}`}>KYC: {kycMeta.label}</span>
              <span className="prodash-auth-tag">{kycAuthTag || deriveAuthTagFromStatus(kycStatus)}</span>
            </div>
          </div>
        </div>

        <div className="prodash-drawer-menu">
          {DRAWER_MENU_ITEMS.map((item) => (
            <button key={item.id} type="button" onClick={() => openDrawerRoute(item.id)}>
              <i className={`fas ${item.icon}`} />
              <span>{item.label}</span>
              <i className="fas fa-chevron-right" />
            </button>
          ))}
          <button type="button" className="prodash-drawer-logout" onClick={onLogout}>
            <i className="fas fa-right-from-bracket" />
            <span>Drop Out</span>
            <i className="fas fa-chevron-right" />
          </button>
        </div>
      </aside>

      <section className="prodash-shell">
        <header className="prodash-topbar">
          <button type="button" className="prodash-icon-btn" aria-label="Menu" onClick={() => setDrawerOpen(true)}>
            <i className="fas fa-bars" />
          </button>

          <div className="prodash-brand-block">
            <p>CryptoByte Prime</p>
            <strong>
              {showProfile
                ? "Profile Settings"
                : showPassword
                  ? "Change Password"
                  : showKyc
                    ? "KYC Authentication"
                    : showDepositAssetSelect
                      ? "Select Deposit Asset"
                      : showDepositForm
                        ? "Deposit Address"
                        : showDepositConfirm
                          ? "Confirm Deposit"
                          : showDepositRecords
                            ? "Deposit Records"
                  : activeMainTab === "home"
                    ? "Professional Trading Dashboard"
                    : placeholderCopy.title}
            </strong>
          </div>

          <button
            type="button"
            className="prodash-icon-btn prodash-chat-btn"
            aria-label="Support"
            onClick={() => setChatOpen(true)}
          >
            <i className="far fa-comment-dots" />
          </button>
        </header>

        <div className="prodash-content-area">
          {showHome ? (
            <div>
              <div className="prodash-notice">
                <span className="prodash-notice-pill">NOTICE</span>
                <p>{dashboardNotice}</p>
                <i className="fas fa-chevron-right" />
              </div>

              {profileNotice ? <p className="prodash-page-notice">{profileNotice}</p> : null}
              {dashboardNoticeUpdatedAt ? (
                <p className="prodash-page-notice">Notice updated: {new Date(dashboardNoticeUpdatedAt).toLocaleString()}</p>
              ) : null}
              {dashboardSyncError ? <p className="prodash-form-error">{dashboardSyncError}</p> : null}

              <div className="prodash-grid">
                <div className="prodash-left-column">
                  <section className="prodash-wallet-card">
                    <div className="prodash-wallet-copy">
                      <p>Total spot assets value</p>
                      <button
                        type="button"
                        className="prodash-eye-btn"
                        onClick={() => setAssetVisible((value) => !value)}
                        aria-label={assetVisible ? "Hide assets" : "Show assets"}
                      >
                        <i className={`fas ${assetVisible ? "fa-eye" : "fa-eye-slash"}`} />
                      </button>
                      <h1>
                        {assetVisible ? (hasUsdSpotValue ? `$${formatCurrency(totalSpotValue)}` : "==") : "•••••••"}
                        <span>USD</span>
                      </h1>
                      <small>
                        Welcome back, {user.name || "Trader"} • ID {user.userId || "------"}
                      </small>
                      <div className="prodash-wallet-tags">
                        <span className={`prodash-kyc-chip ${kycMeta.className}`}>KYC {kycMeta.label}</span>
                        <span className="prodash-auth-tag">{kycAuthTag || deriveAuthTagFromStatus(kycStatus)}</span>
                      </div>
                      {walletBalances.length ? (
                        <div className="prodash-wallet-balance-strip">
                          {walletBalances.slice(0, 4).map((balance) => (
                            <span key={balance.symbol}>
                              {balance.symbol}: ${formatCurrency(balance.totalUsd)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {!isUserKycAuthenticated ? (
                        <p className="prodash-lock-note">KYC authenticated না হলে deposit এবং premium actions lock থাকবে.</p>
                      ) : null}
                    </div>

                    <div className="prodash-wallet-actions">
                      <button
                        type="button"
                        className="prodash-deposit-btn"
                        disabled={!isUserKycAuthenticated}
                        onClick={openDepositAssetSelector}
                      >
                        Deposit
                      </button>
                      <button type="button" className="prodash-logout-btn" onClick={onLogout}>
                        Logout
                      </button>
                    </div>
                  </section>

                  <section className="prodash-quick-actions">
                    {QUICK_ACTIONS.map((action) => (
                      <button
                        type="button"
                        key={action.label}
                        className="prodash-quick-item"
                        disabled={!isUserKycAuthenticated}
                        title={!isUserKycAuthenticated ? "Complete KYC authentication first" : action.label}
                      >
                        <span>
                          <i className={`fas ${action.icon}`} />
                        </span>
                        <strong>{action.label}</strong>
                      </button>
                    ))}
                  </section>

                  <section className="prodash-promos">
                    <article className="prodash-promo-card prodash-promo-primary">
                      <div>
                        <h3>Initial coin offer (ICO)</h3>
                        <p>More wealth awaits you</p>
                        <small>Tap to view ICO list</small>
                      </div>
                      <div className="prodash-promo-icon">
                        <i className="fas fa-coins" />
                      </div>
                    </article>

                    <div className="prodash-promo-dual">
                      <article className="prodash-promo-card prodash-promo-mini">
                        <div>
                          <h4>LUM</h4>
                          <p>Liquidity utility module</p>
                        </div>
                        <span className="prodash-mini-badge">
                          <i className="fas fa-gavel" />
                        </span>
                      </article>

                      <article className="prodash-promo-card prodash-promo-mini">
                        <div>
                          <h4>Mining</h4>
                          <p>Optimized reward pools</p>
                        </div>
                        <span className="prodash-mini-badge prodash-sale-badge">SALE</span>
                      </article>
                    </div>

                    <article className="prodash-promo-card prodash-promo-paper">
                      <div>
                        <h3>Crypto Byte Whitepaper</h3>
                        <button type="button">Read</button>
                      </div>
                      <div className="prodash-paper-icon">
                        <i className="fas fa-file-lines" />
                      </div>
                    </article>
                  </section>
                </div>

                <aside className="prodash-right-column">
                  <section className="prodash-market-card">
                    <header className="prodash-market-header">
                      <div>
                        <h2>Market Overview</h2>
                        <p>{rows.length ? `${rows.length} USDT pairs from Binance` : "Fetching Binance markets..."}</p>
                      </div>
                      <span className="prodash-live-dot">Live</span>
                    </header>

                    <div className="prodash-market-highlights">
                      <article>
                        <p>Highest Volume</p>
                        <strong>{topVolume ? topVolume.pair : "BTC/USDT"}</strong>
                        <small>{topVolume ? `$${formatCompactValue(topVolume.quoteVolume)}` : "$2.14B"}</small>
                      </article>
                      <article>
                        <p>Hot Mover</p>
                        <strong>{hottestMover ? hottestMover.pair : "PEPE/USDT"}</strong>
                        <small className={hottestMover && hottestMover.changePercent < 0 ? "is-down" : "is-up"}>
                          {hottestMover ? formatPercent(hottestMover.changePercent) : "+9.62%"}
                        </small>
                      </article>
                    </div>

                    <div className="prodash-tabs" role="tablist" aria-label="Market tabs">
                      {MARKET_TABS.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          className={activeTab === tab.id ? "active" : ""}
                          onClick={() => setActiveTab(tab.id)}
                          role="tab"
                          aria-selected={activeTab === tab.id}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="prodash-market-table">
                      <div className="prodash-market-head">
                        <span>Volume</span>
                        <span>Latest Price</span>
                        <span>Change</span>
                      </div>

                      {loading ? <div className="prodash-market-status">Loading live Binance data...</div> : null}
                      {error ? <div className="prodash-market-status prodash-market-error">{error}</div> : null}

                      {!loading && !error ? (
                        <div className="prodash-market-body">
                          {visibleRows.map((row) => (
                            <article key={row.symbol} className="prodash-market-row">
                              <div className="prodash-market-symbol">
                                <strong>{row.base}</strong>
                                <span>/USDT · {formatCompactValue(row.quoteVolume)}</span>
                              </div>
                              <p>${formatPrice(row.lastPrice)}</p>
                              <span className={row.changePercent >= 0 ? "prodash-change-up" : "prodash-change-down"}>
                                {formatPercent(row.changePercent)}
                              </span>
                            </article>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </section>
                </aside>
              </div>
            </div>
          ) : null}

          {showProfile ? (
            <section className="prodash-panel-card">
              <header className="prodash-panel-header">
                <button type="button" className="prodash-back-btn" onClick={() => setActiveView(activeMainTab)}>
                  <i className="fas fa-arrow-left" />
                </button>
                <h2>Profile</h2>
              </header>

              <form className="prodash-form" onSubmit={submitProfile}>
                <div className="prodash-avatar-upload">
                  <div className="prodash-avatar-preview">
                    {profileForm.avatarUrl ? <img src={profileForm.avatarUrl} alt="Profile avatar" /> : <i className="fas fa-user" />}
                  </div>
                  <label className="prodash-avatar-edit-btn">
                    <input type="file" accept="image/*" onChange={handleAvatarSelect} />
                    <i className="fas fa-camera" />
                    Add Photo
                  </label>
                </div>

                <label>
                  First Name
                  <input
                    type="text"
                    value={profileForm.firstName}
                    onChange={(event) => handleProfileFieldChange("firstName", event.target.value)}
                    placeholder="Enter first name"
                  />
                </label>

                <label>
                  Last Name
                  <input
                    type="text"
                    value={profileForm.lastName}
                    onChange={(event) => handleProfileFieldChange("lastName", event.target.value)}
                    placeholder="Enter last name"
                  />
                </label>

                <label>
                  Mobile Number
                  <input
                    type="text"
                    value={profileForm.mobile}
                    onChange={(event) => handleProfileFieldChange("mobile", event.target.value)}
                    placeholder="Enter mobile number"
                  />
                </label>

                <label>
                  Email Address
                  <input type="email" value={user.email || ""} readOnly />
                </label>

                {profileError ? <p className="prodash-form-error">{profileError}</p> : null}
                {profileNotice ? <p className="prodash-form-notice">{profileNotice}</p> : null}

                <button type="submit" className="prodash-submit-btn" disabled={profileSubmitting}>
                  {profileSubmitting ? "Updating..." : "Update Profile"}
                </button>
              </form>
            </section>
          ) : null}

          {showPassword ? (
            <section className="prodash-panel-card">
              <header className="prodash-panel-header">
                <button type="button" className="prodash-back-btn" onClick={() => setActiveView(activeMainTab)}>
                  <i className="fas fa-arrow-left" />
                </button>
                <h2>Change Password</h2>
              </header>

              <form className="prodash-form" onSubmit={submitPassword}>
                <label>
                  Current Password
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
                    placeholder="Enter current password"
                  />
                </label>

                <label>
                  New Password
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                    placeholder="Enter new password"
                  />
                </label>

                <label>
                  Confirm Password
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                    placeholder="Confirm new password"
                  />
                </label>

                {passwordError ? <p className="prodash-form-error">{passwordError}</p> : null}
                {passwordNotice ? <p className="prodash-form-notice">{passwordNotice}</p> : null}

                <button type="submit" className="prodash-submit-btn" disabled={passwordSubmitting}>
                  {passwordSubmitting ? "Updating..." : "Update Password"}
                </button>
              </form>
            </section>
          ) : null}

          {showKyc ? (
            <section className="prodash-panel-card prodash-kyc-card">
              <header className="prodash-panel-header">
                <button type="button" className="prodash-back-btn" onClick={() => setActiveView(activeMainTab)}>
                  <i className="fas fa-arrow-left" />
                </button>
                <h2>KYC Form</h2>
              </header>

              <form className="prodash-form prodash-kyc-form" onSubmit={submitKyc}>
                <label>
                  Full Name
                  <input
                    type="text"
                    value={kycForm.fullName}
                    onChange={(event) => handleKycFieldChange("fullName", event.target.value)}
                    placeholder="Same as NID/Passport/Driving License"
                  />
                </label>

                <label>
                  Certification
                  <select
                    value={kycForm.certification}
                    onChange={(event) => handleKycFieldChange("certification", event.target.value)}
                  >
                    {KYC_CERTIFICATION_OPTIONS.map((option) => (
                      <option key={option.value || "empty"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Front Part Photo
                  <input type="file" accept={KYC_ACCEPT_ATTR} onChange={(event) => handleKycFileSelect("front", event)} />
                  <small className="prodash-kyc-hint">Supported mimes: jpg, jpeg, png, pdf, doc, docx</small>
                  <span className="prodash-file-name">{kycForm.frontFileName || "No file chosen"}</span>
                </label>

                <label>
                  Back Part Photo
                  <input type="file" accept={KYC_ACCEPT_ATTR} onChange={(event) => handleKycFileSelect("back", event)} />
                  <small className="prodash-kyc-hint">Supported mimes: jpg, jpeg, png, pdf, doc, docx</small>
                  <span className="prodash-file-name">{kycForm.backFileName || "No file chosen"}</span>
                </label>

                <label>
                  SSN
                  <input
                    type="text"
                    value={kycForm.ssn}
                    onChange={(event) => handleKycFieldChange("ssn", event.target.value)}
                    placeholder="Serial number"
                  />
                </label>

                {kycError ? <p className="prodash-form-error">{kycError}</p> : null}
                {kycNotice ? <p className="prodash-form-notice">{kycNotice}</p> : null}

                <button type="submit" className="prodash-submit-btn" disabled={kycSubmitting}>
                  {kycSubmitting ? "Submitting..." : "Submit"}
                </button>
              </form>
            </section>
          ) : null}

          {showDepositAssetSelect ? (
            <section className="prodash-panel-card prodash-deposit-select-card">
              <header className="prodash-panel-header">
                <button type="button" className="prodash-back-btn" onClick={() => setActiveView("home")}>
                  <i className="fas fa-arrow-left" />
                </button>
                <h2>Select Deposit Crypto</h2>
              </header>

              <div className="prodash-deposit-search-row">
                <input
                  type="text"
                  value={depositSearch}
                  onChange={(event) => setDepositSearch(event.target.value)}
                  placeholder="Please enter the short name"
                />
              </div>

              <div className="prodash-deposit-asset-list">
                {filteredDepositAssets.map((asset) => (
                  <button
                    key={asset.assetId}
                    type="button"
                    className="prodash-deposit-asset-item"
                    onClick={() => handleSelectDepositAsset(asset.assetId)}
                  >
                    <span className="prodash-deposit-asset-avatar">{asset.symbol.slice(0, 1)}</span>
                    <div>
                      <strong>{asset.symbol}</strong>
                      <p>{asset.name}</p>
                    </div>
                    <small>{asset.chainName}</small>
                  </button>
                ))}
              </div>

              {!filteredDepositAssets.length ? <p className="prodash-kyc-hint">No matching crypto found.</p> : null}
            </section>
          ) : null}

          {showDepositForm && selectedDepositAsset ? (
            <section className="prodash-panel-card prodash-deposit-form-card">
              <header className="prodash-panel-header prodash-deposit-header-row">
                <button type="button" className="prodash-back-btn" onClick={() => setActiveView("deposit.asset-select")}>
                  <i className="fas fa-arrow-left" />
                </button>

                <div className="prodash-deposit-header-title">
                  <h2>{selectedDepositAsset.symbol} Deposit</h2>
                  <button type="button" className="prodash-inline-link" onClick={() => setActiveView("deposit.asset-select")}>
                    Change crypto
                  </button>
                </div>

                <button type="button" className="prodash-inline-link" onClick={openDepositRecords}>
                  Record
                </button>
              </header>

              <div className="prodash-deposit-address-card">
                <h3>Scan to get the recharge address</h3>
                <div className="prodash-deposit-qr-wrap">
                  {selectedDepositAsset.qrCodeData ? (
                    <img src={selectedDepositAsset.qrCodeData} alt={`${selectedDepositAsset.symbol} QR`} />
                  ) : (
                    <div className="prodash-deposit-qr-fallback">No QR</div>
                  )}
                </div>
                <p className="prodash-deposit-address-text">{shortenAddress(selectedDepositAsset.rechargeAddress)}</p>
                <p className="prodash-deposit-warning-text">
                  The recharge address on this page is the only official recharge entrance of the platform.
                </p>
                <button
                  type="button"
                  className={`prodash-copy-btn ${depositAddressCopied ? "is-copied" : ""}`}
                  onClick={copyDepositAddress}
                >
                  {depositAddressCopied ? "Copied" : "Click to copy"}
                </button>
              </div>

              <div className="prodash-deposit-amount-card">
                <label>
                  Amount (USD)
                  <input
                    type="number"
                    step="0.01"
                    value={depositAmountUsd}
                    onChange={(event) => setDepositAmountUsd(event.target.value)}
                    placeholder="Enter amount"
                  />
                </label>
                <small>
                  Min {selectedDepositAsset.minAmountUsd} / Max {selectedDepositAsset.maxAmountUsd}
                </small>

                {depositError ? <p className="prodash-form-error">{depositError}</p> : null}
                {depositNotice ? <p className="prodash-form-notice">{depositNotice}</p> : null}

                <button type="button" className="prodash-submit-btn" onClick={continueDepositConfirm}>
                  Continue
                </button>
              </div>
            </section>
          ) : null}

          {showDepositConfirm && selectedDepositAsset ? (
            <section className="prodash-panel-card prodash-deposit-confirm-card">
              <header className="prodash-panel-header">
                <button type="button" className="prodash-back-btn" onClick={() => setActiveView("deposit.form")}>
                  <i className="fas fa-arrow-left" />
                </button>
                <h2>Confirm Your Deposit</h2>
              </header>

              <p className="prodash-deposit-confirm-subtitle">Please upload the transaction screenshot below</p>

              <form className="prodash-form" onSubmit={submitDeposit}>
                <label className="prodash-upload-zone">
                  <span className="prodash-upload-icon">
                    <i className="fas fa-cloud-arrow-up" />
                  </span>
                  <strong>Transaction screenshot</strong>
                  <input type="file" accept={DEPOSIT_SCREENSHOT_ACCEPT} onChange={handleDepositScreenshotSelect} />
                  <small>Supported formats: JPG, PNG, HEIC</small>
                  <small>Max size: 15MB</small>
                  <span className="prodash-file-name">{depositFileName || "No file chosen"}</span>
                </label>

                <div className="prodash-deposit-confirm-meta">
                  <span>{selectedDepositAsset.symbol}</span>
                  <span>${formatCurrency(Number(depositAmountUsd || 0))} USD</span>
                </div>

                {depositError ? <p className="prodash-form-error">{depositError}</p> : null}
                {depositNotice ? <p className="prodash-form-notice">{depositNotice}</p> : null}

                <button type="submit" className="prodash-submit-btn" disabled={depositSubmitting}>
                  {depositSubmitting ? "Submitting..." : "Confirm Deposit"}
                </button>
              </form>
            </section>
          ) : null}

          {showDepositRecords ? (
            <section className="prodash-panel-card prodash-deposit-records-card">
              <header className="prodash-panel-header">
                <button type="button" className="prodash-back-btn" onClick={() => setActiveView("deposit.form")}>
                  <i className="fas fa-arrow-left" />
                </button>
                <h2>Deposit Records</h2>
              </header>

              {depositRecordsLoading ? <p className="prodash-kyc-hint">Loading records...</p> : null}
              {!depositRecordsLoading && !depositRecords.length ? (
                <p className="prodash-kyc-hint">No deposit records available yet.</p>
              ) : null}

              {!depositRecordsLoading && depositRecords.length ? (
                <div className="prodash-market-table">
                  <div className="prodash-market-head">
                    <span>Asset</span>
                    <span>Amount</span>
                    <span>Status</span>
                  </div>
                  <div className="prodash-market-body">
                    {depositRecords.map((record) => (
                      <article key={record.requestId} className="prodash-market-row">
                        <div className="prodash-market-symbol">
                          <strong>{record.assetSymbol}</strong>
                          <span>{new Date(record.submittedAt).toLocaleString()}</span>
                        </div>
                        <p>${formatCurrency(record.amountUsd)}</p>
                        <span
                          className={
                            record.status === "approved"
                              ? "prodash-change-up"
                              : record.status === "rejected"
                                ? "prodash-change-down"
                                : "prodash-neutral-badge"
                          }
                        >
                          {record.status}
                        </span>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {showPlaceholder ? (
            <section className="prodash-panel-card prodash-placeholder-card">
              <h2>{placeholderCopy.title}</h2>
              <p>{placeholderCopy.subtitle}</p>
              <p className="prodash-placeholder-note">UI is ready and waiting for your next feature instructions.</p>
            </section>
          ) : null}
        </div>
      </section>

      {chatOpen ? (
        <div className="prodash-chat-overlay" onClick={() => setChatOpen(false)}>
          <section className="prodash-chat-modal" onClick={(event) => event.stopPropagation()}>
            <header className="prodash-chat-header">
              <div className="prodash-chat-agent-avatar">A</div>
              <div className="prodash-chat-agent-copy">
                <strong>Support Chat</strong>
                <p>
                  <span className="prodash-chat-online-dot" /> Chat with customer support
                </p>
              </div>
              <button type="button" aria-label="Close support chat" onClick={() => setChatOpen(false)}>
                <i className="fas fa-xmark" />
              </button>
            </header>

            <div className="prodash-chat-body" />

            <footer className="prodash-chat-footer">
              <button type="button" aria-label="Emoji">
                <i className="far fa-face-smile" />
              </button>
              <button type="button" aria-label="Attach">
                <i className="fas fa-paperclip" />
              </button>
              <input type="text" readOnly value="" placeholder="Write a message..." />
              <button type="button" className="prodash-chat-send" aria-label="Send">
                <i className="fas fa-paper-plane" />
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {kycSuccessPopup ? (
        <div className="prodash-popup-overlay" onClick={() => setKycSuccessPopup("") }>
          <section className="prodash-success-popup" role="alertdialog" onClick={(event) => event.stopPropagation()}>
            <i className="fas fa-circle-check" />
            <h3>Submitted successfully</h3>
            <p>{kycSuccessPopup}</p>
            <button type="button" onClick={() => setKycSuccessPopup("") }>
              OK
            </button>
          </section>
        </div>
      ) : null}

      <nav className="prodash-floating-nav" aria-label="Primary">
        {BOTTOM_NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activeMainTab === item.id ? "active" : ""}
            onClick={() => handleMainNavClick(item.id)}
          >
            <i className={`fas ${item.icon}`} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
