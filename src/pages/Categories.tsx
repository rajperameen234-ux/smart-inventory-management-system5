import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../supabase";

type Category = {
  id: number;
  name: string;
  description: string;
};

function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] =
    useState<number | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [loading, setLoading] = useState(true);

  // LOAD CATEGORIES FROM SUPABASE
  const loadCategories = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.error("Load Categories Error:", error);
      alert("Failed to load categories from database.");
      setLoading(false);
      return;
    }

    setCategories(data || []);
    setLoading(false);
  };

  // LOAD WHEN PAGE OPENS
  useEffect(() => {
    loadCategories();
  }, []);

  // ADD CATEGORY FORM
  const openAddForm = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setShowForm(true);
  };

  // EDIT CATEGORY FORM
  const openEditForm = (category: Category) => {
    setEditingId(category.id);
    setName(category.name);
    setDescription(category.description);
    setShowForm(true);
  };

  // CLOSE FORM
  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setName("");
    setDescription("");
  };

  // SAVE / UPDATE CATEGORY
  const saveCategory = async (e: FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert("Please enter category name.");
      return;
    }

    // UPDATE
    if (editingId !== null) {
      const { error } = await supabase
        .from("categories")
        .update({
          name: name.trim(),
          description: description.trim(),
        })
        .eq("id", editingId);

      if (error) {
        console.error("Update Category Error:", error);
        alert("Failed to update category.");
        return;
      }

      setCategories((currentCategories) =>
        currentCategories.map((category) =>
          category.id === editingId
            ? {
                ...category,
                name: name.trim(),
                description: description.trim(),
              }
            : category
        )
      );

      alert("Category updated successfully!");
    } else {
      // ADD
      const { data, error } = await supabase
        .from("categories")
        .insert([
          {
            name: name.trim(),
            description: description.trim(),
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Add Category Error:", error);
        alert("Failed to add category.");
        return;
      }

      setCategories((currentCategories) => [
        ...currentCategories,
        data,
      ]);

      alert("Category added successfully!");
    }

    closeForm();
  };

  // DELETE CATEGORY
  const deleteCategory = async (id: number) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this category?"
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Delete Category Error:", error);
      alert(
        "Failed to delete category. It may be linked with products."
      );
      return;
    }

    setCategories((currentCategories) =>
      currentCategories.filter(
        (category) => category.id !== id
      )
    );

    alert("Category deleted successfully!");
  };

  return (
    <div className="categories-page">

      <div className="categories-header">
        <div>
          <h1>Categories</h1>
          <p>Manage your product categories</p>
        </div>

        <button
          type="button"
          className="add-category-btn"
          onClick={openAddForm}
        >
          + Add Category
        </button>
      </div>

      {showForm && (
        <div className="category-form-card">

          <div className="category-form-header">
            <div>
              <h2>
                {editingId === null
                  ? "Add New Category"
                  : "Edit Category"}
              </h2>

              <p>
                Enter category information
              </p>
            </div>

            <button
              type="button"
              className="close-category-form"
              onClick={closeForm}
            >
              ✕
            </button>
          </div>

          <form onSubmit={saveCategory}>

            <div className="category-form-grid">

              <div className="category-form-group">
                <label>Category Name</label>

                <input
                  type="text"
                  placeholder="Enter category name"
                  value={name}
                  onChange={(e) =>
                    setName(e.target.value)
                  }
                />
              </div>

              <div className="category-form-group">
                <label>Description</label>

                <input
                  type="text"
                  placeholder="Enter description"
                  value={description}
                  onChange={(e) =>
                    setDescription(e.target.value)
                  }
                />
              </div>

            </div>

            <div className="category-form-actions">

              <button
                type="button"
                className="category-cancel-btn"
                onClick={closeForm}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="save-category-btn"
              >
                {editingId === null
                  ? "Save Category"
                  : "Update Category"}
              </button>

            </div>

          </form>

        </div>
      )}

      <div className="categories-grid">

        {loading ? (

          <div className="category-card">
            <div className="category-info">
              <h3>Loading categories...</h3>
            </div>
          </div>

        ) : categories.length === 0 ? (

          <div className="category-card">
            <div className="category-info">
              <h3>No categories found</h3>
              <p>Add your first category.</p>
            </div>
          </div>

        ) : (

          categories.map((category) => (
            <div
              className="category-card"
              key={category.id}
            >

              <div className="category-icon">
                🏷️
              </div>

              <div className="category-info">
                <h3>{category.name}</h3>

                <p>
                  {category.description ||
                    "No description"}
                </p>

                <span>
                  Category #{category.id}
                </span>
              </div>

              <div className="category-actions">

                <button
                  type="button"
                  className="category-edit-btn"
                  onClick={() =>
                    openEditForm(category)
                  }
                >
                  ✏️ Edit
                </button>

                <button
                  type="button"
                  className="category-delete-btn"
                  onClick={() =>
                    deleteCategory(category.id)
                  }
                >
                  🗑️ Delete
                </button>

              </div>

            </div>
          ))

        )}

      </div>

    </div>
  );
}

export default Categories;