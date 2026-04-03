import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebarLayout from "../components/AdminSidebarLayout";
import { clearCategoryTreeCache, DEFAULT_CATEGORY_TREE } from "../utils/categoryMaster";

import { API_URL } from "../apiBase";
import { apiFetchJson, clearAuthSession, hasActiveSession } from "../utils/authSession";
const EMPTY_DRAFT = {
  category: "",
  subcategories: "",
};

const normalizeText = (value = "") => String(value || "").trim();
const normalizeKey = (value = "") => normalizeText(value).toLowerCase();
const resolveGroupsPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.groups)) return payload.groups;
  return null;
};
const findUpdatedGroup = (groups = [], categoryId, fallbackCategory = "") =>
  (Array.isArray(groups) ? groups : []).find((group) => group?.id === categoryId) ||
  (fallbackCategory
    ? (Array.isArray(groups) ? groups : []).find(
        (group) => normalizeKey(group?.category) === normalizeKey(fallbackCategory)
      )
    : null);
const matchesCategoryQuery = (group, text = "") => {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return true;
  const haystack = `${group?.category || ""} ${
    Array.isArray(group?.subcategories) ? group.subcategories.join(" ") : ""
  }`.toLowerCase();
  return haystack.includes(normalized);
};
const getDefaultSubcategories = (category = "") => {
  const match = (Array.isArray(DEFAULT_CATEGORY_TREE) ? DEFAULT_CATEGORY_TREE : []).find(
    (group) => normalizeKey(group?.category) === normalizeKey(category)
  );
  return Array.isArray(match?.subcategories) ? match.subcategories : [];
};
const parseSubcategoryText = (value = "") => {
  const seen = new Set();
  return String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 60);
};
const normalizeSubcategoryInput = (value) => {
  if (Array.isArray(value)) {
    return value.join("\n");
  }
  return String(value ?? "");
};
const summarizeIgnored = (items = []) => {
  const preview = items.slice(0, 3);
  const remaining = items.length - preview.length;
  if (remaining > 0) {
    return `${preview.join(", ")} +${remaining} more`;
  }
  return preview.join(", ");
};
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
  const [restoringDefaults, setRestoringDefaults] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const navigate = useNavigate();
  const groupsRef = useRef([]);
  const restoreConfirmRef = useRef(null);
  const clearAndRedirect = useCallback(() => {
    clearAuthSession();
    navigate("/login", { replace: true });
  }, [navigate]);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    return () => {
      if (restoreConfirmRef.current) {
        clearTimeout(restoreConfirmRef.current);
      }
    };
  }, []);

  const syncCategoryState = useCallback(
    (payload, { preserveOnEmpty = false, preserveOnShrink = false } = {}) => {
      const nextGroups = resolveGroupsPayload(payload) || [];
      const currentLength = groupsRef.current.length;
      const nextLength = nextGroups.length;
      const shouldPreserve =
        (preserveOnEmpty && nextLength === 0 && currentLength > 0) ||
        (preserveOnShrink && nextLength > 0 && nextLength < currentLength);
      const finalGroups = shouldPreserve ? groupsRef.current : nextGroups;
      setGroups(finalGroups);
      setDrafts(buildDraftMap(finalGroups));
      setUpdatedAt(payload?.updatedAt || "");
      clearCategoryTreeCache();
      return finalGroups;
    },
    []
  );

  const loadCategories = useCallback(
    async ({ silent = false, preserveOnEmpty = false, preserveOnShrink = false } = {}) => {
      if (!hasActiveSession()) {
        clearAndRedirect();
        return;
      }

      if (!silent) {
        setLoading(true);
      }
      setError("");
      try {
        const { response, data } = await apiFetchJson(`${API_URL}/api/admin/categories`);
        if (response.status === 401) {
          clearAndRedirect();
          return null;
        }
        if (!response.ok) {
          setError(data.message || "Unable to load categories.");
          return null;
        }
        syncCategoryState(data, { preserveOnEmpty, preserveOnShrink });
        return data;
      } catch {
        setError("Unable to load categories.");
        return null;
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [clearAndRedirect, syncCategoryState]
  );

  useEffect(() => {
    loadCategories({ preserveOnEmpty: true });
  }, [loadCategories]);

  const visibleGroups = useMemo(() => {
    return groups.filter((group) => matchesCategoryQuery(group, query));
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

  const missingDefaults = useMemo(() => {
    const current = new Set(
      (Array.isArray(groups) ? groups : []).map((group) => normalizeKey(group?.category))
    );
    return (Array.isArray(DEFAULT_CATEGORY_TREE) ? DEFAULT_CATEGORY_TREE : []).filter(
      (group) => !current.has(normalizeKey(group?.category))
    );
  }, [groups]);

  const handleCreateDraft = (field) => (event) => {
    setCreateDraft((prev) => ({ ...prev, [field]: event.target.value }));
    setError("");
    setNotice("");
  };

  const createCategory = async () => {
    if (!hasActiveSession()) {
      clearAndRedirect();
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
      const { response, data } = await apiFetchJson(`${API_URL}/api/admin/categories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          category,
          subcategories: parseSubcategoryText(createDraft.subcategories),
        }),
      });
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data.message || "Unable to create category.");
        return;
      }
      syncCategoryState(data, { preserveOnEmpty: true });
      setCreateDraft(EMPTY_DRAFT);
      setNotice(`Category "${category}" created.`);
    } catch {
      setError("Unable to create category.");
    } finally {
      setCreating(false);
    }
  };

  const restoreMissingDefaults = async () => {
    if (missingDefaults.length === 0) {
      setNotice("All default categories are already present.");
      return;
    }
    if (!confirmRestore) {
      setConfirmRestore(true);
      setNotice("Tap Restore all again to confirm.");
      if (restoreConfirmRef.current) {
        clearTimeout(restoreConfirmRef.current);
      }
      restoreConfirmRef.current = setTimeout(() => {
        setConfirmRestore(false);
      }, 2500);
      return;
    }
    setConfirmRestore(false);
    if (restoreConfirmRef.current) {
      clearTimeout(restoreConfirmRef.current);
      restoreConfirmRef.current = null;
    }
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    setRestoringDefaults(true);
    setError("");
    setNotice("");
    const created = [];
    const failed = [];
    for (const group of missingDefaults) {
      try {
        const { response, data } = await apiFetchJson(`${API_URL}/api/admin/categories`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            category: normalizeText(group.category),
            subcategories: Array.isArray(group.subcategories) ? group.subcategories : [],
          }),
        });
        if (response.status === 401) {
          clearAndRedirect();
          return;
        }
        if (!response.ok) {
          failed.push(group.category || "Unknown");
          continue;
        }
        created.push(group.category || "Unknown");
        syncCategoryState(data, { preserveOnEmpty: true, preserveOnShrink: true });
      } catch {
        failed.push(group.category || "Unknown");
      }
    }

    await loadCategories({ silent: true, preserveOnEmpty: true, preserveOnShrink: true });
    if (failed.length === 0) {
      setNotice(`Restored ${created.length} default categories.`);
    } else {
      setNotice(
        `Restored ${created.length} categories. Failed: ${summarizeIgnored(failed)}.`
      );
    }
    setRestoringDefaults(false);
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

  const saveCategory = async (categoryId, subcategoriesOverride) => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    const draft = drafts[categoryId];
    if (!draft && subcategoriesOverride === undefined) return;
    const sourceText =
      subcategoriesOverride !== undefined
        ? normalizeSubcategoryInput(subcategoriesOverride)
        : draft?.subcategories || "";
    const requestedSubcategories = parseSubcategoryText(sourceText);
    const previousGroup = groups.find((group) => group.id === categoryId);
    const previousKeys = new Set(
      (Array.isArray(previousGroup?.subcategories) ? previousGroup.subcategories : []).map(
        normalizeKey
      )
    );
    const requestedKeys = new Set(requestedSubcategories.map(normalizeKey));
    const noChangeRequested =
      requestedKeys.size === previousKeys.size &&
      Array.from(requestedKeys).every((key) => previousKeys.has(key));

    const optimisticSource = groupsRef.current;
    const optimisticGroups = Array.isArray(optimisticSource)
      ? optimisticSource.map((group) =>
          group?.id === categoryId ? { ...group, subcategories: requestedSubcategories } : group
        )
      : [];
    if (optimisticGroups.length === optimisticSource.length && optimisticGroups.length > 0) {
      setGroups(optimisticGroups);
      setDrafts(buildDraftMap(optimisticGroups));
    }

    setSavingId(categoryId);
    setError("");
    setNotice("");
    try {
      const { response, data } = await apiFetchJson(`${API_URL}/api/admin/categories/${categoryId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subcategories: requestedSubcategories,
        }),
      });
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data.message || "Unable to save category.");
        await loadCategories({ silent: true });
        return;
      }

      const freshData = await loadCategories({
        silent: true,
        preserveOnEmpty: true,
        preserveOnShrink: true,
      });
      const resolvedGroups =
        resolveGroupsPayload(freshData) || resolveGroupsPayload(data) || [];
      const updatedGroup = findUpdatedGroup(
        resolvedGroups,
        categoryId,
        previousGroup?.category || ""
      );
      const buildNotice = () => {
        if (!updatedGroup) return "Category updated.";
        const savedSubcategories = Array.isArray(updatedGroup.subcategories)
          ? updatedGroup.subcategories
          : [];
        const savedKeys = new Set(savedSubcategories.map(normalizeKey));
        const ignored = requestedSubcategories.filter(
          (item) => !savedKeys.has(normalizeKey(item))
        );
        if (ignored.length > 0) {
          return `Some subcategories were ignored (duplicates or 60-limit): ${summarizeIgnored(
            ignored
          )}.`;
        }
        if (noChangeRequested) {
          return "No new subcategories to add.";
        }
        return "Category updated.";
      };

      let nextNotice = buildNotice();
      if (normalizeText(query) && !matchesCategoryQuery(updatedGroup, query)) {
        setQuery("");
        nextNotice = `${nextNotice} Search cleared to show updated category.`;
      }
      setNotice(nextNotice);
      setEditingId("");
    } catch {
      setError("Unable to save category.");
    } finally {
      setSavingId("");
    }
  };

  const restoreDefaults = async (group) => {
    const defaults = getDefaultSubcategories(group?.category || "");
    if (defaults.length === 0) return;
    if (
      !window.confirm(
        `Restore ${defaults.length} default subcategories for "${group?.category}"?`
      )
    ) {
      return;
    }
    setDrafts((prev) => ({
      ...prev,
      [group.id]: { subcategories: joinSubcategoryText(defaults) },
    }));
    await saveCategory(group.id, defaults);
  };

  const deleteCategory = async (categoryId, categoryName) => {
    if (!hasActiveSession()) {
      clearAndRedirect();
      return;
    }

    if (!window.confirm(`Delete category "${categoryName}" from the master list?`)) {
      return;
    }

    setDeletingId(categoryId);
    setError("");
    setNotice("");
    try {
      const { response, data } = await apiFetchJson(`${API_URL}/api/admin/categories/${categoryId}`, {
        method: "DELETE",
      });
      if (response.status === 401) {
        clearAndRedirect();
        return;
      }
      if (!response.ok) {
        setError(data.message || "Unable to delete category.");
        return;
      }
      syncCategoryState(data, { preserveOnEmpty: true });
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
      titleActions={
        <button
          className="admin-text-action admin-category-refresh-mobile"
          type="button"
          onClick={loadCategories}
        >
          Refresh
        </button>
      }
      actions={
        <div className="admin-category-actions">
          <div className="search">
            <input
              className="search-input"
              type="search"
              placeholder="Search categories"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button
            className="admin-text-action admin-category-refresh-desktop"
            type="button"
            onClick={loadCategories}
          >
            Refresh
          </button>
        </div>
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
        {missingDefaults.length === 0 && (
          <p className="field-hint">All default categories are present.</p>
        )}
      </section>

      {missingDefaults.length > 0 && (
        <section className="seller-panel admin-category-missing">
          <div className="card-head">
            <h3 className="card-title">Missing default categories</h3>
            <button
              className="btn ghost"
              type="button"
              onClick={restoreMissingDefaults}
              disabled={restoringDefaults}
            >
              {restoringDefaults
                ? "Restoring..."
                : confirmRestore
                  ? "Tap again to confirm"
                  : "Restore all"}
            </button>
          </div>
          <div className="seller-meta">
            {missingDefaults.map((group) => (
              <span key={group.id || group.category} className="seller-chip">
                {group.category}
              </span>
            ))}
          </div>
          <p className="field-hint">
            These categories exist in defaults but are missing from the master list.
          </p>
        </section>
      )}

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
          <p className="field-hint">
            Duplicates (case-insensitive) are ignored. Max 60 subcategories per category.
          </p>
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
          const defaultSubcategories = getDefaultSubcategories(group.category);
          const canRestoreDefaults =
            parsedSubcategories.length === 0 && defaultSubcategories.length > 0;
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
                  {canRestoreDefaults ? (
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => restoreDefaults(group)}
                      disabled={isSaving || isDeleting}
                    >
                      Restore defaults
                    </button>
                  ) : null}
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
                  <p className="field-hint">
                    Duplicates (case-insensitive) are ignored. Max 60 subcategories per category.
                  </p>
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

