import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { BarChart, DonutChart, ProgressList } from "../components/Charts";
import {
  AlertIcon,
  ChartIcon,
  CheckCircleIcon,
  DownloadIcon,
  PrinterIcon,
  RefreshIcon,
  SearchIcon,
  TrendingUpIcon,
  WalletIcon,
} from "../components/Icon";
import { useToast } from "../components/Toast";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  PageStack,
  SearchInput,
  StatCard,
} from "../components/ui";
import { buildMonthlySeries, formatCompactMoney, formatMoney, formatNumber } from "../lib/format";
import { formatDate } from "../lib/date";
import {
  aggregateBy,
  computeLineTotals,
  resolveName,
  toNumber,
  topEntries,
} from "../lib/inventory";

type ReportSale = {
  id: number;
  customerId: number;
  productId: number;
  customer: string;
  product: string;
  amount: number;
  paid: number;
  due: number;
  date: string;
};

export default function Reports() {
  const toast = useToast();

  const [sales, setSales] = useState<ReportSale[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      /**
       * FIX: the previous version read `sales.customer` / `sales.product`,
       * which do not exist on the table (it stores `customer_id` and
       * `product_id`). Every row therefore rendered as "Walk-in Customer" and
       * "Product", and the top-product / top-customer charts collapsed into a
       * single meaningless bucket. The names are now joined explicitly.
       */
      const [salesResult, customersResult, productsResult] = await Promise.all([
        supabase
          .from("sales")
          .select(
            "id, customer_id, product_id, quantity, total_amount, paid_amount, sale_date"
          )
          .order("id", { ascending: false }),

        supabase.from("customers").select("id, name"),
        supabase.from("products").select("id, name"),
      ]);

      if (salesResult.error) throw salesResult.error;

      const customerNames = new Map<number, string>();
      const productNames = new Map<number, string>();

      for (const row of customersResult.data ?? []) {
        customerNames.set(toNumber(row.id), String(row.name ?? ""));
      }

      for (const row of productsResult.data ?? []) {
        productNames.set(toNumber(row.id), String(row.name ?? ""));
      }

      const rows: ReportSale[] = (salesResult.data ?? []).map((item) => {
        const { total, paid, due } = computeLineTotals(
          item.total_amount,
          item.paid_amount
        );

        return {
          id: toNumber(item.id),
          customerId: toNumber(item.customer_id),
          productId: toNumber(item.product_id),
          customer: resolveName(customerNames, item.customer_id, "Customer"),
          product: resolveName(productNames, item.product_id, "Product"),
          amount: total,
          paid,
          due,
          date: String(item.sale_date ?? ""),
        };
      });

      setSales(rows);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load sales reports."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const totals = useMemo(() => {
    const totalSales = rowsTotal(sales, "amount");
    const totalPaid = rowsTotal(sales, "paid");
    const totalDue = rowsTotal(sales, "due");

    const best = sales.reduce<ReportSale | null>(
      (top, sale) => (!top || sale.amount > top.amount ? sale : top),
      null
    );

    return {
      totalSales,
      totalPaid,
      totalDue,
      average: sales.length ? totalSales / sales.length : 0,
      best,
      settled: sales.filter((sale) => sale.due <= 0).length,
    };
  }, [sales]);

  const monthlySales = useMemo(
    () =>
      buildMonthlySeries(
        sales.map((sale) => ({ amount: sale.amount, date: sale.date })),
        { months: 6 }
      ),
    [sales]
  );

  const topProducts = useMemo(
    () =>
      topEntries(
        aggregateBy(sales, (sale) => sale.product, (sale) => sale.amount),
        6
      ).map((entry) => ({
        ...entry,
        display: formatCompactMoney(entry.value),
      })),
    [sales]
  );

  const topCustomers = useMemo(
    () =>
      topEntries(
        aggregateBy(sales, (sale) => sale.customer, (sale) => sale.amount),
        6
      ).map((entry) => ({
        ...entry,
        display: formatCompactMoney(entry.value),
      })),
    [sales]
  );

  const filteredSales = useMemo(() => {
    const term = search.toLowerCase().trim();

    if (!term) return sales;

    return sales.filter(
      (sale) =>
        sale.customer.toLowerCase().includes(term) ||
        sale.product.toLowerCase().includes(term) ||
        sale.date.toLowerCase().includes(term)
    );
  }, [sales, search]);

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
      sale.due,
      sale.date,
    ]);

    const escapeCSV = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`;

    const csv = [header, ...rows]
      .map((row) => row.map(escapeCSV).join(","))
      .join("\n");

    const blob = new Blob(["﻿" + csv], {
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

    toast.success("Export ready", "Your CSV report has been downloaded.");
  }

  function printReport() {
    window.print();
  }

  const exportDisabled = loading || !!error || sales.length === 0;

  return (
    <main className="page-content">
      <PageStack>
        <PageHeader
          title="Reports & Analytics"
          description="Monitor sales performance, collections and outstanding balances."
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => void loadReports()}
                disabled={loading}
              >
                <RefreshIcon size={15} />
                Refresh
              </Button>

              <Button
                variant="secondary"
                onClick={printReport}
                disabled={exportDisabled}
              >
                <PrinterIcon size={15} />
                Print
              </Button>

              <Button
                variant="primary"
                onClick={exportCSV}
                disabled={exportDisabled}
              >
                <DownloadIcon size={15} />
                Export CSV
              </Button>
            </>
          }
        />

        {error ? (
          <div className="alert alert-error" role="alert">
            <AlertIcon size={16} />

            <div className="alert-content">
              <strong>Could not load reports</strong>
              {error}
              <span style={{ display: "block", marginTop: 4, opacity: 0.8 }}>
                Check your Supabase sales table and its access permissions.
              </span>
            </div>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => void loadReports()}
            >
              Retry
            </Button>
          </div>
        ) : null}

        <div className="stat-grid">
          <StatCard
            label="Total sales"
            value={formatMoney(totals.totalSales, 0)}
            tone="lavender"
            icon={<TrendingUpIcon size={16} />}
            loading={loading}
            meta={`${formatNumber(sales.length)} recorded transactions`}
          />

          <StatCard
            label="Total received"
            value={formatMoney(totals.totalPaid, 0)}
            tone="mint"
            icon={<CheckCircleIcon size={16} />}
            loading={loading}
            meta={`${formatNumber(totals.settled)} fully settled`}
          />

          <StatCard
            label="Outstanding dues"
            value={formatMoney(totals.totalDue, 0)}
            tone="pink"
            icon={<WalletIcon size={16} />}
            loading={loading}
            meta="Calculated from sales"
          />

          <StatCard
            label="Average sale"
            value={formatMoney(totals.average, 0)}
            tone="sky"
            icon={<ChartIcon size={16} />}
            loading={loading}
            meta="Per transaction"
          />
        </div>

        {loading ? (
          <Card>
            <div className="loading-block">
              <span className="spinner" />
              Loading reports…
            </div>
          </Card>
        ) : (
          <>
            <div className="chart-grid">
              <Card>
                <CardHeader
                  title="Sales overview"
                  description="Sales totals for the last six calendar months"
                  actions={
                    totals.best ? (
                      <Badge tone="lavender">
                        Best: {formatCompactMoney(totals.best.amount)}
                      </Badge>
                    ) : null
                  }
                />

                <CardBody>
                  <BarChart
                    data={monthlySales.map((month) => ({
                      label: month.label,
                      value: month.amount,
                      hint: formatCompactMoney(month.amount),
                    }))}
                    emptyLabel="No sales recorded in the last six months."
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Payment split"
                  description="Received versus outstanding across all sales"
                />

                <CardBody>
                  <DonutChart
                    slices={[
                      {
                        label: "Received",
                        value: totals.totalPaid,
                        color: "#7C3AED",
                      },
                      {
                        label: "Outstanding",
                        value: totals.totalDue,
                        color: "#F9A8D4",
                      },
                    ]}
                    centerValue={formatCompactMoney(totals.totalSales)}
                    centerLabel="total billed"
                  />
                </CardBody>
              </Card>
            </div>

            <div className="split-grid">
              <Card>
                <CardHeader
                  title="Revenue by product"
                  description="Best performing items by billed value"
                />

                <CardBody>
                  <ProgressList items={topProducts} />
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title="Revenue by customer"
                  description="Highest value accounts"
                />

                <CardBody>
                  <ProgressList items={topCustomers} />
                </CardBody>
              </Card>
            </div>

            <Card>
              <CardHeader
                title="Sales transactions"
                description={`${filteredSales.length} of ${sales.length} records shown`}
                actions={
                  <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder="Search reports..."
                    label="Search report records"
                  />
                }
              />

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Customer</th>
                      <th>Product</th>
                      <th>Date</th>
                      <th className="num">Total</th>
                      <th className="num">Paid</th>
                      <th className="num">Due</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredSales.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="table-empty-cell">
                          <EmptyState
                            icon={<SearchIcon size={20} />}
                            title={
                              sales.length === 0
                                ? "No sales records yet"
                                : "No matching records"
                            }
                            description={
                              sales.length === 0
                                ? "Transactions will appear here as soon as you record a sale."
                                : "Try a different search term."
                            }
                          />
                        </td>
                      </tr>
                    ) : (
                      filteredSales.map((sale) => (
                        <tr key={sale.id}>
                          <td className="cell-muted">#{sale.id}</td>
                          <td className="cell-primary">{sale.customer}</td>
                          <td>{sale.product}</td>
                          <td className="cell-muted">{formatDate(sale.date)}</td>
                          <td className="num cell-strong">
                            {formatMoney(sale.amount)}
                          </td>
                          <td className="num money-pos">
                            {formatMoney(sale.paid)}
                          </td>
                          <td className="num">
                            {sale.due > 0 ? (
                              <span className="money-neg">
                                {formatMoney(sale.due)}
                              </span>
                            ) : (
                              <span className="cell-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </PageStack>
    </main>
  );
}

function rowsTotal(
  sales: ReportSale[],
  key: "amount" | "paid" | "due"
): number {
  return sales.reduce((sum, sale) => sum + sale[key], 0);
}