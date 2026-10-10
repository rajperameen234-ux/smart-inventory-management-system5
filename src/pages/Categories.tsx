import { useEffect, useMemo, useState, type FormEvent } from "react";
import { insertOwned, supabase } from "../supabase";
import { useToast } from "../components/Toast";
import {
  AlertIcon,
  LayersIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  TagIcon,
  TrashIcon,
} from "../components/Icon";
import {
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
  StatCard,
  Textarea,
} from "../components/ui";
import { formatNumber, toNumber } from "../lib/format";
import {
  findDuplicateCategory,
  normalizeCategoryName,
  type CategoryRecord,
} from "../lib/categories";
import {
  invalidateCategories,
  loadCategories as loadCategoriesStore,
  subscribeCategories,
} from "../lib/categoryStore";

type Category = {
  id: number;
  name: string;
  description: string;
};

const CATEGORY_TINTS = ["", "is-pink", "is-sky", "is-mint"];

export default function Categories() {
  const toast = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /**
   * Reads through the shared category store so this screen and the Products
   * dropdown always see the same list.
   */
  const loadCategories = async (force = false) => {
    setLoading(true);
    setError("");

    try {
      const rows = await loadCategoriesStore({ force });

      setCategories(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
        }))
      );

      setError("");
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Could not load categories.";

      console.error("Load Categories Error:", caught);
      setError(message);
      toast.error("Could not load categories", message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!active) return;
      await loadCategories();
    })();

    // Keep in step with any other screen that changes categories.
    const unsubscribe = subscribeCategories(() => {
      if (active) void loadCategories();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const openAddForm = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setShowForm(true);
  };

  const openEditForm = (category: Category) => {
    setEditingId(category.id);
    setName(category.name);
    setDescription(category.description);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setSaving(false);
  };

  const saveCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const cleanName = normalizeCategoryName(name);

    if (!cleanName) {
      toast.error("Name required", "Please enter a category name.");
      return;
    }

    if (saving) return;

    /**
     * Duplicates would appear twice in the Products dropdown. Checked
     * case-insensitively against what is already saved, ignoring the record
     * currently being edited so re-saving an unchanged name is allowed.
     */
    const existing = categories.map(
      (item) => ({ id: item.id, name: item.name }) as CategoryRecord
    );

    const duplicate = findDuplicateCategory(existing, cleanName, editingId);

    if (duplicate) {
      toast.error(
        "Duplicate category",
        `"${duplicate.name}" already exists. Choose a different name.`
      );
      return;
    }

    setSaving(true);

    const categoryData = {
      name: cleanName,
      description: description.trim(),
    };

    if (editingId !== null) {
      const { data: updatedRows, error: updateError } = await supabase
        .from("categories")
        .update(categoryData)
        .eq("id", editingId)
        .select("id, name, description");

      if (updateError) {
        console.error("Update Category Error:", updateError);
        toast.error("Could not update category", updateError.message);
        setSaving(false);
        return;
      }

      if (!updatedRows || updatedRows.length === 0) {
        toast.error(
          "Category was not saved",
          "No matching row was updated. It may have been deleted, or your account may not have permission to edit it."
        );
        setSaving(false);
        return;
      }

      setCategories((current) =>
        current.map((category) =>
          category.id === editingId
            ? { ...category, ...categoryData }
            : category
        )
      );

      toast.success("Category updated", categoryData.name);
    } else {
      const { data, error: insertError } = await insertOwned("categories", [
        categoryData,
      ]);

      if (insertError) {
        console.error("Add Category Error:", insertError);

        // A unique index would surface here as a constraint violation.
        toast.error("Could not add category", insertError.message);
        setSaving(false);
        return;
      }

      // Never push a null row into local state if the insert returned nothing.
      const row = (data ?? categoryData) as Category;

      setCategories((current) => [
        ...current,
        { ...row, id: toNumber(row.id), name: normalizeCategoryName(row.name) },
      ]);
      toast.success("Category added", categoryData.name);
    }

    // Publish the change so an open Products form picks it up immediately.
    invalidateCategories();

    closeForm();
  };

  const deleteCategory = async (category: Category) => {
    setSaving(true);

    const { error: deleteError } = await supabase
      .from("categories")
      .delete()
      .eq("id", category.id)
      .select("id");

    setSaving(false);
    setPendingDelete(null);

    if (deleteError) {
      console.error("Delete Category Error:", deleteError);
      toast.error(
        "Could not delete category",
        "It may be linked with products."
      );
      return;
    }

setCategories((current) =>
      current.filter((category) => category.id !== category.id)
    );

    // Tell the Products dropdown this option is gone.
    invalidateCategories();

    toast.success("Category deleted", category.name);
  };

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();

    if (!term) return categories;

    return categories.filter(
      (category) =>
        category.name.toLowerCase().includes(term) ||
        (category.description ?? "").toLowerCase().includes(term)
    );
  }, [categories, search]);

  return (
    <main className="page-content">
      <PageStack>
        <PageHeader
          title="Categories"
          description="Group your catalogue into clear, reusable segments."
          actions={
            <>
              <Button
                variant="secondary"
                onClick={() => void loadCategories()}
                disabled={loading}
              >
                <RefreshIcon size={15} />
                Refresh
              </Button>

              <Button variant="primary" onClick={openAddForm}>
                <PlusIcon size={15} />
                Add category
              </Button>
            </>
          }
        />

        {error ? (
          <div className="alert alert-error" role="alert">
            <AlertIcon size={16} />
            <div className="alert-content">
              <strong>Could not load categories</strong>
              {error}
            </div>
          </div>
        ) : null}

        <div className="stat-grid">
          <StatCard
            label="Total categories"
            value={formatNumber(categories.length)}
            tone="lavender"
            icon={<LayersIcon size={16} />}
            loading={loading}
            meta="Configured segments"
          />

          <StatCard
            label="Described"
            value={formatNumber(
              categories.filter((item) => item.description?.trim()).length
            )}
            tone="pink"
            icon={<TagIcon size={16} />}
            loading={loading}
            meta="Categories with a description"
          />
        </div>

        <Card>
          <CardHeader
            title="All categories"
            description="Edit or remove the segments attached to your products."
            actions={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search categories..."
                label="Search categories"
              />
            }
          />

          <CardBody>
            {loading ? (
              <div className="loading-block">
                Loading categoriesâ€¦
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<TagIcon size={20} />}
                title={
                  categories.length === 0
                    ? "No categories yet"
                    : "No matching categories"
                }
                description={
                  categories.length === 0
                    ? "Create your first category to start organising products."
                    : "Try a different keyword."
                }
                action={
                  <Button variant="primary" onClick={openAddForm}>
                    <PlusIcon size={15} />
                    Add category
                  </Button>
                }
              />
            ) : (
              <div className="tile-grid">
                {filtered.map((category, index) => (
                  <article className="tile" key={category.id}>
                    <div className="tile-head">
                      <span className={`tile-icon ${CATEGORY_TINTS[index % CATEGORY_TINTS.length]}`}>
                        <TagIcon size={17} />
                      </span>

                      <div className="tile-body">
                        <h4>{category.name}</h4>
                        <p>{category.description || "No description provided."}</p>
                      </div>
                    </div>

                    <div className="tile-actions">
                      <span className="toolbar-count">
                        Category #{category.id}
                      </span>

                      <span className="toolbar-spacer" />

                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openEditForm(category)}
                      >
                        <PencilIcon size={14} />
                        Edit
                      </Button>

                      <Button
                        size="sm"
                        variant="soft-danger"
                        onClick={() => setPendingDelete(category)}
                      >
                        <TrashIcon size={14} />
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </PageStack>

      <Modal
        open={showForm}
        title={editingId === null ? "Add new category" : "Edit category"}
        description="Categories help you filter and report on your catalogue."
        onClose={closeForm}
        footer={
          <>
            <Button variant="ghost" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>

            <Button
              variant="primary"
              type="submit"
              form="category-form"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : editingId === null
                  ? "Save category"
                  : "Update category"}
            </Button>
          </>
        }
      >
        <form id="category-form" className="modal-form" onSubmit={saveCategory}>
          <div className="modal-body">
            <div className="form-grid">
              <Field label="Category name" required className="span-2">
                <Input
                  type="text"
                  placeholder="e.g. Electronics"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </Field>

              <Field label="Description" className="span-2">
                <Textarea
                  placeholder="Short description of this segment"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                />
              </Field>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        busy={saving}
        title="Delete category"
        description={`"${pendingDelete?.name ?? ""}" will be permanently removed. Categories linked to products cannot be deleted.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void deleteCategory(pendingDelete);
        }}
      />
    </main>
  );
}