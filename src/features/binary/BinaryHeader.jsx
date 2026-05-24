import { formatPrice } from "./binary-utils";

export default function BinaryHeader({
  categories,
  selectedCategoryId,
  onCategorySelect,
  mode,
  selectedPair,
  selectedCategory,
  onBack,
  onBrowseMarkets,
  onRefresh,
  onOpenHistory,
  loading,
}) {
  const pairSymbol = selectedPair?.marketSymbol || selectedPair?.baseAsset || "--";
  const pairName = selectedPair?.displayName || "Select Market";

  return (
    <header className="binary-header">
      <div className="binary-header-top">
        <button type="button" className="binary-icon-btn" onClick={onBack}>
          <i className="fas fa-arrow-left" />
        </button>

        <div className="binary-header-actions">
          {mode === "trade" ? (
            <button type="button" className="binary-icon-btn" onClick={onBrowseMarkets} title="Browse markets">
              <i className="fas fa-table-cells-large" />
            </button>
          ) : null}
          <button type="button" className="binary-icon-btn" onClick={onRefresh} title="Refresh">
            <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-arrows-rotate"}`} />
          </button>
          <button type="button" className="binary-icon-btn" onClick={onOpenHistory} title="Trade history">
            <i className="fas fa-clock-rotate-left" />
          </button>
        </div>
      </div>

      <div className="binary-category-tabs" role="tablist" aria-label="Market categories">
        {(Array.isArray(categories) ? categories : []).map((category) => (
          <button
            key={category.categoryId}
            type="button"
            role="tab"
            aria-selected={Number(selectedCategoryId) === Number(category.categoryId)}
            className={Number(selectedCategoryId) === Number(category.categoryId) ? "active" : ""}
            onClick={() => onCategorySelect(category.categoryId)}
          >
            {category.categoryName}
          </button>
        ))}
      </div>

      {mode === "trade" ? (
        <div className="binary-selected-asset-card">
          <div>
            <span>{selectedCategory?.categoryName || "Market"} &gt; {pairName}</span>
            <strong>{pairSymbol}</strong>
          </div>
          <em>{selectedPair ? formatPrice(selectedPair.currentPrice, selectedPair.pricePrecision) : "0.00"}</em>
        </div>
      ) : null}
    </header>
  );
}
