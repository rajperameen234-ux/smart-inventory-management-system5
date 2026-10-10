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
  TruckIcon,
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
import { formatNumber, initials, toNumber } from "../lib/format";

type Supplier = {
  id: number;
  company: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
};

export default function Suppliers({
  searchSeed = "",
}: {
  searchSeed?: string;
}) {
  const toast = useToast();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState(searchSeed);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Supplier | null>(null);

  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (searchSeed) setSearch(searchSeed);
  }, [searchSeed]);

  const loadSuppliers = async () => {
    setLoading(true);
    setError("");

    const { data, error: loadError } = await supabase
      .from("suppliers")
      .select("*")
      .order("id", { ascending: true });

    if (loadError) {
      console.error("Load Suppliers Error:", loadError);
      setError(loadError.message);
      setLoading(false);
      toast.error("Could not load suppliers", loadError.message);
      return;
    }

    setSuppliers((data || []) as Supplier[]);
    setLoading(false);
  };

  useEffect(() => {
    void loadSuppliers();
  }, []);

  const openAddForm = () => {
    setEditingId(null);
    setCompany("");
    setContact("");
    setPhone("");
    setEmail("");
    setAddress("");
    setShowForm(true);
  };

  const openEditForm = (supplier: Supplier) => {
    setEditingId(supplier.id);
    setCompany(supplier.company);
    setContact(supplier.contact);
    setPhone(supplier.phone);
    setEmail(supplier.email);
    setAddress(supplier.address);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setSaving(false);
  };

  const supplierPayload = () => ({
    company: company.trim(),
    contact: contact.trim(),
    phone: phone.trim(),
    email: email.trim(),
    address: address.trim(),
  });

  const saveSupplier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!company.trim() || !contact.trim() || !phone.trim()) {
      toast.error(
        "Missing details",
        "Please fill Company, Contact Person and Phone."
      );
      return;
    }

    if (saving) return;

    setSaving(true);

    const supplierData = supplierPayload();

    if (editingId !== null) {
      const { data: updatedRows, error: updateError } = await supabase
        .from("suppliers")
        .update(supplierData)
        .eq("id", editingId)
        .select("id");

      if (updateError) {
        console.error("Update Supplier Error:", updateError);
        toast.error("Could not update supplier", updateError.message);
        setSaving(false);
        return;
      }

      if (!updatedRows || updatedRows.length === 0) {
        toast.error(
          "Supplier was not saved",
          "No matching row was updated. It may have been deleted, or your account may not have permission to edit it."
        );
        setSaving(false);
        return;
      }

      setSuppliers((current) =>
        current.map((supplier) =>
          supplier.id === editingId
            ? { ...supplier, ...supplierData }
            : supplier
        )
      );

      toast.success("Supplier updated", supplierData.company);
    } else {
      const { data, error: insertError } = await insertOwned("suppliers", [
        supplierData,
      ]);

      if (insertError) {
        console.error("Add Supplier Error:", insertError);
        toast.error("Could not add supplier", insertError.message);
        setSaving(false);
        return;
      }

      // Never push a null row into local state if the insert returned nothing.
      const row = (data ?? supplierData) as Supplier;

      setSuppliers((current) => [
        ...current,
        { ...row, id: toNumber(row.id) },
      ]);
      toast.success("Supplier added", supplierData.company);
    }

    closeForm();
  };

  const deleteSupplier = async (supplier: Supplier) => {
    setSaving(true);

    const { error: deleteError } = await supabase
      .from("suppliers")
      .delete()
      .eq("id", supplier.id)
      .select("id");

    setSaving(false);
    setPendingDelete(null);

    if (deleteError) {
      console.error("Delete Supplier Error:", deleteError);
      toast.error("Could not delete supplier", deleteError.message);
      return;
    }

    setSuppliers((current) =>
      current.filter((item) => item.id !== supplier.id)
    );

    toast.success("Supplier deleted", supplier.company);
  };

  const filteredSuppliers = useMemo(() => {
    const term = search.toLowerCase().trim();

    if (!term) return suppliers;

    return suppliers.filter((supplier) =>
      `${supplier.company} ${supplier.contact} ${supplier.phone} ${supplier.email}`
        .toLowerCase()
        .includes(term)
    );
  }, [suppliers, search]);

  const withEmail = suppliers.filter((item) => item.email?.trim()).length;

  return (
    <main className="page-content">
      <PageStack>
        <PageHeader
          title="Suppliers"
          description="Keep every vendor, contact and delivery address in one place."
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => void loadSuppliers()}
                disabled={loading}
              >
                <RefreshIcon size={15} />
                Refresh
              </Button>

              <Button variant="primary" onClick={openAddForm}>
                <PlusIcon size={15} />
                Add supplier
              </Button>
            </>
          }
        />

        {error ? (
          <div className="alert alert-error" role="alert">
            <AlertIcon size={16} />
            <div className="alert-content">
              <strong>Could not load suppliers</strong>
              {error}
            </div>
          </div>
        ) : null}

        <div className="stat-grid">
          <StatCard
            label="Total suppliers"
            value={formatNumber(suppliers.length)}
            tone="sky"
            icon={<TruckIcon size={16} />}
            loading={loading}
            meta="Active vendor partners"
          />

          <StatCard
            label="With email on file"
            value={formatNumber(withEmail)}
            tone="lavender"
            icon={<MailIcon size={16} />}
            loading={loading}
            meta="Reachable by email"
          />
        </div>

        <Card>
          <CardHeader
            title="Supplier directory"
            description={`${filteredSuppliers.length} of ${suppliers.length} shown`}
            actions={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search suppliers..."
                label="Search suppliers"
              />
            }
          />

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Contact person</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Address</th>
                  <th className="actions-cell">Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <SkeletonRows rows={6} />
                ) : filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-empty-cell">
                      <EmptyState
                        icon={<SearchIcon size={20} />}
                        title={
                          suppliers.length === 0
                            ? "No suppliers yet"
                            : "No suppliers found"
                        }
                        description={
                          suppliers.length === 0
                            ? "Add your first vendor to start tracking purchase partners."
                            : "Try adjusting your search term."
                        }
                        action={
                          <Button variant="primary" onClick={openAddForm}>
                            <PlusIcon size={15} />
                            Add supplier
                          </Button>
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map((supplier) => (
                    <tr key={supplier.id}>
                      <td>
                        <span className="cell-stack">
                          <strong className="cell-primary">
                            {supplier.company}
                          </strong>
                          <small>Supplier #{supplier.id}</small>
                        </span>
                      </td>

                      <td className="cell-primary">{supplier.contact}</td>

                      <td>
                        <span className="cell-stack">
                          <span>{supplier.phone || "â€”"}</span>
                        </span>
                      </td>

                      <td>
                        {supplier.email ? (
                          <a
                            href={`mailto:${supplier.email}`}
                            style={{ fontSize: 13 }}
                          >
                            {supplier.email}
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
                          {supplier.address || "â€”"}
                        </span>
                      </td>

                      <td className="actions-cell">
                        <span className="row-actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openEditForm(supplier)}
                          >
                            <PencilIcon size={14} />
                            Edit
                          </Button>

                          <Button
                            size="sm"
                            variant="soft-danger"
                            onClick={() => setPendingDelete(supplier)}
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

        {filteredSuppliers.length > 0 ? (
          <div className="equal-grid">
            {filteredSuppliers.slice(0, 6).map((supplier) => (
              <Card key={`card-${supplier.id}`}>
                <CardBody>
                  <div className="tile-head">
                    <span className="avatar avatar-lg">
                      {initials(supplier.company)}
                    </span>

                    <div className="tile-body">
                      <h4>{supplier.company}</h4>
                      <p>{supplier.contact || "No contact on file"}</p>
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
                    {supplier.phone ? (
                      <Badge tone="neutral" plain>
                        <PhoneIcon size={12} />
                        {supplier.phone}
                      </Badge>
                    ) : null}

                    {supplier.email ? (
                      <Badge tone="neutral" plain>
                        <MailIcon size={12} />
                        {supplier.email}
                      </Badge>
                    ) : null}

                    {supplier.address ? (
                      <Badge tone="neutral" plain>
                        <MapPinIcon size={12} />
                        {supplier.address}
                      </Badge>
                    ) : null}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        ) : null}
      </PageStack>

      <Modal
        open={showForm}
        title={editingId === null ? "Add new supplier" : "Edit supplier"}
        description="Record the vendor's company, contact and delivery details."
        onClose={closeForm}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>

            <Button
              variant="primary"
              type="submit"
              form="supplier-form"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : editingId === null
                  ? "Save supplier"
                  : "Update supplier"}
            </Button>
          </>
        }
      >
        <form id="supplier-form" className="modal-form" onSubmit={saveSupplier}>
          <div className="modal-body">
            <div className="form-grid">
              <Field label="Company name" required>
                <Input
                  type="text"
                  placeholder="Enter company name"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  required
                />
              </Field>

              <Field label="Contact person" required>
                <Input
                  type="text"
                  placeholder="Full name"
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
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
                  placeholder="supplier@email.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>

              <Field label="Address" className="span-2">
                <Textarea
                  placeholder="Enter supplier address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  rows={2}
                />
              </Field>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        busy={saving}
        title="Delete supplier"
        description={`"${pendingDelete?.company ?? ""}" will be permanently removed from your vendor list.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void deleteSupplier(pendingDelete);
        }}
      />
    </main>
  );
}