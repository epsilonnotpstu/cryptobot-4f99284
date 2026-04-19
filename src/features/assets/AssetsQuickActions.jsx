const ACTIONS = [
  { id: "deposit", label: "Deposit", icon: "fa-arrow-down" },
  { id: "withdraw", label: "Withdraw", icon: "fa-arrow-up" },
  { id: "transfer", label: "Transfer", icon: "fa-right-left" },
  { id: "convert", label: "Convert", icon: "fa-rotate" },
];

export default function AssetsQuickActions({ disabled = false, onAction }) {
  return (
    <section className="assetspage-card assetspage-quick-actions">
      {ACTIONS.map((action) => (
        <button
          key={action.id}
          type="button"
          className="assetspage-quick-btn"
          disabled={disabled}
          onClick={() => onAction?.(action.id)}
        >
          <span>
            <i className={`fas ${action.icon}`} />
          </span>
          <strong>{action.label}</strong>
        </button>
      ))}
    </section>
  );
}
