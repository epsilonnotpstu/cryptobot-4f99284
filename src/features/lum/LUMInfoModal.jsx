function formatBlockType(value = "") {
  return String(value || "Information")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function LUMInfoModal({ open, title, blocks, onClose }) {
  if (!open) {
    return null;
  }

  const visibleBlocks = (Array.isArray(blocks) ? blocks : []).filter((block) => block?.isActive !== false);

  return (
    <div className="lum-modal-backdrop" role="dialog" aria-modal="true" aria-label="Pledge information">
      <div className="lum-modal-card lum-info-modal">
        <header>
          <h3>{title || "Mining Pledge Information"}</h3>
          <button type="button" className="lum-close-btn" onClick={onClose}>
            <i className="fas fa-xmark" />
          </button>
        </header>

        <div className="lum-info-scroll">
          {visibleBlocks.length ? (
            visibleBlocks.map((block, index) => (
              <article className="lum-info-block" key={`${block.contentId || "block"}-${index}`}>
                <span className="lum-info-block-kicker">{formatBlockType(block.contentType)}</span>
                <h4>{block.title || block.contentType || "Information"}</h4>
                <p>{block.bodyText || "No content available."}</p>
              </article>
            ))
          ) : (
            <article className="lum-info-block">
              <span className="lum-info-block-kicker">Information</span>
              <h4>Pledge & Reward Settlement</h4>
              <p>
                Pledge currency and reward settlement are configured by the plan. Locked amount remains in escrow until cycle
                maturity. Early redemption may be restricted depending on plan policy.
              </p>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
