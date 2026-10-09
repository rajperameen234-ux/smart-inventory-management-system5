import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../supabase";

type Customer = {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  totalPurchases: number;
  dues: number;
};

function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] =
    useState<number | null>(null);

  const [search, setSearch] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [totalPurchases, setTotalPurchases] = useState("");
  const [dues, setDues] = useState("");

  const [loading, setLoading] = useState(true);

  // LOAD CUSTOMERS FROM SUPABASE
  const loadCustomers = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.error("Load Customers Error:", error);
      alert("Failed to load customers from database.");
      setLoading(false);
      return;
    }

    const formattedCustomers: Customer[] = (data || []).map(
      (customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone || "",
        email: customer.email || "",
        address: customer.address || "",
        totalPurchases: Number(customer.total_purchases) || 0,
        dues: Number(customer.dues) || 0,
      })
    );

    setCustomers(formattedCustomers);
    setLoading(false);
  };

  // LOAD WHEN PAGE OPENS
  useEffect(() => {
    loadCustomers();
  }, []);

  // ADD CUSTOMER FORM
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

  // EDIT CUSTOMER FORM
  const openEditForm = (customer: Customer) => {
    setEditingId(customer.id);
    setName(customer.name);
    setPhone(customer.phone);
    setEmail(customer.email);
    setAddress(customer.address);
    setTotalPurchases(
      customer.totalPurchases.toString()
    );
    setDues(customer.dues.toString());
    setShowForm(true);
  };

  // CLOSE FORM
  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setTotalPurchases("");
    setDues("");
  };

  // SAVE / UPDATE CUSTOMER
  const saveCustomer = async (e: FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert("Please enter customer name.");
      return;
    }

    if (!phone.trim()) {
      alert("Please enter phone number.");
      return;
    }

    const customerData = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      total_purchases:
        Number(totalPurchases) || 0,
      dues: Number(dues) || 0,
    };

    // UPDATE CUSTOMER
    if (editingId !== null) {
      const { error } = await supabase
        .from("customers")
        .update(customerData)
        .eq("id", editingId);

      if (error) {
        console.error(
          "Update Customer Error:",
          error
        );
        alert("Failed to update customer.");
        return;
      }

      setCustomers((currentCustomers) =>
        currentCustomers.map((customer) =>
          customer.id === editingId
            ? {
                ...customer,
                name: customerData.name,
                phone: customerData.phone,
                email: customerData.email,
                address: customerData.address,
                totalPurchases:
                  customerData.total_purchases,
                dues: customerData.dues,
              }
            : customer
        )
      );

      alert("Customer updated successfully!");
    } else {
      // ADD CUSTOMER
      const { data, error } = await supabase
        .from("customers")
        .insert([customerData])
        .select()
        .single();

      if (error) {
        console.error(
          "Add Customer Error:",
          error
        );
        alert("Failed to add customer.");
        return;
      }

      const newCustomer: Customer = {
        id: data.id,
        name: data.name,
        phone: data.phone || "",
        email: data.email || "",
        address: data.address || "",
        totalPurchases:
          Number(data.total_purchases) || 0,
        dues: Number(data.dues) || 0,
      };

      setCustomers((currentCustomers) => [
        ...currentCustomers,
        newCustomer,
      ]);

      alert("Customer added successfully!");
    }

    closeForm();
  };

  // DELETE CUSTOMER
  const deleteCustomer = async (id: number) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this customer?"
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(
        "Delete Customer Error:",
        error
      );
      alert("Failed to delete customer.");
      return;
    }

    setCustomers((currentCustomers) =>
      currentCustomers.filter(
        (customer) => customer.id !== id
      )
    );

    alert("Customer deleted successfully!");
  };

  // SEARCH
  const filteredCustomers = customers.filter(
    (customer) => {
      const searchText = search.toLowerCase();

      return (
        customer.name
          .toLowerCase()
          .includes(searchText) ||
        customer.phone
          .toLowerCase()
          .includes(searchText) ||
        customer.email
          .toLowerCase()
          .includes(searchText) ||
        customer.address
          .toLowerCase()
          .includes(searchText)
      );
    }
  );

  return (
    <div className="customers-page">

      <div className="customers-header">
        <div>
          <h1>Customers</h1>
          <p>
            Manage your customers and their account information
          </p>
        </div>

        <button
          type="button"
          className="add-customer-btn"
          onClick={openAddForm}
        >
          + Add Customer
        </button>
      </div>

      {showForm && (
        <div className="customer-form-card">

          <div className="customer-form-header">
            <div>
              <h2>
                {editingId === null
                  ? "Add New Customer"
                  : "Edit Customer"}
              </h2>

              <p>Enter customer information</p>
            </div>

            <button
              type="button"
              className="close-customer-form"
              onClick={closeForm}
            >
              ✕
            </button>
          </div>

          <form onSubmit={saveCustomer}>

            <div className="customer-form-grid">

              <div className="customer-form-group">
                <label>Customer Name</label>

                <input
                  type="text"
                  placeholder="Enter customer name"
                  value={name}
                  onChange={(e) =>
                    setName(e.target.value)
                  }
                />
              </div>

              <div className="customer-form-group">
                <label>Phone</label>

                <input
                  type="text"
                  placeholder="0300-1234567"
                  value={phone}
                  onChange={(e) =>
                    setPhone(e.target.value)
                  }
                />
              </div>

              <div className="customer-form-group">
                <label>Email</label>

                <input
                  type="email"
                  placeholder="customer@example.com"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                />
              </div>

              <div className="customer-form-group">
                <label>Address</label>

                <input
                  type="text"
                  placeholder="Enter address"
                  value={address}
                  onChange={(e) =>
                    setAddress(e.target.value)
                  }
                />
              </div>

              <div className="customer-form-group">
                <label>Total Purchases</label>

                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={totalPurchases}
                  onChange={(e) =>
                    setTotalPurchases(
                      e.target.value
                    )
                  }
                />
              </div>

              <div className="customer-form-group">
                <label>Outstanding Dues</label>

                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={dues}
                  onChange={(e) =>
                    setDues(e.target.value)
                  }
                />
              </div>

            </div>

            <div className="customer-form-actions">

              <button
                type="button"
                className="customer-cancel-btn"
                onClick={closeForm}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="save-customer-btn"
              >
                {editingId === null
                  ? "Save Customer"
                  : "Update Customer"}
              </button>

            </div>

          </form>
        </div>
      )}

      <div className="customers-toolbar">

        <input
          type="text"
          placeholder="Search customers..."
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
        />

        <span>
          {filteredCustomers.length} customer
          {filteredCustomers.length !== 1
            ? "s"
            : ""}
        </span>

      </div>

      <div className="customers-table-container">

        <table className="customers-table">

          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Address</th>
              <th>Total Purchases</th>
              <th>Outstanding</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>

            {loading ? (

              <tr>
                <td
                  colSpan={7}
                  className="no-customers"
                >
                  Loading customers...
                </td>
              </tr>

            ) : filteredCustomers.length > 0 ? (

              filteredCustomers.map((customer) => (
                <tr key={customer.id}>

                  <td>
                    <strong>
                      {customer.name}
                    </strong>
                  </td>

                  <td>{customer.phone}</td>

                  <td>
                    {customer.email || "-"}
                  </td>

                  <td>
                    {customer.address || "-"}
                  </td>

                  <td>
                    Rs.{" "}
                    {customer.totalPurchases.toLocaleString()}
                  </td>

                  <td>
                    <span
                      className={
                        customer.dues > 0
                          ? "customer-due"
                          : "customer-paid"
                      }
                    >
                      Rs.{" "}
                      {customer.dues.toLocaleString()}
                    </span>
                  </td>

                  <td>
                    <div className="customer-actions">

                      <button
                        type="button"
                        className="customer-edit-btn"
                        onClick={() =>
                          openEditForm(customer)
                        }
                      >
                        ✏️ Edit
                      </button>

                      <button
                        type="button"
                        className="customer-delete-btn"
                        onClick={() =>
                          deleteCustomer(
                            customer.id
                          )
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
                  className="no-customers"
                >
                  No customers found.
                </td>
              </tr>

            )}

          </tbody>

        </table>

      </div>

    </div>
  );
}

export default Customers;