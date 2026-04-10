import { useEffect, useMemo, useState } from "react";
import "./premium-dashboard.css";

const DEPOSIT_SCREENSHOT_ACCEPT = ".jpg,.jpeg,.png,.heic";
const DEPOSIT_SCREENSHOT_MAX_BYTES = 15 * 1024 * 1024;

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
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function shortenAddress(value = "") {
  const text = String(value || "").trim();
  if (text.length <= 24) {
    return text;
  }
  return `${text.slice(0, 14)}...${text.slice(-10)}`;
}

function formatStatusLabel(value = "") {
  const normalized = String(value || "pending").trim().toLowerCase();
  if (!normalized) {
    return "pending";
  }
  return normalized;
}

export default function DepositPage({
  user,
  onBack,
  onDashboardSnapshot,
  onCreateDepositRequest,
  onDepositRecords,
  onAfterDepositSuccess,
}) {
  const [step, setStep] = useState("asset-select");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [depositAssets, setDepositAssets] = useState([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState(null);

  const [amountUsd, setAmountUsd] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileData, setFileData] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  const [copied, setCopied] = useState(false);
  const [copyToast, setCopyToast] = useState(false);
  const [successPopup, setSuccessPopup] = useState("");

  useEffect(() => {
    if (!onDashboardSnapshot) {
      setLoadError("Deposit assets are not available right now.");
      setLoading(false);
      return;
    }

    let active = true;
    const loadSnapshot = async () => {
      try {
        const payload = await onDashboardSnapshot();
        if (!active) {
          return;
        }
        setDepositAssets(Array.isArray(payload?.deposit?.assets) ? payload.deposit.assets : []);
        setLoadError("");
      } catch (snapshotError) {
        if (active) {
          setLoadError(snapshotError.message || "Could not load deposit assets.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadSnapshot();
    return () => {
      active = false;
    };
  }, [onDashboardSnapshot]);

  const selectedAsset = useMemo(
    () => depositAssets.find((item) => item.assetId === selectedAssetId) || null,
    [depositAssets, selectedAssetId],
  );

  const filteredAssets = useMemo(() => {
    const keyword = assetSearch.trim().toLowerCase();
    if (!keyword) {
      return depositAssets;
    }
    return depositAssets.filter((asset) => {
      const candidate = `${asset.symbol} ${asset.name} ${asset.chainName}`.toLowerCase();
      return candidate.includes(keyword);
    });
  }, [assetSearch, depositAssets]);

  const resetDepositInputs = () => {
    setAmountUsd("");
    setFileName("");
    setFileData("");
    setNotice("");
    setError("");
    setCopied(false);
    setCopyToast(false);
  };

  const selectAsset = (assetId) => {
    setSelectedAssetId(assetId);
    resetDepositInputs();
    setStep("form");
  };

  const openRecords = async () => {
    if (!onDepositRecords) {
      setError("Deposit record API is not connected yet.");
      return;
    }

    setRecordsLoading(true);
    setError("");
    try {
      const payload = await onDepositRecords();
      setRecords(Array.isArray(payload?.records) ? payload.records : []);
      setStep("records");
    } catch (recordsError) {
      setError(recordsError.message || "Could not load deposit records.");
    } finally {
      setRecordsLoading(false);
    }
  };

  const copyAddress = async () => {
    if (!selectedAsset?.rechargeAddress) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedAsset.rechargeAddress);
      setCopied(true);
      setCopyToast(true);
      window.setTimeout(() => {
        setCopied(false);
        setCopyToast(false);
      }, 1500);
    } catch {
      setError("Could not copy address. Please copy manually.");
    }
  };

  const continueToConfirm = () => {
    setError("");
    setNotice("");

    const numericAmount = Number(amountUsd);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Please enter a valid amount.");
      return;
    }

    if (selectedAsset) {
      if (numericAmount < Number(selectedAsset.minAmountUsd || 0)) {
        setError(`Minimum amount is ${selectedAsset.minAmountUsd} USD.`);
        return;
      }
      if (numericAmount > Number(selectedAsset.maxAmountUsd || 0)) {
        setError(`Maximum amount is ${selectedAsset.maxAmountUsd} USD.`);
        return;
      }
    }

    setStep("confirm");
  };

  const handleScreenshotSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > DEPOSIT_SCREENSHOT_MAX_BYTES) {
      setError("Max screenshot size is 15MB.");
      return;
    }

    if (!["image/jpg", "image/jpeg", "image/png", "image/heic", "image/heif"].includes(file.type)) {
      setError("Supported formats: JPG, JPEG, PNG, HEIC");
      return;
    }

    try {
      const data = await readFileAsDataUrl(file);
      setFileName(file.name);
      setFileData(data);
      setError("");
    } catch (fileError) {
      setError(fileError.message || "Could not read screenshot.");
    }
  };

  const submitDepositRequest = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!selectedAsset) {
      setError("Please select a crypto first.");
      return;
    }
    if (!fileData) {
      setError("Transaction screenshot is required.");
      return;
    }
    if (!onCreateDepositRequest) {
      setError("Deposit submit API is not connected yet.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await onCreateDepositRequest({
        assetId: selectedAsset.assetId,
        amountUsd: Number(amountUsd),
        screenshotFileName: fileName || "transaction-screenshot",
        screenshotFileData: fileData,
      });

      setSuccessPopup(response?.message || "Deposit submitted successfully.");
      setNotice(response?.message || "Deposit submitted successfully.");

      window.setTimeout(() => {
        setSuccessPopup("");
        if (onAfterDepositSuccess) {
          onAfterDepositSuccess();
          return;
        }
        if (onBack) {
          onBack();
        }
      }, 1500);
    } catch (submitError) {
      setError(submitError.message || "Could not submit deposit request.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderAssetSelect = () => (
    <section className="prodash-panel-card prodash-deposit-select-card prodash-deposit-page-card">
      <header className="prodash-panel-header">
        <button type="button" className="prodash-back-btn" onClick={onBack}>
          <i className="fas fa-arrow-left" />
        </button>
        <h2>Select Deposit Crypto</h2>
      </header>

      <div className="prodash-deposit-search-row">
        <input
          type="text"
          value={assetSearch}
          onChange={(event) => setAssetSearch(event.target.value)}
          placeholder="Search by symbol, network, or name"
        />
      </div>

      <div className="prodash-deposit-asset-list">
        {filteredAssets.map((asset) => (
          <button key={asset.assetId} type="button" className="prodash-deposit-asset-item" onClick={() => selectAsset(asset.assetId)}>
            <span className="prodash-deposit-asset-avatar">{asset.symbol.slice(0, 1)}</span>
            <div>
              <strong>{asset.symbol}</strong>
              <p>{asset.name}</p>
            </div>
            <small>{asset.chainName}</small>
          </button>
        ))}
      </div>

      {!filteredAssets.length ? <p className="prodash-kyc-hint">No matching crypto found.</p> : null}
    </section>
  );

  const renderDepositForm = () => (
    <section className="prodash-panel-card prodash-deposit-form-card prodash-deposit-page-card">
      <header className="prodash-panel-header prodash-deposit-header-row">
        <button type="button" className="prodash-back-btn" onClick={() => setStep("asset-select")}>
          <i className="fas fa-arrow-left" />
        </button>

        <div className="prodash-deposit-header-title">
          <h2>{selectedAsset.symbol} Deposit</h2>
          <button type="button" className="prodash-inline-link" onClick={() => setStep("asset-select")}>
            Change Crypto
          </button>
        </div>

        <button type="button" className="prodash-inline-link prodash-inline-link-btn" onClick={openRecords}>
          Records
        </button>
      </header>

      <div className="prodash-deposit-address-card">
        <h3>Scan To Get Recharge Address</h3>

        <div className="prodash-deposit-qr-wrap">
          {selectedAsset.qrCodeData ? (
            <img src={selectedAsset.qrCodeData} alt={`${selectedAsset.symbol} QR`} />
          ) : (
            <div className="prodash-deposit-qr-fallback">No QR</div>
          )}
        </div>

        <p className="prodash-deposit-address-text">{shortenAddress(selectedAsset.rechargeAddress)}</p>
        <p className="prodash-deposit-warning-text">
          Only use this official wallet address and correct chain network for recharge.
        </p>

        <div className="prodash-copy-wrap">
          <button type="button" className={`prodash-copy-btn ${copied ? "is-copied" : ""}`} onClick={copyAddress}>
            {copied ? "Copied" : "Click to Copy"}
          </button>
          {copyToast ? <span className="prodash-copy-toast">Copied</span> : null}
        </div>
      </div>

      <div className="prodash-deposit-amount-card">
        <label>
          Deposit Amount (USD)
          <input
            type="number"
            min="0"
            step="0.01"
            value={amountUsd}
            onChange={(event) => setAmountUsd(event.target.value)}
            placeholder="Enter amount"
          />
        </label>

        <small>
          Min {selectedAsset.minAmountUsd} / Max {selectedAsset.maxAmountUsd}
        </small>

        {error ? <p className="prodash-form-error">{error}</p> : null}
        {notice ? <p className="prodash-form-notice">{notice}</p> : null}

        <button type="button" className="prodash-submit-btn" onClick={continueToConfirm}>
          Continue
        </button>
      </div>
    </section>
  );

  const renderConfirm = () => (
    <section className="prodash-panel-card prodash-deposit-confirm-card prodash-deposit-page-card">
      <header className="prodash-panel-header">
        <button type="button" className="prodash-back-btn" onClick={() => setStep("form")}>
          <i className="fas fa-arrow-left" />
        </button>
        <h2>Confirm Your Deposit</h2>
      </header>

      <p className="prodash-deposit-confirm-subtitle">Please upload your transaction screenshot below.</p>

      <form className="prodash-form" onSubmit={submitDepositRequest}>
        <label className="prodash-upload-zone">
          <span className="prodash-upload-icon">
            <i className="fas fa-cloud-arrow-up" />
          </span>
          <strong>Transaction Screenshot</strong>
          <input type="file" accept={DEPOSIT_SCREENSHOT_ACCEPT} onChange={handleScreenshotSelect} />
          <small>Supported formats: JPG, PNG, HEIC</small>
          <small>Max size: 15MB</small>
          <span className="prodash-file-name">{fileName || "No file chosen"}</span>
        </label>

        <div className="prodash-deposit-confirm-meta">
          <span>{selectedAsset.symbol}</span>
          <span>${formatCurrency(Number(amountUsd || 0))} USD</span>
        </div>

        {error ? <p className="prodash-form-error">{error}</p> : null}
        {notice ? <p className="prodash-form-notice">{notice}</p> : null}

        <button type="submit" className="prodash-submit-btn" disabled={submitting}>
          {submitting ? "Submitting..." : "Confirm Deposit"}
        </button>
      </form>
    </section>
  );

  const renderRecords = () => (
    <section className="prodash-panel-card prodash-deposit-records-card prodash-deposit-page-card">
      <header className="prodash-panel-header">
        <button type="button" className="prodash-back-btn" onClick={() => setStep(selectedAsset ? "form" : "asset-select")}>
          <i className="fas fa-arrow-left" />
        </button>
        <h2>Deposit Records</h2>
      </header>

      {recordsLoading ? <p className="prodash-kyc-hint">Loading records...</p> : null}
      {!recordsLoading && !records.length ? <p className="prodash-kyc-hint">No deposit records available yet.</p> : null}

      {!recordsLoading && records.length ? (
        <div className="prodash-market-table">
          <div className="prodash-market-head">
            <span>Asset</span>
            <span>Amount</span>
            <span>Status</span>
          </div>
          <div className="prodash-market-body">
            {records.map((record) => (
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
                  {formatStatusLabel(record.status)}
                </span>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );

  return (
    <main className="prodash-page prodash-deposit-page">
      <div className="prodash-background-orb prodash-background-orb-left" />
      <div className="prodash-background-orb prodash-background-orb-right" />

      <section className="prodash-shell prodash-deposit-shell">
        <header className="prodash-topbar">
          <button type="button" className="prodash-icon-btn" aria-label="Back to dashboard" onClick={onBack}>
            <i className="fas fa-arrow-left" />
          </button>

          <div className="prodash-brand-block">
            <p>CryptoByte Prime</p>
            <strong>
              {step === "asset-select"
                ? "Select Deposit Crypto"
                : step === "form"
                  ? "Deposit Address"
                  : step === "confirm"
                    ? "Confirm Deposit"
                    : "Deposit Records"}
            </strong>
          </div>

          <div className="prodash-deposit-top-user">
            <strong>{user?.name || "Trader"}</strong>
            <small>{user?.email || ""}</small>
          </div>
        </header>

        <div className="prodash-content-area">
          {loading ? <p className="prodash-page-notice">Loading deposit assets...</p> : null}
          {loadError ? <p className="prodash-form-error">{loadError}</p> : null}

          {!loading && !loadError && step === "asset-select" ? renderAssetSelect() : null}
          {!loading && !loadError && step === "form" && selectedAsset ? renderDepositForm() : null}
          {!loading && !loadError && step === "confirm" && selectedAsset ? renderConfirm() : null}
          {!loading && !loadError && step === "records" ? renderRecords() : null}
        </div>
      </section>

      {successPopup ? (
        <div className="prodash-popup-overlay" onClick={() => setSuccessPopup("")}>
          <section className="prodash-success-popup" role="alertdialog" onClick={(event) => event.stopPropagation()}>
            <i className="fas fa-circle-check" />
            <h3>Submitted successfully</h3>
            <p>{successPopup}</p>
          </section>
        </div>
      ) : null}
    </main>
  );
}
