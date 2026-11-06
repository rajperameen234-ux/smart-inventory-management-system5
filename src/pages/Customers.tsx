import { useEffect, useMemo, useState, type FormEvent } from "react";
import { insertOwned, supabase } from "../supabase";
import { useToast } from "../components/Toast";
import {
  AlertIcon,
  EyeIcon,
  MailIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
  UsersIcon,
  WalletIcon,
} from "../components/Icon";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageStack,
  SearchInput,
  SkeletonRows,
  StatCard,
  Textarea,
  type BadgeTone,
} from "../components/ui";
import { formatMoney, formatNumber, initials, toNumber } from "../lib/format";
import { formatDate } from "../lib/date";
import { roundMoney } from "../lib/inventory";
import { computePaymentStatus, type PaymentStatus } from "../lib/profit";

type Customer = {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  /** Computed from real sales, never typed in. */
  totalPurchases: number;
  totalPaid: number;
  dues: number;
  lastPurchase: string | null;
  salesCount: number;
  status: PaymentStatus;
};

function statusTone(status: PaymentStatus): BadgeTone {
  if (status === "Paid") return "mint";
  if (status === "Partial") return "yellow";
  return "pink";
}

type DetailSale = {
  id: number;
  quantity: number;
  totalAmount: number;
  paidAmount: number;
  productName: string;
  date: string;
  status: PaymentStatus;
};

type DetailPayment = {
  id: number;
  amount: number;
  paidAt: string;
  note: string;
};

/** Loads a customer's sale history inside the details modal. */
function DetailPurchases({ customerId }: { customerId: number }) {
  const [rows, setRows] = useState<DetailSale[] | null>(null);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    let active = true;
    setRows(null);
    setFetchError("");

    void supabase
      .from("sales")
      .select(`
        id, quantity, total_amount, paid_amount, sale_date, product_name,
        products(name)
      `)
      .eq("customer_id", customerId)
      .order("sale_date", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (!active) return;

        if (loadError) {
          console.error("Customer detail sales error:", loadError);
          setFetchError(loadError.message);
          return;
        }

        setRows(
          (data ?? []).map((row) => {
            const joined = (row as { products?: { name: unknown }[] }).products;
            const linkedName = joined?.[0]?.name;

            return {
              id: toNumber(row.id),
              quantity: toNumber(row.quantity),
              totalAmount: toNumber(row.total_amount),
              paidAmount: toNumber(row.paid_amount),
              productName:
                row.product_name ??
                (linkedName ? String(linkedName) : "Product"),
              date: String(row.sale_date ?? ""),
              status: computePaymentStatus(
                toNumber(row.total_amount),
                toNumber(row.paid_amount)
              ),
            };
          })
        );
      });

    return () => {
      active = false;
    };
  }, [customerId]);

  if (fetchError) {
    return (
      <p className="detail-error">Purchase history unavailable: {fetchError}</p>
    );
  }

  if (rows === null) return <SkeletonRows rows={3} />;

  if (rows.length === 0) {
    return <p className="detail-empty">No recorded purchases yet.</p>;
  }

  return (
    <div className="purchase-history">
      {rows.map((row) => (
        <div className="purchase-history-row" key={row.id}>
          <div className="purchase-history-main">
            <strong>{row.productName}</strong>
            <small>
              {formatDate(row.date)} · Qty {formatNumber(row.quantity)}
            </small>
          </div>

          <div className="purchase-history-side">
            <span className="cell-strong">{formatMoney(row.totalAmount)}</span>
            <Badge tone={statusTone(row.status)}>{row.status}</Badge>
            {row.totalAmount - row.paidAmount > 0.009 ? (
              <small className="detail-due">
                Due {formatMoney(row.totalAmount - row.paidAmount)}
              </small>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Loads a customer's payment ledger inside the details modal. */
function DetailPayments({ customerId }: { customerId: number }) {
  const [rows, setRows] = useState<DetailPayment[] | null>(null);
  const [hasLedger, setHasLedger] = useState(true);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    let active = true;
    setRows(null);
    setHasLedger(true);
    setFetchError("");

    void supabase
      .from("payments")
      .select("id, amount, paid_at, note")
      .eq("customer_id", customerId)
      .order("paid_at", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (!active) return;

        if (loadError) {
          if (
            loadError.message.toLowerCase().includes("could not find the table")
          ) {
            setHasLedger(false);
            return;
          }

          console.error("Customer detail payments error:", loadError);
          setFetchError(loadError.message);
          return;
        }

        setRows(
          (data ?? []).map((row) => ({
            id: toNumber(row.id),
            amount: toNumber(row.amount),
            paidAt: String(row.paid_at ?? ""),
            note: String(row.note ?? ""),
          }))
        );
      });

    return () => {
      active = false;
    };
  }, [customerId]);

  if (!hasLedger) {
    return (
      <p className="detail-error">
        Payment history requires the database migration (payments ledger table).
      </p>
    );
  }

  if (fetchError) {
    return (
      <p className="detail-error">Payment history unavailable: {fetchError}</p>
    );
  }

  if (rows === null) return <SkeletonRows rows={2} />;

  if (rows.length === 0) {
    return <p className="detail-empty">No payments recorded yet.</p>;
  }

  return (
    <div className="payment-history">
      {rows.map((row) => (
        <div className="payment-history-row" key={row.id}>
          <div className="payment-history-main">
            <strong className="money-pos">+ {formatMoney(row.amount)}</strong>
            <small>{formatDate(row.paidAt.slice(0, 10))}</small>
          </div>
          {row.note ? <small className="cell-muted">{row.note}</small> : null}
        </div>
      ))}
    </div>
  );
}

export default function Customers({
  searchSeed = "",
}: {
  searchSeed?: string;
}) {
  const toast = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState(searchSeed);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);
  const [detailTarget, setDetailTarget] = useState<Customer | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (searchSeed) setSearch(searchSeed);
  }, [searchSeed]);

  const loadCustomers = async () => {
    setLoading(true);
    setError("");

    const [customersResult, salesResult] = await Promise.all([
      supabase.from("customers").select(`
        id, name, phone, email, address
      `).order("id", { ascending: true }),

      supabase.from("sales").select(`
        id, customer_id, total_amount, paid_amount, sale_date
      `).order("id", { ascending: true }),
    ]);

    const failure = customersResult.error ?? salesResult.error;

    if (failure) {
      console.error("Load Customers Error:", failure);
      setError(failure.message);
      setLoading(false);
      toast.error("Could not load customers", failure.message);
      return;
    }

    // The payments ledger is supplementary — a missing table must not blank
    // the customer list; the detail modal reports it contextually.

    // Balances are aggregated from the customer's actual sales so the numbers
    // can never disagree with the Sales or Credit & Dues pages.
    const balances = new Map<
      number,
      { purchases: number; paid: number; last: string | null; count: number }
    >();

    (salesResult.data ?? []).forEach((row) => {
      const id = toNumber(row.customer_id);
      const total = toNumber(row.total_amount);
      const paid = toNumber(row.paid_amount);
      const date = String(row.sale_date ?? "");

      const existing = balances.get(id) ?? {
        purchases: 0,
        paid: 0,
        last: null,
        count: 0,
      };

      balances.set(id, {
        purchases: roundMoney(existing.purchases + total),
        paid: roundMoney(existing.paid + paid),
        last:
          existing.last && existing.last > date ? existing.last : date || existing.last,
        count: existing.count + 1,
      });
    });

    const formattedCustomers: Customer[] = (customersResult.data || []).map(
      (customer) => {
        const balance = balances.get(toNumber(customer.id)) ?? {
          purchases: 0,
          paid: 0,
          last: null,
          count: 0,
        };

        return {
          id: toNumber(customer.id),
          name: customer.name,
          phone: customer.phone || "",
          email: customer.email || "",
          address: customer.address || "",
          totalPurchases: balance.purchases,
          totalPaid: balance.paid,
          dues: Math.max(0, roundMoney(balance.purchases - balance.paid)),
          lastPurchase: balance.last,
          salesCount: balance.count,
          status: computePaymentStatus(balance.purchases, balance.paid),
        };
      }
    );

    setCustomers(formattedCustomers);
    setLoading(false);
  };

  useEffect(() => {
    void loadCustomers();
  }, []);

  const openAddForm = () => {
    setEditingId(null);
    setName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setShowForm(true);
  };

  const openEditForm = (customer: Customer) => {
    setEditingId(customer.id);
    setName(customer.name);
    setPhone(customer.phone);
    setEmail(customer.email);
    setAddress(customer.address);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setSaving(false);
  };

  // Only contact details are editable here. Balances are owned by the sales
  // records, so this form must never overwrite total_purchases/dues.
  const customerPayload = () => ({
    name: name.trim(),
    phone: phone.trim(),
    email: email.trim(),
    address: address.trim(),
  });

  /** Quick guard used before destructive actions. */
  const hasSales = (customer: Customer) => customer.salesCount > 0;

  const saveCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!name.trim()) {
      toast.error("Name required", "Please enter customer name.");
      return;
    }

    if (!phone.trim()) {
      toast.error("Phone required", "Please enter phone number.");
      return;
    }

    if (saving) return;

    setSaving(true);

    const customerData = customerPayload();

    if (editingId !== null) {
      const { data: updatedRows, error: updateError } = await supabase
        .from("customers")
        .update(customerData)
        .eq("id", editingId)
        .select("id");

      if (updateError) {
        console.error("Update Customer Error:", updateError);
        toast.error("Could not update customer", updateError.message);
        setSaving(false);
        return;
      }

      if (!updatedRows || updatedRows.length === 0) {
        toast.error(
          "Customer was not saved",
          "No matching row was updated. It may have been deleted, or your account may not have permission to edit it."
        );
        setSaving(false);
        return;
      }

      setCustomers((current) =>
        current.map((customer) =>
          customer.id === editingId
            ? {
                ...customer,
                name: customerData.name,
                phone: customerData.phone,
                email: customerData.email,
                address: customerData.address,
              }
            : customer
        )
      );

      toast.success("Customer updated", customerData.name);
    } else {
      const { data, error: insertError } = await insertOwned("customers", [
        customerData,
      ]);

      if (insertError) {
        console.error("Add Customer Error:", insertError);
        toast.error("Could not add customer", insertError.message);
        setSaving(false);
        return;
      }

      // Prefer the row the database returned; fall back to the submitted values so
      // the list still updates correctly if only a subset of columns is returned.
      const row = (data ?? { id: null, ...customerData }) as Record<string, unknown>;

      const newCustomer: Customer = {
        id: toNumber(row.id),
        name: String(row.name ?? customerData.name),
        phone: String(row.phone ?? customerData.phone),
        email: String(row.email ?? customerData.email),
        address: String(row.address ?? customerData.address),
        totalPurchases: 0,
        totalPaid: 0,
        dues: 0,
        lastPurchase: null,
        salesCount: 0,
        status: "Unpaid",
      };

      setCustomers((current) => [...current, newCustomer]);
      toast.success("Customer added", newCustomer.name);
    }

    closeForm();
  };

  const deleteCustomer = async (customer: Customer) => {
    // linked records: refuse instead of silently orphaning them.
    if (hasSales(customer)) {
      setPendingDelete(null);
      toast.error(
        "Customer has sales",
        `Delete or reassign the ${customer.salesCount} sale(s) linked to ${customer.name} first — deleting is blocked to protect your records.`
      );
      return;
    }

    setSaving(true);

    const { error: deleteError } = await supabase
      .from("customers")
      .delete()
      .eq("id", customer.id)
      .select("id");

    setSaving(false);
    setPendingDelete(null);

    if (deleteError) {
      console.error("Delete Customer Error:", deleteError);
      toast.error("Could not delete customer", deleteError.message);
      return;
    }

    setCustomers((current) =>
      current.filter((item) => item.id !== customer.id)
    );

    toast.success("Customer deleted", customer.name);
  };

  const filteredCustomers = useMemo(() => {
    const term = search.toLowerCase().trim();

    if (!term) return customers;

    return customers.filter((customer) =>
      `${customer.name} ${customer.phone} ${customer.email} ${customer.address}`
        .toLowerCase()
        .includes(term)
    );
  }, [customers, search]);

  const summary = useMemo(() => {
    const lifetime = customers.reduce(
      (sum, customer) => sum + customer.totalPurchases,
      0
    );

    const outstanding = customers.reduce(
      (sum, customer) => sum + customer.dues,
      0
    );

    const owing = customers.filter((customer) => customer.dues > 0).length;

    return { lifetime, outstanding, owing };
  }, [customers]);

  return (
    <main className="page-content">
      <PageStack>
        <PageHeader
          title="Customers"
          description="Your client directory with purchase history and outstanding balances."
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => void loadCustomers()}
                disabled={loading}
              >
                <RefreshIcon size={15} />
                Refresh
              </Button>

              <Button variant="primary" onClick={openAddForm}>
                <PlusIcon size={15} />
                Add customer
              </Button>
            </>
          }
        />

        {error ? (
          <div className="alert alert-error" role="alert">
            <AlertIcon size={16} />
            <div className="alert-content">
              <strong>Could not load customers</strong>
              {error}
            </div>
          </div>
        ) : null}

        <div className="stat-grid">
          <StatCard
            label="Total customers"
            value={formatNumber(customers.length)}
            tone="lavender"
            icon={<UsersIcon size={16} />}
            loading={loading}
            meta="Registered accounts"
          />

          <StatCard
            label="Lifetime purchases"
            value={formatMoney(summary.lifetime, 0)}
            tone="pink"
            icon={<WalletIcon size={16} />}
            loading={loading}
            meta="Recorded across all customers"
          />

          <StatCard
            label="Outstanding"
            value={formatMoney(summary.outstanding, 0)}
            tone="yellow"
            icon={<AlertIcon size={16} />}
            loading={loading}
            meta={`${summary.owing} customers owing`}
          />
        </div>

        <Card>
          <CardHeader
            title="Customer directory"
            description={`${filteredCustomers.length} of ${customers.length} shown`}
            actions={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search customers..."
                label="Search customers"
              />
            }
          />

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th className="num">Billed</th>
                  <th className="num">Paid</th>
                  <th className="num">Outstanding</th>
                  <th>Last purchase</th>
                  <th>Status</th>
                  <th className="actions-cell">Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <SkeletonRows rows={6} />
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="table-empty-cell">
                      <EmptyState
                        icon={<SearchIcon size={20} />}
                        title={
                          customers.length === 0
                            ? "No customers yet"
                            : "No customers found"
                        }
                        description={
                          customers.length === 0
                            ? "Add your first customer to start tracking sales and dues."
                            : "Try a different search term."
                        }
                        action={
                          <Button variant="primary" onClick={openAddForm}>
                            <PlusIcon size={15} />
                            Add customer
                          </Button>
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <span className="avatar">{initials(customer.name)}</span>
                          <span className="cell-stack">
                            <strong className="cell-primary">
                              {customer.name}
                            </strong>
                            <small>Customer #{customer.id}</small>
                          </span>
                        </span>
                      </td>

                      <td>{customer.phone || "—"}</td>

                      <td className="num cell-strong">
                        {formatMoney(customer.totalPurchases)}
                      </td>

                      <td className="num">
                        {formatMoney(customer.totalPaid)}
                      </td>

                      <td className="num">
                        {customer.dues > 0 ? (
                          <Badge tone="yellow">
                            {formatMoney(customer.dues)}
                          </Badge>
                        ) : (
                          <span className="money-pos">Settled</span>
                        )}
                      </td>

                      <td className="cell-muted">
                        {customer.lastPurchase ? formatDate(customer.lastPurchase) : "—"}
                      </td>

                      <td>
                        <Badge tone={statusTone(customer.status)}>
                          {customer.status}
                        </Badge>
                      </td>

                      <td className="actions-cell">
                        <span className="row-actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setDetailTarget(customer)}
                          >
                            <EyeIcon size={14} />
                            Details
                          </Button>

                          <Button
                            size="sm"
                            variant="soft-danger"
                            onClick={() => setPendingDelete(customer)}
                            disabled={hasSales(customer)}
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

        {filteredCustomers.length > 0 ? (
          <Card>
            <CardHeader
              title="Top accounts"
              description="Customers ranked by lifetime purchase value"
            />

            <CardBody>
              <div className="tile-grid">
                {[...filteredCustomers]
                  .sort((a, b) => b.totalPurchases - a.totalPurchases)
                  .slice(0, 3)
                  .map((customer) => (
                    <article className="tile" key={`card-${customer.id}`}>
                      <div className="tile-head">
                        <span className="avatar avatar-lg">
                          {initials(customer.name)}
                        </span>

                        <div className="tile-body">
                          <h4>{customer.name}</h4>
                          <p>
                            {formatMoney(customer.totalPurchases)} lifetime value
                          </p>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                          marginTop: 14,
                        }}
                      >
                        {customer.phone ? (
                          <Badge tone="neutral" plain>
                            <PhoneIcon size={12} />
                            {customer.phone}
                          </Badge>
                        ) : null}

                        {customer.address ? (
                          <Badge tone="neutral" plain>
                            <MapPinIcon size={12} />
                            {customer.address}
                          </Badge>
                        ) : null}

                        {customer.email ? (
                          <Badge tone="neutral" plain>
                            <MailIcon size={12} />
                            {customer.email}
                          </Badge>
                        ) : null}
                      </div>
                    </article>
                  ))}
              </div>
            </CardBody>
          </Card>
        ) : null}
      </PageStack>

      <Modal
        open={showForm}
        title={editingId === null ? "Add new customer" : "Edit customer"}
        description="Contact details only — balances are tracked automatically from sales and payments."
        onClose={closeForm}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>

            <Button
              variant="primary"
              type="submit"
              form="customer-form"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : editingId === null
                  ? "Save customer"
                  : "Update customer"}
            </Button>
          </>
        }
      >
        <form id="customer-form" className="modal-form" onSubmit={saveCustomer}>
          <div className="modal-body">
            <div className="form-grid">
              <Field label="Customer name" required>
                <Input
                  type="text"
                  placeholder="Full name or business"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </Field>

              <Field label="Phone" required>
                <Input
                  type="text"
                  placeholder="0300-1234567"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  required
                />
              </Field>

              <Field label="Email">
                <Input
                  type="email"
                  placeholder="customer@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>

              <Field label="Address">
                <Textarea
                  placeholder="Enter address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  rows={2}
                />
              </Field>
            </div>

            <p className="calc-note">
              Total purchases, paid amount, and dues are calculated from the
              Sales and Credit &amp; Dues pages — no manual balance entry.
            </p>
          </div>
        </form>
      </Modal>

      <Modal
        open={detailTarget !== null}
        title={detailTarget?.name ?? "Customer"}
        description={`Customer #${detailTarget?.id ?? ""} — contact and financial history.`}
        onClose={() => setDetailTarget(null)}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDetailTarget(null)}>
              Close
            </Button>

            <Button
              variant="primary"
              onClick={() => {
                if (detailTarget) {
                  const target = detailTarget;
                  setDetailTarget(null);
                  openEditForm(target);
                }
              }}
            >
              <PencilIcon size={14} />
              Edit customer
            </Button>
          </>
        }
      >
        <div className="modal-body">
          <div className="calc-panel">
            <div className="calc-row">
              <span>Total purchases (billed)</span>
              <strong>{formatMoney(detailTarget?.totalPurchases ?? 0)}</strong>
            </div>

            <div className="calc-row">
              <span>Total paid</span>
              <strong className="money-pos">
                {formatMoney(detailTarget?.totalPaid ?? 0)}
              </strong>
            </div>

            <div className="calc-row calc-total">
              <span>Outstanding dues</span>
              <strong>{formatMoney(detailTarget?.dues ?? 0)}</strong>
            </div>
          </div>

          <div className="detail-list">
            <div className="detail-item">
              <span>Phone</span>
              <strong>{detailTarget?.phone || "—"}</strong>
            </div>

            <div className="detail-item">
              <span>Email</span>
              <strong>{detailTarget?.email || "—"}</strong>
            </div>

            <div className="detail-item detail-item-wide">
              <span>Address</span>
              <strong>{detailTarget?.address || "—"}</strong>
            </div>

            <div className="detail-item">
              <span>Recorded sales</span>
              <strong>{formatNumber(detailTarget?.salesCount ?? 0)}</strong>
            </div>

            <div className="detail-item">
              <span>Last purchase</span>
              <strong>
                {detailTarget?.lastPurchase
                  ? formatDate(detailTarget.lastPurchase)
                  : "—"}
              </strong>
            </div>

            <div className="detail-item">
              <span>Status</span>
              <Badge tone={statusTone(detailTarget?.status ?? "Unpaid")}>
                {detailTarget?.status ?? "—"}
              </Badge>
            </div>
          </div>

          <h4 className="detail-subheading">Purchase history</h4>
          {detailTarget ? <DetailPurchases customerId={detailTarget.id} /> : null}

          <h4 className="detail-subheading">Payment history</h4>
          {detailTarget ? <DetailPayments customerId={detailTarget.id} /> : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        busy={saving}
        title="Delete customer"
        description={`"${pendingDelete?.name ?? ""}" and all of their linked records will be permanently removed.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void deleteCustomer(pendingDelete);
        }}
      />
    </main>
  );
}