import { useEffect, useMemo, useRef, useState } from "react";

export default function BinaryPairSelector({ pairs, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const selectedPair = useMemo(
    () => pairs.find((pair) => Number(pair.pairId) === Number(value)) || null,
    [pairs, value],
  );

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!rootRef.current) {
        return;
      }
      if (!rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  const handleSelect = (pairId) => {
    onChange(Number(pairId || 0));
    setOpen(false);
  };

  return (
    <label className="binary-pair-selector" ref={rootRef}>
      <i className="fas fa-chart-line" />
      <button
        type="button"
        className="binary-pair-trigger"
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
      >
        <span>{selectedPair?.displayName || "Select pair"}</span>
        <i className={`fas ${open ? "fa-chevron-up" : "fa-chevron-down"}`} />
      </button>

      {open ? (
        <div className="binary-pair-menu" role="listbox" aria-label="Trading pairs">
        {pairs.map((pair) => (
          <button
            key={pair.pairId}
            type="button"
            className={`binary-pair-option ${Number(value) === Number(pair.pairId) ? "active" : ""}`}
            onClick={() => handleSelect(pair.pairId)}
          >
            {pair.displayName}
          </button>
        ))}
        </div>
      ) : null}
    </label>
  );
}
