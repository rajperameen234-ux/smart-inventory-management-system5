
import { useEffect, useState } from "react";
import { supabase } from "../supabase";

type ReportSale = {
  id: number;
  customer: string;
  product: string;
  amount: number;
  paid: number;
  date: string;
};

function Reports() {
  const [sales, setSales] = useState<ReportSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadReports() {
      setLoading(true);
      setError("");

      try {
        const { data, error } = await supabase
          .from("sales")
          .select("*");

        if (error) throw error;

        const rows: ReportSale[] = (data ?? []).map(
          (item: Record<string, unknown>) => ({
            id: Number(item.id ?? 0),
            customer: String(
              item.customer ?? item.customer_name ?? "Walk-in Customer"
            ),
            product: String(
              item.product ?? item.product_name ?? "Product"
            ),
            amount: Number(
              item.amount ?? item.total_amount ?? item.totalAmount ?? 0
            ),
            paid: Number(
              item.paid ??
                item.paid_amount ??
                item.paidAmount ??
                0
            ),
            date: String(
              item.date ?? item.sale_date ?? item.created_at ?? ""
            ),
          })
        );

        setSales(rows);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load sales reports."
        );
      } finally {
        setLoading(false);
      }
    }

    loadReports();
  }, []);

  const totalSales = sales.reduce(
    (sum, sale) => sum + sale.amount,
    0
  );

  const totalPaid = sales.reduce(
    (sum, sale) => sum + sale.paid,
    0
  );

  const totalDue = sales.reduce(
    (sum, sale) => sum + Math.max(0, sale.amount - sale.paid),
    0
  );

  const monthlySales = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));

    const month = date.getMonth();
    const year = date.getFullYear();

    const amount = sales
      .filter((sale) => {
        const saleDate = new Date(sale.date);
        return (
          !Number.isNaN(saleDate.getTime()) &&
          saleDate.getMonth() === month &&
          saleDate.getFullYear() === year
        );
      })
      .reduce((sum, sale) => sum + sale.amount, 0);

    return {
      label: date.toLocaleDateString("en", { month: "short" }),
      amount,
    };
  });

  const maxSales = Math.max(
    ...monthlySales.map((month) => month.amount),
    1
  );

  const formatMoney = (amount: number) =>
    `Rs. ${amount.toLocaleString("en-PK", {
      maximumFractionDigits: 2,
    })}`;

  // EXPORT REPORT TO CSV
  function exportCSV() {
    const header = [
      "ID",
      "Customer",
      "Product",
      "Total Amount",
      "Paid Amount",
      "Due Amount",
      "Date",
    ];

    const rows = sales.map((sale) => [
      sale.id,
      sale.customer,
      sale.product,
      sale.amount,
      sale.paid,
      Math.max(0, sale.amount - sale.paid),
      sale.date,
    ]);

    const escapeCSV = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`;

    const csv = [header, ...rows]
      .map((row) => row.map(escapeCSV).join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "inventory-sales-report.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  // PRINT REPORT
  function printReport() {
    window.print();
  }

  const cardStyle: React.CSSProperties = {
    background: "var(--card, #ffffff)",
    border: "1px solid var(--border, #e5e7eb)",
    borderRadius: "14px",
    padding: "20px",
    minWidth: 0,
  };

  return (
    <div
      className="reports-page"
      style={{
        padding: "24px",
        color: "var(--text, #111827)",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }

          .no-print,
          button,
          .sidebar,
          nav,
          aside {
            display: none !important;
          }

          .reports-page {
            padding: 0 !important;
            color: black !important;
          }

          .reports-page h1,
          .reports-page h2,
          .reports-page p,
          .reports-page span,
          .reports-page td,
          .reports-page th {
            color: black !important;
          }

          .reports-page > div {
            break-inside: avoid;
          }

          .reports-page table {
            width: 100% !important;
            border-collapse: collapse !important;
          }

          .reports-page th,
          .reports-page td {
            border: 1px solid #cccccc !important;
            padding: 8px !important;
            white-space: normal !important;
          }

          @page {
            size: auto;
            margin: 12mm;
          }
        }
      `}</style>

      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "24px",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "28px" }}>
            Reports & Analytics
          </h1>
          <p style={{ color: "#6b7280" }}>
            Monitor sales, payments and outstanding balances.
          </p>
        </div>

        <div
          className="no-print"
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={printReport}
            disabled={loading || !!error || sales.length === 0}
            style={{
              background: "#16a34a",
              color: "white",
              padding: "12px 18px",
              border: 0,
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            🖨️ Print Report
          </button>

          <button
            type="button"
            onClick={exportCSV}
            disabled={loading || !!error || sales.length === 0}
            style={{
              background: "#2563eb",
              color: "white",
              padding: "12px 18px",
              border: 0,
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <p>Loading reports...</p>
      ) : error ? (
        <div style={{ ...cardStyle, color: "#dc2626" }}>
          <strong>Could not load reports</strong>
          <p>{error}</p>
          <p>
            Check your Supabase sales table and its access permissions.
          </p>
        </div>
      ) : (
        <>
          {/* SUMMARY CARDS */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "16px",
              marginBottom: "24px",
            }}
          >
            <div style={cardStyle}>
              <p style={{ color: "#6b7280", marginTop: 0 }}>
                Total Sales
              </p>
              <h2>{formatMoney(totalSales)}</h2>
              <span>{sales.length} recorded transactions</span>
            </div>

            <div style={cardStyle}>
              <p style={{ color: "#6b7280", marginTop: 0 }}>
                Total Received
              </p>
              <h2 style={{ color: "#16a34a" }}>
                {formatMoney(totalPaid)}
              </h2>
              <span>Payments recorded</span>
            </div>

            <div style={cardStyle}>
              <p style={{ color: "#6b7280", marginTop: 0 }}>
                Outstanding Dues
              </p>
              <h2 style={{ color: "#dc2626" }}>
                {formatMoney(totalDue)}
              </h2>
              <span>Calculated from sales</span>
            </div>

            <div style={cardStyle}>
              <p style={{ color: "#6b7280", marginTop: 0 }}>
                Average Sale
              </p>
              <h2>
                {formatMoney(
                  sales.length ? totalSales / sales.length : 0
                )}
              </h2>
              <span>Per transaction</span>
            </div>
          </div>

          {/* SALES CHART */}
          <div style={{ ...cardStyle, marginBottom: "24px" }}>
            <h2 style={{ marginTop: 0 }}>Sales Overview</h2>
            <p style={{ color: "#6b7280" }}>
              Sales totals for the last six calendar months.
            </p>

            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "16px",
                height: "220px",
                paddingTop: "16px",
              }}
            >
              {monthlySales.map((month, index) => {
                const height = (month.amount / maxSales) * 160;

                return (
                  <div
                    key={`${month.label}-${index}`}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        textAlign: "center",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {month.amount.toLocaleString("en-PK")}
                    </span>

                    <div
                      title={formatMoney(month.amount)}
                      style={{
                        width: "100%",
                        maxWidth: "70px",
                        height: `${Math.max(height, 4)}px`,
                        background: "#3b82f6",
                        borderRadius: "6px 6px 0 0",
                      }}
                    />

                    <span style={{ fontSize: "12px" }}>
                      {month.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SALES TRANSACTIONS */}
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Sales Transactions</h2>

            {sales.length === 0 ? (
              <p style={{ color: "#6b7280" }}>
                No sales records found yet.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    textAlign: "left",
                    whiteSpace: "nowrap",
                  }}
                >
                  <thead>
                    <tr>
                      {[
                        "ID",
                        "Customer",
                        "Product",
                        "Date",
                        "Total",
                        "Paid",
                        "Due",
                      ].map((heading) => (
                        <th
                          key={heading}
                          style={{
                            padding: "12px",
                            borderBottom: "1px solid #e5e7eb",
                            color: "#6b7280",
                          }}
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {[...sales]
                      .sort((a, b) => b.id - a.id)
                      .map((sale) => (
                        <tr key={sale.id}>
                          <td style={{ padding: "12px" }}>{sale.id}</td>
                          <td style={{ padding: "12px" }}>{sale.customer}</td>
                          <td style={{ padding: "12px" }}>{sale.product}</td>
                          <td style={{ padding: "12px" }}>
                            {sale.date &&
                            !Number.isNaN(new Date(sale.date).getTime())
                              ? new Date(sale.date).toLocaleDateString()
                              : "—"}
                          </td>
                          <td style={{ padding: "12px" }}>
                            {formatMoney(sale.amount)}
                          </td>
                          <td style={{ padding: "12px", color: "#16a34a" }}>
                            {formatMoney(sale.paid)}
                          </td>
                          <td style={{ padding: "12px", color: "#dc2626" }}>
                            {formatMoney(
                              Math.max(0, sale.amount - sale.paid)
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default Reports;