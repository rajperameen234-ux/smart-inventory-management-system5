import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";
import { useToast } from "../components/Toast";
import { BarChart, type SeriesPoint } from "../components/Charts";
import {
  AlertIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  InfoIcon,
  RefreshIcon,
  ShoppingCartIcon,
  TrendingUpIcon,
  WalletIcon,
} from "../components/Icon";
import {
  EmptyState,
  PageHeader,
  PageStack,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  SkeletonRows,
  StatCard,
  Badge,
  Button,
} from "../components/ui";
import {
  buildMonthlySeries,
  formatDate,
  formatMoney,
  formatNumber,
  toNumber,
} from "../lib/format";
import { roundMoney } from "../lib/inventory";
import {
  buildDailySeries,
  computeSaleProfit,
  computeUnitProfit,
  dateInRange,
  resolveDateRange,
  sumsSalesProfit,
  type RangePreset,
} from "../lib/profit";

type ProfitRow = {
  id: number;
  productId: number;
  productName: string;
  customerId: number;
  customerName: string;
  quantity: number;
  unitPrice: number | null;
  unitCost: number | null;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  date: string;
};

type ProductSlice = {
  productId: number;
  productName: string;
  units: number;
  billed: number;
  costOfGoods: number;
  grossProfit: number;
  marginPercent: number;
};

type PresetOption = { value: RangePreset; label: string };

const PRESETS: PresetOption[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 days" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Previous month" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
];

export default function Profit() {
  const toast = useToast();

  const [sales, setSales] = useState<ProfitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [preset, setPreset] = useState<RangePreset>("last7");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true);
      setError("");

      const [salesResult, productsResult] = await Promise.all([
        supabase.from("sales").select(`
          id, product_id, customer_id, quantity, total_amount, paid_amount,
          discount, sale_date, unit_price, unit_cost, product_name,
          customers(name)
        `).order("id", { ascending: true }),

        supabase.from("products").select(`
          id, name, purchase_price
        `).order("id", { ascending: true }),
      ]);

      if (salesResult.error) {
        console.error("Load Profit Sales Error:", salesResult.error);
        setError(salesResult.error.message);
        setLoading(false);
        toast.error("Could not load profit report", salesResult.error.message);
        return;
      }

      if (productsResult.error) {
        // The report still works without the product list; only the
        // legacy-row cost fallback degrades.
        console.error("Load Profit Products Error:", productsResult.error);
        toast.error(
          "Products could not be loaded",
          productsResult.error.message
        );
      }

      const mappedProducts = new Map(
        (productsResult.data ?? []).map((row) => [
          toNumber(row.id),
          {
            name: String(row.name ?? ""),
            purchasePrice: toNumber(row.purchase_price),
          },
        ])
      );

      setSales(
        (salesResult.data ?? []).map((row) => {
          // Sales carry their product snapshot (product_name) frozen at the
          // moment of the sale; fall back to the joined product, then a label.
          const joined = (row as { customers?: { name: unknown }[] }).customers;
          const customerId = toNumber(row.customer_id);
          const productId = toNumber(row.product_id);
          const date = String(row.sale_date ?? "");
          const quantity = toNumber(row.quantity);
          const totalAmount = toNumber(row.total_amount);
          const hasUnitPrice = row.unit_price !== null;
          const unitPrice = hasUnitPrice
            ? roundMoney(toNumber(row.unit_price))
            // Legacy pre-migration rows: derive price from the final amount.
            : quantity > 0
              ? roundMoney(totalAmount / quantity)
              : totalAmount;

          return {
            id: toNumber(row.id),
            productId,
            productName:
              row.product_name ??
              mappedProducts.get(productId)?.name ??
              "Product",
            customerId,
            customerName: joined?.[0]?.name
              ? String(joined[0].name)
              : customerId
                ? `Customer #${customerId}`
                : "Walk-in",
            quantity,
            unitPrice: hasUnitPrice ? unitPrice : null,
            unitCost:
              row.unit_cost !== null
                ? roundMoney(toNumber(row.unit_cost))
                : mappedProducts.get(productId)?.purchasePrice ?? null,
            discount: roundMoney(toNumber(row.discount)),
            totalAmount,
            paidAmount: toNumber(row.paid_amount),
            date,
          };
        })
      );

      setLoading(false);
    };

    void loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const filteredSales = useMemo(() => {
    const range = resolveDateRange(preset, {
      start: customStart,
      end: customEnd,
    });

    return sales.filter((sale) => dateInRange(sale.date, range));
  }, [sales, preset, customStart, customEnd]);

  const totals = useMemo(() => sumsSalesProfit(filteredSales), [filteredSales]);

  const collected = useMemo(
    () => roundMoney(filteredSales.reduce((sum, sale) => sum + sale.paidAmount, 0)),
    [filteredSales]
  );

  const outstanding = useMemo(
    () => roundMoney(Math.max(0, totals.billed - collected)),
    [totals.billed, collected]
  );

  const todayProfit = useMemo(() => {
    const todayRange = resolveDateRange("today");

    return sumsSalesProfit(
      sales.filter((sale) => dateInRange(sale.date, todayRange))
    ).grossProfit;
  }, [sales]);

  const monthProfit = useMemo(() => {
    const monthRange = resolveDateRange("thisMonth");

    return sumsSalesProfit(
      sales.filter((sale) => dateInRange(sale.date, monthRange))
    ).grossProfit;
  }, [sales]);

  const productSlices = useMemo<ProductSlice[]>(() => {
    const buckets = new Map<
      number,
      { name: string; units: number; billed: number; cost: number }
    >();

    filteredSales.forEach((sale) => {
      const profit = computeSaleProfit({
        quantity: sale.quantity,
        totalAmount: sale.totalAmount,
        unitCost: sale.unitCost,
      });

      const bucket = buckets.get(sale.productId) ?? {
        name: sale.productName,
        units: 0,
        billed: 0,
        cost: 0,
      };

      buckets.set(sale.productId, {
        name: sale.productName,
        units: bucket.units + profit.units,
        billed: roundMoney(bucket.billed + profit.finalAmount),
        cost: roundMoney(bucket.cost + profit.costOfGoods),
      });
    });

    return [...buckets.entries()]
      .map(([productId, bucket]) => {
        const grossProfit = roundMoney(bucket.billed - bucket.cost);

        return {
          productId,
          productName: bucket.name,
          units: bucket.units,
          billed: bucket.billed,
          costOfGoods: bucket.cost,
          grossProfit,
          marginPercent:
            bucket.billed > 0
              ? roundMoney((grossProfit / bucket.billed) * 100)
              : 0,
        };
      })
      .sort((a, b) => b.grossProfit - a.grossProfit);
  }, [filteredSales]);

  // The chart always shows the last 14 days so the rhythm of the business
  // stays visible even while the table above is filtered tighter.
  const dailySeries = useMemo<SeriesPoint[]>(
    () =>
      buildDailySeries(
        sales.map((sale) => ({
          amount: computeSaleProfit({
            quantity: sale.quantity,
            totalAmount: sale.totalAmount,
            unitCost: sale.unitCost,
          }).grossProfit,
          date: sale.date,
        }))
      ).map((point) => ({ label: point.label, value: point.amount })),
    [sales]
  );

  const monthlySeries = useMemo<SeriesPoint[]>(
    () =>
      buildMonthlySeries(
        sales.map((sale) => ({
          amount: computeSaleProfit({
            quantity: sale.quantity,
            totalAmount: sale.totalAmount,
            unitCost: sale.unitCost,
          }).grossProfit,
          date: sale.date,
        })),
        { withinYear: true }
      ).map((point) => ({ label: point.label, value: point.amount })),
    [sales]
  );

  const rangeLabel = useMemo(() => {
    if (preset === "all") return "All recorded sales";

    const range = resolveDateRange(preset, {
      start: customStart,
      end: customEnd,
    });

    if (!range.start || !range.end) {
      return "Pick both custom dates to filter the report";
    }

    return `${formatDate(range.start)} — ${formatDate(range.end)}`;
  }, [preset, customStart, customEnd]);

  return (
    <main className="page-content">
      <PageStack>
        <PageHeader
          title="Profit"
          description="Gross profit earned from your actual sale history — billed vs. cost of goods."
          actions={
            <Button
              variant="secondary"
              onClick={() => window.location.reload()}
              disabled={loading}
            >
              <RefreshIcon size={15} />
              Refresh
            </Button>
          }
        />

        {error ? (
          <div className="alert alert-error" role="alert">
            <AlertIcon size={16} />
            <div className="alert-content">
              <strong>Could not load profit data</strong>
              {error}
            </div>
          </div>
        ) : null}

        <div className="alert alert-info" role="status">
          <InfoIcon size={16} />
          <div className="alert-content">
            <strong>Gross profit</strong>
            Profit shown here is sales value minus cost of goods (historical
            purchase prices frozen on each sale). Operating expenses are not
            tracked, so this is gross — not net — profit.
          </div>
        </div>

        <Card>
          <CardHeader
            title="Filter by date range"
            description={rangeLabel}
            actions={
              <div className="filter-chips">
                {PRESETS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`chip${preset === option.value ? " chip-active" : ""}`}
                    onClick={() => setPreset(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            }
          />

          {preset === "custom" ? (
            <CardBody>
              <div className="filter-row">
                <Field label="From">
                  <Input
                    type="date"
                    value={customStart}
                    onChange={(event) => setCustomStart(event.target.value)}
                  />
                </Field>

                <Field label="To">
                  <Input
                    type="date"
                    value={customEnd}
                    onChange={(event) => setCustomEnd(event.target.value)}
                  />
                </Field>
              </div>
            </CardBody>
          ) : null}
        </Card>

        <div className="stat-grid">
          <StatCard
            label="Billed sales"
            value={formatMoney(totals.billed, 0)}
            tone="lavender"
            icon={<ShoppingCartIcon size={16} />}
            loading={loading}
            meta={`${formatNumber(totals.units)} units across ${filteredSales.length} sales`}
          />

          <StatCard
            label="Collected"
            value={formatMoney(collected, 0)}
            tone="mint"
            icon={<WalletIcon size={16} />}
            loading={loading}
            meta="Cash actually received"
          />

          <StatCard
            label="Outstanding"
            value={formatMoney(outstanding, 0)}
            tone="yellow"
            icon={<AlertIcon size={16} />}
            loading={loading}
            meta="Billed but not collected"
          />

          <StatCard
            label="Cost of goods"
            value={formatMoney(totals.costOfGoods, 0)}
            tone="sky"
            icon={<CalendarIcon size={16} />}
            loading={loading}
            meta="Historical purchase cost"
          />

          <StatCard
            label="Gross profit"
            value={formatMoney(totals.grossProfit, 0)}
            tone="pink"
            icon={<TrendingUpIcon size={16} />}
            loading={loading}
            meta="Billed − cost of goods"
          />

          <StatCard
            label="Today's gross profit"
            value={formatMoney(todayProfit, 0)}
            tone="mint"
            icon={<CheckCircleIcon size={16} />}
            loading={loading}
            meta="Since midnight"
          />

          <StatCard
            label="This month's gross profit"
            value={formatMoney(monthProfit, 0)}
            tone="lavender"
            icon={<ClockIcon size={16} />}
            loading={loading}
            meta="Since the 1st"
          />
        </div>

        <Card>
          <CardHeader
            title="Gross profit — last 14 days"
            description="Daily profit including unpaid dues at their sale date"
          />

          <CardBody>
            <BarChart data={dailySeries} height={230} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Gross profit by month"
            description={`Current year (${new Date().getFullYear()})`}
          />

          <CardBody>
            <BarChart data={monthlySeries} height={230} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Product profitability"
            description="Ranked by gross profit in the selected range"
          />

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Units</th>
                  <th className="num">Billed</th>
                  <th className="num">Cost of goods</th>
                  <th className="num">Gross profit</th>
                  <th className="num">Margin</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <SkeletonRows rows={4} />
                ) : productSlices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-empty-cell">
                      <EmptyState
                        icon={<TrendingUpIcon size={20} />}
                        title="No sales in this range"
                        description="Record sales to see which products earn the most."
                      />
                    </td>
                  </tr>
                ) : (
                  productSlices.map((slice) => (
                    <tr key={slice.productId}>
                      <td className="cell-strong">{slice.productName}</td>

                      <td className="num">{formatNumber(slice.units)}</td>

                      <td className="num">{formatMoney(slice.billed)}</td>

                      <td className="num cell-muted">
                        {formatMoney(slice.costOfGoods)}
                      </td>

                      <td className="num cell-strong">
                        {formatMoney(slice.grossProfit)}
                      </td>

                      <td className="num">
                        <Badge tone={slice.marginPercent >= 20 ? "mint" : "yellow"}>
                          {slice.marginPercent.toFixed(1)}%
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Sale-wise profit detail"
            description={`Each sale's profit from its frozen unit price and unit cost · ${rangeLabel}`}
          />

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>Customer</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit price</th>
                  <th className="num">Unit cost</th>
                  <th className="num">Discount</th>
                  <th className="num">Final</th>
                  <th className="num">Gross profit</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <SkeletonRows rows={6} />
                ) : filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="table-empty-cell">
                      <EmptyState
                        icon={<ShoppingCartIcon size={20} />}
                        title="Nothing to analyse"
                        description="No sales fall inside the selected date range."
                      />
                    </td>
                  </tr>
                ) : (
                  [...filteredSales]
                    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))
                    .map((sale) => {
                      const profit = computeSaleProfit({
                        quantity: sale.quantity,
                        totalAmount: sale.totalAmount,
                        unitCost: sale.unitCost,
                      });

                      const unitProfit =
                        sale.unitPrice !== null && sale.unitCost !== null
                          ? computeUnitProfit(sale.unitCost, sale.unitPrice)
                          : null;

                      return (
                        <tr key={sale.id}>
                          <td className="cell-muted">{formatDate(sale.date)}</td>

                          <td className="cell-strong">{sale.productName}</td>

                          <td>{sale.customerName}</td>

                          <td className="num">{formatNumber(sale.quantity)}</td>

                          <td className="num">
                            {sale.unitPrice !== null ? formatMoney(sale.unitPrice) : "—"}
                            {unitProfit !== null ? (
                              <small
                                className={
                                  unitProfit >= 0 ? "money-pos" : "money-neg"
                                }
                                style={{ display: "block" }}
                              >
                                {unitProfit >= 0 ? "+" : ""}
                                {formatMoney(unitProfit, 0)}/unit
                              </small>
                            ) : null}
                          </td>

                          <td className="num cell-muted">
                            {sale.unitCost !== null ? formatMoney(sale.unitCost) : "—"}
                          </td>

                          <td className="num">
                            {sale.discount > 0 ? formatMoney(sale.discount) : "—"}
                          </td>

                          <td className="num cell-strong">
                            {formatMoney(sale.totalAmount)}
                          </td>

                          <td className="num">
                            <span
                              className={
                                profit.grossProfit >= 0
                                  ? "cell-strong money-pos"
                                  : "cell-strong money-neg"
                              }
                            >
                              {formatMoney(profit.grossProfit)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </PageStack>
    </main>
  );
}
