import { useEffect, useMemo, useState } from "react";
import { ADMIN_SECTION_META } from "../constants";
import AdminSectionIntro from "./AdminSectionIntro";

const DEFAULT_SETTINGS = {
  latestVersionName: "1.0.0",
  latestBuildCode: 1,
  minimumBuildCode: 1,
  forceUpdateEnabled: false,
  apkUrl: "https://download.rampxtrading.org/rampxtrading-latest.apk",
  title: "RampX Trading update available",
  message: "A newer version of RampX Trading is available. Download the latest APK to continue with the best experience.",
  logoUrl: "/favicon-32x32.png",
  updatedAt: "",
  updatedBy: "system",
};

function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    latestBuildCode: Number(settings?.latestBuildCode ?? DEFAULT_SETTINGS.latestBuildCode),
    minimumBuildCode: Number(settings?.minimumBuildCode ?? DEFAULT_SETTINGS.minimumBuildCode),
    forceUpdateEnabled: Boolean(settings?.forceUpdateEnabled),
  };
}

function buildForm(settings = {}) {
  const normalized = normalizeSettings(settings);
  return {
    latestVersionName: String(normalized.latestVersionName || DEFAULT_SETTINGS.latestVersionName),
    latestBuildCode: String(normalized.latestBuildCode || DEFAULT_SETTINGS.latestBuildCode),
    minimumBuildCode: String(normalized.minimumBuildCode || DEFAULT_SETTINGS.minimumBuildCode),
    forceUpdateEnabled: Boolean(normalized.forceUpdateEnabled),
    apkUrl: String(normalized.apkUrl || DEFAULT_SETTINGS.apkUrl),
    title: String(normalized.title || DEFAULT_SETTINGS.title),
    message: String(normalized.message || DEFAULT_SETTINGS.message),
    logoUrl: String(normalized.logoUrl || DEFAULT_SETTINGS.logoUrl),
  };
}

export default function AppUpdateManagementPage({
  settings,
  loading,
  onRefresh,
  onSaveSettings,
}) {
  const normalizedSettings = useMemo(() => normalizeSettings(settings), [settings]);
  const [form, setForm] = useState(() => buildForm(normalizedSettings));
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(buildForm(normalizedSettings));
  }, [normalizedSettings]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setNotice("");
    setError("");

    const latestBuildCode = Number(form.latestBuildCode);
    const minimumBuildCode = Number(form.minimumBuildCode);
    if (!Number.isFinite(latestBuildCode) || latestBuildCode < 1) {
      setError("Latest build code must be at least 1.");
      return;
    }
    if (!Number.isFinite(minimumBuildCode) || minimumBuildCode < 1) {
      setError("Minimum build code must be at least 1.");
      return;
    }
    if (minimumBuildCode > latestBuildCode) {
      setError("Minimum build code cannot be higher than latest build code.");
      return;
    }

    setSaving(true);
    try {
      const response = await onSaveSettings?.({
        latestVersionName: form.latestVersionName,
        latestBuildCode,
        minimumBuildCode,
        forceUpdateEnabled: form.forceUpdateEnabled,
        apkUrl: form.apkUrl,
        title: form.title,
        message: form.message,
        logoUrl: form.logoUrl,
      });
      setNotice(response?.message || "App update settings saved.");
    } catch (saveError) {
      setError(saveError.message || "Could not save app update settings.");
    } finally {
      setSaving(false);
    }
  };

  const previewLogo = form.logoUrl || DEFAULT_SETTINGS.logoUrl;

  return (
    <section className="adminx-app-update-page">
      <AdminSectionIntro
        icon={ADMIN_SECTION_META.appUpdate.icon}
        title={ADMIN_SECTION_META.appUpdate.title}
        description={ADMIN_SECTION_META.appUpdate.description}
        stats={[
          { label: "Latest", value: `${normalizedSettings.latestVersionName} (${normalizedSettings.latestBuildCode})` },
          { label: "Minimum", value: String(normalizedSettings.minimumBuildCode) },
          { label: "Mode", value: normalizedSettings.forceUpdateEnabled ? "Forced" : "Optional" },
        ]}
      />

      {notice ? <p className="adminx-auth-notice adminx-inline-feedback">{notice}</p> : null}
      {error ? <p className="adminx-auth-error adminx-inline-feedback">{error}</p> : null}

      <div className="adminx-app-update-layout">
        <form className="adminx-panel adminx-app-update-form" onSubmit={handleSubmit}>
          <div className="adminx-panel-head">
            <h2>Mobile Release Control</h2>
            <button type="button" className="adminx-filter-btn" onClick={onRefresh} disabled={loading || saving}>
              <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-rotate"}`} /> Refresh
            </button>
          </div>

          <div className="adminx-tx-form-grid">
            <label>
              Latest Version Name
              <input value={form.latestVersionName} onChange={(event) => updateField("latestVersionName", event.target.value)} />
            </label>
            <label>
              Latest Build Code
              <input type="number" min="1" step="1" value={form.latestBuildCode} onChange={(event) => updateField("latestBuildCode", event.target.value)} />
            </label>
            <label>
              Minimum Build Code
              <input type="number" min="1" step="1" value={form.minimumBuildCode} onChange={(event) => updateField("minimumBuildCode", event.target.value)} />
            </label>
            <label className="adminx-checkbox-row">
              <input
                type="checkbox"
                checked={form.forceUpdateEnabled}
                onChange={(event) => updateField("forceUpdateEnabled", event.target.checked)}
              />
              Force update below minimum build
            </label>
            <label className="span-2">
              APK Download URL
              <input value={form.apkUrl} onChange={(event) => updateField("apkUrl", event.target.value)} />
            </label>
            <label className="span-2">
              Logo URL
              <input value={form.logoUrl} onChange={(event) => updateField("logoUrl", event.target.value)} />
            </label>
            <label className="span-2">
              Popup Title
              <input value={form.title} onChange={(event) => updateField("title", event.target.value)} />
            </label>
            <label className="span-2">
              Popup Message
              <textarea rows={4} value={form.message} onChange={(event) => updateField("message", event.target.value)} />
            </label>
          </div>

          <div className="adminx-user-toolbar-actions">
            <button type="submit" className="btn btn-primary" disabled={saving || loading}>
              {saving ? "Saving..." : "Save App Update Settings"}
            </button>
          </div>
        </form>

        <aside className="adminx-panel adminx-app-update-preview">
          <div className="adminx-panel-head">
            <h2>Popup Preview</h2>
            <span>{normalizedSettings.updatedAt ? new Date(normalizedSettings.updatedAt).toLocaleString() : "Default settings"}</span>
          </div>
          <div className="adminx-app-update-card">
            <div className="adminx-app-update-card-logo">
              <img src={previewLogo} alt="App logo" />
              <span>RampX Trading</span>
            </div>
            <span className={`adminx-app-update-card-badge ${form.forceUpdateEnabled ? "is-forced" : ""}`}>
              {form.forceUpdateEnabled ? "Update Required" : "Update Available"}
            </span>
            <h3>{form.title || DEFAULT_SETTINGS.title}</h3>
            <p className="adminx-app-update-card-version">
              v{form.latestVersionName} · Build {form.latestBuildCode}
            </p>
            <p>{form.message || DEFAULT_SETTINGS.message}</p>
            <div className="adminx-app-update-card-actions">
              {!form.forceUpdateEnabled ? (
                <button type="button" className="adminx-app-update-card-later">Later</button>
              ) : null}
              <span className="adminx-app-update-card-download">
                <i className="fas fa-download" /> Download Update
              </span>
            </div>
          </div>
          <div className="adminx-simple-list">
            <p><span>Updated By</span><strong>{normalizedSettings.updatedBy || "system"}</strong></p>
            <p><span>APK URL</span><strong>{form.apkUrl || DEFAULT_SETTINGS.apkUrl}</strong></p>
            <p><span>Forced Rule</span><strong>{form.forceUpdateEnabled ? `Build below ${form.minimumBuildCode}` : "Off"}</strong></p>
          </div>
        </aside>
      </div>
    </section>
  );
}
