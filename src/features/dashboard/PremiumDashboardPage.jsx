import { useEffect, useMemo, useState } from "react";
import "./premium-dashboard.css";
import SupportChatModal from "../support/SupportChatModal";

const BINANCE_TICKER_24H_URL = "https://api.binance.com/api/v3/ticker/24hr";
const DEFAULT_DASHBOARD_NOTICE = "Deposit reminder: always confirm the correct wallet network before sending funds.";

const MARKET_TABS = [
  { id: "all", label: "All" },
  { id: "newest", label: "Newest" },
  { id: "hot", label: "Hot" },
];

const QUICK_ACTIONS = [
  { id: "lum", label: "LUM", icon: "fa-satellite-dish" },
  { id: "binary", label: "Binary", icon: "fa-chart-line" },
  { id: "recharge", label: "Recharge", icon: "fa-bolt" },
  { id: "transaction", label: "Transaction", icon: "fa-right-left" },
  { id: "recovery", label: "Recovery", icon: "fa-shield-halved" },
  { id: "loan", label: "Loan", icon: "fa-hand-holding-dollar" },
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
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const KYC_SERVER_FILE_MIME_TYPES = ["image/jpg", "image/jpeg", "image/png", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const KYC_ALLOWED_FILE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "pdf", "doc", "docx"];
const KYC_ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx";
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

function getKycStatusMeta(status, { notSubmitted = false } = {}) {
  const normalized = normalizeKycStatus(status);
  if (normalized === "authenticated") {
    return { label: "Authenticated", className: "is-authenticated" };
  }
  if (normalized === "rejected") {
    return { label: "Rejected", className: "is-rejected" };
  }
  return { label: notSubmitted ? "Please submit KYC" : "Pending", className: "is-pending" };
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

function getFileExtension(fileName = "") {
  const parts = String(fileName || "").trim().toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
}

function isAllowedKycFile(file) {
  if (!file) {
    return false;
  }
  const mimeType = String(file.type || "").trim().toLowerCase();
  const extension = getFileExtension(file.name);
  return KYC_ALLOWED_FILE_TYPES.includes(mimeType) || KYC_ALLOWED_FILE_EXTENSIONS.includes(extension);
}

function getKycFallbackMime(fileName = "") {
  const extension = getFileExtension(fileName);
  if (["jpg", "jpeg"].includes(extension)) {
    return "image/jpeg";
  }
  if (extension === "png") {
    return "image/png";
  }
  if (extension === "pdf") {
    return "application/pdf";
  }
  if (extension === "doc") {
    return "application/msword";
  }
  if (extension === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "";
}

function normalizeDataUrlMime(dataUrl = "", mimeType = "") {
  const resolvedMime = String(mimeType || "").trim().toLowerCase();
  if (!resolvedMime || !String(dataUrl || "").startsWith("data:")) {
    return dataUrl;
  }
  return String(dataUrl).replace(/^data:[^;,]*;/i, `data:${resolvedMime};`);
}

function getKycFileKind({ fileName = "", mimeType = "", fileData = "" } = {}) {
  const normalizedMime = String(mimeType || "").trim().toLowerCase();
  const extension = getFileExtension(fileName);
  const normalizedData = String(fileData || "").trim().toLowerCase();
  if (normalizedMime.startsWith("image/") || normalizedData.startsWith("data:image/") || ["jpg", "jpeg", "png", "webp"].includes(extension)) {
    return "image";
  }
  if (normalizedMime === "application/pdf" || normalizedData.startsWith("data:application/pdf") || extension === "pdf") {
    return "pdf";
  }
  return "document";
}

function getDataUrlByteSize(dataUrl = "") {
  const base64Body = String(dataUrl || "").split(",")[1] || "";
  if (!base64Body) {
    return 0;
  }
  return Math.floor((base64Body.length * 3) / 4);
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not preview this image. Please upload JPG or PNG."));
    };
    image.src = url;
  });
}

async function compressKycImageFile(file) {
  const image = await loadImageFromFile(file);
  const originalWidth = image.naturalWidth || image.width;
  const originalHeight = image.naturalHeight || image.height;
  if (!originalWidth || !originalHeight) {
    throw new Error("Could not read selected image dimensions.");
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Image compression is not available on this device.");
  }

  const longestSides = [1600, 1280, 1024, 860, 720, 620];
  const qualities = [0.86, 0.78, 0.68, 0.58, 0.48];
  let best = "";

  for (const longestSide of longestSides) {
    const scale = Math.min(1, longestSide / Math.max(originalWidth, originalHeight));
    canvas.width = Math.max(1, Math.round(originalWidth * scale));
    canvas.height = Math.max(1, Math.round(originalHeight * scale));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of qualities) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      best = dataUrl;
      if (getDataUrlByteSize(dataUrl) <= KYC_TEST_FILE_MAX_BYTES) {
        return dataUrl;
      }
    }
  }

  return best;
}

async function prepareKycFileData(file) {
  const mimeType = String(file?.type || "").trim().toLowerCase();
  const extension = getFileExtension(file?.name);
  const isImage = mimeType.startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(extension);
  const fallbackMime = getKycFallbackMime(file?.name);
  const serverSupportedOriginal = KYC_SERVER_FILE_MIME_TYPES.includes(mimeType);

  if (isImage && (!serverSupportedOriginal || file.size > KYC_TEST_FILE_MAX_BYTES)) {
    const compressedData = await compressKycImageFile(file);
    const compressedSize = getDataUrlByteSize(compressedData);
    if (compressedSize > KYC_TEST_FILE_MAX_BYTES) {
      throw new Error("Image is too large. Please crop or upload a clearer smaller image.");
    }
    const baseName = String(file.name || "kyc-photo").replace(/\.[^.]+$/, "");
    return {
      fileName: `${baseName}.jpg`,
      fileData: compressedData,
      mimeType: "image/jpeg",
      sizeBytes: compressedSize,
    };
  }

  if (file.size > KYC_TEST_FILE_MAX_BYTES) {
    throw new Error("File is too large. Please upload a smaller file under 350KB.");
  }

  const resolvedMimeType = mimeType || fallbackMime;
  if (!KYC_SERVER_FILE_MIME_TYPES.includes(resolvedMimeType)) {
    throw new Error("Supported files: jpg, jpeg, png, pdf, doc, docx");
  }

  const fileData = normalizeDataUrlMime(await readFileAsDataUrl(file), resolvedMimeType);
  return {
    fileName: file.name,
    fileData,
    mimeType: resolvedMimeType,
    sizeBytes: file.size,
  };
}

function formatBytes(value = 0) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "0 B";
  }
  if (numeric >= 1024 * 1024) {
    return `${(numeric / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (numeric >= 1024) {
    return `${(numeric / 1024).toFixed(1)} KB`;
  }
  return `${Math.floor(numeric)} B`;
}

function KycDocumentUploadCard({
  label,
  icon,
  fileName,
  fileData,
  fileSizeBytes,
  mimeType,
  disabled,
  onChange,
  onRemove,
}) {
  const hasFile = Boolean(fileName && fileData);
  const kind = getKycFileKind({ fileName, mimeType, fileData });

  return (
    <div className={`prodash-kyc-upload-card ${hasFile ? "has-file" : ""}`}>
      <div className="prodash-kyc-upload-head">
        <span><i className={`fas ${icon}`} /></span>
        <div>
          <strong>{label}</strong>
          <small>JPG, PNG, WEBP, PDF, DOC or DOCX</small>
        </div>
      </div>

      <label className="prodash-kyc-file-picker">
        <input
          type="file"
          accept={KYC_ACCEPT_ATTR}
          onChange={onChange}
          disabled={disabled}
        />
        <span><i className="fas fa-cloud-arrow-up" /> Choose file</span>
      </label>

      {hasFile ? (
        <div className={`prodash-kyc-preview is-${kind}`}>
          {kind === "image" ? (
            <img src={fileData} alt={`${label} preview`} />
          ) : (
            <div className="prodash-kyc-file-icon">
              <i className={`fas ${kind === "pdf" ? "fa-file-pdf" : "fa-file-lines"}`} />
            </div>
          )}
          <div className="prodash-kyc-file-meta">
            <strong title={fileName}>{fileName}</strong>
            <small>{formatBytes(fileSizeBytes)}</small>
          </div>
          {!disabled ? (
            <button type="button" onClick={onRemove} aria-label={`Remove ${label}`}>
              <i className="fas fa-xmark" />
            </button>
          ) : null}
        </div>
      ) : (
        <div className="prodash-kyc-preview-empty">
          <i className="fas fa-image" />
          <span>No file selected</span>
        </div>
      )}
    </div>
  );
}

function formatCurrency(value) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatWalletSymbolDisplay(walletSymbol = "") {
  const raw = String(walletSymbol || "").trim();
  if (!raw) {
    return "--";
  }
  const normalized = raw.replace(/-/g, "_").toUpperCase();
  if (!normalized.includes("_")) {
    return normalized;
  }
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part, index) => {
      if (index === 0 && ["SPOT", "MAIN", "BINARY"].includes(part)) {
        return part.charAt(0) + part.slice(1).toLowerCase();
      }
      return part;
    })
    .join(" ");
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

function buildQrCodeFallback(address = "", symbol = "") {
  const content = String(address || symbol || "").trim();
  if (!content) {
    return "";
  }
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(content)}`;
}

function resolveQrCodeSource(rawValue = "", address = "", symbol = "") {
  const value = String(rawValue || "").trim();
  if (!value) {
    return buildQrCodeFallback(address, symbol);
  }
  if (/^data:image\//i.test(value)) {
    return value;
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  if (value.startsWith("/")) {
    return `${window.location.origin}${value}`;
  }
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 200) {
    return `data:image/png;base64,${value.replace(/\s+/g, "")}`;
  }
  return buildQrCodeFallback(address, symbol);
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

function normalizeMarketPrioritySymbol(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeMarketPrioritySymbols(values = []) {
  const list = Array.isArray(values) ? values : [];
  const seen = new Set();
  const normalized = [];
  for (const value of list) {
    const symbol = normalizeMarketPrioritySymbol(value);
    if (!symbol || seen.has(symbol)) {
      continue;
    }
    seen.add(symbol);
    normalized.push(symbol);
  }
  return normalized;
}

function normalizeNoticeSeverity(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "critical") {
    return "critical";
  }
  if (normalized === "warning" || normalized === "warn") {
    return "warning";
  }
  return "info";
}

function normalizeNoticeItem(item = {}) {
  const message = String(item?.message || "").trim();
  if (!message) {
    return null;
  }
  const noticeId = Number(item?.noticeId || 0);
  return {
    noticeId: Number.isFinite(noticeId) && noticeId > 0 ? noticeId : 0,
    title: String(item?.title || "").trim(),
    message,
    severity: normalizeNoticeSeverity(item?.severity || "info"),
    priority: Number(item?.priority || 0),
    startsAt: String(item?.startsAt || ""),
    expiresAt: String(item?.expiresAt || ""),
    updatedAt: String(item?.updatedAt || ""),
    isDismissible: Boolean(item?.isDismissible),
    targetSummary: String(item?.targetSummary || ""),
  };
}

function normalizeNoticeItems(items = []) {
  const list = Array.isArray(items) ? items : [];
  const normalized = [];
  const seen = new Set();
  for (const row of list) {
    const item = normalizeNoticeItem(row);
    if (!item) {
      continue;
    }
    const dedupeKey = item.noticeId ? `id:${item.noticeId}` : `msg:${item.message}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    normalized.push(item);
  }
  return normalized;
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
  entryMainTab = "home",
  onLogout,
  onProfileUpdate,
  onPasswordChange,
  onKycSubmit,
  onKycRefresh,
  onDashboardSnapshot,
  onDismissNotice,
  onOpenDepositPage,
  onOpenLumPage,
  onOpenGoldMiningPage,
  onOpenBinaryPage,
  onOpenTransactionPage,
  onOpenAssetsPage,
  onOpenLoanPage,
  onOpenLaunchpadPage,
  biometricAuthState = null,
  onEnableBiometricLogin = null,
  onDisableBiometricLogin = null,
  onCreateDepositRequest,
  onDepositRecords,
  onLoadSupportTickets,
  onLoadSupportTicketDetail,
  onCreateSupportTicket,
  onSendSupportTicketMessage,
  onUpdateSupportTicketStatus,
  onLoadLiveThread,
  onSendLiveMessage,

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
    frontFileMimeType: "",
    frontFileSizeBytes: 0,
    backFileName: "",
    backFileData: "",
    backFileMimeType: "",
    backFileSizeBytes: 0,
  });
  const [kycStatus, setKycStatus] = useState(normalizeKycStatus(user?.kycStatus));
  const [kycAuthTag, setKycAuthTag] = useState(user?.authTag || deriveAuthTagFromStatus(user?.kycStatus));
  const [kycError, setKycError] = useState("");
  const [kycNotice, setKycNotice] = useState("");
  const [kycSubmitting, setKycSubmitting] = useState(false);
  const [kycSuccessPopup, setKycSuccessPopup] = useState("");
  const [dashboardNotice, setDashboardNotice] = useState(DEFAULT_DASHBOARD_NOTICE);
  const [dashboardNoticeUpdatedAt, setDashboardNoticeUpdatedAt] = useState("");
  const [dashboardNotices, setDashboardNotices] = useState([]);
  const [noticePanelOpen, setNoticePanelOpen] = useState(false);
  const [noticeDismissError, setNoticeDismissError] = useState("");
  const [noticeDismissingId, setNoticeDismissingId] = useState(0);
  const [totalSpotAssetsUsd, setTotalSpotAssetsUsd] = useState(null);
  const [walletBalances, setWalletBalances] = useState([]);
  const [depositAssets, setDepositAssets] = useState([]);
  const [marketPrioritySymbols, setMarketPrioritySymbols] = useState([]);
  const [launchpadSnapshot, setLaunchpadSnapshot] = useState(null);
  const [dashboardSyncError, setDashboardSyncError] = useState("");
  const biometricState = biometricAuthState && typeof biometricAuthState === "object"
    ? biometricAuthState
    : { supported: false, enabled: false, checking: false, processing: false, message: "" };

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
  const [recentDepositRecords, setRecentDepositRecords] = useState([]);
  const [depositStatusError, setDepositStatusError] = useState("");
  const [whitepaperOpen, setWhitepaperOpen] = useState(false);
  const applyDashboardSnapshot = (data = {}) => {
    const snapshotItems = normalizeNoticeItems(data?.notices?.items);
    const snapshotPrimary = normalizeNoticeItem(data?.notice || {});
    const resolvedItems = snapshotItems.length ? snapshotItems : snapshotPrimary ? [snapshotPrimary] : [];
    const resolvedPrimary = snapshotPrimary || resolvedItems[0] || null;

    setDashboardNotices(resolvedItems);
    setDashboardNotice(resolvedPrimary?.message || DEFAULT_DASHBOARD_NOTICE);
    setDashboardNoticeUpdatedAt(resolvedPrimary?.updatedAt || "");
    if (data?.wallet) {
      setTotalSpotAssetsUsd(data?.wallet?.totalSpotAssetsUsd ?? null);
      setWalletBalances(Array.isArray(data?.wallet?.balances) ? data.wallet.balances : []);
    }
    if (data?.deposit) {
      setDepositAssets(Array.isArray(data?.deposit?.assets) ? data.deposit.assets : []);
    }
    if (data?.market) {
      setMarketPrioritySymbols(normalizeMarketPrioritySymbols(data?.market?.prioritySymbols));
    }
    if (data?.launchpad) {
      setLaunchpadSnapshot(data.launchpad);
    }
  };

  useEffect(() => {
    if (!entryMainTab) {
      return;
    }
    setActiveMainTab(entryMainTab);
    setActiveView(entryMainTab);
  }, [entryMainTab]);

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
        applyDashboardSnapshot(data);
        setDashboardSyncError("");
        setNoticeDismissError("");
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

  useEffect(() => {
    if (!onDepositRecords) {
      return undefined;
    }

    let isActive = true;
    const loadRecords = async () => {
      try {
        const payload = await onDepositRecords();
        if (!isActive) {
          return;
        }
        setRecentDepositRecords(Array.isArray(payload?.records) ? payload.records.slice(0, 5) : []);
        setDepositStatusError("");
      } catch {
        if (isActive) {
          setDepositStatusError("Could not sync deposit status.");
        }
      }
    };

    loadRecords();
    const intervalId = window.setInterval(loadRecords, 45_000);
    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [onDepositRecords]);

  const visibleRows = useMemo(() => {
    const filteredRows = filterRowsByTab(rows, activeTab);
    const priorityList = normalizeMarketPrioritySymbols(marketPrioritySymbols);
    if (!priorityList.length) {
      if (activeTab === "all") {
        return filteredRows;
      }
      return filteredRows.slice(0, 40);
    }

    const priorityIndex = new Map(priorityList.map((symbol, index) => [symbol, index]));
    const priorityRows = [];
    const otherRows = [];

    for (const row of filteredRows) {
      const baseSymbol = normalizeMarketPrioritySymbol(row?.base || "");
      if (priorityIndex.has(baseSymbol)) {
        priorityRows.push(row);
        continue;
      }
      otherRows.push(row);
    }

    priorityRows.sort((a, b) => {
      const aIndex = priorityIndex.get(normalizeMarketPrioritySymbol(a?.base || "")) ?? Number.MAX_SAFE_INTEGER;
      const bIndex = priorityIndex.get(normalizeMarketPrioritySymbol(b?.base || "")) ?? Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex;
    });

    const mergedRows = [...priorityRows, ...otherRows];
    if (activeTab === "all") {
      return mergedRows;
    }
    return mergedRows.slice(0, 40);
  }, [rows, activeTab, marketPrioritySymbols]);
  const latestDepositRecords = useMemo(() => recentDepositRecords.slice(0, 4), [recentDepositRecords]);

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
  const isKycNotSubmitted = kycStatus === "pending" && !String(user?.kycUpdatedAt || "").trim();
  const kycMeta = getKycStatusMeta(kycStatus, { notSubmitted: isKycNotSubmitted });
  const isUserKycAuthenticated = kycStatus === "authenticated";
  const isKycSubmissionLocked = isUserKycAuthenticated;
  const authTagLabel = isKycNotSubmitted
    ? "Please submit KYC"
    : String(kycAuthTag || deriveAuthTagFromStatus(kycStatus))
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  const launchpadFeatured = launchpadSnapshot?.featured || null;
  const launchpadLiveCount = Number(launchpadSnapshot?.counts?.live || 0);
  const launchpadWatchlistCount = Number(launchpadSnapshot?.user?.watchlistCount || 0);
  const showBiometricControls = typeof onEnableBiometricLogin === "function" && typeof onDisableBiometricLogin === "function";
  const biometricStatusLabel = biometricState.supported
    ? biometricState.enabled
      ? "Enabled"
      : "Disabled"
    : "Not supported";

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
    if (nextTab === "binary" && onOpenBinaryPage) {
      if (!isUserKycAuthenticated) {
        setProfileNotice("KYC authentication pending. Complete authentication before using Binary Options.");
        return;
      }
      onOpenBinaryPage();
      return;
    }
    if (nextTab === "transaction" && onOpenTransactionPage) {
      if (!isUserKycAuthenticated) {
        setProfileNotice("KYC authentication pending. Complete authentication before using Transaction.");
        return;
      }
      onOpenTransactionPage();
      return;
    }
    if (nextTab === "assets" && onOpenAssetsPage) {
      if (!isUserKycAuthenticated) {
        setProfileNotice("KYC authentication pending. Complete authentication before using Assets.");
        return;
      }
      onOpenAssetsPage();
      return;
    }

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
    event.target.value = "";
    if (!file) {
      return;
    }

    if (!isAllowedKycFile(file)) {
      setKycError("Supported files: jpg, jpeg, png, webp, pdf, doc, docx");
      return;
    }

    try {
      const preparedFile = await prepareKycFileData(file);
      setKycError("");
      setKycForm((prev) =>
        part === "front"
          ? {
            ...prev,
            frontFileName: preparedFile.fileName,
            frontFileData: preparedFile.fileData,
            frontFileMimeType: preparedFile.mimeType,
            frontFileSizeBytes: preparedFile.sizeBytes,
          }
          : {
            ...prev,
            backFileName: preparedFile.fileName,
            backFileData: preparedFile.fileData,
            backFileMimeType: preparedFile.mimeType,
            backFileSizeBytes: preparedFile.sizeBytes,
          },
      );
    } catch (fileError) {
      setKycError(fileError.message || "Could not read selected file.");
    }
  };

  const removeKycFile = (part) => {
    setKycError("");
    setKycForm((prev) =>
      part === "front"
        ? {
          ...prev,
          frontFileName: "",
          frontFileData: "",
          frontFileMimeType: "",
          frontFileSizeBytes: 0,
        }
        : {
          ...prev,
          backFileName: "",
          backFileData: "",
          backFileMimeType: "",
          backFileSizeBytes: 0,
        },
    );
  };

  const submitKyc = async (event) => {
    event.preventDefault();
    setKycError("");
    setKycNotice("");

    if (isKycSubmissionLocked) {
      setKycError("KYC is already approved. New submission is not allowed.");
      return;
    }

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
    if (onOpenDepositPage) {
      onOpenDepositPage();
      return;
    }
    resetDepositFlow();
    setActiveView("deposit.asset-select");
  };

  const openLumPage = () => {
    if (!isUserKycAuthenticated) {
      setProfileNotice("KYC authentication pending. Complete authentication before using LUM.");
      return;
    }
    if (onOpenLumPage) {
      onOpenLumPage();
      return;
    }
  };

  const openGoldMiningPage = () => {
    if (!isUserKycAuthenticated) {
      setProfileNotice("KYC authentication pending. Complete authentication before using Gold Mining.");
      return;
    }
    if (onOpenGoldMiningPage) {
      onOpenGoldMiningPage();
      return;
    }
  };

  const openBinaryPage = () => {
    if (!isUserKycAuthenticated) {
      setProfileNotice("KYC authentication pending. Complete authentication before using Binary Options.");
      return;
    }
    if (onOpenBinaryPage) {
      onOpenBinaryPage();
      return;
    }
    setActiveMainTab("binary");
    setActiveView("binary");
  };

  const openTransactionPage = () => {
    if (!isUserKycAuthenticated) {
      setProfileNotice("KYC authentication pending. Complete authentication before using Transaction.");
      return;
    }
    if (onOpenTransactionPage) {
      onOpenTransactionPage();
      return;
    }
    setActiveMainTab("transaction");
    setActiveView("transaction");
  };

  const openLaunchpadPage = () => {
    if (!isUserKycAuthenticated) {
      setProfileNotice("KYC authentication pending. Complete authentication before joining launchpad.");
      return;
    }
    if (onOpenLaunchpadPage) {
      onOpenLaunchpadPage();
    }
  };

  const openRecoverySupport = () => {
    setDrawerOpen(false);
    setActiveMainTab("home");
    setActiveView("home");
    setChatOpen(true);
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
        const snapshotData = await onDashboardSnapshot();
        applyDashboardSnapshot(snapshotData);
      }
      setKycSuccessPopup("Deposit request submitted. Admin verification pending.");
      setActiveView("home");
    } catch (submitError) {
      setDepositError(submitError.message || "Could not submit deposit request.");
    } finally {
      setDepositSubmitting(false);
    }
  };

  const openNoticePanel = () => {
    setNoticeDismissError("");
    setNoticePanelOpen(true);
  };

  const dismissNotice = async (noticeId) => {
    if (!noticeId) {
      return;
    }
    if (!onDismissNotice) {
      setNoticeDismissError("Notice dismiss feature is not available right now.");
      return;
    }

    setNoticeDismissError("");
    setNoticeDismissingId(noticeId);
    try {
      const payload = await onDismissNotice({ noticeId });
      applyDashboardSnapshot(payload || {});
    } catch (dismissError) {
      setNoticeDismissError(dismissError.message || "Could not dismiss this notice.");
    } finally {
      setNoticeDismissingId(0);
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
            {/* <p>{user.email}</p> */}
            <span>ID: {user.userId || "------"}</span>
            <div className="prodash-drawer-kyc-row">
              <span className={`prodash-kyc-chip ${kycMeta.className}`}>KYC: {kycMeta.label}</span>
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
            <p>RampXTrading</p>
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
              <button type="button" className="prodash-notice" onClick={openNoticePanel}>
                <span className="prodash-notice-pill">NOTICE</span>
                <p>{dashboardNotice}</p>
                <i className="fas fa-chevron-right" />
              </button>

              {profileNotice ? <p className="prodash-page-notice">{profileNotice}</p> : null}
              {dashboardNoticeUpdatedAt ? (
                <p className="prodash-page-notice">
                  Notice updated:{" "}
                  {(() => {
                    const noticeDate = new Date(dashboardNoticeUpdatedAt);

                    if (Number.isNaN(noticeDate.getTime())) {
                      return "";
                    }

                    const today = new Date();

                    const noticeDay = new Date(
                      noticeDate.getFullYear(),
                      noticeDate.getMonth(),
                      noticeDate.getDate(),
                    );

                    const todayDay = new Date(
                      today.getFullYear(),
                      today.getMonth(),
                      today.getDate(),
                    );

                    const diffDays = Math.round((todayDay - noticeDay) / (1000 * 60 * 60 * 24));

                    if (diffDays === 0) return "Today";
                    if (diffDays === 1) return "Yesterday";
                    if (diffDays >= 2 && diffDays <= 6) return "This week";
                    if (diffDays >= 7 && diffDays <= 30) return "This month";
                    if (diffDays >= 31 && diffDays <= 365) return "This year";

                    return noticeDate.toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    });
                  })()}
                </p>
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
                        <span className="prodash-auth-tag">{authTagLabel}</span>
                      </div>
                      {/* {walletBalances.length ? (
                        <div className="prodash-wallet-balance-strip">
                          {walletBalances.slice(0, 4).map((balance) => (
                            <span key={balance.symbol}>
                              {formatWalletSymbolDisplay(balance.symbol)}: ${formatCurrency(balance.totalUsd)}
                            </span>
                          ))}
                        </div>
                      ) : null} */}
                      {!isUserKycAuthenticated ? <p className="prodash-lock-note">Complete KYC to unlock premium actions.</p> : null}
                    </div>

                    <div className="prodash-wallet-actions">
                      <button type="button" className="prodash-deposit-btn" onClick={openDepositAssetSelector}>
                        Deposit
                      </button>
                    </div>
                  </section>

                  <section className="prodash-quick-actions">
                    {QUICK_ACTIONS.map((action) => (
                      <button
                        type="button"
                        key={action.id}
                        className="prodash-quick-item"
                        disabled={action.id !== "recharge" && action.id !== "loan" && action.id !== "recovery" && !isUserKycAuthenticated}
                        title={action.id !== "recharge" && action.id !== "loan" && action.id !== "recovery" && !isUserKycAuthenticated ? "Complete KYC authentication first" : action.label}
                        onClick={
                          action.id === "lum"
                            ? openLumPage
                            : action.id === "binary"
                              ? openBinaryPage
                              : action.id === "transaction"
                                ? openTransactionPage
                                : action.id === "recharge"
                                  ? openDepositAssetSelector
                                  : action.id === "loan"
                                    ? onOpenLoanPage
                                    : action.id === "recovery"
                                      ? openRecoverySupport
                                      : undefined
                        }
                      >
                        <span>
                          <i className={`fas ${action.icon}`} />
                        </span>
                        <strong>{action.label}</strong>
                      </button>
                    ))}
                  </section>

                  <section className="prodash-panel-card prodash-deposit-status-card">
                    <header className="prodash-panel-header">
                      <h2>Deposit Request Status</h2>
                    </header>

                    {depositStatusError ? <p className="prodash-form-error">{depositStatusError}</p> : null}
                    {!depositStatusError && !latestDepositRecords.length ? (
                      <p className="prodash-kyc-hint">No deposit requests yet.</p>
                    ) : null}

                    {!depositStatusError && latestDepositRecords.length ? (
                      <div className="prodash-deposit-status-list">
                        {latestDepositRecords.map((record) => (
                          <article key={record.requestId} className="prodash-deposit-status-item">
                            <div>
                              <strong>{record.assetSymbol}</strong>
                              <small>{new Date(record.submittedAt).toLocaleString()}</small>
                            </div>
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
                    ) : null}
                  </section>

                  <section className="prodash-promos">
                    <article
                      className="prodash-promo-card prodash-promo-primary"
                      role="button"
                      tabIndex={0}
                      onClick={openLaunchpadPage}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openLaunchpadPage();
                        }
                      }}
                    >
                      <div>
                        <h3>Initial coin offer (ICO)</h3>
                        <p>
                          {launchpadFeatured
                            ? `${launchpadFeatured.coinSymbol} • Hype ${launchpadFeatured.hypePercent}% • ROI ${launchpadFeatured.expectedRoiX.toFixed(2)}x`
                            : "More wealth awaits you"}
                        </p>
                        <small>
                          {launchpadFeatured
                            ? `${launchpadFeatured.phase?.toUpperCase() || "UPCOMING"} • Watchlisted ${launchpadFeatured.watchlistCount} • Live ${launchpadLiveCount}`
                            : `Tap to view ICO list • Watchlist ${launchpadWatchlistCount}`}
                        </small>
                      </div>
                      <div className="prodash-promo-icon">
                        <i className="fas fa-coins" />
                      </div>
                    </article>

                    <div className="prodash-promo-dual">
                      <button
                        type="button"
                        className="prodash-promo-card prodash-promo-mini"
                        disabled={!isUserKycAuthenticated}
                        onClick={openLumPage}
                      >
                        <div>
                          <h4>LUM</h4>
                          <p>Liquidity utility module</p>
                        </div>
                        <span className="prodash-mini-badge">
                          <i className="fas fa-gavel" />
                        </span>
                      </button>

                      <button
                        type="button"
                        className="prodash-promo-card prodash-promo-mini"
                        disabled={!isUserKycAuthenticated}
                        onClick={openGoldMiningPage}
                      >
                        <div>
                          <h4>Gold Mining</h4>
                          <p>Optimized reward pools</p>
                        </div>
                        <span className="prodash-mini-badge prodash-sale-badge">SALE</span>
                      </button>
                    </div>

                    <article className="prodash-promo-card prodash-promo-paper" onClick={() => setWhitepaperOpen(true)} role="button" tabIndex={0} onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setWhitepaperOpen(true);
                      }
                    }}>
                      <div>
                        <h3>Rampx Trading Whitepaper</h3>
                        <button type="button" onClick={() => setWhitepaperOpen(true)}>Read</button>
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
                <div>
                  <h2>KYC Authentication</h2>
                  <p>Submit clear identity documents for secure account verification.</p>
                </div>
                <span className={`prodash-kyc-chip ${kycMeta.className}`}>{kycMeta.label}</span>
              </header>

              {showBiometricControls ? (
                <section className="prodash-biometric-card">
                  <div className="prodash-biometric-head">
                    <h3>App Fingerprint Login</h3>
                    <span className={`prodash-biometric-status ${biometricState.supported ? (biometricState.enabled ? "is-enabled" : "is-disabled") : "is-unsupported"}`}>
                      {biometricStatusLabel}
                    </span>
                  </div>
                  <p>Fingerprint unlock uses your device biometric security.</p>
                  {!biometricState.supported ? (
                    <p className="prodash-form-notice">Fingerprint not available on this device.</p>
                  ) : null}
                  {biometricState.message ? <p className="prodash-form-notice">{biometricState.message}</p> : null}
                  <button
                    type="button"
                    className="prodash-submit-btn prodash-biometric-toggle"
                    onClick={biometricState.enabled ? onDisableBiometricLogin : onEnableBiometricLogin}
                    disabled={Boolean(biometricState.processing) || Boolean(biometricState.checking) || !biometricState.supported}
                  >
                    {biometricState.processing
                      ? "Please wait..."
                      : biometricState.enabled
                        ? "Disable Fingerprint"
                        : "Enable Fingerprint"}
                  </button>
                </section>
              ) : null}

              <form className="prodash-form prodash-kyc-form" onSubmit={submitKyc}>
                <div className="prodash-kyc-form-grid">
                  <label>
                  Full Name
                    <input
                      type="text"
                      value={kycForm.fullName}
                      onChange={(event) => handleKycFieldChange("fullName", event.target.value)}
                      placeholder="Same as NID/Passport/Driving License"
                      disabled={isKycSubmissionLocked || kycSubmitting}
                    />
                  </label>

                  <label>
                    Certification
                    <select
                      value={kycForm.certification}
                      onChange={(event) => handleKycFieldChange("certification", event.target.value)}
                      disabled={isKycSubmissionLocked || kycSubmitting}
                    >
                      {KYC_CERTIFICATION_OPTIONS.map((option) => (
                        <option key={option.value || "empty"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="prodash-kyc-form-span-2">
                    SSN
                    <input
                      type="text"
                      value={kycForm.ssn}
                      onChange={(event) => handleKycFieldChange("ssn", event.target.value)}
                      placeholder="Serial number"
                      disabled={isKycSubmissionLocked || kycSubmitting}
                    />
                  </label>
                </div>

                <div className="prodash-kyc-upload-grid">
                  <KycDocumentUploadCard
                    label="Front Part Photo"
                    icon="fa-id-card"
                    fileName={kycForm.frontFileName}
                    fileData={kycForm.frontFileData}
                    fileSizeBytes={kycForm.frontFileSizeBytes}
                    mimeType={kycForm.frontFileMimeType}
                    disabled={isKycSubmissionLocked || kycSubmitting}
                    onChange={(event) => handleKycFileSelect("front", event)}
                    onRemove={() => removeKycFile("front")}
                  />
                  <KycDocumentUploadCard
                    label="Back Part Photo"
                    icon="fa-address-card"
                    fileName={kycForm.backFileName}
                    fileData={kycForm.backFileData}
                    fileSizeBytes={kycForm.backFileSizeBytes}
                    mimeType={kycForm.backFileMimeType}
                    disabled={isKycSubmissionLocked || kycSubmitting}
                    onChange={(event) => handleKycFileSelect("back", event)}
                    onRemove={() => removeKycFile("back")}
                  />
                </div>

                <p className="prodash-kyc-hint prodash-kyc-upload-note">
                  Upload a clear, uncropped document image. Large images are optimized before submit. Supported files: JPG, JPEG, PNG, WEBP, PDF, DOC, DOCX.
                </p>

                {kycError ? <p className="prodash-form-error">{kycError}</p> : null}
                {isKycSubmissionLocked ? <p className="prodash-form-notice">KYC is already approved. New submission is disabled.</p> : null}
                {kycNotice ? <p className="prodash-form-notice">{kycNotice}</p> : null}

                <button type="submit" className="prodash-submit-btn" disabled={isKycSubmissionLocked || kycSubmitting}>
                  {isKycSubmissionLocked ? "Already Approved" : kycSubmitting ? "Submitting..." : "Submit"}
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
                    <span className="prodash-deposit-asset-avatar">
                      {asset.iconImageData ? <img src={asset.iconImageData} alt={`${asset.symbol} logo`} /> : asset.symbol.slice(0, 1)}
                    </span>
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
                  {selectedDepositAsset.qrCodeData || selectedDepositAsset.rechargeAddress ? (
                    <img
                      src={resolveQrCodeSource(
                        selectedDepositAsset.qrCodeData,
                        selectedDepositAsset.rechargeAddress,
                        selectedDepositAsset.symbol,
                      )}
                      alt={`${selectedDepositAsset.symbol} QR`}
                      onError={(event) => {
                        const fallback = buildQrCodeFallback(
                          selectedDepositAsset.rechargeAddress,
                          selectedDepositAsset.symbol,
                        );
                        if (fallback && event.currentTarget.src !== fallback) {
                          event.currentTarget.src = fallback;
                        }
                      }}
                    />
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

      {noticePanelOpen ? (
        <div className="prodash-popup-overlay" onClick={() => setNoticePanelOpen(false)}>
          <section className="prodash-notice-modal" role="dialog" aria-modal="true" aria-label="Notice Center" onClick={(event) => event.stopPropagation()}>
            <header className="prodash-notice-modal-head">
              <h3>Notice Center</h3>
              <button type="button" onClick={() => setNoticePanelOpen(false)} aria-label="Close notice panel">
                <i className="fas fa-xmark" />
              </button>
            </header>

            {noticeDismissError ? <p className="prodash-form-error">{noticeDismissError}</p> : null}

            <div className="prodash-notice-list">
              {dashboardNotices.length ? (
                dashboardNotices.map((item) => (
                  <article key={item.noticeId || `${item.message}-${item.updatedAt}`} className={`prodash-notice-item is-${item.severity}`}>
                    <div className="prodash-notice-item-head">
                      <strong>{item.title || "System Notice"}</strong>
                      <span>{item.severity.toUpperCase()}</span>
                    </div>
                    <p>{item.message}</p>
                    <footer>
                      <small>
                        {item.updatedAt
                          ? (() => {
                            const itemDate = new Date(item.updatedAt);
                            const today = new Date();

                            const itemDay = new Date(
                              itemDate.getFullYear(),
                              itemDate.getMonth(),
                              itemDate.getDate(),
                            );

                            const todayDay = new Date(
                              today.getFullYear(),
                              today.getMonth(),
                              today.getDate(),
                            );

                            const diffDays = Math.round((todayDay - itemDay) / (1000 * 60 * 60 * 24));

                            if (diffDays === 0) return "Today";
                            if (diffDays === 1) return "Yesterday";

                            return itemDate.toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            });
                          })()
                          : "Now"}
                      </small>
                      {item.isDismissible && item.noticeId ? (
                        <button
                          type="button"
                          className="prodash-inline-link-btn"
                          onClick={() => dismissNotice(item.noticeId)}
                          disabled={noticeDismissingId === item.noticeId}
                        >
                          {noticeDismissingId === item.noticeId ? "Dismissing..." : "Dismiss"}
                        </button>
                      ) : null}
                    </footer>
                  </article>
                ))
              ) : (
                <article className="prodash-notice-item">
                  <div className="prodash-notice-item-head">
                    <strong>No active notices</strong>
                  </div>
                  <p>There are no additional notices for your account right now.</p>
                </article>
              )}
            </div>
          </section>
        </div>
      ) : null}

      <SupportChatModal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onLoadTickets={onLoadSupportTickets}
        onLoadTicketDetail={onLoadSupportTicketDetail}
        onCreateTicket={onCreateSupportTicket}
        onSendTicketMessage={onSendSupportTicketMessage}
        onUpdateTicketStatus={onUpdateSupportTicketStatus}
        onLoadLiveThread={onLoadLiveThread}
        onSendLiveMessage={onSendLiveMessage}
      />

      {whitepaperOpen ? (
        <div className="prodash-whitepaper-overlay" onClick={() => setWhitepaperOpen(false)}>
          <section className="prodash-whitepaper-modal" role="dialog" aria-modal="true" aria-label="Crypto Byte Whitepaper" onClick={(event) => event.stopPropagation()}>
            <header className="prodash-whitepaper-head">
              <h3>Rampx Trading</h3>
              <button type="button" className="prodash-whitepaper-close" onClick={() => setWhitepaperOpen(false)} aria-label="Close whitepaper">
                <i className="fas fa-xmark" />
              </button>
            </header>

            <article className="prodash-whitepaper-section">
              <h4>About Rampx Trading</h4>
              <p>
                Rampx Trading is your all-in-one crypto platform for trading, portfolio tracking, staking, and ICO participation.
                It&apos;s built for fast execution, clean UX, and secure wallet management so you can move from discovery to action in seconds.
              </p>
              <small>Updated</small>
            </article>

            <article className="prodash-whitepaper-section">
              <h4>Key Features</h4>
              <ul>
                <li>Spot & market prices</li>
                <li>Binary options access</li>
                <li>Staking/LUM plans</li>
                <li>ICO listings & participation</li>
                <li>Customer support chat</li>
              </ul>
            </article>
          </section>
        </div>
      ) : null}

      {kycSuccessPopup ? (
        <div className="prodash-popup-overlay" onClick={() => setKycSuccessPopup("")}>
          <section className="prodash-success-popup" role="alertdialog" onClick={(event) => event.stopPropagation()}>
            <i className="fas fa-circle-check" />
            <h3>Submitted successfully</h3>
            <p>{kycSuccessPopup}</p>
            <button type="button" onClick={() => setKycSuccessPopup("")}>
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
//test
