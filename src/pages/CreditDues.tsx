import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../supabase";

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

function CreditDues() {
  const [dues, setDues] = useState<Due[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");

  const [customerId, setCustomerId] = useState("");
  const [totalDue, setTotalDue] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadAllData = async () => {
    setLoading(true);

    const { data: customersData, error: customersError } =
      await supabase
        .from("customers")
        .select("id, name")
        .order("id", { ascending: true });

    if (customersError) {
      console.error("Customers Error:", customersError);
      alert("Failed to load customers.");
      setLoading(false);
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
      alert("Failed to load dues.");
      setLoading(false);
      return;
    }

    const customerList: Customer[] = customersData || [];

    const mappedDues: Due[] = (duesData || []).map((item) => {
      const customer = customerList.find(
        (c) => c.id === item.customer_id
      );

      const statusValue =
        item.status === "Paid" ||
        item.status === "Partial" ||
        item.status === "Pending"
          ? item.status
          : "Pending";

      return {
        id: item.id,
        customerId: item.customer_id,
        customer: customer
          ? customer.name
          : `Customer #${item.customer_id}`,
        totalDue: Number(item.total_due) || 0,
        paidAmount: Number(item.paid_amount) || 0,
        remainingDue: Number(item.remaining_due) || 0,
        dueDate: item.due_date || "",
        status: statusValue,
      };
    });

    setCustomers(customerList);
    setDues(mappedDues);
    setLoading(false);
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const openAddForm = () => {
    setEditingId(null);
    setCustomerId("");
    setTotalDue("");
    setPaidAmount("");
    setDueDate(new Date().toISOString().split("T")[0]);
    setShowForm(true);
  };

  const openEditForm = (due: Due) => {
    setEditingId(due.id);
    setCustomerId(due.customerId.toString());
    setTotalDue(due.totalDue.toString());
    setPaidAmount(due.paidAmount.toString());
    setDueDate(due.dueDate);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setCustomerId("");
    setTotalDue("");
    setPaidAmount("");
    setDueDate("");
  };

  const saveDue = async (e: FormEvent) => {
    e.preventDefault();

    if (!customerId) {
      alert("Please select a customer.");
      return;
    }

    if (!totalDue || Number(totalDue) <= 0) {
      alert("Please enter total due amount.");
      return;
    }

    const total = Number(totalDue);
    const paid = Number(paidAmount) || 0;

    if (paid < 0) {
      alert("Paid amount cannot be negative.");
      return;
    }

    if (paid > total) {
      alert("Paid amount cannot be greater than total due.");
      return;
    }

    if (!dueDate) {
      alert("Please select due date.");
      return;
    }

    const remaining = total - paid;

    let status: Due["status"];

    if (remaining === 0) {
      status = "Paid";
    } else if (paid > 0) {
      status = "Partial";
    } else {
      status = "Pending";
    }

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
      const { error } = await supabase
        .from("dues")
        .update(dueData)
        .eq("id", editingId);

      if (error) {
        console.error("Update Due Error:", error);
        alert("Failed to update due.");
        setSaving(false);
        return;
      }

      alert("Due updated successfully.");
    } else {
      const { error } = await supabase
        .from("dues")
        .insert([dueData]);

      if (error) {
        console.error("Add Due Error:", error);
        alert("Failed to add due.");
        setSaving(false);
        return;
      }

      alert("Due added successfully.");
    }

    await loadAllData();

    setSaving(false);
    closeForm();
  };

  const deleteDue = async (id: number) => {
    if (
      window.confirm(
        "Are you sure you want to delete this due?"
      )
    ) {
      const { error } = await supabase
        .from("dues")
        .delete()
        .eq("id", id);

      if (error) {
        console.error("Delete Due Error:", error);
        alert("Failed to delete due.");
        return;
      }

      await loadAllData();
      alert("Due deleted successfully.");
    }
  };

  const filteredDues = dues.filter((due) =>
    due.customer
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const totalOutstanding = dues.reduce(
    (sum, due) => sum + due.remainingDue,
    0
  );

  const totalPaid = dues.reduce(
    (sum, due) => sum + due.paidAmount,
    0
  );

  return (
    <div className="dues-page">
      <div className="dues-header">
        <div>
          <h1>Credit / Dues</h1>
          <p>Manage customer credit and outstanding payments</p>
        </div>

        <button
          type="button"
          className="add-due-btn"
          onClick={openAddForm}
        >
          + Add Due
        </button>
      </div>

      <div className="dues-summary">
        <div className="due-summary-card">
          <div className="due-summary-icon red">💰</div>
          <div>
            <p>Total Outstanding</p>
            <h2>Rs. {totalOutstanding.toLocaleString()}</h2>
          </div>
        </div>

        <div className="due-summary-card">
          <div className="due-summary-icon green">✓</div>
          <div>
            <p>Total Paid</p>
            <h2>Rs. {totalPaid.toLocaleString()}</h2>
          </div>
        </div>

        <div className="due-summary-card">
          <div className="due-summary-icon blue">👥</div>
          <div>
            <p>Total Records</p>
            <h2>{dues.length}</h2>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="due-form-card">
          <div className="due-form-header">
            <div>
              <h2>
                {editingId === null
                  ? "Add New Due"
                  : "Edit Due"}
              </h2>

              <p>Enter customer payment details</p>
            </div>

            <button
              type="button"
              className="close-due-form"
              onClick={closeForm}
            >
              ✕
            </button>
          </div>

          <form onSubmit={saveDue}>
            <div className="due-form-grid">
              <div className="due-form-group">
                <label>Customer</label>

                <select
                  value={customerId}
                  onChange={(e) =>
                    setCustomerId(e.target.value)
                  }
                >
                  <option value="">
                    Select Customer
                  </option>

                  {customers.map((customer) => (
                    <option
                      key={customer.id}
                      value={customer.id}
                    >
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="due-form-group">
                <label>Total Due</label>

                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={totalDue}
                  onChange={(e) =>
                    setTotalDue(e.target.value)
                  }
                />
              </div>

              <div className="due-form-group">
                <label>Paid Amount</label>

                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={paidAmount}
                  onChange={(e) =>
                    setPaidAmount(e.target.value)
                  }
                />
              </div>

              <div className="due-form-group">
                <label>Due Date</label>

                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) =>
                    setDueDate(e.target.value)
                  }
                />
              </div>
            </div>

            <div className="due-form-actions">
              <button
                type="button"
                className="due-cancel-btn"
                onClick={closeForm}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="save-due-btn"
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : editingId === null
                  ? "Save Due"
                  : "Update Due"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="dues-toolbar">
        <input
          type="text"
          placeholder="Search customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <span>
          {filteredDues.length} record
          {filteredDues.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="dues-table-container">
        <table className="dues-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Total Due</th>
              <th>Paid</th>
              <th>Remaining</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="no-dues">
                  Loading dues...
                </td>
              </tr>
            ) : filteredDues.length > 0 ? (
              filteredDues.map((due) => (
                <tr key={due.id}>
                  <td>
                    <strong>{due.customer}</strong>
                  </td>

                  <td>
                    Rs. {due.totalDue.toLocaleString()}
                  </td>

                  <td>
                    Rs. {due.paidAmount.toLocaleString()}
                  </td>

                  <td>
                    <span
                      className={
                        due.remainingDue > 0
                          ? "remaining-due"
                          : "remaining-paid"
                      }
                    >
                      Rs.{" "}
                      {due.remainingDue.toLocaleString()}
                    </span>
                  </td>

                  <td>{due.dueDate}</td>

                  <td>
                    <span
                      className={`due-status ${due.status.toLowerCase()}`}
                    >
                      {due.status}
                    </span>
                  </td>

                  <td>
                    <div className="due-actions">
                      <button
                        type="button"
                        className="due-edit-btn"
                        onClick={() =>
                          openEditForm(due)
                        }
                      >
                        ✏️ Edit
                      </button>

                      <button
                        type="button"
                        className="due-delete-btn"
                        onClick={() =>
                          deleteDue(due.id)
                        }
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={7}
                  className="no-dues"
                >
                  No dues found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CreditDues;