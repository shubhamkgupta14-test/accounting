import { useState } from "react";
import {
  CheckCircle,
  CircleDollarSign,
  Info,
  ReceiptText,
  Scale,
} from "lucide-react";
import ExportMenu from "../components/ExportMenu";
import ReportPeriodFilter from "../components/ReportPeriodFilter";
import PageIntro from "../components/PageIntro";
import { useAppSettings } from "../context/SettingsContext";
import { useFinancialReport } from "../hooks/useFinancialReport";
import AuditCheckbox, {
  AuditUncheckAllButton,
} from "../components/AuditCheckbox";
import AccountDrilldown from "../components/AccountDrilldown";

export default function TrialBalance() {
  const { settings, formatMoney, currencySymbol } = useAppSettings();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [purchaseTipOpen, setPurchaseTipOpen] = useState(false);
  const { report, period, setPeriod, loading, error } = useFinancialReport(
    settings.fiscal,
  );
  if (!report)
    return (
      <div>
        <PageIntro id="trial-balance" />
        <ReportPeriodFilter
          period={period}
          onChange={setPeriod}
          loading={loading}
          error={error}
        />
      </div>
    );
  const trialData = report.trialAccounts.map((a) => {
    const balance = a.balance || 0;
    const debitNature = ["Asset", "Expense"].includes(a.type);
    return {
      ...a,
      debit:
        (debitNature && balance >= 0) || (!debitNature && balance < 0)
          ? Math.abs(balance)
          : 0,
      credit:
        (!debitNature && balance >= 0) || (debitNature && balance < 0)
          ? Math.abs(balance)
          : 0,
    };
  });
  const stockInHand = trialData.find(
    (row) => row.name.trim().toLowerCase() === "stock-in-hand",
  );
  const stockInHandValue = Math.abs(stockInHand?.balance || 0);

  const filtered = trialData.filter(
    (r) =>
      (typeFilter === "All" || r.type === typeFilter) &&
      (r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.group.toLowerCase().includes(search.toLowerCase())),
  );
  const totalDr = filtered.reduce((s, r) => s + r.debit, 0);
  const totalCr = filtered.reduce((s, r) => s + r.credit, 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.005;
  const trialExportRows = [
    ...filtered.map((row) => ({
      "Account Name": row.name,
      Type: row.type,
      Group: row.group,
      [`Debit (${currencySymbol})`]: row.debit || "",
      [`Credit (${currencySymbol})`]: row.credit || "",
    })),
    {
      "Account Name": "Total",
      Type: "",
      Group: "",
      [`Debit (${currencySymbol})`]: totalDr,
      [`Credit (${currencySymbol})`]: totalCr,
    },
  ];

  const typeOrder = ["Asset", "Liability", "Equity", "Income", "Expense"];

  return (
    <div>
      <div
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <PageIntro id="trial-balance" />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {balanced && (
            <span className="report-status">
              <CheckCircle size={14} /> Trial Balance Matched
            </span>
          )}
          <AuditUncheckAllButton />
          <ExportMenu
            fullReport
            rowsOnly
            title="Trial Balance"
            period={period}
            rows={trialExportRows}
          />
        </div>
      </div>

      <ReportPeriodFilter
        period={period}
        onChange={setPeriod}
        loading={loading}
        error={error}
      />

      {/* Totals */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 14,
          marginBottom: 20,
        }}
      >
        <div className="card stat-card">
          <div
            className="label"
            style={{ display: "flex", gap: 5, alignItems: "center" }}
          >
            <ReceiptText size={13} /> Total Debit
          </div>
          <div className="value" style={{ fontSize: 22, color: "#2563EB" }}>
            {formatMoney(totalDr)}
          </div>
        </div>
        <div className="card stat-card">
          <div
            className="label"
            style={{ display: "flex", gap: 5, alignItems: "center" }}
          >
            <CircleDollarSign size={13} /> Total Credit
          </div>
          <div className="value" style={{ fontSize: 22, color: "#7C3AED" }}>
            {formatMoney(totalCr)}
          </div>
        </div>
        <div className="card stat-card">
          <div
            className="label"
            style={{ display: "flex", gap: 5, alignItems: "center" }}
          >
            <Scale size={13} /> Difference
          </div>
          <div
            className="value"
            style={{ fontSize: 22, color: balanced ? "#10B981" : "#EF4444" }}
          >
            {formatMoney(Math.abs(totalDr - totalCr))}
          </div>
          <div
            style={{
              fontSize: 12,
              color: balanced ? "#10B981" : "#EF4444",
              marginTop: 4,
            }}
          >
            {balanced ? "✓ Balanced" : "⚠ Not Balanced"}
          </div>
        </div>
      </div>

      <div className="card">
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid #E2E8F0",
            display: "flex",
            gap: 10,
          }}
        >
          <input
            className="input"
            style={{ maxWidth: 280, height: 34, fontSize: 13 }}
            placeholder="Search accounts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="select"
            style={{ fontSize: 13 }}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="All">All Types</option>
            {typeOrder.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>A/c Code</th>
                <th>Account Name</th>
                <th>Type</th>
                <th>Group</th>
                <th className="num dr-heading">Debit ({currencySymbol})</th>
                <th className="num cr-heading">Credit ({currencySymbol})</th>
              </tr>
            </thead>
            <tbody>
              {typeOrder.map((type) => {
                const rows = filtered.filter((r) => r.type === type);
                if (!rows.length) return null;
                const subDr = rows.reduce((s, r) => s + r.debit, 0);
                const subCr = rows.reduce((s, r) => s + r.credit, 0);
                return (
                  <>
                    <tr key={`group-${type}`} style={{ background: "#F8FAFC" }}>
                      <td
                        colSpan={4}
                        style={{
                          padding: "8px 16px",
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: "#64748B",
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                        }}
                      >
                        {type}
                      </td>
                      <td
                        className="num"
                        style={{
                          padding: "8px 16px",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#2563EB",
                        }}
                      >
                        {subDr ? subDr.toLocaleString("en-IN") : "—"}
                      </td>
                      <td
                        className="num"
                        style={{
                          padding: "8px 16px",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#7C3AED",
                        }}
                      >
                        {subCr ? subCr.toLocaleString("en-IN") : "—"}
                      </td>
                    </tr>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <span
                            className="mono"
                            style={{ fontSize: 12, color: "#64748B" }}
                          >
                            {r.id}
                          </span>
                        </td>
                        <td style={{ paddingLeft: 28 }}>
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 9,
                              position: "relative",
                            }}
                          >
                            <AuditCheckbox item={r.name} />
                            <AccountDrilldown account={r.name} />
                            {r.name.trim().toLowerCase() === "purchases" &&
                              stockInHandValue > 0 && (
                                <button
                                  type="button"
                                  aria-label={`Net Purchases ${formatMoney(r.debit)}, Stock-in-hand ${formatMoney(stockInHandValue)}, Actual Purchases ${formatMoney(r.debit + stockInHandValue)}`}
                                  aria-expanded={purchaseTipOpen}
                                  onClick={() =>
                                    setPurchaseTipOpen((open) => !open)
                                  }
                                  style={{
                                    display: "inline-flex",
                                    padding: 0,
                                    border: 0,
                                    background: "transparent",
                                    color: "#2563EB",
                                    cursor: "pointer",
                                  }}
                                >
                                  <Info size={14} />
                                </button>
                              )}
                            {r.name.trim().toLowerCase() === "purchases" &&
                              stockInHandValue > 0 &&
                              purchaseTipOpen && (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: 23,
                                    left: 24,
                                    zIndex: 20,
                                    width: 270,
                                    padding: "10px 12px",
                                    border: "1px solid #BFDBFE",
                                    borderRadius: 8,
                                    background: "#EFF6FF",
                                    boxShadow:
                                      "0 8px 20px rgba(15, 23, 42, 0.14)",
                                    fontSize: 12.5,
                                    color: "#1E3A8A",
                                  }}
                                >
                                  <div
                                    style={{ fontWeight: 700, marginBottom: 7 }}
                                  >
                                    Purchase calculation
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      gap: 16,
                                    }}
                                  >
                                    <span>Net Purchases</span>
                                    <strong>{formatMoney(r.debit)}</strong>
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      gap: 16,
                                      marginTop: 4,
                                    }}
                                  >
                                    <span>Stock-in-hand</span>
                                    <strong>
                                      {formatMoney(stockInHandValue)}
                                    </strong>
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      gap: 16,
                                      marginTop: 7,
                                      paddingTop: 7,
                                      borderTop: "1px solid #BFDBFE",
                                    }}
                                  >
                                    <span>Net Purchases</span>
                                    <strong>
                                      {formatMoney(r.debit + stockInHandValue)}
                                    </strong>
                                  </div>
                                </div>
                              )}
                          </span>
                        </td>
                        <td>
                          <span
                            className="badge badge-slate"
                            style={{ fontSize: 11 }}
                          >
                            {r.type}
                          </span>
                        </td>
                        <td>
                          <span className="group-text">{r.group}</span>
                        </td>
                        <td
                          className="num"
                          style={{ color: r.debit ? "#059669" : "#CBD5E1" }}
                        >
                          {r.debit ? r.debit.toLocaleString("en-IN") : "—"}
                          {r.name.trim().toLowerCase() === "purchases" &&
                            stockInHandValue > 0 &&
                            r.debit > 0 && (
                              <sup
                                style={{
                                  marginLeft: 2,
                                  color: "#2563EB",
                                  fontWeight: 800,
                                }}
                              >
                                *
                              </sup>
                            )}
                        </td>
                        <td
                          className="num"
                          style={{ color: r.credit ? "#DC2626" : "#CBD5E1" }}
                        >
                          {r.credit ? r.credit.toLocaleString("en-IN") : "—"}
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="totals-row">
                <td
                  colSpan={4}
                  style={{
                    padding: "12px 16px",
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  Grand Total
                </td>
                <td
                  className="num total-amount"
                  style={{
                    padding: "12px 16px",
                    fontFamily: "JetBrains Mono, monospace",
                    fontWeight: 800,
                    fontSize: 14,
                  }}
                >
                  {totalDr.toLocaleString("en-IN")}
                </td>
                <td
                  className="num total-amount"
                  style={{
                    padding: "12px 16px",
                    fontFamily: "JetBrains Mono, monospace",
                    fontWeight: 800,
                    fontSize: 14,
                  }}
                >
                  {totalCr.toLocaleString("en-IN")}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
