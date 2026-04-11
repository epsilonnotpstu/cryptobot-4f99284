import { formatDateTime, formatMoney, statusClass, statusLabel } from "./lum-utils";

export default function LUMInvestmentTable({ items, emptyLabel = "No investment found." }) {
  if (!items.length) {
    return <p className="lum-empty">{emptyLabel}</p>;
  }

  return (
    <div className="lum-investment-table-wrap">
      <table className="lum-investment-table">
        <thead>
          <tr>
            <th>Plan</th>
            <th>Invest Date</th>
            <th>Amount</th>
            <th>Profit</th>
            <th>Total Return</th>
            <th>Status</th>
            <th>Start At</th>
            <th>End At</th>
            <th>Remaining</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.investmentId}>
              <td>
                <strong>{item.planTitle || "-"}</strong>
                <small>{item.category || "lum"}</small>
              </td>
              <td>{formatDateTime(item.createdAt)}</td>
              <td>{formatMoney(item.investedAmountUsd || 0, item.currency || "USDT")}</td>
              <td>{formatMoney((item.settledProfitUsd || 0) + (item.accruedProfitUsd || 0), item.currency || "USDT")}</td>
              <td>
                {formatMoney(
                  item.settledTotalReturnUsd > 0 ? item.settledTotalReturnUsd : item.expectedTotalReturnUsd || 0,
                  item.currency || "USDT",
                )}
              </td>
              <td>
                <span className={statusClass(item.status)}>{statusLabel(item.status)}</span>
              </td>
              <td>{formatDateTime(item.startedAt)}</td>
              <td>{formatDateTime(item.endsAt)}</td>
              <td>{Number(item.remainingDays || 0)}d</td>
              <td>{item.investmentRef}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
