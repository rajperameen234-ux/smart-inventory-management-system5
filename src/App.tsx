
import { useEffect, useState } from "react";
import "./App.css";
import { supabase } from "./supabase";
import Products from "./pages/Products";
import Categories from "./pages/Categories";
import Suppliers from "./pages/Suppliers";
import Customers from "./pages/Customers";
import Sales from "./pages/Sales";
import CreditDues from "./pages/CreditDues";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

function Sidebar({
  currentPage,
  setCurrentPage,
}: {
  currentPage: string;
  setCurrentPage: (page: string) => void;
}) {
  async function handleLogout() {
    const confirmed = window.confirm(
      "Are you sure you want to log out?"
    );

    if (!confirmed) return;

    const { error } = await supabase.auth.signOut();

    if (error) {
      alert("Logout failed: " + error.message);
    }
  }

  return (
    <aside className="sidebar">
      <div className="logo">
        <div className="logo-icon">S</div>
        <div>
          <h2>Smart Inventory</h2>
          <span>Management System</span>
        </div>
      </div>

      <nav>
        <p className="menu-title">MAIN MENU</p>

        {[
          { id: "dashboard", icon: "📊", label: "Dashboard" },
          { id: "products", icon: "📦", label: "Products" },
          { id: "categories", icon: "🏷️", label: "Categories" },
          { id: "suppliers", icon: "🚚", label: "Suppliers" },
          { id: "customers", icon: "👥", label: "Customers" },
        ].map((item) => (
          <button
            key={item.id}
            className={`menu-item ${
              currentPage === item.id ? "active" : ""
            }`}
            onClick={() => setCurrentPage(item.id)}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}

        <p className="menu-title">TRANSACTIONS</p>

        {[
          { id: "sales", icon: "💰", label: "Sales" },
          { id: "dues", icon: "💳", label: "Credit / Dues" },
        ].map((item) => (
          <button
            key={item.id}
            className={`menu-item ${
              currentPage === item.id ? "active" : ""
            }`}
            onClick={() => setCurrentPage(item.id)}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}

        <p className="menu-title">ANALYTICS</p>

        {[
          { id: "reports", icon: "📈", label: "Reports" },
          { id: "settings", icon: "⚙️", label: "Settings" },
        ].map((item) => (
          <button
            key={item.id}
            className={`menu-item ${
              currentPage === item.id ? "active" : ""
            }`}
            onClick={() => setCurrentPage(item.id)}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="user-avatar">A</div>

        <div>
          <strong>Admin User</strong>
          <small>Administrator</small>
        </div>

        <button
          type="button"
          onClick={() => void handleLogout()}
          style={{
            marginLeft: "auto",
            padding: "8px 12px",
            cursor: "pointer",
            borderRadius: "6px",
            border: "1px solid #ddd",
            background: "#fff",
            color: "#dc2626",
            fontWeight: 600,
          }}
        >
          Logout
        </button>
      </div>
    </aside>
  );
}

type Product = {
  id: number;
  name: string;
  supplier: string | null;
  stock: number | null;
  minimum_stock: number | null;
};

type Sale = {
  total_amount: number | string | null;
  sale_date: string;
};

function Dashboard({
  setCurrentPage,
}: {
  setCurrentPage: (page: string) => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [totalSales, setTotalSales] = useState(0);

  const [monthlySales, setMonthlySales] = useState<
    { month: string; amount: number }[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    void fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setLoading(true);
    setErrorMessage("");

    try {
      const [productsResult, customersResult, salesResult] =
        await Promise.all([
          supabase
            .from("products")
            .select("id, name, supplier, stock, minimum_stock")
            .order("name", { ascending: true }),

          supabase
            .from("customers")
            .select("*", { count: "exact", head: true }),

          supabase
            .from("sales")
            .select("total_amount, sale_date")
            .order("sale_date", { ascending: false }),
        ]);

      if (productsResult.error) {
        throw new Error(
          "Products: " + productsResult.error.message
        );
      }

      if (customersResult.error) {
        throw new Error(
          "Customers: " + customersResult.error.message
        );
      }

      if (salesResult.error) {
        throw new Error(
          "Sales: " + salesResult.error.message
        );
      }

      const productData =
        (productsResult.data ?? []) as Product[];

      const salesData = (salesResult.data ?? []) as Sale[];

      setProducts(productData);
      setTotalCustomers(customersResult.count ?? 0);

      const salesTotal = salesData.reduce(
        (sum, sale) => sum + Number(sale.total_amount ?? 0),
        0
      );

      setTotalSales(salesTotal);

      const year = new Date().getFullYear();

      const monthlyData = Array.from(
        { length: 12 },
        (_, index) => ({
          month: new Date(year, index, 1).toLocaleString(
            "en-US",
            { month: "short" }
          ),
          amount: 0,
        })
      );

      salesData.forEach((sale) => {
        const date = new Date(sale.sale_date);

        if (
          !Number.isNaN(date.getTime()) &&
          date.getFullYear() === year
        ) {
          monthlyData[date.getMonth()].amount +=
            Number(sale.total_amount ?? 0);
        }
      });

      setMonthlySales(monthlyData);
    } catch (error) {
      console.error("Dashboard error:", error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not load dashboard data."
      );
    } finally {
      setLoading(false);
    }
  }

  const lowStockProducts = products.filter((product) => {
    const stock = Number(product.stock ?? 0);
    const minimum = Number(product.minimum_stock ?? 0);

    return stock <= minimum;
  });

  const maxMonthlySale = Math.max(
    ...monthlySales.map((item) => item.amount),
    0
  );

  const formatMoney = (amount: number) =>
    "Rs. " +
    amount.toLocaleString("en-PK", {
      maximumFractionDigits: 2,
    });

  async function testSupabase() {
    const { error } = await supabase
      .from("products")
      .select("id")
      .limit(1);

    if (error) {
      console.error(error);
      alert("Database connection failed: " + error.message);
    } else {
      alert("Supabase connected successfully!");
    }
  }

  return (
    <main className="main-content">
      <header className="topbar">
        <div>
          <h1>Dashboard</h1>
          <p>Welcome back! Here's what's happening today.</p>
        </div>

        <div className="topbar-right">
          <button
            className="notification"
            aria-label="Notifications"
          >
            🔔
          </button>

          <div className="profile">
            <div className="profile-avatar">A</div>
            <div>
              <strong>Admin</strong>
              <small>Administrator</small>
            </div>
          </div>
        </div>
      </header>

      {errorMessage && (
        <div
          role="alert"
          style={{
            padding: "12px",
            marginBottom: "16px",
            borderRadius: "8px",
            background: "#fee2e2",
            color: "#991b1b",
          }}
        >
          <strong>Dashboard data error:</strong> {errorMessage}

          <button
            onClick={() => void fetchDashboardData()}
            style={{ marginLeft: "12px" }}
          >
            Retry
          </button>
        </div>
      )}

      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">📦</div>
          <div>
            <p>Total Products</p>
            <h2>
              {loading ? "..." : products.length.toLocaleString()}
            </h2>
            <span>Products in database</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">💰</div>
          <div>
            <p>Total Sales</p>
            <h2>
              {loading ? "..." : formatMoney(totalSales)}
            </h2>
            <span>All recorded sales</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">👥</div>
          <div>
            <p>Total Customers</p>
            <h2>
              {loading ? "..." : totalCustomers.toLocaleString()}
            </h2>
            <span>Registered customers</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">⚠️</div>
          <div>
            <p>Low Stock Items</p>
            <h2>
              {loading ? "..." : lowStockProducts.length}
            </h2>
            <span className="negative">Needs attention</span>
          </div>
        </div>
      </section>

      <section className="content-grid">
        <div className="panel sales-panel">
          <div className="panel-header">
            <div>
              <h2>Sales Overview</h2>
              <p>Monthly sales performance for this year</p>
            </div>

            <button
              className="view-button"
              onClick={() => void fetchDashboardData()}
              disabled={loading}
            >
              {loading ? "Loading..." : "↻ Refresh"}
            </button>
          </div>

          <div className="chart">
            {loading ? (
              <p>Loading sales data...</p>
            ) : maxMonthlySale === 0 ? (
              <p>No sales recorded for this year.</p>
            ) : (
              <div className="chart-bars">
                {monthlySales.map((item) => {
                  const height =
                    item.amount > 0
                      ? Math.max(
                          (item.amount / maxMonthlySale) * 100,
                          3
                        )
                      : 0;

                  return (
                    <div
                      className={
                        item.amount === maxMonthlySale &&
                        item.amount > 0
                          ? "bar highlight"
                          : "bar"
                      }
                      key={item.month}
                      title={`${item.month}: ${formatMoney(item.amount)}`}
                      style={{ height: height + "%" }}
                    >
                      <span>{item.month}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Quick Actions</h2>
              <p>Common tasks</p>
            </div>
          </div>

          <div className="quick-actions">
            <button onClick={() => setCurrentPage("products")}>
              ➕ Add Product
            </button>
            <button onClick={() => setCurrentPage("sales")}>
              🛒 New Sale
            </button>
            <button onClick={() => setCurrentPage("customers")}>
              👤 Add Customer
            </button>
            <button onClick={() => setCurrentPage("suppliers")}>
              🚚 Add Supplier
            </button>
            <button onClick={() => void testSupabase()}>
              🔗 Test Database Connection
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Low Stock Products</h2>
            <p>Products that need your attention</p>
          </div>

          <button
            className="view-button"
            onClick={() => setCurrentPage("products")}
          >
            View All
          </button>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Stock</th>
                <th>Minimum Stock</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5}>Loading products...</td>
                </tr>
              ) : lowStockProducts.length === 0 ? (
                <tr>
                  <td colSpan={5}>No low-stock products found.</td>
                </tr>
              ) : (
                lowStockProducts.map((product) => {
                  const stock = Number(product.stock ?? 0);
                  const minimum = Number(
                    product.minimum_stock ?? 0
                  );

                  const critical =
                    stock === 0 || stock < minimum;

                  return (
                    <tr key={product.id}>
                      <td>
                        <strong>{product.name}</strong>
                      </td>
                      <td>{product.supplier || "—"}</td>
                      <td>{stock}</td>
                      <td>{minimum}</td>
                      <td>
                        <span
                          className={
                            critical
                              ? "status critical"
                              : "status low"
                          }
                        >
                          {stock === 0
                            ? "Out of Stock"
                            : critical
                            ? "Critical"
                            : "Low Stock"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function App() {
  const [currentPage, setCurrentPage] = useState("dashboard");

  return (
    <div className="app">
      <Sidebar
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
      />

      {currentPage === "dashboard" && (
        <Dashboard setCurrentPage={setCurrentPage} />
      )}

      {currentPage === "products" && (
        <main className="main-content">
          <Products />
        </main>
      )}

      {currentPage === "categories" && (
        <main className="main-content">
          <Categories />
        </main>
      )}

      {currentPage === "suppliers" && (
        <main className="main-content">
          <Suppliers />
        </main>
      )}

      {currentPage === "customers" && (
        <main className="main-content">
          <Customers />
        </main>
      )}

      {currentPage === "sales" && (
        <main className="main-content">
          <Sales />
        </main>
      )}

      {currentPage === "dues" && (
        <main className="main-content">
          <CreditDues />
        </main>
      )}

      {currentPage === "reports" && (
        <main className="main-content">
          <Reports />
        </main>
      )}

      {currentPage === "settings" && (
        <main className="main-content">
          <Settings />
        </main>
      )}
    </div>
  );
}

export default App;