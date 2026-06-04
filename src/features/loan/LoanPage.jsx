import { useEffect, useMemo, useState } from "react";
import SupportChatModal from "../support/SupportChatModal";
import "./loan.css";

const FALLBACK_CONFIG = {
  heroTitle: "RampX Lending Center",
  introTitle: "Lending Center",
  introParagraph:
    "Provide safe and reliable digital asset borrowing guidance for eligible users who need liquidity without selling existing cryptocurrency assets.",
  stepsTitle: "Just a few steps to get started",
  steps: [
    {
      title: "Contact and consultation",
      body: "Click the \"Loan consultation\" button below to connect with online customer service for consultation.",
    },
    {
      title: "Obtain the loan limit",
      body: "According to customer service instructions, complete the digital asset loan application form and wait for the review result.",
    },
    {
      title: "Issuance of loans",
      body: "After approval, the approved digital currency loan will be released to your wallet account.",
    },
  ],
  notesTitle: "Things to note",
  notes: [
    "Borrowing digital currency is a voluntary user action.",
    "This digital currency loan is for your own use only.",
    "The borrowed digital currency cannot be transferred to others unless the platform permits it.",
    "If you have any questions about this loan service, please contact online customer service in time.",
    "Click \"Loan consultation\" below to request assistance from customer service.",
  ],
  consultationButtonText: "Loan consultation",
  bannerGradient: "linear-gradient(135deg, #5b5ff8 0%, #2563eb 48%, #06b6d4 100%)",
  bannerImageUrl: "",
};

function normalizeConfig(payload = {}) {
  return {
    ...FALLBACK_CONFIG,
    ...(payload?.config || payload || {}),
    steps: Array.isArray(payload?.config?.steps || payload?.steps)
      ? (payload?.config?.steps || payload?.steps)
      : FALLBACK_CONFIG.steps,
    notes: Array.isArray(payload?.config?.notes || payload?.notes)
      ? (payload?.config?.notes || payload?.notes)
      : FALLBACK_CONFIG.notes,
  };
}

export default function LoanPage({
  onBack,
  onLoadPage,
  onStartConsultation,
  onLoadSupportTickets,
  onLoadSupportTicketDetail,
  onCreateSupportTicket,
  onSendSupportTicketMessage,
  onUpdateSupportTicketStatus,
  onLoadSupportLiveThread,
  onSendSupportLiveMessage,
}) {
  const [pagePayload, setPagePayload] = useState({ config: FALLBACK_CONFIG, isActive: true });
  const [loading, setLoading] = useState(false);
  const [consulting, setConsulting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportTicketRef, setSupportTicketRef] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadLoanPage() {
      if (!onLoadPage) {
        return;
      }
      setLoading(true);
      setError("");
      try {
        const payload = await onLoadPage();
        if (!cancelled) {
          setPagePayload(payload || { config: FALLBACK_CONFIG, isActive: true });
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Could not load lending center.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadLoanPage();
    return () => {
      cancelled = true;
    };
  }, [onLoadPage]);

  const config = useMemo(() => normalizeConfig(pagePayload), [pagePayload]);

  const startConsultation = async () => {
    if (!onStartConsultation) {
      setError("Loan consultation is not available right now.");
      return;
    }
    setConsulting(true);
    setError("");
    setNotice("");
    try {
      const payload = await onStartConsultation();
      setNotice(payload?.message || "Loan consultation opened.");
      const ticketRef = payload?.navigation?.ticketRef || payload?.ticket?.ticketRef || "";
      setSupportTicketRef(ticketRef);
      setSupportOpen(true);
    } catch (consultError) {
      setError(consultError.message || "Could not start loan consultation.");
    } finally {
      setConsulting(false);
    }
  };

  return (
    <main className="loan-page">
      <section className="loan-shell">
        <header className="loan-hero" style={{ background: config.bannerGradient || FALLBACK_CONFIG.bannerGradient }}>
          <button type="button" className="loan-back-btn" onClick={onBack} aria-label="Back to dashboard">
            <i className="fas fa-arrow-left" />
          </button>
          <div className="loan-hero-copy">
            <span>Digital Asset Lending</span>
            <h1>{config.heroTitle}</h1>
            <p>Liquidity guidance for eligible RampX users.</p>
          </div>
          <div className="loan-hero-art">
            {config.bannerImageUrl ? (
              <img src={config.bannerImageUrl} alt="" />
            ) : (
              <i className="fas fa-hand-holding-dollar" />
            )}
          </div>
        </header>

        <section className="loan-content-card">
          {loading ? <p className="loan-muted">Loading lending center...</p> : null}
          {error ? <p className="loan-error">{error}</p> : null}
          {notice ? <p className="loan-notice">{notice}</p> : null}
          {!pagePayload?.isActive ? (
            <p className="loan-error">Lending Center is temporarily inactive. Please contact support for assistance.</p>
          ) : null}

          <article className="loan-intro">
            <h2>{config.introTitle}</h2>
            <p>{config.introParagraph}</p>
          </article>

          <article className="loan-section">
            <h3>{config.stepsTitle}</h3>
            <div className="loan-step-list">
              {config.steps.map((step, index) => (
                <div className="loan-step" key={`${step.title || "step"}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="loan-section">
            <h3>{config.notesTitle}</h3>
            <ol className="loan-note-list">
              {config.notes.map((note, index) => (
                <li key={`${note}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{note}</p>
                </li>
              ))}
            </ol>
          </article>

          <button
            type="button"
            className="loan-consult-btn"
            onClick={startConsultation}
            disabled={consulting || !pagePayload?.isActive}
          >
            <i className={`fas ${consulting ? "fa-spinner fa-spin" : "fa-headset"}`} />
            {consulting ? "Opening..." : config.consultationButtonText}
          </button>
        </section>
      </section>

      <SupportChatModal
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        onLoadTickets={onLoadSupportTickets}
        onLoadTicketDetail={onLoadSupportTicketDetail}
        onCreateTicket={onCreateSupportTicket}
        onSendTicketMessage={onSendSupportTicketMessage}
        onUpdateTicketStatus={onUpdateSupportTicketStatus}
        onLoadLiveThread={onLoadSupportLiveThread}
        onSendLiveMessage={onSendSupportLiveMessage}
        initialMode={supportTicketRef ? "tickets" : "live"}
        initialTicketRef={supportTicketRef}
      />
    </main>
  );
}
