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
import { formatMoney, formatNumber, todayISODate } from "../lib/format";
import { formatDate, toDateInputValue } from "../lib/date";
import {
  computeLineTotals,
  computeSaleStockEffects,
  resolveName,
  toNumber,
  validateSale,
} from "../lib/inventory";

type Sale = {
  id: number;
  customerId: number;
  productId: number;
  customer: string;
  product: string;
  quantity: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  date: string;
};

type Customer = {
  id: number;
  name: string;
};

type Product = {
  id: number;
  name: string;
  stock: number;
};

export default function Sales() {
  const toast = useToast();

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
  const [totalAmount, setTotalAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [date, setDate] = useState("");

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
          .select("id, name, stock")
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
            sale_date
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
          quantity: toNumber(sale.quantity),
          totalAmount: total,
          paidAmount: paid,
          dueAmount: due,
          date: String(sale.sale_date ?? ""),
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

  /** Current stock for the product selected in the form. */
  const selectedStock = useMemo(() => {
    const match = products.find((product) => product.id === Number(productId));

    return match ? match.stock : undefined;
  }, [products, productId]);

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
    setTotalAmount("");
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
    setTotalAmount(String(sale.totalAmount));
    setPaidAmount(String(sale.paidAmount));

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

    const issues = validateSale({
      customerId,
      productId,
      quantity,
      totalAmount,
      paidAmount,
      date,
      availableStock: availableForForm,
    });

    if (issues.length > 0) {
      savingRef.end();
      setSaving(false);
      toast.error(issues[0].message);
      return;
    }

    const { total, paid, due } = computeLineTotals(totalAmount, paidAmount);
    const nextQuantity = Number(quantity);
    const nextProductId = Number(productId);

    const previous = editingId !== null
      ? (sales.find((sale) => sale.id === editingId) ?? null)
      : null;

    setSaving(true);

    try {
      const saleData = {
        customer_id: Number(customerId),
        product_id: nextProductId,
        quantity: nextQuantity,
        total_amount: total,
        paid_amount: paid,
        due_amount: due,
        sale_date: date,
      };

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
        const { data: inserted, error: insertError } = await insertOwned("sales", [
          saleData,
        ]);

        if (insertError) {
          console.error("Add Sale Error:", insertError);
          toast.error("Could not add sale", insertError.message);
          return;
        }

        const saleId = toNumber(inserted?.id);

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

    const { error: deleteError } = await supabase
      .from("sales")
      .delete()
      .eq("id", sale.id)
      .select("id");

    if (deleteError) {
      console.error("Delete Sale Error:", deleteError);
      toast.error("Could not delete sale", deleteError.message);
    } else {
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

      await loadAllData();
    }

    savingRef.end();
    setSaving(false);
    setPendingDelete(null);
  };

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

  const preview = computeLineTotals(totalAmount, paidAmount);

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
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search customer, product or date..."
                label="Search sales"
              />
            }
          />

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Product</th>
                  <th className="num">Qty</th>
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
                    <td colSpan={9} className="table-empty-cell">
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
                      <td className="cell-primary">{sale.customer}</td>

                      <td>{sale.product}</td>

                      <td className="num">{sale.quantity}</td>

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
                        <Badge tone={sale.dueAmount > 0 ? "yellow" : "mint"}>
                          {sale.dueAmount > 0 ? "Partial" : "Paid"}
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
                  onChange={(event) => setProductId(event.target.value)}
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

              <Field label="Total amount (Rs.)" required>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={totalAmount}
                  onChange={(event) => setTotalAmount(event.target.value)}
                />
              </Field>

              <Field
                label="Paid amount (Rs.)"
                hint={`Balance after payment: ${formatMoney(preview.due)}`}
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
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        busy={saving}
        title="Delete sale"
        description={`The transaction for "${pendingDelete?.customer ?? ""}" worth ${formatMoney(pendingDelete?.totalAmount ?? 0)} will be removed and its units returned to stock.`}
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