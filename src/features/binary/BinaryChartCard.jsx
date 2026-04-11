import { useMemo } from "react";
import { buildSmoothSparklinePath, buildSparklinePoints, formatPrice, toNumber } from "./binary-utils";

function buildAreaPath(linePath = "", points = [], height = 32) {
  if (!linePath || !Array.isArray(points) || points.length < 2) {
    return "";
  }
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath} L${last.x.toFixed(2)},${height.toFixed(2)} L${first.x.toFixed(2)},${height.toFixed(2)} Z`;
}

function formatTickTime(value = "") {
  if (!value) {
    return "--";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "--";
  }
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function modeLabel(engineMode = "internal_tick", externalCount = 0, total = 0) {
  const normalized = String(engineMode || "").toLowerCase();
  if (normalized === "external_price_sync") {
    if (total > 0 && externalCount === 0) {
      return "External sync enabled (fallback feed active)";
    }
    if (total > 0 && externalCount < total) {
      return "External sync with smart fallback feed";
    }
    return "External synchronized price feed";
  }
  if (normalized === "manual_admin_tick") {
    return "Manual admin tick feed";
  }
  return "Live synchronized tick feed";
}

function sourceMixLabel({ externalCount = 0, internalCount = 0, manualCount = 0, total = 0 } = {}) {
  if (!total) {
    return "No feed data";
  }
  if (manualCount > 0 && externalCount === 0 && internalCount === 0) {
    return "Manual feed";
  }
  if (externalCount === total) {
    return "100% external API";
  }
  if (externalCount > 0) {
    return `${Math.round((externalCount / total) * 100)}% external API`;
  }
  return "Internal fallback feed";
}

export default function BinaryChartCard({ pair, ticks, engineMode }) {
  const chart = useMemo(() => {
    const safeTicks = Array.isArray(ticks)
      ? ticks.filter((tick) => Number.isFinite(toNumber(tick?.price, NaN)))
      : [];

    const points = buildSparklinePoints(safeTicks, 100, 32, 1.2);
    const linePath = buildSmoothSparklinePath(points);
    const areaPath = buildAreaPath(linePath, points, 32);

    if (!safeTicks.length || !points.length) {
      return {
        total: 0,
        linePath: "",
        areaPath: "",
        points: [],
        high: 0,
        low: 0,
        change: 0,
        changePercent: 0,
        lastTickTime: "",
        lastPoint: null,
        highPoint: null,
        lowPoint: null,
        externalCount: 0,
        internalCount: 0,
        manualCount: 0,
      };
    }

    const prices = safeTicks.map((tick) => toNumber(tick?.price, 0));
    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const change = lastPrice - firstPrice;
    const changePercent = firstPrice > 0 ? (change / firstPrice) * 100 : 0;

    let externalCount = 0;
    let manualCount = 0;
    for (const tick of safeTicks) {
      const source = String(tick?.sourceType || "").toLowerCase();
      if (source === "external_api") {
        externalCount += 1;
      } else if (source === "manual_admin_feed") {
        manualCount += 1;
      }
    }
    const internalCount = Math.max(0, safeTicks.length - externalCount - manualCount);

    const highPoint = points.reduce((best, point) => (point.price > best.price ? point : best), points[0]);
    const lowPoint = points.reduce((best, point) => (point.price < best.price ? point : best), points[0]);

    return {
      total: safeTicks.length,
      linePath,
      areaPath,
      points,
      high,
      low,
      change,
      changePercent,
      lastTickTime: String(safeTicks[safeTicks.length - 1]?.tickTime || ""),
      lastPoint: points[points.length - 1],
      highPoint,
      lowPoint,
      externalCount,
      internalCount,
      manualCount,
    };
  }, [ticks]);

  const pairPrice = toNumber(pair?.currentPrice, 0);
  const pairPrecision = pair?.pricePrecision || 2;
  const priceChangeClass = chart.change > 0 ? "is-up" : chart.change < 0 ? "is-down" : "is-flat";
  const changePrefix = chart.change > 0 ? "+" : chart.change < 0 ? "-" : "";
  const feedLabel = modeLabel(engineMode, chart.externalCount, chart.total);

  return (
    <section className="binary-chart-card">
      <header>
        <div>
          <h2>{pair?.displayName || "Pair"}</h2>
          <p>{feedLabel}</p>
        </div>
        <div className={`binary-price-pill ${priceChangeClass}`}>
          <strong>{formatPrice(pairPrice, pairPrecision)}</strong>
          <small>
            {changePrefix}
            {formatPrice(Math.abs(chart.change), pairPrecision)} ({changePrefix}
            {Math.abs(chart.changePercent).toFixed(2)}%)
          </small>
        </div>
      </header>

      <div className="binary-chart-wrap">
        {chart.total ? (
          <svg viewBox="0 0 100 32" className="binary-chart-svg" role="img" aria-label="Smoothed live price chart">
            <defs>
              <linearGradient id="binaryAreaFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(53, 215, 255, 0.34)" />
                <stop offset="100%" stopColor="rgba(53, 215, 255, 0.03)" />
              </linearGradient>
              <linearGradient id="binaryLineStroke" x1="0" x2="1" y1="0.1" y2="0.9">
                <stop offset="0%" stopColor="#91f3ff" />
                <stop offset="45%" stopColor="#35d7ff" />
                <stop offset="100%" stopColor="#25b7ff" />
              </linearGradient>
            </defs>

            <line x1="0" y1="7" x2="100" y2="7" className="binary-chart-grid-line" />
            <line x1="0" y1="16" x2="100" y2="16" className="binary-chart-grid-line" />
            <line x1="0" y1="25" x2="100" y2="25" className="binary-chart-grid-line" />

            <path d={chart.areaPath} fill="url(#binaryAreaFill)" />
            <path d={chart.linePath} className="binary-chart-line" stroke="url(#binaryLineStroke)" />

            {chart.highPoint ? <circle cx={chart.highPoint.x} cy={chart.highPoint.y} r="0.9" className="binary-chart-extreme high" /> : null}
            {chart.lowPoint ? <circle cx={chart.lowPoint.x} cy={chart.lowPoint.y} r="0.9" className="binary-chart-extreme low" /> : null}
            {chart.lastPoint ? (
              <>
                <circle cx={chart.lastPoint.x} cy={chart.lastPoint.y} r="1.4" className="binary-chart-last-dot" />
                <circle cx={chart.lastPoint.x} cy={chart.lastPoint.y} r="2.6" className="binary-chart-last-pulse" />
              </>
            ) : null}
          </svg>
        ) : (
          <p className="binary-empty">No chart ticks yet.</p>
        )}
      </div>

      <footer className="binary-chart-footer">
        <span>{chart.total ? `${chart.total} points` : "0 points"}</span>
        <span>Timeframe: {pair?.chartTimeframeLabel || "1s"}</span>
      </footer>

      <div className="binary-chart-meta">
        <span className="binary-feed-badge">
          <i className="fas fa-satellite-dish" />
          {sourceMixLabel(chart)}
        </span>
        <span className="binary-chart-updated">
          <i className="fas fa-clock" />
          Last tick {formatTickTime(chart.lastTickTime)}
        </span>
      </div>

      <div className="binary-chart-stats">
        <article>
          <span>High</span>
          <strong>{formatPrice(chart.high, pairPrecision)}</strong>
        </article>
        <article>
          <span>Low</span>
          <strong>{formatPrice(chart.low, pairPrecision)}</strong>
        </article>
        <article>
          <span>Change</span>
          <strong className={priceChangeClass}>
            {changePrefix}
            {formatPrice(Math.abs(chart.change), pairPrecision)}
          </strong>
        </article>
      </div>
    </section>
  );
}
