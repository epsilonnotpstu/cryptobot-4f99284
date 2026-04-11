export default function LUMInfoModal({ open, title, blocks, onClose }) {
  if (!open) {
    return null;
  }

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
          {Array.isArray(blocks) && blocks.length ? (
            blocks.map((block, index) => (
              <article key={`${block.contentId || "block"}-${index}`}>
                <h4>{block.title || block.contentType || "Information"}</h4>
                <p>{block.bodyText || "No content available."}</p>
              </article>
            ))
          ) : (
            <article>
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
