export default function AdminSectionIntro({
  icon = "fa-chart-line",
  title = "Section",
  description = "",
  stats = [],
}) {
  const normalizedStats = Array.isArray(stats) ? stats.filter((item) => item && item.label) : [];

  return (
    <section className="adminx-section-intro">
      <div className="adminx-section-intro-main">
        <span className="adminx-section-intro-icon" aria-hidden="true">
          <i className={`fas ${icon}`} />
        </span>
        <div className="adminx-section-intro-copy">
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {normalizedStats.length ? (
        <div className="adminx-section-intro-stats">
          {normalizedStats.map((item) => (
            <article key={`${item.label}-${item.value}`} className="adminx-section-stat">
              <small>{item.label}</small>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
