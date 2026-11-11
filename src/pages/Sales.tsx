import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { insertOwned, supabase } from "../supabase";
import { useToast } from "../components/Toast";
import {
  AlertIcon,
  CalendarIcon,
  CheckCircleIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  ShoppingCartIcon,
  TrashIcon,
  TrendingUpIcon,
  WalletIcon,
} from "../components/Icon";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageStack,
  SearchInput,
  Select,
  SkeletonRows,
  StatCard,
} from "../components/ui";
import { formatMoney, formatMoneyRaw, formatNumber, todayISODate } from "../lib/format";
import { formatDate, toDateInputValue } from "../lib/date";
import { useCurrency } from "../components/CurrencyProvider";
import {
  computeLineTotals,
  computeSaleAmounts,
  computeSaleStockEffects,
  resolveName,
  roundMoney,
  toNumber,
  validateSale,
} from "../lib/inventory";
import { isMissingFunction } from "../supabase";
import { computePaymentStatus, type PaymentStatus } from "../lib/profit";

type PaymentStatusLabel = PaymentStatus;

const STATUS_TONE: Record<PaymentStatusLabel, "mint" | "yellow" | "pink"> = {
  Paid: "mint",
  Partial: "yellow",
  Unpaid: "pink",
};

type Sale = {
  id: number;
  customerId: number;
  productId: number;
  customer: string;
  product: string;
  productName: string;
  quantity: number;
  unitPrice: number | null;
  unitCost: number | null;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  date: string;
  status: PaymentStatusLabel;
};

type Customer = {
  id: number;
  name: string;
};

type Product = {
  id: number;
  name: string;
  stock: number;
  sellingPrice: number;
  purchasePrice: number;
};

export default function Sales() {
  const toast = useToast();

  /**
   * Money inputs are typed in the SELECTED display currency and converted to
   * the base currency (PKR) exactly once when saving; edit forms are seeded
   * from the stored base amounts exactly once when opening.
   */
  const { currency, toPkr, toDisplay } = useCurrency();

  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Sale | null>(null);

  const [search, setSearch] = useState("");

  const [customerId, setCustomerId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [discount, setDiscount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [date, setDate] = useState("");

  // History filters: text, payment status and an inclusive date range.
  const [statusFilter, setStatusFilter] = useState("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Guards against overlapping loads and double submissions.
  const loadingRef = useLatch();
  const savingRef = useLatch();

  const loadAllData = async () => {
    if (!loadingRef.begin()) return;

    setLoading(true);
    setError("");

    try {
      const [customersResult, productsResult, salesResult] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name")
          .order("id", { ascending: true }),

        supabase
          .from("products")
          .select("id, name, stock, price, purchase_price")
          .order("id", { ascending: true }),

        supabase
          .from("sales")
          .select(`
            id,
            customer_id,
            product_id,
            quantity,
            total_amount,
            paid_amount,
            due_amount,
            sale_date,
            unit_price,
            unit_cost,
            discount,
            product_name
          `)
          .order("id", { ascending: true }),
      ]);

      const failure =
        customersResult.error ?? productsResult.error ?? salesResult.error;

      if (failure) {
        setError(failure.message);
        toast.error("Could not load sales", failure.message);
        return;
      }

      const customerList = (customersResult.data ?? []) as Customer[];

      const productList = (productsResult.data ?? []).map((product) => ({
        id: toNumber(product.id),
        name: String(product.name ?? ""),
        stock: toNumber(product.stock),
        sellingPrice: toNumber(product.price),
        purchasePrice: toNumber(product.purchase_price),
      })) satisfies Product[];

      const customerNames = new Map(customerList.map((c) => [c.id, c.name]));
      const productNames = new Map(productList.map((p) => [p.id, p.name]));

      const formattedSales: Sale[] = (salesResult.data ?? []).map((sale) => {
        const { total, paid, due } = computeLineTotals(
          sale.total_amount,
          sale.paid_amount
        );

        return {
          id: toNumber(sale.id),
          customerId: toNumber(sale.customer_id),
          productId: toNumber(sale.product_id),
          customer: resolveName(customerNames, sale.customer_id, "Customer"),
          product: resolveName(productNames, sale.product_id, "Product"),
          productName: sale.product_name
            ? String(sale.product_name)
            : resolveName(productNames, sale.product_id, "Product"),
          quantity: toNumber(sale.quantity),
          unitPrice:
            sale.unit_price === null || sale.unit_price === undefined
              ? null
              : toNumber(sale.unit_price),
          unitCost:
            sale.unit_cost === null || sale.unit_cost === undefined
              ? null
              : toNumber(sale.unit_cost),
          discount: toNumber(sale.discount),
          totalAmount: total,
          paidAmount: paid,
          dueAmount: due,
          date: String(sale.sale_date ?? ""),
          // Status is derived from the real amounts, never from a stored label.
          status: computePaymentStatus(total, paid),
        };
      });

      setCustomers(customerList);
      setProducts(productList);
      setSales(formattedSales);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Something went wrong while loading data.";

      setError(message);
      toast.error("Could not load sales", message);
    } finally {
      loadingRef.end();
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAllData();
  }, []);

  /** The product selected in the form — supplies stock and current prices. */
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === Number(productId)),
    [products, productId]
  );

  const selectedStock = selectedProduct ? selectedProduct.stock : undefined;

  /**
   * Units already committed to stock by the sale being edited. They are put
   * back before the new quantity is validated so an edit never falsely fails
   * for "not enough stock".
   */
  const editingSale = useMemo(
    () => sales.find((sale) => sale.id === editingId) ?? null,
    [sales, editingId]
  );

  const availableForForm = useMemo(() => {
    if (selectedStock === undefined) return undefined;

    const sameProduct =
      editingSale?.productId === Number(productId) ? editingSale.quantity : 0;

    return selectedStock + sameProduct;
  }, [selectedStock, editingSale, productId]);

  const openAddForm = () => {
    setEditingId(null);
    setCustomerId("");
    setProductId("");
    setQuantity("");
    setUnitPrice("");
    setDiscount("");
    setPaidAmount("");
    setDate(todayISODate());
    setShowForm(true);
  };

  const openEditForm = (sale: Sale) => {
    setEditingId(sale.id);

    // FIX: ids are used directly. The previous version matched on display
    // name, which silently reset the field when a name was duplicated or the
    // referenced row had since been renamed/deleted.
    setCustomerId(String(sale.customerId));
    setProductId(String(sale.productId));
    setQuantity(String(sale.quantity));

    // Historical prices recorded with the sale. A legacy sale (recorded
    // before the migration) has no stored unit price, so the effective unit
    // price derived from its own total is pre-filled instead — the sale's
    // actual figures are not silently reinterpreted. Stored base amounts are
    // shown in the selected display currency with precision preserved.
    setUnitPrice(
      sale.unitPrice !== null
        ? String(toDisplay(sale.unitPrice))
        : sale.quantity > 0
          ? String(toDisplay(roundMoney(sale.totalAmount / sale.quantity)))
          : ""
    );
    setDiscount(sale.discount ? String(toDisplay(sale.discount)) : "");
    setPaidAmount(String(toDisplay(sale.paidAmount)));

    // FIX: normalise the stored value for <input type="date">. A raw
    // timestamp such as 2026-01-01T00:00:00+00:00 renders as an empty field.
    setDate(toDateInputValue(sale.date));

    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setSaving(false);
  };

  /** Apply a signed stock change to a product row. */
  async function applyStock(productId: number, delta: number) {
    if (delta === 0) return null;

    const { data, error: readError } = await supabase
      .from("products")
      .select("id, stock")
      .eq("id", productId)
      .maybeSingle();

    if (readError) {
      console.error("Stock read error:", readError);
      return readError;
    }

    const current = toNumber(data?.stock);
    const next = Math.max(0, current + delta);

    const { data: updatedRows, error: writeError } = await supabase
      .from("products")
      .update({ stock: next })
      .eq("id", productId)
      .select("id");

    // A 0-row update means the product was filtered out (e.g. by RLS) and the
    // stock change was never applied. Surface it instead of logging success.
    if (writeError || !updatedRows || updatedRows.length === 0) {
      if (writeError) console.error("Stock write error:", writeError);
      else console.warn("Stock update matched no rows for product:", productId);

      return writeError ?? { message: "Stock update affected 0 rows." };
    }

    return null;
  }

  const saveSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (saving || !savingRef.begin()) return;

    // Money comes from the actual form inputs — selling price per unit,
    // quantity, discount and payment. The inputs are typed in the selected
    // display currency and are converted to the stored base currency (PKR)
    // exactly once; everything from here on works in base units.
    const unitPriceBase = toPkr(Number(unitPrice));
    const discountBase = toPkr(Number(discount));
    const paidBase = toPkr(Number(paidAmount));

    const amounts = computeSaleAmounts({
      unitPrice: unitPriceBase,
      quantity,
      discount: discountBase,
      paid: paidBase,
    });

    const issues = validateSale({
      customerId,
      productId,
      quantity,
      totalAmount: String(amounts.final),
      paidAmount: String(paidBase),
      date,
      availableStock: availableForForm,
      unitPrice: String(unitPriceBase),
      discount: String(discountBase),
    });

    if (issues.length > 0) {
      savingRef.end();
      setSaving(false);
      toast.error(issues[0].message);
      return;
    }

    const { total, paid, due } = computeLineTotals(
      amounts.final,
      amounts.paid
    );

    const nextQuantity = Number(quantity);
    const nextProductId = Number(productId);

    const previous = editingId !== null
      ? (sales.find((sale) => sale.id === editingId) ?? null)
      : null;

    setSaving(true);

    // Editing a legacy sale (saved before historical prices existed) keeps its
    // original total, so nothing currently stored is silently rewritten.
    const legacyPreserve =
      previous !== null &&
      previous.unitPrice === null &&
      previous.discount === 0 &&
      previous.productId === nextProductId &&
      previous.quantity === nextQuantity;

    /**
     * Snapshot of the product as the sale should remember it. Editing a sale
     * refreshes the historical name/cost from the product it now points at;
     * the sale's own selling price stays the user-entered one.
     */
    const productSnapshot = selectedProduct;

    const saleData = {
      customer_id: Number(customerId),
      product_id: nextProductId,
      quantity: nextQuantity,
      total_amount: legacyPreserve && previous ? previous.totalAmount : total,
      paid_amount: paid,
      due_amount:
        legacyPreserve && previous
          ? roundMoney(previous.totalAmount - paid)
          : due,
      sale_date: date,
      unit_price: unitPriceBase,
      unit_cost: productSnapshot
        ? productSnapshot.purchasePrice
        : (previous?.unitCost ?? 0),
      discount: amounts.discount,
      product_name: productSnapshot
        ? productSnapshot.name
        : (previous?.productName ?? ""),
    };

    try {
      if (editingId !== null) {
        const { data: updatedRows, error: updateError } = await supabase
          .from("sales")
          .update(saleData)
          .eq("id", editingId)
          .select("id");

        if (updateError) {
          console.error("Update Sale Error:", updateError);
          toast.error("Could not update sale", updateError.message);
          return;
        }

        // A 0-row update means RLS filtered the record away; it is not a success.
        if (!updatedRows || updatedRows.length === 0) {
          console.warn("Sale update matched no rows for id:", editingId);
          toast.error(
            "Sale was not saved",
            "No matching record was updated. It may have been deleted, or your account may not have permission to edit it."
          );
          return;
        }

        /**
         * FIX: moving a sale to a different product previously restored the
         * old product but computed a zero delta for the new one, so the new
         * product was never debited and total inventory silently inflated.
         * `computeSaleStockEffects` returns the full set of movements.
         */
        const movements = computeSaleStockEffects({
          previous,
          nextProductId,
          nextQuantity,
        });

        let stockError: { message: string } | null = null;

        for (const movement of movements) {
          // eslint-disable-next-line no-await-in-loop -- movements must apply in order
          const result = await applyStock(movement.productId, movement.delta);

          if (result && !stockError) stockError = result;
        }

        if (stockError) {
          toast.error(
            "Sale saved, but stock was not updated",
            "Please check this product's quantity."
          );
        } else {
          toast.success("Sale updated successfully");
        }
      } else {
        /**
         * Preferred path: one database function inserts the sale AND deducts
         * the stock inside a single transaction, so stock can never be
         * deducted twice and no sale can be written with stale cost data.
         */
        const { data: rpcSaleId, error: rpcError } = await supabase.rpc(
          "create_sale_with_stock",
          {
            p_customer_id: Number(customerId),
            p_product_id: nextProductId,
            p_quantity: nextQuantity,
            p_unit_price: Number(unitPrice),
            p_discount: amounts.discount,
            p_paid_amount: paid,
            p_sale_date: date,
          }
        );

        if (rpcError && !isMissingFunction(rpcError)) {
          console.error("Create Sale RPC Error:", rpcError);
          toast.error("Could not add sale", rpcError.message);
          return;
        }

        let saleId = toNumber(rpcSaleId);

        if (rpcError || saleId === 0) {
          // Fallback for a not-yet-migrated database: insert first, then
          // deduct. Both steps report failures instead of hiding them.
          if (rpcError) {
            console.warn(
              "create_sale_with_stock unavailable — falling back to client-side stock deduction."
            );
          }

          const { data: inserted, error: insertError } = await insertOwned(
            "sales",
            [saleData]
          );

          if (insertError) {
            console.error("Add Sale Error:", insertError);
            toast.error("Could not add sale", insertError.message);
            return;
          }

          saleId = toNumber(inserted?.id);

          const stockError = await applyStock(
            nextProductId,
            computeSaleStockEffects({
              previous: null,
              nextProductId,
              nextQuantity,
            })[0].delta
          );

          if (stockError) {
            toast.error(
              "Sale saved, but stock was not updated",
              "Please check this product's quantity."
            );
          } else {
            toast.success("Sale added successfully", `#${saleId}`);
          }
        } else {
          toast.success("Sale added successfully", `#${saleId}`);
        }
      }

      await loadAllData();
      closeForm();
    } catch (caught) {
      console.error("Unexpected Save Error:", caught);
      toast.error(
        "Something went wrong while saving the sale",
        caught instanceof Error ? caught.message : undefined
      );
    } finally {
      savingRef.end();
      setSaving(false);
    }
  };

  const deleteSale = async (sale: Sale) => {
    if (!savingRef.begin()) return;

    setSaving(true);

    /**
     * Preferred path: one database function restores the stock and deletes the
     * sale in a single transaction, so stock is restored exactly once. Payment
     * rows allocated against the sale are kept as ledger history; only their
     * sale link is cleared.
     */
    const { error: rpcError } = await supabase.rpc("delete_sale_and_restock", {
      p_sale_id: sale.id,
    });

    if (rpcError && !isMissingFunction(rpcError)) {
      console.error("Delete Sale RPC Error:", rpcError);
      toast.error("Could not delete sale", rpcError.message);
      savingRef.end();
      setSaving(false);
      setPendingDelete(null);
      return;
    }

    let deleteError = rpcError;

    if (rpcError) {
      console.warn(
        "delete_sale_and_restock unavailable — falling back to the client-side reversal."
      );

      // Fallback for a not-yet-migrated database.
      const result = await supabase
        .from("sales")
        .delete()
        .eq("id", sale.id)
        .select("id");

      deleteError = result.error;

      if (!result.error) {
        // Deleted sales must return their units to stock.
        const stockError = await applyStock(
          sale.productId,
          computeSaleStockEffects({
            previous: {
              productId: sale.productId,
              quantity: sale.quantity,
            },
            nextProductId: sale.productId,
            nextQuantity: sale.quantity,
            deleting: true,
          })[0].delta
        );

        if (stockError) {
          toast.error(
            "Sale deleted, but stock was not restored",
            "Please check this product's quantity."
          );
        } else {
          toast.success("Sale deleted successfully");
        }
      }
    } else {
      toast.success("Sale deleted successfully");
    }

    if (deleteError) {
      console.error("Delete Sale Error:", deleteError);
      toast.error("Could not delete sale", deleteError.message);
    }

    await loadAllData();

    savingRef.end();
    setSaving(false);
    setPendingDelete(null);
  };

  const filteredSales = useMemo(() => {
    const term = search.toLowerCase().trim();

    return sales.filter((sale) => {
      // Filter by payment status using the derived status, not a stored label.
      const matchesStatus =
        statusFilter === "All" || sale.status === statusFilter;

      // Inclusive calendar-date range, open when no bound is set.
      const saleDay = sale.date;
      const matchesFrom = !fromDate || saleDay >= fromDate;
      const matchesTo = !toDate || saleDay <= toDate;

      const matchesTerm =
        term.length === 0 ||
        sale.customer.toLowerCase().includes(term) ||
        sale.product.toLowerCase().includes(term) ||
        sale.date.toLowerCase().includes(term);

      return matchesStatus && matchesFrom && matchesTo && matchesTerm;
    });
  }, [sales, search, statusFilter, fromDate, toDate]);

  const summary = useMemo(() => {
    let billed = 0;
    let collected = 0;
    let due = 0;
    let units = 0;

    sales.forEach((sale) => {
      billed += sale.totalAmount;
      collected += sale.paidAmount;
      due += sale.dueAmount;
      units += sale.quantity;
    });

    return { billed, collected, due, units };
  }, [sales]);

  /** Live form money: subtotal, discount, final, paid and remaining due. */
  const preview = computeSaleAmounts({
    unitPrice,
    quantity,
    discount: discount === "" ? 0 : discount,
    paid: paidAmount === "" ? 0 : paidAmount,
  });

  return (
    <main className="page-content">
      <PageStack>
        <PageHeader
          title="Sales"
          description="Record transactions, track collections and manage outstanding balances."
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => void loadAllData()}
                disabled={loading}
              >
                <RefreshIcon size={15} />
                Refresh
              </Button>

              <Button variant="primary" onClick={openAddForm}>
                <PlusIcon size={15} />
                New sale
              </Button>
            </>
          }
        />

        {error ? (
          <div className="alert alert-error" role="alert">
            <AlertIcon size={16} />
            <div className="alert-content">
              <strong>Could not load sales</strong>
              {error}
            </div>
          </div>
        ) : null}

        <div className="stat-grid">
          <StatCard
            label="Total billed"
            value={formatMoney(summary.billed, 0)}
            tone="lavender"
            icon={<TrendingUpIcon size={16} />}
            loading={loading}
            meta={`${formatNumber(sales.length)} transactions`}
          />

          <StatCard
            label="Collected"
            value={formatMoney(summary.collected, 0)}
            tone="mint"
            icon={<CheckCircleIcon size={16} />}
            loading={loading}
            meta="Payments received"
          />

          <StatCard
            label="Outstanding"
            value={formatMoney(summary.due, 0)}
            tone="yellow"
            icon={<WalletIcon size={16} />}
            loading={loading}
            meta="Still awaiting payment"
          />

          <StatCard
            label="Units sold"
            value={formatNumber(summary.units)}
            tone="pink"
            icon={<ShoppingCartIcon size={16} />}
            loading={loading}
            meta="Across all sales"
          />
        </div>

        <Card>
          <CardHeader
            title="Sales ledger"
            description={`${filteredSales.length} of ${sales.length} transactions shown`}
            actions={
              <div className="filter-row">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search customer, product or date..."
                  label="Search sales"
                />

                <Select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  aria-label="Filter by payment status"
                  style={{ width: "auto", minWidth: 130 }}
                >
                  <option value="All">All payments</option>
                  <option value="Paid">Paid</option>
                  <option value="Partial">Partially paid</option>
                  <option value="Unpaid">Unpaid</option>
                </Select>

                <Input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  aria-label="Filter sales from date"
                  style={{ width: "auto", minWidth: 140 }}
                  title="From date"
                />

                <Input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  aria-label="Filter sales to date"
                  style={{ width: "auto", minWidth: 140 }}
                  title="To date"
                />
              </div>
            }
          />

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Product</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit price</th>
                  <th className="num">Total</th>
                  <th className="num">Paid</th>
                  <th className="num">Due</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th className="actions-cell">Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <SkeletonRows rows={6} />
                ) : filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="table-empty-cell">
                      <EmptyState
                        icon={<SearchIcon size={20} />}
                        title={
                          sales.length === 0 ? "No sales yet" : "No sales found"
                        }
                        description={
                          sales.length === 0
                            ? "Record your first transaction to start building revenue reports."
                            : "Try a different search term."
                        }
                        action={
                          <Button variant="primary" onClick={openAddForm}>
                            <PlusIcon size={15} />
                            New sale
                          </Button>
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((sale) => (
                    <tr key={sale.id}>
                      <td className="cell-primary">
                        <span className="cell-stack">
                          <strong>{sale.customer}</strong>
                          <small className="cell-muted">#{sale.id}</small>
                        </span>
                      </td>

                      <td>{sale.productName}</td>

                      <td className="num">{sale.quantity}</td>

                      <td className="num">
                        {sale.unitPrice !== null
                          ? formatMoney(sale.unitPrice)
                          : <span className="cell-muted">—</span>}
                      </td>

                      <td className="num cell-strong">
                        {formatMoney(sale.totalAmount)}
                      </td>

                      <td className="num money-pos">
                        {formatMoney(sale.paidAmount)}
                      </td>

                      <td className="num">
                        {sale.dueAmount > 0 ? (
                          <span className="money-neg">
                            {formatMoney(sale.dueAmount)}
                          </span>
                        ) : (
                          <span className="cell-muted">—</span>
                        )}
                      </td>

                      <td className="cell-muted">{formatDate(sale.date)}</td>

                      <td>
                        <Badge tone={STATUS_TONE[sale.status]}>
                          {sale.status === "Unpaid" ? "Unpaid" : sale.status}
                        </Badge>
                      </td>

                      <td className="actions-cell">
                        <span className="row-actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openEditForm(sale)}
                          >
                            <PencilIcon size={14} />
                            Edit
                          </Button>

                          <Button
                            size="sm"
                            variant="soft-danger"
                            onClick={() => setPendingDelete(sale)}
                          >
                            <TrashIcon size={14} />
                          </Button>
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </PageStack>

      <Modal
        open={showForm}
        title={editingId === null ? "Create new sale" : "Edit sale"}
        description="Enter the transaction details and payment received."
        onClose={closeForm}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>

            <Button
              variant="primary"
              type="submit"
              form="sale-form"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : editingId === null
                  ? "Save sale"
                  : "Update sale"}
            </Button>
          </>
        }
      >
        <form id="sale-form" className="modal-form" onSubmit={saveSale}>
          <div className="modal-body">
            <div className="form-grid">
              <Field label="Customer" required>
                <Select
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                >
                  <option value="">Select customer</option>

                  {customers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Product"
                required
                hint={
                  selectedStock === undefined
                    ? undefined
                    : `${availableForForm} unit${
                        availableForForm === 1 ? "" : "s"
                      } available`
                }
              >
                <Select
                  value={productId}
                  onChange={(event) => {
                    const nextId = event.target.value;

                    setProductId(nextId);

                    // Selecting a product loads its current selling price;
                    // purchase prices never reach customer invoices.
                    const product = products.find(
                      (item) => item.id === Number(nextId)
                    );

                    if (product) {
                      // Stored base price shown in the selected display
                      // currency, with precision preserved for round-tripping.
                      setUnitPrice(String(toDisplay(product.sellingPrice)));
                    }
                  }}
                >
                  <option value="">Select product</option>

                  {products.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Quantity" required>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </Field>

              <Field
                label={`Selling price per unit (${currency})`}
                required
                hint={
                  selectedProduct &&
                  toDisplay(selectedProduct.sellingPrice) === Number(unitPrice)
                    ? "Loaded from the product's selling price."
                    : "Pre-filled from the product — adjust only if you negotiated a different price."
                }
              >
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={unitPrice}
                  onChange={(event) => setUnitPrice(event.target.value)}
                />
              </Field>

              <Field label={`Discount (${currency})`}>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                />
              </Field>

              <Field label="Sale date" required>
                <span style={{ position: "relative", display: "block" }}>
                  <span
                    style={{
                      position: "absolute",
                      left: 11,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--text-muted)",
                      pointerEvents: "none",
                    }}
                  >
                    <CalendarIcon size={15} />
                  </span>

                  <Input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    style={{ paddingLeft: 34 }}
                  />
                </span>
              </Field>

              <Field
                label={`Payment received (${currency})`}
                hint={
                  preview.due > 0
                    ? `Balance after payment: ${formatMoneyRaw(preview.due)}`
                    : "Fully paid — no balance remains."
                }
              >
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={paidAmount}
                  onChange={(event) => setPaidAmount(event.target.value)}
                />
              </Field>
            </div>

            <div className="calc-panel">
              <div className="calc-row">
                <span>Subtotal (selling price × quantity)</span>
                <strong>{formatMoneyRaw(preview.subtotal)}</strong>
              </div>

              <div className="calc-row">
                <span>Discount</span>
                <strong>
                  {preview.discount > 0
                    ? `− ${formatMoneyRaw(preview.discount)}`
                    : formatMoneyRaw(0)}
                </strong>
              </div>

              <div className="calc-row">
                <span>Final sale amount</span>
                <strong className="money-pos">
                  {formatMoneyRaw(preview.final)}
                </strong>
              </div>

              <div className="calc-row">
                <span>Remaining due</span>
                <strong
                  className={preview.due > 0 ? "money-neg" : undefined}
                >
                  {formatMoneyRaw(preview.due)}
                </strong>
              </div>

              <p className="calc-note">
                Full payment → Paid · some payment → Partially paid · no
                payment → Unpaid credit sale. The remaining due is tracked
                automatically.
              </p>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        busy={saving}
        title="Delete sale"
        description={`The transaction for "${pendingDelete?.customer ?? ""}" worth ${formatMoney(pendingDelete?.totalAmount ?? 0)} will be removed and its units returned to stock. Payments recorded against it remain in the customer's ledger.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void deleteSale(pendingDelete);
        }}
      />
    </main>
  );
}

/** Simple re-entrancy latch so overlapping async work cannot double-apply. */
function useLatch() {
  const active = useRef(false);

  return {
    begin: () => {
      if (active.current) return false;
      active.current = true;
      return true;
    },
    end: () => {
      active.current = false;
    },
  };
}