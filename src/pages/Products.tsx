
import { useEffect, useState } from "react";
import { supabase } from "../supabase";

type Product = {
  id: number;
  name: string;
  category: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
};

function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("Electronics");
  const [quantity, setQuantity] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");

  const [loading, setLoading] = useState(true);

  // LOAD PRODUCTS FROM SUPABASE
  const loadProducts = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.error("Load Products Error:", error);
      alert("Failed to load products from database.");
      setLoading(false);
      return;
    }

    const formattedProducts: Product[] = (data || []).map(
      (product) => ({
        id: product.id,
        name: product.name,
        category: product.supplier || "Other",
        quantity: Number(product.stock ?? 0),
        purchasePrice: Number(product.purchase_price ?? 0),
        sellingPrice: Number(product.price ?? 0),
      })
    );

    setProducts(formattedProducts);
    setLoading(false);
  };

  useEffect(() => {
    loadProducts();
  }, []);

  // OPEN ADD FORM
  const openAddForm = () => {
    setEditingId(null);
    setName("");
    setCategory("Electronics");
    setQuantity("");
    setPurchasePrice("");
    setSellingPrice("");
    setShowForm(true);
  };

  // OPEN EDIT FORM
  const openEditForm = (product: Product) => {
    setEditingId(product.id);
    setName(product.name);
    setCategory(product.category);
    setQuantity(String(product.quantity));
    setPurchasePrice(String(product.purchasePrice));
    setSellingPrice(String(product.sellingPrice));
    setShowForm(true);
  };

  // DELETE PRODUCT
  const deleteProduct = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this product?")) {
      return;
    }

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Delete Product Error:", error);
      alert("Failed to delete product.");
      return;
    }

    setProducts((current) =>
      current.filter((product) => product.id !== id)
    );

    alert("Product deleted successfully!");
  };

  // SAVE / UPDATE PRODUCT
  const saveProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (
      !name.trim() ||
      quantity === "" ||
      purchasePrice === "" ||
      sellingPrice === "" ||
      Number(quantity) < 0 ||
      Number(purchasePrice) < 0 ||
      Number(sellingPrice) < 0
    ) {
      alert("Please enter valid values in all fields.");
      return;
    }

    const productDetails = {
      name: name.trim(),
      stock: Number(quantity),
      price: Number(sellingPrice),
      supplier: category,
      purchase_price: Number(purchasePrice),
    };

    // UPDATE EXISTING PRODUCT
    if (editingId !== null) {
      const { error } = await supabase
        .from("products")
        .update(productDetails)
        .eq("id", editingId);

      if (error) {
        console.error("Update Product Error:", error);
        alert(`Failed to update product: ${error.message}`);
        return;
      }

      setProducts((current) =>
        current.map((product) =>
          product.id === editingId
            ? {
                ...product,
                name: productDetails.name,
                category: productDetails.supplier,
                quantity: productDetails.stock,
                purchasePrice: productDetails.purchase_price,
                sellingPrice: productDetails.price,
              }
            : product
        )
      );

      alert("Product updated successfully!");
    } else {
      // ADD NEW PRODUCT
      const { data, error } = await supabase
        .from("products")
        .insert([
          {
            ...productDetails,
            minimum_stock: 10,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Add Product Error:", error);
        alert(`Failed to add product: ${error.message}`);
        return;
      }

      const newProduct: Product = {
        id: data.id,
        name: data.name,
        category: data.supplier || "Other",
        quantity: Number(data.stock ?? 0),
        purchasePrice: Number(data.purchase_price ?? 0),
        sellingPrice: Number(data.price ?? 0),
      };

      setProducts((current) => [...current, newProduct]);
      alert("Product added successfully!");
    }

    closeForm();
  };

  // CLOSE FORM
  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  // SEARCH PRODUCTS
  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="products-page">
      {/* HEADER */}
      <div className="products-header">
        <div>
          <h1>Products</h1>
          <p>Manage your inventory products</p>
        </div>

        <button
          type="button"
          onClick={openAddForm}
          style={{
            position: "relative",
            zIndex: 9999,
            padding: "15px 25px",
            background: "blue",
            color: "white",
            border: "none",
            cursor: "pointer",
            fontSize: "16px",
          }}
        >
          + Add Product
        </button>
      </div>

      {/* ADD / EDIT FORM */}
      {showForm && (
        <div className="product-form-card">
          <div className="form-header">
            <div>
              <h2>
                {editingId === null
                  ? "Add New Product"
                  : "Edit Product"}
              </h2>
              <p>Enter product information</p>
            </div>

            <button
              type="button"
              className="close-form"
              onClick={closeForm}
            >
              ✕
            </button>
          </div>

          <form onSubmit={saveProduct}>
            <div className="form-grid">
              <div className="form-group">
                <label>Product Name</label>
                <input
                  type="text"
                  placeholder="Enter product name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option>Electronics</option>
                  <option>Accessories</option>
                  <option>Furniture</option>
                  <option>Stationery</option>
                  <option>Other</option>
                </select>
              </div>

              <div className="form-group">
                <label>Quantity</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Enter quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Purchase Price (Rs.)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Enter purchase price"
                  value={purchasePrice}
                  onChange={(e) =>
                    setPurchasePrice(e.target.value)
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label>Selling Price (Rs.)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Enter selling price"
                  value={sellingPrice}
                  onChange={(e) =>
                    setSellingPrice(e.target.value)
                  }
                  required
                />
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={closeForm}
              >
                Cancel
              </button>

              <button type="submit" className="save-product-btn">
                {editingId === null
                  ? "Save Product"
                  : "Update Product"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SEARCH AND CATEGORY FILTER */}
      <div className="products-toolbar">
        <input
          type="text"
          placeholder="🔍 Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          onChange={(e) => {
            // Category filtering is not applied in this version.
            // The category dropdown remains available in the UI.
            void e;
          }}
          defaultValue="All Categories"
        >
          <option>All Categories</option>
          <option>Electronics</option>
          <option>Accessories</option>
          <option>Furniture</option>
          <option>Stationery</option>
          <option>Other</option>
        </select>
      </div>

      {/* PRODUCTS TABLE */}
      <div className="products-table-container">
        <table className="products-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Stock</th>
              <th>Purchase Price</th>
              <th>Selling Price</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="no-products">
                  Loading products...
                </td>
              </tr>
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={7} className="no-products">
                  No products found
                </td>
              </tr>
            ) : (
              filteredProducts.map((product) => (
                <tr key={product.id}>
                  <td>
                    <strong>{product.name}</strong>
                  </td>

                  <td>{product.category}</td>
                  <td>{product.quantity}</td>

                  <td>
                    Rs. {product.purchasePrice.toLocaleString()}
                  </td>

                  <td>
                    Rs. {product.sellingPrice.toLocaleString()}
                  </td>

                  <td>
                    {product.quantity <= 10 ? (
                      <span className="status low-stock">
                        Low Stock
                      </span>
                    ) : (
                      <span className="status in-stock">
                        In Stock
                      </span>
                    )}
                  </td>

                  <td className="action-buttons">
                    <button
                      type="button"
                      className="edit-btn"
                      onClick={() => openEditForm(product)}
                    >
                      ✏️ Edit
                    </button>

                    <button
                      type="button"
                      className="delete-btn"
                      onClick={() => deleteProduct(product.id)}
                    >
                      🗑️ Delete
                    </button>
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

export default Products;