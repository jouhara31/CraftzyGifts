import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";
import { clearCategoryTreeCache } from "../utils/categoryMaster";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const EMPTY_DRAFT = {
  category: "",
  subcategories: "",
};

const readApiPayload = async (response) => {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const normalizeText = (value = "") => String(value || "").trim();
const parseSubcategoryText = (value = "") =>
  Array.from(
    new Set(
      String(value || "")
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).slice(0, 60);
const joinSubcategoryText = (values = []) =>
  (Array.isArray(values) ? values : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n");
const buildDraftMap = (groups = []) =>
  (Array.isArray(groups) ? groups : []).reduce((acc, group) => {
    acc[group.id] = {
      subcategories: joinSubcategoryText(group.subcategories),
    };
    return acc;
  }, {});

export default function AdminCategories() {
  const [groups, setGroups] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [createDraft, setCreateDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const navigate = useNavigate();

  const syncCategoryState = useCallback((payload) => {
    const nextGroups = Array.isArray(payload?.groups) ? payload.groups : [];
    setGroups(nextGroups);
    setDrafts(buildDraftMap(nextGroups));
    setUpdatedAt(payload?.updatedAt || "");
    clearCategoryTreeCache();
  }, []);

  const loadCategories = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/admin/categories`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await readApiPayload(response);
      if (!response.ok) {
        setError(data.message || "Unable to load categories.");
        return;
      }
      syncCategoryState(data);
    } catch {
      setError("Unable to load categories.");
    } finally {
      setLoading(false);
    }
  }, [navigate, syncCategoryState]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const visibleGroups = useMemo(() => {
    const text = normalizeText(query).toLowerCase();
    if (!text) return groups;
    return groups.filter((group) => {
      const haystack = `${group.category || ""} ${
        Array.isArray(group.subcategories) ? group.subcategories.join(" ") : ""
      }`.toLowerCase();
      return haystack.includes(text);
    });
  }, [groups, query]);

  const summary = useMemo(() => {
    const categoriesWithoutSubcategories = groups.filter(
      (group) => !Array.isArray(group.subcategories) || group.subcategories.length === 0
    ).length;
    const totalSubcategories = groups.reduce(
      (sum, group) => sum + (Array.isArray(group.subcategories) ? group.subcategories.length : 0),
      0
    );

    return {
      totalCategories: groups.length,
      totalSubcategories,
      categoriesWithoutSubcategories,
    };
  }, [groups]);

  const handleCreateDraft = (field) => (event) => {
    setCreateDraft((prev) => ({ ...prev, [field]: event.target.value }));
    setError("");
    setNotice("");
  };

  const createCategory = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    const category = normalizeText(createDraft.category);
    if (!category) {
      setError("Category name is required.");
      return;
    }

    setCreating(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/admin/categories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category,
          subcategories: parseSubcategoryText(createDraft.subcategories),
        }),
      });
      const data = await readApiPayload(response);
      if (!response.ok) {
        setError(data.message || "Unable to create category.");
        return;
      }
      syncCategoryState(data);
      setCreateDraft(EMPTY_DRAFT);
      setNotice(`Category "${category}" created.`);
    } catch {
      setError("Unable to create category.");
    } finally {
      setCreating(false);
    }
  };

  const handleCategoryDraft = (categoryId, field) => (event) => {
    const value = event.target.value;
    setDrafts((prev) => ({
      ...prev,
      [categoryId]: {
        subcategories: prev[categoryId]?.subcategories || "",
        [field]: value,
      },
    }));
    setError("");
    setNotice("");
  };

  const openEditor = (group) => {
    setDrafts((prev) => ({
      ...prev,
      [group.id]: {
        subcategories: joinSubcategoryText(group.subcategories),
      },
    }));
    setEditingId(group.id);
    setError("");
    setNotice("");
  };

  const closeEditor = (group) => {
    setDrafts((prev) => ({
      ...prev,
      [group.id]: {
        subcategories: joinSubcategoryText(group.subcategories),
      },
    }));
    setEditingId((current) => (current === group.id ? "" : current));
    setError("");
    setNotice("");
  };

  const saveCategory = async (categoryId) => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    const draft = drafts[categoryId];
    if (!draft) return;

    setSavingId(categoryId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/admin/categories/${categoryId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subcategories: parseSubcategoryText(draft.subcategories),
        }),
      });
      const data = await readApiPayload(response);
      if (!response.ok) {
        setError(data.message || "Unable to save category.");
        return;
      }
      syncCategoryState(data);
      setEditingId("");
      setNotice("Category updated.");
    } catch {
      setError("Unable to save category.");
    } finally {
      setSavingId("");
    }
  };

  const deleteCategory = async (categoryId, categoryName) => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }

    if (!window.confirm(`Delete category "${categoryName}" from the master list?`)) {
      return;
    }

    setDeletingId(categoryId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/admin/categories/${categoryId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await readApiPayload(response);
      if (!response.ok) {
        setError(data.message || "Unable to delete category.");
        return;
      }
      syncCategoryState(data);
      setNotice(`Category "${categoryName}" removed from master list.`);
    } catch {
      setError("Unable to delete category.");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <AdminSidebarLayout
      title="Categories"
      description="Control the category master used by seller product forms while still allowing custom additions."
      actions={
        <>
          <div className="search">
            <input
              className="search-input"
              type="search"
              placeholder="Search categories"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button className="admin-text-action" type="button" onClick={loadCategories}>
            Refresh
          </button>
        </>
      }
    >
      {loading && !error && <p className="field-hint">Loading category master...</p>}
      {error && <p className="field-hint">{error}</p>}
      {notice && <p className="field-hint">{notice}</p>}

      <section className="seller-panel admin-category-summary">
        <div className="stat-grid">
          <div className="stat-card">
            <p className="stat-label">Categories</p>
            <p className="stat-value">{summary.totalCategories}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Subcategories</p>
            <p className="stat-value">{summary.totalSubcategories}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">No subcategory yet</p>
            <p className="stat-value">{summary.categoriesWithoutSubcategories}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Last sync</p>
            <p className="stat-value admin-category-date">
              {updatedAt ? new Date(updatedAt).toLocaleDateString("en-IN") : "-"}
            </p>
          </div>
        </div>
        <p className="field-hint">
          Sellers can select from this list or use the custom category option in product forms. Any
          new seller-created category can still be curated here later.
        </p>
      </section>

      <section className="seller-panel admin-category-create">
        <div className="card-head">
          <h3 className="card-title">Add Category</h3>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="adminCategoryName">Category name</label>
            <input
              id="adminCategoryName"
              type="text"
              placeholder="Eg: Baby Shower"
              value={createDraft.category}
              onChange={handleCreateDraft("category")}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="adminCategorySubcategories">Starter subcategories</label>
          <textarea
            id="adminCategorySubcategories"
            className="admin-category-textarea"
            placeholder={"One per line or comma separated\nEg: For Mom\nFor Dad"}
            value={createDraft.subcategories}
            onChange={handleCreateDraft("subcategories")}
          />
        </div>
        <div className="seller-toolbar">
          <button className="btn primary" type="button" onClick={createCategory} disabled={creating}>
            {creating ? "Adding..." : "Add Category"}
          </button>
        </div>
      </section>

      {!loading && !error && visibleGroups.length === 0 && (
        <p className="field-hint">No categories matched your search.</p>
      )}

      <section className="admin-grid admin-category-grid">
        {visibleGroups.map((group) => {
          const draft = drafts[group.id] || {
            subcategories: joinSubcategoryText(group.subcategories),
          };
          const parsedSubcategories = parseSubcategoryText(draft.subcategories);
          const isSaving = savingId === group.id;
          const isDeleting = deletingId === group.id;
          const isEditing = editingId === group.id;

          return (
            <article key={group.id} className="seller-panel admin-category-card">
              <div className="card-head">
                <div>
                  <h3 className="card-title">{group.category}</h3>
                </div>
                <div className="admin-category-card-actions">
                  <span className="seller-chip">
                    {parsedSubcategories.length} subcategor
                    {parsedSubcategories.length === 1 ? "y" : "ies"}
                  </span>
                  <button
                    className={`icon-btn admin-category-edit-btn ${isEditing ? "active" : ""}`.trim()}
                    type="button"
                    aria-label={isEditing ? "Close editor" : "Edit subcategories"}
                    onClick={() => (isEditing ? closeEditor(group) : openEditor(group))}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M4 16.5V20h3.5l9.6-9.6-3.5-3.5L4 16.5z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12.9 7.5l3.5 3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="seller-meta admin-category-chip-list">
                {parsedSubcategories.length > 0 ? (
                  parsedSubcategories.map((item) => (
                    <span key={`${group.id}-${item}`} className="seller-chip">
                      {item}
                    </span>
                  ))
                ) : (
                  <span className="seller-chip admin-category-empty">No subcategories yet</span>
                )}
              </div>

              {isEditing ? (
                <div className="admin-category-editor">
                  <div className="field">
                    <label htmlFor={`adminCategorySubs-${group.id}`}>Subcategories</label>
                    <textarea
                      id={`adminCategorySubs-${group.id}`}
                      className="admin-category-textarea"
                      value={draft.subcategories}
                      onChange={handleCategoryDraft(group.id, "subcategories")}
                    />
                  </div>

                  <div className="seller-toolbar">
                    <button
                      className="btn primary"
                      type="button"
                      disabled={isSaving || isDeleting}
                      onClick={() => saveCategory(group.id)}
                    >
                      {isSaving ? "Saving..." : "Save"}
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      disabled={isSaving || isDeleting}
                      onClick={() => deleteCategory(group.id, group.category)}
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </AdminSidebarLayout>
  );
}
