import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import { BarChart, DonutChart, ProgressList } from "../components/Charts";
import {
  AlertIcon,
  BoxesIcon,
  DatabaseIcon,
  PackageIcon,
  RefreshIcon,
  ShoppingCartIcon,
  SparkIcon,
  TagIcon,
  TruckIcon,
  TrendingUpIcon,
  UsersIcon,
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
  SkeletonRows,
  StatCard,
} from "../components/ui";
import {
  buildMonthlySeries,
  formatCompactMoney,
  formatMoney,
  formatNumber,
  toNumber,
} from "../lib/format";
import { formatDate } from "../lib/date";
import {
  aggregateBy,
  computeLineTotals,
  computeStockValue,
  resolveName,
  resolveStockStatus,
  topEntries,
} from "../lib/inventory";
import type { PageId } from "../lib/navigation";

type ProductRow = {
  id: number;
  name: string;
  supplier: string | null;
  stock: number | null;
  minimum_stock: number | null;
  price: number | null;
  purchase_price: number | null;
};

type SaleRow = {
  id: number;
  customer_id: number | null;
  product_id: number | null;
  quantity: number | null;
  total_amount: number | null;
  paid_amount: number | null;
  due_amount: number | null;
  sale_date: string | null;
};

type NameRow = {
  id: number;
  name: string;
};

const CURRENT_YEAR = new Date().getFullYear();

export default function Dashboard({
  onNavigate,
}: {
  onNavigate: (page: PageId) => void;
}) {
  const toast = useToast();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [customers, setCustomers] = useState<NameRow[]>([]);
  const [customerCount, setCustomerCount] = useState(0);
  const [supplierCount, setSupplierCount] = useState(0);
  const [creditOutstanding, setCreditOutstanding] = useState(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [creditWarning, setCreditWarning] = useState("");

  const inFlight = useRef(false);

  const loadDashboard = useCallback(
    async (silent = false) => {
      // Prevent overlapping refreshes from racing each other's state writes.
      if (inFlight.current) return;
      inFlight.current = true;

      if (silent) setRefreshing(true);
      else setLoading(true);

      setError("");

      try {
        const [productsResult, salesResult, customersResult, customersHead, suppliersHead, duesResult] =
          await Promise.all([
            supabase
              .from("products")
              .select(
                "id, name, supplier, stock, minimum_stock, price, purchase_price"
              )
              .order("name", { ascending: true }),

            supabase
              .from("sales")
              .select(
                "id, customer_id, product_id, quantity, total_amount, paid_amount, due_amount, sale_date"
              )
              .order("sale_date", { ascending: false }),

            supabase.from("customers").select("id, name").order("id"),

            supabase.from("customers").select("*", { count: "exact", head: true }),

            supabase.from("suppliers").select("*", { count: "exact", head: true }),

            supabase.from("dues").select("remaining_due"),
          ]);

        if (productsResult.error) {
          throw new Error(`Products: ${productsResult.error.message}`);
        }

        if (salesResult.error) {
          throw new Error(`Sales: ${salesResult.error.message}`);
        }

        if (customersResult.error) {
          throw new Error(`Customers: ${customersResult.error.message}`);
        }

        /**
         * FIX: the credit ledger is supplementary. Previously a failure here
         * threw and blanked the entire dashboard, even though every other
         * figure was loaded fine. It now degrades to zero and reports why.
         */
        if (duesResult.error) {
          setCreditWarning(duesResult.error.message);
          setCreditOutstanding(0);
        } else {
          setCreditWarning("");
          setCreditOutstanding(
            (duesResult.data ?? []).reduce(
              (sum: number, row: { remaining_due: number | null }) =>
                sum + toNumber(row.remaining_due),
              0
            )
          );
        }

        if (customersHead.error) setCustomerCount(0);
        else setCustomerCount(customersHead.count ?? 0);

        if (suppliersHead.error) setSupplierCount(0);
        else setSupplierCount(suppliersHead.count ?? 0);

        setProducts((productsResult.data ?? []) as ProductRow[]);
        setSales((salesResult.data ?? []) as SaleRow[]);
        setCustomers((customersResult.data ?? []) as NameRow[]);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load dashboard data."
        );
      } finally {
        inFlight.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  /* ----------------------------- derived ----------------------------- */

  const productById = useMemo(() => {
    const map = new Map<number, ProductRow>();

    products.forEach((product) => map.set(Number(product.id), product));

    return map;
  }, [products]);

  /** id -> display name lookups shared by every aggregation on this page. */
  const productByIdNames = useMemo(
    () =>
      new Map(
        products.map((product) => [Number(product.id), String(product.name ?? "")])
      ),
    [products]
  );

  const customerByIdNames = useMemo(
    () =>
      new Map(
        customers.map((customer) => [
          Number(customer.id),
          String(customer.name ?? ""),
        ])
      ),
    [customers]
  );

  const metrics = useMemo(() => {
    let revenue = 0;
    let collected = 0;
    let outstanding = 0;
    let unitsSold = 0;

    sales.forEach((sale) => {
      // Recompute rather than trusting the stored due_amount, so float drift
      // in the database can never skew the headline figures.
      const totals = computeLineTotals(sale.total_amount, sale.paid_amount);

      revenue += totals.total;
      collected += totals.paid;
      outstanding += totals.due;
      unitsSold += toNumber(sale.quantity);
    });

    let retailValue = 0;
    let costValue = 0;
    let totalUnits = 0;

    products.forEach((product) => {
      const stock = toNumber(product.stock);

      retailValue += computeStockValue(stock, product.price);
      costValue += computeStockValue(stock, product.purchase_price);
      totalUnits += stock;
    });

    // Cost of goods sold: purchase cost of every unit that has been sold.
    const costOfGoodsSold = sales.reduce((sum, sale) => {
      const product = productById.get(Number(sale.product_id));

      return sum + toNumber(sale.quantity) * toNumber(product?.purchase_price);
    }, 0);

    const lowStock = products.filter(
      (product) =>
        toNumber(product.stock) > 0 &&
        resolveStockStatus(product.stock, product.minimum_stock) === "low"
    );

    const outOfStock = products.filter(
      (product) => resolveStockStatus(product.stock, product.minimum_stock) === "out"
    );

    return {
      revenue,
      collected,
      outstanding,
      unitsSold,
      retailValue,
      costValue,
      costOfGoodsSold,
      totalUnits,
      lowStock,
      outOfStock,
    };
  }, [products, sales, productById]);

  const monthlySeries = useMemo(
    () =>
      buildMonthlySeries(
        sales.map((sale) => ({
          amount: toNumber(sale.total_amount),
          date: sale.sale_date ?? "",
        })),
        { withinYear: true }
      ),
    [sales]
  );

const topProducts = useMemo(
    () =>
      topEntries(
        aggregateBy(
          sales,
          (sale) =>
            resolveName(productByIdNames, sale.product_id, "Product"),
          (sale) => toNumber(sale.total_amount)
        ),
        6
      ).map((entry) => ({
        ...entry,
        display: formatCompactMoney(entry.value),
      })),
    [sales, productByIdNames]
  );

  const topCustomers = useMemo(
    () =>
      topEntries(
        aggregateBy(
          sales,
          (sale) =>
            resolveName(customerByIdNames, sale.customer_id, "Customer"),
          (sale) => toNumber(sale.total_amount)
        ),
        6
      ).map((entry) => ({
        ...entry,
        display: formatCompactMoney(entry.value),
      })),
    [sales, customerByIdNames]
  );

  const recentSales = useMemo(
    () =>
      sales.slice(0, 6).map((sale) => {
        const totals = computeLineTotals(sale.total_amount, sale.paid_amount);

        return {
          id: Number(sale.id),
          customer: resolveName(
            customerByIdNames,
            sale.customer_id,
            "Customer"
          ),
          product: resolveName(productByIdNames, sale.product_id, "Product"),
          amount: totals.total,
          due: totals.due,
          date: sale.sale_date ?? "",
        };
      }),
    [sales, customerByIdNames, productByIdNames]
  );

  const collectionSlices = [
    { label: "Collected", value: metrics.collected, color: "#7C3AED" },
    { label: "Outstanding", value: metrics.outstanding, color: "#F9A8D4" },
  ];

  const collectionRate =
    metrics.revenue > 0 ? (metrics.collected / metrics.revenue) * 100 : 0;

  async function testConnection() {
    const { error: probeError } = await supabase
      .from("products")
      .select("id")
      .limit(1);

    if (probeError) {
      toast.error("Database connection failed", probeError.message);
      return;
    }

    toast.success("Supabase connected successfully");
  }

  /* ------------------------------ render ----------------------------- */

  const quickActions: { label: string; page: PageId; icon: React.ReactNode }[] = [
    { label: "Add product", page: "products", icon: <PackageIcon size={16} /> },
    { label: "New sale", page: "sales", icon: <ShoppingCartIcon size={16} /> },
    { label: "Add customer", page: "customers", icon: <UsersIcon size={16} /> },
    { label: "Add supplier", page: "suppliers", icon: <TruckIcon size={16} /> },
    { label: "Add category", page: "categories", icon: <TagIcon size={16} /> },
    { label: "Record a due", page: "dues", icon: <WalletIcon size={16} /> },
  ];

  return (
    <main className="page-content">
      <PageStack>
        <PageHeader
          title="Overview"
          description="Live figures from your Supabase workspace — updated every time you refresh."
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => void testConnection()}
                disabled={loading}
              >
                <DatabaseIcon size={15} />
                Test connection
              </Button>

              <Button
                variant="primary"
                onClick={() => void loadDashboard(true)}
                disabled={loading || refreshing}
              >
                <RefreshIcon size={15} />
                {refreshing ? "Refreshing..." : "Refresh"}
              </Button>
            </>
          }
        />

        {error ? (
          <div className="alert alert-error" role="alert">
            <AlertIcon size={16} />

            <div className="alert-content">
              <strong>Dashboard data error</strong>
              {error}
            </div>

            <Button
              size="sm"
              variant="secondary"
              onClick={() => void loadDashboard()}
            >
              Retry
            </Button>
          </div>
        ) : null}

        {creditWarning ? (
          <div className="alert alert-warning" role="status">
            <AlertIcon size={16} />
            <div className="alert-content">
              <strong>Credit ledger unavailable</strong>
              The credit figures below could not be loaded ({creditWarning}).
              Revenue and inventory data are unaffected.
            </div>
          </div>
        ) : null}

        <div className="stat-grid">
          <StatCard
            label="Revenue"
            value={formatMoney(metrics.revenue, 0)}
            tone="lavender"
            icon={<TrendingUpIcon size={16} />}
            loading={loading}
            meta={`${collectionRate.toFixed(0)}% collected`}
          />

          <StatCard
            label="Sales"
            value={formatNumber(sales.length)}
            tone="pink"
            icon={<ShoppingCartIcon size={16} />}
            loading={loading}
            meta={`${formatNumber(metrics.unitsSold)} units sold`}
          />

          <StatCard
            label="Purchases"
            value={formatMoney(metrics.costValue, 0)}
            tone="sky"
            icon={<TruckIcon size={16} />}
            loading={loading}
            meta={`${formatMoney(metrics.costOfGoodsSold, 0)} cost of goods sold`}
          />

          <StatCard
            label="Inventory value"
            value={formatMoney(metrics.retailValue, 0)}
            tone="mint"
            icon={<BoxesIcon size={16} />}
            loading={loading}
            meta={`${formatNumber(metrics.totalUnits)} units on hand`}
          />

          <StatCard
            label="Low stock"
            value={formatNumber(metrics.lowStock.length)}
            tone="yellow"
            icon={<AlertIcon size={16} />}
            loading={loading}
            meta={`${metrics.outOfStock.length} out of stock`}
          />
        </div>

        <div className="chart-grid">
          <Card>
            <CardHeader
              title="Revenue & sales trend"
              description={`Monthly billed revenue across ${CURRENT_YEAR}`}
              actions={
                <Badge tone="lavender">
                  {formatCompactMoney(metrics.revenue)} YTD
                </Badge>
              }
            />

            <CardBody>
              <BarChart
                data={monthlySeries.map((point) => ({
                  label: point.label,
                  value: point.amount,
                  hint: formatCompactMoney(point.amount),
                }))}
                emptyLabel="No sales recorded for this year yet."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Cash collection"
              description="Billed versus collected across all sales"
            />

            <CardBody>
              <DonutChart
                slices={collectionSlices}
                centerValue={`${collectionRate.toFixed(0)}%`}
                centerLabel="collected"
              />

              <div className="metric-strip">
                <div className="metric-item">
                  <span>Collected</span>
                  <strong>{formatMoney(metrics.collected, 0)}</strong>
                </div>

                <div className="metric-item">
                  <span>Outstanding</span>
                  <strong>{formatMoney(metrics.outstanding, 0)}</strong>
                </div>

                <div className="metric-item">
                  <span>Credit ledger</span>
                  <strong>{formatMoney(creditOutstanding, 0)}</strong>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="split-grid">
          <Card>
            <CardHeader
              title="Top selling products"
              description="Ranked by revenue contribution"
              actions={
                <Button size="sm" variant="ghost" onClick={() => onNavigate("products")}>
                  View catalogue
                </Button>
              }
            />

            <CardBody>
              <ProgressList items={topProducts} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Top customers"
              description="Highest value accounts by revenue"
              actions={
                <Button size="sm" variant="ghost" onClick={() => onNavigate("customers")}>
                  View customers
                </Button>
              }
            />

            <CardBody>
              <ProgressList items={topCustomers} />
            </CardBody>
          </Card>
        </div>

        <div className="split-grid">
          <Card>
            <CardHeader
              title="Low stock products"
              description="Items at or below their minimum level"
              actions={
                <Button size="sm" variant="ghost" onClick={() => onNavigate("products")}>
                  Manage stock
                </Button>
              }
            />

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Supplier</th>
                    <th className="num">Stock</th>
                    <th className="num">Minimum</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <SkeletonRows rows={5} />
                  ) : metrics.lowStock.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="table-empty-cell">
                        <EmptyState
                          icon={<PackageIcon size={20} />}
                          title="Stock levels are healthy"
                          description="No product has reached its minimum stock threshold."
                          action={
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => onNavigate("products")}
                            >
                              Review products
                            </Button>
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    metrics.lowStock.map((product) => {
                      const stock = toNumber(product.stock);
                      const minimum = toNumber(product.minimum_stock);
                      const out = stock <= 0;

                      return (
                        <tr key={product.id}>
                          <td className="cell-primary">{product.name}</td>
                          <td className="cell-muted">
                            {product.supplier || "—"}
                          </td>
                          <td className="num cell-strong">{stock}</td>
                          <td className="num">{minimum}</td>
                          <td>
                            <Badge tone={out ? "pink" : "yellow"}>
                              {out ? "Out of stock" : "Low stock"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Recent transactions"
              description="Your six latest sales"
              actions={
                <Button size="sm" variant="ghost" onClick={() => onNavigate("sales")}>
                  All sales
                </Button>
              }
            />

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th className="num">Amount</th>
                    <th className="num">Date</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <SkeletonRows rows={5} />
                  ) : recentSales.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="table-empty-cell">
                        <EmptyState
                          icon={<ShoppingCartIcon size={20} />}
                          title="No sales recorded yet"
                          description="Create your first sale and it will appear here instantly."
                          action={
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => onNavigate("sales")}
                            >
                              New sale
                            </Button>
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    recentSales.map((sale) => (
                      <tr key={sale.id}>
                        <td>
                          <span className="cell-stack">
                            <strong>{sale.customer}</strong>
                            <small>{sale.product}</small>
                          </span>
                        </td>
                        <td className="num cell-strong">
                          {formatMoney(sale.amount, 0)}
                          {sale.due > 0 ? (
                            <small
                              style={{
                                display: "block",
                                color: "var(--danger)",
                                fontSize: 11.5,
                              }}
                            >
                              {formatMoney(sale.due, 0)} due
                            </small>
                          ) : null}
                        </td>
                        <td className="num cell-muted">
                          {formatDate(sale.date)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="equal-grid">
          <Card>
            <CardHeader
              title="Workspace snapshot"
              description="Records currently visible in your account"
            />

            <CardBody>
              <div className="metric-strip" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
                <div className="metric-item">
                  <span>Products</span>
                  <strong>{formatNumber(products.length)}</strong>
                </div>

                <div className="metric-item">
                  <span>Customers</span>
                  <strong>{formatNumber(customerCount)}</strong>
                </div>

                <div className="metric-item">
                  <span>Suppliers</span>
                  <strong>{formatNumber(supplierCount)}</strong>
                </div>

                <div className="metric-item">
                  <span>Average sale</span>
                  <strong>
                    {formatMoney(
                      sales.length ? metrics.revenue / sales.length : 0,
                      0
                    )}
                  </strong>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Quick actions"
              description="Jump straight into the most common tasks"
            />

            <CardBody>
              <div className="quick-grid">
                {quickActions.map((action) => (
                  <button
                    key={action.label + action.page}
                    type="button"
                    className="quick-action"
                    onClick={() => onNavigate(action.page)}
                  >
                    {action.icon}
                    {action.label}
                  </button>
                ))}

                <button
                  type="button"
                  className="quick-action"
                  onClick={() => void loadDashboard(true)}
                >
                  <SparkIcon size={16} />
                  Refresh metrics
                </button>
              </div>
            </CardBody>
          </Card>
        </div>
      </PageStack>
    </main>
  );
}