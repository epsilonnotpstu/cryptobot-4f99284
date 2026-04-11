const TABS = [
  { id: "lum", label: "LUM Plans" },
  { id: "mining", label: "Mining Plans" },
];

export default function LUMPlanTabs({ activeTab, onChange }) {
  return (
    <div className="lum-plan-tabs" role="tablist" aria-label="LUM plan tabs">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={tab.id === activeTab ? "active" : ""}
          onClick={() => onChange(tab.id)}
          role="tab"
          aria-selected={tab.id === activeTab}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
