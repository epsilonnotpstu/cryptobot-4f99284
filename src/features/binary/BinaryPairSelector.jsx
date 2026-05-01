import { useEffect, useMemo, useRef, useState } from "react";
import { formatPrice, parsePairAssets, getTokenIconUrl, toNumber } from "./binary-utils";

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

  const selectedAssets = parsePairAssets(selectedPair);
  const selectedPrice = selectedPair ? formatPrice(selectedPair.currentPrice, selectedPair.pricePrecision) : "--";

  return (
    <div className="binary-pair-selector" ref={rootRef}>
      <button
        type="button"
        className="binary-pair-trigger"
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
      >
        <div className="binary-pair-trigger-left">
          <div className="binary-pair-icon-stack" aria-hidden="true">
            <span>
              {getTokenIconUrl(selectedAssets.base) ? <img src={getTokenIconUrl(selectedAssets.base)} alt="" loading="lazy" /> : selectedAssets.base.slice(0, 2)}
            </span>
            <span>
              {getTokenIconUrl(selectedAssets.quote) ? <img src={getTokenIconUrl(selectedAssets.quote)} alt="" loading="lazy" /> : selectedAssets.quote.slice(0, 2)}
            </span>
          </div>
          <div className="binary-pair-copy">
            <small>Market Pair</small>
            <strong>{selectedPair?.displayName || "Select pair"}</strong>
          </div>
        </div>
        <div className="binary-pair-trigger-right">
          <em>{selectedPrice}</em>
          <i className={`fas ${open ? "fa-chevron-up" : "fa-chevron-down"}`} />
        </div>
      </button>

      {open ? (
        <div className="binary-pair-panel" role="listbox" aria-label="Trading pairs">
          <header>
            <strong>Select Trading Pair</strong>
            <small>{pairs.length} markets</small>
          </header>
          <div className="binary-pair-grid">
            {pairs.map((pair) => {
              const assets = parsePairAssets(pair);
              const iconBase = getTokenIconUrl(assets.base);
              const iconQuote = getTokenIconUrl(assets.quote);
              const currentPrice = toNumber(pair.currentPrice, 0);
              const previousPrice = toNumber(pair.previousPrice, currentPrice);
              const deltaPercent = previousPrice > 0 ? ((currentPrice - previousPrice) / previousPrice) * 100 : 0;
              const isPositive = deltaPercent >= 0;

              return (
                <button
                  key={pair.pairId}
                  type="button"
                  className={`binary-pair-card ${Number(value) === Number(pair.pairId) ? "active" : ""}`}
                  onClick={() => handleSelect(pair.pairId)}
                >
                  <div className="binary-pair-card-head">
                    <div className="binary-pair-icon-stack" aria-hidden="true">
                      <span>{iconBase ? <img src={iconBase} alt="" loading="lazy" /> : assets.base.slice(0, 2)}</span>
                      <span>{iconQuote ? <img src={iconQuote} alt="" loading="lazy" /> : assets.quote.slice(0, 2)}</span>
                    </div>
                    <div>
                      <strong>{pair.displayName}</strong>
                      <small>{assets.base} / {assets.quote}</small>
                    </div>
                  </div>

                  <div className="binary-pair-card-foot">
                    <span>{formatPrice(pair.currentPrice, pair.pricePrecision)}</span>
                    <em className={isPositive ? "is-up" : "is-down"}>
                      {isPositive ? "+" : ""}{deltaPercent.toFixed(2)}%
                    </em>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
