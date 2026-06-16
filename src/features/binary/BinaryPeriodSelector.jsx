export default function BinaryPeriodSelector({ periods, selectedPeriod, onSelect, directionMode = "long" }) {
  const modeClass = directionMode === "short" ? "is-short" : "is-long";

  return (
    <section className={`binary-period-section ${modeClass}`}>
      <header>
        <div>
          <h3>Trade Period</h3>
          <p className="binary-period-hint">Select duration &amp; payout rate</p>
        </div>
      </header>

      <div className="binary-period-grid">
        {periods.map((period) => (
          <button
            type="button"
            key={`${period.periodSeconds}-${period.pairId || "global"}`}
            className={selectedPeriod === period.periodSeconds ? "active" : ""}
            onClick={() => onSelect(period.periodSeconds)}
          >
            <strong>{period.periodSeconds}s</strong>
            <span>{period.payoutPercent}%</span>
          </button>
        ))}
      </div>
    </section>
  );
}
