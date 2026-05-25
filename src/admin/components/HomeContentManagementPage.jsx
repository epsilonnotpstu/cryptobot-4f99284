import { useEffect, useMemo, useState } from "react";
import { ADMIN_SECTION_META } from "../constants";
import AdminSectionIntro from "./AdminSectionIntro";

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

export default function HomeContentManagementPage({
  contentConfig,
  contentUpdatedAt,
  contentUpdatedBy,
  loading,
  searchValue,
  onSearchChange,
  onRefresh,
  onSaveContent,
}) {
  const [jsonText, setJsonText] = useState("{}");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const nextText = JSON.stringify(contentConfig || {}, null, 2);
    setJsonText(nextText);
  }, [contentConfig]);

  const summary = useMemo(() => {
    const features = Array.isArray(contentConfig?.sections?.features?.items)
      ? contentConfig.sections.features.items.length
      : 0;
    const steps = Array.isArray(contentConfig?.sections?.howItWorks?.items)
      ? contentConfig.sections.howItWorks.items.length
      : 0;
    const faqs = Array.isArray(contentConfig?.sections?.faq?.items)
      ? contentConfig.sections.faq.items.length
      : 0;
    const assets = Array.isArray(contentConfig?.market?.assets)
      ? contentConfig.market.assets.length
      : 0;
    const footerGroups = Array.isArray(contentConfig?.footer?.sections)
      ? contentConfig.footer.sections.length
      : 0;

    return { features, steps, faqs, assets, footerGroups };
  }, [contentConfig]);

  const searchableNotes = useMemo(() => {
    const rows = [
      `Brand: ${contentConfig?.brand?.name || ""}`,
      `Hero title: ${contentConfig?.hero?.titleLine1 || ""} ${contentConfig?.hero?.titleLine2 || ""}`,
      `Features: ${summary.features}`,
      `How it works steps: ${summary.steps}`,
      `FAQ count: ${summary.faqs}`,
      `Market assets: ${summary.assets}`,
      `Footer groups: ${summary.footerGroups}`,
      `Admin panel link: ${contentConfig?.footer?.adminPanelHref || ""}`,
    ];

    const keyword = normalizeText(searchValue);
    if (!keyword) {
      return rows;
    }

    return rows.filter((row) => normalizeText(row).includes(keyword));
  }, [contentConfig, searchValue, summary.assets, summary.faqs, summary.features, summary.footerGroups, summary.steps]);

  const runSave = async () => {
    setError("");
    setNotice("");

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setError("Invalid JSON format. Please fix syntax and try again.");
      return;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setError("Root must be a JSON object.");
      return;
    }

    setSaving(true);
    try {
      const response = await onSaveContent?.(parsed);
      const nextText = JSON.stringify(response?.content || parsed, null, 2);
      setJsonText(nextText);
      setNotice(response?.message || "Website content saved.");
    } catch (saveError) {
      setError(saveError.message || "Could not save website content.");
    } finally {
      setSaving(false);
    }
  };

  const runFormat = () => {
    setError("");
    setNotice("");
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
    } catch {
      setError("Cannot format invalid JSON. Fix syntax first.");
    }
  };

  return (
    <section className="adminx-web-content-root">
      <AdminSectionIntro
        icon={ADMIN_SECTION_META.webContent.icon}
        title={ADMIN_SECTION_META.webContent.title}
        description={ADMIN_SECTION_META.webContent.description}
        stats={[
          { label: "Features", value: String(summary.features) },
          { label: "FAQ", value: String(summary.faqs) },
          { label: "Assets", value: String(summary.assets) },
        ]}
      />

      <article className="adminx-panel adminx-web-content-meta">
        <div className="adminx-panel-head">
          <h2>Publish Info</h2>
          <span>{contentUpdatedAt ? new Date(contentUpdatedAt).toLocaleString() : "Default content loaded"}</span>
        </div>
        <div className="adminx-simple-list">
          <p>
            <span>Updated By</span>
            <strong>{contentUpdatedBy || "system-default"}</strong>
          </p>
          <p>
            <span>Footer Admin Link</span>
            <strong>{contentConfig?.footer?.adminPanelHref || "/admin"}</strong>
          </p>
          <p>
            <span>Random Market Animation</span>
            <strong>{contentConfig?.market?.enableRandomMovement ? "Enabled" : "Disabled"}</strong>
          </p>
        </div>
      </article>

      <article className="adminx-panel adminx-web-content-editor">
        <div className="adminx-panel-head">
          <h2>Home Page JSON Editor</h2>
          <span>Manage all home page blocks, links, texts, cards, and lists from this JSON.</span>
        </div>

        <div className="adminx-support-inline-controls adminx-web-content-actions">
          <button type="button" className="btn btn-ghost" onClick={runFormat}>
            Format JSON
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setJsonText(JSON.stringify(contentConfig || {}, null, 2))}>
            Reset Editor
          </button>
          <button type="button" className="btn btn-ghost" onClick={onRefresh} disabled={loading || saving}>
            {loading ? "Refreshing..." : "Refresh from Server"}
          </button>
          <button type="button" className="btn btn-primary" onClick={runSave} disabled={saving || loading}>
            {saving ? "Saving..." : "Save & Publish"}
          </button>
        </div>

        <label className="adminx-web-content-textarea-wrap" htmlFor="adminx-home-content-json">
          <textarea
            id="adminx-home-content-json"
            value={jsonText}
            onChange={(event) => setJsonText(event.target.value)}
            spellCheck={false}
            rows={28}
          />
        </label>

        {notice ? <p className="adminx-auth-notice">{notice}</p> : null}
        {error ? <p className="adminx-auth-error">{error}</p> : null}
      </article>

      <article className="adminx-panel adminx-web-content-search-hints">
        <div className="adminx-panel-head">
          <h2>Quick Notes</h2>
          <span>Use admin top search to filter these reminders.</span>
        </div>
        <label className="adminx-search adminx-web-content-local-search" htmlFor="adminx-web-content-local-search">
          <i className="fas fa-search" />
          <input
            id="adminx-web-content-local-search"
            type="text"
            placeholder="Search notes..."
            value={searchValue}
            onChange={(event) => onSearchChange?.(event.target.value)}
          />
        </label>
        <div className="adminx-simple-list">
          {searchableNotes.map((row) => (
            <p key={row}>
              <span>{row}</span>
            </p>
          ))}
          {!searchableNotes.length ? (
            <p>
              <span>No notes matched current search.</span>
            </p>
          ) : null}
        </div>
      </article>
    </section>
  );
}
