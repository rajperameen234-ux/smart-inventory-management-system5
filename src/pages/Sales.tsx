import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../supabase";

type Sale = {
  id: number;
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
};

function Sales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [search, setSearch] = useState("");

  // Store selected database IDs
  const [customerId, setCustomerId] = useState("");
  const [productId, setProductId] = useState("");

  const [quantity, setQuantity] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [date, setDate] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // =========================
  // LOAD ALL DATA
  // =========================

  const loadAllData = async () => {
    setLoading(true);

    try {
      // Load customers
      const {
        data: customersData,
        error: customersError,
      } = await supabase
        .from("customers")
        .select("id, name")
        .order("id", { ascending: true });

      if (customersError) {
        console.error("Load Customers Error:", customersError);
        alert("Failed to load customers.");
        return;
      }

      // Load products
      const {
        data: productsData,
        error: productsError,
      } = await supabase
        .from("products")
        .select("id, name")
        .order("id", { ascending: true });

      if (productsError) {
        console.error("Load Products Error:", productsError);
        alert("Failed to load products.");
        return;
      }

      // Load sales
      const {
        data: salesData,
        error: salesError,
      } = await supabase
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
        .order("id", { ascending: true });

      if (salesError) {
        console.error("Load Sales Error:", salesError);

        alert(
          `Failed to load sales: ${salesError.message}`
        );

        return;
      }

      const customerList =
        (customersData || []) as Customer[];

      const productList =
        (productsData || []) as Product[];

      const formattedSales: Sale[] =
        (salesData || []).map((sale) => {
          const foundCustomer =
            customerList.find(
              (item) =>
                Number(item.id) ===
                Number(sale.customer_id)
            );

          const foundProduct =
            productList.find(
              (item) =>
                Number(item.id) ===
                Number(sale.product_id)
            );

          return {
            id: Number(sale.id),

            customer:
              foundCustomer?.name ||
              `Customer #${sale.customer_id}`,

            product:
              foundProduct?.name ||
              `Product #${sale.product_id}`,

            quantity:
              Number(sale.quantity) || 0,

            totalAmount:
              Number(sale.total_amount) || 0,

            paidAmount:
              Number(sale.paid_amount) || 0,

            dueAmount:
              Number(sale.due_amount) || 0,

            date:
              sale.sale_date || "",
          };
        });

      setCustomers(customerList);
      setProducts(productList);
      setSales(formattedSales);

      console.log(
        "Customers loaded:",
        customerList
      );

      console.log(
        "Products loaded:",
        productList
      );

      console.log(
        "Sales loaded from Supabase:",
        formattedSales
      );
    } catch (error) {
      console.error(
        "Unexpected Load Error:",
        error
      );

      alert(
        "Something went wrong while loading data."
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // INITIAL LOAD
  // =========================

  useEffect(() => {
    loadAllData();
  }, []);

  // =========================
  // OPEN ADD FORM
  // =========================

  const openAddForm = () => {
    setEditingId(null);

    setCustomerId("");
    setProductId("");
    setQuantity("");
    setTotalAmount("");
    setPaidAmount("");

    setDate(
      new Date()
        .toISOString()
        .split("T")[0]
    );

    setShowForm(true);
  };

  // =========================
  // OPEN EDIT FORM
  // =========================

  const openEditForm = (sale: Sale) => {
    setEditingId(sale.id);

    // Find customer ID from customer name
    const selectedCustomer =
      customers.find(
        (item) =>
          item.name === sale.customer
      );

    // Find product ID from product name
    const selectedProduct =
      products.find(
        (item) =>
          item.name === sale.product
      );

    setCustomerId(
      selectedCustomer
        ? String(selectedCustomer.id)
        : ""
    );

    setProductId(
      selectedProduct
        ? String(selectedProduct.id)
        : ""
    );

    setQuantity(
      sale.quantity.toString()
    );

    setTotalAmount(
      sale.totalAmount.toString()
    );

    setPaidAmount(
      sale.paidAmount.toString()
    );

    setDate(sale.date);

    setShowForm(true);
  };

  // =========================
  // CLOSE FORM
  // =========================

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);

    setCustomerId("");
    setProductId("");
    setQuantity("");
    setTotalAmount("");
    setPaidAmount("");
    setDate("");
  };

  // =========================
  // SAVE SALE
  // =========================

  const saveSale = async (e: FormEvent) => {
    e.preventDefault();

    if (saving) {
      return;
    }

    // Validation
    if (!customerId) {
      alert("Please select a customer.");
      return;
    }

    if (!productId) {
      alert("Please select a product.");
      return;
    }

    if (
      !quantity ||
      Number(quantity) <= 0
    ) {
      alert("Please enter a valid quantity.");
      return;
    }

    if (
      !totalAmount ||
      Number(totalAmount) <= 0
    ) {
      alert("Please enter total amount.");
      return;
    }

    if (!date) {
      alert("Please select sale date.");
      return;
    }

    const total = Number(totalAmount);
    const paid = Number(paidAmount) || 0;

    if (paid < 0) {
      alert(
        "Paid amount cannot be negative."
      );
      return;
    }

    if (paid > total) {
      alert(
        "Paid amount cannot be greater than total amount."
      );
      return;
    }

    const due = total - paid;

    setSaving(true);

    try {
      // =========================
      // SALE DATA
      // =========================

      const saleData = {
        customer_id: Number(customerId),
        product_id: Number(productId),
        quantity: Number(quantity),
        total_amount: total,
        paid_amount: paid,
        due_amount: due,
        sale_date: date,
      };

      console.log(
        "Saving Sale:",
        saleData
      );

      // =========================
      // UPDATE
      // =========================

      if (editingId !== null) {
        const { error } =
          await supabase
            .from("sales")
            .update(saleData)
            .eq("id", editingId);

        if (error) {
          console.error(
            "Update Sale Error:",
            error
          );

          alert(
            `Failed to update sale: ${error.message}`
          );

          return;
        }

        alert(
          "Sale updated successfully!"
        );
      }

      // =========================
      // INSERT
      // =========================

      else {
        const {
          data,
          error,
        } = await supabase
          .from("sales")
          .insert([saleData])
          .select()
          .single();

        if (error) {
          console.error(
            "Add Sale Error:",
            error
          );

          alert(
            `Failed to add sale: ${error.message}`
          );

          return;
        }

        console.log(
          "Sale inserted successfully:",
          data
        );

        alert(
          "Sale added successfully!"
        );
      }

      // Reload database data
      await loadAllData();

      closeForm();
    } catch (error) {
      console.error(
        "Unexpected Save Error:",
        error
      );

      alert(
        "Something went wrong while saving the sale."
      );
    } finally {
      setSaving(false);
    }
  };

  // =========================
  // DELETE SALE
  // =========================

  const deleteSale = async (
    id: number
  ) => {
    const confirmed =
      window.confirm(
        "Are you sure you want to delete this sale?"
      );

    if (!confirmed) {
      return;
    }

    const { error } =
      await supabase
        .from("sales")
        .delete()
        .eq("id", id);

    if (error) {
      console.error(
        "Delete Sale Error:",
        error
      );

      alert(
        `Failed to delete sale: ${error.message}`
      );

      return;
    }

    await loadAllData();

    alert(
      "Sale deleted successfully!"
    );
  };

  // =========================
  // SEARCH
  // =========================

  const filteredSales =
    sales.filter((sale) => {
      const searchText =
        search.toLowerCase().trim();

      return (
        sale.customer
          .toLowerCase()
          .includes(searchText) ||
        sale.product
          .toLowerCase()
          .includes(searchText) ||
        sale.date
          .toLowerCase()
          .includes(searchText)
      );
    });

  // =========================
  // UI
  // =========================

  return (
    <div className="sales-page">

      {/* HEADER */}

      <div className="sales-header">

        <div>
          <h1>Sales</h1>

          <p>
            Manage sales transactions and payments
          </p>
        </div>

        <button
          type="button"
          className="add-sale-btn"
          onClick={openAddForm}
        >
          + New Sale
        </button>

      </div>

      {/* FORM */}

      {showForm && (
        <div className="sale-form-card">

          <div className="sale-form-header">

            <div>
              <h2>
                {editingId === null
                  ? "Create New Sale"
                  : "Edit Sale"}
              </h2>

              <p>
                Enter sale transaction details
              </p>
            </div>

            <button
              type="button"
              className="close-sale-form"
              onClick={closeForm}
            >
              ✕
            </button>

          </div>

          <form onSubmit={saveSale}>

            <div className="sale-form-grid">

              {/* CUSTOMER */}

              <div className="sale-form-group">

                <label>
                  Customer
                </label>

                <select
                  value={customerId}
                  onChange={(e) =>
                    setCustomerId(
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    Select Customer
                  </option>

                  {customers.map(
                    (item) => (
                      <option
                        key={item.id}
                        value={item.id}
                      >
                        {item.name}
                      </option>
                    )
                  )}
                </select>

              </div>

              {/* PRODUCT */}

              <div className="sale-form-group">

                <label>
                  Product
                </label>

                <select
                  value={productId}
                  onChange={(e) =>
                    setProductId(
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    Select Product
                  </option>

                  {products.map(
                    (item) => (
                      <option
                        key={item.id}
                        value={item.id}
                      >
                        {item.name}
                      </option>
                    )
                  )}
                </select>

              </div>

              {/* QUANTITY */}

              <div className="sale-form-group">

                <label>
                  Quantity
                </label>

                <input
                  type="number"
                  min="1"
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(
                      e.target.value
                    )
                  }
                />

              </div>

              {/* DATE */}

              <div className="sale-form-group">

                <label>
                  Sale Date
                </label>

                <input
                  type="date"
                  value={date}
                  onChange={(e) =>
                    setDate(
                      e.target.value
                    )
                  }
                />

              </div>

              {/* TOTAL */}

              <div className="sale-form-group">

                <label>
                  Total Amount
                </label>

                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={totalAmount}
                  onChange={(e) =>
                    setTotalAmount(
                      e.target.value
                    )
                  }
                />

              </div>

              {/* PAID */}

              <div className="sale-form-group">

                <label>
                  Paid Amount
                </label>

                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={paidAmount}
                  onChange={(e) =>
                    setPaidAmount(
                      e.target.value
                    )
                  }
                />

              </div>

            </div>

            {/* FORM BUTTONS */}

            <div className="sale-form-actions">

              <button
                type="button"
                className="sale-cancel-btn"
                onClick={closeForm}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="save-sale-btn"
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : editingId === null
                  ? "Save Sale"
                  : "Update Sale"}
              </button>

            </div>

          </form>

        </div>
      )}

      {/* SEARCH */}

      <div className="sales-toolbar">

        <input
          type="text"
          placeholder="Search by customer, product or date..."
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
        />

        <span>
          {filteredSales.length} sale
          {filteredSales.length !== 1
            ? "s"
            : ""}
        </span>

      </div>

      {/* TABLE */}

      <div className="sales-table-container">

        <table className="sales-table">

          <thead>

            <tr>
              <th>Customer</th>
              <th>Product</th>
              <th>Qty</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Due</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>

          </thead>

          <tbody>

            {loading ? (

              <tr>
                <td
                  colSpan={8}
                  className="no-sales"
                >
                  Loading sales...
                </td>
              </tr>

            ) : filteredSales.length > 0 ? (

              filteredSales.map(
                (sale) => (

                  <tr key={sale.id}>

                    <td>
                      <strong>
                        {sale.customer}
                      </strong>
                    </td>

                    <td>
                      {sale.product}
                    </td>

                    <td>
                      {sale.quantity}
                    </td>

                    <td>
                      Rs.{" "}
                      {sale.totalAmount.toLocaleString()}
                    </td>

                    <td>
                      Rs.{" "}
                      {sale.paidAmount.toLocaleString()}
                    </td>

                    <td>

                      <span
                        className={
                          sale.dueAmount > 0
                            ? "sale-due"
                            : "sale-paid"
                        }
                      >
                        Rs.{" "}
                        {sale.dueAmount.toLocaleString()}
                      </span>

                    </td>

                    <td>
                      {sale.date}
                    </td>

                    <td>

                      <div className="sale-actions">

                        <button
                          type="button"
                          className="sale-edit-btn"
                          onClick={() =>
                            openEditForm(
                              sale
                            )
                          }
                        >
                          ✏️ Edit
                        </button>

                        <button
                          type="button"
                          className="sale-delete-btn"
                          onClick={() =>
                            deleteSale(
                              sale.id
                            )
                          }
                        >
                          🗑️ Delete
                        </button>

                      </div>

                    </td>

                  </tr>

                )
              )

            ) : (

              <tr>

                <td
                  colSpan={8}
                  className="no-sales"
                >
                  No sales found.
                </td>

              </tr>

            )}

          </tbody>

        </table>

      </div>

    </div>
  );
}

export default Sales;