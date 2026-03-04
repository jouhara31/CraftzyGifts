import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header";
import CustomizationPanel from "../components/customizationPanel";
import { getProductImage } from "../utils/productMedia";
import { addToCart, getCart, setCustomization } from "../utils/cart";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const OPTION_LABELS = {
  giftBoxes: "Gift box",
  chocolates: "Chocolates",
  frames: "Frame style",
  perfumes: "Perfume",
  cards: "Card type",
};
const HIDDEN_EXISTING_OPTION_KEYS = new Set(["custom_hamper_items"]);

const formatPrice = (value) => Number(value || 0).toLocaleString("en-IN");
const normalizeItemType = (value) =>
  String(value || "").trim().toLowerCase() === "base" ? "base" : "item";
const normalizeMainItem = (value, fallback = "") => String(value || "").trim() || fallback;
const normalizeSubItem = (value) => String(value || "").trim();
const composeItemName = (mainItem, subItem, fallback = "") =>
  [String(mainItem || "").trim(), String(subItem || "").trim()].filter(Boolean).join(" - ") ||
  fallback;
const describeBaseVariant = (item) =>
  String(item?.subItem || "").trim() || String(item?.size || "").trim();

const getSellerCatalogCategories = (product) =>
  (Array.isArray(product?.customizationCatalog) ? product.customizationCatalog : [])
    .map((category) => ({
      id: String(category?.id || ""),
      label: String(category?.name || "").trim(),
      items: (Array.isArray(category?.items) ? category.items : [])
        .filter((item) => item?.active !== false)
        .map((item) => {
          const mainItem = normalizeMainItem(item?.mainItem, String(item?.name || "").trim());
          const subItem = normalizeSubItem(item?.subItem);
          const name = composeItemName(mainItem, subItem, String(item?.name || "").trim());
          return {
            id: String(item?.id || ""),
            name,
            mainItem,
            subItem,
            type: normalizeItemType(item?.type),
            size: String(item?.size || "").trim(),
            price: Number(item?.price || 0),
            stock: Number(item?.stock || 0),
            image: String(item?.image || "").trim(),
            source:
              String(item?.source || "").trim().toLowerCase() === "admin" ? "admin" : "custom",
          };
        })
        .filter((item) => item.id && item.name),
    }))
    .filter((category) => category.id && category.label && category.items.length > 0);

const getSellerCatalogItems = (product) =>
  getSellerCatalogCategories(product).flatMap((category) =>
    category.items.map((item) => ({
      ...item,
      category: category.label,
    }))
  );

const getDefaultExistingSelections = () => ({});

const getDefaultExistingCustomization = (product) => ({
  selectedOptions: getDefaultExistingSelections(product),
  wishCardText: "",
  referenceImageUrl: "",
  referenceImageUrls: [],
  specialNote: "",
  ideaDescription: "",
  addGiftWrap: true,
});

const inferSavedMode = (savedCustomization) => {
  if (!savedCustomization || typeof savedCustomization !== "object") return "";
  if (savedCustomization.mode === "existing") return "existing";
  if (savedCustomization.mode === "build") return "build";

  const savedItems = Array.isArray(savedCustomization.selectedItems)
    ? savedCustomization.selectedItems
    : [];
  if (savedItems.length > 0) return "build";

  const savedOptions = savedCustomization.selectedOptions || {};
  if (savedOptions.hamperBase || savedOptions.hamperPackage) return "build";
  if (Object.keys(savedOptions).length > 0) return "existing";

  return "";
};

const getReferenceImages = (customization) => {
  if (!customization) return [];
  if (Array.isArray(customization.referenceImageUrls)) {
    return customization.referenceImageUrls.filter(Boolean).slice(0, 3);
  }
  if (customization.referenceImageUrl) {
    return [customization.referenceImageUrl];
  }
  return [];
};

const isImageReference = (value) => {
  const text = String(value || "").trim();
  if (!text) return false;
  return (
    text.startsWith("data:image/") ||
    text.startsWith("http://") ||
    text.startsWith("https://")
  );
};

const readFilesAsDataUrls = async (files = []) => {
  const selected = Array.from(files || []).slice(0, 3);
  if (selected.length === 0) return [];

  const urls = await Promise.all(
    selected.map(
      (file) =>
        new Promise((resolve) => {
          if (!file || !String(file.type || "").startsWith("image/")) {
            resolve("");
            return;
          }

          const reader = new FileReader();
          reader.onload = () =>
            resolve(typeof reader.result === "string" ? reader.result : "");
          reader.onerror = () => resolve("");
          reader.readAsDataURL(file);
        })
    )
  );

  return urls.filter(Boolean).slice(0, 3);
};

const truncate = (text, size = 44) =>
  text.length > size ? `${text.slice(0, size - 3)}...` : text;
const sanitizeExistingSelections = (selectedOptions) =>
  Object.entries(
    selectedOptions && typeof selectedOptions === "object" ? selectedOptions : {}
  ).reduce((acc, [key, value]) => {
    const normalizedKey = String(key || "").trim().toLowerCase();
    if (HIDDEN_EXISTING_OPTION_KEYS.has(normalizedKey)) return acc;
    acc[key] = value;
    return acc;
  }, {});

const readStoredUserRole = () => {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return String(parsed?.role || "").trim().toLowerCase();
  } catch {
    return "";
  }
};

export default function Customization() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [userRole, setUserRole] = useState(() => readStoredUserRole());
  const [customizationMode, setCustomizationMode] = useState("");

  const [existingCustomization, setExistingCustomization] = useState(
    getDefaultExistingCustomization()
  );

  const [selectedSellerBaseId, setSelectedSellerBaseId] = useState("");
  const [selectedSellerBaseMain, setSelectedSellerBaseMain] = useState("");
  const [showBaseVariants, setShowBaseVariants] = useState(false);
  const [selectedSellerAddonMain, setSelectedSellerAddonMain] = useState("");
  const [itemQuantities, setItemQuantities] = useState({});
  const [buildWishCardText, setBuildWishCardText] = useState("");
  const [buildSpecialNote, setBuildSpecialNote] = useState("");
  const [buildIdeaDescription, setBuildIdeaDescription] = useState("");
  const [buildReferenceImageNames, setBuildReferenceImageNames] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/products/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        setProduct(data);
        setExistingCustomization(getDefaultExistingCustomization(data));

        const savedCustomization = getCart().find((item) => item.id === data._id)
          ?.customization;
        if (!savedCustomization) return;

        const savedMode = inferSavedMode(savedCustomization);
        if (savedMode) setCustomizationMode(savedMode);

        if (savedMode === "build") {
          const sellerItems = getSellerCatalogItems(data);
          const hasSellerCatalog = sellerItems.length > 0;
          const sellerBaseIds = new Set(
            sellerItems
              .filter((item) => item.type === "base")
              .map((item) => item.id)
          );
          setBuildWishCardText(savedCustomization.wishCardText || "");
          setBuildSpecialNote(savedCustomization.specialNote || "");
          setBuildIdeaDescription(savedCustomization.ideaDescription || "");
          setBuildReferenceImageNames(getReferenceImages(savedCustomization));

          const savedOptions = savedCustomization.selectedOptions || {};
          if (hasSellerCatalog) {
            const savedBase = String(savedOptions.hamperBase || "").trim();
            if (savedBase) setSelectedSellerBaseId(savedBase);
          }

          const savedItems = Array.isArray(savedCustomization.selectedItems)
            ? savedCustomization.selectedItems
            : [];
          const restoredQuantities = savedItems.reduce((acc, item) => {
            if (!item?.id) return acc;
            const qty = Number(item.quantity || 0);
            if (hasSellerCatalog && sellerBaseIds.has(item.id) && qty > 0) {
              setSelectedSellerBaseId(item.id);
              return acc;
            }
            if (qty > 0) acc[item.id] = qty;
            return acc;
          }, {});
          setItemQuantities(restoredQuantities);
        } else if (savedMode === "existing") {
          const savedReferences = getReferenceImages(savedCustomization);
          const savedSelections = sanitizeExistingSelections(
            savedCustomization.selectedOptions
          );
          setExistingCustomization((current) => ({
            ...current,
            selectedOptions: {
              ...current.selectedOptions,
              ...savedSelections,
            },
            wishCardText: savedCustomization.wishCardText || "",
            specialNote: savedCustomization.specialNote || "",
            ideaDescription: savedCustomization.ideaDescription || "",
            referenceImageUrl: savedReferences[0] || "",
            referenceImageUrls: savedReferences,
            addGiftWrap:
              typeof savedCustomization.addGiftWrap === "boolean"
                ? savedCustomization.addGiftWrap
                : current.addGiftWrap,
          }));
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, navigate]);

  useEffect(() => {
    const syncUserRole = () => setUserRole(readStoredUserRole());
    window.addEventListener("user:updated", syncUserRole);
    return () => window.removeEventListener("user:updated", syncUserRole);
  }, []);

  const sellerContentCategories = useMemo(
    () => getSellerCatalogCategories(product),
    [product]
  );
  const sellerCatalogItems = useMemo(
    () => getSellerCatalogItems(product),
    [product]
  );
  const sellerBaseItems = useMemo(
    () => sellerCatalogItems.filter((item) => item.type === "base"),
    [sellerCatalogItems]
  );
  const sellerAddonItems = useMemo(
    () => sellerCatalogItems.filter((item) => item.type !== "base"),
    [sellerCatalogItems]
  );
  const sellerBaseGroups = useMemo(() => {
    const groups = new Map();
    sellerBaseItems.forEach((item) => {
      const mainItem = normalizeMainItem(item.mainItem, item.name);
      if (!mainItem) return;
      const key = mainItem.toLowerCase();
      const description = describeBaseVariant(item);
      const existing = groups.get(key);
      if (existing) {
        existing.variants.push(item);
        if (!existing.thumbnail && item.image) existing.thumbnail = item.image;
        if (!existing.description && description) existing.description = description;
        return;
      }
      groups.set(key, {
        key,
        mainItem,
        thumbnail: item.image || "",
        description,
        variants: [item],
      });
    });
    return Array.from(groups.values()).map((group) => ({
      ...group,
      description:
        group.description ||
        `${group.variants.length} type${group.variants.length > 1 ? "s" : ""} available`,
    }));
  }, [sellerBaseItems]);
  const sellerBaseVariants = useMemo(() => {
    const selectedGroup = sellerBaseGroups.find(
      (group) => group.mainItem === selectedSellerBaseMain
    );
    return selectedGroup?.variants || [];
  }, [selectedSellerBaseMain, sellerBaseGroups]);
  const sellerAddonGroups = useMemo(() => {
    const groups = new Map();
    sellerAddonItems.forEach((item) => {
      const mainItem = normalizeMainItem(item.mainItem, item.name);
      if (!mainItem) return;
      const key = mainItem.toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.variants.push(item);
        return;
      }
      groups.set(key, {
        key,
        mainItem,
        variants: [item],
      });
    });
    return Array.from(groups.values());
  }, [sellerAddonItems]);
  const sellerAddonVariants = useMemo(() => {
    const selectedGroup = sellerAddonGroups.find(
      (group) => group.mainItem === selectedSellerAddonMain
    );
    return selectedGroup?.variants || [];
  }, [selectedSellerAddonMain, sellerAddonGroups]);
  const hasSellerBuildOptions = sellerCatalogItems.length > 0;

  useEffect(() => {
    if (!hasSellerBuildOptions) return;
    if (sellerBaseItems.length === 0) {
      setSelectedSellerBaseId("");
      return;
    }
    if (
      sellerBaseItems.some(
        (item) =>
          item.id === selectedSellerBaseId && Number(item.stock || 0) > 0
      )
    ) {
      return;
    }
    const preferred = sellerBaseItems.find((item) => Number(item.stock || 0) > 0);
    setSelectedSellerBaseId(preferred?.id || "");
  }, [hasSellerBuildOptions, sellerBaseItems, selectedSellerBaseId]);

  useEffect(() => {
    if (!hasSellerBuildOptions) return;
    if (sellerBaseGroups.length === 0) {
      setSelectedSellerBaseMain("");
      return;
    }

    const selectedBase = sellerBaseItems.find((item) => item.id === selectedSellerBaseId);
    const selectedMain = normalizeMainItem(selectedBase?.mainItem, selectedBase?.name);
    if (selectedMain) {
      if (selectedMain !== selectedSellerBaseMain) {
        setSelectedSellerBaseMain(selectedMain);
      }
      return;
    }

    if (sellerBaseGroups.some((group) => group.mainItem === selectedSellerBaseMain)) {
      return;
    }

    const preferredGroup =
      sellerBaseGroups.find((group) =>
        group.variants.some((item) => Number(item.stock || 0) > 0)
      ) || sellerBaseGroups[0];
    setSelectedSellerBaseMain(preferredGroup?.mainItem || "");
  }, [
    hasSellerBuildOptions,
    sellerBaseGroups,
    sellerBaseItems,
    selectedSellerBaseId,
    selectedSellerBaseMain,
  ]);
  useEffect(() => {
    if (!showBaseVariants) return;
    if (!sellerBaseGroups.some((group) => group.mainItem === selectedSellerBaseMain)) {
      setShowBaseVariants(false);
    }
  }, [selectedSellerBaseMain, sellerBaseGroups, showBaseVariants]);
  useEffect(() => {
    if (!hasSellerBuildOptions) return;
    if (sellerAddonGroups.length === 0) {
      setSelectedSellerAddonMain("");
      return;
    }
    if (sellerAddonGroups.some((group) => group.mainItem === selectedSellerAddonMain)) {
      return;
    }

    const selectedAddon = sellerAddonItems.find(
      (item) => Number(itemQuantities[item.id] || 0) > 0
    );
    const selectedMain = normalizeMainItem(selectedAddon?.mainItem, selectedAddon?.name);
    if (selectedMain) {
      setSelectedSellerAddonMain(selectedMain);
      return;
    }

    setSelectedSellerAddonMain(sellerAddonGroups[0]?.mainItem || "");
  }, [
    hasSellerBuildOptions,
    itemQuantities,
    selectedSellerAddonMain,
    sellerAddonGroups,
    sellerAddonItems,
  ]);

  const selectedSellerBase =
    sellerBaseItems.find(
      (item) =>
        item.id === selectedSellerBaseId && Number(item.stock || 0) > 0
    ) || null;

  const selectedSellerAddonItems = useMemo(
    () =>
      sellerAddonItems
        .filter((item) => Number(itemQuantities[item.id] || 0) > 0)
        .map((item) => ({
          ...item,
          type: "item",
          price: Number(item.price || 0),
          quantity: Number(itemQuantities[item.id] || 0),
        })),
    [sellerAddonItems, itemQuantities]
  );

  const selectedItems = useMemo(() => {
    const baseLine = selectedSellerBase
      ? [
          {
            ...selectedSellerBase,
            type: "base",
            quantity: 1,
          },
        ]
      : [];
    return [...baseLine, ...selectedSellerAddonItems];
  }, [selectedSellerBase, selectedSellerAddonItems]);

  const optionLabelLookup = useMemo(() => {
    const lookup = { ...OPTION_LABELS };
    sellerContentCategories.forEach((category) => {
      lookup[category.id] = category.label;
    });
    return lookup;
  }, [sellerContentCategories]);

  const optionValueLookup = useMemo(() => {
    const lookup = {};

    Object.keys(OPTION_LABELS).forEach((key) => {
      const options = Array.isArray(product?.customizationOptions?.[key])
        ? product.customizationOptions[key]
        : [];
      lookup[key] = options.reduce((acc, option) => {
        const text = String(option || "").trim();
        if (text) acc[text] = text;
        return acc;
      }, {});
    });

    sellerContentCategories.forEach((category) => {
      lookup[category.id] = category.items.reduce((acc, item) => {
        acc[item.id] = item.name;
        acc[item.name] = item.name;
        return acc;
      }, {});
    });

    return lookup;
  }, [product, sellerContentCategories]);

  const existingSummaryItems = useMemo(() => {
    const selectedOptions = sanitizeExistingSelections(
      existingCustomization?.selectedOptions
    );
    const referenceImages = getReferenceImages(existingCustomization);
    const entries = Object.entries(selectedOptions)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => ({
        label: optionLabelLookup[key] || key,
        value:
          optionValueLookup[key]?.[String(value)] ||
          optionValueLookup[key]?.[value] ||
          value,
      }));

    if (existingCustomization?.addGiftWrap) {
      entries.push({ label: "Gift wrap", value: "Premium wrap" });
    }
    if (existingCustomization?.ideaDescription?.trim()) {
      entries.push({
        label: "Idea",
        value: truncate(existingCustomization.ideaDescription.trim()),
      });
    }
    if (referenceImages.length > 0) {
      entries.push({
        label: "References",
        value: `${referenceImages.length} image(s)`,
      });
    }

    return entries;
  }, [existingCustomization, optionLabelLookup, optionValueLookup]);

  const buildSummaryExtras = useMemo(() => {
    const entries = [];
    if (buildIdeaDescription.trim()) {
      entries.push({
        id: "idea",
        label: "Idea",
        value: truncate(buildIdeaDescription.trim()),
      });
    }
    if ((buildReferenceImageNames || []).length > 0) {
      entries.push({
        id: "refs",
        label: "References",
        value: `${buildReferenceImageNames.length} image(s)`,
      });
    }
    return entries;
  }, [buildIdeaDescription, buildReferenceImageNames]);
  const buildImageReferences = useMemo(
    () => buildReferenceImageNames.filter(isImageReference),
    [buildReferenceImageNames]
  );
  const buildTextReferences = useMemo(
    () => buildReferenceImageNames.filter((reference) => !isImageReference(reference)),
    [buildReferenceImageNames]
  );

  const selectedQuantity = selectedItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  );
  const itemSubtotal = selectedItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  const sellerMinimumCharge = Number(product?.makingCharge || 0);
  const buildModeCharge = Math.max(sellerMinimumCharge, itemSubtotal);
  const effectiveCustomizationCharge =
    customizationMode === "build"
      ? buildModeCharge
      : customizationMode === "existing"
        ? sellerMinimumCharge
        : 0;
  const totalPrice = Number(product?.price || 0) + effectiveCustomizationCharge;

  const isSellerAccount = userRole === "seller";
  const isDisabled = Boolean(product && !product.isCustomizable);
  const isBuildUnavailable = customizationMode === "build" && !hasSellerBuildOptions;
  const isModeChosen = Boolean(customizationMode);

  const updateQuantity = (itemId, change) => {
    setItemQuantities((current) => {
      const nextValue = Math.max(0, Number(current[itemId] || 0) + change);
      if (nextValue === 0) {
        const { [itemId]: _, ...rest } = current;
        return rest;
      }
      return { ...current, [itemId]: nextValue };
    });
    setNotice("");
  };
  const removeSelectedBuildItem = (item) => {
    if (!item?.id || item.type === "base") return;
    setItemQuantities((current) => {
      if (!(item.id in current)) return current;
      const { [item.id]: _removed, ...rest } = current;
      return rest;
    });
    setNotice("");
  };

  const saveCustomization = () => {
    if (isSellerAccount) {
      setNotice("Seller account cannot place orders. Use a customer account.");
      return false;
    }
    if (!product || !product.isCustomizable) return false;
    if (!customizationMode) {
      setNotice("Please choose a customization option first.");
      return false;
    }
    if (customizationMode === "build" && !hasSellerBuildOptions) {
      setNotice("Seller has not listed custom hamper items yet.");
      return false;
    }
    if (
      customizationMode === "build" &&
      hasSellerBuildOptions &&
      sellerBaseItems.length > 0 &&
      !selectedSellerBase
    ) {
      setNotice("Please select one hamper base to continue.");
      return false;
    }

    const cart = getCart();
    const exists = cart.some((item) => item.id === product._id);
    if (!exists) {
      addToCart({
        id: product._id,
        name: product.name,
        price: product.price,
        isCustomizable: product.isCustomizable,
        category: product.category,
        image: getProductImage(product),
        seller: {
          id: String(product?.seller?._id || product?.seller?.id || "").trim(),
          name: String(product?.seller?.name || "").trim(),
          storeName: String(product?.seller?.storeName || "").trim(),
          profileImage: String(product?.seller?.profileImage || "").trim(),
        },
      });
    }

    const existingReferenceImages = getReferenceImages(existingCustomization);
    const buildReferenceImages = (buildReferenceImageNames || [])
      .filter(Boolean)
      .slice(0, 3);

    const payload =
      customizationMode === "existing"
        ? {
            mode: "existing",
            selectedOptions: sanitizeExistingSelections(
              existingCustomization.selectedOptions
            ),
            selectedItems: [],
            wishCardText: existingCustomization.wishCardText?.trim() || "",
            specialNote: existingCustomization.specialNote?.trim() || "",
            ideaDescription: existingCustomization.ideaDescription?.trim() || "",
            referenceImageUrls: existingReferenceImages,
            referenceImageUrl: existingReferenceImages[0] || "",
            addGiftWrap: Boolean(existingCustomization.addGiftWrap),
            makingCharge: sellerMinimumCharge,
          }
        : {
            mode: "build",
            selectedOptions: selectedSellerBase ? { hamperBase: selectedSellerBase.id } : {},
            selectedItems,
            wishCardText: buildWishCardText.trim(),
            specialNote: buildSpecialNote.trim(),
            ideaDescription: buildIdeaDescription.trim(),
            referenceImageUrls: buildReferenceImages,
            referenceImageUrl: buildReferenceImages[0] || "",
            makingCharge: buildModeCharge,
          };

    setCustomization(product._id, payload);
    setNotice("Customization saved to cart.");
    return true;
  };

  if (loading) {
    return (
      <div className="page custom-builder-page">
        <Header />
        <p>Loading customization...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="page custom-builder-page">
        <Header />
        <p>Unable to load product customization.</p>
      </div>
    );
  }

  return (
    <div className="page custom-builder-page">
      <Header />
      <div className="section-head">
        <div>
          <h2>Customize hamper</h2>
          <p>
            Select a customization path to continue: refine preset options or
            build a hamper from scratch.
          </p>
        </div>
        <Link className="link" to={`/products/${id}`}>
          Back to product
        </Link>
      </div>

      {isDisabled && (
        <p className="field-hint">
          This product is marked non-customizable by the seller.
        </p>
      )}
      {isSellerAccount && (
        <p className="field-hint">
          Seller account cannot place orders. Login with a customer account to continue.
        </p>
      )}

      <div className="hamper-builder-layout">
        <div className="hamper-builder-main">
          <section className="hamper-builder-block">
            <h3 className="hamper-block-title">Choose customization type</h3>
            <div className="hamper-mode-grid">
              <button
                type="button"
                className={`hamper-mode-card ${
                  customizationMode === "existing" ? "active" : ""
                }`}
                onClick={() => {
                  setCustomizationMode("existing");
                  setNotice("");
                }}
                disabled={isDisabled}
              >
                <strong>Modify existing hamper</strong>
                <small>
                  Adjust preset options such as gift box, chocolates, frame,
                  perfume, and card.
                </small>
              </button>
              <button
                type="button"
                className={`hamper-mode-card ${
                  customizationMode === "build" ? "active" : ""
                }`}
                onClick={() => {
                  setCustomizationMode("build");
                  setNotice(
                    hasSellerBuildOptions
                      ? ""
                      : "Seller has not listed custom hamper items yet."
                  );
                }}
                disabled={isDisabled}
              >
                <strong>Build your own hamper</strong>
                <small>
                  {hasSellerBuildOptions
                    ? "Choose items listed by this seller and set quantity."
                    : "Available only after seller lists custom hamper items."}
                </small>
              </button>
            </div>
            {!isModeChosen && (
              <p className="hamper-mode-note">
                Select one option to continue.
              </p>
            )}
          </section>

          {customizationMode === "existing" && (
            <section className="hamper-builder-block">
              <h3 className="hamper-block-title">Existing hamper changes</h3>
              <div className="hamper-existing-form">
                <CustomizationPanel
                  product={product}
                  value={existingCustomization}
                  onChange={(nextValue) => {
                    setExistingCustomization(nextValue);
                    setNotice("");
                  }}
                />
              </div>
            </section>
          )}

          {customizationMode === "build" && (
            <>
              {hasSellerBuildOptions ? (
                <>
                  <section className="hamper-builder-block">
                    <h3 className="hamper-block-title">Hamper base</h3>
                    {sellerBaseItems.length === 0 && (
                      <p className="field-hint">
                        Seller has not listed any hamper base yet.
                      </p>
                    )}
                    {sellerBaseGroups.length > 0 && (
                      <div className="hamper-base-picker-shell">
                        {!showBaseVariants ? (
                          <>
                            <p className="field-hint">Choose hamper base</p>
                            <div className="hamper-main-item-grid">
                              {sellerBaseGroups.map((group) => (
                                <button
                                  key={group.key}
                                  type="button"
                                  className={`hamper-main-item ${
                                    selectedSellerBaseMain === group.mainItem ? "active" : ""
                                  }`}
                                  onClick={() => {
                                    const preferredVariant =
                                      group.variants.find(
                                        (item) => Number(item.stock || 0) > 0
                                      ) || group.variants[0];
                                    setSelectedSellerBaseMain(group.mainItem);
                                    setSelectedSellerBaseId(preferredVariant?.id || "");
                                    setShowBaseVariants(true);
                                    setNotice("");
                                  }}
                                  disabled={isDisabled}
                                >
                                  <span className="hamper-main-item-media">
                                    <img
                                      src={group.thumbnail || getProductImage(product)}
                                      alt={group.mainItem}
                                      loading="lazy"
                                    />
                                  </span>
                                  <span className="hamper-main-item-content">
                                    <strong>{group.mainItem}</strong>
                                    <small>{group.description}</small>
                                  </span>
                                </button>
                              ))}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="hamper-base-picker-head">
                              <p className="field-hint">Choose hamper base type</p>
                              <button
                                type="button"
                                className="btn ghost hamper-base-back"
                                onClick={() => setShowBaseVariants(false)}
                                disabled={isDisabled}
                              >
                                Change base
                              </button>
                            </div>
                            <p className="hamper-items-title">{selectedSellerBaseMain}</p>
                            <div className="hamper-choice-grid">
                              {sellerBaseVariants.map((option) => (
                                <button
                                  key={option.id}
                                  type="button"
                                  className={`hamper-choice-card ${
                                    selectedSellerBaseId === option.id ? "active" : ""
                                  }`}
                                  onClick={() => {
                                    if (Number(option.stock || 0) <= 0) return;
                                    setSelectedSellerBaseId(option.id);
                                    setNotice("");
                                  }}
                                  disabled={isDisabled || Number(option.stock || 0) <= 0}
                                >
                                  <span className="hamper-choice-media">
                                    <img
                                      src={option.image || getProductImage(product)}
                                      alt={option.name}
                                    />
                                  </span>
                                  <span className="hamper-choice-body">
                                    <strong>{option.subItem || option.name}</strong>
                                    <small>{option.mainItem}</small>
                                    <small>
                                      {option.size ? `${option.size} | ` : ""}₹
                                      {formatPrice(option.price)}
                                    </small>
                                    <small>
                                      {Number(option.stock || 0) > 0
                                        ? `${Number(option.stock || 0)} available`
                                        : "Out of stock"}
                                    </small>
                                  </span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </section>

                  <section className="hamper-builder-block">
                    <h3 className="hamper-block-title">Hamper contents</h3>
                    {sellerAddonItems.length === 0 ? (
                      <p className="field-hint">
                        Seller has not listed hamper content items yet.
                      </p>
                    ) : (
                      <>
                        <p className="field-hint">Step 1: Choose main item</p>
                        <div className="hamper-category-stack">
                          {sellerAddonGroups.map((group) => (
                            <button
                              key={group.key}
                              type="button"
                              className={`hamper-category-row ${
                                selectedSellerAddonMain === group.mainItem ? "active" : ""
                              }`}
                              onClick={() => {
                                setSelectedSellerAddonMain(group.mainItem);
                                setNotice("");
                              }}
                              disabled={isDisabled}
                            >
                              <span>{group.mainItem.toUpperCase()}</span>
                              <strong>{group.variants.length}</strong>
                            </button>
                          ))}
                        </div>

                        <p className="field-hint">Step 2: Choose sub item and quantity</p>
                        <div className="hamper-items-shell">
                          <p className="hamper-items-title">
                            {selectedSellerAddonMain || "Hamper contents"}
                          </p>
                          {sellerAddonVariants.length > 0 ? (
                            <div className="hamper-items-grid">
                              {sellerAddonVariants.map((item) => {
                                const quantity = Number(itemQuantities[item.id] || 0);
                                return (
                                  <article key={item.id} className="hamper-item-card">
                                    <img
                                      className="hamper-item-image"
                                      src={item.image || getProductImage(product)}
                                      alt={item.name}
                                      loading="lazy"
                                    />
                                    <h4>{item.subItem || item.name}</h4>
                                    <p className="field-hint">{item.mainItem || item.name}</p>
                                    <p className="hamper-item-price">
                                      ₹{formatPrice(item.price)}
                                      {item.size ? ` | ${item.size}` : ""}
                                    </p>
                                    <p className="field-hint">
                                      {Number(item.stock || 0) > 0
                                        ? `${Number(item.stock || 0)} available`
                                        : "Out of stock"}
                                    </p>
                                    <div className="hamper-stepper">
                                      <button
                                        type="button"
                                        className="hamper-step-btn minus"
                                        onClick={() => updateQuantity(item.id, -1)}
                                        disabled={quantity === 0 || isDisabled}
                                        aria-label={`Reduce ${item.name}`}
                                      >
                                        -
                                      </button>
                                      <span className="hamper-step-value">{quantity}</span>
                                      <button
                                        type="button"
                                        className="hamper-step-btn plus"
                                        onClick={() => updateQuantity(item.id, 1)}
                                        disabled={
                                          isDisabled || Number(item.stock || 0) <= quantity
                                        }
                                        aria-label={`Add ${item.name}`}
                                      >
                                        +
                                      </button>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="field-hint">No sub items found under this main item.</p>
                          )}
                        </div>
                      </>
                    )}
                  </section>
                </>
              ) : (
                <section className="hamper-builder-block">
                  <p className="field-hint">
                    Seller has not listed custom hamper items for this product yet.
                  </p>
                </section>
              )}
            </>
          )}

          {!customizationMode && (
            <section className="hamper-builder-block">
              <p className="hamper-placeholder-copy">
                Choose one customization type to unlock the relevant section.
              </p>
            </section>
          )}
        </div>

        <aside className="hamper-summary-panel">
          <div className="hamper-summary-head">
            <h3>Your hamper</h3>
            <span>
              {customizationMode === "build"
                ? `${selectedQuantity} items`
                : `${existingSummaryItems.length} selected`}
            </span>
          </div>

          <div className="hamper-summary-meta">
            <img src={getProductImage(product)} alt={product.name} />
            <div>
              <p>{product.name}</p>
              <small>
                Mode:{" "}
                <strong>
                  {customizationMode === "existing"
                    ? "Modify existing hamper"
                    : customizationMode === "build"
                      ? "Build your own hamper"
                      : "Not selected"}
                </strong>
              </small>
              {customizationMode === "build" && (
                <small>
                  Base:{" "}
                  <strong>
                    {hasSellerBuildOptions
                      ? selectedSellerBase
                        ? `${selectedSellerBase.mainItem || selectedSellerBase.name}${
                            selectedSellerBase.subItem
                              ? ` - ${selectedSellerBase.subItem}`
                              : ""
                          }${
                            selectedSellerBase.size
                              ? ` (${selectedSellerBase.size})`
                              : ""
                          }`
                        : "Not selected"
                      : "Seller items not available"}
                  </strong>
                </small>
              )}
            </div>
          </div>

          <div className="hamper-summary-list-head">
            <span>{customizationMode === "existing" ? "Option" : "Item"}</span>
            <span>{customizationMode === "existing" ? "Selection" : "Qty"}</span>
          </div>
          <ul className="hamper-summary-list">
            {!customizationMode && (
              <li>
                <span>Choose a customization type first</span>
                <strong>-</strong>
              </li>
            )}

            {customizationMode === "existing" &&
              (existingSummaryItems.length === 0 ? (
                <li>
                  <span>No selections yet</span>
                  <strong>0</strong>
                </li>
              ) : (
                existingSummaryItems.map((item) => (
                  <li key={`${item.label}-${item.value}`}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </li>
                ))
              ))}

            {customizationMode === "build" &&
              (selectedItems.length === 0 ? (
                <li>
                  <span>No contents selected</span>
                  <strong>0</strong>
                </li>
              ) : (
                selectedItems.map((item) => (
                  <li key={item.id}>
                    <span>
                      {item.mainItem || item.name}
                      {item.subItem ? ` - ${item.subItem}` : ""}
                      {item.size ? ` (${item.size})` : ""}
                    </span>
                    <div className="hamper-summary-item-right">
                      <strong>x{item.quantity}</strong>
                      {item.type !== "base" && (
                        <button
                          type="button"
                          className="hamper-summary-remove"
                          onClick={() => removeSelectedBuildItem(item)}
                          aria-label={`Remove ${item.name}`}
                          disabled={isDisabled}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </li>
                ))
              ))}
            {customizationMode === "build" &&
              buildSummaryExtras.map((item) => (
                <li key={item.id}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </li>
              ))}
          </ul>

          <div className="hamper-total-card">
            <div className="hamper-total-row">
              <span>Base hamper price</span>
              <strong>₹{formatPrice(product.price)}</strong>
            </div>

            {customizationMode === "build" && (
              <>
                <div className="hamper-total-row">
                  <span>Selected items total</span>
                  <strong>₹{formatPrice(itemSubtotal)}</strong>
                </div>
                <div className="hamper-total-row">
                  <span>Seller minimum charge</span>
                  <strong>₹{formatPrice(sellerMinimumCharge)}</strong>
                </div>
              </>
            )}

            {customizationMode === "existing" && (
              <div className="hamper-total-row">
                <span>Customization charge</span>
                <strong>₹{formatPrice(sellerMinimumCharge)}</strong>
              </div>
            )}

            <div className="hamper-total-row total">
              <span>Total</span>
              <strong>₹{formatPrice(totalPrice)}</strong>
            </div>
          </div>

          {customizationMode === "build" && hasSellerBuildOptions && (
            <div className="hamper-note-block">
              <label htmlFor="hamperMessage">Personalized message</label>
              <textarea
                id="hamperMessage"
                value={buildWishCardText}
                onChange={(event) => setBuildWishCardText(event.target.value)}
                placeholder="Type your message here"
                disabled={isDisabled}
              />
              <label htmlFor="hamperDescription">
                Description (optional)
              </label>
              <textarea
                id="hamperDescription"
                value={buildIdeaDescription}
                onChange={(event) => setBuildIdeaDescription(event.target.value)}
                placeholder="Describe your idea, style, color, or arrangement..."
                disabled={isDisabled}
              />
              <label htmlFor="hamperReference">Reference images (max 3)</label>
              <input
                id="hamperReference"
                type="file"
                accept="image/*"
                multiple
                onChange={async (event) => {
                  const references = await readFilesAsDataUrls(
                    event.target.files || []
                  );
                  setBuildReferenceImageNames(references);
                }}
                disabled={isDisabled}
              />
              {buildImageReferences.length > 0 && (
                <div className="reference-preview-grid">
                  {buildImageReferences.map((source, index) => (
                    <img
                      key={`${source.slice(0, 32)}-${index}`}
                      src={source}
                      alt={`Reference ${index + 1}`}
                      className="reference-preview-thumb"
                    />
                  ))}
                </div>
              )}
              {buildTextReferences.length > 0 && (
                <p className="hamper-upload-hint">{buildTextReferences.join(" | ")}</p>
              )}
              <label htmlFor="hamperNote">Packaging note</label>
              <input
                id="hamperNote"
                type="text"
                value={buildSpecialNote}
                onChange={(event) => setBuildSpecialNote(event.target.value)}
                placeholder="Any special handling instructions?"
                disabled={isDisabled}
              />
            </div>
          )}

          {notice && <p className="hamper-notice">{notice}</p>}

          <div className="hamper-summary-actions">
            <button
              className="btn ghost"
              type="button"
              onClick={saveCustomization}
              disabled={isSellerAccount || isDisabled || !isModeChosen || isBuildUnavailable}
            >
              Save customization
            </button>
            <button
              className="btn primary"
              type="button"
              onClick={() => {
                const saved = saveCustomization();
                if (saved) navigate("/checkout");
              }}
              disabled={isSellerAccount || isDisabled || !isModeChosen || isBuildUnavailable}
            >
              Continue to checkout
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
