import { useMemo, useState } from "react";
import LUMInvestmentTable from "./LUMInvestmentTable";
import { formatMoney } from "./lum-utils";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "pending", label: "Pending" },
  { id: "rejected", label: "Rejected" },
];

export default function LUMEntrustModal({ open, loading, data, onClose }) {
  const [filter, setFilter] = useState("all");

  const merged = useMemo(() => {
    const active = Array.isArray(data?.activeInvestments) ? data.activeInvestments : [];
    const completed = Array.isArray(data?.completedInvestments) ? data.completedInvestments : [];
    const pending = Array.isArray(data?.pendingInvestments) ? data.pendingInvestments : [];
    const rejected = Array.isArray(data?.rejectedInvestments) ? data.rejectedInvestments : [];

    const collection = {
      all: [...active, ...pending, ...completed, ...rejected],
      active,
      completed,
      pending,
      rejected,
    };

    return collection;
  }, [data]);

  if (!open) {
    return null;
  }

  return (
    <div className="lum-modal-backdrop" role="dialog" aria-modal="true" aria-label="My investments">
      <div className="lum-modal-card lum-entrust-modal">
        <header>
          <h3>My Investment</h3>
          <button type="button" className="lum-close-btn" onClick={onClose}>
            <i className="fas fa-xmark" />
          </button>
        </header>

        <div className="lum-entrust-summary">
          <article>
            <span>Total Profit</span>
            <strong>{formatMoney(data?.summary?.totalReturnEstimated || 0, "USDT")}</strong>
          </article>
          <article>
            <span>Active Orders</span>
            <strong>{Number(data?.summary?.activeCount || 0)}</strong>
          </article>
          <article>
            <span>Pending Orders</span>
            <strong>{Number(data?.summary?.pendingCount || 0)}</strong>
          </article>
        </div>

        <div className="lum-filter-tabs" role="tablist" aria-label="Investment filters">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === filter ? "active" : ""}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="lum-modal-loading">Loading investment records...</p>
        ) : (
          <LUMInvestmentTable
            items={merged[filter] || []}
            emptyLabel={filter === "all" ? "No investment history yet." : `No ${filter} investment found.`}
          />
        )}
      </div>
    </div>
  );
}
