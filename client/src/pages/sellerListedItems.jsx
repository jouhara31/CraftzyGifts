import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "../components/Header";

import { API_URL } from "../apiBase";

const createId = (prefix) =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now()
    .toString(36)
    .slice(-5)}`;

const normalizeItemType = (value) =>
  String(value || "").trim().toLowerCase() === "base" ? "base" : "item";

const normalizeItemSize = (value) => String(value || "").trim();
const normalizeMainItem = (value, fallback = "") => String(value || "").trim() || fallback;
const normalizeSubItem = (value, fallback = "") => String(value || "").trim() || fallback;
const composeItemName = (mainItem, subItem) =>
  [String(mainItem || "").trim(), String(subItem || "").trim()]
    .filter(Boolean)
    .join(" - ");
const CUSTOM_MAIN_VALUE = "__custom_main__";
const BASE_CATEGORY_KIND = "base_category";
const ITEM_COLLECTION_KIND = "item_collection";
const DEFAULT_ITEM_COLLECTION_ID = "custom_hamper_items";
const ITEM_TYPE_COPY = {
  base: {
    title: "Hamper base type",
    categoryLabel: "Hamper base category",
    categorySelectPlaceholder: "Select hamper base category",
    addCategoryLabel: "Add new base category",
    nameLabel: "Hamper base type name",
    namePlaceholder: "Eg: Round cane basket / Premium gift box",
    detailLabel: "Type detail",
    detailPlaceholder: "Eg: Medium size / With handle / Magnetic lock",
    imageLabel: "Upload hamper base type image",
    categoryHint:
      "Base categories are added separately. Choose one category, then add the base type under it.",
    categorySummaryLabel: "Base category",
  },
  item: {
    title: "Hamper item",
    categoryLabel: "Hamper item category",
    categoryPlaceholder: "Eg: Chocolates / Perfumes / Cards",
    categorySelectPlaceholder: "Select hamper item category",
    addCategoryLabel: "+ Add new hamper item category",
    selectCategoryLabel: "Choose an existing item category",
    nameLabel: "Hamper item name",
    namePlaceholder: "Eg: Ferrero Rocher / Chanel No. 5 / Birthday card",
    detailLabel: "Pack or size detail",
    detailPlaceholder: "Eg: 16 pcs / 100 ml / A5 size",
    imageLabel: "Upload hamper item image",
    categoryHint:
      "Use one common category for similar items so customers can browse them together inside the hamper builder.",
    categorySummaryLabel: "Item category",
  },
};
const BASE_CATEGORY_COPY = {
  title: "Hamper base categories",
  singularTitle: "Hamper base category",
  addLabel: "Add new base category",
  editLabel: "Edit base category",
  nameLabel: "Base category name",
  namePlaceholder: "Eg: Baskets / Boxes / Bags",
  descriptionLabel: "Base category description",
  descriptionPlaceholder: "Short note customers will see before opening the available base types.",
  imageLabel: "Upload base category image",
  emptyLabel: "No base categories added yet.",
  visibilityHint:
    "Customers will see a base category only after you add at least one hamper base type inside it and publish the changes.",
};

const getItemTypeMeta = (itemType) =>
  ITEM_TYPE_COPY[normalizeItemType(itemType)] || ITEM_TYPE_COPY.item;
const getItemDisplayName = (item) =>
  normalizeSubItem(item?.subItem, String(item?.name || "").trim()) ||
  normalizeMainItem(item?.mainItem, String(item?.name || "").trim());

const createBaseCategoryId = (value, fallback = "") => {
  const text = String(value || "").trim().toLowerCase();
  const slug = text.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug ? `basecat_${slug}` : fallback || createId("basecat");
};

const extractBaseCategories = (product) => {
  const catalog = Array.isArray(product?.customizationCatalog) ? product.customizationCatalog : [];
  const explicitCategories = catalog
    .filter((category) => String(category?.kind || "").trim().toLowerCase() === BASE_CATEGORY_KIND)
    .map((category, index) => ({
      id: String(category?.id || createBaseCategoryId(category?.name, `basecat_${index}`)).trim(),
      name: String(category?.name || "").trim(),
      description: String(category?.description || "").trim(),
      image: String(category?.image || "").trim(),
    }))
    .filter((category) => category.id && category.name);

  if (explicitCategories.length > 0) return explicitCategories;

  const legacyGroups = new Map();
  catalog.forEach((category) => {
    const items = Array.isArray(category?.items) ? category.items : [];
    items.forEach((item) => {
      if (normalizeItemType(item?.type) !== "base") return;
      const groupName = normalizeMainItem(item?.mainItem, String(item?.name || "").trim());
      if (!groupName) return;
      const key = groupName.toLowerCase();
      const existing = legacyGroups.get(key);
      const fallbackDescription = normalizeItemSize(item?.size) || normalizeSubItem(item?.subItem);
      if (existing) {
        if (!existing.image && item?.image) existing.image = String(item.image || "").trim();
        if (!existing.description && fallbackDescription) existing.description = fallbackDescription;
        return;
      }
      legacyGroups.set(key, {
        id: createBaseCategoryId(groupName),
        name: groupName,
        description: fallbackDescription,
        image: String(item?.image || "").trim(),
      });
    });
  });

  return Array.from(legacyGroups.values());
};

const stripCategoryId = (item = {}) => {
  const nextItem = { ...item };
  delete nextItem.categoryId;
  return nextItem;
};

const flattenProductItems = (product) =>
  (Array.isArray(product?.customizationCatalog) ? product.customizationCatalog : []).flatMap(
    (category, categoryIndex) =>
      (Array.isArray(category?.items) ? category.items : []).map((item) => {
        const type = normalizeItemType(item?.type);
        const mainItem = normalizeMainItem(item?.mainItem, String(item?.name || "").trim());
        const subItem = normalizeSubItem(item?.subItem);
        const name = String(item?.name || composeItemName(mainItem, subItem) || mainItem).trim();
        const categoryKind =
          String(category?.kind || "").trim().toLowerCase() === BASE_CATEGORY_KIND
            ? BASE_CATEGORY_KIND
            : ITEM_COLLECTION_KIND;
        const categoryId =
          type === "base"
            ? String(
                categoryKind === BASE_CATEGORY_KIND
                  ? category?.id
                  : createBaseCategoryId(mainItem, `basecat_${categoryIndex}`)
              ).trim()
            : String(category?.id || DEFAULT_ITEM_COLLECTION_ID).trim();

        return {
          id: String(item?.id || createId("item")),
          name,
          mainItem,
          subItem,
          type,
          size: normalizeItemSize(item?.size),
          price: Number(item?.price || 0),
          stock: Number(item?.stock || 0),
          image: String(item?.image || "").trim(),
          categoryId,
          source: "custom",
          masterOptionId: "",
          active: item?.active !== false,
        };
      })
  );

const toCatalogPayload = (baseCategories = [], items = []) => {
  const safeItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const mainItem = normalizeMainItem(item?.mainItem, String(item?.name || "").trim());
      const subItem = normalizeSubItem(item?.subItem);
      const name = composeItemName(mainItem, subItem) || mainItem;
      if (!mainItem || !name) return null;

      return {
        id: String(item?.id || createId("item")),
        name,
        mainItem,
        subItem,
        type: normalizeItemType(item?.type),
        size: normalizeItemSize(item?.size),
        price: Number.isFinite(Number(item?.price)) ? Math.max(Number(item.price), 0) : 0,
        stock: Number.isFinite(Number(item?.stock))
          ? Math.max(Math.trunc(Number(item.stock)), 0)
          : 0,
        image: String(item?.image || "").trim(),
        source: "custom",
        masterOptionId: "",
        active: item?.active !== false,
        categoryId: String(item?.categoryId || "").trim(),
      };
    })
    .filter(Boolean);

  const safeBaseCategories = (Array.isArray(baseCategories) ? baseCategories : [])
    .map((category, index) => {
      const name = String(category?.name || "").trim();
      if (!name) return null;
      return {
        id: String(category?.id || createBaseCategoryId(name, `basecat_${index}`)).trim(),
        name,
        description: String(category?.description || "").trim(),
        image: String(category?.image || "").trim(),
      };
    })
    .filter(Boolean);

  const payload = safeBaseCategories.map((category) => ({
    id: category.id,
    name: category.name,
    kind: BASE_CATEGORY_KIND,
    description: category.description,
    image: category.image,
    items: safeItems
      .filter(
        (item) =>
          normalizeItemType(item?.type) === "base" &&
          String(item?.categoryId || "").trim() === category.id
      )
      .map(stripCategoryId),
  }));

  const hamperItems = safeItems
    .filter((item) => normalizeItemType(item?.type) !== "base")
    .map(stripCategoryId);

  if (hamperItems.length > 0) {
    payload.push({
      id: DEFAULT_ITEM_COLLECTION_ID,
      name: "Custom hamper items",
      kind: ITEM_COLLECTION_KIND,
      items: hamperItems,
    });
  }

  return payload;
};

const createEmptyForm = () => ({
  categoryId: "",
  mainItem: "",
  subItem: "",
  itemType: "item",
  size: "",
  price: "0",
  stock: "0",
  image: "",
  imageName: "",
  active: true,
});

const createEmptyBaseCategoryForm = () => ({
  id: "",
  name: "",
  description: "",
  image: "",
  imageName: "",
});

export default function SellerListedItems() {
  const [products, setProducts] = useState([]);
  const [baseCategories, setBaseCategories] = useState([]);
  const [draftItems, setDraftItems] = useState([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(createEmptyForm);
  const [baseCategoryForm, setBaseCategoryForm] = useState(createEmptyBaseCategoryForm);
  const [editingItemId, setEditingItemId] = useState("");
  const [editingBaseCategoryId, setEditingBaseCategoryId] = useState("");
  const [showBaseCategoryForm, setShowBaseCategoryForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mainItemMode, setMainItemMode] = useState("select");
  const itemTypeMeta = useMemo(() => getItemTypeMeta(form.itemType), [form.itemType]);

  const customizableProducts = useMemo(
    () => (Array.isArray(products) ? products : []).filter((product) => Boolean(product?.isCustomizable)),
    [products]
  );

  const loadProducts = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Please login as seller.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const productRes = await fetch(`${API_URL}/api/products/seller/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const productData = await productRes.json();
      if (!productRes.ok) {
        setError(productData.message || "Unable to load custom hamper items.");
        return;
      }

      const list = Array.isArray(productData) ? productData : [];
      setProducts(list);
      const customizableList = list.filter((product) => Boolean(product?.isCustomizable));

      const seedProduct =
        customizableList.find(
          (product) =>
            Array.isArray(product?.customizationCatalog) &&
            product.customizationCatalog.length > 0
        ) || customizableList[0];
      setBaseCategories(seedProduct ? extractBaseCategories(seedProduct) : []);
      setDraftItems(seedProduct ? flattenProductItems(seedProduct) : []);
      setEditingItemId("");
      setForm(createEmptyForm());
      setBaseCategoryForm(createEmptyBaseCategoryForm());
      setEditingBaseCategoryId("");
      setShowBaseCategoryForm(false);
      setMainItemMode("select");
      if (customizableList.length === 0) {
        setNotice(
          "Create at least one customizable product to publish seller-wide hamper items."
        );
      }
    } catch {
      setError("Unable to load custom hamper items.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const duplicateWarning = useMemo(() => {
    const itemType = normalizeItemType(form.itemType);
    const mainItem =
      itemType === "base"
        ? String(baseCategories.find((category) => category.id === form.categoryId)?.name || "").trim()
        : normalizeMainItem(form.mainItem);
    const subItem = normalizeSubItem(form.subItem);
    const type = itemType;
    const size = String(form.size || "").trim().toLowerCase();
    if (!mainItem) return "";

    const exists = draftItems.some((item) => {
      if (item.id === editingItemId) return false;
      const sameMain =
        normalizeMainItem(item?.mainItem, String(item?.name || "").trim()).toLowerCase() ===
        mainItem.toLowerCase();
      const sameSub =
        normalizeSubItem(item?.subItem).toLowerCase() === subItem.toLowerCase();
      const sameType = normalizeItemType(item?.type) === type;
      const sameSize = String(item?.size || "").trim().toLowerCase() === size;
      const sameCategoryId =
        type !== "base" ||
        String(item?.categoryId || "").trim() === String(form.categoryId || "").trim();
      return sameMain && sameSub && sameType && sameSize && sameCategoryId;
    });
    return exists
      ? "Similar item already exists in draft. Use different size/name if needed."
      : "";
  }, [baseCategories, draftItems, editingItemId, form.categoryId, form.itemType, form.size, form.mainItem, form.subItem]);

  const visibleItems = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return draftItems;
    return draftItems.filter((item) =>
      `${item.mainItem || item.name || ""} ${item.subItem || ""} ${item.type || ""} ${
        item.size || ""
      }`
        .toLowerCase()
        .includes(text)
    );
  }, [draftItems, query]);

  const sortedBaseCategories = useMemo(
    () =>
      [...baseCategories].sort((a, b) =>
        String(a?.name || "").localeCompare(String(b?.name || ""), "en", {
          sensitivity: "base",
        })
      ),
    [baseCategories]
  );

  const mainItemOptions = useMemo(() => {
    const seen = new Set();
    const selectedType = normalizeItemType(form.itemType);
    if (selectedType === "base") return [];
    draftItems.forEach((item) => {
      if (normalizeItemType(item?.type) !== selectedType) return;
      const main = normalizeMainItem(item?.mainItem, String(item?.name || "").trim());
      if (!main) return;
      seen.add(main);
    });
    return Array.from(seen).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  }, [draftItems, form.itemType]);

  const mainItemSelectValue =
    mainItemMode === "select" && mainItemOptions.includes(form.mainItem) ? form.mainItem : "";

  const previewImage = showBaseCategoryForm ? baseCategoryForm.image : form.image;

  const onUploadImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setForm((prev) => ({ ...prev, image: "", imageName: "" }));
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setForm((prev) => ({
        ...prev,
        image: result,
        imageName: file.name,
      }));
      setError("");
    };
    reader.onerror = () => setError("Unable to read selected image.");
    reader.readAsDataURL(file);
  };

  const onUploadBaseCategoryImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setBaseCategoryForm((prev) => ({ ...prev, image: "", imageName: "" }));
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setBaseCategoryForm((prev) => ({
        ...prev,
        image: result,
        imageName: file.name,
      }));
      setError("");
    };
    reader.onerror = () => setError("Unable to read selected image.");
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (normalizeItemType(form.itemType) !== "base") return;
    if (sortedBaseCategories.length === 0) {
      if (form.categoryId) {
        setForm((prev) => ({ ...prev, categoryId: "" }));
      }
      return;
    }
    if (sortedBaseCategories.some((category) => category.id === form.categoryId)) return;
    setForm((prev) => ({ ...prev, categoryId: sortedBaseCategories[0]?.id || "" }));
  }, [form.categoryId, form.itemType, sortedBaseCategories]);

  const persistDraftCatalog = async (
    nextBaseCategories,
    items,
    successNotice =
      "Hamper studio changes published. Customers will see only base categories that have at least one hamper base type."
  ) => {
    if (customizableProducts.length === 0) {
      setError(
        "No customizable products found. Create one customizable product to publish these seller-wide hamper items."
      );
      return false;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setError("Please login as seller.");
      return false;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payloadCatalog = toCatalogPayload(nextBaseCategories, items);
      const previousCatalogByProduct = new Map(
        customizableProducts.map((product) => [
          String(product._id || ""),
          Array.isArray(product.customizationCatalog) ? product.customizationCatalog : [],
        ])
      );
      const updated = [];
      const updatedProductIds = [];
      let saveErrorMessage = "";

      for (const product of customizableProducts) {
        const res = await fetch(`${API_URL}/api/products/${product._id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            customizationCatalog: payloadCatalog,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          saveErrorMessage = data.message || "Unable to save custom hamper items.";
          break;
        }
        updated.push(data);
        updatedProductIds.push(String(product._id || ""));
      }

      if (saveErrorMessage) {
        let rollbackFailed = false;

        for (const productId of updatedProductIds) {
          const previousCatalog = previousCatalogByProduct.get(productId) || [];
          try {
            const rollbackRes = await fetch(`${API_URL}/api/products/${productId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                customizationCatalog: previousCatalog,
              }),
            });
            if (!rollbackRes.ok) {
              rollbackFailed = true;
            }
          } catch {
            rollbackFailed = true;
          }
        }

        setError(
          rollbackFailed
            ? `${saveErrorMessage} Some products may have partial updates. Please refresh.`
            : `${saveErrorMessage} Applied changes were rolled back.`
        );
        return false;
      }

      setProducts((current) =>
        current.map((product) => {
          const match = updated.find(
            (entry) => String(entry?._id || "") === String(product?._id || "")
          );
          return match || product;
        })
      );
      const refreshedSource =
        updated.find((entry) => Array.isArray(entry?.customizationCatalog)) || {
          customizationCatalog: payloadCatalog,
        };
      setBaseCategories(extractBaseCategories(refreshedSource));
      setDraftItems(flattenProductItems(refreshedSource));
      setNotice(successNotice);
      return true;
    } catch {
      setError("Unable to save custom hamper items.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveBaseCategoryToDraft = async () => {
    const name = String(baseCategoryForm.name || "").trim();
    const description = String(baseCategoryForm.description || "").trim();
    if (!name) {
      setError("Base category name is required.");
      return;
    }

    const duplicate = baseCategories.some(
      (category) =>
        category.id !== editingBaseCategoryId &&
        String(category.name || "").trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      setError("A base category with the same name already exists.");
      return;
    }

    const nextCategory = {
      id: editingBaseCategoryId || createBaseCategoryId(name),
      name,
      description,
      image: String(baseCategoryForm.image || "").trim(),
    };

    const nextBaseCategories = editingBaseCategoryId
      ? baseCategories.map((category) =>
          category.id === editingBaseCategoryId ? nextCategory : category
        )
      : [...baseCategories, nextCategory];
    const nextDraftItems = draftItems.map((item) =>
      normalizeItemType(item?.type) === "base" &&
      String(item?.categoryId || "").trim() === nextCategory.id
        ? { ...item, mainItem: nextCategory.name }
        : item
    );

    setBaseCategories(nextBaseCategories);
    setDraftItems(nextDraftItems);
    setError("");

    if (editingBaseCategoryId) {
      const saved = await persistDraftCatalog(
        nextBaseCategories,
        nextDraftItems,
        "Base category updated and saved."
      );
      if (saved) {
        setEditingBaseCategoryId("");
        setBaseCategoryForm(createEmptyBaseCategoryForm());
        setShowBaseCategoryForm(false);
      }
      return;
    }

    if (normalizeItemType(form.itemType) === "base") {
      setForm((prev) => ({ ...prev, categoryId: nextCategory.id }));
    }
    setBaseCategoryForm(createEmptyBaseCategoryForm());
    setShowBaseCategoryForm(false);
    setNotice(
      "Base category added to draft. Now add at least one hamper base type under it, then click Save & Publish Changes."
    );
  };

  const saveItemToDraft = async () => {
    const itemType = normalizeItemType(form.itemType);
    const selectedCategory =
      itemType === "base"
        ? baseCategories.find((category) => category.id === form.categoryId) || null
        : null;
    const mainItem =
      itemType === "base"
        ? String(selectedCategory?.name || "").trim()
        : normalizeMainItem(form.mainItem);
    const subItem = normalizeSubItem(form.subItem);
    const itemName = composeItemName(mainItem, subItem) || mainItem;
    const itemSize = String(form.size || "").trim();

    if (itemType === "base" && !selectedCategory) {
      setError("Choose a hamper base category before adding a base type.");
      return;
    }
    if (itemType !== "base" && !mainItem) {
      setError("Hamper item category is required.");
      return;
    }
    if (!subItem) {
      setError(
        itemType === "base"
          ? "Hamper base type name is required."
          : "Hamper item name is required."
      );
      return;
    }

    const duplicate = draftItems.some((item) => {
      if (item.id === editingItemId) return false;
      const sameMain =
        normalizeMainItem(item?.mainItem, String(item?.name || "").trim()).toLowerCase() ===
        mainItem.toLowerCase();
      const sameSub =
        normalizeSubItem(item?.subItem).toLowerCase() === subItem.toLowerCase();
      const sameType = normalizeItemType(item?.type) === itemType;
      const sameSize =
        String(item?.size || "").trim().toLowerCase() === itemSize.toLowerCase();
      const sameCategoryId =
        itemType !== "base" ||
        String(item?.categoryId || "").trim() === String(selectedCategory?.id || "").trim();
      return sameMain && sameSub && sameType && sameSize && sameCategoryId;
    });
    if (duplicate) {
      setError("Same item with same detail already exists.");
      return;
    }

    const price = Number(form.price);
    const stock = Number(form.stock);
    const nextItem = {
      id: editingItemId || createId("item"),
      categoryId:
        itemType === "base"
          ? String(selectedCategory?.id || "").trim()
          : DEFAULT_ITEM_COLLECTION_ID,
      name: itemName,
      mainItem,
      subItem,
      type: itemType,
      size: itemSize,
      price: Number.isFinite(price) ? Math.max(price, 0) : 0,
      stock: Number.isFinite(stock) ? Math.max(Math.trunc(stock), 0) : 0,
      image: form.image || "",
      source: "custom",
      masterOptionId: "",
      active: Boolean(form.active),
    };

    const nextDraftItems = editingItemId
      ? draftItems.map((item) => (item.id === editingItemId ? nextItem : item))
      : [...draftItems, nextItem];
    setDraftItems(nextDraftItems);
    setError("");
    if (editingItemId) {
      const saved = await persistDraftCatalog(
        baseCategories,
        nextDraftItems,
        "Item updated and saved."
      );
      if (saved) {
        setEditingItemId("");
        setForm(createEmptyForm());
        setMainItemMode("select");
      }
      return;
    }
    setForm((prev) => ({
      ...createEmptyForm(),
      itemType: prev.itemType,
      categoryId: itemType === "base" ? String(selectedCategory?.id || "").trim() : "",
    }));
    setMainItemMode("select");
    setNotice("Item added to draft. Click Save & Publish Changes to make it live.");
  };

  const editBaseCategory = (category) => {
    if (!category?.id) return;
    setEditingBaseCategoryId(category.id);
    setBaseCategoryForm({
      id: String(category.id || "").trim(),
      name: String(category.name || "").trim(),
      description: String(category.description || "").trim(),
      image: String(category.image || "").trim(),
      imageName: "",
    });
    setShowBaseCategoryForm(true);
    setError("");
    setNotice("Editing base category. Update fields and click Save Base Category.");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const editDraftItem = (item) => {
    if (!item?.id) return;
    setEditingItemId(item.id);
    setForm({
      categoryId: normalizeItemType(item.type) === "base" ? String(item.categoryId || "").trim() : "",
      mainItem: normalizeMainItem(item.mainItem, String(item.name || "").trim()),
      subItem: normalizeSubItem(item.subItem),
      itemType: normalizeItemType(item.type),
      size: normalizeItemSize(item.size),
      price: String(Number(item.price || 0)),
      stock: String(Number(item.stock || 0)),
      image: String(item.image || "").trim(),
      imageName: "",
      active: item.active !== false,
    });
    setShowBaseCategoryForm(false);
    setMainItemMode("select");
    setError("");
    setNotice("Editing item. Update fields and click Update Item.");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const removeBaseCategory = (categoryId) => {
    const hasTypes = draftItems.some(
      (item) =>
        normalizeItemType(item?.type) === "base" &&
        String(item?.categoryId || "").trim() === String(categoryId || "").trim()
    );
    if (hasTypes) {
      setError("Remove the base types inside this category before deleting the category.");
      return;
    }

    setBaseCategories((current) =>
      current.filter((category) => String(category.id || "").trim() !== String(categoryId || "").trim())
    );
    if (editingBaseCategoryId === categoryId) {
      setEditingBaseCategoryId("");
      setBaseCategoryForm(createEmptyBaseCategoryForm());
      setShowBaseCategoryForm(false);
    }
    if (normalizeItemType(form.itemType) === "base" && form.categoryId === categoryId) {
      setForm((prev) => ({ ...prev, categoryId: "" }));
    }
    setError("");
    setNotice("Base category removed from draft. Save changes to publish.");
  };

  const removeDraftItem = (itemId) => {
    setDraftItems((current) => current.filter((item) => item.id !== itemId));
    if (itemId === editingItemId) {
      setEditingItemId("");
      setForm(createEmptyForm());
      setMainItemMode("select");
    }
    setNotice("");
  };

  const saveDraftItems = async () => {
    await persistDraftCatalog(baseCategories, draftItems);
  };

  return (
    <div className="page seller-page">
      <Header variant="seller" />

      <div className="section-head">
        <div>
          <h2>Hamper Studio</h2>
          <p>Add seller-wide hamper base categories, base names, and hamper items for customization.</p>
        </div>
        <div className="seller-toolbar">
          <div className="search wide">
            <input
              className="search-input"
              type="search"
              placeholder="Search hamper bases or items"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button className="btn ghost" type="button" onClick={loadProducts}>
            Refresh
          </button>
        </div>
      </div>

      {loading && <p className="field-hint">Loading custom hamper items...</p>}
      {error && <p className="field-hint">{error}</p>}
      {notice && <p className="field-hint">{notice}</p>}

      <section className="seller-panel seller-base-category-panel">
        <div className="card-head">
          <h3 className="card-title">{BASE_CATEGORY_COPY.title}</h3>
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              setEditingBaseCategoryId("");
              setBaseCategoryForm(createEmptyBaseCategoryForm());
              setShowBaseCategoryForm(true);
              setError("");
              setNotice("");
            }}
          >
            {BASE_CATEGORY_COPY.addLabel}
          </button>
        </div>
        <p className="field-hint">
          Add the first customer-facing base cards here. Each card needs only a name, image, and
          short description.
        </p>
        <p className="field-hint">{BASE_CATEGORY_COPY.visibilityHint}</p>

        {showBaseCategoryForm && (
          <div className="seller-base-category-editor">
            <div className="field-row">
              <div className="field">
                <label htmlFor="baseCategoryName">{BASE_CATEGORY_COPY.nameLabel}</label>
                <input
                  id="baseCategoryName"
                  type="text"
                  placeholder={BASE_CATEGORY_COPY.namePlaceholder}
                  value={baseCategoryForm.name}
                  onChange={(event) =>
                    setBaseCategoryForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="baseCategoryDescription">
                  {BASE_CATEGORY_COPY.descriptionLabel}
                </label>
                <textarea
                  id="baseCategoryDescription"
                  placeholder={BASE_CATEGORY_COPY.descriptionPlaceholder}
                  value={baseCategoryForm.description}
                  onChange={(event) =>
                    setBaseCategoryForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="seller-studio-upload">
              <input type="file" accept="image/*" onChange={onUploadBaseCategoryImage} />
              <p>
                {baseCategoryForm.imageName
                  ? `Selected: ${baseCategoryForm.imageName}`
                  : BASE_CATEGORY_COPY.imageLabel}
              </p>
            </div>

            <div className="seller-studio-actions">
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setEditingBaseCategoryId("");
                  setBaseCategoryForm(createEmptyBaseCategoryForm());
                  setShowBaseCategoryForm(false);
                }}
              >
                Cancel
              </button>
              <button className="btn primary" type="button" onClick={saveBaseCategoryToDraft}>
                {editingBaseCategoryId
                  ? `Save ${BASE_CATEGORY_COPY.singularTitle}`
                  : BASE_CATEGORY_COPY.addLabel}
              </button>
            </div>
          </div>
        )}

        {sortedBaseCategories.length === 0 ? (
          <p className="field-hint">{BASE_CATEGORY_COPY.emptyLabel}</p>
        ) : (
          <div className="seller-base-category-grid">
            {sortedBaseCategories.map((category) => {
              const categoryTypeCount = draftItems.filter(
                (item) =>
                  normalizeItemType(item?.type) === "base" &&
                  String(item?.categoryId || "").trim() === String(category.id || "").trim()
              ).length;

              return (
                <article key={category.id} className="seller-base-category-card">
                  {category.image ? (
                    <img
                      className="seller-base-category-thumb"
                      src={category.image}
                      alt={category.name}
                    />
                  ) : (
                    <div className="seller-base-category-thumb seller-thumb-placeholder">
                      No image
                    </div>
                  )}
                  <div className="seller-base-category-body">
                    <p className="mini-title">{category.name}</p>
                    <p className="mini-sub">
                      {category.description || "No description added yet."}
                    </p>
                    <p className="mini-sub">
                      Base types: {categoryTypeCount}
                    </p>
                    {categoryTypeCount === 0 ? (
                      <p className="seller-base-category-status pending">
                        Hidden from customers until you add one hamper base type and publish.
                      </p>
                    ) : (
                      <p className="seller-base-category-status live">
                        Visible to customers after you publish the changes.
                      </p>
                    )}
                  </div>
                  <div className="seller-base-category-actions">
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => editBaseCategory(category)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => removeBaseCategory(category.id)}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="seller-studio-layout">
        <article className="seller-studio-card">
          <div className="card-head">
            <h3 className="card-title">
              {editingItemId ? `Edit ${itemTypeMeta.title}` : `Add ${itemTypeMeta.title}`}
            </h3>
            <span className="chip">Classic Studio</span>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="studioType">Listing type</label>
              <select
                id="studioType"
                value={form.itemType}
                onChange={(event) => {
                  const nextType = normalizeItemType(event.target.value);
                  setMainItemMode("select");
                  setForm(() => ({
                    ...createEmptyForm(),
                    itemType: nextType,
                    categoryId:
                      nextType === "base" ? sortedBaseCategories[0]?.id || "" : "",
                  }));
                }}
              >
                <option value="base">Hamper Base Type</option>
                <option value="item">Hamper Item</option>
              </select>
            </div>

            {normalizeItemType(form.itemType) === "base" ? (
              <div className="field">
                <label htmlFor="studioBaseCategory">{itemTypeMeta.categoryLabel}</label>
                <select
                  id="studioBaseCategory"
                  value={form.categoryId}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, categoryId: event.target.value }))
                  }
                  disabled={sortedBaseCategories.length === 0}
                >
                  {sortedBaseCategories.length === 0 ? (
                    <option value="">Add a base category first</option>
                  ) : (
                    sortedBaseCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))
                  )}
                </select>
                <div className="seller-inline-actions">
                  <button
                    className="btn ghost seller-inline-toggle"
                    type="button"
                    onClick={() => {
                      setEditingBaseCategoryId("");
                      setBaseCategoryForm(createEmptyBaseCategoryForm());
                      setShowBaseCategoryForm(true);
                    }}
                  >
                    {itemTypeMeta.addCategoryLabel}
                  </button>
                </div>
                <p className="field-hint">{itemTypeMeta.categoryHint}</p>
                <p className="field-hint seller-inline-hint">
                  Customers see this base category only after you add at least one hamper base type
                  inside it and publish the changes.
                </p>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="studioMainItem">{itemTypeMeta.categoryLabel}</label>
                {mainItemMode === "custom" ? (
                  <>
                    <input
                      id="studioMainItem"
                      type="text"
                      placeholder={itemTypeMeta.categoryPlaceholder}
                      value={form.mainItem}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, mainItem: event.target.value }))
                      }
                    />
                    <button
                      className="btn ghost seller-inline-toggle"
                      type="button"
                      onClick={() => {
                        setMainItemMode("select");
                        setForm((prev) => ({ ...prev, mainItem: "", subItem: "" }));
                      }}
                    >
                      {itemTypeMeta.selectCategoryLabel}
                    </button>
                  </>
                ) : (
                  <select
                    id="studioMainItem"
                    value={mainItemSelectValue}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (nextValue === CUSTOM_MAIN_VALUE) {
                        setMainItemMode("custom");
                        setForm((prev) => ({ ...prev, mainItem: "", subItem: "" }));
                        return;
                      }
                      setForm((prev) => ({ ...prev, mainItem: nextValue, subItem: "" }));
                    }}
                  >
                    <option value="">{itemTypeMeta.categorySelectPlaceholder}</option>
                    {mainItemOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                    <option value={CUSTOM_MAIN_VALUE}>{itemTypeMeta.addCategoryLabel}</option>
                  </select>
                )}
                <p className="field-hint">{itemTypeMeta.categoryHint}</p>
              </div>
            )}

            <div className="field">
              <label htmlFor="studioSubItem">{itemTypeMeta.nameLabel}</label>
              <input
                id="studioSubItem"
                type="text"
                placeholder={itemTypeMeta.namePlaceholder}
                value={form.subItem}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, subItem: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="studioSize">{itemTypeMeta.detailLabel}</label>
              <input
                id="studioSize"
                type="text"
                placeholder={itemTypeMeta.detailPlaceholder}
                value={form.size}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, size: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="studioPrice">Rate</label>
              <input
                id="studioPrice"
                type="number"
                min="0"
                value={form.price}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, price: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label htmlFor="studioStock">Stock</label>
              <input
                id="studioStock"
                type="number"
                min="0"
                value={form.stock}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, stock: event.target.value }))
                }
              />
            </div>
          </div>

          {duplicateWarning && <p className="field-hint">{duplicateWarning}</p>}

          <div className="seller-studio-upload">
            <input type="file" accept="image/*" onChange={onUploadImage} />
            <p>{form.imageName ? `Selected: ${form.imageName}` : itemTypeMeta.imageLabel}</p>
          </div>

          <div className="seller-studio-actions">
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setForm(createEmptyForm());
                setEditingItemId("");
                setMainItemMode("select");
              }}
            >
              Cancel
            </button>
            <button className="btn primary" type="button" onClick={saveItemToDraft}>
              {editingItemId ? `Update ${itemTypeMeta.title}` : `Add ${itemTypeMeta.title}`}
            </button>
          </div>
        </article>

        <aside className="seller-studio-preview">
          <h3>
            {showBaseCategoryForm ? BASE_CATEGORY_COPY.singularTitle : itemTypeMeta.title} preview
          </h3>
          {previewImage ? (
            <img
              src={previewImage}
              alt={`${
                showBaseCategoryForm ? BASE_CATEGORY_COPY.singularTitle : itemTypeMeta.title
              } preview`}
              className="seller-studio-preview-main"
            />
          ) : (
            <div className="seller-studio-preview-main seller-preview-placeholder">
              {showBaseCategoryForm ? BASE_CATEGORY_COPY.imageLabel : itemTypeMeta.imageLabel}
            </div>
          )}
        </aside>
      </section>

      <section className="seller-panel">
        <div className="card-head">
          <h3 className="card-title">Draft hamper entries</h3>
          <button
            className="btn primary"
            type="button"
            onClick={saveDraftItems}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save & Publish Changes"}
          </button>
        </div>
        {products.length === 0 && (
          <p className="field-hint">
            No products listed yet. You can keep adding items to draft and publish after creating a
            product.
          </p>
        )}
        {products.length > 0 && customizableProducts.length === 0 && (
          <p className="field-hint">
            Custom hamper items are seller-wide, but they are published only through customizable
            products. Mark at least one product as customizable first.
          </p>
        )}
        <p className="field-hint">
          These items are shared across all customizable hamper flows in your store.
        </p>
        <p className="field-hint">
          Base categories without hamper base types stay hidden on the customer side.
        </p>

        {draftItems.length === 0 && (
          <p className="field-hint">No hamper bases or items in draft yet.</p>
        )}

        <div className="seller-draft-items">
          {draftItems.map((item) => (
            <article key={item.id} className="seller-draft-item-card">
              {item.image ? (
                <img
                  src={item.image}
                  alt={item.name}
                  className="seller-draft-item-thumb"
                />
              ) : (
                <div className="seller-draft-item-thumb seller-thumb-placeholder">No image</div>
              )}
              <div>
                <p className="mini-title">{getItemDisplayName(item)}</p>
                <p className="mini-sub">
                  {getItemTypeMeta(item.type).categorySummaryLabel}: {item.mainItem || "Not set"}
                </p>
                <p className="mini-sub">
                  Type: {item.type === "base" ? "Hamper Base" : "Hamper Item"}
                </p>
                <p className="mini-sub">
                  {getItemTypeMeta(item.type).detailLabel}: {item.size || "General"}
                </p>
                <p className="mini-sub">Rate: ₹{Number(item.price || 0).toLocaleString("en-IN")}</p>
                <p className="mini-sub">Stock: {Number(item.stock || 0)}</p>
              </div>
              <div className="seller-draft-item-actions">
                <button className="btn ghost" type="button" onClick={() => editDraftItem(item)}>
                  Update
                </button>
                <button className="btn ghost" type="button" onClick={() => removeDraftItem(item.id)}>
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {!loading && !error && visibleItems.length === 0 && (
        <p className="field-hint">No hamper bases or items listed yet.</p>
      )}

      <div className="seller-listed-grid">
        {visibleItems.map((item) => {
          const itemStock = Number(item.stock || 0);
          const isOutOfStock = itemStock <= 0;
          const statusClass = item.active
            ? isOutOfStock
              ? "warning"
              : "available"
            : "locked";
          const statusLabel = item.active
            ? isOutOfStock
              ? "Out of stock"
              : "Active"
            : "Inactive";

          return (
            <article key={item.id} className="seller-listed-card">
              {item.image ? (
                <img className="seller-listed-thumb" src={item.image} alt={item.name} />
              ) : (
                <div className="seller-listed-thumb seller-thumb-placeholder">No image</div>
              )}
              <div className="seller-listed-body">
                <p className="mini-title">{getItemDisplayName(item)}</p>
                <p className="mini-sub">
                  {getItemTypeMeta(item.type).categorySummaryLabel}: {item.mainItem || "Not set"}
                </p>
                <p className="mini-sub">
                  Type: {item.type === "base" ? "Hamper Base" : "Hamper Item"}
                </p>
                <p className="mini-sub">
                  {getItemTypeMeta(item.type).detailLabel}: {item.size || "General"}
                </p>
                <p className="mini-sub">
                  Rate: ₹{Number(item.price || 0).toLocaleString("en-IN")}
                </p>
                <p className="mini-sub">Stock: {itemStock}</p>
                <button className="btn ghost" type="button" onClick={() => editDraftItem(item)}>
                  Update
                </button>
                <span className={`status-pill ${statusClass}`}>{statusLabel}</span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
