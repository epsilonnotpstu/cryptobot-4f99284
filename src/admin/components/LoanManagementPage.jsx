import { useEffect, useMemo, useState } from "react";
import AdminSectionIntro from "./AdminSectionIntro";
import { ADMIN_SECTION_META } from "../constants";

const DEFAULT_CONFIG = {
  heroTitle: "RampX Lending Center",
  introTitle: "Lending Center",
  introParagraph:
    "Provide safe and reliable digital asset borrowing guidance for eligible users who need liquidity without selling existing cryptocurrency assets.",
  stepsTitle: "Just a few steps to get started",
  steps: [],
  notesTitle: "Things to note",
  notes: [],
  consultationButtonText: "Loan consultation",
  bannerGradient: "linear-gradient(135deg, #5b5ff8 0%, #2563eb 48%, #06b6d4 100%)",
  bannerImageUrl: "",
};

const LOCKED_SECTIONS = [
  "Loan Applications",
  "Loan Products",
  "Loan Eligibility",
  "Collateral Rules",
  "Loan Limits",
  "Repayment Schedule",
  "Interest/Service Fee Settings",
  "Risk & Liquidation Controls",
  "Loan Wallet Ledger",
  "Loan Reports",
  "Admin Audit Logs",
];

function normalizeConfig(config = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    steps: Array.isArray(config.steps) ? config.steps : [],
    notes: Array.isArray(config.notes) ? config.notes : [],
  };
}

function buildStep() {
  return { title: "", body: "" };
}

export default function LoanManagementPage({
  loanCenter,
  loading,
  onRefresh,
  onSavePage,
  onSaveSettings,
}) {
  const config = useMemo(() => normalizeConfig(loanCenter?.page?.config), [loanCenter?.page?.config]);
  const settings = loanCenter?.settings || loanCenter?.page?.feature || {};
  const [form, setForm] = useState(config);
  const [isActive, setIsActive] = useState(loanCenter?.page?.isActive !== false);
  const [adminUnlocked, setAdminUnlocked] = useState(Boolean(settings.fullFeatureEnabledAdmin));
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");

  useEffect(() => {
    setForm(config);
    setIsActive(loanCenter?.page?.isActive !== false);
    setAdminUnlocked(Boolean(settings.fullFeatureEnabledAdmin));
  }, [config, loanCenter?.page?.isActive, settings.fullFeatureEnabledAdmin]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateStep = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.map((step, rowIndex) => (rowIndex === index ? { ...step, [key]: value } : step)),
    }));
  };

  const updateNote = (index, value) => {
    setForm((prev) => ({
      ...prev,
      notes: prev.notes.map((note, rowIndex) => (rowIndex === index ? value : note)),
    }));
  };

  const savePage = async (event) => {
    event.preventDefault();
    if (!onSavePage) {
      return;
    }
    setSaving("page");
    setFeedback("");
    setError("");
    try {
      const payload = await onSavePage({
        config: form,
        isActive,
      });
      setFeedback(payload?.message || "Loan page saved.");
    } catch (saveError) {
      setError(saveError.message || "Could not save loan page.");
    } finally {
      setSaving("");
    }
  };

  const saveSettings = async () => {
    if (!onSaveSettings) {
      return;
    }
    setSaving("settings");
    setFeedback("");
    setError("");
    try {
      const payload = await onSaveSettings({
        fullFeatureEnabledAdmin: adminUnlocked,
        note: "Updated from Loan Management.",
      });
      setFeedback(payload?.message || "Loan settings saved.");
    } catch (saveError) {
      setError(saveError.message || "Could not save loan settings.");
    } finally {
      setSaving("");
    }
  };

  const envLocked = settings.fullFeatureEnabledEnv === false;
  const effectiveUnlocked = Boolean(settings.effectiveFullFeatureEnabled);

  return (
    <section className="adminx-loan-page">
      <AdminSectionIntro
        icon={ADMIN_SECTION_META.loanCenter.icon}
        title={ADMIN_SECTION_META.loanCenter.title}
        description={ADMIN_SECTION_META.loanCenter.description}
        stats={[
          { label: "Page", value: isActive ? "Active" : "Inactive" },
          { label: "System", value: effectiveUnlocked ? "Unlocked" : "Locked" },
          { label: "Env", value: settings.fullFeatureEnabledEnv ? "Enabled" : "Off" },
        ]}
      />

      {feedback ? <p className="adminx-auth-notice adminx-inline-feedback">{feedback}</p> : null}
      {error ? <p className="adminx-auth-error adminx-inline-feedback">{error}</p> : null}

      <div className="adminx-loan-layout">
        <form className="adminx-panel adminx-loan-editor" onSubmit={savePage}>
          <div className="adminx-panel-head">
            <h2>Loan Page Info Control</h2>
            <button type="button" className="adminx-filter-btn" onClick={onRefresh} disabled={loading}>
              <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-rotate"}`} /> Refresh
            </button>
          </div>

          <div className="adminx-form-grid">
            <label>
              Hero Title
              <input value={form.heroTitle} onChange={(event) => updateField("heroTitle", event.target.value)} />
            </label>
            <label>
              Intro Title
              <input value={form.introTitle} onChange={(event) => updateField("introTitle", event.target.value)} />
            </label>
            <label className="span-2">
              Intro Paragraph
              <textarea rows={4} value={form.introParagraph} onChange={(event) => updateField("introParagraph", event.target.value)} />
            </label>
            <label>
              Steps Title
              <input value={form.stepsTitle} onChange={(event) => updateField("stepsTitle", event.target.value)} />
            </label>
            <label>
              Notes Title
              <input value={form.notesTitle} onChange={(event) => updateField("notesTitle", event.target.value)} />
            </label>
            <label>
              Button Text
              <input value={form.consultationButtonText} onChange={(event) => updateField("consultationButtonText", event.target.value)} />
            </label>
            <label>
              Page Status
              <select value={isActive ? "1" : "0"} onChange={(event) => setIsActive(event.target.value === "1")}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </label>
            <label className="span-2">
              Banner Gradient
              <input value={form.bannerGradient} onChange={(event) => updateField("bannerGradient", event.target.value)} />
            </label>
            <label className="span-2">
              Optional Banner Image URL
              <input value={form.bannerImageUrl} onChange={(event) => updateField("bannerImageUrl", event.target.value)} />
            </label>
          </div>

          <div className="adminx-loan-list-editor">
            <div className="adminx-panel-head">
              <h3>Steps</h3>
              <button type="button" className="adminx-filter-btn" onClick={() => updateField("steps", [...form.steps, buildStep()])}>
                Add Step
              </button>
            </div>
            {form.steps.map((step, index) => (
              <article key={`step-${index}`} className="adminx-loan-row-editor">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <input value={step.title || ""} onChange={(event) => updateStep(index, "title", event.target.value)} placeholder="Step title" />
                <textarea rows={2} value={step.body || ""} onChange={(event) => updateStep(index, "body", event.target.value)} placeholder="Step detail" />
                <button type="button" className="adminx-icon-btn" onClick={() => updateField("steps", form.steps.filter((_, rowIndex) => rowIndex !== index))}>
                  <i className="fas fa-trash" />
                </button>
              </article>
            ))}
          </div>

          <div className="adminx-loan-list-editor">
            <div className="adminx-panel-head">
              <h3>Things to Note</h3>
              <button type="button" className="adminx-filter-btn" onClick={() => updateField("notes", [...form.notes, ""])}>
                Add Note
              </button>
            </div>
            {form.notes.map((note, index) => (
              <article key={`note-${index}`} className="adminx-loan-row-editor is-note">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <textarea rows={2} value={note} onChange={(event) => updateNote(index, event.target.value)} />
                <button type="button" className="adminx-icon-btn" onClick={() => updateField("notes", form.notes.filter((_, rowIndex) => rowIndex !== index))}>
                  <i className="fas fa-trash" />
                </button>
              </article>
            ))}
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving === "page"}>
            {saving === "page" ? "Saving..." : "Save Loan Page"}
          </button>
        </form>

        <aside className="adminx-panel adminx-loan-settings">
          <div className="adminx-panel-head">
            <h2>Full Loan System Status</h2>
            <span className={`adminx-status-pill ${effectiveUnlocked ? "authenticated" : "pending"}`}>
              {settings.statusLabel || (effectiveUnlocked ? "Unlocked" : "Locked")}
            </span>
          </div>
          <p className="adminx-muted-copy">
            Full loan operations are currently disabled. Enable LOAN_FULL_FEATURE_ENABLED on the server and unlock from admin settings to activate this module.
          </p>
          {envLocked ? <p className="adminx-auth-error">Locked by server configuration.</p> : null}
          <label className="adminx-toggle-line">
            <input
              type="checkbox"
              checked={adminUnlocked}
              disabled={envLocked}
              onChange={(event) => setAdminUnlocked(event.target.checked)}
            />
            Admin unlock setting
          </label>
          <button type="button" className="btn btn-primary" onClick={saveSettings} disabled={saving === "settings" || envLocked}>
            {saving === "settings" ? "Saving..." : "Save Settings"}
          </button>
        </aside>
      </div>

      <section className="adminx-loan-locked-grid">
        {LOCKED_SECTIONS.map((section) => (
          <article key={section} className={`adminx-loan-locked-card ${effectiveUnlocked ? "is-ready" : ""}`}>
            <div>
              <i className="fas fa-lock" />
              <strong>{section}</strong>
            </div>
            <span>{effectiveUnlocked ? "Ready" : "Locked"}</span>
            <p>
              Full loan operations are currently disabled. Enable LOAN_FULL_FEATURE_ENABLED on the server and unlock from admin settings to activate this module.
            </p>
            <button type="button" disabled>
              Coming Soon
            </button>
          </article>
        ))}
      </section>
    </section>
  );
}
