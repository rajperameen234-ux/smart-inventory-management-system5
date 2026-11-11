import { useEffect, useMemo, useState, type FormEvent } from "react";
import { insertOwned, supabase } from "../supabase";
import { useToast } from "../components/Toast";
import {
  AlertIcon,
  BoxesIcon,
  PackageIcon,
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
import { formatDate, formatMoney, formatMoneyRaw, formatNumber, toNumber } from "../lib/format";
import { useCurrency } from "../components/CurrencyProvider";
import {
  mergeCategoryOptions,
  type CategoryRecord,
} from "../lib/categories";
import {
  loadCategories,
  subscribeCategories,
} from "../lib/categoryStore";
import {
  computeMarginPercent,
  computeStockValue,
  resolveMinimumStock,
  resolveStockStatus,
  roundMoney,
  validateProduct,
} from "../lib/inventory";

type Product = {
  id: number;
  name: string;
  category: string;
  sku: string | null;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  minimumStock: number;
  createdAt: string;
};

export default function Products({
  searchSeed = "",
}: {
  searchSeed?: string;
}) {
  const toast = useToast();

  /**
   * Money inputs are typed in the SELECTED display currency and converted to
   * the base currency (PKR) exactly once when saving; edit forms are seeded
   * from the stored base amounts exactly once when opening. Nothing here
   * converts a value twice.
   */
  const { currency, toPkr, toDisplay } = useCurrency();

  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState(searchSeed);
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [stockFilter, setStockFilter] = useState("All");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("Electronics");
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [minimumStock, setMinimumStock] = useState("10");

  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /**
   * Categories now come from the `categories` table. Previously this list was
   * built only from a hardcoded array plus the names already used by
   * products, so a category created in the Categories section never appeared
   * here unless a product happened to use that exact name.
   */
  const [dbCategories, setDbCategories] = useState<CategoryRecord[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");

  useEffect(() => {
    if (searchSeed) setSearch(searchSeed);
  }, [searchSeed]);

  // Load on mount, and again whenever another screen invalidates the cache so
  // a category created in Categories shows up without a manual page refresh.
  useEffect(() => {
    let active = true;

    async function initialLoad() {
      try {
        const rows = await loadCategories();

        if (active) {
          setDbCategories(rows);
          setCategoriesError("");
        }
      } catch (caught) {
        console.error("Load Categories Error:", caught);

        if (active) {
          setCategoriesError(
            caught instanceof Error
              ? caught.message
              : "Could not load categories."
          );
        }
      } finally {
        if (active) setCategoriesLoading(false);
      }
    }

    void initialLoad();

    const unsubscribe = subscribeCategories(() => {
      if (active) void initialLoad();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    setError("");

    const { data, error: loadError } = await supabase
      .from("products")
      .select("*")
      .order("id", { ascending: true });

    if (loadError) {
      console.error("Load Products Error:", loadError);
      setError(loadError.message);
      setLoading(false);
      toast.error("Could not load products", loadError.message);
      return;
    }

    const formattedProducts: Product[] = (data || []).map((product) => ({
      id: toNumber(product.id),
      name: product.name,
      category: product.supplier || "Other",
      sku: product.sku ? String(product.sku) : null,
      quantity: toNumber(product.stock),
      purchasePrice: toNumber(product.purchase_price),
      sellingPrice: toNumber(product.price),
      minimumStock: resolveMinimumStock(product.minimum_stock),
      createdAt: String(product.created_at ?? ""),
    }));

    setProducts(formattedProducts);
    setLoading(false);
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  /**
   * Dropdown options: database categories, names already used by products
   * (so legacy rows stay selectable), and the built-in fallbacks — all
   * de-duplicated case-insensitively.
   */
  const categories = useMemo(
    () =>
      mergeCategoryOptions({
        database: dbCategories.map((category) => category.name),
        inUse: products.map((product) => product.category),
      }),
    [dbCategories, products]
  );

  /**
   * Keeps the form selection valid. A product edited after its category was
   * renamed or removed would otherwise be assigned a different category the
   * moment the form opens.
   */
  useEffect(() => {
    if (categories.length === 0) return;
    if (categories.some((item) => item === category)) return;

    const stillInUse = products.some((product) => product.category === category);

    if (!stillInUse) setCategory(categories[0]);
  }, [categories, category, products]);

  const summary = useMemo(() => {
    let units = 0;
    let retail = 0;
    let cost = 0;

    products.forEach((product) => {
      units += product.quantity;
      retail += computeStockValue(product.quantity, product.sellingPrice);
      cost += computeStockValue(product.quantity, product.purchasePrice);
    });

    // FIX: was hardcoded to `<= 10`, which disagreed with the Dashboard and the
    // notification bell whenever a product had its own minimum_stock.
    const lowStock = products.filter(
      (product) =>
        product.quantity > 0 &&
        resolveStockStatus(product.quantity, product.minimumStock) === "low"
    ).length;

    const outOfStock = products.filter(
      (product) => resolveStockStatus(product.quantity, product.minimumStock) === "out"
    ).length;

    return { units, retail, cost, lowStock, outOfStock };
  }, [products]);

  const openAddForm = () => {
    setEditingId(null);
    setName("");
    setCategory(categories[0] ?? "Electronics");
    setSku("");
    setQuantity("");
    setPurchasePrice("");
    setSellingPrice("");
    setMinimumStock("10");
    setShowForm(true);
  };

  const openEditForm = (product: Product) => {
    setEditingId(product.id);
    setName(product.name);
    setCategory(product.category);
    setSku(product.sku ?? "");
    setQuantity(String(product.quantity));
    // Stored base amounts are shown in the selected display currency, with
    // enough precision to round-trip without corrupting the record.
    setPurchasePrice(String(toDisplay(product.purchasePrice)));
    setSellingPrice(String(toDisplay(product.sellingPrice)));
    setMinimumStock(String(product.minimumStock));
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setSaving(false);
  };

  const deleteProduct = async (product: Product) => {
    setSaving(true);

    const { data: deletedRows, error: deleteError } = await supabase
      .from("products")
      .delete()
      .eq("id", product.id)
      .select("id");

    setSaving(false);
    setPendingDelete(null);

    if (deleteError) {
      console.error("Delete Product Error:", deleteError);
      toast.error("Could not delete product", deleteError.message);
      return;
    }

    if (!deletedRows || deletedRows.length === 0) {
      toast.error(
        "Product was not deleted",
        "No matching record was removed. It may have been deleted already, or your account may not have permission."
      );
      return;
    }

    setProducts((current) =>
      current.filter((item) => item.id !== product.id)
    );

    toast.success("Product deleted", `${product.name} was removed.`);
  };

  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (saving) return;

    // Shared validation with unit tests — rejects fractional quantities,
    // negatives and empty fields before anything is written.
    const issues = validateProduct({
      name,
      quantity,
      purchasePrice,
      sellingPrice,
        minimumStock,
    });

    if (issues.length > 0) {
      toast.error("Check the form", issues[0].message);
      return;
    }

    // Prevent accidental duplicate SKUs (case-insensitive) within the shop.
    const trimmedSku = sku.trim();

    if (trimmedSku) {
      const duplicate = products.find(
        (product) =>
          product.id !== editingId &&
          Boolean(product.sku) &&
          product.sku?.toLowerCase() === trimmedSku.toLowerCase()
      );

      if (duplicate) {
        toast.error(
          "SKU already in use",
          `"${trimmedSku}" is already assigned to ${duplicate.name}.`
        );
        return;
      }
    }

    setSaving(true);

    // Convert the typed display amounts into the stored base currency (PKR)
    // exactly once, right before anything touches the database.
    const stock = Number(quantity);

    const productDetails = {
      name: name.trim(),
      stock,
      price: toPkr(Number(sellingPrice)),
      supplier: category,
      purchase_price: toPkr(Number(purchasePrice)),
      sku: trimmedSku ? trimmedSku : null,
      minimum_stock: Math.max(0, Math.floor(Number(minimumStock) || 0)),
    };

    if (editingId !== null) {
      /**
       * FIX: `.select()` is required. Without it PostgREST answers an UPDATE
       * that matched zero rows (which is exactly what happens when a Row
       * Level Security policy filters the row out) with `error: null`. The
       * previous code treated that as success, so the UI claimed an edit that
       * was never saved. Selecting the affected row makes a 0-row update
       * detectable and reports it honestly.
       */
      const { data: updatedRows, error: updateError } = await supabase
        .from("products")
        .update(productDetails)
        .eq("id", editingId)
        .select(
          "id, name, supplier, stock, price, purchase_price, sku, minimum_stock"
        );

      if (updateError) {
        console.error("Update Product Error:", updateError);
        toast.error("Could not update product", updateError.message);
        setSaving(false);
        return;
      }

      if (!updatedRows || updatedRows.length === 0) {
        console.warn("Product update matched no rows for id:", editingId);
        toast.error(
          "Product was not saved",
          "No matching record was updated. It may have been deleted, or your account may not have permission to edit it."
        );
        setSaving(false);
        return;
      }

      const saved = updatedRows[0];

      setProducts((current) =>
        current.map((product) =>
          product.id === editingId
            ? {
                ...product,
                name: saved.name ?? productDetails.name,
                category: saved.supplier || productDetails.supplier,
                sku: saved.sku ?? null,
                quantity: toNumber(saved.stock ?? productDetails.stock),
                purchasePrice: toNumber(
                  saved.purchase_price ?? productDetails.purchase_price
                ),
                sellingPrice: toNumber(saved.price ?? productDetails.price),
                minimumStock: resolveMinimumStock(saved.minimum_stock),
              }
            : product
        )
      );

      toast.success("Product updated", productDetails.name);
    } else {
      const { data, error: insertError } = await insertOwned("products", [
        productDetails,
      ]);

      if (insertError) {
        console.error("Add Product Error:", insertError);
        toast.error("Could not add product", insertError.message);
        setSaving(false);
        return;
      }

      const newProduct: Product = {
        id: toNumber(data?.id),
        name: data?.name ?? productDetails.name,
        category: data?.supplier || "Other",
        sku: data?.sku ? String(data.sku) : null,
        quantity: toNumber(data?.stock ?? stock),
        purchasePrice: toNumber(data?.purchase_price),
        sellingPrice: toNumber(data?.price),
        minimumStock: resolveMinimumStock(data?.minimum_stock),
        createdAt: String(
          (data as unknown as Record<string, unknown> | null)?.created_at ?? ""
        ),
      };

      setProducts((current) => [...current, newProduct]);
      toast.success("Product added", newProduct.name);
    }

    closeForm();
  };

  const filteredProducts = useMemo(() => {
    const term = search.toLowerCase().trim();

    return products.filter((product) => {
      const matchesSearch =
        term.length === 0 ||
        product.name.toLowerCase().includes(term) ||
        product.category.toLowerCase().includes(term);

      // Case-insensitive: options are de-duplicated case-insensitively, so an exact
      // comparison would hide products whose stored name differs only in case.
      const matchesCategory =
        categoryFilter === "All Categories" ||
        product.category.toLowerCase() === categoryFilter.toLowerCase();

      const status = resolveStockStatus(product.quantity, product.minimumStock);

      const matchesStock =
        stockFilter === "All" ||
        (stockFilter === "Low" && status === "low") ||
        (stockFilter === "Out" && status === "out") ||
        (stockFilter === "Healthy" && status === "healthy");

      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [products, search, categoryFilter, stockFilter]);

  /**
   * Live form previews: profit per unit and the automatic purchase total.
   * These are computed from the display-currency inputs, so they are already
   * in display units — they must NOT be converted again, hence formatMoneyRaw.
   */
  const profitPerUnitPreview = roundMoney(
    toNumber(sellingPrice) - toNumber(purchasePrice)
  );

  const quantityTotal = Math.max(0, Math.floor(Number(quantity) || 0));

  const totalPurchasePreview = computeStockValue(
    quantityTotal,
    purchasePrice === "" ? 0 : purchasePrice
  );

  const detailValue =
    detailProduct !== null
      ? computeStockValue(detailProduct.quantity, detailProduct.purchasePrice)
      : 0;

  return (
    <main className="page-content">
      <PageStack>
        <PageHeader
          title="Products"
          description="Manage pricing, categories and stock levels for every item you sell."
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => void loadProducts()}
                disabled={loading}
              >
                <RefreshIcon size={15} />
                Refresh
              </Button>

              <Button variant="primary" onClick={openAddForm}>
                <PlusIcon size={15} />
                Add product
              </Button>
            </>
          }
        />

        {error ? (
          <div className="alert alert-error" role="alert">
            <AlertIcon size={16} />
            <div className="alert-content">
              <strong>Could not load products</strong>
              {error}
            </div>
          </div>
        ) : null}

        {categoriesError ? (
          <div className="alert alert-warning" role="status">
            <AlertIcon size={16} />
            <div className="alert-content">
              <strong>Categories could not be loaded</strong>
              {categoriesError} You can still use the built-in categories.
            </div>
          </div>
        ) : null}

        <div className="stat-grid">
          <StatCard
            label="Catalogue"
            value={formatNumber(products.length)}
            tone="lavender"
            icon={<PackageIcon size={16} />}
            loading={loading}
            meta="Active products"
          />

          <StatCard
            label="Units on hand"
            value={formatNumber(summary.units)}
            tone="mint"
            icon={<BoxesIcon size={16} />}
            loading={loading}
            meta="Across every product"
          />

          <StatCard
            label="Retail value"
            value={formatMoney(summary.retail, 0)}
            tone="sky"
            icon={<WalletIcon size={16} />}
            loading={loading}
            meta={`${formatMoney(summary.cost, 0)} at cost`}
          />

          <StatCard
            label="Needs restock"
            value={formatNumber(summary.lowStock + summary.outOfStock)}
            tone="yellow"
            icon={<AlertIcon size={16} />}
            loading={loading}
            meta={`${summary.outOfStock} out of stock`}
          />
        </div>

        <Card>
          <CardHeader
            title="Product catalogue"
            description="Search, filter and manage everything you stock."
            actions={
              <div className="toolbar" style={{ justifyContent: "flex-end" }}>
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search products..."
                  label="Search products"
                />

                <Select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  aria-label="Filter by category"
                  disabled={categoriesLoading}
                  style={{ width: "auto", minWidth: 150 }}
                >
                  <option>All Categories</option>
                  {categories.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </Select>

                <Select
                  value={stockFilter}
                  onChange={(event) => setStockFilter(event.target.value)}
                  aria-label="Filter by stock status"
                  style={{ width: "auto", minWidth: 130 }}
                >
                  <option value="All">All stock</option>
                  <option value="Healthy">In stock</option>
                  <option value="Low">Low stock</option>
                  <option value="Out">Out of stock</option>
                </Select>
              </div>
            }
          />

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th className="num">Purchase price</th>
                  <th className="num">Selling price</th>
                  <th className="num">Profit / unit</th>
                  <th className="num">Available stock</th>
                  <th className="num">Inventory value</th>
                  <th>Status</th>
                  <th className="actions-cell">Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <SkeletonRows rows={6} />
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="table-empty-cell">
                      <EmptyState
                        icon={<SearchIcon size={20} />}
                        title="No products found"
                        description={
                          products.length === 0
                            ? "Add your first product to start tracking inventory."
                            : "Try adjusting your search or filter selection."
                        }
                        action={
                          <Button variant="primary" onClick={openAddForm}>
                            <PlusIcon size={15} />
                            Add product
                          </Button>
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => {
                    // Inventory value is always purchase price x current stock,
                    // never the selling price.
                    const profitPerUnit = roundMoney(
                      product.sellingPrice - product.purchasePrice
                    );

                    const inventoryValue = computeStockValue(
                      product.quantity,
                      product.purchasePrice
                    );

                    const status = resolveStockStatus(
                      product.quantity,
                      product.minimumStock
                    );

                    const tone: BadgeTone =
                      status === "out"
                        ? "danger"
                        : status === "low"
                          ? "yellow"
                          : "mint";

                    const statusLabel =
                      status === "out"
                        ? "Out of stock"
                        : status === "low"
                          ? "Low stock"
                          : "In stock";

                    return (
                      <tr key={product.id}>
                        <td>
                          <span className="cell-stack">
                            <button
                              type="button"
                              className="link-button cell-primary"
                              onClick={() => setDetailProduct(product)}
                              title="View product details"
                            >
                              {product.name}
                            </button>
                            <small className="cell-muted">
                              {product.sku ? `SKU: ${product.sku}` : `#${product.id}`}
                            </small>
                          </span>
                        </td>

                        <td>
                          <Badge tone="lavender" plain>
                            {product.category}
                          </Badge>
                        </td>

                        <td className="num">
                          {formatMoney(product.purchasePrice)}
                        </td>

                        <td className="num cell-strong">
                          {formatMoney(product.sellingPrice)}
                        </td>

                        <td className="num">
                          <span
                            className={
                              profitPerUnit > 0 ? "money-pos" : "cell-muted"
                            }
                          >
                            {formatMoney(profitPerUnit)}
                          </span>
                        </td>

                        <td className="num cell-strong">{product.quantity}</td>

                        <td className="num">
                          {formatMoney(inventoryValue, 0)}
                        </td>

                        <td>
                          <Badge tone={tone}>{statusLabel}</Badge>
                        </td>

                        <td className="actions-cell">
                          <span className="row-actions">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setDetailProduct(product)}
                            >
                              View
                            </Button>

                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => openEditForm(product)}
                            >
                              <PencilIcon size={14} />
                              Edit
                            </Button>

                            <Button
                              size="sm"
                              variant="soft-danger"
                              onClick={() => setPendingDelete(product)}
                            >
                              <TrashIcon size={14} />
                            </Button>
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="card-footer">
            <span className="toolbar-count">
              Showing {filteredProducts.length} of {products.length} products
            </span>
          </div>
        </Card>
      </PageStack>

      <Modal
        open={showForm}
        title={editingId === null ? "Add new product" : "Edit product"}
        description={
          editingId === null
            ? "Create a new item in your catalogue."
            : "Update the details of this product."
        }
        onClose={closeForm}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>

            {/*
              FIX (critical): this button previously carried BOTH
              `type="submit"` AND `onClick={closeForm}`. React fired the click
              first, which unmounted the modal and therefore the
              <form id="product-form">, so the browser never dispatched a
              submit event and `saveProduct` never ran. Adding and editing
              products silently did nothing — no network request, no error.
              A submit button must not also close the form.
            */}
            <Button
              variant="primary"
              type="submit"
              form="product-form"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : editingId === null
                  ? "Save product"
                  : "Update product"}
            </Button>
          </>
        }
      >
        <form id="product-form" className="modal-form" onSubmit={saveProduct}>
          <div className="modal-body">
            <div className="form-grid">
              <Field label="Product name" required className="span-2">
                <Input
                  type="text"
                  placeholder="e.g. Wireless Keyboard"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </Field>

              <Field
                label="Category"
                required
                hint={
                  categoriesLoading
                    ? "Loading categories..."
                    : categories.length === 0
                      ? "No categories available. Add one from the Categories page."
                      : `${categories.length} available`
                }
              >
                <Select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  disabled={categoriesLoading || categories.length === 0}
                >
                  {categories.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </Select>
              </Field>

              <Field label="SKU / product code" hint="Optional part or barcode code.">
                <Input
                  type="text"
                  placeholder="e.g. WM-750"
                  value={sku}
                  onChange={(event) => setSku(event.target.value)}
                />
              </Field>

              <Field
                label="Quantity (initial stock)"
                required
                hint="Whole units only."
              >
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                />
              </Field>

              <Field
                label="Minimum stock"
                hint="Low stock alert level."
              >
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="10"
                  value={minimumStock}
                  onChange={(event) => setMinimumStock(event.target.value)}
                />
              </Field>

              <Field label={`Purchase price per unit (${currency})`} required>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={purchasePrice}
                  onChange={(event) => setPurchasePrice(event.target.value)}
                  required
                />
              </Field>

              <Field
                label={`Selling price per unit (${currency})`}
                required
                hint="The price shown to customers."
              >
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={sellingPrice}
                  onChange={(event) => setSellingPrice(event.target.value)}
                  required
                />
              </Field>
            </div>

            <div className="calc-panel">
              <div className="calc-row">
                <span>Profit per unit</span>
                <strong>{formatMoneyRaw(profitPerUnitPreview)}</strong>
              </div>

              <div className="calc-row">
                <span>Total purchase amount ({formatNumber(quantityTotal)} units)</span>
                <strong>{formatMoneyRaw(totalPurchasePreview, 2)}</strong>
              </div>

              <p className="calc-note">
                Purchases total = purchase price × quantity — updates
                automatically.
              </p>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        busy={saving}
        title="Delete product"
        description={`This permanently removes "${pendingDelete?.name ?? ""}" from your catalogue. This action cannot be undone.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void deleteProduct(pendingDelete);
        }}
      />

      <Modal
        open={detailProduct !== null}
        title={detailProduct?.name ?? "Product details"}
        description="Current product information and stock position."
        onClose={() => setDetailProduct(null)}
        footer={
          <Button
            variant="primary"
            onClick={() => {
              if (detailProduct) openEditForm(detailProduct);
              setDetailProduct(null);
            }}
          >
            <PencilIcon size={14} />
            Edit product
          </Button>
        }
      >
        {detailProduct ? (
          <div className="modal-body">
            <div className="calc-panel">
              <div className="calc-row">
                <span>Current inventory value</span>
                <strong>{formatMoney(detailValue)}</strong>
              </div>

              <p className="calc-note">
                Purchase price × current stock — stock on hand is always
                valued at cost, never at the selling price.
              </p>
            </div>

            <dl className="detail-list">
              <div className="detail-item">
                <dt>Product name</dt>
                <dd>{detailProduct.name}</dd>
              </div>

              <div className="detail-item">
                <dt>Category</dt>
                <dd>{detailProduct.category}</dd>
              </div>

              <div className="detail-item">
                <dt>SKU / product code</dt>
                <dd>{detailProduct.sku || "—"}</dd>
              </div>

              <div className="detail-item">
                <dt>Purchase price</dt>
                <dd>{formatMoney(detailProduct.purchasePrice)}</dd>
              </div>

              <div className="detail-item">
                <dt>Selling price</dt>
                <dd>{formatMoney(detailProduct.sellingPrice)}</dd>
              </div>

              <div className="detail-item">
                <dt>Profit per unit</dt>
                <dd className="money-pos">
                  {formatMoney(
                    roundMoney(
                      detailProduct.sellingPrice - detailProduct.purchasePrice
                    )
                  )}
                </dd>
              </div>

              <div className="detail-item">
                <dt>Margin</dt>
                <dd>
                  {computeMarginPercent(
                    detailProduct.purchasePrice,
                    detailProduct.sellingPrice
                  ).toFixed(1)}
                  %
                </dd>
              </div>

              <div className="detail-item">
                <dt>Available quantity</dt>
                <dd>{detailProduct.quantity}</dd>
              </div>

              <div className="detail-item">
                <dt>Minimum stock</dt>
                <dd>{detailProduct.minimumStock}</dd>
              </div>

              <div className="detail-item">
                <dt>Supplier records</dt>
                <dd>Managed on the Suppliers page</dd>
              </div>

              <div className="detail-item">
                <dt>Product created</dt>
                <dd>{formatDate(detailProduct.createdAt)}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Modal>
    </main>
  );
}