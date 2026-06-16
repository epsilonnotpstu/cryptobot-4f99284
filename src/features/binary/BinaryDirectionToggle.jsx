import { normalizeDirection } from "./binary-utils";

export default function BinaryDirectionToggle({ value, onChange }) {
  const direction = normalizeDirection(value);

  return (
    <section className="binary-direction-toggle">
      <button
        type="button"
        className={direction === "long" ? "active long" : "long"}
        onClick={() => onChange("long")}
      >
        <i className="fas fa-arrow-trend-up" />
        <strong>Long</strong>
        <small>Price goes UP</small>
      </button>
      <button
        type="button"
        className={direction === "short" ? "active short" : "short"}
        onClick={() => onChange("short")}
      >
        <i className="fas fa-arrow-trend-down" />
        <strong>Short</strong>
        <small>Price goes DOWN</small>
      </button>
    </section>
  );
}
