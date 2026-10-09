import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../supabase";

type Supplier = {
  id: number;
  company: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
};

function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] =
    useState<number | null>(null);

  const [search, setSearch] = useState("");

  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  const [loading, setLoading] = useState(true);

  // LOAD SUPPLIERS FROM SUPABASE
  const loadSuppliers = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.error("Load Suppliers Error:", error);
      alert("Failed to load suppliers from database.");
      setLoading(false);
      return;
    }

    setSuppliers(data || []);
    setLoading(false);
  };

  // LOAD WHEN PAGE OPENS
  useEffect(() => {
    loadSuppliers();
  }, []);

  // ADD SUPPLIER FORM
  const openAddForm = () => {
    setEditingId(null);
    setCompany("");
    setContact("");
    setPhone("");
    setEmail("");
    setAddress("");
    setShowForm(true);
  };

  // EDIT SUPPLIER FORM
  const openEditForm = (supplier: Supplier) => {
    setEditingId(supplier.id);
    setCompany(supplier.company);
    setContact(supplier.contact);
    setPhone(supplier.phone);
    setEmail(supplier.email);
    setAddress(supplier.address);
    setShowForm(true);
  };

  // CLOSE FORM
  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setCompany("");
    setContact("");
    setPhone("");
    setEmail("");
    setAddress("");
  };

  // SAVE / UPDATE SUPPLIER
  const saveSupplier = async (e: FormEvent) => {
    e.preventDefault();

    if (!company.trim() || !contact.trim() || !phone.trim()) {
      alert("Please fill Company, Contact Person and Phone.");
      return;
    }

    // UPDATE
    if (editingId !== null) {
      const { error } = await supabase
        .from("suppliers")
        .update({
          company: company.trim(),
          contact: contact.trim(),
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
        })
        .eq("id", editingId);

      if (error) {
        console.error("Update Supplier Error:", error);
        alert("Failed to update supplier.");
        return;
      }

      setSuppliers((current) =>
        current.map((supplier) =>
          supplier.id === editingId
            ? {
                ...supplier,
                company: company.trim(),
                contact: contact.trim(),
                phone: phone.trim(),
                email: email.trim(),
                address: address.trim(),
              }
            : supplier
        )
      );

      alert("Supplier updated successfully!");
    } else {
      // ADD
      const { data, error } = await supabase
        .from("suppliers")
        .insert([
          {
            company: company.trim(),
            contact: contact.trim(),
            phone: phone.trim(),
            email: email.trim(),
            address: address.trim(),
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Add Supplier Error:", error);
        alert("Failed to add supplier.");
        return;
      }

      setSuppliers((current) => [
        ...current,
        data,
      ]);

      alert("Supplier added successfully!");
    }

    closeForm();
  };

  // DELETE SUPPLIER
  const deleteSupplier = async (id: number) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this supplier?"
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from("suppliers")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Delete Supplier Error:", error);
      alert("Failed to delete supplier.");
      return;
    }

    setSuppliers((current) =>
      current.filter((supplier) => supplier.id !== id)
    );

    alert("Supplier deleted successfully!");
  };

  // SEARCH
  const filteredSuppliers = suppliers.filter((supplier) =>
    `${supplier.company} ${supplier.contact} ${supplier.phone}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <div className="suppliers-page">

      <div className="suppliers-header">
        <div>
          <h1>Suppliers</h1>
          <p>Manage your suppliers and vendors</p>
        </div>

        <button
          type="button"
          className="add-supplier-btn"
          onClick={openAddForm}
        >
          + Add Supplier
        </button>
      </div>

      {showForm && (
        <div className="supplier-form-card">

          <div className="supplier-form-header">
            <div>
              <h2>
                {editingId === null
                  ? "Add New Supplier"
                  : "Edit Supplier"}
              </h2>

              <p>Enter supplier information</p>
            </div>

            <button
              type="button"
              className="close-supplier-form"
              onClick={closeForm}
            >
              ✕
            </button>
          </div>

          <form onSubmit={saveSupplier}>

            <div className="supplier-form-grid">

              <div className="supplier-form-group">
                <label>Company Name</label>

                <input
                  type="text"
                  placeholder="Enter company name"
                  value={company}
                  onChange={(e) =>
                    setCompany(e.target.value)
                  }
                />
              </div>

              <div className="supplier-form-group">
                <label>Contact Person</label>

                <input
                  type="text"
                  placeholder="Enter contact person"
                  value={contact}
                  onChange={(e) =>
                    setContact(e.target.value)
                  }
                />
              </div>

              <div className="supplier-form-group">
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

              <div className="supplier-form-group">
                <label>Email</label>

                <input
                  type="email"
                  placeholder="supplier@email.com"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                />
              </div>

              <div className="supplier-form-group supplier-full-width">
                <label>Address</label>

                <input
                  type="text"
                  placeholder="Enter supplier address"
                  value={address}
                  onChange={(e) =>
                    setAddress(e.target.value)
                  }
                />
              </div>

            </div>

            <div className="supplier-form-actions">

              <button
                type="button"
                className="supplier-cancel-btn"
                onClick={closeForm}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="save-supplier-btn"
              >
                {editingId === null
                  ? "Save Supplier"
                  : "Update Supplier"}
              </button>

            </div>

          </form>
        </div>
      )}

      <div className="suppliers-toolbar">

        <input
          type="text"
          placeholder="🔍 Search suppliers..."
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
        />

        <span>
          {filteredSuppliers.length} Suppliers
        </span>

      </div>

      <div className="suppliers-table-container">

        <table className="suppliers-table">

          <thead>
            <tr>
              <th>Company</th>
              <th>Contact Person</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Address</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>

            {loading ? (

              <tr>
                <td colSpan={6} className="no-suppliers">
                  Loading suppliers...
                </td>
              </tr>

            ) : filteredSuppliers.length === 0 ? (

              <tr>
                <td colSpan={6} className="no-suppliers">
                  No suppliers found.
                </td>
              </tr>

            ) : (

              filteredSuppliers.map((supplier) => (
                <tr key={supplier.id}>

                  <td>
                    <strong>{supplier.company}</strong>
                  </td>

                  <td>{supplier.contact}</td>

                  <td>{supplier.phone}</td>

                  <td>{supplier.email || "-"}</td>

                  <td>{supplier.address || "-"}</td>

                  <td>
                    <div className="supplier-actions">

                      <button
                        type="button"
                        className="supplier-edit-btn"
                        onClick={() =>
                          openEditForm(supplier)
                        }
                      >
                        ✏️ Edit
                      </button>

                      <button
                        type="button"
                        className="supplier-delete-btn"
                        onClick={() =>
                          deleteSupplier(supplier.id)
                        }
                      >
                        🗑️ Delete
                      </button>

                    </div>
                  </td>

                </tr>
              ))

            )}

          </tbody>

        </table>

      </div>

    </div>
  );
}

export default Suppliers;