import { useState, type FormEvent } from "react";

type Category = {
  id: number;
  name: string;
  description: string;
};

const initialCategories: Category[] = [
  {
    id: 1,
    name: "Electronics",
    description: "Electronic devices and equipment",
  },
  {
    id: 2,
    name: "Accessories",
    description: "Computer and mobile accessories",
  },
  {
    id: 3,
    name: "Furniture",
    description: "Office and shop furniture",
  },
  {
    id: 4,
    name: "Stationery",
    description: "Office and school stationery",
  },
];

function Categories() {
  const [categories, setCategories] =
    useState<Category[]>(initialCategories);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] =
    useState<number | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

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
    setName("");
    setDescription("");
  };

  const saveCategory = (e: FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert("Please enter category name.");
      return;
    }

    if (editingId !== null) {
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
    } else {
      const newCategory: Category = {
        id: Date.now(),
        name: name.trim(),
        description: description.trim(),
      };

      setCategories((currentCategories) => [
        ...currentCategories,
        newCategory,
      ]);
    }

    closeForm();
  };

  const deleteCategory = (id: number) => {
    if (
      window.confirm(
        "Are you sure you want to delete this category?"
      )
    ) {
      setCategories((currentCategories) =>
        currentCategories.filter(
          (category) => category.id !== id
        )
      );
    }
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

        {categories.map((category) => (
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
        ))}

      </div>

    </div>
  );
}

export default Categories;