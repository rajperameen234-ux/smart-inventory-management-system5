import { useEffect, useMemo, useState, type FormEvent } from "react";
import { insertOwned, supabase } from "../supabase";
import { useToast } from "../components/Toast";
import {
  AlertIcon,
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
} from "../components/ui";
import { formatMoney, formatNumber, initials, toNumber } from "../lib/format";

type Customer = {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  totalPurchases: number;
  dues: number;
};

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

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [totalPurchases, setTotalPurchases] = useState("");
  const [dues, setDues] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (searchSeed) setSearch(searchSeed);
  }, [searchSeed]);

  const loadCustomers = async () => {
    setLoading(true);
    setError("");

    const { data, error: loadError } = await supabase
      .from("customers")
      .select("*")
      .order("id", { ascending: true });

    if (loadError) {
      console.error("Load Customers Error:", loadError);
      setError(loadError.message);
      setLoading(false);
      toast.error("Could not load customers", loadError.message);
      return;
    }

    const formattedCustomers: Customer[] = (data || []).map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      totalPurchases: toNumber(customer.total_purchases),
      dues: toNumber(customer.dues),
    }));

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
    setTotalPurchases("");
    setDues("");
    setShowForm(true);
  };

  const openEditForm = (customer: Customer) => {
    setEditingId(customer.id);
    setName(customer.name);
    setPhone(customer.phone);
    setEmail(customer.email);
    setAddress(customer.address);
    setTotalPurchases(customer.totalPurchases.toString());
    setDues(customer.dues.toString());
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setSaving(false);
  };

  const customerPayload = () => ({
    name: name.trim(),
    phone: phone.trim(),
    email: email.trim(),
    address: address.trim(),
    // Balances are money: clamped so a hand-typed negative or an
    // over-collection can never be stored.
    total_purchases: Math.max(0, toNumber(totalPurchases)),
    dues: Math.max(0, toNumber(dues)),
  });

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
                totalPurchases: customerData.total_purchases,
                dues: customerData.dues,
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
      const row = (data ?? customerData) as Record<string, unknown>;

      const newCustomer: Customer = {
        id: toNumber(row.id),
        name: String(row.name ?? customerData.name),
        phone: String(row.phone ?? ""),
        email: String(row.email ?? ""),
        address: String(row.address ?? ""),
        totalPurchases: toNumber(row.total_purchases),
        dues: toNumber(row.dues),
      };

      setCustomers((current) => [...current, newCustomer]);
      toast.success("Customer added", newCustomer.name);
    }

    closeForm();
  };

  const deleteCustomer = async (customer: Customer) => {
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
                  <th>Email</th>
                  <th>Address</th>
                  <th className="num">Total purchases</th>
                  <th className="num">Outstanding</th>
                  <th className="actions-cell">Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <SkeletonRows rows={6} />
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="table-empty-cell">
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

                      <td>{customer.phone || "â€”"}</td>

                      <td>
                        {customer.email ? (
                          <a
                            href={`mailto:${customer.email}`}
                            style={{ fontSize: 13 }}
                          >
                            {customer.email}
                          </a>
                        ) : (
                          <span className="cell-muted">â€”</span>
                        )}
                      </td>

                      <td>
                        <span
                          className="truncate"
                          style={{ display: "inline-block" }}
                        >
                          {customer.address || "â€”"}
                        </span>
                      </td>

                      <td className="num cell-strong">
                        {formatMoney(customer.totalPurchases)}
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

                      <td className="actions-cell">
                        <span className="row-actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openEditForm(customer)}
                          >
                            <PencilIcon size={14} />
                            Edit
                          </Button>

                          <Button
                            size="sm"
                            variant="soft-danger"
                            onClick={() => setPendingDelete(customer)}
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
        description="Capture contact details and their account balances."
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

              <Field label="Total purchases (Rs.)" hint="Lifetime billed value.">
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={totalPurchases}
                  onChange={(event) => setTotalPurchases(event.target.value)}
                />
              </Field>

              <Field
                label="Outstanding dues (Rs.)"
                hint="Amount still owed by the customer."
              >
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={dues}
                  onChange={(event) => setDues(event.target.value)}
                />
              </Field>
            </div>
          </div>
        </form>
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