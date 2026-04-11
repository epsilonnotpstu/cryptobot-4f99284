export default function BinaryPeriodSelector({ periods, selectedPeriod, onSelect }) {
  return (
    <section className="binary-period-section">
      <header>
        <h3>Choose Period</h3>
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
