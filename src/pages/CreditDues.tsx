import { useEffect, useMemo, useState, type FormEvent } from "react";
import { insertOwned, supabase } from "../supabase";
import { useToast } from "../components/Toast";
import {
  AlertIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
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
  type BadgeTone,
} from "../components/ui";
import { formatMoney, formatNumber, todayISODate } from "../lib/format";
import { formatDate, toDateInputValue } from "../lib/date";
import {
  computeDueStatus,
  resolveName,
  roundMoney,
  toNumber,
  validateDue,
} from "../lib/inventory";

type Customer = {
  id: number;
  name: string;
};

type Due = {
  id: number;
  customerId: number;
  customer: string;
  totalDue: number;
  paidAmount: number;
  remainingDue: number;
  dueDate: string;
  status: "Pending" | "Partial" | "Paid";
};

const STATUS_TONE: Record<Due["status"], BadgeTone> = {
  Paid: "mint",
  Partial: "yellow",
  Pending: "pink",
};

export default function CreditDues() {
  const toast = useToast();

  const [dues, setDues] = useState<Due[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Due | null>(null);

  const [search, setSearch] = useState("");

  const [customerId, setCustomerId] = useState("");
  const [totalDue, setTotalDue] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAllData = async () => {
    setLoading(true);
    setError("");

    const { data: customersData, error: customersError } =
      await supabase
        .from("customers")
        .select("id, name")
        .order("id", { ascending: true });

    if (customersError) {
      console.error("Customers Error:", customersError);
      setError(customersError.message);
      setLoading(false);
      toast.error("Could not load customers", customersError.message);
      return;
    }

    const { data: duesData, error: duesError } = await supabase
      .from("dues")
      .select(`
        id,
        customer_id,
        total_due,
        paid_amount,
        remaining_due,
        due_date,
        status
      `)
      .order("id", { ascending: true });

    if (duesError) {
      console.error("Dues Error:", duesError);
      setError(duesError.message);
      setLoading(false);
      toast.error("Could not load dues", duesError.message);
      return;
    }

    const customerList: Customer[] = customersData || [];

    const customerNames = new Map(customerList.map((c) => [c.id, c.name]));

    const mappedDues: Due[] = (duesData || []).map((item) => {
      const totalDue = toNumber(item.total_due);
      const paidAmount = toNumber(item.paid_amount);

      const remainingDue = roundMoney(Math.max(0, totalDue - paidAmount));

      return {
        id: toNumber(item.id),
        customerId: toNumber(item.customer_id),
        customer: resolveName(customerNames, item.customer_id, "Customer"),
        totalDue,
        paidAmount,
        remainingDue,
        dueDate: String(item.due_date ?? ""),
        // Derived from the amounts rather than trusting the stored label.
        status: computeDueStatus(totalDue, paidAmount),
      };
    });

    setCustomers(customerList);
    setDues(mappedDues);
    setLoading(false);
  };

  useEffect(() => {
    void loadAllData();
  }, []);

  const openAddForm = () => {
    setEditingId(null);
    setCustomerId("");
    setTotalDue("");
    setPaidAmount("");
    setDueDate(todayISODate());
    setShowForm(true);
  };

  const openEditForm = (due: Due) => {
    setEditingId(due.id);
    setCustomerId(due.customerId.toString());
    setTotalDue(due.totalDue.toString());
    setPaidAmount(due.paidAmount.toString());
    // Normalised so a stored timestamp cannot render as an empty date field.
    setDueDate(toDateInputValue(due.dueDate));
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setSaving(false);
  };

  const saveDue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (saving) return;

    const issues = validateDue({
      customerId,
      totalDue,
      paidAmount,
      dueDate,
    });

    if (issues.length > 0) {
      toast.error(issues[0].message);
      return;
    }

    const total = toNumber(totalDue);
    const paid = toNumber(paidAmount);
    const remaining = roundMoney(Math.max(0, total - paid));
    const status = computeDueStatus(total, paid);

    const dueData = {
      customer_id: Number(customerId),
      total_due: total,
      paid_amount: paid,
      remaining_due: remaining,
      due_date: dueDate,
      status,
    };

    setSaving(true);

    if (editingId !== null) {
      const { data: updatedRows, error: updateError } = await supabase
        .from("dues")
        .update(dueData)
        .eq("id", editingId)
        .select("id");

      if (updateError) {
        console.error("Update Due Error:", updateError);
        toast.error("Could not update due", updateError.message);
        setSaving(false);
        return;
      }

      if (!updatedRows || updatedRows.length === 0) {
        toast.error(
          "Credit record was not saved",
          "No matching row was updated. It may have been deleted, or your account may not have permission to edit it."
        );
        setSaving(false);
        return;
      }

      toast.success("Due updated successfully");
    } else {
      const { error: insertError } = await insertOwned("dues", [dueData]);

      if (insertError) {
        console.error("Add Due Error:", insertError);
        toast.error("Could not add due", insertError.message);
        setSaving(false);
        return;
      }

      toast.success("Due added successfully");
    }

    await loadAllData();
    closeForm();
  };

  const deleteDue = async (due: Due) => {
    setSaving(true);

    const { error: deleteError } = await supabase
      .from("dues")
      .delete()
      .eq("id", due.id)
      .select("id");

    setSaving(false);
    setPendingDelete(null);

    if (deleteError) {
      console.error("Delete Due Error:", deleteError);
      toast.error("Could not delete due", deleteError.message);
      return;
    }

    await loadAllData();
    toast.success("Due deleted successfully");
  };

  const filteredDues = useMemo(() => {
    const term = search.toLowerCase().trim();

    if (!term) return dues;

    return dues.filter((due) => due.customer.toLowerCase().includes(term));
  }, [dues, search]);

  const summary = useMemo(() => {
    let outstanding = 0;
    let paid = 0;
    let pending = 0;
    let settled = 0;

    dues.forEach((due) => {
      outstanding += due.remainingDue;
      paid += due.paidAmount;

      if (due.status === "Pending") pending += 1;
      if (due.status === "Paid") settled += 1;
    });

    return { outstanding, paid, pending, settled };
  }, [dues]);

  const previewRemaining = Math.max(
    (Number(totalDue) || 0) - (Number(paidAmount) || 0),
    0
  );

  return (
    <main className="page-content">
      <PageStack>
        <PageHeader
          title="Credit & Dues"
          description="Track customer credit balances and the payments against them."
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
                Add due
              </Button>
            </>
          }
        />

        {error ? (
          <div className="alert alert-error" role="alert">
            <AlertIcon size={16} />
            <div className="alert-content">
              <strong>Could not load credit records</strong>
              {error}
            </div>
          </div>
        ) : null}

        <div className="stat-grid">
          <StatCard
            label="Total outstanding"
            value={formatMoney(summary.outstanding, 0)}
            tone="pink"
            icon={<AlertIcon size={16} />}
            loading={loading}
            meta="Awaiting collection"
          />

          <StatCard
            label="Total collected"
            value={formatMoney(summary.paid, 0)}
            tone="mint"
            icon={<CheckCircleIcon size={16} />}
            loading={loading}
            meta="Payments received"
          />

          <StatCard
            label="Awaiting payment"
            value={formatNumber(summary.pending)}
            tone="yellow"
            icon={<ClockIcon size={16} />}
            loading={loading}
            meta="Fully unpaid records"
          />

          <StatCard
            label="Settled records"
            value={formatNumber(summary.settled)}
            tone="sky"
            icon={<WalletIcon size={16} />}
            loading={loading}
            meta={`${dues.length} total records`}
          />
        </div>

        <Card>
          <CardHeader
            title="Credit ledger"
            description={`${filteredDues.length} of ${dues.length} records shown`}
            actions={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search customer..."
                label="Search credit records"
              />
            }
          />

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th className="num">Total due</th>
                  <th className="num">Paid</th>
                  <th className="num">Remaining</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th className="actions-cell">Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <SkeletonRows rows={6} />
                ) : filteredDues.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="table-empty-cell">
                      <EmptyState
                        icon={<SearchIcon size={20} />}
                        title={
                          dues.length === 0
                            ? "No credit records"
                            : "No records found"
                        }
                        description={
                          dues.length === 0
                            ? "Record a due when a customer buys on credit."
                            : "Try a different customer name."
                        }
                        action={
                          <Button variant="primary" onClick={openAddForm}>
                            <PlusIcon size={15} />
                            Add due
                          </Button>
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filteredDues.map((due) => (
                    <tr key={due.id}>
                      <td className="cell-primary">{due.customer}</td>

                      <td className="num">{formatMoney(due.totalDue)}</td>

                      <td className="num money-pos">
                        {formatMoney(due.paidAmount)}
                      </td>

                      <td className="num">
                        {due.remainingDue > 0 ? (
                          <span className="money-neg">
                            {formatMoney(due.remainingDue)}
                          </span>
                        ) : (
                          <span className="money-pos">Settled</span>
                        )}
                      </td>

                      <td className="cell-muted">{formatDate(due.dueDate)}</td>

                      <td>
                        <Badge tone={STATUS_TONE[due.status]}>{due.status}</Badge>
                      </td>

                      <td className="actions-cell">
                        <span className="row-actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openEditForm(due)}
                          >
                            <PencilIcon size={14} />
                            Edit
                          </Button>

                          <Button
                            size="sm"
                            variant="soft-danger"
                            onClick={() => setPendingDelete(due)}
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
        title={editingId === null ? "Add new due" : "Edit due"}
        description="Record how much a customer owes and how much they have paid."
        onClose={closeForm}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>

            <Button
              variant="primary"
              type="submit"
              form="due-form"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : editingId === null
                  ? "Save due"
                  : "Update due"}
            </Button>
          </>
        }
      >
        <form id="due-form" className="modal-form" onSubmit={saveDue}>
          <div className="modal-body">
            <div className="form-grid">
              <Field label="Customer" required className="span-2">
                <Select
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                >
                  <option value="">Select customer</option>

                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Total due (Rs.)" required>
                <Input
                  type="number"
                  min="0"
                  placeholder="0.00"
                  value={totalDue}
                  onChange={(event) => setTotalDue(event.target.value)}
                />
              </Field>

              <Field
                label="Paid amount (Rs.)"
                hint={`Remaining: ${formatMoney(previewRemaining)}`}
              >
                <Input
                  type="number"
                  min="0"
                  placeholder="0.00"
                  value={paidAmount}
                  onChange={(event) => setPaidAmount(event.target.value)}
                />
              </Field>

              <Field label="Due date" required>
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
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    style={{ paddingLeft: 34 }}
                  />
                </span>
              </Field>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        busy={saving}
        title="Delete credit record"
        description={`The record for "${pendingDelete?.customer ?? ""}" will be permanently removed.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void deleteDue(pendingDelete);
        }}
      />
    </main>
  );
}